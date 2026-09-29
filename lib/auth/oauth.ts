import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { initializeAdminApp } from '@/lib/firebase/admin';
import { getActiveConnection, hashToken, upsertOAuthConnection, type AgentConnection } from './agentTokens';
import { AGENT_SCOPES, type AgentScope } from './scopes';

// OAuth 2.1 authorization server for remote MCP hosts (Claude, ChatGPT and others).
// Every grant becomes an agent connection, so it is listed and revocable in /agent-connections,
// and its tokens act with the same agent rules as an otk_ token.

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60;
export const MCP_RESOURCE_PATH = '/api/mcp';

type ClientAuthMethod = 'none' | 'client_secret_post' | 'client_secret_basic';
const AUTH_METHODS: ClientAuthMethod[] = ['none', 'client_secret_post', 'client_secret_basic'];

export interface OAuthClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: ClientAuthMethod;
  clientSecretHash?: string;
}

interface StoredCode {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: AgentScope[];
  resource?: string;
  expiresAt: Timestamp;
}

interface StoredToken {
  type: 'access' | 'refresh';
  connectionId: string;
  clientId: string;
  userId: string;
  scopes: AgentScope[];
  resource?: string;
  expiresAt: Timestamp;
}

export class OAuthError extends Error {
  constructor(public code: string, public description: string, public status = 400, public redirectable = false) {
    super(description);
  }
  toJSON() { return { error: this.code, error_description: this.description }; }
}

function db() {
  initializeAdminApp();
  return getFirestore();
}

const secret = (prefix: string) => `${prefix}_${randomBytes(32).toString('base64url')}`;

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];

export function isAllowedRedirectUri(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2000) return false;
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.hash || url.username || url.password) return false;
  return url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.includes(url.hostname));
}

// Exact match, except that loopback redirects may use any port (RFC 8252 §7.3).
export function redirectUriMatches(registered: string[], candidate: string) {
  return registered.some((uri) => {
    if (uri === candidate) return true;
    try {
      const a = new URL(uri);
      const b = new URL(candidate);
      return a.protocol === 'http:' && b.protocol === 'http:' && LOOPBACK.includes(a.hostname) &&
        a.hostname === b.hostname && a.pathname === b.pathname && a.search === b.search;
    } catch { return false; }
  });
}

export function parseScopes(value: unknown): AgentScope[] {
  if (typeof value !== 'string') return [];
  // Unknown scopes (such as "openid") are ignored rather than failing the whole request.
  return Array.from(new Set(value.split(/\s+/).filter((s): s is AgentScope => (AGENT_SCOPES as readonly string[]).includes(s))));
}

export function resourceMatches(resource: string, origin: string) {
  const normalized = resource.replace(/\/+$/, '');
  return normalized === `${origin}${MCP_RESOURCE_PATH}` || normalized === origin;
}

export function pkceChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

// ---- Dynamic client registration (RFC 7591) ----

export async function registerClient(body: Record<string, unknown>) {
  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > 10 || !redirectUris.every(isAllowedRedirectUri)) {
    throw new OAuthError('invalid_redirect_uri', 'redirect_uris must be 1 to 10 HTTPS URLs (HTTP only for loopback)');
  }
  const method = (body.token_endpoint_auth_method ?? 'client_secret_basic') as ClientAuthMethod;
  if (!AUTH_METHODS.includes(method)) throw new OAuthError('invalid_client_metadata', 'Unsupported token_endpoint_auth_method');
  const grantTypes = body.grant_types ?? ['authorization_code', 'refresh_token'];
  if (!Array.isArray(grantTypes) || grantTypes.some((g) => g !== 'authorization_code' && g !== 'refresh_token')) {
    throw new OAuthError('invalid_client_metadata', 'Only authorization_code and refresh_token grants are supported');
  }
  const responseTypes = body.response_types ?? ['code'];
  if (!Array.isArray(responseTypes) || responseTypes.some((r) => r !== 'code')) {
    throw new OAuthError('invalid_client_metadata', 'Only the code response type is supported');
  }
  const clientName = typeof body.client_name === 'string' && body.client_name.trim() ? body.client_name.trim().slice(0, 100) : 'MCP client';
  const clientId = secret('otc');
  const clientSecret = method === 'none' ? undefined : secret('ots');
  const record: Record<string, unknown> = {
    clientId, clientName, redirectUris, tokenEndpointAuthMethod: method, createdAt: FieldValue.serverTimestamp(),
  };
  if (clientSecret) record.clientSecretHash = hashToken(clientSecret);
  await db().collection('oauthClients').doc(clientId).set(record);
  return {
    client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000),
    ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
    client_name: clientName, redirect_uris: redirectUris, token_endpoint_auth_method: method,
    grant_types: grantTypes, response_types: responseTypes,
  };
}

