import type { RawCorporateActionRow } from "../ibkr-parser/types";
import { applyTradeToQueues, type QueueMap } from "./lot-matcher";
import type { ClosedPositionResult, OpenLot, TradeForMatching } from "./types";

/** Standard US equity/ETF option contract size. IBKR's own Multiplier column (captured on the original trade) is not carried onto OpenLot, so this is assumed here — accurate for the vast majority of listed equity options. */
const STANDARD_OPTION_MULTIPLIER = 100;

let syntheticIdCounter = 0;
function nextSyntheticId(prefix: string): string {
  syntheticIdCounter += 1;
  return `SYN-${prefix}-${syntheticIdCounter}`;
}

export interface ExerciseAssignmentContext {
  date: string;
  underlyingSymbol: string;
  /** Contracts affected; defaults to the lot's full remaining quantity when omitted (whole-lot exercise/assignment). */
  quantity?: number;
  transactionId: string;
}

export interface SyntheticStockTrade extends TradeForMatching {
  symbol: string;
  assetCategory: "STK";
}

interface OptionEventResult {
  optionClose: ClosedPositionResult;
  syntheticStockTrade: SyntheticStockTrade;
  /** Any unaffected remainder of the lot, to be pushed back onto its queue by the caller. */
  remainderLot: OpenLot | null;
}

function splitLotForContext(lot: OpenLot, ctx: ExerciseAssignmentContext): { affected: OpenLot; remainder: OpenLot | null } {
  const qty = Math.min(ctx.quantity ?? lot.quantity, lot.quantity);
  if (qty >= lot.quantity) return { affected: lot, remainder: null };
  return {
    affected: { ...lot, quantity: qty },
    remainder: { ...lot, quantity: lot.quantity - qty },
  };
}

/** The option leg itself recognizes no standalone gain/loss on exercise/assignment — its economics fold into the resulting stock trade. */
function closeOptionLegAtZeroGain(
  lot: OpenLot,
  date: string,
  closingTransactionId: string,
  reason: "EXERCISED" | "ASSIGNED"
): ClosedPositionResult {
  return {
    instrumentKey: lot.instrumentKey,
    side: lot.side,
    quantity: lot.quantity,
    openDate: lot.openDate,
    closeDate: date,
    openValuePerUnitUsd: lot.unitOpenValueUsd,
    closeValuePerUnitUsd: lot.unitOpenValueUsd,
    gainUsd: 0,
    closeReason: reason,
    originTransactionIds: { open: lot.originTransactionId, close: closingTransactionId },
  };
}

/** Long call exercised: option cost is added to the strike price to form the acquired stock's cost basis. */
export function handleCallExercise(lot: OpenLot, ctx: ExerciseAssignmentContext): OptionEventResult {
  const { affected, remainder } = splitLotForContext(lot, ctx);
  const strike = affected.instrumentKey.strike ?? 0;
  const shares = affected.quantity * STANDARD_OPTION_MULTIPLIER;
  const totalPremiumPaid = affected.unitOpenValueUsd * affected.quantity;
  const stockUnitCost = strike + totalPremiumPaid / shares;

  return {
    optionClose: closeOptionLegAtZeroGain(affected, ctx.date, ctx.transactionId, "EXERCISED"),
    syntheticStockTrade: {
      transactionId: nextSyntheticId("EXERCISE"),
      tradeDate: ctx.date,
      dateTime: ctx.date,
      quantity: shares,
      price: stockUnitCost,
      commFee: 0,
      multiplier: 1,
      symbol: ctx.underlyingSymbol,
      assetCategory: "STK",
    },
    remainderLot: remainder,
  };
}

/** Long put exercised: sells the underlying at strike; the put's premium cost reduces the effective sale proceeds. */
export function handlePutExercise(lot: OpenLot, ctx: ExerciseAssignmentContext): OptionEventResult {
  const { affected, remainder } = splitLotForContext(lot, ctx);
  const strike = affected.instrumentKey.strike ?? 0;
  const shares = affected.quantity * STANDARD_OPTION_MULTIPLIER;
  const totalPremiumPaid = affected.unitOpenValueUsd * affected.quantity;
  const stockUnitProceeds = strike - totalPremiumPaid / shares;

  return {
    optionClose: closeOptionLegAtZeroGain(affected, ctx.date, ctx.transactionId, "EXERCISED"),
    syntheticStockTrade: {
      transactionId: nextSyntheticId("EXERCISE"),
      tradeDate: ctx.date,
      dateTime: ctx.date,
      quantity: -shares,
      price: stockUnitProceeds,
      commFee: 0,
      multiplier: 1,
      symbol: ctx.underlyingSymbol,
      assetCategory: "STK",
    },
    remainderLot: remainder,
  };
}

/** Short call assigned: forces a stock sale at strike; premium received increases the effective proceeds. */
export function handleCallAssignment(lot: OpenLot, ctx: ExerciseAssignmentContext): OptionEventResult {
  const { affected, remainder } = splitLotForContext(lot, ctx);
  const strike = affected.instrumentKey.strike ?? 0;
  const shares = affected.quantity * STANDARD_OPTION_MULTIPLIER;
  const totalPremiumReceived = affected.unitOpenValueUsd * affected.quantity;
  const stockUnitProceeds = strike + totalPremiumReceived / shares;

  return {
    optionClose: closeOptionLegAtZeroGain(affected, ctx.date, ctx.transactionId, "ASSIGNED"),
    syntheticStockTrade: {
      transactionId: nextSyntheticId("ASSIGN"),
      tradeDate: ctx.date,
      dateTime: ctx.date,
      quantity: -shares,
      price: stockUnitProceeds,
      commFee: 0,
      multiplier: 1,
      symbol: ctx.underlyingSymbol,
      assetCategory: "STK",
    },
    remainderLot: remainder,
  };
}

