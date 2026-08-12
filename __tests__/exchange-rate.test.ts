import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveRateForDate, resolveRateWithOverrides } from "@/lib/exchange-rate";
import type { RateMap, RateOverride } from "@/lib/exchange-rate/types";

describe("resolveRateForDate", () => {
  const rateMap: RateMap = {
    "2025-01-02": 3.6,
    "2025-01-03": 3.62,
    "2025-01-06": 3.65,
  };

  it("returns the exact date's rate when published", () => {
    const result = resolveRateForDate("2025-01-02", rateMap);
    expect(result).toEqual({ rate: 3.6, effectiveDate: "2025-01-02", source: "BOI_API" });
  });

  it("falls back to the most recent prior published rate for a weekend gap", () => {
    const result = resolveRateForDate("2025-01-04", rateMap); // Saturday, no rate published
    expect(result.rate).toBe(3.62);
    expect(result.effectiveDate).toBe("2025-01-03");
    expect(result.source).toBe("FALLBACK_PREVIOUS_DAY");
  });

  it("walks back further than one day to survive a multi-day holiday cluster", () => {
    const sparseMap: RateMap = { "2025-09-15": 3.7 };
    const result = resolveRateForDate("2025-09-22", sparseMap); // 7 days later, nothing published in between
    expect(result.rate).toBe(3.7);
    expect(result.effectiveDate).toBe("2025-09-15");
    expect(result.source).toBe("FALLBACK_PREVIOUS_DAY");
  });

  it("throws when no rate is found within the lookback window", () => {
    expect(() => resolveRateForDate("2025-01-01", {}, 5)).toThrow();
  });
});

describe("resolveRateWithOverrides", () => {
  it("prefers a manual override over the cached/API value for its date", () => {
    const rateMap: RateMap = { "2025-01-02": 3.6 };
    const overrides: RateOverride[] = [{ date: "2025-01-02", currency: "USD", rate: 3.75, note: "broker confirmation" }];

    const result = resolveRateWithOverrides("2025-01-02", "USD", rateMap, overrides);

    expect(result.rate).toBe(3.75);
    expect(result.source).toBe("MANUAL_OVERRIDE");
  });

  it("falls through to normal resolution when no override exists for the date", () => {
    const rateMap: RateMap = { "2025-01-02": 3.6 };
    const result = resolveRateWithOverrides("2025-01-02", "USD", rateMap, []);
    expect(result.source).toBe("BOI_API");
    expect(result.rate).toBe(3.6);
  });
});

vi.mock("@/lib/exchange-rate/cache", () => {
  const store: Record<string, Record<string, unknown>> = {};
  return {
    __store: store,
    loadCache: vi.fn(async () => structuredClone(store)),
    saveCache: vi.fn(async (cache: Record<string, unknown>) => {
      for (const key of Object.keys(store)) delete store[key];
      Object.assign(store, cache);
    }),
  };
});

describe("ensureYearCached (server-side cache + BOI fetch)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const cacheModule = await import("@/lib/exchange-rate/cache");
    const store = (cacheModule as unknown as { __store: Record<string, unknown> }).__store;
    for (const key of Object.keys(store)) delete store[key];
  });

  it("fetches from BOI only once per year/currency, serving repeat requests from cache", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => "TIME_PERIOD,OBS_VALUE\n2025-01-02,3.60\n2025-01-03,3.62\n",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { ensureYearCached } = await import("@/lib/exchange-rate/server");

    const first = await ensureYearCached("USD", 2025);
    const second = await ensureYearCached("USD", 2025);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first["2025-01-02"]).toBe(3.6);
    expect(second["2025-01-02"]).toBe(3.6);

    vi.unstubAllGlobals();
  });
});
