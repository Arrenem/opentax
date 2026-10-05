import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { checkPublication, prepareRelease } from './prepare-site-release.mjs';
import { publicPath } from './verify-site-release.mjs';
const require = createRequire(import.meta.url);
const { load } = require('js-yaml');
const root = path.resolve(new URL('../..', import.meta.url).pathname);
const manifest = JSON.parse(await readFile(path.join(root, 'content/articles/manifest.json'), 'utf8'));

test('release publication guard rejects changed counts, identities, approval and held evidence', () => {
  assert.equal(checkPublication(manifest).published.length, 53);
  for (const mutate of [
    m => { m[0].publicationApproval = 'pending'; },
    m => { m[0].evidenceGaps = ['not reviewed']; },
    m => { m[0].id = '59'; },
    m => { m.find(a => a.id === '57').status = 'published'; },
    m => { m.find(a => a.id === '58').evidenceGaps = []; },
    m => { m.find(a => a.id === '58').publicationApproval = 'approved'; },
  ]) {
    const changed = structuredClone(manifest); mutate(changed);
    assert.throws(() => checkPublication(changed));
  }
});

test('manual workflow isolates secrets and fixes its target, commit and official actions', async () => {
  const source = await readFile(path.join(root, '.github/workflows/deploy-pages.yml'), 'utf8');
  const workflow = load(source);
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.equal(workflow.on.workflow_dispatch, null);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(workflow.concurrency, { group: 'opentax-pages-production', 'cancel-in-progress': false });
  const expectedActions = new Set([
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
    'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
    'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
  ]);
  for (const job of Object.values(workflow.jobs)) {
    assert.equal(job.if, "github.repository == 'Arrenem/opentax' && github.ref == 'refs/heads/main' && github.event_name == 'workflow_dispatch'");
    for (const step of job.steps) if (step.uses) assert.ok(expectedActions.has(step.uses));
  }
  const build = workflow.jobs.build;
  assert.doesNotMatch(JSON.stringify(build), /secrets\./);
  assert.equal(build.steps[0].with.ref, '${{ github.sha }}');
  assert.equal(build.steps[0].with['persist-credentials'], false);
  const deploy = workflow.jobs.deploy;
  assert.equal(deploy.needs, 'build');
  assert.ok(!deploy.steps.some(step => step.uses?.startsWith('actions/checkout@')));
  const download = deploy.steps.find(step => step.uses?.startsWith('actions/download-artifact@'));
  assert.equal(download.with['artifact-ids'], '${{ needs.build.outputs.artifact-id }}');
  assert.equal(download.with['digest-mismatch'], 'error');
  for (const key of ['github-token', 'repository', 'run-id']) assert.equal(download.with[key], undefined);
  const secretSteps = deploy.steps.filter(step => JSON.stringify(step).includes('secrets.'));
  assert.equal(secretSteps.length, 1);
  const publish = secretSteps[0];
  assert.equal(publish.env.CLOUDFLARE_ACCOUNT_ID, '3f28ad99b5157218dea0db5a55241e4c');
  assert.equal(publish.env.CLOUDFLARE_API_TOKEN, '${{ secrets.CLOUDFLARE_API_TOKEN }}');
  assert.match(publish.run, /--project-name=opentax --branch=main --commit-hash="\$GITHUB_SHA"/);
  assert.doesNotMatch(publish.run, /npm (?:ci|install)|set -x|echo "?\$CLOUDFLARE_API_TOKEN/);
  assert.ok(deploy.steps.findIndex(step => step.run?.includes('npm ci')) < deploy.steps.indexOf(publish));
  assert.match(deploy.steps.find(step => step.run?.includes('npm ci')).run, /npm ci .*--ignore-scripts/);
  assert.equal(deploy.steps.at(-1).env, undefined);
});

test('Wrangler package and integrity lock match the verified version', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'tools/pages-deploy/package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(path.join(root, 'tools/pages-deploy/package-lock.json'), 'utf8'));
  assert.deepEqual(pkg.dependencies, { wrangler: '4.147.0' });
  assert.equal(lock.packages['node_modules/wrangler'].version, '4.147.0');
  for (const [key, pkg] of Object.entries(lock.packages)) {
    if (!key) continue;
    assert.ok(pkg.resolved.startsWith('https://registry.npmjs.org/'));
    assert.match(pkg.integrity, /^sha512-/);
  }
});

test('release artifact binds all site bytes and rejects a wrong commit, tampering and extra deployable files', async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'opentax-ci-release-'));
  const commit = 'a'.repeat(40);
  const run = sha => spawnSync(process.execPath, ['verify-site-release.mjs', '--local', sha], { cwd: output, encoding: 'utf8' });
  try {
    const release = await prepareRelease(root, output, commit);
    assert.ok(Object.keys(release.files).length > 150);
    assert.equal(run(commit).status, 0);
    assert.notEqual(run('b'.repeat(40)).status, 0);
    const main = path.join(output, 'site/main.js');
    await writeFile(main, 'tampered');
    assert.notEqual(run(commit).status, 0);
    await cp(path.join(root, 'site/dist/main.js'), main);
    await writeFile(path.join(output, 'site/unexpected.html'), 'not in checked build');
    assert.notEqual(run(commit).status, 0);
  } finally { await rm(output, { recursive: true, force: true }); }
});

test('public paths follow the Pages extensionless HTML convention', () => {
  assert.equal(publicPath('site/index.html'), '/');
  assert.equal(publicPath('site/articles/freee-cost-review.html'), '/articles/freee-cost-review');
  assert.equal(publicPath('site/articles/category/pricing/index.html'), '/articles/category/pricing/');
  assert.equal(publicPath('site/articles.css'), '/articles.css');
  assert.throws(() => publicPath('../secret'));
});
