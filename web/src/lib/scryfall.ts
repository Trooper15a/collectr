import type { CardPrices, NormalizedCard } from "./types";

const BASE = "https://api.scryfall.com";
const HEADERS = { "User-Agent": "collectr-clone-personal/0.1", Accept: "application/json" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

function num(v: unknown) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizeScryfall(c: J): NormalizedCard {
  const p = c.prices ?? {};
  const prices: CardPrices = {
    tcgplayer: {
      currency: "USD",
      url: c.purchase_uris?.tcgplayer ?? null,
      updatedAt: null,
      variants: {
        ...(num(p.usd) != null ? { normal: { market: num(p.usd) } } : {}),
        ...(num(p.usd_foil) != null ? { foil: { market: num(p.usd_foil) } } : {}),
        ...(num(p.usd_etched) != null ? { etched: { market: num(p.usd_etched) } } : {}),
      },
    },
    cardmarket: {
      currency: "EUR",
      url: c.purchase_uris?.cardmarket ?? null,
      updatedAt: null,
      variants: {
        ...(num(p.eur) != null ? { normal: { market: num(p.eur) } } : {}),
        ...(num(p.eur_foil) != null ? { foil: { market: num(p.eur_foil) } } : {}),
      },
    },
  };
  if (!Object.keys(prices.tcgplayer!.variants).length) prices.tcgplayer = null;
  if (!Object.keys(prices.cardmarket!.variants).length) prices.cardmarket = null;
  const img = c.image_uris ?? c.card_faces?.[0]?.image_uris ?? {};
  return {
    id: `sf:${c.id}`,
    tcg: "mtg",
    name: c.name,
    setName: c.set_name ?? null,
    setCode: c.set ?? null,
    setId: c.set_id ?? null,
    cardNumber: c.collector_number ?? null,
    rarity: c.rarity ?? null,
    variant: Array.isArray(c.frame_effects) ? c.frame_effects.join(",") : null,
    language: c.lang === "ja" ? "jap" : c.lang === "en" ? "eng" : (c.lang ?? "eng"),
    imageUrl: img.large ?? img.normal ?? null,
    releaseDate: c.released_at ?? null,
    sourceId: c.id,
    prices,
    meta: {
      manaCost: c.mana_cost,
      typeLine: c.type_line,
      oracleText: c.oracle_text,
      artist: c.artist,
      scryfallUri: c.scryfall_uri,
    },
  };
}

export async function sfSearch(q: string, limit = 20): Promise<NormalizedCard[]> {
  const url = new URL(`${BASE}/cards/search`);
  url.searchParams.set("q", q);
  url.searchParams.set("unique", "prints");
  url.searchParams.set("order", "released");
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Scryfall ${res.status}`);
  const data = await res.json();
  return (data.data ?? []).filter((c: J) => !c.digital).slice(0, limit).map(normalizeScryfall);
}

export async function sfCard(id: string): Promise<NormalizedCard> {
  const res = await fetch(`${BASE}/cards/${encodeURIComponent(id)}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Scryfall ${res.status}`);
  return normalizeScryfall(await res.json());
}

export async function sfSets() {
  const res = await fetch(`${BASE}/sets`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Scryfall ${res.status}`);
  const data = await res.json();
  return (data.data ?? []).map((s: J) => ({
    code: s.code as string,
    name: s.name as string,
    language: "eng",
    total: num(s.card_count),
    releaseDate: (s.released_at as string) ?? null,
    imageUrl: (s.icon_svg_uri as string) ?? null,
  }));
}