/** Short put assigned: forces a stock purchase at strike; premium received reduces the effective cost basis. */
export function handlePutAssignment(lot: OpenLot, ctx: ExerciseAssignmentContext): OptionEventResult {
  const { affected, remainder } = splitLotForContext(lot, ctx);
  const strike = affected.instrumentKey.strike ?? 0;
  const shares = affected.quantity * STANDARD_OPTION_MULTIPLIER;
  const totalPremiumReceived = affected.unitOpenValueUsd * affected.quantity;
  const stockUnitCost = strike - totalPremiumReceived / shares;

  return {
    optionClose: closeOptionLegAtZeroGain(affected, ctx.date, ctx.transactionId, "ASSIGNED"),
    syntheticStockTrade: {
      transactionId: nextSyntheticId("ASSIGN"),
      tradeDate: ctx.date,
      dateTime: ctx.date,
      quantity: shares,
      price: stockUnitCost,
      commFee: 0,
      multiplier: 1,
      symbol: ctx.underlyingSymbol,
      assetCategory: "STK",
    },
    remainderLot: remainder,
  };
}

/** Option expires worthless: closes the remaining lot at price 0 (100% loss for a long holder, 100% realized gain for a short seller). */
export function handleExpiration(lot: OpenLot, expiryDate: string): ClosedPositionResult {
  const closeValuePerUnit = 0;
  const gainUsd =
    lot.side === "LONG"
      ? (closeValuePerUnit - lot.unitOpenValueUsd) * lot.quantity
      : (lot.unitOpenValueUsd - closeValuePerUnit) * lot.quantity;
  return {
    instrumentKey: lot.instrumentKey,
    side: lot.side,
    quantity: lot.quantity,
    openDate: lot.openDate,
    closeDate: expiryDate,
    openValuePerUnitUsd: lot.unitOpenValueUsd,
    closeValuePerUnitUsd: closeValuePerUnit,
    gainUsd,
    closeReason: "EXPIRED_WORTHLESS",
    originTransactionIds: { open: lot.originTransactionId, close: `EXPIRED-${lot.originTransactionId}` },
  };
}

function resolveUnderlyingSymbol(action: RawCorporateActionRow, optionSymbol: string): string {
  return action.underlyingSymbol || optionSymbol.split(" ")[0] || optionSymbol;
}

/**
 * Processes exercise/assignment/expiration corporate-action events against
 * the existing option queues, mutating `queues` and appending to
 * `closedPositions`. Any resulting synthetic stock trade (from exercise or
 * assignment) is fed straight back into the underlying's own stock queue via
 * the same `applyTradeToQueues` used for ordinary trades, so normal FIFO
 * matching (including further partial closes against pre-existing stock
 * lots) still applies without duplicating matching logic.
 */
export function runCorporateActionsPass(
  queues: QueueMap,
  corporateActions: RawCorporateActionRow[],
  closedPositions: ClosedPositionResult[],
  asOfDate: string
): void {
  const sortedActions = [...corporateActions].sort((a, b) => (a.date < b.date ? -1 : 1));

  for (const action of sortedActions) {
    const type = action.actionType;
    if (type !== "Exercise" && type !== "Assignment") continue;

    // Match by option symbol against any open OPT-category lot in the queues.
    for (const [keyStr, queue] of queues) {
      if (queue.length === 0) continue;
      const key = queue[0].instrumentKey;
      if (key.assetCategory !== "OPT" || key.symbol !== action.symbol) continue;

      const lot = queue[0];
      const ctx = {
        date: action.date,
        underlyingSymbol: resolveUnderlyingSymbol(action, key.symbol),
        quantity: action.quantity,
        transactionId: action.raw["TransactionID"] || `${type}-${action.symbol}-${action.date}`,
      };

      const isCall = key.putCall === "C";
      const isPut = key.putCall === "P";
      const isLong = lot.side === "LONG";

      let result;
      if (type === "Exercise" && isCall && isLong) result = handleCallExercise(lot, ctx);
      else if (type === "Exercise" && isPut && isLong) result = handlePutExercise(lot, ctx);
      else if (type === "Assignment" && isCall && !isLong) result = handleCallAssignment(lot, ctx);
      else if (type === "Assignment" && isPut && !isLong) result = handlePutAssignment(lot, ctx);
      else continue; // combination doesn't correspond to a recognized real-world case (e.g. assignment on a long lot) - skip defensively

      closedPositions.push(result.optionClose);
      queue.shift();
      if (result.remainderLot) queue.unshift(result.remainderLot);
      queues.set(keyStr, queue);

      const stockKey = { symbol: result.syntheticStockTrade.symbol, assetCategory: "STK" as const };
      applyTradeToQueues(queues, stockKey, result.syntheticStockTrade, closedPositions, "SALE");

      break; // one action closes (up to) one lot; re-entering the outer loop would double-process the same queue on the same iteration
    }
  }

  // Expiration sweep: any option lot still open past its expiry with no explicit corporate-action event closes worthless.
  for (const [keyStr, queue] of queues) {
    if (queue.length === 0) continue;
    const key = queue[0].instrumentKey;
    if (key.assetCategory !== "OPT" || !key.expiry) continue;
    if (key.expiry > asOfDate) continue;

    while (queue.length > 0) {
      const lot = queue.shift()!;
      closedPositions.push(handleExpiration(lot, key.expiry!));
    }
    queues.set(keyStr, queue);
  }
}
