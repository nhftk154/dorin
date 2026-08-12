import { mergeStatements } from "@/lib/ibkr-parser";
import type { ParsedStatement } from "@/lib/ibkr-parser/types";
import type { RateOverride } from "@/lib/exchange-rate/types";
import { db, type StoredResult, type StoredTransaction } from "./db";

/** Persists one parsed statement (one uploaded file) and upserts its trades into the deduped transactions table. */
export async function saveStatement(parsed: ParsedStatement, sourceFile: string): Promise<void> {
  await db.statements.add({
    sourceFile,
    uploadedAt: new Date().toISOString(),
    trades: parsed.trades,
    dividends: parsed.dividends,
    withholdingTax: parsed.withholdingTax,
    interest: parsed.interest,
    corporateActions: parsed.corporateActions,
  });

  const existing = await db.transactions.bulkGet(parsed.trades.map((t) => t.transactionId));
  const excludedById = new Map(existing.filter((t): t is StoredTransaction => !!t).map((t) => [t.transactionId, t.excluded]));

  await db.transactions.bulkPut(
    parsed.trades.map((t) => ({ ...t, excluded: excludedById.get(t.transactionId) ?? false }))
  );
}

export async function getAllStatements() {
  return db.statements.toArray();
}

export async function deleteStatement(id: number): Promise<void> {
  await db.statements.delete(id);
}

export async function getAllTransactions(): Promise<StoredTransaction[]> {
  return db.transactions.toArray();
}

export async function setTransactionExcluded(transactionId: string, excluded: boolean): Promise<void> {
  await db.transactions.update(transactionId, { excluded });
}

/**
 * Reconstructs the merged, deduped view of everything uploaded so far:
 * trades come from the transactions table (already deduped by
 * TransactionID via bulkPut, and filtered by the user's exclude toggle);
 * dividends/interest/withholding-tax/corporate-actions have no natural
 * unique key, so they're deduped here via the same composite-key logic
 * used when merging files at parse time.
 */
export async function getMergedData(): Promise<
  Omit<ParsedStatement, "trades" | "closedLots" | "unknownSections" | "warnings"> & { trades: StoredTransaction[] }
> {
  const [statements, transactions] = await Promise.all([db.statements.toArray(), db.transactions.toArray()]);

  const mergedNonTrades = mergeStatements(
    statements.map((s) => ({
      trades: [],
      closedLots: [],
      dividends: s.dividends,
      withholdingTax: s.withholdingTax,
      interest: s.interest,
      corporateActions: s.corporateActions,
      unknownSections: {},
      warnings: [],
    }))
  );

  return {
    trades: transactions.filter((t) => !t.excluded),
    dividends: mergedNonTrades.dividends,
    withholdingTax: mergedNonTrades.withholdingTax,
    interest: mergedNonTrades.interest,
    corporateActions: mergedNonTrades.corporateActions,
  };
}

export async function saveResult(result: StoredResult): Promise<void> {
  await db.results.put(result);
}

export async function getResult(taxYear: number): Promise<StoredResult | undefined> {
  return db.results.get(taxYear);
}

export async function clearResults(): Promise<void> {
  await db.results.clear();
}

export async function getRateOverrides(): Promise<RateOverride[]> {
  const rows = await db.rateOverrides.toArray();
  return rows.map(({ date, currency, rate, note }) => ({ date, currency, rate, note }));
}

export async function addRateOverride(override: RateOverride): Promise<void> {
  await db.rateOverrides.add(override);
}

export async function deleteRateOverride(id: number): Promise<void> {
  await db.rateOverrides.delete(id);
}

/** Wipes all uploaded statements, transactions, and cached results (rate overrides are kept, since they're not statement-specific). */
export async function clearAllStatementData(): Promise<void> {
  await db.transaction("rw", db.statements, db.transactions, db.results, async () => {
    await db.statements.clear();
    await db.transactions.clear();
    await db.results.clear();
  });
}
