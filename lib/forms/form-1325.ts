import type { ClosedPositionResult } from "@/lib/fifo-engine/types";
import { resolveRateWithOverrides } from "@/lib/exchange-rate";
import type { RateMap, RateOverride } from "@/lib/exchange-rate/types";
import type { Form1325Row } from "./types";

const CURRENCY = "USD";

/**
 * Builds the Form 1325 detail table: one row per closed position (FIFO
 * match), in chronological sale order, with USD amounts converted to ILS
 * using the Bank of Israel representative rate on the relevant trade date.
 *
 * For a SHORT position the "buy" side is the later covering purchase and
 * the "sell" side is the original short sale — see ClosedPositionResult's
 * doc comment in lib/fifo-engine/types.ts.
 */
export function buildForm1325Rows(
  closedPositions: ClosedPositionResult[],
  rateMap: RateMap,
  overrides: RateOverride[] = []
): Form1325Row[] {
  const rows = closedPositions.map((position): Form1325Row => {
    const isLong = position.side === "LONG";
    const buyDate = isLong ? position.openDate : position.closeDate;
    const sellDate = isLong ? position.closeDate : position.openDate;
    const buyPriceUsd = isLong ? position.openValuePerUnitUsd : position.closeValuePerUnitUsd;
    const sellPriceUsd = isLong ? position.closeValuePerUnitUsd : position.openValuePerUnitUsd;

    const buyRate = resolveRateWithOverrides(buyDate, CURRENCY, rateMap, overrides);
    const sellRate = resolveRateWithOverrides(sellDate, CURRENCY, rateMap, overrides);

    const buyValueUsd = buyPriceUsd * position.quantity;
    const sellValueUsd = sellPriceUsd * position.quantity;
    const originalCostILS = buyValueUsd * buyRate.rate;
    const proceedsILS = sellValueUsd * sellRate.rate;
    const linkageRatio = buyRate.rate !== 0 ? sellRate.rate / buyRate.rate : 1;
    const adjustedCostILS = originalCostILS * linkageRatio;
    const netILS = proceedsILS - adjustedCostILS;

    return {
      securityId: position.instrumentKey.symbol,
      buyDate,
      sellDate,
      buyValueUsd,
      sellValueUsd,
      originalCostILS,
      buyRateILS: buyRate.rate,
      sellRateILS: sellRate.rate,
      linkageRatio,
      adjustedCostILS,
      proceedsILS,
      realGainILS: netILS > 0 ? netILS : 0,
      realLossILS: netILS < 0 ? -netILS : 0,
      acquiredBeforeListing: false,
      closeReason: position.closeReason,
    };
  });

  return rows.sort((a, b) => (a.sellDate < b.sellDate ? -1 : a.sellDate > b.sellDate ? 1 : 0));
}
