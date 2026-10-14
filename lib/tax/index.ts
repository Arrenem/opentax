export { calcIncomeTaxReturn, calcIncomeTaxFromTaxable } from './incomeTax';
export { calcAllDeductions, DEDUCTION_LABELS } from './deductions';
export { calcConsumptionTaxReturn } from './consumptionReturn';
export { calcDepreciationForYear } from './depreciation';
export { calcLocalTaxEstimate } from './localTax';
export {
  getBasicDeduction,
  getMaxBlueFormDeduction,
  applyBlueFormDeduction,
  isSpecial20PctYear,
  isSpecial30PctYear,
  filingDeadline,
} from './taxYearRules';
