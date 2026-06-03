"""The shape of a scraped art asset — kept minimal and licence-first."""
import scrapy


class AssetItem(scrapy.Item):
    asset_id = scrapy.Field()        # stable id within the source
    source = scrapy.Field()          # polyhaven | ambientcg | ...
    kind = scrapy.Field()            # model | hdri | texture | image
    category = scrapy.Field()        # nature | building | character | material ...
    name = scrapy.Field()
    file_url = scrapy.Field()        # the actual downloadable file
    extra_urls = scrapy.Field()      # e.g. glTF external textures
    licence = scrapy.Field()         # CC0 | CC-BY | ...
    attribution = scrapy.Field()     # author / required credit
    source_page = scrapy.Field()     # human page for provenance
