"""Backfill TCGPlayer price history from TCGCSV's daily archives into the app database.

TCGCSV publishes one 7z per day (https://tcgcsv.com/archive/tcgplayer/prices-YYYY-MM-DD.ppmd.7z,
~4 MB) containing {date}/{category}/{group}/prices JSON for every category. This script pulls
the last N days for the chosen categories, writes delta-compressed rows into price_history for
every product the app already knows (cards.id = tp:<productId>), and rebuilds the daily
portfolio value snapshots so the dashboard chart has history too.

    python backfill_prices.py                      # last 365 days, Pokémon EN + JP
    python backfill_prices.py --days 90 --categories 3,85,1

Safe to re-run: existing rows are replaced, archives are cached in ml/data/tcgcsv_archive/.
"""
from __future__ import annotations

import argparse
import io
import json
import re
import sqlite3
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from pathlib import Path

import py7zr
import requests
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import DATA_DIR, ROOT_DIR  # noqa: E402

ARCHIVE_DIR = DATA_DIR / "tcgcsv_archive"
ARCHIVE_URL = "https://tcgcsv.com/archive/tcgplayer/prices-{d}.ppmd.7z"
DEFAULT_DB = ROOT_DIR / "web" / "data" / "collectr.db"

# Must match web/src/lib/tcgcsv.ts variantKey()
SUBTYPE_KEYS = {
    "normal": "normal", "holofoil": "holofoil", "reverse holofoil": "reverseHolofoil", "1st edition": "1stEdition",
    "1st edition holofoil": "1stEditionHolofoil", "unlimited": "unlimited", "unlimited holofoil": "unlimitedHolofoil",
    "foil": "foil", "etched": "etched",
}
CONDITION_MULT = {"NM": 1, "LP": 0.85, "MP": 0.7, "HP": 0.5, "DMG": 0.35}
GRADE_MULT = {"PSA 10": 3.0, "PSA 9": 1.4, "PSA 8": 1.0, "BGS 10": 4.5, "BGS 9.5": 2.5, "BGS 9": 1.3, "CGC 10": 2.8, "CGC 9.5": 1.6, "CGC 9": 1.2}
ROUGH_USD = {"USD": 1, "EUR": 1.09, "GBP": 1.28, "CAD": 0.74, "JPY": 0.0067, "AUD": 0.66}


def variant_key(sub: str | None) -> str:
    s = (sub or "Normal").strip()
    if s.lower() in SUBTYPE_KEYS:
        return SUBTYPE_KEYS[s.lower()]
    camel = re.sub(r"\s+(\w)", lambda m: m.group(1).upper(), s)
    return camel[:1].lower() + camel[1:]


def download(d: date, session: requests.Session) -> Path | None:
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    dest = ARCHIVE_DIR / f"prices-{d.isoformat()}.ppmd.7z"
    if dest.exists() and dest.stat().st_size > 1000:
        return dest
    try:
        r = session.get(ARCHIVE_URL.format(d=d.isoformat()), timeout=120)
    except requests.RequestException:
        return None
    if r.status_code != 200 or len(r.content) < 1000:
        return None
    dest.write_bytes(r.content)
    return dest


