import { createHash, randomBytes } from 'node:crypto';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { initializeAdminApp } from '@/lib/firebase/admin';

import { AGENT_SCOPES, type AgentScope } from './scopes';
export { AGENT_SCOPES, type AgentScope } from './scopes';

export interface AgentConnection {
  id: string;
  userId: string;
  name: string;
  // Absent on OAuth connections: their short-lived tokens live in oauthTokens.
  tokenHash?: string;
  tokenPrefix: string;
  scopes: AgentScope[];
  createdAt: Timestamp;
  lastUsedAt?: Timestamp;
  expiresAt?: Timestamp;
  revokedAt?: Timestamp;
  authType?: 'token' | 'oauth';
  oauthClientId?: string;
}

function connections() {
  initializeAdminApp();
  return getFirestore().collection('agentConnections');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function validateScopes(value: unknown): AgentScope[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((s) => !AGENT_SCOPES.includes(s))) {
    throw new Error('Invalid agent scopes');
  }
  return Array.from(new Set(value)) as AgentScope[];
}

export async function createAgentConnection(userId: string, name: string, scopes: AgentScope[], expiresAt?: Date) {
  if (!name.trim() || name.length > 100) throw new Error('Invalid connection name');
  validateScopes(scopes);
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) throw new Error('Invalid expiry');
  const token = `otk_${randomBytes(32).toString('base64url')}`;
  const ref = connections().doc();
  const connection: Record<string, unknown> = {
    id: ref.id, userId, name: name.trim(), tokenHash: hashToken(token),
    tokenPrefix: token.slice(0, 12), scopes, createdAt: FieldValue.serverTimestamp(),
  };
  if (expiresAt) connection.expiresAt = Timestamp.fromDate(expiresAt);
  await ref.set(connection);
  return { id: ref.id, token };
}

export async function listAgentConnections(userId: string) {
  const snap = await connections().where('userId', '==', userId).get();
  return snap.docs.map((d) => {
    const publicData = { ...d.data() } as Partial<AgentConnection>;
    delete publicData.tokenHash;
    return publicData;
  });
}

export async function revokeAgentConnection(userId: string, id: string) {
  const ref = connections().doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.userId !== userId) throw new Error('Connection not found');
  await ref.update({ revokedAt: FieldValue.serverTimestamp() });
}

function isActive(connection: AgentConnection) {
  return !connection.revokedAt && !(connection.expiresAt && connection.expiresAt.toMillis() <= Date.now());
}

async function touch(ref: FirebaseFirestore.DocumentReference) {
  // Usage telemetry must not make a valid request fail.
  await ref.update({ lastUsedAt: FieldValue.serverTimestamp() }).catch(() => undefined);
}

export async function resolveAgentToken(token: string): Promise<AgentConnection | null> {
  if (!/^otk_[A-Za-z0-9_-]{40,}$/.test(token)) return null;
  const snap = await connections().where('tokenHash', '==', hashToken(token)).limit(1).get();
  if (snap.empty) return null;
  const connection = snap.docs[0].data() as AgentConnection;
  if (!isActive(connection)) return null;
  await touch(snap.docs[0].ref);
  return connection;
}

export async function getActiveConnection(id: string, options: { touch?: boolean } = {}): Promise<AgentConnection | null> {
  const ref = connections().doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const connection = snap.data() as AgentConnection;
  if (!isActive(connection)) return null;
  if (options.touch) await touch(ref);
  return connection;
}

// One connection per (user, OAuth client): re-authorizing replaces its scopes instead of adding a row.
export async function upsertOAuthConnection(userId: string, clientId: string, clientName: string, scopes: AgentScope[]) {
  validateScopes(scopes);
  const snap = await connections().where('userId', '==', userId).get();
  const existing = snap.docs.find((d) => {
    const c = d.data() as AgentConnection;
    return c.oauthClientId === clientId && isActive(c);
  });
  if (existing) {
    await existing.ref.update({ scopes });
    return { ...(existing.data() as AgentConnection), scopes };
  }
  const ref = connections().doc();
  const connection = {
    id: ref.id, userId, name: clientName.trim().slice(0, 100) || 'MCP client', tokenPrefix: 'OAuth',
    authType: 'oauth' as const, oauthClientId: clientId, scopes, createdAt: FieldValue.serverTimestamp(),
  };
  await ref.set(connection);
  return connection as unknown as AgentConnection;
}
