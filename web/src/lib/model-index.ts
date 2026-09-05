import fs from "node:fs";
import path from "node:path";
import type { IndexCard } from "./scanner/matcher";

/**
 * Server-side reader for the scanner index (public/model/index.json, written by ml/embed.py).
 * Used to resolve scanner ids (tcgdex:...) to names/sets/images without a database import.
 */
const INDEX_PATH = path.join(process.cwd(), "public", "model", "index.json");

interface Loaded {
  mtime: number;
  byId: Map<string, IndexCard>;
}
const globalForIndex = globalThis as unknown as { __modelIndex?: Loaded };

export function modelIndex(): Map<string, IndexCard> {
  let mtime = 0;
  try {
    mtime = fs.statSync(INDEX_PATH).mtimeMs;
  } catch {
    return new Map();
  }
  const cached = globalForIndex.__modelIndex;
  if (cached && cached.mtime === mtime) return cached.byId;
  const data = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as { cards: IndexCard[] };
  const byId = new Map(data.cards.map((c) => [c.id, c]));
  globalForIndex.__modelIndex = { mtime, byId };
  return byId;
}

export function indexCard(id: string): IndexCard | undefined {
  return modelIndex().get(id);
}
