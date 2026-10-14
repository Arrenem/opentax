import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPlan } from './plan.mjs';
import { createExecution, executeSteps, validateExecutionBinding } from './executor.mjs';
import { lockDirectory, writeExecution, readExecution, privateDirectory } from './execution-state.mjs';
import { cloudTransport } from './transport.mjs';

export const config = { projectId: 'opentax-test', googleAccount: 'owner@example.com', billingAccount: 'ABCDEF-123456-ABCDEF', region: 'asia-northeast1', ownerUid: 'pending' };
const plan = buildPlan(config), revision = 'a'.repeat(40);
test('unknown write outcome resumes by observing remote resource; does not repeat creation', async () => {
  const state = createExecution(plan, revision); let created = false, calls = 0, approvals = 0;
  const step = { id: 'create', preview: {}, inspect: async () => ({ ready: created }), apply: async () => { calls++; created = true; throw new Error('CONNECTION_LOST'); } };
  const ctx = { plan, revision, state, steps: [step], consent: async () => { approvals++; return true; }, save: async () => {} };
  await assert.rejects(executeSteps(ctx), /CONNECTION_LOST/);
  assert.equal(state.steps.create.status, 'running');
  await executeSteps(ctx);
  assert.equal(calls, 1); assert.equal(approvals, 1); assert.equal(state.steps.create.status, 'verified');
});
test('interrupted long operation is checkpointed and polled on resume', async () => {
  const state = createExecution(plan, revision); let ready = false, writes = 0;
  const step = { id: 'create', inspect: async () => ({ ready }), apply: async (_s, track) => { writes++; await track('https://firebase.googleapis.com/v1beta1/projects/test', { name: 'operations/abc' }); ready = true; } };
  const ctx = { plan, revision, state, steps: [step], consent: async () => true, save: async () => {}, poll: async () => { throw new Error('POLL_INTERRUPTED'); } };
  await assert.rejects(executeSteps(ctx), /POLL_INTERRUPTED/);
  assert.equal(state.steps.create.operation, 'https://firebase.googleapis.com/v1beta1/operations/abc');
  await executeSteps({ ...ctx, poll: async () => { ready = true; } });
  assert.equal(writes, 1); assert.equal(state.steps.create.operation, undefined);
});
test('declined mutation and remote conflict never call apply or delete', async () => {
  for (const conflict of [false, true]) {
    let mutations = 0, prompts = 0;
    await assert.rejects(executeSteps({ plan, revision, state: createExecution(plan, revision), steps: [{ id: 'billing', inspect: async () => ({ ready: false, conflict }), apply: async () => mutations++ }], consent: async () => { prompts++; return false; }, save: async () => {} }), conflict ? /REMOTE_CONFLICT_BILLING/ : /CONSENT_DECLINED/);
    assert.equal(mutations, 0); assert.equal(prompts, conflict ? 0 : 1);
  }
});
test('verified resource drift stops; new plan/source rejected before any external call', async () => {
  const state = createExecution(plan, revision); state.steps.db = { status: 'verified' };
  let prompts = 0;
  await assert.rejects(executeSteps({ plan, revision, state, steps: [{ id: 'db', inspect: async () => ({ ready: false }) }], consent: async () => prompts++, save: async () => {} }), /REMOTE_DRIFT_DB/);
  assert.equal(prompts, 0);
  assert.throws(() => validateExecutionBinding(plan, state, 'b'.repeat(40)), /PLAN_OR_SOURCE_CHANGED/);
  assert.throws(() => validateExecutionBinding(buildPlan({ ...config, projectId: 'different-project' }), state, revision), /PLAN_OR_SOURCE_CHANGED/);
});
test('failed postcondition cannot produce verified checkpoint', async () => {
  const state = createExecution(plan, revision);
  await assert.rejects(executeSteps({ plan, revision, state, steps: [{ id: 'db', inspect: async () => ({ ready: false }), apply: async () => {} }], consent: async () => true, save: async () => {} }), /POSTCONDITION_FAILED/);
  assert.equal(state.steps.db.status, 'running');
});
test('session lock excludes another interaction and execution checkpoints persist without approval', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'opentax-execution-'));
  try {
    const release = await lockDirectory(dir);
    await assert.rejects(lockDirectory(dir), /SESSION_LOCKED/);
    const state = createExecution(plan, revision); await writeExecution(dir, state);
    assert.deepEqual(await readExecution(dir), state);
    assert.equal((await readFile(path.join(dir, 'execution.json'), 'utf8')).includes('consent'), false);
    await release(); await (await lockDirectory(dir))();
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('transport retries reads only, sanitizes failures and refuses credential redirects', async () => {
  const requests = [], commands = []; let failures = 2;
  const api = cloudTransport({ account: config.googleAccount, projectId: config.projectId, run: async (...args) => { commands.push(args); return 'fake-test-access-token'; }, pause: async () => {}, fetcher: async (...args) => { requests.push(args); return failures-- > 0 ? new Response('private provider error', { status: 503 }) : Response.json({ ok: true }); } });
  assert.deepEqual(await api.request('GET', 'https://firebase.googleapis.com/v1beta1/projects/test'), { ok: true });
  assert.equal(requests.length, 3); assert.equal(requests[0][1].redirect, 'error');
  assert.ok(commands[0][1].includes('--account=owner@example.com'));
  failures = 2;
  await assert.rejects(api.request('POST', 'https://firebase.googleapis.com/v1beta1/projects/test', {}), /^Error: CLOUD_HTTP_503$/);
  assert.equal(requests.length, 4);
  await assert.rejects(api.request('GET', 'https://attacker.example/'), /API_ORIGIN_DENIED/);
  await assert.rejects(api.request('GET', 'https://firebase.googleapis.com:444/'), /API_ORIGIN_DENIED/);
  assert.equal(requests.length, 4);
});
test('isolated credential store rejects a link to another store before tools run', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'opentax-private-store-'));
  try {
    await symlink('/nonexistent-test-store', path.join(dir, 'credentials.db'));
    await assert.rejects(privateDirectory(dir), /STATE_UNSAFE_LINK/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
