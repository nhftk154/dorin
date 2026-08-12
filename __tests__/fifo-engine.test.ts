import { describe, expect, it } from "vitest";
import type { RawCorporateActionRow, RawTradeRow } from "@/lib/ibkr-parser/types";
import { runFifo, flattenOpenLots } from "@/lib/fifo-engine/lot-matcher";
import { runFifoWithCorporateActions } from "@/lib/fifo-engine";

let idCounter = 0;
function makeTrade(overrides: Partial<RawTradeRow> & { tradeDate: string; quantity: number; price: number }): RawTradeRow {
  idCounter += 1;
  return {
    transactionId: `T${idCounter}`,
    assetCategory: "STK",
    currency: "USD",
    symbol: "AAPL",
    dateTime: overrides.tradeDate,
    commFee: 0,
    code: [],
    raw: {},
    sourceFile: "test.csv",
    ...overrides,
  };
}

function makeOptionTrade(
  overrides: Partial<RawTradeRow> & { tradeDate: string; quantity: number; price: number; strike: number; expiry: string; putCall: "P" | "C" }
): RawTradeRow {
  return makeTrade({
    assetCategory: "OPT",
    multiplier: 100,
    symbol: `AAPL ${overrides.expiry} ${overrides.strike} ${overrides.putCall}`,
    ...overrides,
  });
}

function makeCorporateAction(overrides: Partial<RawCorporateActionRow> & { symbol: string; date: string; actionType: string }): RawCorporateActionRow {
  return {
    underlyingSymbol: "AAPL",
    description: "",
    raw: {},
    sourceFile: "test.csv",
    ...overrides,
  };
}

describe("plain FIFO matching", () => {
  it("matches a partial sell against the oldest lots first, leaving the correct residual open lot", () => {
    const trades = [
      makeTrade({ tradeDate: "2025-01-01", quantity: 100, price: 100, commFee: -1 }),
      makeTrade({ tradeDate: "2025-02-01", quantity: 100, price: 110, commFee: -1 }),
      makeTrade({ tradeDate: "2025-03-01", quantity: 100, price: 120, commFee: -1 }),
      makeTrade({ tradeDate: "2025-04-01", quantity: -150, price: 130, commFee: -1.5 }),
    ];

    const { closedPositions, queues } = runFifo(trades);

    expect(closedPositions).toHaveLength(2);
    expect(closedPositions[0].quantity).toBe(100);
    expect(closedPositions[0].openDate).toBe("2025-01-01");
    expect(closedPositions[0].openValuePerUnitUsd).toBeCloseTo(100.01, 5);
    expect(closedPositions[0].closeValuePerUnitUsd).toBeCloseTo(129.99, 5);
    expect(closedPositions[0].gainUsd).toBeCloseTo(2998, 2);

    expect(closedPositions[1].quantity).toBe(50);
    expect(closedPositions[1].openDate).toBe("2025-02-01");
    expect(closedPositions[1].openValuePerUnitUsd).toBeCloseTo(110.01, 5);

    const openLots = flattenOpenLots(queues);
    const totalOpenQty = openLots.reduce((sum, lot) => sum + lot.quantity, 0);
    expect(totalOpenQty).toBe(150); // 50 remaining from the 2025-02-01 lot + 100 untouched from 2025-03-01
    expect(openLots.every((lot) => lot.side === "LONG")).toBe(true);
  });
});

describe("FIFO with a short position", () => {
  it("computes inverted P&L for sell-to-open then buy-to-cover, in two partial closes", () => {
    const trades = [
      makeTrade({ tradeDate: "2025-01-01", quantity: -100, price: 50, commFee: -1 }),
      makeTrade({ tradeDate: "2025-02-01", quantity: 40, price: 40, commFee: -0.4 }),
      makeTrade({ tradeDate: "2025-03-01", quantity: 60, price: 45, commFee: -0.6 }),
    ];

    const { closedPositions, queues } = runFifo(trades);

    expect(closedPositions).toHaveLength(2);
    expect(closedPositions.every((p) => p.side === "SHORT")).toBe(true);
    // Open side = the original short sale date; close side = the later buy-to-cover date.
    expect(closedPositions[0].openDate).toBe("2025-01-01");
    expect(closedPositions[0].closeDate).toBe("2025-02-01");
    expect(closedPositions[0].quantity).toBe(40);
    expect(closedPositions[0].openValuePerUnitUsd).toBeCloseTo(49.99, 5);
    expect(closedPositions[0].closeValuePerUnitUsd).toBeCloseTo(40.01, 5);
    expect(closedPositions[0].gainUsd).toBeGreaterThan(0); // covered cheaper than the short-sale price -> gain

    expect(closedPositions[1].closeDate).toBe("2025-03-01");
    expect(closedPositions[1].quantity).toBe(60);

    expect(flattenOpenLots(queues)).toHaveLength(0);
  });
});

