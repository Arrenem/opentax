export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { authenticateRequest, requireScope, requireUser, apiErrorResponse } from '@/lib/auth/authenticateRequest';
import { DEFAULT_USER_SETTINGS, type UserSettings } from '@/types';
import { CHART_OF_ACCOUNTS } from '@/lib/accounting/chartOfAccounts';
import { TAX_TYPE_LABELS } from '@/lib/accounting/consumptionTax';
import { getSettings, updateSettings } from '@/lib/domain/settings/service';

function settingsRef(userId: string) {
  return getFirestore().collection('users').doc(userId).collection('userSettings').doc('settings');
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    requireScope(auth, 'read');
    return NextResponse.json({ settings: await getSettings(auth), chartOfAccounts: CHART_OF_ACCOUNTS, taxTypes: TAX_TYPE_LABELS });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    requireUser(auth);
    const userId = auth.userId;
    const body = await req.json();
    const settings: UserSettings = { ...DEFAULT_USER_SETTINGS, ...body };
    await settingsRef(userId).set(settings, { merge: true });
    return NextResponse.json({ settings });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/** 部分更新。エージェントは settings:write スコープが必要で、振込先口座は変更できない。 */
export async function PATCH(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    requireScope(auth, 'settings:write');
    const { updates } = await req.json();
    return NextResponse.json({ settings: await updateSettings(auth, updates) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
