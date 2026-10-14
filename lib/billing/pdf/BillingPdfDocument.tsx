'use client';

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { BillingSheetModel } from '@/lib/billing/sheetModel';

const navy = '#1e3a5f';
const line = '#d1d5db';
const muted = '#4b5563';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'NotoSansJP',
    fontSize: 9,
    color: '#111827',
    paddingTop: 36,
    paddingBottom: 40,
    paddingHorizontal: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: navy,
    paddingBottom: 10,
  },
  kind: {
    fontSize: 22,
    fontWeight: 700,
    color: navy,
    letterSpacing: 4,
  },
  meta: {
    fontSize: 9,
    textAlign: 'right',
    color: muted,
    lineHeight: 1.5,
  },
  parties: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  party: {
    width: '48%',
  },
  customerName: {
    fontSize: 13,
    fontWeight: 700,
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
    paddingBottom: 3,
    marginBottom: 6,
  },
  issuerName: {
    fontSize: 11,
    fontWeight: 700,
    textAlign: 'right',
    marginBottom: 3,
  },
  small: {
    fontSize: 8,
    color: muted,
    lineHeight: 1.45,
  },
  smallRight: {
    fontSize: 8,
    color: muted,
    lineHeight: 1.45,
    textAlign: 'right',
  },
  headline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: navy,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  headlineLabel: {
    fontSize: 9,
    color: muted,
  },
  headlineAmount: {
    fontSize: 16,
    fontWeight: 700,
    color: navy,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: navy,
    color: '#ffffff',
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: line,
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  colDesc: { width: '38%' },
  colQty: { width: '10%', textAlign: 'right' },
  colUnit: { width: '16%', textAlign: 'right' },
  colTax: { width: '18%' },
  colAmt: { width: '18%', textAlign: 'right' },
  headerText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: 700,
  },
  totalsWrap: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  taxBox: {
    width: '48%',
  },
  totalsBox: {
    width: '46%',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  totalStrong: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: navy,
  },
  bank: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: navy,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  notes: {
    marginTop: 16,
    borderTopWidth: 0.5,
    borderTopColor: line,
    paddingTop: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 7,
    color: muted,
    borderTopWidth: 0.5,
    borderTopColor: line,
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  receiptNote: {
    marginTop: 18,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: 700,
  },
});

