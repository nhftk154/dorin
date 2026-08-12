/**
 * TAX YEAR CONFIGURATION — UPDATE THIS FILE EVERY YEAR.
 *
 * The Israeli Tax Authority (רשות המסים) republishes the annual filing
 * thresholds every year, and the 1322/1325 form layout can change between
 * tax years. Before relying on this app for a real filing:
 *
 *   1. Look up the current year's figures at gov.il (search "דוח שנתי ליחיד
 *      2026" or the current year) and add/update the entry below.
 *   2. Re-check the current 1322/1325 PDF layout against `lib/forms/`.
 *
 * The 2025 figures below were sourced via web search summaries (not the
 * primary PDF, which this app could not reach directly) — re-verify them
 * before filing on their basis.
 */
export interface TaxYearParameters {
  /** Real capital gains tax rate for tradable securities held by an individual (%). */
  realCapitalGainsTaxRatePct: number;
  /**
   * Total annual sale proceeds from securities below which an individual may
   * be exempt from the general obligation to file (conditional on advance
   * tax having been paid and the advance-tax computation being attached).
   */
  securitiesProceedsExemptionFromFilingILS: number;
  /** General annual income ceiling above which filing a return is mandatory regardless of source. */
  generalFilingObligationCeilingILS: number;
}

export const TAX_YEAR_CONFIG: Record<number, TaxYearParameters> = {
  2025: {
    realCapitalGainsTaxRatePct: 25,
    securitiesProceedsExemptionFromFilingILS: 375_000,
    generalFilingObligationCeilingILS: 717_000,
  },
  // 2026: { realCapitalGainsTaxRatePct: 25, securitiesProceedsExemptionFromFilingILS: 0, generalFilingObligationCeilingILS: 0 },
};

export function getTaxYearConfig(year: number): TaxYearParameters {
  const config = TAX_YEAR_CONFIG[year];
  if (!config) {
    throw new Error(
      `No tax parameters configured for ${year} — add an entry to config/tax-parameters.ts`
    );
  }
  return config;
}

/** BOI historical exchange-rate API — see lib/exchange-rate/boi-client.ts for usage. */
export const BOI_API_CONFIG = {
  /**
   * Confirmed working host as of this writing. If requests start failing,
   * BOI has occasionally used `edge.boi.org.il` for the same path — try
   * swapping the host first before assuming the whole API changed shape.
   */
  baseUrl: "https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/EXR/1.0",
  /** OF00 = official representative rate (שער יציג). */
  dataType: "OF00",
  /** Max calendar days to walk backward looking for the last published rate before a gap (weekends/holidays). */
  maxFallbackLookbackDays: 10,
};
