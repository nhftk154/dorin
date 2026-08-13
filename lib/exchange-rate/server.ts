import { fetchBoiRates } from "./boi-client";
import { loadCache, saveCache } from "./cache";
import type { RateMap } from "./types";

/**
 * Ensures the given calendar year is present in the on-disk JSON cache,
 * fetching from BOI only on a cache miss — so the same date is never
 * requested from BOI twice. Also pulls in ~10 trailing days of the prior
 * year so early-January dates can still fall back to a late-December rate
 * without a second network round trip.
 *
 * Server-side only (uses fs) — call only from Route Handlers, never from
 * client components.
 */
export async function ensureYearCached(currency: string, year: number): Promise<RateMap> {
  const cache = await loadCache();
  const currencyMap = cache[currency] ?? {};
  const yearAlreadyCached = Object.keys(currencyMap).some((date) => date.startsWith(`${year}-`));

  if (!yearAlreadyCached) {
    const startPeriod = `${year - 1}-12-20`;
    const endPeriod = `${year}-12-31`;
    const fetched = await fetchBoiRates(currency, startPeriod, endPeriod);
    const fetchedAt = new Date().toISOString();

    for (const [date, rate] of Object.entries(fetched)) {
      currencyMap[date] = { date, effectiveDate: date, currency, rate, source: "BOI_API", fetchedAt };
    }

    cache[currency] = currencyMap;
    try {
      await saveCache(cache);
    } catch (err) {
      // Some hosting platforms (e.g. serverless deployments) have a read-only
      // filesystem outside a temp directory. Losing the on-disk cache only
      // costs a re-fetch from BOI on the next cold start — never the user's
      // own data — so degrade gracefully instead of failing the request.
      console.warn("BOI rate cache could not be persisted to disk; continuing without it.", err);
    }
  }

  const rateMap: RateMap = {};
  for (const [date, entry] of Object.entries(currencyMap)) rateMap[date] = entry.rate;
  return rateMap;
}
