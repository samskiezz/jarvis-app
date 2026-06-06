"""Scrapy spider — concurrent catalogue scraper (the fast engine).

Replaces the sequential urllib fetch with Scrapy's async Twisted engine: dozens of
requests in flight, AutoThrottle for politeness, robots.txt obeyed, retries. It
fetches the DISTINCT allowed catalogue URLs and stores each as a REAL Document
object in the ontology (via the shared ``jarvis_scrape.store_document``), so the
storage/provenance/governance is identical to the sequential path — just ~30-50x
faster.

Run:  python -m server.scrapers.run            # all pending targets
      python -m server.scrapers.run --limit 80
"""

from __future__ import annotations

import scrapy

from ..services import jarvis_scrape as js


class OntologyPipeline:
    """Persist each scraped item as a governed Document object + subject link."""

    def process_item(self, item, spider):
        js.store_document(
            item["url"], item.get("source_name", ""), item.get("subject_id", ""),
            status=item.get("status"), body=item.get("body", ""),
            title=item.get("title", ""),
        )
        spider.stored += 1
        return item


class CatalogueSpider(scrapy.Spider):
    name = "catalogue"
    custom_settings = {
        "CONCURRENT_REQUESTS": 32,
        "CONCURRENT_REQUESTS_PER_DOMAIN": 2,
        "AUTOTHROTTLE_ENABLED": True,
        "AUTOTHROTTLE_START_DELAY": 0.5,
        "AUTOTHROTTLE_TARGET_CONCURRENCY": 8.0,
        "DOWNLOAD_TIMEOUT": 20,
        "ROBOTSTXT_OBEY": True,
        "RETRY_TIMES": 2,
        "COOKIES_ENABLED": False,
        "USER_AGENT": "JarvisResearchBot/1.0 (+governed open-data crawler)",
        "LOG_LEVEL": "ERROR",
        "ITEM_PIPELINES": {"server.scrapers.catalogue_spider.OntologyPipeline": 300},
    }

    def __init__(self, targets=None, **kw):
        super().__init__(**kw)
        self._targets = targets or []   # list of (url, source_name, subject_id)
        self.stored = 0

    async def start(self):
        # Scrapy >= 2.13 async entrypoint (replaces start_requests).
        for url, sn, sid in self._targets:
            yield scrapy.Request(url, callback=self.parse, errback=self.errback,
                                 meta={"sn": sn, "sid": sid}, dont_filter=True)

    def start_requests(self):  # back-compat for older Scrapy
        for url, sn, sid in self._targets:
            yield scrapy.Request(url, callback=self.parse, errback=self.errback,
                                 meta={"sn": sn, "sid": sid}, dont_filter=True)

    def parse(self, response):
        ctype = response.headers.get("Content-Type", b"").decode("latin1", "ignore")
        body = response.text if "html" in ctype or "json" in ctype or "text" in ctype or not ctype else ""
        yield {
            "url": response.url,
            "source_name": response.meta.get("sn", ""),
            "subject_id": response.meta.get("sid", ""),
            "status": response.status,
            "body": body,
            "title": "",
        }

    def errback(self, failure):  # noqa: ANN001 - scrapy signature
        return None
