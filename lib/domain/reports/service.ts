import { getFirestore } from 'firebase-admin/firestore';
import { DEFAULT_DEDUCTIONS, DEFAULT_USER_SETTINGS, type FixedAsset, type IncomeDeductionInput, type JournalEntry, type UserSettings } from '@/types';
import { buildBS, buildMonthlySummaries, buildPL, buildTaxReturnBundle } from '@/lib/accounting/reports';
import { calcDepreciationForYear } from '@/lib/tax/depreciation';
import { ApiError, type AuthContext } from '@/lib/auth/authenticateRequest';

export function validateFiscalYear(value: unknown) {
  const year = Number(value ?? new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new ApiError('INVALID_FISCAL_YEAR', 400);
  return year;
}
export async function loadFinancialContext(auth: AuthContext, fiscalYear: number) {
  const user = getFirestore().collection('users').doc(auth.userId);
  const [journalSnap, settingsSnap, filingSnap, assetSnap] = await Promise.all([
    user.collection('journals').where('isDeleted', '==', false).where('isCurrent', '==', true).where('fiscalYear', '==', fiscalYear).get(),
    user.collection('userSettings').doc('settings').get(), user.collection('taxFilings').doc(String(fiscalYear)).get(),
    user.collection('fixedAssets').get(),
  ]);
  const journals = journalSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as JournalEntry[];
  const settings: UserSettings = { ...DEFAULT_USER_SETTINGS, ...(settingsSnap.data() as Partial<UserSettings> | undefined) };
  const deductions: IncomeDeductionInput = { ...DEFAULT_DEDUCTIONS,
    ...(filingSnap.data()?.deductions as Partial<IncomeDeductionInput> | undefined) };
  const assets = assetSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as FixedAsset[];
  return { journals, settings, deductions, assets };
}
export function pendingCount(journals: JournalEntry[]) {
  return journals.filter((j) => j.status === 'pending' || j.status === 'auto').length;
}
export function assertReviewComplete(journals: JournalEntry[]) {
  const count = pendingCount(journals);
  if (count) throw new ApiError('REVIEW_REQUIRED', 409, `${count} pending journals require review`);
}
export async function getReport(auth: AuthContext, fiscalYear: number, type: 'pl' | 'bs' | 'monthly') {
  const { journals, settings, deductions, assets } = await loadFinancialContext(auth, fiscalYear);
  const depreciation = calcDepreciationForYear(fiscalYear, assets, settings.filingType === 'blue');
  if (type === 'pl') return { pl: buildPL(journals, fiscalYear, settings, {
    beginningInventory: deductions.beginningInventory, endingInventory: deductions.endingInventory,
    depreciationAmount: depreciation.totalDeductible }) };
  if (type === 'bs') return { bs: buildBS(journals, fiscalYear) };
  return { monthly: buildMonthlySummaries(journals, fiscalYear, settings) };
}
export async function getTaxReturnPreview(auth: AuthContext, fiscalYear: number) {
  const context = await loadFinancialContext(auth, fiscalYear);
  return { bundle: buildTaxReturnBundle({ fiscalYear, ...context,
    beginningInventory: context.deductions.beginningInventory,
    endingInventory: context.deductions.endingInventory }), ...context };
}
