"""Train the EfficientNet-B0 card embedding model with contrastive + batch-hard triplet loss.

    python train.py --epochs 12 --batch-size 96

On an 8GB GPU, batch 96 (=192 images per step) with AMP fits comfortably. 50k cards at
batch 96 is ~520 steps/epoch; 12 epochs is roughly 2-4 hours depending on disk speed.
Checkpoints land in artifacts/; the best one is artifacts/card_embedder.pt.
"""
from __future__ import annotations

import argparse
import math
import random
import time

import numpy as np
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader

from config import ARTIFACTS_DIR, EMBED_DIM, MODEL_VERSION
from dataset import CardPairs, collate_pairs, check_images, read_manifest
from model import CardEmbedder


def filter_tcg(rows: list[dict], tcg: str) -> list[dict]:
    if tcg == "all":
        return rows
    keep = {t.strip() for t in tcg.split(",") if t.strip()}
    out = [r for r in rows if r["tcg"] in keep]
    print(f"{len(out)} of {len(rows)} manifest rows match tcg={tcg}")
    return out


SOURCE_PRIORITY = {"tp": 0, "pcjp": 1, "tcgdex": 2, "pw": 3}


def dedupe_for_training(rows: list[dict]) -> list[dict]:
    """One image per physical printing. The same Pokémon card can arrive from TCGPlayer, TCGdex and
    pokemon-card.com; training on all copies as separate classes makes the loss push identical images
    apart. Keep the priced source first. Magic/Yu-Gi-Oh! alternate arts share numbers, so they are kept."""
    best: dict[tuple, dict] = {}
    out = []
    for r in rows:
        src = r["card_id"].split(":")[0]
        num = (r.get("card_number") or "").split("/")[0].strip().lstrip("0").lower()
        if src not in SOURCE_PRIORITY or not num or not r.get("set_code"):
            out.append(r)
            continue
        key = (r["tcg"], "jap" if r["language"] in ("jap", "ja") else "eng", r["set_code"].lower(), num)
        cur = best.get(key)
        if cur is None or SOURCE_PRIORITY[src] < SOURCE_PRIORITY[cur["card_id"].split(":")[0]]:
            best[key] = r
    out.extend(best.values())
    print(f"training rows: {len(out)} (deduped {len(rows) - len(out)} duplicate printings)")
    return out


def nt_xent(a: torch.Tensor, p: torch.Tensor, temperature: float) -> torch.Tensor:
    """Symmetric InfoNCE over the 2B views; the only positive for a_i is p_i (and vice versa)."""
    z = torch.cat([a, p], dim=0)  # [2B, D], already L2-normalised
    sim = z @ z.t() / temperature
    n = a.shape[0]
    sim.fill_diagonal_(-1e4)
    targets = torch.cat([torch.arange(n, 2 * n), torch.arange(0, n)]).to(z.device)
    return F.cross_entropy(sim, targets)


def batch_hard_triplet(a: torch.Tensor, p: torch.Tensor, margin: float) -> torch.Tensor:
    """For each anchor: positive = its own augmented view, negative = hardest other card in batch."""
    sim_ap = (a * p).sum(-1)  # [B]
    sim_an = a @ p.t()  # [B, B]
    sim_an.fill_diagonal_(-2.0)
    sim_aa = a @ a.t()
    sim_aa.fill_diagonal_(-2.0)
    hardest = torch.maximum(sim_an.max(1).values, sim_aa.max(1).values)
    return F.relu(hardest - sim_ap + margin).mean()


