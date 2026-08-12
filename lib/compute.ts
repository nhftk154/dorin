import { runFifoWithCorporateActions } from "@/lib/fifo-engine";
import type { ClosedPositionResult } from "@/lib/fifo-engine/types";
import type { RateMap, RateOverride } from "@/lib/exchange-rate/types";
import { buildDividendRows, buildForm1322Summary, buildInterestRows, buildWithholdingTaxRows } from "@/lib/forms/form-1322";
import { buildForm1325Rows } from "@/lib/forms/form-1325";
import type { Form1322Summary, Form1325Row, ValuedCashflowRow } from "@/lib/forms/types";
import { getMergedData, getRateOverrides, saveResult } from "@/lib/persistence/repository";

const CURRENCY = "USD";

/** Fetches (and lets the server-side cache dedupe) the BOI rate map for every distinct year touched by the given ISO dates. */
async function fetchRatesForDates(dates: string[]): Promise<RateMap> {
  const years = [...new Set(dates.filter(Boolean).map((d) => Number(d.slice(0, 4))))];
  const maps = await Promise.all(
    years.map(async (year) => {
      const res = await fetch(`/api/boi-rate?year=${year}&currency=${CURRENCY}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `שגיאה בשליפת שערי חליפין לשנת ${year}`);
      }
      const body = (await res.json()) as { rates: RateMap };
      return body.rates;
    })
  );
  return Object.assign({}, ...maps) as RateMap;
}

export interface YearlyComputation {
  taxYear: number;
  closedPositions: ClosedPositionResult[];
  form1325Rows: Form1325Row[];
  form1322Summary: Form1322Summary;
  dividendRows: ValuedCashflowRow[];
  interestRows: ValuedCashflowRow[];
  withholdingTaxRows: ValuedCashflowRow[];
  rateMap: RateMap;
  overrides: RateOverride[];
  /** Total commissions paid on trades executed in this tax year (USD) — an approximation for the dashboard, since a trade's commission is folded into its lot's cost/proceeds rather than tracked separately once matched. */
  totalCommissionsUsd: number;
}

/** Sell-side date of a closed position, per the buy/sell mapping used throughout lib/forms. */
function dispositionDate(position: ClosedPositionResult): string {
  return position.side === "LONG" ? position.closeDate : position.openDate;
}
function acquisitionDate(position: ClosedPositionResult): string {
  return position.side === "LONG" ? position.openDate : position.closeDate;
}

/**
 * Runs the full pipeline for one tax year: FIFO matching (over the entire
 * trade history, since lots can span years) + corporate actions, then
 * filters closed positions down to sales that occurred in `taxYear`,
 * fetches every BOI year needed for both the buy and sell side of those
 * sales (a multi-year holding period needs more than one year's rate
 * table), and builds the 1325/1322/cashflow rows.
 */
export async function computeResultsForYear(
  taxYear: number,
  priorYearLossCarriedForwardILS = 0
): Promise<YearlyComputation> {
  const merged = await getMergedData();
  const { closedPositions } = runFifoWithCorporateActions(merged.trades, merged.corporateActions, `${taxYear}-12-31`);

  const positionsThisYear = closedPositions.filter((p) => dispositionDate(p).startsWith(`${taxYear}-`));
  const totalCommissionsUsd = merged.trades
    .filter((t) => t.tradeDate.startsWith(`${taxYear}-`))
    .reduce((sum, t) => sum + Math.abs(t.commFee), 0);
  const dividendsThisYear = merged.dividends.filter((d) => d.date.startsWith(`${taxYear}-`));
  const interestThisYear = merged.interest.filter((i) => i.date.startsWith(`${taxYear}-`));
  const withholdingThisYear = merged.withholdingTax.filter((w) => w.date.startsWith(`${taxYear}-`));

  const relevantDates = [
    ...positionsThisYear.flatMap((p) => [acquisitionDate(p), dispositionDate(p)]),
    ...dividendsThisYear.map((d) => d.date),
    ...interestThisYear.map((i) => i.date),
    ...withholdingThisYear.map((w) => w.date),
  ];

  const rateMap = await fetchRatesForDates(relevantDates);
  const overrides = await getRateOverrides();

  const form1325Rows = buildForm1325Rows(positionsThisYear, rateMap, overrides);
  const dividendRows = buildDividendRows(dividendsThisYear, rateMap, overrides);
  const interestRows = buildInterestRows(interestThisYear, rateMap, overrides);
  const withholdingTaxRows = buildWithholdingTaxRows(withholdingThisYear, rateMap, overrides);
  const form1322Summary = buildForm1322Summary(
    taxYear,
    form1325Rows,
    dividendRows,
    interestRows,
    withholdingTaxRows,
    priorYearLossCarriedForwardILS
  );

  await saveResult({
    taxYear,
    closedPositions: positionsThisYear,
    openLots: [],
    computedAt: new Date().toISOString(),
    priorYearLossCarriedForwardILS,
  });

  return {
    taxYear,
    closedPositions: positionsThisYear,
    form1325Rows,
    form1322Summary,
    dividendRows,
    interestRows,
    withholdingTaxRows,
    rateMap,
    overrides,
    totalCommissionsUsd,
  };
}
