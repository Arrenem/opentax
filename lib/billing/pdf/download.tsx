'use client';

import { pdf } from '@react-pdf/renderer';
import type { IssuedDocument } from '@/types';
import type { BillingIssuer } from '@/lib/billing/sheetModel';
import { buildBillingSheetModel } from '@/lib/billing/sheetModel';
import { registerBillingPdfFonts } from './fonts';
import { BillingPdfDocument } from './BillingPdfDocument';

export async function downloadBillingPdf(
  document: IssuedDocument,
  issuer?: BillingIssuer
): Promise<void> {
  registerBillingPdfFonts();
  const model = buildBillingSheetModel(document, issuer);
  const blob = await pdf(<BillingPdfDocument model={model} />).toBlob();
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = model.fileName;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
