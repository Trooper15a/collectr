"""Download every Pokemon card image (English + Japanese) from TCGdex (free, keyless, no rate limit).

    GET https://api.tcgdex.net/v2/{lang}/sets            -> [{id, name, cardCount}]
    GET https://api.tcgdex.net/v2/{lang}/sets/{id}       -> {id, name, cards: [{id, localId, name, image}]}
    {image}/low.webp | /high.webp                        -> card art (Japanese art for ja)

~24k English + ~18k Japanese cards; downloads in an hour or two with 8 threads. Resumable.
Card ids are `tcgdex:{lang}:{cardId}` (e.g. tcgdex:ja:SV1a-001); the app resolves them to
PokeWallet cards for pricing at scan time (web/src/lib/resolve.ts).

Usage:
    python scrape/tcgdex.py                 # en + ja
    python scrape/tcgdex.py --lang ja
    python scrape/tcgdex.py --set sv1a --lang en --max-images 20
"""
from __future__ import annotations

import argparse
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import quote

from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scrape.common import (RateLimiter, append_manifest, download_image, get_json,  # noqa: E402
                           image_path, load_manifest_ids, make_session)

TCG = "pokemon"
BASE = "https://api.tcgdex.net/v2"
LANG_MAP = {"en": "eng", "ja": "jap"}


def fetch_set(session, limiter, lang: str, set_id: str) -> dict:
    return get_json(session, f"{BASE}/{lang}/sets/{quote(set_id, safe='')}", limiter=limiter)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", choices=["en", "ja", "all"], default="all")
    ap.add_argument("--set", dest="only_set", default=None)
    ap.add_argument("--size", choices=["low", "high"], default="low", help="low (~245x337) is enough for a 224px model")
    ap.add_argument("--threads", type=int, default=8)
    ap.add_argument("--max-images", type=int, default=0)
    args = ap.parse_args()

    session = make_session()
    limiter = RateLimiter(min_interval=0.05)
    known = load_manifest_ids()
    print(f"manifest already has {len(known)} cards")
    langs = ["en", "ja"] if args.lang == "all" else [args.lang]

    jobs: list[tuple[dict, Path, str]] = []  # (row, dest, url)
    for lang in langs:
        sets = get_json(session, f"{BASE}/{lang}/sets", limiter=limiter)
        if args.only_set:
            sets = [s for s in sets if s["id"].lower() == args.only_set.lower()]
        for s in tqdm(sets, desc=f"listing {lang} sets"):
            try:
                detail = fetch_set(session, limiter, lang, s["id"])
            except Exception as e:  # noqa: BLE001
                print(f"[tcgdex] set {s['id']} failed: {e}")
                continue
            for c in detail.get("cards", []):
                card_id = f"tcgdex:{lang}:{c['id']}"
                if card_id in known or not c.get("image"):
                    continue
                dest = image_path(TCG, f"{s['id']}_{LANG_MAP[lang]}", c["id"], ext="webp")
                row = {
                    "card_id": card_id, "source_id": c["id"], "tcg": TCG, "name": c.get("name") or "",
                    "set_code": s["id"], "set_name": detail.get("name") or s.get("name"), "card_number": c.get("localId"),
                    "rarity": None, "language": LANG_MAP[lang], "variant": None,
                    "image_url": f"{c['image']}/high.webp", "image_path": dest.relative_to(dest.parents[3]).as_posix(),
                }
                jobs.append((row, dest, f"{c['image']}/{args.size}.webp"))
                if args.max_images and len(jobs) >= args.max_images:
                    break
            if args.max_images and len(jobs) >= args.max_images:
                break
        if args.max_images and len(jobs) >= args.max_images:
            break
    print(f"{len(jobs)} images to download")

    done_rows: list[dict] = []
    failed = 0
    with ThreadPoolExecutor(max_workers=args.threads) as ex:
        futures = {ex.submit(download_image, session, url, dest, limiter=limiter): row for row, dest, url in jobs}
        for fut in tqdm(as_completed(futures), total=len(futures), desc="downloading"):
            row = futures[fut]
            try:
                ok = fut.result()
            except Exception:  # noqa: BLE001
                ok = False
            if ok:
                done_rows.append(row)
                if len(done_rows) >= 500:
                    append_manifest(done_rows)
                    done_rows = []
            else:
                failed += 1
    if done_rows:
        append_manifest(done_rows)
    print(f"done: {len(jobs) - failed} downloaded, {failed} failed")


if __name__ == "__main__":
    main()