export function BillingPdfDocument({ model }: { model: BillingSheetModel }) {
  return (
    <Document
      title={`${model.kindLabel} ${model.documentNumber}`}
      author={model.issuerName}
      subject={model.title || model.kindLabel}
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.headerRow} fixed>
          <View>
            <Text style={styles.kind}>{model.kindLabel}</Text>
            <Text style={[styles.small, { marginTop: 4 }]}>No. {model.documentNumber}</Text>
          </View>
          <View>
            <Text style={styles.meta}>発行日　{model.issueDate}</Text>
            {model.dueDate ? <Text style={styles.meta}>お支払期限　{model.dueDate}</Text> : null}
            {model.title ? <Text style={styles.meta}>件名　{model.title}</Text> : null}
          </View>
        </View>

        <View style={styles.parties}>
          <View style={styles.party}>
            <Text style={styles.customerName}>{model.customerName}　御中</Text>
            {model.customerAddress ? (
              <Text style={styles.small}>{model.customerAddress}</Text>
            ) : null}
          </View>
          <View style={styles.party}>
            <Text style={styles.issuerName}>{model.issuerName}</Text>
            {model.issuerOwner ? <Text style={styles.smallRight}>{model.issuerOwner}</Text> : null}
            {model.issuerAddress ? (
              <Text style={styles.smallRight}>{model.issuerAddress}</Text>
            ) : null}
            {model.registrationNumber ? (
              <Text style={styles.smallRight}>登録番号　{model.registrationNumber}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.headline}>
          <Text style={styles.headlineLabel}>{model.headlineLabel}</Text>
          <Text style={styles.headlineAmount}>{model.headlineAmount}</Text>
        </View>

        <View style={styles.tableHeader} fixed>
          <Text style={[styles.headerText, styles.colDesc]}>品目</Text>
          <Text style={[styles.headerText, styles.colQty]}>数量</Text>
          <Text style={[styles.headerText, styles.colUnit]}>単価</Text>
          <Text style={[styles.headerText, styles.colTax]}>税区分</Text>
          <Text style={[styles.headerText, styles.colAmt]}>金額（税抜）</Text>
        </View>

        {model.lines.map((line) => (
          <View key={line.id} style={styles.tableRow} wrap={false}>
            <Text style={styles.colDesc}>
              {line.description}
              {line.withholding ? ' ※源泉' : ''}
            </Text>
            <Text style={styles.colQty}>{line.quantity}</Text>
            <Text style={styles.colUnit}>{line.unitPrice}</Text>
            <Text style={styles.colTax}>{line.taxLabel}</Text>
            <Text style={styles.colAmt}>{line.exclusiveAmount}</Text>
          </View>
        ))}

        <View style={styles.totalsWrap} wrap={false}>
          <View style={styles.taxBox}>
            {model.taxRows.length > 0 ? (
              <View>
                <Text style={[styles.small, { marginBottom: 4, fontWeight: 700 }]}>
                  消費税内訳（適格請求書）
                </Text>
                {model.taxRows.map((row) => (
                  <View key={row.label} style={styles.totalRow}>
                    <Text style={styles.small}>{row.label}</Text>
                    <Text style={styles.small}>
                      税抜 {row.subtotal}　税額 {row.taxAmount}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <View />
            )}
          </View>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text>小計（税抜）</Text>
              <Text>{model.subtotal}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text>消費税</Text>
              <Text>{model.taxAmount}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text>合計（税込）</Text>
              <Text>{model.totalAmount}</Text>
            </View>
            {model.hasWithholding ? (
              <>
                <View style={styles.totalRow}>
                  <Text>源泉徴収対象額</Text>
                  <Text>{model.withholdingBase}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text>源泉所得税（10.21%）</Text>
                  <Text>−{model.withholdingAmount}</Text>
                </View>
                <View style={styles.totalStrong}>
                  <Text style={{ fontWeight: 700 }}>差引お振込額</Text>
                  <Text style={{ fontWeight: 700 }}>{model.amountDue}</Text>
                </View>
              </>
            ) : (
              <View style={styles.totalStrong}>
                <Text style={{ fontWeight: 700 }}>合計（税込）</Text>
                <Text style={{ fontWeight: 700 }}>{model.totalAmount}</Text>
              </View>
            )}
          </View>
        </View>

        {model.bankAccount ? (
          <View style={styles.bank} wrap={false}>
            <Text style={[styles.small, { fontWeight: 700, marginBottom: 4 }]}>お振込先</Text>
            <Text style={{ fontSize: 9, lineHeight: 1.5 }}>{model.bankAccount.bankLine}</Text>
            <Text style={{ fontSize: 9, lineHeight: 1.5 }}>{model.bankAccount.accountLine}</Text>
            {model.bankAccount.accountHolder ? (
              <Text style={{ fontSize: 9, lineHeight: 1.5 }}>
                口座名義　{model.bankAccount.accountHolder}
              </Text>
            ) : null}
          </View>
        ) : null}

        {model.notes ? (
          <View style={styles.notes}>
            <Text style={[styles.small, { fontWeight: 700, marginBottom: 4 }]}>備考</Text>
            <Text style={{ fontSize: 9, lineHeight: 1.5 }}>{model.notes}</Text>
          </View>
        ) : null}

        {model.isReceipt ? (
          <Text style={styles.receiptNote}>上記正に領収いたしました</Text>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>
            {model.isQualifiedInvoice
              ? '本書類は消費税法第57条の4に規定する適格請求書です。'
              : `${model.kindLabel} ${model.documentNumber}`}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
