import type { TaxReturnBundle } from '@/lib/accounting/reports';
import { xmlEscape } from '@/lib/export/xmlEscape';

function amt(n: number): string {
  return Math.floor(n).toString();
}

/**
 * 確定申告書B（一般）に相当するXTX断片。
 * 帳票コード ITA1160 は所得税及び復興特別所得税の確定申告書Bの慣例コード。
 */
export function generateFormBXtx(bundle: TaxReturnBundle, ownerName: string, address: string): string {
  const { fiscalYear, pl, incomeTax, consumptionTax } = bundle;
  return `<?xml version="1.0" encoding="UTF-8"?>
<tClientInfo>
  <tDocuments>
    <tDocument>
      <tDocumentMeta>
        <tDocumentCode>ITA1160</tDocumentCode>
        <tDocumentName>所得税及び復興特別所得税の確定申告書B</tDocumentName>
        <tFiscalYear>${fiscalYear}</tFiscalYear>
      </tDocumentMeta>
      <tDocumentData>
        <ITA_NAME>${xmlEscape(ownerName)}</ITA_NAME>
        <ITA_ADDRESS>${xmlEscape(address)}</ITA_ADDRESS>
        <ITA_INCOME_BUSINESS>${amt(pl.netIncome)}</ITA_INCOME_BUSINESS>
        <ITA_INCOME_TOTAL>${amt(incomeTax.totalIncome)}</ITA_INCOME_TOTAL>
        <ITA_DED_SOCIAL>${amt(incomeTax.deductions.socialInsurance)}</ITA_DED_SOCIAL>
        <ITA_DED_MUTUAL>${amt(incomeTax.deductions.smallEnterpriseMutual)}</ITA_DED_MUTUAL>
        <ITA_DED_LIFE>${amt(incomeTax.deductions.lifeInsurance)}</ITA_DED_LIFE>
        <ITA_DED_EQ>${amt(incomeTax.deductions.earthquakeInsurance)}</ITA_DED_EQ>
        <ITA_DED_SPOUSE>${amt(incomeTax.deductions.spouse)}</ITA_DED_SPOUSE>
        <ITA_DED_DEP>${amt(incomeTax.deductions.dependents)}</ITA_DED_DEP>
        <ITA_DED_SPEC_REL>${amt(incomeTax.deductions.specificRelativeSpecial)}</ITA_DED_SPEC_REL>
        <ITA_DED_DISABILITY>${amt(incomeTax.deductions.disability)}</ITA_DED_DISABILITY>
        <ITA_DED_WIDOW>${amt(incomeTax.deductions.widow)}</ITA_DED_WIDOW>
        <ITA_DED_SINGLE>${amt(incomeTax.deductions.singleParent)}</ITA_DED_SINGLE>
        <ITA_DED_STUDENT>${amt(incomeTax.deductions.workingStudent)}</ITA_DED_STUDENT>
        <ITA_DED_MEDICAL>${amt(incomeTax.deductions.medical)}</ITA_DED_MEDICAL>
        <ITA_DED_DONATION>${amt(incomeTax.deductions.donations)}</ITA_DED_DONATION>
        <ITA_DED_BASIC>${amt(incomeTax.deductions.basic)}</ITA_DED_BASIC>
        <ITA_DED_TOTAL>${amt(incomeTax.deductions.total)}</ITA_DED_TOTAL>
        <ITA_TAXABLE>${amt(incomeTax.taxableIncome)}</ITA_TAXABLE>
        <ITA_INCOME_TAX>${amt(incomeTax.incomeTax)}</ITA_INCOME_TAX>
        <ITA_RECONSTRUCTION>${amt(incomeTax.reconstructionTax)}</ITA_RECONSTRUCTION>
        <ITA_INCOME_AND_RECON>${amt(incomeTax.incomeAndReconstructionTax)}</ITA_INCOME_AND_RECON>
        <ITA_WITHHOLDING>${amt(incomeTax.withholdingTax)}</ITA_WITHHOLDING>
        <ITA_PREPAID>${amt(incomeTax.prepaidIncomeTax)}</ITA_PREPAID>
        <ITA_TAX_DUE>${amt(incomeTax.taxDue)}</ITA_TAX_DUE>
        <ITA_REFUND>${amt(incomeTax.refund)}</ITA_REFUND>
        <ITA_CTAX_METHOD>${xmlEscape(consumptionTax.method)}</ITA_CTAX_METHOD>
        <ITA_CTAX_PAYABLE>${amt(consumptionTax.totalPayable)}</ITA_CTAX_PAYABLE>
      </tDocumentData>
    </tDocument>
  </tDocuments>
</tClientInfo>`;
}
