"use client";

import { useState } from "react";
import { Button, Segmented, inputCls } from "@/components/ui";

type Category = "all" | "sealed" | "singles" | "retail" | "tools";

interface Store {
  name: string;
  url: string;
  location: string;
  tags: string[];
  sealed?: string;
  singles?: string;
  search?: string;
  freeShip?: string;
  note?: string;
}

const RETAIL: Store[] = [
  { name: "Pokemon Center CA", url: "https://www.pokemoncenter.com/en-ca", location: "Official", tags: ["sealed", "retail"], sealed: "https://www.pokemoncenter.com/en-ca/category/booster-packs", note: "Always MSRP" },
  { name: "Walmart Canada", url: "https://www.walmart.ca/en/browse/toys/trading-cards/pokemon-cards/10011_31745_6000204969672", location: "Nationwide", tags: ["sealed", "retail"], sealed: "https://www.walmart.ca/en/browse/toys/trading-cards/pokemon-cards/pokemon-booster-blister-packs/10011_31745_6000204969672_6000203427077", note: "MSRP, packs/ETBs/bundles" },
  { name: "Best Buy Canada", url: "https://www.bestbuy.ca/en-ca/shop/toys-games-education/pokemon-booster-box", location: "Nationwide", tags: ["sealed", "retail"], sealed: "https://www.bestbuy.ca/en-ca/shop/toys-games-education/pokemon-booster-box", note: "Booster boxes & ETBs" },
  { name: "Costco Canada", url: "https://www.costco.ca", location: "Nationwide", tags: ["sealed", "retail"], search: "https://www.costco.ca/CatalogSearch?dept=All&keyword=pokemon", note: "Exclusive bundles, best value/pack. Membership required" },
  { name: "EB Games / GameStop CA", url: "https://www.ebgames.ca/shop/category/trading-cards-168", location: "Nationwide", tags: ["sealed", "retail"], sealed: "https://www.ebgames.ca/shop/category/trading-cards-168", note: "Sealed packs & tins, in-store pickup" },
  { name: "Mastermind Toys", url: "https://www.mastermindtoys.com/collections/pokemon-cards", location: "Nationwide", tags: ["sealed", "retail"], sealed: "https://www.mastermindtoys.com/collections/pokemon-cards", note: "MSRP packs, tins, bundles" },
  { name: "Indigo / Chapters", url: "https://www.indigo.ca/en-ca/search?q=pokemon+cards", location: "Nationwide", tags: ["sealed", "retail"], search: "https://www.indigo.ca/en-ca/search?q=pokemon+cards", note: "Packs, tins, bundles" },
  { name: "London Drugs", url: "https://www.londondrugs.com/category/pokemon/c/1622", location: "Western Canada", tags: ["sealed", "retail"], sealed: "https://www.londondrugs.com/category/pokemon/c/1622", note: "MSRP sealed packs" },
  { name: "Toys R Us Canada", url: "https://www.toysrus.ca", location: "Nationwide", tags: ["sealed", "retail"], search: "https://www.toysrus.ca/search?q=pokemon", note: "Packs & bundles" },
];

