import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ collections: new Map<string, Map<string, Record<string, unknown>>>(), next: 0 }));
vi.mock('@/lib/firebase/admin', () => ({ initializeAdminApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => {
  const table = (name: string) => {
    if (!state.collections.has(name)) state.collections.set(name, new Map());
    return state.collections.get(name)!;
  };
  function ref(name: string, id: string) {
    const rows = table(name);
    return { id,
      set: async (data: Record<string, unknown>) => { rows.set(id, data); },
      // Snapshots are immutable, as in Firestore.
      get: async () => { const data = rows.get(id); return { exists: data !== undefined, data: () => data }; },
      update: async (data: Record<string, unknown>) => { rows.set(id, { ...rows.get(id), ...data }); },
      delete: async () => { rows.delete(id); },
    };
  }
  const collection = (name: string) => ({
    doc: (id?: string) => ref(name, id ?? `${name}-${++state.next}`),
    where: (field: string, _op: string, value: unknown) => ({
      get: async () => ({ docs: Array.from(table(name).entries()).filter(([, d]) => d[field] === value)
        .map(([id, data]) => ({ id, data: () => data, ref: ref(name, id) })) }),
    }),
  });
  type Ref = ReturnType<typeof ref>;
  const firestore = {
    collection,
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({ get: (r: Ref) => r.get(), delete: (r: Ref) => { void r.delete(); } }),
    batch: () => {
      const ops: (() => Promise<void>)[] = [];
      return { set: (r: Ref, data: Record<string, unknown>) => { ops.push(() => r.set(data)); },
        commit: async () => { for (const op of ops) await op(); } };
    },
  };
  return { FieldValue: { serverTimestamp: () => 'now' },
    Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }), fromDate: (d: Date) => ({ toMillis: () => d.getTime() }) },
    getFirestore: () => firestore };
});

import {
  authenticateClient, createAuthorizationCode, exchangeAuthorizationCode, pkceChallenge, redirectUriMatches,
  refreshAccessToken, registerClient, resolveOAuthAccessToken, revokeToken, validateAuthorizationRequest,
} from './oauth';
import { listAgentConnections, revokeAgentConnection } from './agentTokens';
import type { AgentScope } from './scopes';

const ORIGIN = 'https://opentax.test';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const VERIFIER = 'v'.repeat(64);

async function publicClient() {
  const registered = await registerClient({ client_name: 'Claude', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' });
  return authenticateClient(registered.client_id, undefined);
}
function authorizeParams(clientId: string, extra: Record<string, string> = {}) {
  return new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, state: 's1',
    code_challenge: pkceChallenge(VERIFIER), code_challenge_method: 'S256', resource: `${ORIGIN}/api/mcp`,
    scope: 'read journals:write openid', ...extra });
}
async function grant(scopes: AgentScope[] = ['read', 'journals:write']) {
  const client = await publicClient();
  const request = await validateAuthorizationRequest(authorizeParams(client.clientId), ORIGIN);
  const code = await createAuthorizationCode('user-1', request, scopes);
  return { client, code };
}

