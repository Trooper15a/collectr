"""Compute reference embeddings for every card in the manifest and write them for the web app.

Outputs (into web/public/model/):
    embeddings.bin  float16, row-major [N, 512]
    index.json      {"model_version", "dim", "count", "cards": [{id, name, set, num, tcg, lang, img}, ...]}

Incremental: with --only-new, cards already present in index.json are skipped and appended.
That is how you add a new set without retraining.

    python embed.py                 # full recompute
    python embed.py --only-new      # append new cards only
"""
from __future__ import annotations

import argparse
import json

import numpy as np
import torch
from torch.utils.data import DataLoader
from tqdm import tqdm

from config import ARTIFACTS_DIR, EMBED_DIM, MODEL_VERSION, WEB_MODEL_DIR
from dataset import CardImages, check_images, read_manifest
from model import load_checkpoint


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


@torch.no_grad()
def compute(model, rows: list[dict], device: torch.device, batch_size: int = 128, workers: int = 4) -> np.ndarray:
    loader = DataLoader(CardImages(rows), batch_size=batch_size, shuffle=False, num_workers=workers,
                        pin_memory=device.type == "cuda")
    out = np.zeros((len(rows), EMBED_DIM), dtype=np.float32)
    for x, idx in tqdm(loader, desc="embedding"):
        with torch.autocast(device.type, dtype=torch.float16, enabled=device.type == "cuda"):
            z = model(x.to(device)).float().cpu().numpy()
        out[idx.numpy()] = z
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", default=str(ARTIFACTS_DIR / "card_embedder.pt"))
    ap.add_argument("--only-new", action="store_true")
    ap.add_argument("--batch-size", type=int, default=128)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--tcg", default="all", help="comma-separated games to include in the scanner index (default all)")
    args = ap.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = load_checkpoint(args.checkpoint, device)
    rows = read_manifest()
    if args.tcg != "all":
        keep = {t.strip() for t in args.tcg.split(",") if t.strip()}
        rows = [r for r in rows if r["tcg"] in keep]
        print(f"{len(rows)} manifest rows match tcg={args.tcg}")
    check_images(rows)

    WEB_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    index_path = WEB_MODEL_DIR / "index.json"
    bin_path = WEB_MODEL_DIR / "embeddings.bin"

    existing_cards: list[dict] = []
    existing_vecs = np.zeros((0, EMBED_DIM), dtype=np.float16)
    if args.only_new and index_path.exists() and bin_path.exists():
        index = json.loads(index_path.read_text(encoding="utf-8"))
        if index.get("model_version") == MODEL_VERSION:
            existing_cards = index["cards"]
            existing_vecs = np.fromfile(bin_path, dtype=np.float16).reshape(-1, EMBED_DIM)
            have = {c["id"] for c in existing_cards}
            rows = [r for r in rows if r["card_id"] not in have]
            print(f"{len(existing_cards)} cards already embedded, {len(rows)} new")

    if rows:
        vecs = compute(model, rows, device, args.batch_size, args.workers).astype(np.float16)
    else:
        vecs = np.zeros((0, EMBED_DIM), dtype=np.float16)

    all_vecs = np.concatenate([existing_vecs, vecs], axis=0)
    all_cards = existing_cards + [card_entry(r) for r in rows]
    all_vecs.tofile(bin_path)
    index_path.write_text(json.dumps({
        "model_version": MODEL_VERSION, "dim": EMBED_DIM, "count": len(all_cards), "cards": all_cards,
    }, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {len(all_cards)} embeddings -> {bin_path} ({bin_path.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
