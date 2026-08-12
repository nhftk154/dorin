import type { AssetCategory, PutCall } from "../ibkr-parser/types";

export type Side = "LONG" | "SHORT";
export type CloseReason = "SALE" | "EXPIRED_WORTHLESS" | "EXERCISED" | "ASSIGNED";

/** Uniquely identifies a fungible position for FIFO purposes. Each option leg (distinct strike/expiry/right) is its own instrument. */
export interface InstrumentKey {
  symbol: string;
  assetCategory: AssetCategory;
  strike?: number;
  expiry?: string;
  putCall?: PutCall;
}

/** Minimal trade shape the matching engine needs — satisfied by both real IBKR trade rows and synthetic trades generated from option exercise/assignment. */
export interface TradeForMatching {
  transactionId: string;
  tradeDate: string;
  dateTime: string;
  /** Signed: positive = buy, negative = sell. */
  quantity: number;
  /** Per-unit price, before multiplier is applied. */
  price: number;
  /** Signed, typically negative (a cost). */
  commFee: number;
  /** Contract multiplier (e.g. 100 for standard equity options); defaults to 1. */
  multiplier?: number;
}

export interface OpenLot {
  instrumentKey: InstrumentKey;
  openDate: string;
  /** Remaining quantity, always positive. */
  quantity: number;
  side: Side;
  /** Cost per unit (LONG) or short-sale proceeds per unit (SHORT), commission-adjusted. */
  unitOpenValueUsd: number;
  originTransactionId: string;
}

/**
 * Result of matching one sell against one (or part of one) buy lot, in USD
 * only — currency conversion to ILS happens downstream in lib/forms, kept
 * separate so this engine can be tested without exchange-rate data.
 *
 * For a SHORT position, `openDate`/`openValuePerUnitUsd` describe the
 * opening short-sale and `closeDate`/`closeValuePerUnitUsd` describe the
 * later buy-to-cover — callers that need "buy date"/"sell date" columns
 * (e.g. the 1325 export) must map these based on `side`.
 */
export interface ClosedPositionResult {
  instrumentKey: InstrumentKey;
  side: Side;
  quantity: number;
  openDate: string;
  closeDate: string;
  openValuePerUnitUsd: number;
  /** Sale proceeds per unit (LONG close) or buy-to-cover cost per unit (SHORT close), commission-adjusted. Always 0 for EXPIRED_WORTHLESS. */
  closeValuePerUnitUsd: number;
  /** Signed: positive = gain, negative = loss. */
  gainUsd: number;
  closeReason: CloseReason;
  originTransactionIds: { open: string; close: string };
}

export function instrumentKeyOf(trade: {
  symbol: string;
  assetCategory: AssetCategory;
  strike?: number;
  expiry?: string;
  putCall?: PutCall | null;
}): InstrumentKey {
  if (trade.assetCategory === "OPT") {
    return {
      symbol: trade.symbol,
      assetCategory: trade.assetCategory,
      strike: trade.strike,
      expiry: trade.expiry,
      putCall: trade.putCall ?? null,
    };
  }
  return { symbol: trade.symbol, assetCategory: trade.assetCategory };
}

export function instrumentKeyToString(key: InstrumentKey): string {
  return [key.symbol, key.assetCategory, key.strike ?? "", key.expiry ?? "", key.putCall ?? ""].join("|");
}
