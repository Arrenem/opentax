import { getFirestore } from 'firebase-admin/firestore';
import { ApiError, type AuthContext } from '@/lib/auth/authenticateRequest';
import { auditRecord, auditRef } from '@/lib/domain/audit';
import { DEFAULT_USER_SETTINGS, type BankAccount, type UserSettings } from '@/types';

function settingsRef(userId: string) {
  return getFirestore().collection('users').doc(userId).collection('userSettings').doc('settings');
}

const TEXT_FIELDS = ['businessName', 'ownerName', 'address', 'taxOffice'] as const;
const BOOLEAN_FIELDS = ['isInvoiceIssuer', 'eTaxFiling', 'excellentElectronicBooks'] as const;
const RATIO_FIELDS = ['homeOfficeRatio', 'communicationRatio', 'carUsageRatio', 'utilitiesRatio'] as const;
const ENUM_FIELDS = {
  filingType: ['blue', 'white'],
  consumptionTaxStatus: ['taxable', 'exempt'],
  consumptionTaxMethod: ['standard', 'simplified', 'special20pct', 'special30pct'],
} as const;
const INTEGER_FIELDS = { fiscalYearStart: [1, 12], simplifiedBusinessType: [1, 6], businessTaxCategory: [1, 3] } as const;
// 振込先口座は請求書の支払先になるため、エージェントからは変更させない。
const USER_ONLY_FIELDS = ['bankAccounts'];
const BANK_ACCOUNT_TYPES = ['ordinary', 'checking', 'savings'];

function isDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function bankAccounts(raw: unknown): BankAccount[] {
  if (!Array.isArray(raw) || raw.length > 10) throw new ApiError('INVALID_BANK_ACCOUNTS', 400);
  const accounts = raw.map((item, index) => {
    const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const text = (key: string) => typeof row[key] === 'string' ? (row[key] as string).trim() : '';
    if (!text('bankName') || !BANK_ACCOUNT_TYPES.includes(String(row.accountType)) || !/^\d{1,8}$/.test(text('accountNumber')))
      throw new ApiError('INVALID_BANK_ACCOUNTS', 400);
    return { id: text('id') || `bank-${index + 1}`, bankName: text('bankName'), branchName: text('branchName'),
      accountType: row.accountType as BankAccount['accountType'], accountNumber: text('accountNumber'),
      accountHolder: text('accountHolder'), isDefault: row.isDefault === true };
  });
  if (accounts.filter((account) => account.isDefault).length > 1) throw new ApiError('INVALID_BANK_ACCOUNTS', 400);
  return accounts;
}

/** 部分更新を検証する。未知のフィールドは typo を黙って捨てないよう拒否する。 */
export function validateSettingsPatch(auth: AuthContext, raw: unknown): Partial<UserSettings> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiError('INVALID_SETTINGS', 400);
  const body = raw as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) continue;
    if (USER_ONLY_FIELDS.includes(key) && auth.actorType === 'agent') throw new ApiError('FIELD_DENIED', 403, `${key} can only be changed by the user`);
    if ((TEXT_FIELDS as readonly string[]).includes(key)) {
      if (typeof value !== 'string' || value.length > 200) throw new ApiError('INVALID_SETTINGS', 400, `Invalid ${key}`);
      patch[key] = value.trim();
    } else if ((BOOLEAN_FIELDS as readonly string[]).includes(key)) {
      if (typeof value !== 'boolean') throw new ApiError('INVALID_SETTINGS', 400, `Invalid ${key}`);
      patch[key] = value;
    } else if ((RATIO_FIELDS as readonly string[]).includes(key)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw new ApiError('INVALID_SETTINGS', 400, `Invalid ${key}`);
      patch[key] = value;
    } else if (key in ENUM_FIELDS) {
      if (!(ENUM_FIELDS[key as keyof typeof ENUM_FIELDS] as readonly unknown[]).includes(value)) throw new ApiError('INVALID_SETTINGS', 400, `Invalid ${key}`);
      patch[key] = value;
    } else if (key in INTEGER_FIELDS) {
      const [min, max] = INTEGER_FIELDS[key as keyof typeof INTEGER_FIELDS];
      if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) throw new ApiError('INVALID_SETTINGS', 400, `Invalid ${key}`);
      patch[key] = value;
    } else if (key === 'invoiceRegistrationNumber') {
      const text = typeof value === 'string' ? value.trim() : null;
      if (text === null || text !== '' && !/^T\d{13}$/.test(text)) throw new ApiError('INVALID_SETTINGS', 400, 'invoiceRegistrationNumber must be T followed by 13 digits');
      patch[key] = text;
    } else if (key === 'openingDate') {
      if (typeof value !== 'string' || value !== '' && !isDate(value)) throw new ApiError('INVALID_SETTINGS', 400, 'Invalid openingDate');
      patch[key] = value;
    } else if (key === 'baselineRevenue') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new ApiError('INVALID_SETTINGS', 400, 'Invalid baselineRevenue');
      patch[key] = value;
    } else if (key === 'bankAccounts') {
      patch[key] = bankAccounts(value);
    } else {
      throw new ApiError('INVALID_SETTING_FIELD', 400, `Unknown setting: ${key}`);
    }
  }
  if (Object.keys(patch).length === 0) throw new ApiError('INVALID_SETTINGS', 400);
  return patch as Partial<UserSettings>;
}

export async function getSettings(auth: AuthContext): Promise<UserSettings> {
  const snap = await settingsRef(auth.userId).get();
  return { ...DEFAULT_USER_SETTINGS, ...(snap.data() as Partial<UserSettings> | undefined) };
}

export async function updateSettings(auth: AuthContext, raw: unknown): Promise<UserSettings> {
  const patch = validateSettingsPatch(auth, raw);
  const ref = settingsRef(auth.userId);
  const log = auditRef(auth);
  return getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const previous = snap.data() as Partial<UserSettings> | undefined;
    tx.set(ref, patch, { merge: true });
    tx.create(log, { id: log.id, ...auditRecord(auth, 'userSettings', 'settings', 'UPDATE', previous ?? {}, patch) });
    return { ...DEFAULT_USER_SETTINGS, ...previous, ...patch };
  });
}
