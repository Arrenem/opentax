'use client';

import type { IssuedDocument } from '@/types';
import type { BillingIssuer } from '@/lib/billing/sheetModel';
import { buildBillingSheetModel } from '@/lib/billing/sheetModel';
import styles from './DocumentSheet.module.css';

interface DocumentSheetProps {
  document: IssuedDocument;
  issuer?: BillingIssuer;
}

export function DocumentSheet({ document, issuer }: DocumentSheetProps) {
  const model = buildBillingSheetModel(document, issuer);

  return (
    <div className={styles.stage}>
      <article className={`billing-print-sheet ${styles.paper}`}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.kind}>{model.kindLabel}</h1>
            <p className={styles.muted} style={{ margin: '6px 0 0' }}>
              No. {model.documentNumber}
            </p>
          </div>
          <div className={styles.meta}>
            <div>発行日　{model.issueDate}</div>
            {model.dueDate && <div>お支払期限　{model.dueDate}</div>}
            {model.title && <div>件名　{model.title}</div>}
          </div>
        </header>

        <section className={styles.parties}>
          <div className={styles.party}>
            <p className={styles.customerName}>{model.customerName}　御中</p>
            {model.customerAddress && (
              <p className={styles.muted}>{model.customerAddress}</p>
            )}
          </div>
          <div className={`${styles.party} ${styles.issuer}`}>
            <p className={styles.issuerName}>{model.issuerName}</p>
            {model.issuerOwner && <p className={styles.muted}>{model.issuerOwner}</p>}
            {model.issuerAddress && <p className={styles.muted}>{model.issuerAddress}</p>}
            {model.registrationNumber && (
              <p className={styles.muted}>登録番号　{model.registrationNumber}</p>
            )}
          </div>
        </section>

        <section className={styles.headline}>
          <span className={styles.headlineLabel}>{model.headlineLabel}</span>
          <span className={styles.headlineAmount}>{model.headlineAmount}</span>
        </section>

        <table className={styles.table}>
          <colgroup>
            <col />
            <col className={styles.colQty} />
            <col className={styles.colUnit} />
            <col className={styles.colTax} />
            <col className={styles.colAmt} />
          </colgroup>
          <thead>
            <tr>
              <th>品目</th>
              <th className={styles.num}>数量</th>
              <th className={styles.num}>単価</th>
              <th>税区分</th>
              <th className={styles.num}>金額（税抜）</th>
            </tr>
          </thead>
          <tbody>
            {model.lines.map((line) => (
              <tr key={line.id}>
                <td>
                  {line.description}
                  {line.withholding && <span className={styles.mark}> ※源泉</span>}
                </td>
                <td className={styles.num}>{line.quantity}</td>
                <td className={styles.num}>{line.unitPrice}</td>
                <td>{line.taxLabel}</td>
                <td className={styles.num}>{line.exclusiveAmount}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className={styles.bottom}>
          <div className={styles.taxBox}>
            {model.taxRows.length > 0 && (
              <>
                <p style={{ fontWeight: 700, margin: '0 0 6px', fontSize: 12 }}>
                  消費税内訳（適格請求書）
                </p>
                {model.taxRows.map((row) => (
                  <div key={row.label} className={styles.totalRow}>
                    <span>{row.label}</span>
                    <span>
                      税抜 {row.subtotal}　税額 {row.taxAmount}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
          <div className={styles.totals}>
            <div className={styles.totalRow}>
              <span>小計（税抜）</span>
              <span>{model.subtotal}</span>
            </div>
            <div className={styles.totalRow}>
              <span>消費税</span>
              <span>{model.taxAmount}</span>
            </div>
            <div className={styles.totalRow}>
              <span>合計（税込）</span>
              <span>{model.totalAmount}</span>
            </div>
            {model.hasWithholding ? (
              <>
                <div className={styles.totalRow}>
                  <span>源泉徴収対象額</span>
                  <span>{model.withholdingBase}</span>
                </div>
                <div className={styles.totalRow}>
                  <span>源泉所得税（10.21%）</span>
                  <span>−{model.withholdingAmount}</span>
                </div>
                <div className={styles.totalStrong}>
                  <span>差引お振込額</span>
                  <span>{model.amountDue}</span>
                </div>
              </>
            ) : (
              <div className={styles.totalStrong}>
                <span>合計（税込）</span>
                <span>{model.totalAmount}</span>
              </div>
            )}
          </div>
        </section>

        {model.bankAccount && (
          <section className={styles.bank}>
            <p style={{ fontWeight: 700, margin: '0 0 4px' }}>お振込先</p>
            <p style={{ margin: 0 }}>{model.bankAccount.bankLine}</p>
            <p style={{ margin: 0 }}>{model.bankAccount.accountLine}</p>
            {model.bankAccount.accountHolder && (
              <p style={{ margin: 0 }}>口座名義　{model.bankAccount.accountHolder}</p>
            )}
          </section>
        )}

        {model.notes && (
          <section className={styles.notes}>
            <p style={{ fontWeight: 700, margin: '0 0 4px' }}>備考</p>
            <p style={{ margin: 0 }}>{model.notes}</p>
          </section>
        )}

        {model.isReceipt && <p className={styles.receipt}>上記正に領収いたしました</p>}

        <footer className={styles.footer}>
          {model.isQualifiedInvoice
            ? '本書類は消費税法第57条の4に規定する適格請求書です。'
            : `${model.kindLabel} ${model.documentNumber}`}
        </footer>
      </article>
    </div>
  );
}
