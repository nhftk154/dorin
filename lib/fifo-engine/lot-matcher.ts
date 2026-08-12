import type { RawTradeRow } from "../ibkr-parser/types";
import {
  instrumentKeyOf,
  instrumentKeyToString,
  type ClosedPositionResult,
  type CloseReason,
  type InstrumentKey,
  type OpenLot,
  type Side,
  type TradeForMatching,
} from "./types";

/** Per-unit cost to acquire (buy) — gross value plus commission (commission increases cost basis). */
export function perUnitCost(trade: TradeForMatching): number {
  const multiplier = trade.multiplier ?? 1;
  const gross = Math.abs(trade.quantity) * trade.price * multiplier;
  const commission = Math.abs(trade.commFee);
  return (gross + commission) / Math.abs(trade.quantity);
}

/** Per-unit proceeds from disposing (sell) — gross value minus commission (commission reduces proceeds). */
export function perUnitProceeds(trade: TradeForMatching): number {
  const multiplier = trade.multiplier ?? 1;
  const gross = Math.abs(trade.quantity) * trade.price * multiplier;
  const commission = Math.abs(trade.commFee);
  return (gross - commission) / Math.abs(trade.quantity);
}

export type QueueMap = Map<string, OpenLot[]>;

/**
 * Applies a single trade to the FIFO queue for its instrument.
 *
 * - If the queue is empty, or the trade continues the queue's current
 *   direction (another buy while long, another sell while short), it opens
 *   a new lot.
 * - Otherwise the trade closes lots FIFO (oldest first) against the queue,
 *   emitting one ClosedPositionResult per matched lot (a single trade can
 *   close several lots, or partially close one).
 * - If the trade's quantity exceeds the queue's total depth, the leftover
 *   flips into a new lot on the opposite side (e.g. selling more shares
 *   than currently held opens a short position for the remainder).
 */
export function applyTradeToQueues(
  queues: QueueMap,
  instrumentKey: InstrumentKey,
  trade: TradeForMatching,
  closedPositions: ClosedPositionResult[],
  closeReason: CloseReason = "SALE"
): void {
  if (trade.quantity === 0) return;
  const keyStr = instrumentKeyToString(instrumentKey);
  const queue = queues.get(keyStr) ?? [];
  const tradeSide: Side = trade.quantity > 0 ? "LONG" : "SHORT";
  const queueSide = queue[0]?.side;
  const sameDirection = !queueSide || queueSide === tradeSide;

  if (sameDirection) {
    queue.push({
      instrumentKey,
      openDate: trade.tradeDate,
      quantity: Math.abs(trade.quantity),
      side: tradeSide,
      unitOpenValueUsd: tradeSide === "LONG" ? perUnitCost(trade) : perUnitProceeds(trade),
      originTransactionId: trade.transactionId,
    });
    queues.set(keyStr, queue);
    return;
  }

  let remaining = Math.abs(trade.quantity);
  while (remaining > 0 && queue.length > 0) {
    const lot = queue[0];
    const matched = Math.min(lot.quantity, remaining);
    const closeValuePerUnit = lot.side === "LONG" ? perUnitProceeds(trade) : perUnitCost(trade);
    const gainUsd =
      lot.side === "LONG"
        ? (closeValuePerUnit - lot.unitOpenValueUsd) * matched
        : (lot.unitOpenValueUsd - closeValuePerUnit) * matched;

    closedPositions.push({
      instrumentKey,
      side: lot.side,
      quantity: matched,
      openDate: lot.openDate,
      closeDate: trade.tradeDate,
      openValuePerUnitUsd: lot.unitOpenValueUsd,
      closeValuePerUnitUsd: closeValuePerUnit,
      gainUsd,
      closeReason,
      originTransactionIds: { open: lot.originTransactionId, close: trade.transactionId },
    });

    lot.quantity -= matched;
    remaining -= matched;
    if (lot.quantity === 0) queue.shift();
  }

  if (remaining > 0) {
    queue.push({
      instrumentKey,
      openDate: trade.tradeDate,
      quantity: remaining,
      side: tradeSide,
      unitOpenValueUsd: tradeSide === "LONG" ? perUnitCost(trade) : perUnitProceeds(trade),
      originTransactionId: trade.transactionId,
    });
  }

  queues.set(keyStr, queue);
}

/** Runs plain FIFO matching over a set of trades (no options exercise/assignment/expiration handling — see index.ts for the full pipeline). */
export function runFifo(trades: RawTradeRow[]): { closedPositions: ClosedPositionResult[]; queues: QueueMap } {
  const sorted = [...trades].sort((a, b) => {
    if (a.tradeDate !== b.tradeDate) return a.tradeDate < b.tradeDate ? -1 : 1;
    return a.dateTime.localeCompare(b.dateTime);
  });

  const queues: QueueMap = new Map();
  const closedPositions: ClosedPositionResult[] = [];

  for (const trade of sorted) {
    const key = instrumentKeyOf(trade);
    applyTradeToQueues(queues, key, trade, closedPositions);
  }

  return { closedPositions, queues };
}

export function flattenOpenLots(queues: QueueMap): OpenLot[] {
  return [...queues.values()].flat();
}