export async function getClient(clientId: unknown): Promise<OAuthClient | null> {
  if (typeof clientId !== 'string' || !/^otc_[A-Za-z0-9_-]{40,}$/.test(clientId)) return null;
  const snap = await db().collection('oauthClients').doc(clientId).get();
  return snap.exists ? (snap.data() as OAuthClient) : null;
}

export async function authenticateClient(clientId: unknown, clientSecret: unknown) {
  const client = await getClient(clientId);
  if (!client) throw new OAuthError('invalid_client', 'Unknown client', 401);
  // Public clients are bound by PKCE instead of a secret.
  if (client.tokenEndpointAuthMethod === 'none') return client;
  if (typeof clientSecret !== 'string' || !client.clientSecretHash || !safeEqual(hashToken(clientSecret), client.clientSecretHash)) {
    throw new OAuthError('invalid_client', 'Client authentication failed', 401);
  }
  return client;
}

// ---- Authorization endpoint ----

export interface AuthorizationRequest {
  client: OAuthClient;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  requestedScopes: AgentScope[];
  resource?: string;
}

export async function validateAuthorizationRequest(params: URLSearchParams, origin: string): Promise<AuthorizationRequest> {
  const client = await getClient(params.get('client_id'));
  if (!client) throw new OAuthError('invalid_client', 'Unknown client');
  const redirectUri = params.get('redirect_uri') ?? '';
  if (!redirectUriMatches(client.redirectUris, redirectUri)) throw new OAuthError('invalid_request', 'redirect_uri is not registered for this client');
  // From here on the redirect URI is trusted, so errors go back to the client.
  const fail = (code: string, description: string) => new OAuthError(code, description, 400, true);
  if (params.get('response_type') !== 'code') throw fail('unsupported_response_type', 'response_type must be code');
  const codeChallenge = params.get('code_challenge') ?? '';
  if (params.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) {
    throw fail('invalid_request', 'PKCE with code_challenge_method S256 is required');
  }
  const resource = params.get('resource') ?? undefined;
  if (resource && !resourceMatches(resource, origin)) throw fail('invalid_target', 'Unknown resource');
  return { client, redirectUri, state: params.get('state') ?? undefined, codeChallenge,
    requestedScopes: parseScopes(params.get('scope')), resource };
}

export function redirectWith(redirectUri: string, values: Record<string, string | undefined>) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(values)) if (value !== undefined) url.searchParams.set(key, value);
  return url.toString();
}

export async function createAuthorizationCode(userId: string, request: AuthorizationRequest, scopes: AgentScope[]) {
  if (scopes.length === 0) throw new OAuthError('invalid_scope', 'At least one scope is required', 400, true);
  const code = secret('otac');
  const record: Record<string, unknown> = {
    userId, clientId: request.client.clientId, redirectUri: request.redirectUri, codeChallenge: request.codeChallenge, scopes,
    expiresAt: Timestamp.fromMillis(Date.now() + AUTHORIZATION_CODE_TTL_SECONDS * 1000),
  };
  if (request.resource) record.resource = request.resource;
  await db().collection('oauthCodes').doc(hashToken(code)).set(record);
  return code;
}

// ---- Token endpoint ----

async function consume<T>(collection: string, token: string): Promise<T | null> {
  const ref = db().collection(collection).doc(hashToken(token));
  // Single use even under concurrent redemption.
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    tx.delete(ref);
    return snap.data() as T;
  });
}

async function issueTokens(connection: AgentConnection, clientId: string, scopes: AgentScope[], resource?: string) {
  const accessToken = secret('ota');
  const refreshToken = secret('otr');
  const now = Date.now();
  const base: Record<string, unknown> = { connectionId: connection.id, clientId, userId: connection.userId, scopes };
  if (resource) base.resource = resource;
  const tokens = db().collection('oauthTokens');
  const batch = db().batch();
  batch.set(tokens.doc(hashToken(accessToken)), { ...base, type: 'access', expiresAt: Timestamp.fromMillis(now + ACCESS_TOKEN_TTL_SECONDS * 1000) });
  batch.set(tokens.doc(hashToken(refreshToken)), { ...base, type: 'refresh', expiresAt: Timestamp.fromMillis(now + REFRESH_TOKEN_TTL_SECONDS * 1000) });
  await batch.commit();
  return { access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken, scope: scopes.join(' ') };
}

