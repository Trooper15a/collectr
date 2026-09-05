import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { DATA_DIR, db, schema } from "@/db";
import { hasPokewalletKey, pokewalletLimiter, POKEWALLET_BASE } from "@/lib/pokewallet";

const DIR = path.join(DATA_DIR, "images", "sets");

/** Set logo, disk-cached. Pokémon logos come from PokéWallet (one API call per set, once); Magic from Scryfall's icon. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await ctx.params).id);
  const set = db.select().from(schema.sets).where(eq(schema.sets.id, id)).get();
  if (!set) return new NextResponse("not found", { status: 404 });
  const file = path.join(DIR, id.replace(/[^a-zA-Z0-9_.-]/g, "_") + ".img");
  const meta = file + ".type";
  if (fs.existsSync(file) && fs.existsSync(meta)) {
    return new NextResponse(fs.readFileSync(file), { headers: { "Content-Type": fs.readFileSync(meta, "utf8"), "Cache-Control": "public, max-age=31536000, immutable" } });
  }
  try {
    let upstream: Response | null = null;
    if (set.imageUrl) {
      upstream = await fetch(set.imageUrl, { headers: { "User-Agent": "collectr-clone-personal/0.1" } });
    } else if (set.tcg === "pokemon" && hasPokewalletKey() && pokewalletLimiter.remaining.hour > 10) {
      await pokewalletLimiter.acquire();
      const url = new URL(`${POKEWALLET_BASE}/sets/${encodeURIComponent(set.code)}/image`);
      if (set.language) url.searchParams.set("language", set.language);
      upstream = await fetch(url, { headers: { "X-API-Key": process.env.POKEWALLET_API_KEY ?? "" } });
    }
    if (!upstream || !upstream.ok) return new NextResponse("no logo", { status: 404 });
    const type = upstream.headers.get("Content-Type") ?? "image/png";
    const buf = Buffer.from(await upstream.arrayBuffer());
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(file, buf);
    fs.writeFileSync(meta, type);
    return new NextResponse(buf, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return new NextResponse("logo fetch failed", { status: 502 });
  }
}
