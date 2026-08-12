import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isLikelyIbkrStatement, parseIbkrStatement } from "@/lib/ibkr-parser";
import { runFifoWithCorporateActions } from "@/lib/fifo-engine";
import { buildForm1325Rows } from "@/lib/forms/form-1325";
import { buildDividendRows, buildForm1322Summary, buildWithholdingTaxRows } from "@/lib/forms/form-1322";
import type { RateMap } from "@/lib/exchange-rate/types";

const FIXTURE_PATH = path.join(process.cwd(), "__tests__", "fixtures", "sample-ibkr-statement.csv");

describe("end-to-end: sample IBKR statement -> 1325/1322", () => {
  const csvText = fs.readFileSync(FIXTURE_PATH, "utf-8");

  it("is recognized as a plausible IBKR Activity Statement", () => {
    expect(isLikelyIbkrStatement(csvText)).toBe(true);
  });

  it("parses trades, dividends, withholding tax, and interest", () => {
    const parsed = parseIbkrStatement(csvText, "sample-ibkr-statement.csv");
    expect(parsed.trades).toHaveLength(5);
    expect(parsed.dividends).toHaveLength(1);
    expect(parsed.withholdingTax).toHaveLength(1);
    expect(parsed.interest).toHaveLength(1);
  });

  it("runs FIFO + expiration handling and produces the expected closed positions", () => {
    const parsed = parseIbkrStatement(csvText, "sample-ibkr-statement.csv");
    const { closedPositions } = runFifoWithCorporateActions(parsed.trades, parsed.corporateActions, "2025-12-31");

    expect(closedPositions).toHaveLength(3);

    const aaplStock = closedPositions.find((p) => p.instrumentKey.symbol === "AAPL" && p.instrumentKey.assetCategory === "STK");
    expect(aaplStock?.side).toBe("LONG");
    expect(aaplStock?.gainUsd).toBeCloseTo(2998, 2);

    const tsla = closedPositions.find((p) => p.instrumentKey.symbol === "TSLA");
    expect(tsla?.side).toBe("SHORT");
    expect(tsla?.gainUsd).toBeCloseTo(998, 2);

    const option = closedPositions.find((p) => p.instrumentKey.assetCategory === "OPT");
    expect(option?.closeReason).toBe("EXPIRED_WORTHLESS");
    expect(option?.gainUsd).toBeCloseTo(-250.65, 2);
  });

  it("builds 1325 rows and a 1322 summary in ILS using a flat mock rate", () => {
    const parsed = parseIbkrStatement(csvText, "sample-ibkr-statement.csv");
    const { closedPositions } = runFifoWithCorporateActions(parsed.trades, parsed.corporateActions, "2025-12-31");

    // Flat 3.70 USD/ILS rate for every date in 2025, so ILS totals scale predictably for the assertion.
    const rateMap: RateMap = {};
    for (let month = 1; month <= 12; month++) {
      for (let day = 1; day <= 28; day++) {
        const mm = String(month).padStart(2, "0");
        const dd = String(day).padStart(2, "0");
        rateMap[`2025-${mm}-${dd}`] = 3.7;
      }
    }

    const form1325Rows = buildForm1325Rows(closedPositions, rateMap);
    expect(form1325Rows).toHaveLength(3);
    // Sorted chronologically by sell date: TSLA cover (2025-03-01) is not the sell date for the short -
    // the short's "sell" date is the opening short-sale (2025-02-01), which comes before the option's
    // expiration (2025-09-15) and the AAPL stock sale (2025-06-15).
    expect(form1325Rows[0].sellDate).toBe("2025-02-01");
    expect(form1325Rows[1].sellDate).toBe("2025-06-15");
    expect(form1325Rows[2].sellDate).toBe("2025-09-15");

    const dividendRows = buildDividendRows(parsed.dividends, rateMap);
    const withholdingRows = buildWithholdingTaxRows(parsed.withholdingTax, rateMap);
    const summary = buildForm1322Summary(2025, form1325Rows, dividendRows, [], withholdingRows);

    expect(summary.totalDividendsILS).toBeCloseTo(24 * 3.7, 2);
    expect(summary.totalForeignTaxWithheldILS).toBeCloseTo(3.6 * 3.7, 2);
    expect(summary.netCapitalResultILS).toBeCloseTo((2998 + 998 - 250.65) * 3.7, 1);
  });
});
