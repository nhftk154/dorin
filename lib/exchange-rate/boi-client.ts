import Papa from "papaparse";
import { BOI_API_CONFIG } from "@/config/tax-parameters";
import type { RateMap } from "./types";

/**
 * Fetches official USD/ILS representative rates from the Bank of Israel's
 * SDMX v2 statistics API for a date range.
 *
 * Server-side only (relies on outbound fetch to boi.gov.il, which the
 * browser can't do directly due to CORS) — call this from
 * app/api/boi-rate/route.ts, not from client components.
 *
 * Endpoint host/shape confirmed against a working reference implementation
 * (see README) — see config/tax-parameters.ts for the base URL and a note
 * on the `.gov.il` vs `.org.il` host if BOI ever changes it.
 */
export async function fetchBoiRates(currency: string, startPeriod: string, endPeriod: string): Promise<RateMap> {
  const seriesCode = `RER_${currency}_ILS`;
  const url =
    `${BOI_API_CONFIG.baseUrl}/${seriesCode}` +
    `?DATA_TYPE=${BOI_API_CONFIG.dataType}&format=csv&startperiod=${startPeriod}&endperiod=${endPeriod}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`BOI exchange rate API returned ${response.status} for ${seriesCode} ${startPeriod}..${endPeriod}`);
  }

  const csvText = await response.text();
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });

  const rateMap: RateMap = {};
  for (const row of parsed.data) {
    const date = row["TIME_PERIOD"];
    const value = row["OBS_VALUE"];
    if (!date || value === undefined || value === "") continue;
    const rate = Number(value);
    if (Number.isFinite(rate)) rateMap[date] = rate;
  }
  return rateMap;
}
