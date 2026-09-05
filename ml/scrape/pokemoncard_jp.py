"""Download every Japanese Pokemon card image from the official database (pokemon-card.com).

Card ids on the site are sequential integers (with gaps). Each detail page has the Japanese
name, the set code (regulation logo alt, e.g. SV4a), the collection number ("214 / 190") and
a large image. No API key, no documented rate limit; we keep ~6 req/s with 6 threads.

    python scrape/pokemoncard_jp.py                    # ids 1..--end (default 52000)
    python scrape/pokemoncard_jp.py --start 45000 --end 45100

Card ids are `pcjp:<id>`. The app resolves them to PokeWallet cards for pricing by
"<set code> <number>" (web/src/lib/resolve.ts), the same path as TCGdex cards.
Resumable: ids already in the manifest, and ids known to be empty, are skipped.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import DATA_DIR  # noqa: E402
from scrape.common import (RateLimiter, append_manifest, download_image, image_path,  # noqa: E402
                           load_manifest_ids, make_session)

TCG = "pokemon"
BASE = "https://www.pokemon-card.com"
MISSING_PATH = DATA_DIR / "pokemoncard_jp_missing.txt"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
BLOCKED = threading.Event()

RE_TITLE = re.compile(r'<h1 class="Heading1[^>]*>(.*?)</h1>', re.S)
RE_IMG = re.compile(r'src="(/assets/images/card_images/large/[^"]+)"')
RE_SUB = re.compile(r'class="subtext[^"]*">(.*?)</div>', re.S)
RE_REGU = re.compile(r'regulation_logo[^>]*alt="([^"]*)"')
RE_PACK = re.compile(r'<li class="List_item">(.*?)</li>', re.S)
RE_TAGS = re.compile(r"<[^>]+>")


def parse_detail(h: str) -> dict | None:
    t = RE_TITLE.search(h)
    img = RE_IMG.search(h)
    if not t or not img:
        return None
    sub = RE_SUB.search(h)
    subtext = html.unescape(RE_TAGS.sub("", sub.group(1))).strip() if sub else ""
    # "214 / 190" -> number "214", total "190"; old style "DPBP#258" -> number "DPBP#258"
    m = re.match(r"^\s*([A-Za-z0-9-]+)\s*/\s*([A-Za-z0-9-]+)\s*$", subtext)
    number = m.group(1) if m else (subtext or None)
    total = m.group(2) if m else None
    regu = RE_REGU.search(h)
    packs = [html.unescape(RE_TAGS.sub("", p)).strip() for p in RE_PACK.findall(h)]
    return {
        "name": html.unescape(RE_TAGS.sub("", t.group(1))).strip(),
        "image": img.group(1),
        "set_code": regu.group(1) if regu else None,
        "card_number": number,
        "total": total,
        "set_name": packs[0] if packs else None,
    }


def load_missing() -> set[int]:
    if not MISSING_PATH.exists():
        return set()
    return {int(x) for x in MISSING_PATH.read_text().split() if x.strip().isdigit()}


def fetch_one(session: requests.Session, limiter: RateLimiter, card_id: int, size_dir: str) -> tuple[int, dict | None]:
    if BLOCKED.is_set():
        return card_id, {"error": "blocked"}
    limiter.wait()
    try:
        r = session.get(f"{BASE}/card-search/details.php/card/{card_id}/regu/all", timeout=30)
    except requests.RequestException:
        return card_id, {"error": "network"}
    if r.status_code in (403, 429, 503):
        # Rate-limited or blocked by the site's WAF: stop the whole run, never mark ids as empty.
        BLOCKED.set()
        return card_id, {"error": f"http {r.status_code}"}
    if r.status_code == 404:
        return card_id, None
    if r.status_code != 200:
        return card_id, {"error": f"http {r.status_code}"}
    info = parse_detail(r.text)
    if not info:
        return card_id, None
    ext = "gif" if info["image"].lower().endswith(".gif") else "jpg"
    dest = image_path(TCG, f"{info['set_code'] or 'unknown'}_jap", f"pcjp-{card_id}", ext=ext)
    if not download_image(session, BASE + info["image"], dest, limiter=limiter):
        return card_id, {"error": "image"}
    row = {
        "card_id": f"pcjp:{card_id}", "source_id": str(card_id), "tcg": TCG, "name": info["name"],
        "set_code": info["set_code"], "set_name": info["set_name"],
        "card_number": info["card_number"], "rarity": None, "language": "jap", "variant": None,
        "image_url": BASE + info["image"], "image_path": dest.relative_to(dest.parents[3]).as_posix(),
        "total": info["total"],
    }
    return card_id, row


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", type=int, default=1)
    ap.add_argument("--end", type=int, default=52000, help="highest card id to try (site had ~50k as of 2026-09)")
    ap.add_argument("--threads", type=int, default=3)
    ap.add_argument("--rate", type=float, default=2.5, help="max requests per second across all threads (the site blocks around 6/s; 2-3 is safe)")
    args = ap.parse_args()

    session = make_session({"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                            "Accept-Language": "ja,en-US;q=0.9,en;q=0.8", "Referer": f"{BASE}/card-search/index.php"})
    limiter = RateLimiter(min_interval=1.0 / max(0.5, args.rate))
    known = load_manifest_ids()
    missing = load_missing()
    done_ids = {int(k.split(":")[1]) for k in known if k.startswith("pcjp:")}
    todo = [i for i in range(args.start, args.end + 1) if i not in done_ids and i not in missing]
    print(f"{len(done_ids)} already scraped, {len(missing)} known empty, {len(todo)} ids to try")

    rows: list[dict] = []
    new_missing: list[int] = []
    errors = 0
    with ThreadPoolExecutor(max_workers=args.threads) as ex, open(MISSING_PATH, "a") as miss_f:
        futures = [ex.submit(fetch_one, session, limiter, i, "large") for i in todo]
        for fut in tqdm(as_completed(futures), total=len(futures), desc="pokemon-card.com"):
            card_id, row = fut.result()
            if row is None:
                new_missing.append(card_id)
                miss_f.write(f"{card_id}\n")
            elif "error" in row:
                errors += 1
                if row["error"] == "blocked" and errors == 1:
                    pass
            else:
                rows.append(row)
                if len(rows) >= 200:
                    append_manifest(rows)
                    rows = []
    if rows:
        append_manifest(rows)
    print(f"done: {len(todo) - len(new_missing) - errors} cards, {len(new_missing)} empty ids, {errors} errors (re-run to retry)")
    if BLOCKED.is_set():
        print("STOPPED: pokemon-card.com returned 403/429 (rate limit / block). Wait an hour or more, then re-run with a lower --rate (2-3).")
        sys.exit(2)


if __name__ == "__main__":
    main()