@torch.no_grad()
def eval_recall(model: torch.nn.Module, loader: DataLoader, device: torch.device, max_batches: int = 20) -> float:
    """Recall@1: does the heavily-augmented view retrieve its own anchor among the eval pool?"""
    model.eval()
    anchors, positives = [], []
    for i, (a, p, _) in enumerate(loader):
        if i >= max_batches:
            break
        with torch.autocast(device.type, dtype=torch.float16, enabled=device.type == "cuda"):
            anchors.append(model(a.to(device)).float())
            positives.append(model(p.to(device)).float())
    A, P = torch.cat(anchors), torch.cat(positives)
    pred = (P @ A.t()).argmax(1)
    model.train()
    return (pred == torch.arange(len(A), device=device)).float().mean().item()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=12)
    ap.add_argument("--batch-size", type=int, default=96)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--temperature", type=float, default=0.07)
    ap.add_argument("--margin", type=float, default=0.3)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--limit", type=int, default=0, help="train on the first N cards only (smoke test)")
    ap.add_argument("--resume", default=None)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--tcg", default="all", help="comma-separated games to include, e.g. pokemon or pokemon,yugioh (default all)")
    args = ap.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"device: {device}" + (f" ({torch.cuda.get_device_name(0)})" if device.type == "cuda" else ""))

    rows = dedupe_for_training(filter_tcg(read_manifest(), args.tcg))
    check_images(rows)
    if args.limit:
        rows = rows[: args.limit]
    random.shuffle(rows)
    n_eval = max(64, min(2000, len(rows) // 20))
    eval_rows, train_rows = rows[:n_eval], rows[n_eval:]
    print(f"train cards: {len(train_rows)}  eval cards: {len(eval_rows)}")

    persistent = args.workers > 0
    train_loader = DataLoader(CardPairs(train_rows), batch_size=args.batch_size, shuffle=True, drop_last=True,
                              num_workers=args.workers, pin_memory=device.type == "cuda",
                              persistent_workers=persistent, collate_fn=collate_pairs)
    eval_loader = DataLoader(CardPairs(eval_rows), batch_size=args.batch_size, shuffle=False,
                             num_workers=min(2, args.workers), collate_fn=collate_pairs)

    model = CardEmbedder(EMBED_DIM).to(device)
    optim = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    total_steps = args.epochs * len(train_loader)
    warmup = min(300, total_steps // 10)

    def lr_at(step: int) -> float:
        if step < warmup:
            return args.lr * step / max(1, warmup)
        t = (step - warmup) / max(1, total_steps - warmup)
        return args.lr * 0.5 * (1 + math.cos(math.pi * t))

    scaler = torch.amp.GradScaler("cuda", enabled=device.type == "cuda")
    start_epoch, best, step = 0, 0.0, 0
    if args.resume:
        ckpt = torch.load(args.resume, map_location=device, weights_only=False)
        model.load_state_dict(ckpt["model"])
        optim.load_state_dict(ckpt["optim"])
        start_epoch, best, step = ckpt["epoch"] + 1, ckpt.get("best", 0.0), ckpt.get("step", 0)
        print(f"resumed from {args.resume} at epoch {start_epoch}")

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    model.train()
    for epoch in range(start_epoch, args.epochs):
        t0, running = time.time(), 0.0
        for i, (a, p, _) in enumerate(train_loader):
            for g in optim.param_groups:
                g["lr"] = lr_at(step)
            a, p = a.to(device, non_blocking=True), p.to(device, non_blocking=True)
            with torch.autocast(device.type, dtype=torch.float16, enabled=device.type == "cuda"):
                za, zp = model(a), model(p)
            za, zp = za.float(), zp.float()
            loss = nt_xent(za, zp, args.temperature) + batch_hard_triplet(za, zp, args.margin)
            optim.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.unscale_(optim)
            torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            scaler.step(optim)
            scaler.update()
            running += loss.item()
            step += 1
            if (i + 1) % 50 == 0:
                print(f"epoch {epoch} step {i + 1}/{len(train_loader)} loss {running / 50:.4f} "
                      f"lr {lr_at(step):.2e} {(time.time() - t0) / (i + 1):.2f}s/step", flush=True)
                running = 0.0
        recall = eval_recall(model, eval_loader, device)
        print(f"== epoch {epoch} done in {(time.time() - t0) / 60:.1f} min, eval recall@1 {recall:.4f}", flush=True)
        ckpt = {"model": model.state_dict(), "optim": optim.state_dict(), "epoch": epoch, "step": step,
                "best": max(best, recall), "embed_dim": EMBED_DIM, "model_version": MODEL_VERSION}
        torch.save(ckpt, ARTIFACTS_DIR / "last.pt")
        if recall >= best:
            best = recall
            torch.save(ckpt, ARTIFACTS_DIR / "card_embedder.pt")
            print(f"   saved new best -> {ARTIFACTS_DIR / 'card_embedder.pt'}")
    print(f"training finished, best recall@1 {best:.4f}")


if __name__ == "__main__":
    main()
