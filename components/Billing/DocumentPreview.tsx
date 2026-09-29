'use client';

import { useEffect, useRef, useState } from 'react';
import type { IssuedDocument } from '@/types';
import type { BillingIssuer } from '@/lib/billing/sheetModel';
import { DocumentSheet } from './DocumentSheet';

interface DocumentPreviewProps {
  document: IssuedDocument;
  issuer?: BillingIssuer;
}

// A4（210mm ≒ 794px）の用紙を、画面幅に合わせて縮小表示する。印刷時は等倍に戻す（globals.css）
const PAPER_WIDTH_PX = 794;

export function DocumentPreview({ document, issuer }: DocumentPreviewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / PAPER_WIDTH_PX));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full overflow-hidden">
      <div data-sheet-scale style={scale < 1 ? { zoom: scale } : undefined}>
        <DocumentSheet document={document} issuer={issuer} />
      </div>
    </div>
  );
}
