import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildPlan, validateConfig, planHash, doctor, PLAN_VERSION, acceptanceChecks } from './plan.mjs';
import { loadState, saveState } from './state.mjs';
const config = JSON.parse(await readFile(new URL('./example.json', import.meta.url), 'utf8'));
const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const example = fileURLToPath(new URL('./example.json', import.meta.url));

test('deterministic plan has stable resources, explicit action-time consent and narrow runtime IAM', () => {
  const a = buildPlan(config), b = buildPlan({ ...config });
  assert.deepEqual(a, b); assert.equal(planHash(a), planHash(b));
  assert.ok(a.steps.every(s => s.status === 'not-executed' && s.requiresActionTimeConsent));
  assert.equal(new Set(a.steps.map(s => s.id)).size, a.steps.length);
  assert.equal(a.runtimeEnvironment.OPENTAX_ACCESS_MODE, 'owner');
  assert.equal(a.runtimeEnvironment.OPENTAX_OWNER_UID, undefined);
  assert.match(a.permissions.at(-1).scope, /^serviceAccounts\//);
  assert.ok(a.costPreview.length > 0);
});
test('rejects malformed, ambiguous and secret-bearing configuration without echoing values', () => {
  for (const bad of [{ ...config, region: 'global' }, { ...config, projectId: 'a; touch /tmp/x' }, { ...config, ownerUid: ' ' }, { ...config, privateKey: 'SECRET' }, { ...config, billingAccount: 'invalid' }]) {
    assert.throws(() => validateConfig(bad), /^Error: CONFIG_/);
  }
});
test('doctor never treats health or an offline plan as successful provisioning', () => {
  const report = doctor(buildPlan(config));
  assert.equal(report.ready, false); assert.equal(report.instanceUrl, null); assert.equal(report.mcpUrl, null);
  assert.deepEqual(report.checks.map(c => c.id), acceptanceChecks);
  assert.ok(report.checks.every(c => c.status === 'not-run'));
  const plan = buildPlan(config); plan.steps[0].status = 'done';
  assert.throws(() => doctor(plan), /PLAN_MISMATCH/);
});
test('checkpoint round trip, resume, changed config detection and safe corrupted-state failure', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'opentax-state-'));
  try {
    let draft = { version: PLAN_VERSION, revision: 0, phase: 'draft', config: { projectId: config.projectId } };
    draft = await saveState(dir, draft); assert.deepEqual(await loadState(dir), draft);
    let planned = { version: PLAN_VERSION, revision: draft.revision, phase: 'planned', config, planHash: planHash(buildPlan(config)) };
    planned = await saveState(dir, planned, { expectedRevision: draft.revision }); assert.deepEqual(await loadState(dir), planned);
    assert.equal((await stat(path.join(dir, 'plan.json'))).mode & 0o777, 0o600);
    await assert.rejects(saveState(dir, { ...planned, config: { ...config, projectId: 'changed-project' } }), /STATE_PLAN_CHANGED/);
    assert.deepEqual(await loadState(dir), planned);
    await writeFile(path.join(dir, 'plan.pending'), 'interrupted');
    await assert.rejects(saveState(dir, planned, { expectedRevision: planned.revision }), /EEXIST/);
    assert.deepEqual(await loadState(dir), planned);
    await writeFile(path.join(dir, 'plan.json'), '{broken');
    await assert.rejects(loadState(dir));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('rejects symlink state instead of reading another location', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'opentax-link-'));
  try { await symlink(example, path.join(dir, 'plan.json')); await assert.rejects(loadState(dir), /STATE_UNSAFE_FILE/); }
  finally { await rm(dir, { recursive: true, force: true }); }
});
test('CLI dry-run is network/credential independent, never writes and refuses apply/unknown flags', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'opentax-cli-'));
  const run = args => spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8', env: { PATH: '', HOME: dir } });
  try {
    const dry = run(['--dry-run', '--config', example]); assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /offline-preview/); assert.deepEqual(await readdir(dir), []);
    assert.equal(run(['--apply']).status, 1); assert.deepEqual(await readdir(dir), []);
    assert.equal(run(['--config', example]).status, 1); assert.deepEqual(await readdir(dir), []);
    await saveState(path.join(dir, '.opentax'), { version: PLAN_VERSION, revision: 0, phase: 'planned', config, planHash: planHash(buildPlan(config)) });
    const before = await readFile(path.join(dir, '.opentax/plan.json'), 'utf8');
    assert.equal(run(['--resume', '--dry-run']).status, 0);
    const check = run(['--doctor']); assert.equal(check.status, 2); assert.equal(JSON.parse(check.stdout).ready, false);
    assert.equal(await readFile(path.join(dir, '.opentax/plan.json'), 'utf8'), before);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('CAS rejects stale competing writers and preserves the approved plan against replacement or regression', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'opentax-cas-'));
  try {
    const initial = { version: PLAN_VERSION, revision: 0, phase: 'draft', config: {} };
    const first = await saveState(dir, initial);
    const stale = structuredClone(first);
    const second = await saveState(dir, { ...first, config: { projectId: config.projectId } }, { expectedRevision: first.revision });
    await assert.rejects(saveState(dir, { ...stale, config: { projectId: 'another-project' } }, { expectedRevision: stale.revision }), /STATE_CONCURRENT_CHANGE/);
    const approved = await saveState(dir, { ...second, phase: 'planned', config, planHash: planHash(buildPlan(config)) }, { expectedRevision: second.revision });
    const other = { ...config, projectId: 'another-project' };
    await assert.rejects(saveState(dir, { ...approved, config: other, planHash: planHash(buildPlan(other)) }, { expectedRevision: approved.revision }), /STATE_APPROVED_PLAN_IMMUTABLE/);
    await assert.rejects(saveState(dir, { ...approved, phase: 'draft' }, { expectedRevision: approved.revision }), /STATE_APPROVED_PLAN_IMMUTABLE/);
    const racers = await Promise.allSettled([saveState(dir, approved, { expectedRevision: approved.revision }), saveState(dir, approved, { expectedRevision: approved.revision })]);
    assert.equal(racers.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((await loadState(dir)).planHash, approved.planHash);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
