"""Download every Magic: The Gathering card image from Scryfall bulk data (free, no key).

Uses the "default_cards" bulk file so only ONE metadata call is made; images are fetched
at ~10 req/s as Scryfall's guidelines ask. Double-faced cards contribute one image per face.

Usage: python scrape/scryfall.py [--max-images N]
"""
from __future__ import annotations

import argparse
import gzip
import json
import sys
from pathlib import Path

from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import DATA_DIR, SCRYFALL_BASE  # noqa: E402
from scrape.common import (RateLimiter, append_manifest, download_image, get_json,  # noqa: E402
                           image_path, load_manifest_ids, make_session)

TCG = "mtg"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-images", type=int, default=0)
    args = ap.parse_args()

    session = make_session()
    limiter = RateLimiter(min_interval=0.1)
    known = load_manifest_ids()

    bulk = get_json(session, f"{SCRYFALL_BASE}/bulk-data", limiter=limiter)
    entry = next(b for b in bulk["data"] if b["type"] == "default_cards")
    # Scryfall (2026) serves bulk data as gzipped JSONL via `jsonl_download_uri`; older API had `download_uri` (JSON array).
    url = entry.get("jsonl_download_uri") or entry.get("download_uri")
    if not url:
        sys.exit(f"Scryfall bulk entry has no download url: {entry}")
    cache = DATA_DIR / ("scryfall_default_cards.jsonl.gz" if url.endswith(".gz") else "scryfall_default_cards.json")
    if not cache.exists():
        print(f"downloading bulk file ({(entry.get('compressed_size') or entry.get('size') or 0) / 1e6:.0f} MB)...")
        with session.get(url, timeout=1800, stream=True) as r:
            r.raise_for_status()
            with open(cache, "wb") as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)
    if cache.suffix == ".gz":
        with gzip.open(cache, "rt", encoding="utf-8") as f:
            cards = [json.loads(line) for line in f if line.strip()]
    else:
        cards = json.loads(cache.read_text(encoding="utf-8"))
    print(f"{len(cards)} Scryfall card objects")

    rows: list[dict] = []
    new_images = 0
    for c in tqdm(cards, desc="mtg"):
        if c.get("digital") or c.get("layout") in ("art_series", "token", "emblem"):
            continue
        targets = []
        if "image_uris" in c:
            targets.append((c["id"], c["image_uris"].get("normal"), c["name"]))
        else:
            for i, face in enumerate(c.get("card_faces") or []):
                if "image_uris" in face:
                    targets.append((f"{c['id']}_f{i}", face["image_uris"].get("normal"), face.get("name", c["name"])))
        for source_id, url, name in targets:
            card_id = f"sf:{source_id}"
            if card_id in known or not url:
                continue
            dest = image_path(TCG, c["set"], source_id)
            if not download_image(session, url, dest, limiter=limiter):
                continue
            rows.append({
                "card_id": card_id, "source_id": source_id, "tcg": TCG, "name": name,
                "set_code": c["set"], "set_name": c.get("set_name"),
                "card_number": c.get("collector_number"), "rarity": c.get("rarity"),
                "language": c.get("lang", "en"), "variant": c.get("frame_effects"),
                "image_url": url, "image_path": dest.relative_to(dest.parents[3]).as_posix(),
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
