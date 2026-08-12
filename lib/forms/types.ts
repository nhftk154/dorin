import type { CloseReason } from "@/lib/fifo-engine/types";

/**
 * One row of the Form 1325 (נספח ג(1)) detail table. Hebrew column labels
 * (used at export time, see lib/xlsx-export) were confirmed against a
 * working reference implementation during planning — re-verify column
 * order against the current-year PDF from gov.il before filing.
 */
export interface Form1325Row {
  /** זיהוי מלא של נייר הערך שנמכר */
  securityId: string;
  /** תאריך הרכישה */
  buyDate: string;
  /** תאריך המכירה */
  sellDate: string;
  /** ערך נקוב בקניה */
  buyValueUsd: number;
  /** ערך נקוב במכירה */
  sellValueUsd: number;
  /** מחיר מקורי */
  originalCostILS: number;
  /** שער הדולר ביום הקנייה */
  buyRateILS: number;
  /** שער הדולר ביום המכירה */
  sellRateILS: number;
  /** 1+ שיעור עליית המדד (here: sellRate/buyRate, standing in for CPI linkage on a foreign-currency security) */
  linkageRatio: number;
  /** מחיר מתואם */
  adjustedCostILS: number;
  /** תמורה */
  proceedsILS: number;
  /** רווח הון ריאלי */
  realGainILS: number;
  /** הפסד הון */
  realLossILS: number;
  /** נרכש טרם הרישום למסחר — not derivable from IBKR data, always false */
  acquiredBeforeListing: boolean;
  /** Not part of the official form; kept for the app's own preview/debugging UI. */
  closeReason: CloseReason;
}

export interface ValuedCashflowRow {
  date: string;
  symbol: string;
  description: string;
  amountUsd: number;
  rateILS: number;
  amountILS: number;
}

/**
 * Aggregate summary conceptually matching Form 1322 (נספח ג). Exact
 * current-year PDF field order/labels were not independently verified
 * (gov.il unreachable during development) — treat as a TODO to confirm.
 */
export interface Form1322Summary {
  taxYear: number;
  totalRealGainILS: number;
  totalRealLossILS: number;
  netCapitalResultILS: number;
  priorYearLossCarriedForwardILS: number;
  lossAppliedThisYearILS: number;
  remainingLossToCarryForwardILS: number;
  totalSaleProceedsILS: number;
  totalDividendsILS: number;
  totalInterestILS: number;
  totalForeignTaxWithheldILS: number;
  exceedsSecuritiesProceedsExemptionThreshold: boolean;
}
