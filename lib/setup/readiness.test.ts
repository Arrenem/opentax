import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const fixture = vi.hoisted(() => ({ docs: new Map<string, object>(), files: new Map<string, Buffer>(), auth: { userId: 'owner', actorType: 'user' }, failure: '', writes: 0 }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => ({
  collection: (name: string) => {
    expect(name).toBe('_opentaxSetupChecks');
    return { doc: (id: string) => ({ id, get: async () => ({ data: () => fixture.docs.get(id) }) }) };
  },
  runTransaction: async (fn: (tx: object) => Promise<void>) => {
    if (fixture.failure === 'database') throw new Error('private provider body');
    await fn({ get: async (ref: { id: string }) => ({ exists: fixture.docs.has(ref.id), data: () => fixture.docs.get(ref.id) }), create: (ref: { id: string }, value: object) => { fixture.docs.set(ref.id, value); fixture.writes++; } });
  },
}) }));
vi.mock('firebase-admin/storage', () => ({ getStorage: () => ({ bucket: () => ({ file: (name: string) => ({
  save: async (body: Buffer, options: { preconditionOpts: { ifGenerationMatch: number } }) => {
    expect(name.startsWith('opentax-setup/')).toBe(true); expect(options.preconditionOpts.ifGenerationMatch).toBe(0);
    if (fixture.files.has(name)) throw Object.assign(new Error('already exists'), { code: 412 });
    fixture.files.set(name, body); fixture.writes++;
  },
  getMetadata: async () => [{ size: fixture.files.get(name)?.length }],
  download: async () => [fixture.files.get(name)],
  getSignedUrl: async () => {
    if (fixture.failure === 'sign') throw new Error('private signed URL/provider body');
    return ['https://storage.googleapis.com/test-fixture?fake-signature=never-return'];
  },
}) }) }) }));
vi.mock('@/lib/auth/authenticateRequest', () => {
  class ApiError extends Error { constructor(public code: string, public status: number) { super(code); } }
  return { ApiError, authenticateRequest: async () => {
    if (fixture.failure === 'unauthenticated') throw new ApiError('UNAUTHORIZED', 401);
    return fixture.auth;
  }, requireUser: (auth: { actorType: string }) => { if (auth.actorType !== 'user') throw new ApiError('USER_REQUIRED', 403); } };
});
import { checkRuntime } from './readiness';
import { POST } from '@/app/api/setup/readiness/route';
const runId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
beforeEach(() => {
  fixture.docs.clear(); fixture.files.clear(); fixture.failure = ''; fixture.writes = 0; fixture.auth = { userId: 'owner', actorType: 'user' };
  vi.stubEnv('OPENTAX_ACCESS_MODE', 'owner'); vi.stubEnv('OPENTAX_OWNER_UID', 'owner');
  vi.stubGlobal('fetch', vi.fn(async () => new Response([...fixture.files.values()][0]?.toString())));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('isolated setup readiness fixtures', () => {
  it('checks DB, signed evidence read and synthetic restore idempotently', async () => {
    const first = await checkRuntime('owner', runId), writes = fixture.writes;
    expect(first.checks).toEqual({ database: 'passed', evidence: 'passed', syntheticRestore: 'passed' });
    expect(first.fullAccountingRestore).toBe('not-tested');
    expect(fixture.docs.size).toBe(2); expect(fixture.files.size).toBe(2);
    expect(await checkRuntime('owner', runId)).toEqual(first); expect(fixture.writes).toBe(writes);
    expect(JSON.stringify(first)).not.toContain('signature');
  });
  it('never overwrites conflicting fixture data', async () => {
    const result = await checkRuntime('owner', runId);
    fixture.docs.set(result.fixtureId, { kind: 'unrelated-data' });
    const writes = fixture.writes;
    await expect(checkRuntime('owner', runId)).rejects.toThrow('CHECK_FIXTURE_CONFLICT');
    expect(fixture.writes).toBe(writes); expect(fixture.docs.get(result.fixtureId)).toEqual({ kind: 'unrelated-data' });
  });
  it('detects signed fetch failure despite working Admin SDK object reads', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('denied', { status: 403 })));
    await expect(checkRuntime('owner', runId)).rejects.toThrow('CHECK_SIGNED_READ_FAILED');
    expect(fixture.files.size).toBe(1);
  });
  it.each(['unauthenticated', 'agent', 'other-owner', 'legacy', 'no-consent'])('rejects %s before touching data', async mode => {
    if (mode === 'unauthenticated') fixture.failure = mode;
    if (mode === 'agent') fixture.auth.actorType = 'agent';
    if (mode === 'other-owner') fixture.auth.userId = 'other';
    if (mode === 'legacy') vi.stubEnv('OPENTAX_ACCESS_MODE', 'legacy');
    const response = await POST(new NextRequest('https://test.invalid/api/setup/readiness', { method: 'POST', body: JSON.stringify({ runId, consent: mode === 'no-consent' ? '' : 'WRITE_SYNTHETIC_SETUP_DATA' }) }));
    expect(response.status).toBeGreaterThanOrEqual(400); expect(fixture.writes).toBe(0);
  });
  it('returns a sanitized failure and never signed URLs or provider responses', async () => {
    fixture.failure = 'sign';
    const response = await POST(new NextRequest('https://test.invalid/api/setup/readiness', { method: 'POST', body: JSON.stringify({ runId, consent: 'WRITE_SYNTHETIC_SETUP_DATA' }) }));
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: { code: 'SETUP_CHECK_FAILED' } });
  });
});
