export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireScope, requireUser, apiErrorResponse } from '@/lib/auth/authenticateRequest';
import { getTaxReturnPreview, validateFiscalYear, assertReviewComplete } from '@/lib/domain/reports/service';
import { generateFormBXtx } from '@/lib/export/formBGenerator';
import { generateXtx } from '@/lib/export/xtxGenerator';
export async function GET(req: NextRequest) {
  try { const auth = await authenticateRequest(req); requireScope(auth, 'read');
    const q = new URL(req.url).searchParams;
    const fiscalYear = validateFiscalYear(q.get('fiscalYear'));
    const { bundle, settings, journals } = await getTaxReturnPreview(auth, fiscalYear);
    if (q.get('format') === 'formb') {
      requireUser(auth); assertReviewComplete(journals);
      return new NextResponse(generateFormBXtx(bundle, settings.ownerName, settings.address ?? ''), {
        headers: { 'Content-Type': 'application/xml; charset=utf-8',
          'Content-Disposition': `attachment; filename="form_b_${fiscalYear}.xtx"` } });
    }
    return NextResponse.json(bundle);
  } catch (e) { return apiErrorResponse(e); }
}
export async function POST(req: NextRequest) {
  try { const auth = await authenticateRequest(req); requireUser(auth);
    const body = await req.json(); const fiscalYear = validateFiscalYear(body.fiscalYear);
    const { bundle, settings, journals } = await getTaxReturnPreview(auth, fiscalYear);
    assertReviewComplete(journals);
    const kind = body.kind ?? 'blue';
    const xml = kind === 'formb' ? generateFormBXtx(bundle, settings.ownerName, settings.address ?? '') :
      generateXtx({ fiscalYear, pl: bundle.pl, bs: bundle.bs, userId: auth.userId,
        businessName: settings.businessName, ownerName: settings.ownerName,
        blueFormDeduction: bundle.pl.blueFormDeduction });
    return new NextResponse(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${kind}_${fiscalYear}.xtx"` } });
  } catch (e) { return apiErrorResponse(e); }
}