export async function exchangeAuthorizationCode(client: OAuthClient, input: { code: unknown; redirectUri: unknown; codeVerifier: unknown; resource?: unknown }) {
  if (typeof input.code !== 'string' || !input.code.startsWith('otac_')) throw new OAuthError('invalid_grant', 'Invalid authorization code');
  const stored = await consume<StoredCode>('oauthCodes', input.code);
  if (!stored || stored.expiresAt.toMillis() <= Date.now() || stored.clientId !== client.clientId) {
    throw new OAuthError('invalid_grant', 'Invalid or expired authorization code');
  }
  if (input.redirectUri !== stored.redirectUri) throw new OAuthError('invalid_grant', 'redirect_uri does not match');
  if (typeof input.codeVerifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(input.codeVerifier) ||
    !safeEqual(pkceChallenge(input.codeVerifier), stored.codeChallenge)) {
    throw new OAuthError('invalid_grant', 'PKCE verification failed');
  }
  if (input.resource !== undefined && stored.resource !== undefined && input.resource !== stored.resource) {
    throw new OAuthError('invalid_target', 'resource does not match the authorization request');
  }
  const connection = await upsertOAuthConnection(stored.userId, client.clientId, client.clientName, stored.scopes);
  return issueTokens(connection, client.clientId, stored.scopes, stored.resource ?? (typeof input.resource === 'string' ? input.resource : undefined));
}

export async function refreshAccessToken(client: OAuthClient, input: { refreshToken: unknown; scope?: unknown }) {
  if (typeof input.refreshToken !== 'string' || !input.refreshToken.startsWith('otr_')) throw new OAuthError('invalid_grant', 'Invalid refresh token');
  // Refresh tokens rotate: the presented one is gone after this call either way.
  const stored = await consume<StoredToken>('oauthTokens', input.refreshToken);
  if (!stored || stored.type !== 'refresh' || stored.clientId !== client.clientId || stored.expiresAt.toMillis() <= Date.now()) {
    throw new OAuthError('invalid_grant', 'Invalid or expired refresh token');
  }
  const connection = await getActiveConnection(stored.connectionId);
  if (!connection) throw new OAuthError('invalid_grant', 'This connection was revoked');
  let scopes = stored.scopes.filter((s) => connection.scopes.includes(s));
  if (typeof input.scope === 'string' && input.scope.trim()) {
    const requested = parseScopes(input.scope);
    if (requested.some((s) => !scopes.includes(s))) throw new OAuthError('invalid_scope', 'Requested scope exceeds the original grant');
    scopes = requested;
  }
  if (scopes.length === 0) throw new OAuthError('invalid_scope', 'No scopes remain on this connection');
  return issueTokens(connection, client.clientId, scopes, stored.resource);
}

export async function revokeToken(client: OAuthClient, token: unknown) {
  if (typeof token !== 'string' || !/^ot[ar]_/.test(token)) return;
  const ref = db().collection('oauthTokens').doc(hashToken(token));
  const snap = await ref.get();
  // A client may only revoke its own tokens.
  if (snap.exists && (snap.data() as StoredToken).clientId === client.clientId) await ref.delete();
}

// ---- Resource server ----

export async function resolveOAuthAccessToken(token: string) {
  if (!/^ota_[A-Za-z0-9_-]{40,}$/.test(token)) return null;
  const snap = await db().collection('oauthTokens').doc(hashToken(token)).get();
  if (!snap.exists) return null;
  const stored = snap.data() as StoredToken;
  if (stored.type !== 'access' || stored.expiresAt.toMillis() <= Date.now()) return null;
  const connection = await getActiveConnection(stored.connectionId, { touch: true });
  if (!connection || connection.userId !== stored.userId) return null;
  return { connection, clientId: stored.clientId, scopes: stored.scopes.filter((s) => connection.scopes.includes(s)),
    expiresAt: Math.floor(stored.expiresAt.toMillis() / 1000) };
}
