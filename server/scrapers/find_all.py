"""Sweep the document finder across ALL catalogue seeds until exhausted.

    python -m server.scrapers.find_all [--batch 6] [--depth 1] [--max-batches N]

Each batch crawls the next uncrawled sources (katana discovery) and fetches the
documents found, growing the real Document corpus. Resumable via the seed ledger:
stop and re-run any time and it picks up where it left off.
"""

from __future__ import annotations

import argparse
import time

from ..services import jarvis_scrape as s


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", type=int, default=6)
    ap.add_argument("--depth", type=int, default=1)
    ap.add_argument("--per-seed-max", type=int, default=25)
    ap.add_argument("--max-batches", type=int, default=0, help="0 = until exhausted")
    args = ap.parse_args()

    start_docs = s.scraped_count()
    print(f"[find_all] start: {start_docs} docs · {s.seeds_progress()}")
    batches = 0
    while True:
        prog = s.seeds_progress()
        if prog["remaining"] <= 0:
            break
        if args.max_batches and batches >= args.max_batches:
            break
        t0 = time.time()
        r = s.document_finder(seeds_limit=args.batch, depth=args.depth,
                              per_seed_max=args.per_seed_max)
        batches += 1
        print(f"[find_all] batch {batches}: +{r.get('fetched', 0)} docs "
              f"(discovered {r.get('discovered', 0)}) in {time.time() - t0:.0f}s · "
              f"total {s.scraped_count()} · remaining {s.seeds_progress()['remaining']}")
        if r.get("seeds", 0) == 0:
            break

    print(f"[find_all] done: {s.scraped_count()} docs (+{s.scraped_count() - start_docs}) · "
          f"{s.seeds_progress()}")


if __name__ == "__main__":
    main()