describe("options: expiration and exercise", () => {
  it("closes a long option expiring worthless at zero, recognizing a full-premium loss", () => {
    const optionTrade = makeOptionTrade({
      tradeDate: "2025-01-01",
      quantity: 1,
      price: 2.5,
      commFee: -0.65,
      strike: 200,
      expiry: "2025-09-15",
      putCall: "C",
    });

    const { closedPositions, openLots } = runFifoWithCorporateActions([optionTrade], [], "2025-12-31");

    expect(closedPositions).toHaveLength(1);
    expect(closedPositions[0].closeReason).toBe("EXPIRED_WORTHLESS");
    expect(closedPositions[0].closeValuePerUnitUsd).toBe(0);
    expect(closedPositions[0].openValuePerUnitUsd).toBeCloseTo(250.65, 5);
    expect(closedPositions[0].gainUsd).toBeCloseTo(-250.65, 5); // full premium lost
    expect(openLots).toHaveLength(0);
  });

  it("recognizes a full-premium gain when a short option expires worthless", () => {
    const shortOptionTrade = makeOptionTrade({
      tradeDate: "2025-01-01",
      quantity: -1,
      price: 3,
      commFee: -0.65,
      strike: 200,
      expiry: "2025-09-15",
      putCall: "C",
    });

    const { closedPositions } = runFifoWithCorporateActions([shortOptionTrade], [], "2025-12-31");

    expect(closedPositions[0].closeReason).toBe("EXPIRED_WORTHLESS");
    expect(closedPositions[0].gainUsd).toBeGreaterThan(0);
  });

  it("folds option premium into the acquired stock's cost basis on call exercise, with zero standalone gain on the option leg", () => {
    const optionTrade = makeOptionTrade({
      tradeDate: "2025-01-01",
      quantity: 1,
      price: 5,
      commFee: -0.65,
      strike: 200,
      expiry: "2025-09-15",
      putCall: "C",
    });
    const exercise = makeCorporateAction({
      symbol: optionTrade.symbol,
      date: "2025-09-15",
      actionType: "Exercise",
      quantity: 1,
    });

    const { closedPositions, openLots } = runFifoWithCorporateActions([optionTrade], [exercise], "2025-12-31");

    const optionClose = closedPositions.find((p) => p.closeReason === "EXERCISED");
    expect(optionClose).toBeDefined();
    expect(optionClose!.gainUsd).toBe(0);

    const stockLot = openLots.find((lot) => lot.instrumentKey.assetCategory === "STK");
    expect(stockLot).toBeDefined();
    expect(stockLot!.quantity).toBe(100);
    // strike (200) + amortized premium (5*100 + 0.65 commission = 500.65, /100 shares = 5.0065)
    expect(stockLot!.unitOpenValueUsd).toBeCloseTo(205.0065, 4);
  });
});

describe("multi-leg option spreads", () => {
  it("tracks each leg (different strike/right) as a fully independent FIFO queue", () => {
    const longLeg = makeOptionTrade({
      tradeDate: "2025-01-01",
      quantity: 1,
      price: 8,
      commFee: -0.65,
      strike: 190,
      expiry: "2025-09-15",
      putCall: "C",
    });
    const shortLeg = makeOptionTrade({
      tradeDate: "2025-01-01",
      quantity: -1,
      price: 3,
      commFee: -0.65,
      strike: 200,
      expiry: "2025-09-15",
      putCall: "C",
    });

    const { closedPositions, queues } = runFifo([longLeg, shortLeg]);

    expect(closedPositions).toHaveLength(0); // both legs are opens, nothing closed yet
    const openLots = flattenOpenLots(queues);
    expect(openLots).toHaveLength(2);

    const longOpen = openLots.find((lot) => lot.instrumentKey.strike === 190);
    const shortOpen = openLots.find((lot) => lot.instrumentKey.strike === 200);
    expect(longOpen?.side).toBe("LONG");
    expect(shortOpen?.side).toBe("SHORT");
  });
});
