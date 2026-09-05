"""Shared paths and constants for the ML pipeline."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ML_DIR = Path(__file__).resolve().parent
ROOT_DIR = ML_DIR.parent
load_dotenv(ML_DIR / ".env")

DATA_DIR = ML_DIR / "data"
IMAGES_DIR = DATA_DIR / "images"
MANIFEST_PATH = DATA_DIR / "manifest.jsonl"
ARTIFACTS_DIR = ML_DIR / "artifacts"

# Where the web app expects the browser model + embeddings.
WEB_MODEL_DIR = ROOT_DIR / "web" / "public" / "model"

POKEWALLET_BASE = "https://api.pokewallet.io"
POKEWALLET_API_KEY = os.environ.get("POKEWALLET_API_KEY", "")
SCRYFALL_BASE = "https://api.scryfall.com"
YGOPRODECK_BASE = "https://db.ygoprodeck.com/api/v7"

IMAGE_SIZE = 224
EMBED_DIM = 512
MODEL_VERSION = "effb0-v1"

USER_AGENT = "collectr-clone-personal/0.1 (local dataset builder)"