const SPECIALTY: Store[] = [
  { name: "401 Games", url: "https://store.401games.ca", location: "Toronto", tags: ["sealed", "singles"], sealed: "https://store.401games.ca/collections/pokemon-sealed-product", singles: "https://store.401games.ca/collections/pokemon-singles", search: "https://store.401games.ca/pages/search-results?q=", note: "46k+ singles, sealed, graded" },
  { name: "Hobbiesville", url: "https://hobbiesville.com", location: "Ottawa / Toronto", tags: ["sealed", "singles"], sealed: "https://hobbiesville.com/collections/pokemon-booster-boxes", singles: "https://hobbiesville.com/collections/pokemon-trading-cards", search: "https://hobbiesville.com/search?q=", freeShip: "$175+", note: "Largest CA selection" },
  { name: "Face to Face Games", url: "https://facetofacegames.com", location: "Multi-city", tags: ["sealed", "singles"], sealed: "https://facetofacegames.com/en-us/collections/pokemon-sealed", singles: "https://facetofacegames.com/en-us/collections/pokemon-singles", search: "https://facetofacegames.com/en-us/search?q=", note: "Largest CA TCG retailer, buylist" },
  { name: "Deck Out Gaming", url: "https://deckoutgaming.ca", location: "Canada", tags: ["sealed", "singles"], sealed: "https://deckoutgaming.ca/collections/pokemon-sealed", singles: "https://deckoutgaming.ca/collections/pokemon-english-sealed", search: "https://deckoutgaming.ca/search?q=", note: "EN + JP singles & sealed" },
  { name: "PokeChalet", url: "https://pokechalet.com", location: "Canada", tags: ["sealed", "singles"], sealed: "https://pokechalet.com/en-us/collections/booster-boxes", search: "https://pokechalet.com/en-us/search?q=", note: "Fast shipping, great service" },
  { name: "Poke Jeux", url: "https://www.pokejeux.ca", location: "Quebec", tags: ["sealed", "singles"], search: "https://www.pokejeux.ca/search?q=", freeShip: "$200+", note: "Singles + sealed, bilingual" },
  { name: "Danireon", url: "https://www.danireon.com", location: "Ottawa", tags: ["sealed", "singles"], search: "https://www.danireon.com/en-us/search?q=", note: "150k+ singles, ships Canada-wide" },
  { name: "Catcha Card", url: "https://catchacard.ca", location: "Canada", tags: ["sealed", "singles"], search: "https://catchacard.ca/search?q=", note: "Competitive pricing" },
  { name: "SP Shop", url: "https://www.spshop.ca", location: "Canada", tags: ["sealed", "singles"], search: "https://www.spshop.ca/search?q=", note: "StarterPokemon's shop" },
  { name: "Remi Card Trader", url: "https://remicardtrader.ca", location: "Quebec", tags: ["sealed", "singles"], sealed: "https://remicardtrader.ca/en/collections/cartes-pokemon", search: "https://remicardtrader.ca/en/search?q=", freeShip: "$175+", note: "Rare singles, boxes" },
  { name: "ZardoCards", url: "https://zardocards.com", location: "Canada", tags: ["sealed", "singles"], search: "https://zardocards.com/search?q=", note: "Premium authentic products" },
  { name: "Doe's Cards", url: "https://doescards.ca", location: "Brampton", tags: ["sealed", "singles"], search: "https://doescards.ca/search?q=", note: "Free shipping options" },
  { name: "Emmett's ToyStop", url: "https://emmettstoystop.com", location: "Toronto", tags: ["sealed"], search: "https://emmettstoystop.com/search?q=", note: "Free shipping across Canada" },
  { name: "TonkaTom's TCG Station", url: "https://tonkatomstcgstation.ca", location: "Canada", tags: ["sealed", "singles"], search: "https://tonkatomstcgstation.ca/search?q=", note: "EN + JP sealed, new cards daily" },
  { name: "Tistaminis", url: "https://tistaminis.com", location: "Hamilton", tags: ["sealed", "singles"], sealed: "https://tistaminis.com/collections/pokemon", search: "https://tistaminis.com/search?q=", note: "Full TCG range" },
  { name: "Fine Toys", url: "https://www.finetoys.ca", location: "Toronto", tags: ["sealed"], sealed: "https://www.finetoys.ca/collections/pokemon-booster-boxes", search: "https://www.finetoys.ca/search?q=", note: "Sealed only, 100% factory sealed" },
  { name: "Poke Therapy", url: "https://poketherapy.com", location: "Canada", tags: ["sealed", "singles"], search: "https://poketherapy.com/search?q=", note: "Japanese imports specialist" },
  { name: "GamesLand", url: "https://gamesland.ca", location: "Edmonton", tags: ["sealed", "singles"], sealed: "https://gamesland.ca/collections/all-pokemon", search: "https://gamesland.ca/search?q=", note: "TCG + sports cards" },
  { name: "Zephyr Epic", url: "https://zephyrepic.com", location: "Canada", tags: ["sealed", "singles"], sealed: "https://zephyrepic.com/shop/category/trading-card-games/", note: "TCG + sports cards" },
  { name: "Common Box Games", url: "https://commonboxgames.com", location: "Edmonton", tags: ["sealed", "singles"], search: "https://commonboxgames.com/search?q=", note: "Singles + sealed" },
  { name: "Eclipse Games", url: "https://eclipsegames.ca", location: "Edmonton", tags: ["sealed"], search: "https://eclipsegames.ca/search?q=", note: "Family-friendly sealed products" },
  { name: "Infinity Cards", url: "https://infinitycards.ca", location: "Fraser Valley, BC", tags: ["sealed", "singles"], search: "https://infinitycards.ca/search?q=", note: "TCG + collectibles" },
  { name: "Pop Collectibles", url: "https://popcollectibles.ca", location: "Canada", tags: ["sealed"], search: "https://popcollectibles.ca/search?q=", note: "Costco-exclusive bundles" },
];

