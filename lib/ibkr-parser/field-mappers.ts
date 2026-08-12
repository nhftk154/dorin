import type {
  AssetCategory,
  PutCall,
  RawClosedLotRow,
  RawCorporateActionRow,
  RawDividendRow,
  RawInterestRow,
  RawTradeRow,
  RawWithholdingTaxRow,
} from "./types";

/** Reads the first non-empty cell among a list of possible header-name aliases for a field. */
function pick(row: Record<string, string>, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== "") return row[alias];
  }
  return undefined;
}

/** IBKR numeric cells use thousands-separator commas (e.g. "1,234.56"); strip before parsing. */
export function parseIbkrNumber(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 0;
  const cleaned = raw.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toIsoDate(raw: string | undefined): string {
  if (!raw) return "";
  // Common IBKR shapes: "2025-03-14, 09:31:02", "2025-03-14", "20250314", "2025/03/14"
  const datePart = raw.split(",")[0].trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  if (/^\d{8}$/.test(datePart)) {
    return `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}`;
  }
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(datePart)) return datePart.replace(/\//g, "-");
  return datePart;
}

/**
 * IBKR's "Asset Category" column is human-readable text ("Stocks", "Equity
 * and Index Options", "Forex", ...), not a short code — normalize it to the
 * internal codes the rest of the app switches on, so option-specific
 * parsing (strike/expiry/multiplier) actually triggers. Falls back to the
 * raw trimmed value for anything unrecognized rather than dropping it.
 */
function normalizeAssetCategory(raw: string): AssetCategory {
  const v = raw.trim().toLowerCase();
  if (v.includes("option")) return "OPT";
  if (v === "stocks" || v === "equities" || v === "stk" || v === "etfs") return "STK";
  if (v.includes("bond")) return "BOND";
  if (v.includes("future")) return "FUT";
  if (v.includes("forex") || v.includes("cash")) return "CASH";
  return raw.trim();
}

function parsePutCall(rawField: string | undefined, symbol: string): PutCall {
  const v = (rawField ?? "").trim().toUpperCase();
  if (v === "P" || v === "PUT") return "P";
  if (v === "C" || v === "CALL") return "C";
  // Fall back to scanning an option symbol string like "AAPL 15SEP26 200 C"
  const match = symbol.match(/\s(P|C)$/i);
  if (match) return match[1].toUpperCase() as PutCall;
  return null;
}

const TRADE_ALIASES = {
  discriminator: ["DataDiscriminator"],
  transactionId: ["TransactionID", "TradeID", "IBOrderID"],
  assetCategory: ["AssetCategory", "Asset Category"],
  currency: ["Currency"],
  symbol: ["Symbol"],
  underlyingSymbol: ["UnderlyingSymbol"],
  dateTime: ["Date/Time", "TradeDate", "DateTime", "Date"],
  quantity: ["Quantity"],
  price: ["T. Price", "TradePrice", "Trade Price"],
  proceeds: ["Proceeds"],
  commFee: ["Comm/Fee", "Commission", "IBCommission"],
  basis: ["Basis"],
  code: ["Code", "Codes"],
  multiplier: ["Multiplier"],
  strike: ["Strike"],
  expiry: ["Expiry", "Expiration"],
  putCall: ["Put/Call"],
  openClose: ["Open/CloseIndicator", "O/C"],
};

export function mapTradesSection(
  rows: Record<string, string>[],
  sourceFile: string
): { trades: RawTradeRow[]; closedLots: RawClosedLotRow[] } {
  const trades: RawTradeRow[] = [];
  const closedLots: RawClosedLotRow[] = [];

  for (const row of rows) {
    const discriminator = pick(row, TRADE_ALIASES.discriminator) ?? "Trade";
    const symbol = pick(row, TRADE_ALIASES.symbol) ?? "";
    const dateTimeRaw = pick(row, TRADE_ALIASES.dateTime) ?? "";
    const tradeDate = toIsoDate(dateTimeRaw);

    if (discriminator === "ClosedLot") {
      closedLots.push({
        parentTradeTransactionId: pick(row, TRADE_ALIASES.transactionId) ?? "",
        symbol,
        quantity: parseIbkrNumber(pick(row, TRADE_ALIASES.quantity)),
        basis: parseIbkrNumber(pick(row, TRADE_ALIASES.basis)),
        tradeDate,
        raw: row,
        sourceFile,
      });
      continue;
    }

    if (discriminator !== "Trade" && discriminator !== "Order") continue;

    const transactionId = pick(row, TRADE_ALIASES.transactionId);
    if (!transactionId) continue; // can't dedupe/track without a stable id - skip defensively

    const assetCategory = normalizeAssetCategory(pick(row, TRADE_ALIASES.assetCategory) ?? "");
    const isOption = assetCategory === "OPT";
    const codeRaw = pick(row, TRADE_ALIASES.code) ?? "";
    const proceedsRaw = pick(row, TRADE_ALIASES.proceeds);
    const basisRaw = pick(row, TRADE_ALIASES.basis);

    trades.push({
      transactionId,
      assetCategory,
      currency: pick(row, TRADE_ALIASES.currency) ?? "",
      symbol,
      underlyingSymbol: pick(row, TRADE_ALIASES.underlyingSymbol),
      dateTime: dateTimeRaw,
      tradeDate,
      quantity: parseIbkrNumber(pick(row, TRADE_ALIASES.quantity)),
      price: parseIbkrNumber(pick(row, TRADE_ALIASES.price)),
      proceeds: proceedsRaw !== undefined ? parseIbkrNumber(proceedsRaw) : undefined,
      commFee: parseIbkrNumber(pick(row, TRADE_ALIASES.commFee)),
      basis: basisRaw !== undefined ? parseIbkrNumber(basisRaw) : undefined,
      code: codeRaw ? codeRaw.split(/[;,]+/).map((c) => c.trim()).filter(Boolean) : [],
      multiplier: isOption ? parseIbkrNumber(pick(row, TRADE_ALIASES.multiplier)) || 100 : undefined,
      strike: isOption ? parseIbkrNumber(pick(row, TRADE_ALIASES.strike)) : undefined,
      expiry: isOption ? toIsoDate(pick(row, TRADE_ALIASES.expiry)) : undefined,
      putCall: isOption ? parsePutCall(pick(row, TRADE_ALIASES.putCall), symbol) : null,
      openCloseIndicator: (pick(row, TRADE_ALIASES.openClose) as "O" | "C" | undefined) ?? null,
      raw: row,
      sourceFile,
    });
  }

  return { trades, closedLots };
}

const DIVIDEND_ALIASES = {
  symbol: ["Symbol"],
  currency: ["Currency"],
  date: ["Date"],
  amount: ["Amount"],
  description: ["Description"],
};

export function mapDividendsSection(rows: Record<string, string>[], sourceFile: string): RawDividendRow[] {
  return rows
    .filter((row) => pick(row, DIVIDEND_ALIASES.description) !== undefined)
    .map((row) => ({
      symbol: pick(row, DIVIDEND_ALIASES.symbol) ?? "",
      currency: pick(row, DIVIDEND_ALIASES.currency) ?? "",
      date: toIsoDate(pick(row, DIVIDEND_ALIASES.date)),
      amount: parseIbkrNumber(pick(row, DIVIDEND_ALIASES.amount)),
      description: pick(row, DIVIDEND_ALIASES.description) ?? "",
      raw: row,
      sourceFile,
    }));
}

const WITHHOLDING_ALIASES = {
  symbol: ["Symbol"],
  currency: ["Currency"],
  date: ["Date"],
  amount: ["Amount"],
  description: ["Description"],
};

export function mapWithholdingTaxSection(
  rows: Record<string, string>[],
  sourceFile: string
): RawWithholdingTaxRow[] {
  return rows
    .filter((row) => pick(row, WITHHOLDING_ALIASES.description) !== undefined)
    .map((row) => ({
      symbol: pick(row, WITHHOLDING_ALIASES.symbol) ?? "",
      currency: pick(row, WITHHOLDING_ALIASES.currency) ?? "",
      date: toIsoDate(pick(row, WITHHOLDING_ALIASES.date)),
      amount: parseIbkrNumber(pick(row, WITHHOLDING_ALIASES.amount)),
      raw: row,
      sourceFile,
    }));
}

const INTEREST_ALIASES = {
  currency: ["Currency"],
  date: ["Date"],
  amount: ["Amount"],
  description: ["Description"],
};

export function mapInterestSection(rows: Record<string, string>[], sourceFile: string): RawInterestRow[] {
  return rows
    .filter((row) => pick(row, INTEREST_ALIASES.description) !== undefined)
    .map((row) => ({
      currency: pick(row, INTEREST_ALIASES.currency) ?? "",
      date: toIsoDate(pick(row, INTEREST_ALIASES.date)),
      amount: parseIbkrNumber(pick(row, INTEREST_ALIASES.amount)),
      description: pick(row, INTEREST_ALIASES.description) ?? "",
      raw: row,
      sourceFile,
    }));
}

const CORPORATE_ACTION_ALIASES = {
  symbol: ["Symbol"],
  underlyingSymbol: ["UnderlyingSymbol", "Underlying Symbol"],
  date: ["Date/Time", "Date"],
  actionType: ["Type", "ActionType"],
  description: ["Description"],
  quantity: ["Quantity"],
};

export function mapCorporateActionsSection(
  rows: Record<string, string>[],
  sourceFile: string
): RawCorporateActionRow[] {
  return rows.map((row) => {
    const description = pick(row, CORPORATE_ACTION_ALIASES.description) ?? "";
    const explicitType = pick(row, CORPORATE_ACTION_ALIASES.actionType);
    const quantityRaw = pick(row, CORPORATE_ACTION_ALIASES.quantity);
    return {
      symbol: pick(row, CORPORATE_ACTION_ALIASES.symbol) ?? "",
      underlyingSymbol: pick(row, CORPORATE_ACTION_ALIASES.underlyingSymbol),
      date: toIsoDate(pick(row, CORPORATE_ACTION_ALIASES.date)),
      actionType: explicitType ?? inferActionTypeFromDescription(description),
      description,
      quantity: quantityRaw !== undefined ? Math.abs(parseIbkrNumber(quantityRaw)) : undefined,
      raw: row,
      sourceFile,
    };
  });
}

function inferActionTypeFromDescription(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("expir")) return "Expiration";
  if (d.includes("assign")) return "Assignment";
  if (d.includes("exercis")) return "Exercise";
  if (d.includes("split")) return "Split";
  if (d.includes("merger")) return "Merger";
  return "Other";
}
