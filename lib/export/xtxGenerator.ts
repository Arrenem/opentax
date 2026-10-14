import type { ProfitAndLoss, BalanceSheet } from '@/types';
import { CHART_OF_ACCOUNTS } from '@/lib/accounting/chartOfAccounts';
import { xmlEscape } from './xmlEscape';

// ============================================================
// e-Tax XTXファイル生成（青色申告決算書一般用 HOB13000）
// ============================================================

interface XtxGeneratorOptions {
  fiscalYear: number;
  pl: ProfitAndLoss;
  bs: BalanceSheet;
  userId: string;
  businessName: string;
  ownerName: string;
  blueFormDeduction?: number;
}

function formatAmount(amount: number): string {
  return Math.floor(amount).toString();
}

// ============================================================
// 整合性チェック
// ============================================================
export function validateFinancials(pl: ProfitAndLoss, bs: BalanceSheet): string[] {
  const errors: string[] = [];

  // 損益チェック: 所得金額 = 収益 - 経費 - 特別控除
  const expectedNetIncome = pl.grossProfit - (pl.blueFormDeduction ?? 0);
  if (Math.abs(expectedNetIncome - pl.netIncome) > 1) {
    errors.push(`損益計算書不整合: 所得金額 ${pl.netIncome} ≠ 計算値 ${expectedNetIncome}`);
  }

  // 貸借対照表チェック: 資産合計 = 負債・資本合計
  if (Math.abs(bs.assets.totalAssets - bs.totalLiabilitiesAndEquity) > 1) {
    errors.push(`貸借対照表不整合: 資産合計 ${bs.assets.totalAssets} ≠ 負債・資本合計 ${bs.totalLiabilitiesAndEquity}`);
  }

  return errors;
}

