"""Download every Yu-Gi-Oh! card image from YGOProDeck (free, no key).

One call to /cardinfo.php returns the whole database. YGOProDeck asks you to cache
locally and not hammer their image host, so we keep ~5 req/s.

Usage: python scrape/ygoprodeck.py [--max-images N]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import DATA_DIR, YGOPRODECK_BASE  # noqa: E402
from scrape.common import (RateLimiter, append_manifest, download_image, get_json,  # noqa: E402
                           image_path, load_manifest_ids, make_session)

TCG = "yugioh"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-images", type=int, default=0)
    args = ap.parse_args()

    session = make_session()
    limiter = RateLimiter(min_interval=0.2)
    known = load_manifest_ids()

    cache = DATA_DIR / "ygoprodeck_cardinfo.json"
    if not cache.exists():
        data = get_json(session, f"{YGOPRODECK_BASE}/cardinfo.php", params={"misc": "yes"}, limiter=limiter)
        cache.write_text(json.dumps(data), encoding="utf-8")
    cards = json.loads(cache.read_text(encoding="utf-8"))["data"]
    print(f"{len(cards)} Yu-Gi-Oh! cards")

    rows: list[dict] = []
    new_images = 0
    for c in tqdm(cards, desc="yugioh"):
        sets = c.get("card_sets") or [{}]
        set_code = (sets[0].get("set_code") or "unk").split("-")[0]
        for img in c.get("card_images", []):
            source_id = str(img["id"])
            card_id = f"ygo:{source_id}"
            if card_id in known:
                continue
            dest = image_path(TCG, set_code, source_id)
            if not download_image(session, img["image_url"], dest, limiter=limiter):
                continue
            rows.append({
                "card_id": card_id, "source_id": source_id, "tcg": TCG, "name": c["name"],
                "set_code": set_code, "set_name": sets[0].get("set_name"),
                "card_number": sets[0].get("set_code"), "rarity": sets[0].get("set_rarity"),
                "language": "en", "variant": None,
                "image_url": img["image_url"], "image_path": dest.relative_to(dest.parents[3]).as_posix(),
            })
            known.add(card_id)
            new_images += 1
            if len(rows) >= 200:
                append_manifest(rows)
                rows = []
            if args.max_images and new_images >= args.max_images:
                break
        if args.max_images and new_images >= args.max_images:
            break
    if rows:
        append_manifest(rows)
    print(f"downloaded {new_images} new images")


if __name__ == "__main__":
    main()
