import Papa from "papaparse";
import type { SectionTable } from "./types";

const SKIP_DISCRIMINATORS = new Set(["Total", "SubTotal", "Notes"]);

/**
 * Splits IBKR's multi-section CSV (many logical tables concatenated in one
 * file, each row prefixed with its section name + a discriminator) into a
 * generic { sectionName -> rows-as-objects } table.
 *
 * Deliberately does NOT reset a section's accumulated rows when a new
 * "Header" row for that section appears — some sections (e.g. "Commission
 * Details") repeat their header once per asset-category sub-block within
 * the same file. Only the active header mapping is swapped; rows already
 * collected are kept, so a later sub-block's differently-shaped header can
 * never silently overwrite earlier data.
 */
export function splitIntoSections(csvText: string): SectionTable {
  const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: true });
  const sections: SectionTable = {};
  const activeHeaders: Record<string, string[]> = {};

  for (const row of parsed.data) {
    if (!row || row.length < 2) continue;
    const sectionName = row[0]?.trim();
    const discriminator = row[1]?.trim();
    if (!sectionName || !discriminator) continue;

    if (discriminator === "Header") {
      activeHeaders[sectionName] = row.map((cell) => cell?.trim() ?? "");
      if (!sections[sectionName]) sections[sectionName] = [];
      continue;
    }

    if (discriminator === "Data") {
      const header = activeHeaders[sectionName];
      if (!header) continue; // data row appeared before any header for this section - skip defensively
      const record: Record<string, string> = {};
      for (let i = 0; i < header.length; i++) {
        const key = header[i];
        if (!key) continue;
        record[key] = row[i] ?? "";
      }
      if (!sections[sectionName]) sections[sectionName] = [];
      sections[sectionName].push(record);
      continue;
    }

    if (SKIP_DISCRIMINATORS.has(discriminator)) continue;
    // Any other discriminator value is simply ignored here; unknown *sections*
    // (not discriminators) are handled one level up in index.ts.
  }

  return sections;
}
