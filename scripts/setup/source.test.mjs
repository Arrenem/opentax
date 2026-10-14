import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { command } from './transport.mjs';
import { sourceRevision, stageSource, prepareDeploymentSource } from './source.mjs';
import { provisioningSteps } from './cloud.mjs';
import { createExecution } from './executor.mjs';
import { buildPlan } from './plan.mjs';
test('source upload comes from clean commit and never includes ignored local credentials', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'opentax-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = args => command('git', args, { cwd: root });
  await git(['init', '--quiet']);
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { build: 'next build' } }));
  await writeFile(path.join(root, '.gitignore'), '.env.local\n.opentax\n');
  await git(['add', '.']);
  await git(['-c', 'user.name=Isolated Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
  await writeFile(path.join(root, '.env.local'), 'DO_NOT_UPLOAD=fake-secret');
  const directory = path.join(root, '.opentax'); await mkdir(directory);
  await writeFile(path.join(directory, 'fake-credential'), 'DO_NOT_UPLOAD');
  const revision = await sourceRevision(root), stage = await stageSource(root, directory, revision);
  await assert.rejects(access(path.join(stage, '.env.local')));
  await assert.rejects(access(path.join(stage, '.opentax')));
  assert.equal(JSON.parse(await readFile(path.join(stage, 'package.json'), 'utf8')).scripts.build, 'next build --webpack');
  await writeFile(path.join(root, 'uncommitted'), 'x');
  await assert.rejects(sourceRevision(root), /SOURCE_MUST_BE_CLEAN/);
});
test('tracked private filenames and symlinks are rejected before staging', async () => {
  for (const [files, modes, error] of [['.env.production', '', /PRIVATE_FILE/], ['normal', '120000 blob test\tnormal', /LINKS_UNSUPPORTED/]]) {
    const run = async (_program, args) => args.includes('--name-only') ? files : modes;
    await assert.rejects(stageSource('/unused', '/unused', 'a'.repeat(40), run), error);
  }
});
test('worktree edits during a login pause cannot replace pinned rules, indexes or app source', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'opentax-pinned-inputs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = args => command('git', args, { cwd: root });
  await git(['init', '--quiet']);
  const indexes = [{ collectionGroup: 'approved', queryScope: 'COLLECTION', fields: [{ fieldPath: 'owner', order: 'ASCENDING' }, { fieldPath: 'date', order: 'ASCENDING' }] }];
  const originals = { 'package.json': JSON.stringify({ scripts: { build: 'next build' } }), '.gitignore': '.opentax\n', 'firestore.rules': 'approved firestore deny-all', 'storage.rules': 'approved storage deny-all', 'firestore.indexes.json': JSON.stringify({ indexes }) };
  for (const [name, value] of Object.entries(originals)) await writeFile(path.join(root, name), value);
  await git(['add', '.']); await git(['-c', 'user.name=Isolated Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'approved inputs']);
  const directory = path.join(root, '.opentax'); await mkdir(directory);
  let release, signal;
  const loginPause = new Promise(resolve => { release = resolve; });
  const snapshotReady = new Promise(resolve => { signal = resolve; });
  const plan = buildPlan({ projectId: 'opentax-test', googleAccount: 'owner@example.com', billingAccount: 'ABCDEF-123456-ABCDEF', region: 'asia-northeast1', ownerUid: 'pending' });
  const flow = (async () => {
    const revision = await sourceRevision(root), inputs = await prepareDeploymentSource(root, directory, revision);
    signal(); await loginPause;
    const steps = await provisioningSteps({ plan, inputs, directory, state: createExecution(plan, revision), api: { request: async () => null }, signIn: {} });
    return { inputs, steps };
  })();
  await snapshotReady;
  await writeFile(path.join(root, 'firestore.rules'), 'unapproved allow-all');
  await writeFile(path.join(root, 'storage.rules'), 'unapproved allow-all');
  await writeFile(path.join(root, 'firestore.indexes.json'), JSON.stringify({ indexes: [] }));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { build: 'unapproved-command' } }));
  release(); const { inputs, steps } = await flow;
  assert.equal(steps.find(s => s.id === 'firestore-rules').preview.source, originals['firestore.rules']);
  assert.equal(steps.find(s => s.id === 'storage-rules').preview.source, originals['storage.rules']);
  assert.deepEqual(steps.find(s => s.id === 'index-0').preview.resource, indexes[0]);
  assert.equal(JSON.parse(await readFile(path.join(inputs.directory, 'package.json'), 'utf8')).scripts.build, 'next build --webpack');
});
