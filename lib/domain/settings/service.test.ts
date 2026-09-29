import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), id: 0 }));
vi.mock('firebase-admin/firestore', () => {
  class Ref {
    id: string;
    constructor(public path: string) { this.id = path.split('/').at(-1)!; }
    collection(name: string) { return new Col(`${this.path}/${name}`); }
    get = async () => ({ exists: state.docs.has(this.path), data: () => state.docs.get(this.path) });
  }
  class Col { constructor(public path: string) {} doc(id?: string) { return new Ref(`${this.path}/${id ?? `id-${++state.id}`}`); } }
  const db = { collection: (name: string) => new Col(name),
    runTransaction: async (fn: (tx: Record<string, (...args: any[]) => any>) => Promise<unknown>) => {
      const writes: Array<() => void> = [];
      const result = await fn({
        get: (ref: Ref) => ref.get(),
        set: (ref: Ref, data: Record<string, unknown>) => writes.push(() => state.docs.set(ref.path, { ...state.docs.get(ref.path), ...data })),
        create: (ref: Ref, data: Record<string, unknown>) => writes.push(() => state.docs.set(ref.path, data)),
      });
      writes.forEach((write) => write());
      return result;
    } };
  return { getFirestore: () => db, FieldValue: { serverTimestamp: () => 'now' } };
});
import { updateSettings, validateSettingsPatch } from './service';
import type { AuthContext } from '@/lib/auth/authenticateRequest';
const agent: AuthContext = { userId: 'owner', actorType: 'agent', actorId: 'agent', scopes: ['settings:write'] };
const user: AuthContext = { userId: 'owner', actorType: 'user', actorId: 'owner', scopes: [] };
const path = 'users/owner/userSettings/settings';

beforeEach(() => { state.docs.clear(); state.id = 0; state.docs.set(path, { businessName: 'Old', homeOfficeRatio: 30 }); });
describe('business settings', () => {
  it('merges a partial update and audits the previous values', async () => {
    const settings = await updateSettings(agent, { businessName: ' New ', consumptionTaxMethod: 'simplified', simplifiedBusinessType: 5,
      invoiceRegistrationNumber: 'T1234567890123' });
    expect(settings).toMatchObject({ businessName: 'New', homeOfficeRatio: 30, consumptionTaxMethod: 'simplified', filingType: 'blue' });
    expect(state.docs.get(path)).toMatchObject({ businessName: 'New', homeOfficeRatio: 30 });
    const log = Array.from(state.docs.entries()).find(([p]) => p.includes('/auditLog/'))![1];
    expect(log).toMatchObject({ entityType: 'userSettings', actorType: 'agent', previousValues: { businessName: 'Old' } });
  });
  it('rejects unknown fields and out-of-range values', () => {
    expect(() => validateSettingsPatch(agent, { buisnessName: 'x' })).toThrow('Unknown setting');
    expect(() => validateSettingsPatch(agent, { homeOfficeRatio: 120 })).toThrow('Invalid homeOfficeRatio');
    expect(() => validateSettingsPatch(agent, { filingType: 'green' })).toThrow('Invalid filingType');
    expect(() => validateSettingsPatch(agent, { fiscalYearStart: 13 })).toThrow('Invalid fiscalYearStart');
    expect(() => validateSettingsPatch(agent, { invoiceRegistrationNumber: '1234' })).toThrow('13 digits');
    expect(() => validateSettingsPatch(agent, { openingDate: '2026-13-01' })).toThrow('Invalid openingDate');
    expect(() => validateSettingsPatch(agent, {})).toThrow('INVALID_SETTINGS');
  });
  it('keeps bank accounts user-only', () => {
    const accounts = [{ bankName: 'Bank', branchName: 'Main', accountType: 'ordinary', accountNumber: '1234567', accountHolder: 'ｵｰﾌﾟﾝ', isDefault: true }];
    expect(() => validateSettingsPatch(agent, { bankAccounts: accounts })).toThrow('only be changed by the user');
    expect(validateSettingsPatch(user, { bankAccounts: accounts }).bankAccounts?.[0]).toMatchObject({ id: 'bank-1', accountNumber: '1234567' });
    expect(() => validateSettingsPatch(user, { bankAccounts: [{ ...accounts[0], accountNumber: '12-34' }] })).toThrow('INVALID_BANK_ACCOUNTS');
  });
});
