import type { IssuedDocumentKind } from '@/types';

const KIND_PREFIX: Record<IssuedDocumentKind, string> = {
  estimate: 'EST',
  invoice: 'INV',
  receipt: 'RCP',
};

/**
 * 帳票番号を生成する。
 * 形式: {PREFIX}-{YYYY}{MM}-{連番4桁}
 * 例: INV-202608-0001
 */
export function generateDocumentNumber(
  kind: IssuedDocumentKind,
  issueDate: string,
  sequence: number
): string {
  const prefix = KIND_PREFIX[kind];
  const d = issueDate.replace(/-/g, '');
  const yyyymm = d.slice(0, 6);
  const seq = String(Math.max(1, sequence)).padStart(4, '0');
  return `${prefix}-${yyyymm}-${seq}`;
}

/**
 * 既存番号リストから次の連番を求める。
 * 同じ kind + YYYYMM の最大連番 + 1。
 */
export function nextSequence(
  kind: IssuedDocumentKind,
  issueDate: string,
  existingNumbers: string[]
): number {
  const prefix = KIND_PREFIX[kind];
  const yyyymm = issueDate.replace(/-/g, '').slice(0, 6);
  const needle = `${prefix}-${yyyymm}-`;
  let max = 0;
  for (const num of existingNumbers) {
    if (!num.startsWith(needle)) continue;
    const seq = Number(num.slice(needle.length));
    if (!Number.isNaN(seq) && seq > max) max = seq;
  }
  return max + 1;
}
