export type Tcg = "pokemon" | "mtg" | "yugioh" | "onepiece" | "lorcana" | "digimon" | "dbs" | "dbfw" | "fab" | "swu" | "vanguard" | "weiss" | "finalfantasy";
export const TCGS: { id: Tcg; label: string; accent: string }[] = [
  { id: "pokemon", label: "Pokémon", accent: "#facc15" },
  { id: "mtg", label: "Magic", accent: "#60a5fa" },
  { id: "yugioh", label: "Yu-Gi-Oh!", accent: "#c084fc" },
  { id: "onepiece", label: "One Piece", accent: "#f87171" },
  { id: "lorcana", label: "Lorcana", accent: "#f0abfc" },
  { id: "digimon", label: "Digimon", accent: "#fb923c" },
  { id: "dbs", label: "Dragon Ball Super", accent: "#fbbf24" },
  { id: "dbfw", label: "DB Fusion World", accent: "#f59e0b" },
  { id: "fab", label: "Flesh and Blood", accent: "#ef4444" },
  { id: "swu", label: "Star Wars Unlimited", accent: "#93c5fd" },
  { id: "vanguard", label: "Vanguard", accent: "#a78bfa" },
  { id: "weiss", label: "Weiss Schwarz", accent: "#e5e7eb" },
  { id: "finalfantasy", label: "Final Fantasy", accent: "#67e8f9" },
];
export const TCG_IDS = TCGS.map((t) => t.id) as [Tcg, ...Tcg[]];

export type Lang = "eng" | "jap" | string;

export interface PriceVariant {
  market?: number | null;
  low?: number | null;
  mid?: number | null;
  high?: number | null;
  directLow?: number | null;
  trend?: number | null;
  avg1?: number | null;
  avg7?: number | null;
  avg30?: number | null;
}

export interface MarketPrices {
  currency: "USD" | "EUR";
  url?: string | null;
  updatedAt?: string | null;
  /** keyed by variant: normal, holofoil, reverseHolofoil, 1stEdition, ... */
  variants: Record<string, PriceVariant>;
}

export interface CardPrices {
  tcgplayer?: MarketPrices | null;
  cardmarket?: MarketPrices | null;
}

export interface NormalizedCard {
  id: string;
  tcg: Tcg;
  name: string;
  setName?: string | null;
  setCode?: string | null;
  setId?: string | null;
  cardNumber?: string | null;
  rarity?: string | null;
  variant?: string | null;
  language: Lang;
  imageUrl?: string | null;
  releaseDate?: string | null;
  sourceId: string;
  prices: CardPrices;
  meta?: Record<string, unknown>;
}

export interface CardSummary {
  id: string;
  tcg: Tcg;
  name: string;
  setName?: string | null;
  setCode?: string | null;
  cardNumber?: string | null;
  rarity?: string | null;
  language: Lang;
  /** Best single price for display, in the card's native market currency. */
  price: { amount: number; currency: "USD" | "EUR"; variant: string } | null;
  /** `price` converted to the user's display currency (same as price when identical). */
  display?: { amount: number; currency: string } | null;
  prices: CardPrices;
}

export const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;
export const CONDITION_LABELS: Record<(typeof CONDITIONS)[number], string> = {
  NM: "Near Mint",
  LP: "Lightly Played",
  MP: "Moderately Played",
  HP: "Heavily Played",
  DMG: "Damaged",
};
export const GRADING_COMPANIES = ["PSA", "BGS", "CGC", "SGC", "ACE", "TAG"] as const;
export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "JPY", "AUD"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Pick the most representative price from a CardPrices object. */
export function bestPrice(prices: CardPrices | null | undefined, preferVariant?: string) {
  if (!prices) return null;
  const order: ("tcgplayer" | "cardmarket")[] = ["tcgplayer", "cardmarket"];
  for (const market of order) {
    const m = prices[market];
    if (!m) continue;
    const keys = preferVariant && m.variants[preferVariant] ? [preferVariant, ...Object.keys(m.variants)] : Object.keys(m.variants);
    for (const k of keys) {
      const v = m.variants[k];
      const amount = v?.market ?? v?.trend ?? v?.avg7 ?? v?.mid ?? v?.low ?? null;
      if (amount != null && amount > 0) return { amount, currency: m.currency, variant: k, market };
    }
  }
  return null;
}

export function variantLabel(v: string) {
  const map: Record<string, string> = {
    normal: "Normal",
    holofoil: "Holofoil",
    reverseHolofoil: "Reverse Holo",
    "1stEdition": "1st Edition",
    "1stEditionHolofoil": "1st Ed. Holo",
    shadowless: "Shadowless",
    unlimited: "Unlimited",
    unlimitedHolofoil: "Unlimited Holo",
    holo: "Holo",
    foil: "Foil",
    etched: "Etched",
  };
  return map[v] ?? v.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^\w/, (c) => c.toUpperCase());
}
