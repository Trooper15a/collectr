"""Export the trained model to ONNX for in-browser inference (onnxruntime-web).

The browser loads web/public/model/card_embedder.onnx (~20 MB, cached by the service
worker) and runs it with WebGPU or WASM. Input: float32 [1,3,224,224] normalised with
ImageNet mean/std (NCHW). Output: float32 [1,512], L2-normalised.

    python export.py
"""
from __future__ import annotations

import argparse

import numpy as np
import onnx
import onnxruntime as ort
import torch

from config import ARTIFACTS_DIR, IMAGE_SIZE, WEB_MODEL_DIR
from model import load_checkpoint


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", default=str(ARTIFACTS_DIR / "card_embedder.pt"))
    ap.add_argument("--out", default=str(WEB_MODEL_DIR / "card_embedder.onnx"))
    args = ap.parse_args()

    model = load_checkpoint(args.checkpoint, "cpu")
    dummy = torch.randn(1, 3, IMAGE_SIZE, IMAGE_SIZE)
    WEB_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model, dummy, args.out,
        input_names=["image"], output_names=["embedding"],
        dynamic_axes={"image": {0: "batch"}, "embedding": {0: "batch"}},
        opset_version=17, dynamo=False,
    )
    onnx.checker.check_model(onnx.load(args.out))

    # Verify ORT output matches PyTorch.
    sess = ort.InferenceSession(args.out, providers=["CPUExecutionProvider"])
    x = np.random.randn(2, 3, IMAGE_SIZE, IMAGE_SIZE).astype(np.float32)
    with torch.no_grad():
        ref = model(torch.from_numpy(x)).numpy()
    out = sess.run(None, {"image": x})[0]
    err = np.abs(out - ref).max()
    size_mb = __import__("os").path.getsize(args.out) / 1e6
    print(f"exported {args.out} ({size_mb:.1f} MB), max abs diff vs torch {err:.2e}")
    assert err < 1e-3, "ONNX output diverges from PyTorch"


if __name__ == "__main__":
    main()