// ============================================================
// XTX XML生成
// ============================================================
export function generateXtx(options: XtxGeneratorOptions): string {
  const { fiscalYear, pl, bs, userId, businessName, ownerName } = options;
  const blueFormDeduction = options.blueFormDeduction ?? 650000;

  // 費用科目の値を取得（plLineでソート済み）
  const getExpense = (accountKey: keyof typeof CHART_OF_ACCOUNTS): number => {
    return pl.expenses[accountKey] ?? 0;
  };

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tClientInfo>
  <tClientUserInfo>
    <tClientUserId>${xmlEscape(userId)}</tClientUserId>
    <tClientUserName>${xmlEscape(ownerName)}</tClientUserName>
    <tClientBusinessName>${xmlEscape(businessName)}</tClientBusinessName>
  </tClientUserInfo>
  <tDocuments>
    <tDocument>
      <tDocumentMeta>
        <tDocumentCode>HOB13000</tDocumentCode>
        <tDocumentName>所得税青色申告決算書（一般用）</tDocumentName>
        <tFiscalYear>${fiscalYear}</tFiscalYear>
        <tFiscalYearFrom>${fiscalYear}0101</tFiscalYearFrom>
        <tFiscalYearTo>${fiscalYear}1231</tFiscalYearTo>
      </tDocumentMeta>
      <tDocumentData>
        <!-- 第一表: 損益計算書 -->
        <!-- 1. 売上金額 -->
        <HOB13010>${formatAmount(pl.sales)}</HOB13010>
        <!-- 2. 仕入金額 -->
        <HOB13020>${formatAmount(pl.purchases ?? 0)}</HOB13020>
        <!-- 3. 差引金額 -->
        <HOB13030>${formatAmount(pl.sales)}</HOB13030>
        <!-- 経費各科目 -->
        <!-- 8. 租税公課 -->
        <HOB13080>${formatAmount(getExpense('TAXES_AND_DUES'))}</HOB13080>
        <!-- 9. 荷造運賃 -->
        <HOB13090>${formatAmount(getExpense('FREIGHT'))}</HOB13090>
        <!-- 10. 水道光熱費 -->
        <HOB13100>${formatAmount(getExpense('UTILITIES'))}</HOB13100>
        <!-- 11. 旅費交通費 -->
        <HOB13110>${formatAmount(getExpense('TRAVEL'))}</HOB13110>
        <!-- 12. 通信費 -->
        <HOB13120>${formatAmount(getExpense('COMMUNICATION'))}</HOB13120>
        <!-- 13. 広告宣伝費 -->
        <HOB13130>${formatAmount(getExpense('ADVERTISING'))}</HOB13130>
        <!-- 14. 接待交際費 -->
        <HOB13140>${formatAmount(getExpense('ENTERTAINMENT'))}</HOB13140>
        <!-- 15. 損害保険料 -->
        <HOB13150>${formatAmount(getExpense('INSURANCE'))}</HOB13150>
        <!-- 16. 修繕費 -->
        <HOB13160>${formatAmount(getExpense('REPAIRS'))}</HOB13160>
        <!-- 17. 消耗品費 -->
        <HOB13170>${formatAmount(getExpense('SUPPLIES'))}</HOB13170>
        <!-- 18. 減価償却費 -->
        <HOB13180>${formatAmount(getExpense('DEPRECIATION'))}</HOB13180>
        <!-- 19. 福利厚生費 -->
        <HOB13190>${formatAmount(getExpense('WELFARE'))}</HOB13190>
        <!-- 20. 給料賃金 -->
        <HOB13200>${formatAmount(getExpense('SALARIES'))}</HOB13200>
        <!-- 21. 外注工賃 -->
        <HOB13210>${formatAmount(getExpense('SUBCONTRACTING'))}</HOB13210>
        <!-- 22. 利子割引料 -->
        <HOB13220>${formatAmount(getExpense('INTEREST'))}</HOB13220>
        <!-- 23. 地代家賃 -->
        <HOB13230>${formatAmount(getExpense('RENT'))}</HOB13230>
        <!-- 24. 貸倒金 -->
        <HOB13240>${formatAmount(getExpense('BAD_DEBT'))}</HOB13240>
        <!-- 25. 雑費 -->
        <HOB13250>${formatAmount(getExpense('MISC_EXPENSE'))}</HOB13250>
        <!-- 専従者給与 -->
        <HOB13300>${formatAmount(pl.familyWages ?? 0)}</HOB13300>
        <!-- 経費合計 -->
        <HOB13390>${formatAmount(pl.totalExpenses)}</HOB13390>
        <!-- 差引金額（青色申告特別控除前） -->
        <HOB13430>${formatAmount(pl.grossProfit)}</HOB13430>
        <!-- 青色申告特別控除額 -->
        <HOB13440>${formatAmount(blueFormDeduction)}</HOB13440>
        <!-- 所得金額 -->
        <HOB13450>${formatAmount(pl.netIncome)}</HOB13450>
        <!-- 雑収入 -->
        <HOB13460>${formatAmount(pl.otherIncome)}</HOB13460>

        <!-- 第四表: 貸借対照表（期末） -->
        <!-- 資産の部 -->
        <HOB14010>${formatAmount(bs.assets.current['CASH'] ?? 0)}</HOB14010>
        <HOB14020>${formatAmount(bs.assets.current['BANK'] ?? 0)}</HOB14020>
        <HOB14030>${formatAmount(bs.assets.current['ACCOUNTS_RECEIVABLE'] ?? 0)}</HOB14030>
        <HOB14040>${formatAmount(bs.assets.current['PREPAID_EXPENSE'] ?? 0)}</HOB14040>
        <HOB14050>${formatAmount(bs.assets.current['INVENTORY'] ?? 0)}</HOB14050>
        <HOB14060>${formatAmount(bs.assets.fixed['FIXED_ASSETS'] ?? 0)}</HOB14060>
        <!-- 事業主貸 -->
        <HOB14100>${formatAmount(bs.assets.owner['OWNER_DRAWS'] ?? 0)}</HOB14100>
        <!-- 資産合計 -->
        <HOB14110>${formatAmount(bs.assets.totalAssets)}</HOB14110>

        <!-- 負債・資本の部 -->
        <HOB14200>${formatAmount(bs.liabilities.items['ACCOUNTS_PAYABLE'] ?? 0)}</HOB14200>
        <HOB14210>${formatAmount(bs.liabilities.items['ACCRUED_EXPENSES'] ?? 0)}</HOB14210>
        <HOB14220>${formatAmount(bs.liabilities.items['DEPOSITS_RECEIVED'] ?? 0)}</HOB14220>
        <!-- 事業主借 -->
        <HOB14300>${formatAmount(bs.liabilities.items['OWNER_CONTRIBUTIONS'] ?? 0)}</HOB14300>
        <!-- 元入金 -->
        <HOB14400>${formatAmount(bs.equity.items['CAPITAL'] ?? 0)}</HOB14400>
        <!-- 負債・資本合計 -->
        <HOB14500>${formatAmount(bs.totalLiabilitiesAndEquity)}</HOB14500>
      </tDocumentData>
    </tDocument>
  </tDocuments>
</tClientInfo>`;

  return xml;
}

export function downloadXtx(xml: string, fiscalYear: number): void {
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `blue_form_${fiscalYear}.xtx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
