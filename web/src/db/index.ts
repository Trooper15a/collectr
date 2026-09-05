import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const DB_PATH = process.env.DATABASE_PATH ?? path.join(DATA_DIR, "collectr.db");

const DDL = `
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY, tcg TEXT NOT NULL, name TEXT NOT NULL, set_name TEXT, set_code TEXT, set_id TEXT,
  card_number TEXT, rarity TEXT, variant TEXT, language TEXT NOT NULL DEFAULT 'eng', image_url TEXT,
  image_cached_path TEXT, release_date TEXT, source_id TEXT NOT NULL, prices_json TEXT, price_updated_at TEXT,
  meta_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cards_tcg_idx ON cards(tcg);
CREATE INDEX IF NOT EXISTS cards_set_idx ON cards(set_code);
CREATE INDEX IF NOT EXISTS cards_name_idx ON cards(name);

CREATE TABLE IF NOT EXISTS card_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT, card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  date TEXT NOT NULL, variant_type TEXT NOT NULL DEFAULT 'normal', source TEXT NOT NULL, currency TEXT NOT NULL,
  market REAL, low REAL, mid REAL, high REAL, trend REAL, avg1 REAL, avg7 REAL, avg30 REAL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS card_prices_unique ON card_prices(card_id, date, variant_type, source);
CREATE INDEX IF NOT EXISTS card_prices_card_idx ON card_prices(card_id);

CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  date TEXT NOT NULL, variant_type TEXT NOT NULL DEFAULT 'normal', tcgplayer_market REAL, cardmarket_avg REAL
);
CREATE UNIQUE INDEX IF NOT EXISTS price_history_unique ON price_history(card_id, date, variant_type);
CREATE INDEX IF NOT EXISTS price_history_card_idx ON price_history(card_id);

CREATE TABLE IF NOT EXISTS portfolios (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, tcg_id TEXT, language TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portfolio_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES cards(id),
  quantity INTEGER NOT NULL DEFAULT 1, variant_type TEXT NOT NULL DEFAULT 'normal',
  condition TEXT NOT NULL DEFAULT 'NM', is_graded INTEGER NOT NULL DEFAULT 0, grading_company TEXT, grade TEXT,
  cert_number TEXT, cost_basis REAL, cost_currency TEXT NOT NULL DEFAULT 'USD', notes TEXT, added_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS items_portfolio_idx ON portfolio_items(portfolio_id);
CREATE INDEX IF NOT EXISTS items_card_idx ON portfolio_items(card_id);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT, portfolio_id INTEGER, date TEXT NOT NULL,
  value_usd REAL NOT NULL, cost_usd REAL NOT NULL, item_count INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS snapshots_unique ON portfolio_snapshots(portfolio_id, date);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS api_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS sets (
  id TEXT PRIMARY KEY, tcg TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'eng', total INTEGER, release_date TEXT, image_url TEXT
);
CREATE INDEX IF NOT EXISTS sets_tcg_idx ON sets(tcg);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  threshold_pct REAL NOT NULL DEFAULT 10, base_price REAL, base_currency TEXT, variant_type TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL, last_triggered_at TEXT, acknowledged_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS alerts_card_unique ON alerts(card_id);

CREATE TABLE IF NOT EXISTS card_links (
  scan_id TEXT PRIMARY KEY, card_id TEXT REFERENCES cards(id), method TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS box_opens (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, product_type TEXT NOT NULL DEFAULT 'booster_box',
  set_code TEXT, set_name TEXT, cost REAL NOT NULL, cost_currency TEXT NOT NULL DEFAULT 'CAD',
  opened_at TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS box_open_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, box_open_id INTEGER NOT NULL REFERENCES box_opens(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES cards(id), quantity INTEGER NOT NULL DEFAULT 1,
  variant_type TEXT NOT NULL DEFAULT 'normal', added_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS box_items_open_idx ON box_open_items(box_open_id);
CREATE INDEX IF NOT EXISTS box_items_card_idx ON box_open_items(card_id);
`;

function open() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(DDL);
  return drizzle(sqlite, { schema });
}

type Db = ReturnType<typeof open>;
const globalForDb = globalThis as unknown as { __collectrDb?: Db };

/** Singleton so Next.js hot reload doesn't open hundreds of handles. */
export const db: Db = globalForDb.__collectrDb ?? (globalForDb.__collectrDb = open());

export { DATA_DIR, DB_PATH, schema };
