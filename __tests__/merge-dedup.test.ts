import { describe, expect, it } from "vitest";
import { mergeStatements, parseIbkrStatement } from "@/lib/ibkr-parser";

const TRADES_HEADER =
  "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,Comm/Fee,Basis,TransactionID";
const DIVIDENDS_HEADER = "Dividends,Header,Currency,Date,Symbol,Description,Amount";

function tradeRow(id: string, date: string, symbol = "AAPL") {
  return `Trades,Data,Trade,Stocks,USD,${symbol},"${date}, 09:31:02",100,150.25,-1.5,15025,${id}`;
}

describe("mergeStatements", () => {
  it("dedupes trades that appear in both half-year files by TransactionID, keeping exactly one", () => {
    // H1 export covers Jan-Jun and includes a boundary trade near the seam; H2 export (Jun-Dec) re-includes
    // that same boundary trade because IBKR's half-year cut doesn't align exactly with the account's own records.
    const h1 = [TRADES_HEADER, tradeRow("1001", "2025-01-15"), tradeRow("1002", "2025-06-30")].join("\n");
    const h2 = [TRADES_HEADER, tradeRow("1002", "2025-06-30"), tradeRow("1003", "2025-09-10")].join("\n");

    const parsedH1 = parseIbkrStatement(h1, "h1.csv");
    const parsedH2 = parseIbkrStatement(h2, "h2.csv");

    const merged = mergeStatements([parsedH1, parsedH2]);

    expect(merged.trades).toHaveLength(3);
    expect(merged.trades.map((t) => t.transactionId).sort()).toEqual(["1001", "1002", "1003"]);
    expect(merged.duplicatesDropped).toBe(1);
  });

  it("dedupes dividend rows lacking a unique id via a composite key, without merging genuinely different same-day dividends", () => {
    const h1 = [
      DIVIDENDS_HEADER,
      "Dividends,Data,USD,2025-06-01,AAPL,AAPL(US1234) Cash Dividend,12.50",
      "Dividends,Data,USD,2025-06-01,MSFT,MSFT(US5678) Cash Dividend,8.00",
    ].join("\n");
    const h2 = [
      DIVIDENDS_HEADER,
      // Same AAPL dividend re-appearing in the second export (overlapping boundary).
      "Dividends,Data,USD,2025-06-01,AAPL,AAPL(US1234) Cash Dividend,12.50",
      "Dividends,Data,USD,2025-09-01,AAPL,AAPL(US1234) Cash Dividend,13.00",
    ].join("\n");

    const parsedH1 = parseIbkrStatement(h1, "h1.csv");
    const parsedH2 = parseIbkrStatement(h2, "h2.csv");

    const merged = mergeStatements([parsedH1, parsedH2]);

    expect(merged.dividends).toHaveLength(3);
    const amounts = merged.dividends.map((d) => `${d.symbol}:${d.amount}`).sort();
    expect(amounts).toEqual(["AAPL:12.5", "AAPL:13", "MSFT:8"]);
  });
});
