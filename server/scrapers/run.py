"""Run the concurrent Scrapy catalogue crawler over the pending targets.

    python -m server.scrapers.run [--limit N]

Loads the DISTINCT allowed, not-yet-fetched catalogue URLs and crawls them
concurrently, storing real Document objects in the ontology. Prints honest
before/after counts and throughput.
"""

from __future__ import annotations

import argparse
import time

from scrapy.crawler import CrawlerProcess

from ..services import jarvis_scrape as js
from .catalogue_spider import CatalogueSpider


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="max targets (0 = all pending)")
    args = ap.parse_args()

    targets = js.all_targets(skip_fetched=True)
    if args.limit:
        targets = targets[: args.limit]
    before = js.scraped_count()
    print(f"[scrapy] {len(targets)} pending targets · {before} already fetched")
    if not targets:
        print("[scrapy] nothing to do")
        return

    t0 = time.time()
    proc = CrawlerProcess(settings={"TELNETCONSOLE_ENABLED": False})
    proc.crawl(CatalogueSpider, targets=targets)
    proc.start()  # blocks until done
    dt = time.time() - t0

    after = js.scraped_count()
    print(f"[scrapy] +{after - before} documents in {dt:.1f}s "
          f"({(after - before) / dt:.1f}/s) · total fetched now {after}")


if __name__ == "__main__":
    main()
