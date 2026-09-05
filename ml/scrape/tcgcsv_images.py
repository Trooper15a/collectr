"""Download card images for every TCGPlayer product already imported into the app database.

The app's TCGCSV import (web/src/lib/tcgcsv.ts) stores an image URL for each product
(tcgplayer-cdn.tcgplayer.com/product/<id>_200w.jpg; _400w and _in_1000x1000 also exist).
This pulls those images for singles (rows with a card number) so the scanner can be trained on
them. Card ids are `tp:<productId>`, which are already priced app cards, so scans of these
resolve directly with no PokeWallet lookup.

    python scrape/tcgcsv_images.py                    # pokemon EN + JP
    python scrape/tcgcsv_images.py --tcg pokemon,mtg --lang jap
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import ROOT_DIR  # noqa: E402
from scrape.common import (RateLimiter, append_manifest, download_image, image_path,  # noqa: E402
                           load_manifest_ids, make_session)

DEFAULT_DB = ROOT_DIR / "web" / "data" / "collectr.db"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DEFAULT_DB))
    ap.add_argument("--tcg", default="pokemon", help="comma-separated tcg ids (pokemon, mtg, yugioh, onepiece, ...)")
    ap.add_argument("--lang", choices=["eng", "jap", "all"], default="all")
    ap.add_argument("--size", choices=["400w", "in_1000x1000"], default="400w")
    ap.add_argument("--threads", type=int, default=8)
    ap.add_argument("--max-images", type=int, default=0)
    args = ap.parse_args()

    tcgs = [t.strip() for t in args.tcg.split(",") if t.strip()]
    con = sqlite3.connect(args.db)
    q = ("SELECT id, name, set_code, set_name, card_number, rarity, language, image_url FROM cards "
         "WHERE id LIKE 'tp:%%' AND card_number IS NOT NULL AND image_url IS NOT NULL AND tcg IN (%s)" % ",".join("?" * len(tcgs)))
    params: list = list(tcgs)
    if args.lang != "all":
        q += " AND language = ?"
        params.append(args.lang)
    rows = con.execute(q, params).fetchall()
    con.close()
    known = load_manifest_ids()
    jobs = []
    for cid, name, set_code, set_name, number, rarity, lang, url in rows:
        if cid in known:
            continue
        pid = cid[3:]
        img_url = url.replace("_200w.jpg", f"_{args.size}.jpg")
        dest = image_path("pokemon" if "pokemon" in tcgs and len(tcgs) == 1 else "tcgplayer", f"{set_code or 'unk'}_{lang}", f"tp-{pid}")
        row = {
            "card_id": cid, "source_id": pid, "tcg": tcgs[0] if len(tcgs) == 1 else "tcgplayer", "name": name,
            "set_code": set_code, "set_name": set_name, "card_number": number, "rarity": rarity, "language": lang,
            "variant": None, "image_url": url.replace("_200w.jpg", "_in_1000x1000.jpg"),
            "image_path": dest.relative_to(dest.parents[3]).as_posix(),
        }
        jobs.append((row, dest, img_url))
        if args.max_images and len(jobs) >= args.max_images:
            break
    print(f"{len(rows)} products, {len(known)} already in manifest, {len(jobs)} images to download")

    session = make_session({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) collectr-clone-personal/0.1", "Accept": "image/*"})
    limiter = RateLimiter(min_interval=0.04)
    done: list[dict] = []
    failed = 0
    with ThreadPoolExecutor(max_workers=args.threads) as ex:
        futs = {ex.submit(download_image, session, url, dest, limiter=limiter): row for row, dest, url in jobs}
        for fut in tqdm(as_completed(futs), total=len(futs), desc="tcgplayer images"):
            row = futs[fut]
            try:
                ok = fut.result()
            except Exception:  # noqa: BLE001
                ok = False
            if ok:
                done.append(row)
                if len(done) >= 500:
                    append_manifest(done)
                    done = []
            else:
                failed += 1
    if done:
        append_manifest(done)
    print(f"done: {len(jobs) - failed} downloaded, {failed} failed")


if __name__ == "__main__":
    main()
