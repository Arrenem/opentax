import test from 'node:test';
import assert from 'node:assert/strict';
import { verifySetup } from './verify.mjs';
import { validateGoogleIdentity } from './browser.mjs';

const options = () => ({ url: 'https://opentax-test.run.app', sdk: {}, ownerUid: 'owner', ownerToken: 'test-owner', runId: 'test-run', consent: async () => true, signIn: async () => ({ uid: 'other', token: 'test-other' }), mcpToken: async () => `otk_${'a'.repeat(43)}`, mcpRead: async () => true });
function healthyFetch(url, init) {
  assert.equal(init.redirect, 'error');
  if (url.endsWith('/readiness')) return Response.json({ checks: { database: 'passed', evidence: 'passed', syntheticRestore: 'passed' } });
  assert.ok(!init.method || init.method === 'GET', 'No business write probe is permitted');
  if (url.includes('requiredScope=')) return Response.json({ error: { code: 'SCOPE_DENIED' } }, { status: 403 });
  if (url.endsWith('/agent-access')) return Response.json({ actorType: 'agent', userId: 'owner', scopes: ['read'] });
  return Response.json({}, { status: init.headers.Authorization === 'Bearer test-owner' ? 200 : init.headers.Authorization ? 403 : 401 });
}
test('completion requires each connectivity check and does not claim a full accounting restore', async () => {
  const result = await verifySetup({ ...options(), fetcher: healthyFetch });
  assert.equal(result.ready, true); assert.equal(result.fullAccountingRestore, 'not-tested'); assert.equal(result.journalAcceptance, 'not-tested');
  assert.equal(Object.keys(result.checks).length, 9);
});
test('skipped synthetic/other-owner/MCP consent cannot report ready or create tokens', async () => {
  let calls = 0;
  const result = await verifySetup({ ...options(), consent: async () => false, mcpToken: async () => { throw new Error('NO_TOKEN_CREATION'); }, fetcher: (...args) => { calls++; return healthyFetch(...args); } });
  assert.equal(result.ready, false); assert.equal(calls, 2); assert.equal(result.checks.database, 'not-run');
});
test('wide agent scope or failed evidence cannot pass readiness', async () => {
  for (const failed of ['evidence', 'scope']) {
    const result = await verifySetup({ ...options(), fetcher: (url, init) => failed === 'evidence' && url.endsWith('/readiness') ? Response.json({ checks: { database: 'passed', evidence: 'failed', syntheticRestore: 'passed' } }) : failed === 'scope' && url.includes('requiredScope=') ? Response.json({}, { status: 400 }) : healthyFetch(url, init) });
    assert.equal(result.ready, false);
  }
});
test('read plus journals:write cannot report ready even when settings:write would be denied', async () => {
  for (const scopes of [['read', 'journals:write'], ['read', 'future:write'], [], ['read', 'read']]) {
    let mcpCalls = 0;
    const result = await verifySetup({ ...options(), mcpRead: async () => { mcpCalls++; return true; }, fetcher: (url, init) => url.endsWith('/agent-access') ? Response.json({ actorType: 'agent', userId: 'owner', scopes }) : healthyFetch(url, init) });
    assert.equal(result.ready, false); assert.equal(result.checks.mcpReadOnlyScopes, 'failed'); assert.equal(mcpCalls, 0);
  }
});
test('same-owner negative check and unexpected target origin are rejected', async () => {
  await assert.rejects(verifySetup({ ...options(), signIn: async () => ({ uid: 'owner', token: 'test-owner' }), fetcher: healthyFetch }), /DIFFERENT_TEST_ACCOUNT/);
  await assert.rejects(verifySetup({ ...options(), url: 'https://example.com' }), /VERIFY_ORIGIN_INVALID/);
});
test('Firebase identity lookup binds email, Google provider and verified identity', async () => {
  const user = { localId: 'owner', email: 'owner@example.com', emailVerified: true, providerUserInfo: [{ providerId: 'google.com' }] };
  const lookup = data => async (_url, init) => { assert.equal(JSON.parse(init.body).idToken, 'test-id-token'); return Response.json({ users: [data] }); };
  assert.deepEqual(await validateGoogleIdentity('test-id-token', { apiKey: 'test-public-key' }, 'OWNER@example.com', lookup(user)), { uid: 'owner' });
  for (const changed of [{ email: 'wrong@example.com' }, { emailVerified: false }, { disabled: true }, { providerUserInfo: [{ providerId: 'password' }] }]) await assert.rejects(validateGoogleIdentity('test-id-token', { apiKey: 'test-public-key' }, 'owner@example.com', lookup({ ...user, ...changed })), /OWNER_ACCOUNT_MISMATCH/);
});
