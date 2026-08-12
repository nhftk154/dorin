import { splitIntoSections } from "./section-splitter";
import {
  mapCorporateActionsSection,
  mapDividendsSection,
  mapInterestSection,
  mapTradesSection,
  mapWithholdingTaxSection,
} from "./field-mappers";
import type { ParsedStatement, SectionTable } from "./types";

export * from "./types";
export { parseIbkrNumber } from "./field-mappers";
export { splitIntoSections } from "./section-splitter";

/** Section names this parser understands, and their accepted aliases (locale/version variants). */
const KNOWN_SECTIONS: Record<string, string[]> = {
  trades: ["Trades"],
  dividends: ["Dividends"],
  withholdingTax: ["Withholding Tax"],
  interest: ["Interest"],
  corporateActions: ["Corporate Actions", "Option Exercises, Assignments, Expirations"],
};

function findSection(sections: SectionTable, aliases: string[]): Record<string, string>[] {
  for (const alias of aliases) {
    if (sections[alias]) return sections[alias];
  }
  return [];
}

/**
 * A statement is considered a plausible IBKR Activity Statement if the raw
 * text contains at least one recognizable section's Header row. Used by the
 * upload screen to reject obviously-wrong files before attempting a full parse.
 */
export function isLikelyIbkrStatement(csvText: string): boolean {
  const allAliases = Object.values(KNOWN_SECTIONS).flat();
  return allAliases.some((name) => csvText.includes(`${name},Header,`));
}

export function parseIbkrStatement(csvText: string, sourceFile: string): ParsedStatement {
  const sections = splitIntoSections(csvText);
  const warnings: string[] = [];

  const { trades, closedLots } = mapTradesSection(findSection(sections, KNOWN_SECTIONS.trades), sourceFile);
  const dividends = mapDividendsSection(findSection(sections, KNOWN_SECTIONS.dividends), sourceFile);
  const withholdingTax = mapWithholdingTaxSection(findSection(sections, KNOWN_SECTIONS.withholdingTax), sourceFile);
  const interest = mapInterestSection(findSection(sections, KNOWN_SECTIONS.interest), sourceFile);
  const corporateActions = mapCorporateActionsSection(
    findSection(sections, KNOWN_SECTIONS.corporateActions),
    sourceFile
  );

  const knownSectionNames = new Set(Object.values(KNOWN_SECTIONS).flat());
  const unknownSections: Record<string, Record<string, string>[]> = {};
  for (const [name, rows] of Object.entries(sections)) {
    if (!knownSectionNames.has(name) && rows.length > 0) {
      unknownSections[name] = rows;
    }
  }
  if (Object.keys(unknownSections).length > 0) {
    warnings.push(
      `Unrecognized sections encountered and kept for reference: ${Object.keys(unknownSections).join(", ")}`
    );
  }
  if (trades.length === 0 && Object.keys(sections).length === 0) {
    warnings.push(`File "${sourceFile}" did not look like an IBKR Activity Statement (no sections found).`);
  }

  return { trades, closedLots, dividends, withholdingTax, interest, corporateActions, unknownSections, warnings };
}

/**
 * Merges multiple parsed statements (e.g. two half-year exports covering one
 * tax year) into one, deduplicating trades by IBKR's stable TransactionID and
 * deduplicating dividends/interest/withholding rows (which have no unique id
 * column) by a composite key.
 */
export function mergeStatements(statements: ParsedStatement[]): ParsedStatement & { duplicatesDropped: number } {
  let duplicatesDropped = 0;

  const seenTradeIds = new Set<string>();
  const trades = statements
    .flatMap((s) => s.trades)
    .filter((t) => {
      if (seenTradeIds.has(t.transactionId)) {
        duplicatesDropped++;
        return false;
      }
      seenTradeIds.add(t.transactionId);
      return true;
    });

  const dedupeByCompositeKey = <T extends { raw: Record<string, string> }>(
    rows: T[],
    keyOf: (row: T) => string
  ): T[] => {
    const seen = new Set<string>();
    const result: T[] = [];
    for (const row of rows) {
      const key = keyOf(row);
      if (seen.has(key)) {
        duplicatesDropped++;
        continue;
      }
      seen.add(key);
      result.push(row);
    }
    return result;
  };

  const dividends = dedupeByCompositeKey(
    statements.flatMap((s) => s.dividends),
    (d) => `${d.date}|${d.symbol}|${d.amount}|${d.description}`
  );
  const withholdingTax = dedupeByCompositeKey(
    statements.flatMap((s) => s.withholdingTax),
    (w) => `${w.date}|${w.symbol}|${w.amount}`
  );
  const interest = dedupeByCompositeKey(
    statements.flatMap((s) => s.interest),
    (i) => `${i.date}|${i.amount}|${i.description}`
  );

  const closedLots = statements.flatMap((s) => s.closedLots);
  const corporateActions = statements.flatMap((s) => s.corporateActions);
  const warnings = statements.flatMap((s) => s.warnings);
  const unknownSections: Record<string, Record<string, string>[]> = {};
  for (const s of statements) {
    for (const [name, rows] of Object.entries(s.unknownSections)) {
      unknownSections[name] = [...(unknownSections[name] ?? []), ...rows];
    }
  }

  return {
    trades,
    closedLots,
    dividends,
    withholdingTax,
    interest,
    corporateActions,
    unknownSections,
    warnings,
    duplicatesDropped,
  };
}
