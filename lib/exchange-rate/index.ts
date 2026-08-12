import { BOI_API_CONFIG } from "@/config/tax-parameters";
import { findOverride } from "./overrides";
import type { ExchangeRateCacheEntry, RateMap, RateOverride } from "./types";

export * from "./types";
export { findOverride } from "./overrides";

/**
 * Resolves the rate to use for a given date from an already-fetched RateMap
 * (see server.ts for how that map is obtained). If BOI has no published rate
 * for the exact date (weekends/holidays), walks backward day by day — up to
 * `maxLookbackDays` (default from config, sized to survive multi-day holiday
 * clusters) — and uses the most recent prior published rate, per the
 * standard convention for Israeli tax reporting.
 *
 * Pure and dependency-free (no fs/network) so it is safe to call from client
 * components once the year's RateMap has been fetched from /api/boi-rate.
 */
export function resolveRateForDate(
  date: string,
  rateMap: RateMap,
  maxLookbackDays: number = BOI_API_CONFIG.maxFallbackLookbackDays
): { rate: number; effectiveDate: string; source: "BOI_API" | "FALLBACK_PREVIOUS_DAY" } {
  if (rateMap[date] !== undefined) {
    return { rate: rateMap[date], effectiveDate: date, source: "BOI_API" };
  }

  const cursor = new Date(`${date}T00:00:00Z`);
  for (let i = 1; i <= maxLookbackDays; i++) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const candidate = cursor.toISOString().slice(0, 10);
    if (rateMap[candidate] !== undefined) {
      return { rate: rateMap[candidate], effectiveDate: candidate, source: "FALLBACK_PREVIOUS_DAY" };
    }
  }

  throw new Error(`No published USD/ILS rate found for ${date} or the preceding ${maxLookbackDays} days.`);
}

/** Same as resolveRateForDate, but checks manual overrides first — an override always wins and is recorded as such for audit visibility. */
export function resolveRateWithOverrides(
  date: string,
  currency: string,
  rateMap: RateMap,
  overrides: RateOverride[]
): ExchangeRateCacheEntry {
  const override = findOverride(overrides, date, currency);
  if (override) {
    return {
      date,
      effectiveDate: date,
      currency,
      rate: override.rate,
      source: "MANUAL_OVERRIDE",
      fetchedAt: new Date().toISOString(),
    };
  }

  const resolved = resolveRateForDate(date, rateMap);
  return {
    date,
    effectiveDate: resolved.effectiveDate,
    currency,
    rate: resolved.rate,
    source: resolved.source,
    fetchedAt: new Date().toISOString(),
  };
}
