export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { authenticateRequest, requireScope, requireUser, apiErrorResponse } from '@/lib/auth/authenticateRequest';
import { DEFAULT_DEDUCTIONS, type IncomeDeductionInput } from '@/types';

function ref(userId: string, year: number) {
  return getFirestore()
    .collection('users')
    .doc(userId)
    .collection('taxFilings')
    .doc(String(year));
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    requireScope(auth, 'read');
    const userId = auth.userId;
    const year = Number(new URL(req.url).searchParams.get('fiscalYear') ?? new Date().getFullYear());
    const snap = await ref(userId, year).get();
    const deductions: IncomeDeductionInput = {
      ...DEFAULT_DEDUCTIONS,
      ...(snap.data()?.deductions as Partial<IncomeDeductionInput> | undefined),
    };
    return NextResponse.json({ deductions });
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
    const year = Number(body.fiscalYear ?? new Date().getFullYear());
    const deductions: IncomeDeductionInput = { ...DEFAULT_DEDUCTIONS, ...body.deductions };
    await ref(userId, year).set({ deductions, updatedAt: new Date().toISOString() }, { merge: true });
    return NextResponse.json({ deductions });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
