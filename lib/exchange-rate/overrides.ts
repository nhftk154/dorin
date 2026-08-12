import type { RateOverride } from "./types";

export function findOverride(overrides: RateOverride[], date: string, currency: string): RateOverride | undefined {
  return overrides.find((o) => o.date === date && o.currency === currency);
}
