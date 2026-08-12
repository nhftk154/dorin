export type AssetCategory = "STK" | "OPT" | "CASH" | "FUT" | "BOND" | string;
export type PutCall = "P" | "C" | null;
export type Side = "LONG" | "SHORT";

/** One execution row from the "Trades" section (DataDiscriminator === "Trade"). */
export interface RawTradeRow {
  transactionId: string;
  assetCategory: AssetCategory;
  currency: string;
  symbol: string;
  underlyingSymbol?: string;
  /** Raw "Date/Time" cell as exported by IBKR. */
  dateTime: string;
  /** ISO yyyy-mm-dd, derived from dateTime. */
  tradeDate: string;
  /** Signed: positive = buy, negative = sell. */
  quantity: number;
  /** "T. Price" — per-share/per-unit price, not multiplied by option multiplier. */
  price: number;
  proceeds?: number;
  /** "Comm/Fee" — negative denotes a cost. */
  commFee: number;
  basis?: number;
  code: string[];
  multiplier?: number;
  strike?: number;
  expiry?: string;
  putCall?: PutCall;
  openCloseIndicator?: "O" | "C" | null;
  raw: Record<string, string>;
  sourceFile: string;
  excluded?: boolean;
}

export interface RawClosedLotRow {
  parentTradeTransactionId: string;
  symbol: string;
  quantity: number;
  basis: number;
  tradeDate: string;
  raw: Record<string, string>;
  sourceFile: string;
}

export interface RawDividendRow {
  symbol: string;
  currency: string;
  date: string;
  amount: number;
  description: string;
  raw: Record<string, string>;
  sourceFile: string;
}

export interface RawWithholdingTaxRow {
  symbol: string;
  currency: string;
  date: string;
  /** Negative — amount withheld. */
  amount: number;
  raw: Record<string, string>;
  sourceFile: string;
}

export interface RawInterestRow {
  currency: string;
  date: string;
  amount: number;
  description: string;
  raw: Record<string, string>;
  sourceFile: string;
}

export interface RawCorporateActionRow {
  symbol: string;
  underlyingSymbol?: string;
  date: string;
  actionType: string;
  description: string;
  /** Number of contracts/shares affected, when the statement provides one explicitly. */
  quantity?: number;
  raw: Record<string, string>;
  sourceFile: string;
}

export interface ParsedStatement {
  trades: RawTradeRow[];
  closedLots: RawClosedLotRow[];
  dividends: RawDividendRow[];
  withholdingTax: RawWithholdingTaxRow[];
  interest: RawInterestRow[];
  corporateActions: RawCorporateActionRow[];
  unknownSections: Record<string, Record<string, string>[]>;
  warnings: string[];
}

/** Generic intermediate representation: section name -> list of {header -> value} rows. */
export type SectionTable = Record<string, Record<string, string>[]>;
