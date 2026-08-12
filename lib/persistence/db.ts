import Dexie, { type Table } from "dexie";
import type {
  RawCorporateActionRow,
  RawDividendRow,
  RawInterestRow,
  RawTradeRow,
  RawWithholdingTaxRow,
} from "@/lib/ibkr-parser/types";
import type { ClosedPositionResult, OpenLot } from "@/lib/fifo-engine/types";
import type { RateOverride } from "@/lib/exchange-rate/types";

/**
 * IndexedDB schema (via Dexie). Browser-only — every uploaded statement and
 * computed result lives here and never leaves the machine. Only import this
 * module from client components; it will throw if constructed somewhere
 * without a browser `indexedDB` global (e.g. a server component).
 */

export interface StoredStatement {
  id?: number;
  sourceFile: string;
  uploadedAt: string;
  trades: RawTradeRow[];
  dividends: RawDividendRow[];
  withholdingTax: RawWithholdingTaxRow[];
  interest: RawInterestRow[];
  corporateActions: RawCorporateActionRow[];
}

export interface StoredTransaction extends RawTradeRow {
  excluded: boolean;
}

export interface StoredResult {
  taxYear: number;
  closedPositions: ClosedPositionResult[];
  openLots: OpenLot[];
  computedAt: string;
  /** Manual input — this app has no visibility into prior tax years' filings. */
  priorYearLossCarriedForwardILS: number;
}

export interface StoredRateOverride extends RateOverride {
  id?: number;
}

class AppDatabase extends Dexie {
  statements!: Table<StoredStatement, number>;
  /** Keyed by transactionId — re-uploading an overlapping statement naturally dedupes via bulkPut. */
  transactions!: Table<StoredTransaction, string>;
  /** Keyed by taxYear — a cached FIFO run, invalidated by the caller whenever inputs change. */
  results!: Table<StoredResult, number>;
  rateOverrides!: Table<StoredRateOverride, number>;

  constructor() {
    super("ibkr-tax-converter");
    this.version(1).stores({
      statements: "++id, sourceFile, uploadedAt",
      transactions: "transactionId, tradeDate, symbol, excluded",
      results: "taxYear",
      rateOverrides: "++id, date, currency, [date+currency]",
    });
  }
}

export const db = new AppDatabase();
