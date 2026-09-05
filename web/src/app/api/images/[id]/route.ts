import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { DATA_DIR, db, schema } from "@/db";
import { getCard } from "@/lib/cards";
import { indexCard } from "@/lib/model-index";
import { pwRawImage } from "@/lib/pokewallet";

const IMAGE_DIR = path.join(DATA_DIR, "images");

function safe(s: string) {
  return s.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

/**
 * Image proxy + disk cache. GET /api/images/<cardId>?size=high|low&lang=fr
 * PokéWallet images need the API key header, so the browser can never load them directly;
 * every source goes through here so the phone gets one cacheable URL per card.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await ctx.params).id);
  const size = req.nextUrl.searchParams.get("size") === "low" ? "low" : "high";
  const lang = req.nextUrl.searchParams.get("lang") ?? undefined;
  const [src, ...rest] = id.split(":");
  const sourceId = rest.join(":");
  if (!sourceId || !["pw", "sf", "ygo", "tcgdex", "pcjp", "tp"].includes(src)) return new NextResponse("bad id", { status: 400 });

  const file = path.join(IMAGE_DIR, src, `${safe(sourceId)}_${size}${lang ? `_${safe(lang)}` : ""}.img`);
  const metaFile = file + ".type";
  if (fs.existsSync(file) && fs.existsSync(metaFile)) {
    return new NextResponse(fs.readFileSync(file), {
      headers: { "Content-Type": fs.readFileSync(metaFile, "utf8"), "Cache-Control": "public, max-age=31536000, immutable" },
    });
  }

  try {
    let upstream: Response;
    if (src === "pw") {
      upstream = await pwRawImage(sourceId, size, lang);
    } else if (src === "tcgdex" || src === "pcjp") {
      // Scanner-index card: image url comes from public/model/index.json.
      const img = indexCard(id)?.img;
      if (!img) return new NextResponse("no image", { status: 404 });
      const url = src === "tcgdex" ? `${img.replace(/\/(high|low)\.webp$/, "")}/${size}.webp` : img;
      upstream = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 collectr-clone-personal/0.1" } });
    } else {
      let url = db.select({ imageUrl: schema.cards.imageUrl }).from(schema.cards).where(eq(schema.cards.id, id)).get()?.imageUrl;
      if (!url) url = (await getCard(id))?.imageUrl ?? undefined;
      if (!url) return new NextResponse("no image", { status: 404 });
      if (size === "low" && src === "sf") url = url.replace("/large/", "/normal/");
      // TCGPlayer CDN: _200w (catalog), _400w, _in_1000x1000 all exist.
      if (src === "tp") url = url.replace(/_\d+w\.jpg$/, size === "low" ? "_400w.jpg" : "_in_1000x1000.jpg");
      upstream = await fetch(url, { headers: { "User-Agent": "collectr-clone-personal/0.1" } });
    }
    if (!upstream.ok) return new NextResponse("upstream error", { status: upstream.status });
    const type = upstream.headers.get("Content-Type") ?? "image/jpeg";
    const buf = Buffer.from(await upstream.arrayBuffer());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
    fs.writeFileSync(metaFile, type);
    if (src !== "tcgdex" && src !== "pcjp") db.update(schema.cards).set({ imageCachedPath: file }).where(eq(schema.cards.id, id)).run();
    return new NextResponse(buf, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch (err) {
    console.error("image proxy error", err);
    return new NextResponse("image fetch failed", { status: 502 });
  }
}
