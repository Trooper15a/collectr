"""Manifest-backed dataset with phone-camera style augmentations.

Each card has exactly one reference image, so positives are made by augmenting the same
image twice. The "anchor" view is lightly augmented (looks like the clean DB scan); the
"positive" view is heavily augmented (looks like a phone photo: tilted, glare, blur, crop).
"""
from __future__ import annotations

import json
import random
from pathlib import Path

import torch
from PIL import Image, ImageDraw, ImageFilter
from torch.utils.data import Dataset
from torchvision import transforms as T

from config import DATA_DIR, IMAGE_SIZE, MANIFEST_PATH
from model import MEAN, STD


def read_manifest(path: Path = MANIFEST_PATH) -> list[dict]:
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def resolve_image(row: dict) -> Path:
    """image_path in the manifest is relative to ml/data (e.g. images/pokemon/sv1_eng/abc.jpg)."""
    p = Path(row["image_path"])
    return p if p.is_absolute() else DATA_DIR / p


def check_images(rows: list[dict], sample: int = 50) -> None:
    """Fail fast if the manifest points at files that don't exist (wrong cwd, moved data dir...)."""
    missing = [r["card_id"] for r in rows[:sample] if not resolve_image(r).exists()]
    if missing:
        raise FileNotFoundError(f"{len(missing)}/{min(sample, len(rows))} sampled images missing, e.g. "
                                f"{resolve_image(rows[0])}. Is ml/data/images populated?")


_warned = False


def _load(row: dict) -> Image.Image:
    global _warned
    try:
        return Image.open(resolve_image(row)).convert("RGB")
    except Exception as e:  # noqa: BLE001
        if not _warned:
            _warned = True
            print(f"[dataset] WARNING could not load {resolve_image(row)}: {e} (using black image; further warnings suppressed)")
        return Image.new("RGB", (IMAGE_SIZE, IMAGE_SIZE), (0, 0, 0))


class Glare:
    """Simulate sleeve / toploader glare with a soft white blob."""

    def __init__(self, p: float = 0.35):
        self.p = p

    def __call__(self, img: Image.Image) -> Image.Image:
        if random.random() > self.p:
            return img
        w, h = img.size
        overlay = Image.new("L", (w, h), 0)
        draw = ImageDraw.Draw(overlay)
        for _ in range(random.randint(1, 3)):
            cx, cy = random.uniform(0, w), random.uniform(0, h)
            rx, ry = random.uniform(w * 0.1, w * 0.5), random.uniform(h * 0.05, h * 0.3)
            draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=random.randint(120, 255))
        overlay = overlay.filter(ImageFilter.GaussianBlur(radius=max(w, h) * 0.08))
        white = Image.new("RGB", (w, h), (255, 255, 255))
        return Image.composite(white, img, overlay.point(lambda v: int(v * random.uniform(0.3, 0.8))))


class Background:
    """Paste the card onto a random background with random padding so borders aren't always cut."""

    def __init__(self, p: float = 0.5):
        self.p = p

    def __call__(self, img: Image.Image) -> Image.Image:
        if random.random() > self.p:
            return img
        w, h = img.size
        pad = random.uniform(0.02, 0.15)
        pw, ph = int(w * (1 + pad * 2)), int(h * (1 + pad * 2))
        bg_color = tuple(random.randint(0, 255) for _ in range(3))
        bg = Image.new("RGB", (pw, ph), bg_color)
        bg.paste(img, (int(w * pad), int(h * pad)))
        return bg


def normalize_tf() -> T.Compose:
    return T.Compose([
        T.Resize((IMAGE_SIZE, IMAGE_SIZE)),
        T.ToTensor(),
        T.Normalize(MEAN, STD),
    ])


def anchor_tf() -> T.Compose:
    return T.Compose([
        T.RandomResizedCrop(IMAGE_SIZE, scale=(0.85, 1.0), ratio=(0.65, 0.8)),
        T.ColorJitter(0.2, 0.2, 0.15, 0.02),
        T.ToTensor(),
        T.Normalize(MEAN, STD),
    ])


def positive_tf() -> T.Compose:
    return T.Compose([
        Background(p=0.5),
        T.RandomPerspective(distortion_scale=0.35, p=0.6),
        T.RandomRotation(degrees=18, expand=False, fill=0),
        T.RandomResizedCrop(IMAGE_SIZE, scale=(0.55, 1.0), ratio=(0.6, 0.9)),
        T.ColorJitter(0.5, 0.5, 0.4, 0.06),
        Glare(p=0.4),
        T.RandomApply([T.GaussianBlur(5, sigma=(0.1, 2.0))], p=0.35),
        T.RandomGrayscale(p=0.03),
        T.ToTensor(),
        T.RandomErasing(p=0.2, scale=(0.02, 0.1)),
        T.Normalize(MEAN, STD),
    ])


class CardPairs(Dataset):
    def __init__(self, rows: list[dict]):
        self.rows = rows
        self.anchor = anchor_tf()
        self.positive = positive_tf()

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int):
        img = _load(self.rows[idx])
        return self.anchor(img), self.positive(img), idx


class CardImages(Dataset):
    """Clean images for computing reference embeddings."""

    def __init__(self, rows: list[dict]):
        self.rows = rows
        self.tf = normalize_tf()

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int):
        return self.tf(_load(self.rows[idx])), idx


def collate_pairs(batch):
    a = torch.stack([b[0] for b in batch])
    p = torch.stack([b[1] for b in batch])
    ids = torch.tensor([b[2] for b in batch])
    return a, p, ids