describe('OAuth authorization server', () => {
  beforeEach(() => { state.collections.clear(); state.next = 0; });

  it('registers clients with safe redirect URIs only, and requires secrets for confidential clients', async () => {
    await expect(registerClient({ redirect_uris: ['http://evil.test/cb'] })).rejects.toMatchObject({ code: 'invalid_redirect_uri' });
    await expect(registerClient({ redirect_uris: ['javascript:alert(1)'] })).rejects.toMatchObject({ code: 'invalid_redirect_uri' });
    const confidential = await registerClient({ redirect_uris: [REDIRECT] });
    expect(confidential.client_secret).toMatch(/^ots_/);
    expect(JSON.stringify(Array.from(state.collections.get('oauthClients')!.values()))).not.toContain(confidential.client_secret);
    await expect(authenticateClient(confidential.client_id, 'wrong')).rejects.toMatchObject({ code: 'invalid_client' });
    await expect(authenticateClient(confidential.client_id, confidential.client_secret)).resolves.toMatchObject({ clientName: 'MCP client' });
    expect(redirectUriMatches(['http://127.0.0.1/callback'], 'http://127.0.0.1:53682/callback')).toBe(true);
    expect(redirectUriMatches([REDIRECT], `${REDIRECT}?x=1`)).toBe(false);
  });

  it('rejects authorization requests without a registered redirect URI or S256 PKCE', async () => {
    const client = await publicClient();
    await expect(validateAuthorizationRequest(authorizeParams(client.clientId, { redirect_uri: 'https://evil.test/cb' }), ORIGIN))
      .rejects.toMatchObject({ code: 'invalid_request', redirectable: false });
    await expect(validateAuthorizationRequest(authorizeParams(client.clientId, { code_challenge_method: 'plain' }), ORIGIN))
      .rejects.toMatchObject({ code: 'invalid_request', redirectable: true });
    await expect(validateAuthorizationRequest(authorizeParams(client.clientId, { resource: 'https://other.test/mcp' }), ORIGIN))
      .rejects.toMatchObject({ code: 'invalid_target' });
    const request = await validateAuthorizationRequest(authorizeParams(client.clientId), ORIGIN);
    expect(request.requestedScopes).toEqual(['read', 'journals:write']);
  });

  it('exchanges a code once with PKCE and maps the grant to a revocable agent connection', async () => {
    const { client, code } = await grant();
    await expect(exchangeAuthorizationCode(client, { code, redirectUri: REDIRECT, codeVerifier: 'x'.repeat(64) }))
      .rejects.toMatchObject({ code: 'invalid_grant' });
    // The failed attempt consumed the code.
    const second = await grant();
    const tokens = await exchangeAuthorizationCode(second.client, { code: second.code, redirectUri: REDIRECT, codeVerifier: VERIFIER });
    expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'read journals:write' });
    await expect(exchangeAuthorizationCode(second.client, { code: second.code, redirectUri: REDIRECT, codeVerifier: VERIFIER }))
      .rejects.toMatchObject({ code: 'invalid_grant' });
    const resolved = await resolveOAuthAccessToken(tokens.access_token);
    expect(resolved).toMatchObject({ scopes: ['read', 'journals:write'], connection: { userId: 'user-1', authType: 'oauth', name: 'Claude' } });
    expect(JSON.stringify(Array.from(state.collections.get('oauthTokens')!.values()))).not.toContain(tokens.access_token);
    const [connection] = await listAgentConnections('user-1');
    await revokeAgentConnection('user-1', connection.id!);
    expect(await resolveOAuthAccessToken(tokens.access_token)).toBeNull();
    await expect(refreshAccessToken(second.client, { refreshToken: tokens.refresh_token })).rejects.toMatchObject({ code: 'invalid_grant' });
  });

  it('rotates refresh tokens and never widens scopes', async () => {
    const { client, code } = await grant(['read']);
    const first = await exchangeAuthorizationCode(client, { code, redirectUri: REDIRECT, codeVerifier: VERIFIER });
    await expect(refreshAccessToken(client, { refreshToken: first.refresh_token, scope: 'read journals:write' }))
      .rejects.toMatchObject({ code: 'invalid_scope' });
    const again = await grant(['read']);
    const tokens = await exchangeAuthorizationCode(again.client, { code: again.code, redirectUri: REDIRECT, codeVerifier: VERIFIER });
    const rotated = await refreshAccessToken(again.client, { refreshToken: tokens.refresh_token });
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
    await expect(refreshAccessToken(again.client, { refreshToken: tokens.refresh_token })).rejects.toMatchObject({ code: 'invalid_grant' });
    const other = await publicClient();
    await expect(refreshAccessToken(other, { refreshToken: rotated.refresh_token })).rejects.toMatchObject({ code: 'invalid_grant' });
  });

  it('lets a client revoke only its own tokens and rejects expired access tokens', async () => {
    const { client, code } = await grant();
    const tokens = await exchangeAuthorizationCode(client, { code, redirectUri: REDIRECT, codeVerifier: VERIFIER });
    await revokeToken(await publicClient(), tokens.access_token);
    expect(await resolveOAuthAccessToken(tokens.access_token)).not.toBeNull();
    await revokeToken(client, tokens.access_token);
    expect(await resolveOAuthAccessToken(tokens.access_token)).toBeNull();
    const refreshed = await refreshAccessToken(client, { refreshToken: tokens.refresh_token });
    for (const [id, row] of state.collections.get('oauthTokens')!) {
      if (row.type === 'access') state.collections.get('oauthTokens')!.set(id, { ...row, expiresAt: { toMillis: () => Date.now() - 1 } });
    }
    expect(await resolveOAuthAccessToken(refreshed.access_token)).toBeNull();
  });
});
