'use client';

import type { BillingLineItem, TaxType } from '@/types';
import { CONTROL_CLASS, Select } from '@/components/ui/Input';
import { Button, IconButton } from '@/components/ui/Button';
import {
  syncLineItemAmount,
  calculateDocumentTotals,
  emptyBillingLine,
  TAX_TREATMENT_OPTIONS,
  toTaxTreatment,
  parseTaxTreatment,
  type TaxTreatment,
} from '@/lib/billing';
import { formatYen } from '@/lib/utils/format';

interface LineItemsEditorProps {
  items: BillingLineItem[];
  onChange: (items: BillingLineItem[]) => void;
  readOnly?: boolean;
}

export function LineItemsEditor({ items, onChange, readOnly }: LineItemsEditorProps) {
  const totals = calculateDocumentTotals(items);
  const allWithholding = items.length > 0 && items.every((item) => item.withholding);

  function updateItem(index: number, patch: Partial<BillingLineItem>) {
    onChange(items.map((item, i) => (i === index ? syncLineItemAmount({ ...item, ...patch }) : item)));
  }

  function toggleAllWithholding() {
    const nextValue = !allWithholding;
    onChange(items.map((item) => syncLineItemAmount({ ...item, withholding: nextValue && isRemunerationLine(item.taxType) })));
  }

  const treatmentLabel = (item: BillingLineItem) =>
    TAX_TREATMENT_OPTIONS.find((opt) => opt.value === toTaxTreatment(item.taxType, item.priceMode))?.label;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {totals.lines.map((item, index) => (
          <div key={item.id} className="rounded-2xl bg-fill/[0.05] p-3 sm:p-4">
            <div className="flex items-start gap-2">
              <span className="num mt-2.5 w-5 shrink-0 text-center text-xs text-ink-3">{index + 1}</span>
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_88px_128px_minmax(0,176px)]">
                {readOnly ? (
                  <>
                    <p className="col-span-2 py-2 text-sm text-ink sm:col-span-1">{item.description}</p>
                    <p className="num py-2 text-sm text-ink-2">× {item.quantity}</p>
                    <p className="num py-2 text-sm text-ink-2">{formatYen(item.unitPrice)}</p>
                    <p className="py-2 text-sm text-ink-2">{treatmentLabel(item)}</p>
                  </>
                ) : (
                  <>
                    <input
                      aria-label="品目"
                      value={item.description}
                      onChange={(e) => updateItem(index, { description: e.target.value })}
                      placeholder="品目・サービス名"
                      className={`${CONTROL_CLASS} col-span-2 sm:col-span-1`}
                    />
                    <label className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">数量</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, { quantity: Number(e.target.value) || 0 })}
                        className={`${CONTROL_CLASS} num pl-11 text-right`}
                      />
                    </label>
                    <label className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">単価</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={item.unitPrice}
                        onChange={(e) => updateItem(index, { unitPrice: Number(e.target.value) || 0 })}
                        className={`${CONTROL_CLASS} num pl-11 text-right`}
                      />
                    </label>
                    <Select
                      aria-label="税区分"
                      wrapperClassName="col-span-2 sm:col-span-1"
                      options={TAX_TREATMENT_OPTIONS}
                      value={toTaxTreatment(item.taxType, item.priceMode)}
                      onChange={(e) => updateItem(index, parseTaxTreatment(e.target.value as TaxTreatment))}
                    />
                  </>
                )}
              </div>
              {!readOnly && (
                <IconButton
                  icon="close"
                  label="明細を削除"
                  size={32}
                  className="mt-1.5 !bg-transparent"
                  disabled={items.length <= 1}
                  onClick={() => onChange(items.filter((_, i) => i !== index))}
                />
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pl-7 text-xs text-ink-3">
              <label className="flex min-h-[32px] items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-accent"
                  checked={Boolean(item.withholding)}
                  disabled={readOnly}
                  onChange={(e) => updateItem(index, { withholding: e.target.checked })}
                />
                源泉徴収の対象
              </label>
              <span className="num">
                税抜 {formatYen(item.exclusiveAmount)} ・ 税 {formatYen(item.lineTaxAmount)} ・{' '}
                <span className="font-medium text-ink">税込 {formatYen(item.inclusiveAmount)}</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon="plus" onClick={() => onChange([...items, emptyBillingLine()])}>
            明細を追加
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleAllWithholding}>
            {allWithholding ? '源泉をすべて解除' : '報酬をすべて源泉対象にする'}
          </Button>
        </div>
      )}

      <div className="ml-auto max-w-sm space-y-1.5 border-t border-line/[0.08] pt-4 text-sm">
        <TotalRow label="小計（税抜）" value={totals.subtotal} />
        <TotalRow label="消費税" value={totals.taxAmount} />
        <TotalRow label="合計（税込）" value={totals.totalAmount} strong={totals.withholdingAmount === 0} />
        {totals.withholdingAmount > 0 && (
          <>
            <TotalRow label="源泉徴収税" value={-totals.withholdingAmount} />
            <TotalRow label="差引お振込額" value={totals.amountDue} strong />
          </>
        )}
      </div>

      <p className="text-xs leading-relaxed text-ink-3">
        外税は税抜単価、内税は税込単価で入力します。源泉は税抜報酬の10.21%（100万円超の部分は20.42%）で自動計算します。
      </p>
    </div>
  );
}

function TotalRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-6 ${strong ? 'pt-1 text-base font-semibold text-ink' : 'text-ink-2'}`}>
      <span>{label}</span>
      <span className="num">{formatYen(value)}</span>
    </div>
  );
}

function isRemunerationLine(taxType: TaxType): boolean {
  return taxType === 'standard10' || taxType === 'reduced8' || taxType === 'non_taxable';
}