def read_prices(archive: Path, categories: set[str]) -> dict[int, list[dict]]:
    """Return {productId: [price rows]} for the given categories from one day's archive."""
    out: dict[int, list[dict]] = {}
    with py7zr.SevenZipFile(archive) as z:
        names = [n for n in z.getnames() if len(n.split("/")) == 4 and n.split("/")[1] in categories and n.endswith("/prices")]
        if not names:
            return out
        buf: dict[str, bytes] = {}

        class Keep(io.BytesIO):
            """py7zr closes the writer after extracting; keep the bytes."""
            def __init__(self, name: str):
                super().__init__()
                self.name_ = name
            def close(self):
                buf[self.name_] = self.getvalue()
                super().close()

        class Factory:
            def create(self, filename):
                return Keep(filename)

        z.reset()
        z.extract(targets=names, factory=Factory())
        files = {k: io.BytesIO(v) for k, v in buf.items()}
        for name, fh in files.items():
            try:
                fh.seek(0)
                payload = json.load(fh)
            except Exception:  # noqa: BLE001
                continue
            for row in payload.get("results", []):
                pid = row.get("productId")
                if pid is None or row.get("marketPrice") is None:
                    continue
                out.setdefault(int(pid), []).append(row)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=365)
    ap.add_argument("--categories", default="3,85")
    ap.add_argument("--db", default=str(DEFAULT_DB))
    ap.add_argument("--threads", type=int, default=6)
    args = ap.parse_args()
    categories = {c.strip() for c in args.categories.split(",") if c.strip()}

    con = sqlite3.connect(args.db, timeout=60)
    con.execute("PRAGMA journal_mode=WAL")
    known = {int(r[0][3:]) for r in con.execute("SELECT id FROM cards WHERE id LIKE 'tp:%'")}
    print(f"{len(known)} TCGPlayer products in the app database")

    today = date.today()
    days = [today - timedelta(days=i) for i in range(args.days, 0, -1)]  # oldest -> yesterday
    session = requests.Session()
    session.headers["User-Agent"] = "collectr-clone-personal/0.1"
    with ThreadPoolExecutor(max_workers=args.threads) as ex:
        archives = list(tqdm(ex.map(lambda d: download(d, session), days), total=len(days), desc="downloading archives"))

    # Delta compression: keep a point when the price changes or the last kept point is > 6 days old.
    last: dict[tuple[int, str], tuple[date, float]] = {}
    for pid, variant, d, price in con.execute(
        "SELECT CAST(substr(card_id, 4) AS INTEGER), variant_type, date, tcgplayer_market FROM price_history "
        "WHERE card_id LIKE 'tp:%' AND tcgplayer_market IS NOT NULL ORDER BY date"
    ):
        last[(pid, variant)] = (date.fromisoformat(d), price)
    # Rebuild from scratch for the backfilled window so re-runs don't leave stale gaps.
    con.execute("DELETE FROM price_history WHERE card_id LIKE 'tp:%' AND date >= ? AND date < ?", (days[0].isoformat(), today.isoformat()))
    last = {k: v for k, v in last.items() if v[0] < days[0]}

    inserted = 0
    for d, archive in tqdm(list(zip(days, archives)), desc="writing history"):
        if archive is None:
            continue
        prices = read_prices(archive, categories)
        rows = []
        for pid, plist in prices.items():
            if pid not in known:
                continue
            for p in plist:
                variant = variant_key(p.get("subTypeName"))
                price = float(p["marketPrice"])
                prev = last.get((pid, variant))
                if prev and prev[1] == price and (d - prev[0]).days < 6:
                    continue
                rows.append((f"tp:{pid}", d.isoformat(), variant, price))
                last[(pid, variant)] = (d, price)
        con.executemany(
            "INSERT OR REPLACE INTO price_history (card_id, date, variant_type, tcgplayer_market, cardmarket_avg) VALUES (?, ?, ?, ?, NULL)", rows
        )
        con.commit()
        inserted += len(rows)
    print(f"inserted {inserted} history points")

    rebuild_snapshots(con, days[0], today)
    con.close()


def rebuild_snapshots(con: sqlite3.Connection, start: date, end: date) -> None:
    """Recompute daily portfolio values (USD) from price_history for every day in [start, end)."""
    items = con.execute(
        "SELECT i.portfolio_id, i.card_id, i.variant_type, i.quantity, i.condition, i.is_graded, i.grading_company, i.grade, "
        "i.cost_basis, i.cost_currency FROM portfolio_items i"
    ).fetchall()
    if not items:
        print("no portfolio items; skipping snapshots")
        return
    hist: dict[tuple[str, str], list[tuple[str, float]]] = {}
    for card_id, variant, d, tp, cm in con.execute(
        "SELECT card_id, variant_type, date, tcgplayer_market, cardmarket_avg FROM price_history WHERE card_id IN (%s) ORDER BY date"
        % ",".join("?" * len({i[1] for i in items})),
        list({i[1] for i in items}),
    ):
        usd = tp if tp is not None else (cm * ROUGH_USD["EUR"] if cm is not None else None)
        if usd is not None:
            hist.setdefault((card_id, variant), []).append((d, usd))

    def price_at(card_id: str, variant: str, d: str) -> float | None:
        series = hist.get((card_id, variant)) or next((v for (c, _v), v in hist.items() if c == card_id), None)
        if not series:
            return None
        best = None
        for hd, p in series:
            if hd <= d:
                best = p
            else:
                break
        return best

    con.execute("DELETE FROM portfolio_snapshots WHERE date >= ? AND date < ?", (start.isoformat(), end.isoformat()))
    rows = []
    d = start
    while d < end:
        ds = d.isoformat()
        per: dict[int, list[float]] = {}
        cost: dict[int, float] = {}
        count: dict[int, int] = {}
        for pid, card_id, variant, qty, cond, graded, company, grade, cb, cc in items:
            p = price_at(card_id, variant, ds)
            mult = GRADE_MULT.get(f"{company} {grade}", 1.0) if graded else CONDITION_MULT.get(cond, 1.0)
            per.setdefault(pid, []).append((p or 0) * mult * qty)
            cost[pid] = cost.get(pid, 0) + (cb or 0) * ROUGH_USD.get(cc or "USD", 1) * qty
            count[pid] = count.get(pid, 0) + qty
        for pid, vals in per.items():
            rows.append((pid, ds, sum(vals), cost[pid], count[pid]))
        rows.append((0, ds, sum(sum(v) for v in per.values()), sum(cost.values()), sum(count.values())))
        d += timedelta(days=1)
    con.executemany("INSERT OR REPLACE INTO portfolio_snapshots (portfolio_id, date, value_usd, cost_usd, item_count) VALUES (?, ?, ?, ?, ?)", rows)
    con.commit()
    print(f"rebuilt {len(rows)} portfolio snapshot rows")


if __name__ == "__main__":
    main()
