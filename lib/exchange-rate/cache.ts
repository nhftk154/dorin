import fs from "node:fs/promises";
import path from "node:path";
import type { ExchangeRateCacheEntry } from "./types";

const CACHE_PATH = path.join(process.cwd(), "data", "boi-rate-cache.json");

/** currency -> date (ISO) -> cache entry. */
export type CacheFile = Record<string, Record<string, ExchangeRateCacheEntry>>;

export async function loadCache(): Promise<CacheFile> {
  try {
    const raw = await fs.readFile(CACHE_PATH, "utf-8");
    return JSON.parse(raw) as CacheFile;
  } catch {
    return {};
  }
}

export async function saveCache(cache: CacheFile): Promise<void> {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}
