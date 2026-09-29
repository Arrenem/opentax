'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { IssuedDocument } from '@/types';
import type { BillingIssuer } from '@/lib/billing/sheetModel';

interface PdfExportButtonProps {
  document: IssuedDocument;
  issuer?: BillingIssuer;
}

export function PdfExportButton({ document, issuer }: PdfExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      const { downloadBillingPdf } = await import('@/lib/billing/pdf/download');
      await downloadBillingPdf(document, issuer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDFの出力に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" icon="download" onClick={handleDownload} loading={loading}>
        PDF
      </Button>
      <Button variant="secondary" size="sm" icon="printer" onClick={() => window.print()}>
        印刷
      </Button>
      {error && <p className="w-full text-xs text-negative">{error}</p>}
    </>
  );
}
