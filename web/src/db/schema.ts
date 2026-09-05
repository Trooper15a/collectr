import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Unified card ids: `pw:<pokewallet id>`, `sf:<scryfall id>`, `ygo:<ygoprodeck id>`. */
export const cards = sqliteTable(
  "cards",
  {
    id: text("id").primaryKey(),
    tcg: text("tcg").notNull(), // pokemon | mtg | yugioh | onepiece | ...
    name: text("name").notNull(),
    setName: text("set_name"),
    setCode: text("set_code"),
    setId: text("set_id"),
    cardNumber: text("card_number"),
    rarity: text("rarity"),
    variant: text("variant"),
    language: text("language").notNull().default("eng"),
    imageUrl: text("image_url"),
    imageCachedPath: text("image_cached_path"),
    releaseDate: text("release_date"),
    sourceId: text("source_id").notNull(),
    /** Full normalised price object (see lib/types.ts CardPrices) as JSON. */
    pricesJson: text("prices_json"),
    priceUpdatedAt: text("price_updated_at"),
    /** Extra metadata (hp, types, attacks, oracle text...) as JSON. */
    metaJson: text("meta_json"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("cards_tcg_idx").on(t.tcg), index("cards_set_idx").on(t.setCode), index("cards_name_idx").on(t.name)],
);

export const cardPrices = sqliteTable(
  "card_prices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cardId: text("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD
    variantType: text("variant_type").notNull().default("normal"),
    source: text("source").notNull(), // tcgplayer | cardmarket | scryfall | ygoprodeck
    currency: text("currency").notNull(), // USD | EUR
    market: real("market"),
    low: real("low"),
    mid: real("mid"),
    high: real("high"),
    trend: real("trend"),
    avg1: real("avg1"),
    avg7: real("avg7"),
    avg30: real("avg30"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("card_prices_unique").on(t.cardId, t.date, t.variantType, t.source),
    index("card_prices_card_idx").on(t.cardId),
  ],
);

export const priceHistory = sqliteTable(
  "price_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cardId: text("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    variantType: text("variant_type").notNull().default("normal"),
    tcgplayerMarket: real("tcgplayer_market"),
    cardmarketAvg: real("cardmarket_avg"),
  },
  (t) => [
    uniqueIndex("price_history_unique").on(t.cardId, t.date, t.variantType),
    index("price_history_card_idx").on(t.cardId),
  ],
);

export const portfolios = sqliteTable("portfolios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  tcgId: text("tcg_id"), // optional grouping
  language: text("language"), // optional sub-grouping (eng/jap)
  createdAt: text("created_at").notNull(),
});

export const portfolioItems = sqliteTable(
  "portfolio_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    portfolioId: integer("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
    cardId: text("card_id").notNull().references(() => cards.id),
    quantity: integer("quantity").notNull().default(1),
    variantType: text("variant_type").notNull().default("normal"),
    condition: text("condition").notNull().default("NM"), // NM LP MP HP DMG
    isGraded: integer("is_graded", { mode: "boolean" }).notNull().default(false),
    gradingCompany: text("grading_company"),
    grade: text("grade"),
    certNumber: text("cert_number"),
    costBasis: real("cost_basis"),
    costCurrency: text("cost_currency").notNull().default("USD"),
    notes: text("notes"),
    addedAt: text("added_at").notNull(),
  },
  (t) => [index("items_portfolio_idx").on(t.portfolioId), index("items_card_idx").on(t.cardId)],
);

/** Daily total value snapshots (portfolioId 0 = all portfolios; NULL is avoided because SQLite unique indexes treat NULLs as distinct), in USD. */
export const portfolioSnapshots = sqliteTable(
  "portfolio_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    portfolioId: integer("portfolio_id"),
    date: text("date").notNull(),
    valueUsd: real("value_usd").notNull(),
    costUsd: real("cost_usd").notNull(),
    itemCount: integer("item_count").notNull(),
  },
  (t) => [uniqueIndex("snapshots_unique").on(t.portfolioId, t.date)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** Generic API response cache (search results, set lists, fx rates). */
export const apiCache = sqliteTable("api_cache", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const sets = sqliteTable(
  "sets",
  {
    id: text("id").primaryKey(), // `${tcg}:${code}:${language}`
    tcg: text("tcg").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    language: text("language").notNull().default("eng"),
    total: integer("total"),
    releaseDate: text("release_date"),
    imageUrl: text("image_url"),
  },
  (t) => [index("sets_tcg_idx").on(t.tcg)],
);

/** Price alert: fires when the card's price moves more than threshold_pct from base_price (set when created / acknowledged). */
export const alerts = sqliteTable("alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cardId: text("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
  thresholdPct: real("threshold_pct").notNull().default(10),
  basePrice: real("base_price"),
  baseCurrency: text("base_currency"),
  variantType: text("variant_type").notNull().default("normal"),
  createdAt: text("created_at").notNull(),
  lastTriggeredAt: text("last_triggered_at"),
  acknowledgedAt: text("acknowledged_at"),
}, (t) => [uniqueIndex("alerts_card_unique").on(t.cardId)]);

/** Scanner index id (e.g. tcgdex:ja:SV1a-001) -> priced app card (pw:...). cardId NULL = no match found. */
export const cardLinks = sqliteTable("card_links", {
  scanId: text("scan_id").primaryKey(),
  cardId: text("card_id").references(() => cards.id),
  method: text("method").notNull(), // setcode+number | name+number | manual | none
  createdAt: text("created_at").notNull(),
});

/** Sealed product opening — tracks what you paid vs what you pulled. */
export const boxOpens = sqliteTable("box_opens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  productType: text("product_type").notNull().default("booster_box"),
  setCode: text("set_code"),
  setName: text("set_name"),
  cost: real("cost").notNull(),
  costCurrency: text("cost_currency").notNull().default("CAD"),
  openedAt: text("opened_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const boxOpenItems = sqliteTable(
  "box_open_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    boxOpenId: integer("box_open_id").notNull().references(() => boxOpens.id, { onDelete: "cascade" }),
    cardId: text("card_id").notNull().references(() => cards.id),
    quantity: integer("quantity").notNull().default(1),
    variantType: text("variant_type").notNull().default("normal"),
    addedAt: text("added_at").notNull(),
  },
  (t) => [index("box_items_open_idx").on(t.boxOpenId), index("box_items_card_idx").on(t.cardId)],
);

export type Card = typeof cards.$inferSelect;
export type Portfolio = typeof portfolios.$inferSelect;
export type PortfolioItem = typeof portfolioItems.$inferSelect;
export type SetRow = typeof sets.$inferSelect;
export type BoxOpen = typeof boxOpens.$inferSelect;
export type BoxOpenItem = typeof boxOpenItems.$inferSelect;
