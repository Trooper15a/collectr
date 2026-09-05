"""Auto-update the scanner index with new cards — no retraining needed.

Uses TCGdex (free, no API key, no rate limit) to find new Pokemon cards,
downloads images with 8 parallel threads, computes embeddings with the
existing model, and appends to the web app's index.

Usage:
    python update_index.py                    # check for new Pokemon cards
    python update_index.py --rebuild-web      # also run npm build after updating

Typically completes in under 2 minutes when only a few new sets exist.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import quote

import numpy as np
import torch
from torch.utils.data import DataLoader
from tqdm import tqdm

from config import (ARTIFACTS_DIR, DATA_DIR, EMBED_DIM,
                    MANIFEST_PATH, MODEL_VERSION, WEB_MODEL_DIR)
from dataset import CardImages
from model import load_checkpoint
from scrape.common import (RateLimiter, append_manifest, download_image,
                           get_json, image_path, load_manifest_ids,
                           make_session)

TCGDEX_BASE = "https://api.tcgdex.net/v2"
LANG_MAP = {"en": "eng", "ja": "jap"}


def fetch_new_cards(existing_ids: set[str], threads: int = 8) -> list[dict]:
    """Fetch new Pokemon cards from TCGdex (free, no rate limit)."""
    session = make_session()
    limiter = RateLimiter(min_interval=0.05)

    new_jobs: list[tuple[dict, Path, str]] = []

    for lang in ["en", "ja"]:
        lang_short = LANG_MAP[lang]
        print(f"[update] checking {lang} sets...")
        sets = get_json(session, f"{TCGDEX_BASE}/{lang}/sets", limiter=limiter)

        for s in tqdm(sets, desc=f"scanning {lang} sets"):
            try:
                detail = get_json(session, f"{TCGDEX_BASE}/{lang}/sets/{quote(s['id'], safe='')}",
                                  limiter=limiter)
            except Exception as e:
                print(f"[update] set {s['id']} failed: {e}")
                continue

            has_new = False
            for c in detail.get("cards", []):
                card_id = f"tcgdex:{lang}:{c['id']}"
                if card_id in existing_ids or not c.get("image"):
                    continue
                has_new = True
                dest = image_path("pokemon", f"{s['id']}_{lang_short}", c["id"], ext="webp")
                row = {
                    "card_id": card_id, "source_id": c["id"], "tcg": "pokemon",
                    "name": c.get("name") or "",
                    "set_code": s["id"], "set_name": detail.get("name") or s.get("name"),
                    "card_number": c.get("localId"),
                    "rarity": None, "language": lang_short,
                    "image_url": f"{c['image']}/high.webp",
                    "image_path": dest.relative_to(dest.parents[3]).as_posix(),
                }
                new_jobs.append((row, dest, f"{c['image']}/low.webp"))
                existing_ids.add(card_id)

            if has_new:
                print(f"[update] {s['id']} ({lang_short}): new cards found")

    if not new_jobs:
        return []

    print(f"[update] downloading {len(new_jobs)} new card images ({threads} threads)...")
    done_rows: list[dict] = []
    failed = 0
    with ThreadPoolExecutor(max_workers=threads) as ex:
        futures = {ex.submit(download_image, session, url, dest, limiter=limiter): row
                   for row, dest, url in new_jobs}
        for fut in tqdm(as_completed(futures), total=len(futures), desc="downloading"):
            row = futures[fut]
            try:
                ok = fut.result()
            except Exception:
                ok = False
            if ok:
                done_rows.append(row)
            else:
                failed += 1

    if failed:
        print(f"[update] {failed} images failed to download")
    return done_rows


@torch.no_grad()
def compute_embeddings(model, rows: list[dict], device: torch.device,
                       batch_size: int = 128) -> np.ndarray:
    loader = DataLoader(CardImages(rows), batch_size=batch_size, shuffle=False,
                        num_workers=2, pin_memory=device.type == "cuda")
    out = np.zeros((len(rows), EMBED_DIM), dtype=np.float32)
    for x, idx in tqdm(loader, desc="computing embeddings"):
        with torch.autocast(device.type, dtype=torch.float16,
                            enabled=device.type == "cuda"):
            z = model(x.to(device)).float().cpu().numpy()
        out[idx.numpy()] = z
    return out


def card_entry(row: dict) -> dict:
    return {
        "id": row["card_id"],
        "name": row.get("name"),
        "set": row.get("set_code"),
        "setName": row.get("set_name"),
        "num": row.get("card_number"),
        "tcg": row.get("tcg"),
        "lang": row.get("language"),
        "src": row.get("source_id"),
        "img": row.get("image_url"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", default=str(ARTIFACTS_DIR / "card_embedder.pt"))
    ap.add_argument("--batch-size", type=int, default=128)
    ap.add_argument("--threads", type=int, default=8)
    ap.add_argument("--rebuild-web", action="store_true",
                    help="run npm build after updating")
    args = ap.parse_args()

    print("[update] checking for new cards...")
    existing_ids = load_manifest_ids()
    print(f"[update] {len(existing_ids)} cards already in manifest")

    new_rows = fetch_new_cards(existing_ids, threads=args.threads)

    if not new_rows:
        print("[update] no new cards found — index is up to date")
        return

    print(f"[update] {len(new_rows)} new cards downloaded, adding to manifest")
    append_manifest(new_rows)

    # Load existing index
    index_path = WEB_MODEL_DIR / "index.json"
    bin_path = WEB_MODEL_DIR / "embeddings.bin"

    existing_cards: list[dict] = []
    existing_vecs = np.zeros((0, EMBED_DIM), dtype=np.float16)
    if index_path.exists() and bin_path.exists():
        index = json.loads(index_path.read_text(encoding="utf-8"))
        if index.get("model_version") == MODEL_VERSION:
            existing_cards = index["cards"]
            existing_vecs = np.fromfile(bin_path, dtype=np.float16).reshape(-1, EMBED_DIM)

    # Compute embeddings for new cards
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = load_checkpoint(args.checkpoint, device)
    new_vecs = compute_embeddings(model, new_rows, device, args.batch_size)
    new_vecs_f16 = new_vecs.astype(np.float16)

    # Append
    all_vecs = np.concatenate([existing_vecs, new_vecs_f16], axis=0)
    all_cards = existing_cards + [card_entry(r) for r in new_rows]

    all_vecs.tofile(bin_path)
    index_path.write_text(json.dumps({
        "model_version": MODEL_VERSION,
        "dim": EMBED_DIM,
        "count": len(all_cards),
        "cards": all_cards,
    }, ensure_ascii=False), encoding="utf-8")

    print(f"[update] index updated: {len(existing_cards)} -> {len(all_cards)} cards "
          f"({len(new_rows)} added)")
    print(f"[update] {bin_path} ({bin_path.stat().st_size / 1e6:.1f} MB)")

    if args.rebuild_web:
        print("[update] rebuilding web app...")
        subprocess.run(["npm", "run", "build"], cwd=str(WEB_MODEL_DIR.parent.parent / "web"),
                        check=True)
        print("[update] done!")


if __name__ == "__main__":
    main()
