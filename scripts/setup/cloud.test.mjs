import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPlan } from './plan.mjs';
import { createExecution } from './executor.mjs';
import { provisioningSteps, mergeBinding } from './cloud.mjs';
import { deploymentSteps } from './deployment.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const config = { projectId: 'opentax-test', googleAccount: 'owner@example.com', billingAccount: 'ABCDEF-123456-ABCDEF', region: 'asia-northeast1', ownerUid: 'pending' };
const plan = buildPlan(config);
const sdk = { projectId: config.projectId, apiKey: 'test-public-key', authDomain: 'opentax-test.firebaseapp.com', appId: 'test-app', messagingSenderId: '123', storageBucket: 'opentax-test-opentax-evidence' };
async function fixture(t, request, run = async () => '') {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'opentax-cloud-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const state = createExecution(plan, 'a'.repeat(40));
  state.resources = { projectNumber: '123', bucket: sdk.storageBucket, sdk, ownerUid: 'owner' };
  const api = { request, gcloud: run };
  const inputs = { firestoreRules: await readFile(path.join(root, 'firestore.rules'), 'utf8'), storageRules: await readFile(path.join(root, 'storage.rules'), 'utf8'), indexes: JSON.parse(await readFile(path.join(root, 'firestore.indexes.json'), 'utf8')).indexes };
  const steps = await provisioningSteps({ plan, api, state, inputs, directory, signIn: { currentToken: () => 'test-owner' }, run, pause: async () => {} });
  return { directory, state, api, steps, step: id => steps.find(s => s.id === id) };
}
const track = async (_url, result) => result;
test('foreign project, wrong billing and mismatched existing bucket are refused', async t => {
  const f = await fixture(t, async (_method, url) => url.includes('?filter=') ? { projects: [{ projectId: config.projectId, projectNumber: '123', labels: { 'opentax-setup': 'someone-else' }, lifecycleState: 'ACTIVE' }] } : url.includes('/billingInfo') ? { billingAccountName: 'billingAccounts/OTHER', billingEnabled: true } : { location: 'us-central1', projectNumber: '123' });
  for (const id of ['project', 'billing', 'bucket']) assert.equal((await f.step(id).inspect(f.state)).conflict, true);
});
test('IAM merge retains unrelated/conditional bindings and etag; signing scope is one SA', async t => {
  const existing = { version: 3, etag: 'test-etag', bindings: [{ role: 'roles/viewer', members: ['user:existing@example.com'] }, { role: 'roles/datastore.user', members: ['user:conditional@example.com'], condition: { expression: 'false', title: 'test' } }] };
  const merged = mergeBinding(existing, 'roles/datastore.user', 'serviceAccount:test');
  assert.deepEqual(merged.bindings.slice(0, 2), existing.bindings); assert.equal(merged.etag, 'test-etag'); assert.equal(existing.bindings.length, 2);
  const calls = [];
  const f = await fixture(t, async (...args) => { calls.push(args); return existing; });
  await f.step('runtime-sign').apply(f.state, track);
  assert.match(new URL(calls[0][1]).pathname, /serviceAccounts\/opentax-runtime@opentax-test\.iam\.gserviceaccount\.com:getIamPolicy$/);
  assert.equal(calls[0][0], 'GET');
  assert.equal(calls[1][2].policy.etag, 'test-etag');
  assert.equal(calls[1][2].policy.bindings.at(-1).role, 'projects/opentax-test/roles/opentaxSignBlob');
  assert.equal(JSON.stringify(calls).includes('TokenCreator'), false);
});
test('Auth CLI is pinned, isolated, and patch preserves existing authorized domains', async t => {
  const calls = [], commands = [];
  const f = await fixture(t, async (...args) => { calls.push(args); return { authorizedDomains: ['opentax-test.firebaseapp.com'] }; }, async (...args) => commands.push(args));
  await f.step('google-auth').apply(f.state, track);
  assert.deepEqual(commands[0][1].slice(0, 3), ['--yes', 'firebase-tools@15.33.0', 'deploy']);
  assert.ok(commands[0][1].includes('--non-interactive'));
  const settings = JSON.parse(await readFile(path.join(f.directory, 'firebase/firebase.json'), 'utf8'));
  assert.equal(settings.auth.providers.googleSignIn.supportEmail, config.googleAccount);
  const patch = calls.find(c => c[0] === 'PATCH');
  assert.deepEqual(patch[2].authorizedDomains, ['opentax-test.firebaseapp.com', '127.0.0.1']);
  assert.equal(patch[2].signIn.anonymous.enabled, false); assert.equal(patch[2].signIn.email.enabled, false);
});
test('rules resume reuses a matching ruleset and never deletes remote rules/data', async t => {
  const source = await readFile(path.join(root, 'firestore.rules'), 'utf8');
  const calls = [];
  const f = await fixture(t, async (method, url, body) => {
    calls.push([method, url, body]);
    if (url.includes('/rulesets?')) return { rulesets: [{ name: 'projects/opentax-test/rulesets/existing' }] };
    if (url.endsWith('/rulesets/existing')) return { name: 'projects/opentax-test/rulesets/existing', source: { files: [{ content: source }] } };
    return null;
  });
  await f.step('firestore-rules').apply(f.state, track);
  assert.equal(calls.filter(c => c[0] === 'POST' && c[1].endsWith('/rulesets')).length, 0);
  assert.equal(calls.at(-1)[2].rulesetName, 'projects/opentax-test/rulesets/existing');
  assert.ok(calls.every(c => c[0] !== 'DELETE'));
});
test('existing building index is awaited without duplicate creation', async t => {
  const index = JSON.parse(await readFile(path.join(root, 'firestore.indexes.json'), 'utf8')).indexes[0];
  let reads = 0; const writes = [];
  const f = await fixture(t, async (method, url, body) => { if (method !== 'GET') writes.push([url, body]); return { indexes: [{ ...index, state: ++reads > 1 ? 'READY' : 'CREATING', fields: [...index.fields, { fieldPath: '__name__', order: 'ASCENDING' }] }] }; });
  await f.step('index-0').apply(f.state, track);
  assert.equal(writes.length, 0); assert.equal(reads, 2);
});
test('deploy uses fixed source and keyless owner config; inspector rejects a foreign service', async t => {
  const commands = []; let remote = null;
  const f = await fixture(t, async () => remote, async args => commands.push(args));
  const [deploy] = deploymentSteps({ ...f, plan, source: async () => '/isolated/committed-source' });
  await deploy.apply(f.state);
  const args = commands[0];
  assert.ok(args.includes('--source=/isolated/committed-source')); assert.ok(args.includes('--allow-unauthenticated'));
  assert.ok(args.includes('--max=1'));
  const env = JSON.parse(await readFile(path.join(f.directory, 'runtime-env.json'), 'utf8'));
  assert.equal(env.OPENTAX_ACCESS_MODE, 'owner'); assert.equal(env.OPENTAX_OWNER_UID, 'owner');
  assert.equal(env.FIREBASE_ADMIN_PRIVATE_KEY, undefined);
  const build = JSON.parse(await readFile(path.join(f.directory, 'build-env.json'), 'utf8'));
  assert.equal(build.NEXT_PUBLIC_FIREBASE_PROJECT_ID, config.projectId); assert.equal(build.GOOGLE_NODE_RUN_SCRIPTS, 'build');
  remote = { labels: { 'opentax-setup': 'unrelated' } };
  assert.equal((await deploy.inspect(f.state)).conflict, true);
  remote = { labels: { 'opentax-setup': f.state.installationId, 'opentax-source': f.state.revision }, template: { serviceAccount: 'opentax-runtime@opentax-test.iam.gserviceaccount.com', containers: [{ env: Object.entries(env).map(([name, value]) => ({ name, value })) }] }, uri: 'https://opentax-test.run.app', terminalCondition: { state: 'CONDITION_SUCCEEDED' } };
  assert.equal((await deploy.inspect(f.state)).ready, true);
  remote.template.containers[0].env.find(e => e.name === 'OPENTAX_OWNER_UID').value = 'other';
  assert.equal((await deploy.inspect(f.state)).ready, false);
});