const TOOLS: Store[] = [
  { name: "TrackaCard", url: "https://trackacard.ca", location: "Canada", tags: ["tools"], note: "Compare prices across 35+ CA stores, price alerts" },
  { name: "TCG Archives", url: "https://marketplace.tcgarchives.ca", location: "Canada", tags: ["tools"], note: "P2P marketplace, no commission, ID-verified" },
];

interface RestockAlert {
  name: string;
  url: string;
  join: string;
  note: string;
  stores: string;
  via: string;
  free?: boolean;
  price?: string;
}

const RESTOCK_ALERTS: RestockAlert[] = [
  {
    name: "Pokennoisseur",
    url: "https://pokennoisseur.ca",
    join: "https://discord.com/servers/pokennoisseur-canada-pokemon-tcg-restock-alerts-1501295390161633482",
    note: "Canada-specific. Tracks 165+ Canadian card shops and major retailers in real time, prices in CAD.",
    stores: "Walmart, Best Buy, Pokemon Center, EB Games, Costco, 160+ local shops across every province",
    via: "Discord",
    free: true,
  },
  {
    name: "TrackaLacker",
    url: "https://www.trackalacker.com/ca/products/showcase/all-new-pokemon",
    join: "https://www.trackalacker.com",
    note: "Free app with push notifications. 150k+ users. Checks hot items every few seconds.",
    stores: "Pokemon Center, Walmart, Best Buy, Costco, GameStop + CA coverage",
    via: "iOS / Android app + Discord",
    free: true,
  },
  {
    name: "PokeToolz",
    url: "https://www.poketoolz.com",
    join: "https://www.poketoolz.com",
    note: "Canada's #1 restock alert service with auto-checkout support.",
    stores: "Major Canadian retailers + local shops",
    via: "Discord",
    price: "Paid",
  },
  {
    name: "PokeScan",
    url: "https://mypokescan.com",
    join: "https://mypokescan.com",
    note: "Monitors 100+ stores across US, Canada, UK, EU, Australia & Japan.",
    stores: "100+ stores including Canadian retailers",
    via: "Discord",
    price: "$8.99/mo",
  },
  {
    name: "PokeNotify",
    url: "https://www.pokenotify.com",
    join: "https://www.pokenotify.com",
    note: "Native app with ZIP/postal code in-store alerts. 20k+ members.",
    stores: "Multi-region including Canada",
    via: "iOS / Android app + Discord",
    price: "Paid",
  },
];

const SEALED_CATEGORIES = [
  { label: "Booster Boxes", keywords: "pokemon booster box" },
  { label: "Elite Trainer Boxes", keywords: "pokemon elite trainer box etb" },
  { label: "Bundles & Collection Boxes", keywords: "pokemon bundle collection box" },
  { label: "Tins", keywords: "pokemon tin" },
  { label: "Booster Packs", keywords: "pokemon booster pack" },
  { label: "Japanese Sealed", keywords: "pokemon japanese booster box" },
];

