import { NextRequest, NextResponse } from "next/server";
import { ensureYearCached } from "@/lib/exchange-rate/server";

/**
 * GET /api/boi-rate?year=2025&currency=USD
 *
 * Server-side proxy for the Bank of Israel historical exchange-rate API
 * (avoids browser CORS, and caches results to data/boi-rate-cache.json so
 * the same year/currency is never fetched from BOI twice). Returns the raw
 * published rate map for the year — clients apply weekend/holiday fallback
 * and manual overrides themselves via lib/exchange-rate (resolveRateForDate).
 */
export async function GET(request: NextRequest) {
  const year = request.nextUrl.searchParams.get("year");
  const currency = request.nextUrl.searchParams.get("currency") ?? "USD";

  const parsedYear = Number(year);
  if (!year || !Number.isInteger(parsedYear) || parsedYear < 1990 || parsedYear > 2100) {
    return NextResponse.json({ error: "Missing or invalid 'year' query parameter." }, { status: 400 });
  }

  try {
    const rateMap = await ensureYearCached(currency, parsedYear);
    return NextResponse.json({ currency, year: parsedYear, rates: rateMap });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error fetching BOI exchange rates.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
