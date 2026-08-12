import { describe, expect, it } from "vitest";
import { splitIntoSections } from "@/lib/ibkr-parser/section-splitter";
import { parseIbkrNumber } from "@/lib/ibkr-parser/field-mappers";
import { parseIbkrStatement } from "@/lib/ibkr-parser";

describe("splitIntoSections", () => {
  it("splits rows into sections keyed by section name, ignoring Total/SubTotal rows", () => {
    const csv = [
      "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,Comm/Fee,Basis,TransactionID",
      'Trades,Data,Trade,Stocks,USD,AAPL,"2025-03-14, 09:31:02",100,150.25,-1.5,15025,1001',
      "Trades,SubTotal,,,,,,,,,,",
      "Trades,Total,,,,,,,,,,",
      "Dividends,Header,Currency,Date,Symbol,Description,Amount",
      "Dividends,Data,USD,2025-06-01,AAPL,AAPL(US1234) Cash Dividend,12.50",
    ].join("\n");

    const sections = splitIntoSections(csv);

    expect(sections["Trades"]).toHaveLength(1);
    expect(sections["Trades"][0]["Symbol"]).toBe("AAPL");
    expect(sections["Trades"][0]["TransactionID"]).toBe("1001");
    expect(sections["Dividends"]).toHaveLength(1);
    expect(sections["Dividends"][0]["Amount"]).toBe("12.50");
  });

  it("does not lose earlier rows when a section's header repeats with a different shape (Commission Details quirk)", () => {
    const csv = [
      "Commission Details,Header,Asset Category,Symbol,Total Commission",
      "Commission Details,Data,Stocks,AAPL,-1.50",
      "Commission Details,Data,Stocks,MSFT,-2.00",
      "Commission Details,Header,Asset Category,Symbol,Underlying,Total Commission",
      "Commission Details,Data,Equity and Index Options,AAPL 15SEP26 200 C,AAPL,-0.65",
    ].join("\n");

    const sections = splitIntoSections(csv);
    const rows = sections["Commission Details"];

    expect(rows).toHaveLength(3);
    // First block's rows keep their original (shorter) header shape.
    expect(rows[0]["Symbol"]).toBe("AAPL");
    expect(rows[0]["Underlying"]).toBeUndefined();
    // Second block's row uses the new header shape without corrupting the earlier rows.
    expect(rows[2]["Underlying"]).toBe("AAPL");
    expect(rows[2]["Symbol"]).toBe("AAPL 15SEP26 200 C");
  });
});

describe("parseIbkrNumber", () => {
  it("strips thousands-separator commas before parsing", () => {
    expect(parseIbkrNumber("1,234.56")).toBeCloseTo(1234.56);
    expect(parseIbkrNumber("-2,500")).toBe(-2500);
    expect(parseIbkrNumber("")).toBe(0);
    expect(parseIbkrNumber(undefined)).toBe(0);
  });
});

describe("parseIbkrStatement header-name aliasing", () => {
  it("maps 'Date/Time' and 'TradeDate' header variants to the same tradeDate field", () => {
    const withDateTime = [
      "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,Comm/Fee,Basis,TransactionID",
      'Trades,Data,Trade,Stocks,USD,AAPL,"2025-03-14, 09:31:02",100,150.25,-1.5,15025,1001',
    ].join("\n");
    const withTradeDate = [
      "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,TradeDate,Quantity,T. Price,Comm/Fee,Basis,TransactionID",
      "Trades,Data,Trade,Stocks,USD,AAPL,2025-03-14,100,150.25,-1.5,15025,1002",
    ].join("\n");

    const a = parseIbkrStatement(withDateTime, "a.csv");
    const b = parseIbkrStatement(withTradeDate, "b.csv");

    expect(a.trades[0].tradeDate).toBe("2025-03-14");
    expect(b.trades[0].tradeDate).toBe("2025-03-14");
  });

  it("collects unrecognized sections instead of throwing", () => {
    const csv = [
      "FutureFeature,Header,Foo,Bar",
      "FutureFeature,Data,1,2",
      "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,Comm/Fee,Basis,TransactionID",
      'Trades,Data,Trade,Stocks,USD,AAPL,"2025-03-14, 09:31:02",100,150.25,-1.5,15025,1001',
    ].join("\n");

    const result = parseIbkrStatement(csv, "c.csv");

    expect(result.trades).toHaveLength(1);
    expect(result.unknownSections["FutureFeature"]).toHaveLength(1);
    expect(result.unknownSections["FutureFeature"][0]["Foo"]).toBe("1");
  });
});
