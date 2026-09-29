import type { AccountCode, JournalEntry, UserSettings } from '@/types';
import { toRatio } from '@/lib/utils/format';

/** 家事按分の対象科目 */
export const ALLOCATION_ACCOUNTS: Partial<Record<AccountCode, keyof UserSettings>> = {
  RENT: 'homeOfficeRatio',
  UTILITIES: 'utilitiesRatio',
  COMMUNICATION: 'communicationRatio',
};

export function allocationRatioFor(account: AccountCode, settings: UserSettings): number {
  const key = ALLOCATION_ACCOUNTS[account];
  if (!key) return 1;
  const percent = settings[key];
  if (typeof percent !== 'number') return 1;
  return toRatio(percent, 100);
}

export function allocatedExpenseAmount(
  account: AccountCode,
  amount: number,
  settings: UserSettings
): number {
  return Math.floor(amount * allocationRatioFor(account, settings));
}

export function describeAllocations(settings: UserSettings): Array<{
  account: AccountCode;
  label: string;
  ratio: number;
}> {
  return [
    { account: 'RENT', label: '地代家賃（自宅兼事務所）', ratio: toRatio(settings.homeOfficeRatio, 100) },
    { account: 'UTILITIES', label: '水道光熱費', ratio: toRatio(settings.utilitiesRatio ?? settings.homeOfficeRatio, 100) },
    { account: 'COMMUNICATION', label: '通信費', ratio: toRatio(settings.communicationRatio, 100) },
  ];
}

export function applyAllocationToJournals(
  journals: JournalEntry[],
  settings: UserSettings
): JournalEntry[] {
  return journals.map((j) => {
    const ratio = allocationRatioFor(j.debitAccount, settings);
    if (ratio >= 1) return j;
    const debitAmount = Math.floor(j.debitAmount * ratio);
    return {
      ...j,
      debitAmount,
      creditAmount: debitAmount,
      taxAmount: Math.floor((j.taxAmount ?? 0) * ratio),
    };
  });
}
