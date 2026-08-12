import type { RawCorporateActionRow, RawTradeRow } from "../ibkr-parser/types";
import { flattenOpenLots, runFifo } from "./lot-matcher";
import { runCorporateActionsPass } from "./options";
import type { ClosedPositionResult, OpenLot } from "./types";

export * from "./types";
export { applyTradeToQueues, flattenOpenLots, perUnitCost, perUnitProceeds, runFifo } from "./lot-matcher";
export * from "./options";

export interface FifoRunResult {
  closedPositions: ClosedPositionResult[];
  openLots: OpenLot[];
}

/**
 * Full matching pipeline: plain FIFO over ordinary trades, then a
 * corporate-actions pass that resolves option exercise/assignment (folding
 * premium into the resulting stock position's cost basis) and expires any
 * option lots still open past their expiry date with no closing trade.
 *
 * @param asOfDate ISO date used as the expiration-sweep cutoff — pass the
 * statement year's Dec 31 for a completed tax year, or today's date for a
 * mid-year run.
 */
export function runFifoWithCorporateActions(
  trades: RawTradeRow[],
  corporateActions: RawCorporateActionRow[],
  asOfDate: string
): FifoRunResult {
  const { closedPositions, queues } = runFifo(trades);
  runCorporateActionsPass(queues, corporateActions, closedPositions, asOfDate);
  return { closedPositions, openLots: flattenOpenLots(queues) };
}
