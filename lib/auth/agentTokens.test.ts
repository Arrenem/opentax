import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ records: new Map<string, Record<string, unknown>>(), next: 0 }));
vi.mock('@/lib/firebase/admin', () => ({ initializeAdminApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => {
  function ref(id: string) {
    return { id,
      set: async (data: Record<string, unknown>) => { state.records.set(id, data); },
      get: async () => ({ exists: state.records.has(id), data: () => state.records.get(id) }),
      update: async (data: Record<string, unknown>) => { state.records.set(id, { ...state.records.get(id), ...data }); },
    };
  }
  const collection = {
    doc: (id?: string) => ref(id ?? `connection-${++state.next}`),
    where: (field: string, _op: string, value: unknown) => {
      const get = async () => ({ empty: !Array.from(state.records.values()).some((d) => d[field] === value),
        docs: Array.from(state.records.entries()).filter(([, d]) => d[field] === value)
          .map(([id, data]) => ({ id, data: () => data, ref: ref(id) })) });
      return { get, limit: () => ({ get }) };
    },
  };
  return { FieldValue: { serverTimestamp: () => 'now' },
    Timestamp: { fromDate: (date: Date) => ({ toMillis: () => date.getTime() }) },
    getFirestore: () => ({ collection: () => collection }) };
});
import { createAgentConnection, listAgentConnections, resolveAgentToken, revokeAgentConnection, hashToken } from './agentTokens';

describe('agent connection lifecycle', () => {
  beforeEach(() => { state.records.clear(); state.next = 0; });
  it('stores only a hash, returns raw token once, and authenticates its owner', async () => {
    const created = await createAgentConnection('user-1', 'Codex', ['read']);
    expect(created.token).toMatch(/^otk_[A-Za-z0-9_-]{40,}$/);
    const stored = state.records.get(created.id)!;
    expect(stored.tokenHash).toBe(hashToken(created.token));
    expect(JSON.stringify(stored)).not.toContain(created.token);
    expect((await listAgentConnections('user-1'))[0]).not.toHaveProperty('tokenHash');
    expect((await listAgentConnections('user-2'))).toEqual([]);
    expect((await resolveAgentToken(created.token))?.userId).toBe('user-1');
    expect(await resolveAgentToken('otk_invalid')).toBeNull();
  });
  it('rejects revoked and expired tokens', async () => {
    const first = await createAgentConnection('user-1', 'One', ['read']);
    await revokeAgentConnection('user-1', first.id);
    expect(await resolveAgentToken(first.token)).toBeNull();
    const second = await createAgentConnection('user-1', 'Two', ['read']);
    state.records.set(second.id, { ...state.records.get(second.id), expiresAt: { toMillis: () => Date.now() - 1 } });
    expect(await resolveAgentToken(second.token)).toBeNull();
    await expect(revokeAgentConnection('user-2', second.id)).rejects.toThrow('Connection not found');
  });
});
