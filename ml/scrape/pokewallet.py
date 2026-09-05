"""Download every Pokemon card image (English + Japanese) and metadata from PokeWallet.

Verified response shapes (2026-09):
    GET /sets -> {"success": true, "data": [{name, set_code, set_id, card_count, language, release_date}]}
    GET /sets/:code?language=jap&page=&limit= -> {"set": {...}, "cards": [Card], "pagination": {total_pages}}
    Card -> {id, card_info: {name, set_name, set_id, card_number, rarity, ...}, images: {languages}, tcgplayer, cardmarket}
    GET /images/:id?size=low|high -> JPEG

Free tier is 100 req/hour, 1000 req/day. One set page (50 cards) is one call and every image is
another, so ~50k cards takes several days on the free tier. Fully resumable: re-run to continue.

Usage:
    python scrape/pokewallet.py            # all sets
    python scrape/pokewallet.py --lang jap # only Japanese sets
    python scrape/pokewallet.py --set SM10 --lang eng
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import POKEWALLET_API_KEY, POKEWALLET_BASE  # noqa: E402
from scrape.common import (RateLimiter, append_manifest, download_image, get_json,  # noqa: E402
                           image_path, load_manifest_ids, make_session)

TCG = "pokemon"


def list_sets(session, limiter) -> list[dict]:
    payload = get_json(session, f"{POKEWALLET_BASE}/sets", limiter=limiter)
    sets = payload if isinstance(payload, list) else payload.get("data", [])
    return [{
        "set_code": str(s["set_code"]),
        "set_id": str(s.get("set_id", "")),
        "name": s.get("name") or str(s["set_code"]),
        "language": (s.get("language") or "eng").lower(),
        "total": s.get("card_count"),
        "release_date": s.get("release_date"),
    } for s in sets if s.get("set_code")]


def iter_set_cards(session, limiter, set_code: str, language: str, page_size: int = 50):
    page = 1
    while True:
        params = {"page": page, "limit": page_size, "language": language}
        payload = get_json(session, f"{POKEWALLET_BASE}/sets/{set_code}", params=params, limiter=limiter)
        if payload.get("disambiguation"):
            print(f"[pokewallet] {set_code} ambiguous even with language={language}: {payload.get('matches')}")
            return
        cards = payload.get("cards") or []
        if not cards:
            return
        yield from cards
        total_pages = (payload.get("pagination") or {}).get("total_pages")
        if total_pages is not None and page >= int(total_pages):
            return
        if len(cards) < page_size:
            return
        page += 1


def card_row(card: dict, set_meta: dict) -> dict | None:
    card_id = card.get("id")
    if not card_id:
        return None
    info = card.get("card_info") or {}
    return {
        "card_id": f"pw:{card_id}",
        "source_id": str(card_id),
        "tcg": TCG,
        "name": info.get("name") or "",
        "set_code": set_meta["set_code"],
        "set_name": set_meta["name"],
        "set_id": set_meta["set_id"],
        "card_number": str(info.get("card_number") or ""),
        "rarity": info.get("rarity"),
        "language": set_meta["language"],
        "variant": None,
        "image_url": f"{POKEWALLET_BASE}/images/{card_id}?size=high",
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", choices=["eng", "jap", "all"], default="all")
    ap.add_argument("--set", dest="only_set", default=None)
    ap.add_argument("--size", choices=["low", "high"], default="low",
                    help="low (~500px) is plenty for a 224px model and halves bandwidth")
    ap.add_argument("--max-images", type=int, default=0, help="stop after N new images (0 = unlimited)")
    args = ap.parse_args()

    if not POKEWALLET_API_KEY:
        sys.exit("POKEWALLET_API_KEY missing. Copy ml/.env.example to ml/.env and fill it in.")

    session = make_session({"X-API-Key": POKEWALLET_API_KEY})
    limiter = RateLimiter(per_hour=100, per_day=1000, min_interval=0.5)
    known = load_manifest_ids()
    print(f"manifest already has {len(known)} cards")

    sets = list_sets(session, limiter)
    if args.lang != "all":
        sets = [s for s in sets if s["language"] == args.lang]
    if args.only_set:
        sets = [s for s in sets if s["set_code"].lower() == args.only_set.lower()]
    print(f"{len(sets)} sets to process")

    new_images = 0
    for s in tqdm(sets, desc="sets"):
        rows = []
        for card in iter_set_cards(session, limiter, s["set_code"], s["language"]):
            row = card_row(card, s)
            if row is None or row["card_id"] in known:
                continue
            dest = image_path(TCG, f"{s['set_code']}_{s['language']}", row["source_id"])
            ok = download_image(session, f"{POKEWALLET_BASE}/images/{row['source_id']}", dest,
                                params={"size": args.size}, limiter=limiter)
            if not ok:
                continue
            row["image_path"] = dest.relative_to(dest.parents[3]).as_posix()
            rows.append(row)
            known.add(row["card_id"])
            new_images += 1
            if args.max_images and new_images >= args.max_images:
                break
        if rows:
            append_manifest(rows)
        if args.max_images and new_images >= args.max_images:
            break
    print(f"downloaded {new_images} new images")


if __name__ == "__main__":
    main()
