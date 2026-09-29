export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireUser, apiErrorResponse } from '@/lib/auth/authenticateRequest';
import { getTaxReturnPreview, validateFiscalYear, assertReviewComplete } from '@/lib/domain/reports/service';
import { generateXtx, validateFinancials } from '@/lib/export/xtxGenerator';
export async function GET(req: NextRequest) {
  try { const auth = await authenticateRequest(req); requireUser(auth);
    const fiscalYear = validateFiscalYear(new URL(req.url).searchParams.get('fiscalYear'));
    const { bundle, settings, journals } = await getTaxReturnPreview(auth, fiscalYear);
    assertReviewComplete(journals);
    const validationErrors = validateFinancials(bundle.pl, bundle.bs);
    const xml = generateXtx({ fiscalYear, pl: bundle.pl, bs: bundle.bs, userId: auth.userId,
      businessName: settings.businessName, ownerName: settings.ownerName,
      blueFormDeduction: bundle.pl.blueFormDeduction });
    return new NextResponse(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="blue_form_${fiscalYear}.xtx"`,
      'X-Validation-Warnings': encodeURIComponent(validationErrors.join('; ')) } });
  } catch (e) { return apiErrorResponse(e); }
}
