export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireScope, apiErrorResponse } from '@/lib/auth/authenticateRequest';
import type { NtaApiResponse } from '@/types';

const REGISTRATION_NUMBER_REGEX = /^T\d{13}$/;
const NTA_INVOICE_API = 'https://web-api.invoice-kohyo.nta.go.jp/1/num';

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    requireScope(auth, 'read');

    const body = await req.json();
    const { registrationNumber } = body as { registrationNumber: string };

    if (!registrationNumber || !REGISTRATION_NUMBER_REGEX.test(registrationNumber)) {
      return NextResponse.json(
        { error: 'Invalid registration number. Must be T followed by 13 digits.' },
        { status: 400 }
      );
    }

    const appId = process.env.NTA_APP_ID;
    if (!appId) {
      return NextResponse.json(
        {
          error: 'NTA_APP_ID is not configured. Please set up the National Tax Agency API key.',
          isVerified: false,
        },
        { status: 503 }
      );
    }

    const params = new URLSearchParams({
      id: appId,
      number: registrationNumber,
      type: '21',    // JSON形式
      history: '0',  // 現在情報のみ
    });

    const response = await fetch(`${NTA_INVOICE_API}?${params}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 86400 }, // 24時間キャッシュ
    });

    if (!response.ok) {
      throw new Error(`NTA API error: ${response.status}`);
    }

    const data: NtaApiResponse = await response.json();

    if (!data.destination || data.destination.length === 0) {
      return NextResponse.json({ isVerified: false, message: '登録番号が見つかりませんでした' });
    }

    const dest = data.destination[0];
    const isActive = dest.process === '01'; // '01': 登録済み
    const isVerified = isActive && !dest.cancelDate && !dest.expirationDate;

    return NextResponse.json({
      isVerified,
      registratedNumber: dest.registratedNumber,
      name: dest.name,
      registrationDate: dest.registrationDate,
      cancelDate: dest.cancelDate,
      expirationDate: dest.expirationDate,
      process: dest.process,
    });
  } catch (error) {
    console.error('Invoice verify error:', error);
    return apiErrorResponse(error);
  }
}
