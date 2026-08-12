export type RateSource = "BOI_API" | "MANUAL_OVERRIDE" | "FALLBACK_PREVIOUS_DAY";

export interface ExchangeRateCacheEntry {
  /** The date that was requested. */
  date: string;
  /** The date the returned rate actually applies to (earlier than `date` when a weekend/holiday fallback was used). */
  effectiveDate: string;
  currency: string;
  rate: number;
  source: RateSource;
  fetchedAt: string;
}

export interface RateOverride {
  date: string;
  currency: string;
  rate: number;
  note?: string;
}

/** Raw published rates only, as returned by BOI — date (ISO) -> rate. No fallback resolution applied. */
export type RateMap = Record<string, number>;
