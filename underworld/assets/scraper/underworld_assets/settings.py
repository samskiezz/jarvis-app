"""Scrapy settings — a polite, license-respecting asset crawler.

Defaults are deliberately conservative: obey robots.txt, autothrottle, identify
ourselves, and cap a run so a sample is cheap. Only CC0/CC-BY sources are
targeted, and every item records its licence + attribution (see pipelines).
"""
BOT_NAME = "underworld_assets"
SPIDER_MODULES = ["underworld_assets.spiders"]
NEWSPIDER_MODULE = "underworld_assets.spiders"

# Be a good citizen.
ROBOTSTXT_OBEY = True
USER_AGENT = "UnderworldAssetBot/1.0 (+simulation art pipeline; contact: admin@projectsolar.cloud)"
AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_START_DELAY = 0.5
AUTOTHROTTLE_MAX_DELAY = 10.0
AUTOTHROTTLE_TARGET_CONCURRENCY = 2.0
CONCURRENT_REQUESTS = 4
CONCURRENT_REQUESTS_PER_DOMAIN = 2
DOWNLOAD_TIMEOUT = 60
RETRY_TIMES = 2
HTTPCACHE_ENABLED = False

# Where downloaded assets + the manifest land (served by the web app).
ASSET_OUT_DIR = "../../web/public/models/scraped"
ASSET_MANIFEST = "../../web/public/models/scraped/assets_manifest.json"

# Only these licences are accepted into the library.
ALLOWED_LICENCES = {"CC0", "CC-BY", "CC-BY-SA"}

ITEM_PIPELINES = {"underworld_assets.pipelines.AssetDownloadPipeline": 300}

# Safety cap for sample/dev runs — override with -s CLOSESPIDER_ITEMCOUNT=N.
CLOSESPIDER_ITEMCOUNT = 25

LOG_LEVEL = "INFO"
TWISTED_REACTOR = "twisted.internet.asyncioreactor.AsyncioSelectorReactor"
