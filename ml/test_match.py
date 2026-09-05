"""Identify a card from a photo using the exported ONNX model + precomputed embeddings.

    python test_match.py path/to/photo.jpg [--top 5] [--expect pw:abc123]

This mirrors exactly what the browser does (same preprocessing, same cosine similarity),
so if it works here it works on the phone.
"""
from __future__ import annotations

import argparse
import json
import sys

import numpy as np
import onnxruntime as ort
from PIL import Image

from config import IMAGE_SIZE, WEB_MODEL_DIR
from model import MEAN, STD


def preprocess(path: str) -> np.ndarray:
    img = Image.open(path).convert("RGB").resize((IMAGE_SIZE, IMAGE_SIZE), Image.BILINEAR)
    x = np.asarray(img, dtype=np.float32) / 255.0
    x = (x - np.array(MEAN, dtype=np.float32)) / np.array(STD, dtype=np.float32)
    return x.transpose(2, 0, 1)[None]  # NCHW


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("photo")
    ap.add_argument("--top", type=int, default=5)
    ap.add_argument("--expect", default=None, help="card_id you expect to win")
    args = ap.parse_args()

    index = json.loads((WEB_MODEL_DIR / "index.json").read_text(encoding="utf-8"))
    vecs = np.fromfile(WEB_MODEL_DIR / "embeddings.bin", dtype=np.float16).reshape(-1, index["dim"]).astype(np.float32)
    sess = ort.InferenceSession(str(WEB_MODEL_DIR / "card_embedder.onnx"), providers=["CPUExecutionProvider"])

    q = sess.run(None, {"image": preprocess(args.photo)})[0][0]
    sims = vecs @ q
    top = np.argsort(-sims)[: args.top]
    print(f"top {args.top} matches for {args.photo}:")
    for rank, i in enumerate(top, 1):
        c = index["cards"][i]
        print(f"  {rank}. {sims[i]:.4f}  {c['id']}  {c['name']}  [{c['tcg']}/{c['set']} #{c['num']} {c['lang']}]")
    if args.expect:
        ok = index["cards"][top[0]]["id"] == args.expect
        print("PASS" if ok else "FAIL", f"(expected {args.expect})")
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
