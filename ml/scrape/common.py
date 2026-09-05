"""Shared helpers for scrapers: rate limiting, retries, manifest writing."""
from __future__ import annotations

import json
import sys
import threading
import time
from pathlib import Path
from typing import Any, Iterable

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import IMAGES_DIR, MANIFEST_PATH, USER_AGENT  # noqa: E402


class RateLimiter:
    """Simple token bucket: at most `per_hour` calls/hour and `per_day` calls/day."""

    def __init__(self, per_hour: int | None = None, per_day: int | None = None, min_interval: float = 0.0):
        self.per_hour = per_hour
        self.per_day = per_day
        self.min_interval = min_interval
        self._hour: list[float] = []
        self._day: list[float] = []
        self._last = 0.0
        self._lock = threading.Lock()

    def wait(self) -> None:
        with self._lock:
            now = time.time()
            if self.min_interval:
                delta = now - self._last
                if delta < self.min_interval:
                    time.sleep(self.min_interval - delta)
            now = time.time()
            self._hour = [t for t in self._hour if now - t < 3600]
            self._day = [t for t in self._day if now - t < 86400]
            if self.per_hour and len(self._hour) >= self.per_hour:
                sleep_for = 3600 - (now - self._hour[0]) + 1
                print(f"[ratelimit] hourly cap hit, sleeping {sleep_for:.0f}s", flush=True)
                time.sleep(sleep_for)
            if self.per_day and len(self._day) >= self.per_day:
                sleep_for = 86400 - (now - self._day[0]) + 1
                print(f"[ratelimit] daily cap hit, sleeping {sleep_for:.0f}s", flush=True)
                time.sleep(sleep_for)
            now = time.time()
            self._hour.append(now)
            self._day.append(now)
            self._last = now


def make_session(headers: dict[str, str] | None = None) -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
    if headers:
        s.headers.update(headers)
    return s


def get_json(session: requests.Session, url: str, *, params: dict | None = None, limiter: RateLimiter | None = None,
             retries: int = 5) -> Any:
    for attempt in range(retries):
        if limiter:
            limiter.wait()
        try:
            r = session.get(url, params=params, timeout=30)
        except requests.RequestException as e:
            print(f"[get_json] {url} error {e}, retry {attempt + 1}", flush=True)
            time.sleep(2 ** attempt)
            continue
        if r.status_code == 429:
            wait = int(r.headers.get("Retry-After", 2 ** attempt * 5))
            print(f"[get_json] 429 on {url}, waiting {wait}s", flush=True)
            time.sleep(wait)
            continue
        if r.status_code >= 500:
            time.sleep(2 ** attempt)
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError(f"failed after {retries} retries: {url}")


def download_image(session: requests.Session, url: str, dest: Path, *, params: dict | None = None,
                   limiter: RateLimiter | None = None, retries: int = 4) -> bool:
    """Download `url` to `dest`. Skips when the file already exists. Returns True on success."""
    if dest.exists() and dest.stat().st_size > 0:
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(retries):
        if limiter:
            limiter.wait()
        try:
            r = session.get(url, params=params, timeout=60, stream=True)
        except requests.RequestException:
            time.sleep(2 ** attempt)
            continue
        if r.status_code == 429:
            time.sleep(int(r.headers.get("Retry-After", 10)))
            continue
        if r.status_code == 404:
            return False
        if r.status_code >= 500:
            time.sleep(2 ** attempt)
            continue
        ctype = r.headers.get("Content-Type", "")
        if not ctype.startswith("image/"):
            return False
        tmp = dest.with_suffix(dest.suffix + ".part")
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1 << 16):
                f.write(chunk)
        # Some CDNs return "Not Found" HTML with an image content type; reject anything that isn't a real image.
        with open(tmp, "rb") as f:
            head = f.read(16)
        if tmp.stat().st_size < 500 or head.lstrip().startswith(b"<"):
            tmp.unlink(missing_ok=True)
            return False
        tmp.replace(dest)
        return True
    return False


def safe_name(s: str) -> str:
    return "".join(c if c.isalnum() or c in "-_." else "_" for c in str(s))[:120]


_manifest_lock = threading.Lock()


def load_manifest_ids() -> set[str]:
    if not MANIFEST_PATH.exists():
        return set()
    ids = set()
    with open(MANIFEST_PATH, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                ids.add(json.loads(line)["card_id"])
    return ids


def append_manifest(rows: Iterable[dict]) -> None:
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _manifest_lock, open(MANIFEST_PATH, "a", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def image_path(tcg: str, set_code: str, card_id: str, ext: str = "jpg") -> Path:
    return IMAGES_DIR / tcg / safe_name(set_code) / f"{safe_name(card_id)}.{ext}"
