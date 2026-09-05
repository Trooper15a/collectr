import type { CardPrices, NormalizedCard } from "./types";

const BASE = "https://db.ygoprodeck.com/api/v7";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

function num(v: unknown) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizeYgo(c: J, imageIndex = 0): NormalizedCard {
  const img = c.card_images?.[imageIndex] ?? c.card_images?.[0] ?? {};
  const sets: J[] = c.card_sets ?? [];
  const first = sets[0] ?? {};
  const cp = c.card_prices?.[0] ?? {};
  const prices: CardPrices = {
    tcgplayer: num(cp.tcgplayer_price) != null ? { currency: "USD", updatedAt: null, variants: { normal: { market: num(cp.tcgplayer_price) } } } : null,
    cardmarket: num(cp.cardmarket_price) != null ? { currency: "EUR", updatedAt: null, variants: { normal: { market: num(cp.cardmarket_price) } } } : null,
  };
  const id = String(img.id ?? c.id);
  return {
    id: `ygo:${id}`,
    tcg: "yugioh",
    name: c.name,
    setName: first.set_name ?? null,
    setCode: first.set_code ? String(first.set_code).split("-")[0] : null,
    setId: null,
    cardNumber: first.set_code ?? null,
    rarity: first.set_rarity ?? null,
    variant: null,
    language: "eng",
    imageUrl: img.image_url ?? null,
    releaseDate: null,
    sourceId: id,
    prices,
    meta: {
      type: c.type,
      frameType: c.frameType,
      desc: c.desc,
      atk: c.atk,
      def: c.def,
      level: c.level,
      race: c.race,
      attribute: c.attribute,
      sets: sets.map((s) => ({ code: s.set_code, name: s.set_name, rarity: s.set_rarity, price: num(s.set_price) })),
      ebayPrice: num(cp.ebay_price),
      amazonPrice: num(cp.amazon_price),
    },
  };
}

export async function ygoSearch(q: string, limit = 20): Promise<NormalizedCard[]> {
  const url = new URL(`${BASE}/cardinfo.php`);
  url.searchParams.set("fname", q);
  url.searchParams.set("num", String(limit));
  url.searchParams.set("offset", "0");
  const res = await fetch(url);
  if (res.status === 400) return []; // "No card matching your query was found"
  if (!res.ok) throw new Error(`YGOProDeck ${res.status}`);
  const data = await res.json();
  return (data.data ?? []).map((c: J) => normalizeYgo(c));
}

export async function ygoCard(id: string): Promise<NormalizedCard> {
  const res = await fetch(`${BASE}/cardinfo.php?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`YGOProDeck ${res.status}`);
  const data = await res.json();
  const c = data.data?.[0];
  if (!c) throw new Error("card not found");
  const idx = Math.max(0, (c.card_images ?? []).findIndex((i: J) => String(i.id) === id));
  return normalizeYgo(c, idx);
}