export default function ShopPage() {
  const [cat, setCat] = useState<Category>("all");
  const [q, setQ] = useState("");

  const allStores = [...RETAIL, ...SPECIALTY];
  const filtered = cat === "all" ? allStores
    : cat === "sealed" ? allStores.filter((s) => s.tags.includes("sealed"))
    : cat === "singles" ? allStores.filter((s) => s.tags.includes("singles"))
    : cat === "retail" ? RETAIL
    : TOOLS;

  function searchStores() {
    if (!q.trim()) return;
    const term = encodeURIComponent(q.trim());
    const urls = SPECIALTY.filter((s) => s.search).map((s) => s.search + term);
    urls.forEach((u) => window.open(u, "_blank"));
  }

  return (
    <div className="pb-24">
      <header className="pt-2 pb-3">
        <h1 className="text-xl font-bold">Shop Canada</h1>
        <p className="text-xs text-muted mt-1">Canadian stores only. No customs, no duties, prices in CAD.</p>
      </header>

      <div className="flex gap-2">
        <input
          className={inputCls}
          placeholder="Search all stores for a card or product..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && searchStores()}
          enterKeyHint="search"
        />
        <Button onClick={searchStores} disabled={!q.trim()}>
          Search
        </Button>
      </div>
      <p className="text-[10px] text-muted mt-1">Opens search results across all specialty stores at once.</p>

      <div className="mt-4">
        <Segmented
          value={cat}
          onChange={setCat}
          size="xs"
          options={[
            { value: "all", label: "All" },
            { value: "sealed", label: "Sealed" },
            { value: "singles", label: "Singles" },
            { value: "retail", label: "Big Box" },
            { value: "tools", label: "Tools" },
          ]}
        />
      </div>

      {(cat === "all" || cat === "sealed") && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Quick links by product type</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SEALED_CATEGORIES.map((sc) => (
              <button
                key={sc.label}
                onClick={() => { setQ(sc.keywords); }}
                className="card-surface rounded-2xl p-3 text-left hover:bg-white/[0.06] transition"
              >
                <div className="text-sm font-semibold">{sc.label}</div>
                <div className="text-[10px] text-muted mt-0.5">Tap then Search</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {(cat === "all" || cat === "retail") && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Big box retailers (MSRP)</h2>
          <ul className="card-surface rounded-2xl divide-y divide-line overflow-hidden">
            {RETAIL.map((s) => (
              <StoreRow key={s.name} store={s} />
            ))}
          </ul>
        </section>
      )}

      {(cat === "all" || cat === "sealed" || cat === "singles") && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Specialty card shops</h2>
          <ul className="card-surface rounded-2xl divide-y divide-line overflow-hidden">
            {(cat === "singles" ? SPECIALTY.filter((s) => s.tags.includes("singles")) : SPECIALTY).map((s) => (
              <StoreRow key={s.name} store={s} />
            ))}
          </ul>
        </section>
      )}

      {(cat === "all" || cat === "tools") && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Marketplaces & tools</h2>
          <ul className="card-surface rounded-2xl divide-y divide-line overflow-hidden">
            {TOOLS.map((s) => (
              <StoreRow key={s.name} store={s} />
            ))}
          </ul>
        </section>
      )}

      {(cat === "all" || cat === "tools") && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Restock alerts</h2>
          <p className="text-xs text-muted mb-3">Get notified the moment Canadian stores restock Pokemon products. These services monitor store websites 24/7 so you never miss a drop.</p>
          <ul className="card-surface rounded-2xl divide-y divide-line overflow-hidden">
            {RESTOCK_ALERTS.map((a) => (
              <li key={a.name} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-sm text-accent hover:underline">
                      {a.name}
                    </a>
                    {a.free && <span className="ml-2 text-[10px] font-semibold text-up bg-up/10 px-1.5 py-0.5 rounded">FREE</span>}
                    {a.price && <span className="ml-2 text-[10px] text-muted">{a.price}</span>}
                    <div className="text-xs text-muted/70 mt-0.5">{a.note}</div>
                    <div className="text-[11px] text-muted mt-1">
                      <span className="font-medium">Stores:</span> {a.stores}
                    </div>
                    <div className="text-[11px] text-muted">
                      <span className="font-medium">Via:</span> {a.via}
                    </div>
                  </div>
                  <a href={a.join} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold px-3 py-1.5 rounded-lg bg-accent/10 text-accent flex-shrink-0 mt-0.5">
                    Join
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function StoreRow({ store: s }: { store: Store }) {
  return (
    <li className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-sm text-accent hover:underline">
            {s.name}
          </a>
          <div className="text-[11px] text-muted mt-0.5">{s.location}</div>
          {s.note && <div className="text-xs text-muted/70 mt-0.5">{s.note}</div>}
          {s.freeShip && <div className="text-[10px] text-up font-medium mt-0.5">Free shipping {s.freeShip}</div>}
        </div>
        <div className="flex gap-1.5 flex-shrink-0 mt-0.5">
          {s.sealed && (
            <a href={s.sealed} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-accent/10 text-accent">
              Sealed
            </a>
          )}
          {s.singles && (
            <a href={s.singles} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-up/10 text-up">
              Singles
            </a>
          )}
          {!s.sealed && !s.singles && s.search && (
            <a href={s.search} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-white/[0.06] text-fg">
              Browse
            </a>
          )}
          {!s.sealed && !s.singles && !s.search && (
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-white/[0.06] text-fg">
              Visit
            </a>
          )}
        </div>
      </div>
    </li>
  );
}
