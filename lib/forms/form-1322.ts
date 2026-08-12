import { getTaxYearConfig } from "@/config/tax-parameters";
import { resolveRateWithOverrides } from "@/lib/exchange-rate";
import type { RateMap, RateOverride } from "@/lib/exchange-rate/types";
import type { RawDividendRow, RawInterestRow, RawWithholdingTaxRow } from "@/lib/ibkr-parser/types";
import type { Form1322Summary, Form1325Row, ValuedCashflowRow } from "./types";

function valuateUsdAmount(
  date: string,
  amountUsd: number,
  currency: string,
  rateMap: RateMap,
  overrides: RateOverride[]
): { rateILS: number; amountILS: number } {
  const resolved = resolveRateWithOverrides(date, currency, rateMap, overrides);
  return { rateILS: resolved.rate, amountILS: amountUsd * resolved.rate };
}

export function buildDividendRows(
  dividends: RawDividendRow[],
  rateMap: RateMap,
  overrides: RateOverride[] = []
): ValuedCashflowRow[] {
  return dividends.map((d) => {
    const { rateILS, amountILS } = valuateUsdAmount(d.date, d.amount, d.currency, rateMap, overrides);
    return { date: d.date, symbol: d.symbol, description: d.description, amountUsd: d.amount, rateILS, amountILS };
  });
}

export function buildInterestRows(
  interest: RawInterestRow[],
  rateMap: RateMap,
  overrides: RateOverride[] = []
): ValuedCashflowRow[] {
  return interest.map((i) => {
    const { rateILS, amountILS } = valuateUsdAmount(i.date, i.amount, i.currency, rateMap, overrides);
    return { date: i.date, symbol: "", description: i.description, amountUsd: i.amount, rateILS, amountILS };
  });
}

export function buildWithholdingTaxRows(
  withholding: RawWithholdingTaxRow[],
  rateMap: RateMap,
  overrides: RateOverride[] = []
): ValuedCashflowRow[] {
  return withholding.map((w) => {
    const { rateILS, amountILS } = valuateUsdAmount(w.date, w.amount, w.currency, rateMap, overrides);
    return { date: w.date, symbol: w.symbol, description: "Withholding tax", amountUsd: w.amount, rateILS, amountILS };
  });
}

/**
 * Builds the Form 1322 aggregate summary from already-valued 1325 rows plus
 * dividend/interest/withholding-tax cashflows, and compares total sale
 * proceeds against the configured filing-exemption threshold.
 *
 * `priorYearLossCarriedForwardILS` is a manual input (this app has no
 * visibility into prior tax years) — pass 0 if there's no carryforward.
 */
export function buildForm1322Summary(
  taxYear: number,
  form1325Rows: Form1325Row[],
  dividendRows: ValuedCashflowRow[],
  interestRows: ValuedCashflowRow[],
  withholdingTaxRows: ValuedCashflowRow[],
  priorYearLossCarriedForwardILS = 0
): Form1322Summary {
  const totalRealGainILS = form1325Rows.reduce((sum, r) => sum + r.realGainILS, 0);
  const totalRealLossILS = form1325Rows.reduce((sum, r) => sum + r.realLossILS, 0);
  const netCapitalResultILS = totalRealGainILS - totalRealLossILS;

  const lossAppliedThisYearILS =
    netCapitalResultILS > 0 ? Math.min(priorYearLossCarriedForwardILS, netCapitalResultILS) : 0;
  const remainingLossToCarryForwardILS =
    netCapitalResultILS < 0
      ? -netCapitalResultILS + (priorYearLossCarriedForwardILS - lossAppliedThisYearILS)
      : Math.max(priorYearLossCarriedForwardILS - lossAppliedThisYearILS, 0);

  const totalSaleProceedsILS = form1325Rows.reduce((sum, r) => sum + r.proceedsILS, 0);
  const totalDividendsILS = dividendRows.reduce((sum, r) => sum + r.amountILS, 0);
  const totalInterestILS = interestRows.reduce((sum, r) => sum + r.amountILS, 0);
  const totalForeignTaxWithheldILS = withholdingTaxRows.reduce((sum, r) => sum + Math.abs(r.amountILS), 0);

  const config = getTaxYearConfig(taxYear);

  return {
    taxYear,
    totalRealGainILS,
    totalRealLossILS,
    netCapitalResultILS,
    priorYearLossCarriedForwardILS,
    lossAppliedThisYearILS,
    remainingLossToCarryForwardILS,
    totalSaleProceedsILS,
    totalDividendsILS,
    totalInterestILS,
    totalForeignTaxWithheldILS,
    exceedsSecuritiesProceedsExemptionThreshold:
      totalSaleProceedsILS > config.securitiesProceedsExemptionFromFilingILS,
  };
}
