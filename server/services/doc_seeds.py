"""DOC SEEDS — a curated catalogue of high-yield OPEN document/data seed URLs.

Each seed is a real, public, https landing/listing page that deep-crawls into many
documents: government open-data portals, legislative/regulatory registers, official
statistics, open science (arXiv category listings, PubMed Central, Zenodo
communities, OpenAlex, DOAJ, CORE, bioRxiv), open standards (W3C TR index, IETF
RFCs, ISO catalogue, OpenAPI) and intergovernmental bodies (WHO, FAO, UNESCO, NOAA,
NASA, USGS, Copernicus).

These widen the scraper's seed pool well beyond the ~235 CSV-derived catalogue rows
so ``jarvis_scrape.document_finder`` has thousands of high-yield URLs to deep-crawl.
Every URL here is chosen to PASS the expanded ``jarvis_scrape._allowed`` policy —
nothing paywalled or credentialed. stdlib only. Never raises.
"""

from __future__ import annotations

# (url, source_name, subject_id) — every URL is https, public, and a deep listing
# page good for same-host crawling.
CURATED_SEEDS: list[tuple[str, str, str]] = [
    # — government open-data portals —
    ("https://data.gov/", "US Data.gov", "open-data-gov"),
    ("https://catalog.data.gov/dataset", "US Data.gov Catalog", "open-data-gov"),
    ("https://data.gov.uk/", "UK Data.gov.uk", "open-data-gov"),
    ("https://data.gov.uk/search", "UK Data.gov.uk Search", "open-data-gov"),
    ("https://data.europa.eu/en", "EU Open Data Portal", "open-data-gov"),
    ("https://data.europa.eu/data/datasets", "EU Open Data Datasets", "open-data-gov"),
    ("https://data.gov.au/", "Australia Data.gov.au", "open-data-gov"),
    ("https://data.gov.au/dataset", "Australia Data.gov.au Datasets", "open-data-gov"),
    ("https://www.data.gov.fr/", "France Data.gouv", "open-data-gov"),
    ("https://data.gov.ie/dataset", "Ireland Data.gov.ie", "open-data-gov"),
    ("https://data.gov.sg/", "Singapore Data.gov.sg", "open-data-gov"),
    ("https://data.gov.bc.ca/", "British Columbia Open Data", "open-data-gov"),
    # — legislative / regulatory registers —
    ("https://www.govinfo.gov/app/collection/", "GovInfo Collections", "law-regulatory"),
    ("https://www.govinfo.gov/app/collection/cfr", "GovInfo CFR", "law-regulatory"),
    ("https://www.govinfo.gov/app/collection/uscode", "GovInfo US Code", "law-regulatory"),
    ("https://www.govinfo.gov/app/collection/bills", "GovInfo Bills", "law-regulatory"),
    ("https://www.govinfo.gov/app/collection/crpt", "GovInfo Congressional Reports", "law-regulatory"),
    ("https://www.federalregister.gov/documents/search", "Federal Register", "law-regulatory"),
    ("https://www.regulations.gov/search", "Regulations.gov", "law-regulatory"),
    ("https://www.congress.gov/search", "Congress.gov", "law-regulatory"),
    ("https://eur-lex.europa.eu/homepage.html", "EUR-Lex", "law-regulatory"),
    ("https://eur-lex.europa.eu/browse/directories/legislation.html", "EUR-Lex Legislation", "law-regulatory"),
    ("https://www.sec.gov/cgi-bin/srqsb", "SEC Filings", "law-regulatory"),
    ("https://www.sec.gov/edgar/searchedgar/companysearch", "SEC EDGAR", "law-regulatory"),
    # — official statistics / economics —
    ("https://data.worldbank.org/indicator", "World Bank Indicators", "statistics"),
    ("https://data.worldbank.org/country", "World Bank Countries", "statistics"),
    ("https://www.imf.org/en/Data", "IMF Data", "statistics"),
    ("https://stats.oecd.org/", "OECD Statistics", "statistics"),
    ("https://data.oecd.org/", "OECD Data", "statistics"),
    ("https://data.un.org/", "UN Data", "statistics"),
    ("https://ec.europa.eu/eurostat/web/main/data/database", "Eurostat Database", "statistics"),
    ("https://ec.europa.eu/eurostat/databrowser/explore/all/all_themes", "Eurostat Browser", "statistics"),
    ("https://www.bls.gov/data/", "US BLS Data", "statistics"),
    ("https://www.census.gov/data.html", "US Census Data", "statistics"),
    ("https://data.census.gov/", "Census Data Explorer", "statistics"),
    ("https://www.federalreserve.gov/data.htm", "Federal Reserve Data", "statistics"),
    ("https://www.ecb.europa.eu/stats/html/index.en.html", "ECB Statistics", "statistics"),
    ("https://www.bis.org/statistics/index.htm", "BIS Statistics", "statistics"),
    ("https://ilostat.ilo.org/data/", "ILOSTAT Data", "statistics"),
    ("https://ourworldindata.org/", "Our World in Data", "statistics"),
    ("https://ourworldindata.org/charts", "Our World in Data Charts", "statistics"),
    # — open science / scholarly repositories —
    ("https://arxiv.org/list/cs.AI/recent", "arXiv cs.AI", "open-science"),
    ("https://arxiv.org/list/cs.LG/recent", "arXiv cs.LG", "open-science"),
    ("https://arxiv.org/list/cs.CL/recent", "arXiv cs.CL", "open-science"),
    ("https://arxiv.org/list/cs.CV/recent", "arXiv cs.CV", "open-science"),
    ("https://arxiv.org/list/stat.ML/recent", "arXiv stat.ML", "open-science"),
    ("https://arxiv.org/list/math.ST/recent", "arXiv math.ST", "open-science"),
    ("https://arxiv.org/list/physics/recent", "arXiv physics", "open-science"),
    ("https://arxiv.org/list/q-bio/recent", "arXiv q-bio", "open-science"),
    ("https://arxiv.org/list/econ.EM/recent", "arXiv econ.EM", "open-science"),
    ("https://www.ncbi.nlm.nih.gov/pmc/", "PubMed Central", "open-science"),
    ("https://pmc.ncbi.nlm.nih.gov/", "PMC", "open-science"),
    ("https://pubmed.ncbi.nlm.nih.gov/", "PubMed", "open-science"),
    ("https://zenodo.org/communities/", "Zenodo Communities", "open-science"),
    ("https://zenodo.org/search?q=&f=resource_type%3Adataset", "Zenodo Datasets", "open-science"),
    ("https://openalex.org/works", "OpenAlex Works", "open-science"),
    ("https://api.openalex.org/works", "OpenAlex API Works", "open-science"),
    ("https://doaj.org/search/articles", "DOAJ Articles", "open-science"),
    ("https://doaj.org/search/journals", "DOAJ Journals", "open-science"),
    ("https://core.ac.uk/search", "CORE Search", "open-science"),
    ("https://www.biorxiv.org/collection/all", "bioRxiv Collection", "open-science"),
    ("https://www.medrxiv.org/", "medRxiv", "open-science"),
    ("https://hal.science/search/index/", "HAL Open Science", "open-science"),
    ("https://ideas.repec.org/", "RePEc IDEAS", "open-science"),
    ("https://papers.ssrn.com/sol3/DisplayAbstractSearch.cfm", "SSRN Search", "open-science"),
    ("https://datadryad.org/search", "Dryad Search", "open-science"),
    ("https://figshare.com/browse", "Figshare Browse", "open-science"),
    ("https://commons.datacite.org/", "DataCite Commons", "open-science"),
    ("https://orcid.org/", "ORCID", "open-science"),
    ("https://explore.openaire.eu/search/find", "OpenAIRE Explore", "open-science"),
    ("https://www.re3data.org/search", "re3data Registry", "open-science"),
    ("https://search.gesis.org/", "GESIS Search", "open-science"),
    ("https://www.icpsr.umich.edu/web/pages/", "ICPSR", "open-science"),
    ("https://dataverse.harvard.edu/", "Harvard Dataverse", "open-science"),
    ("https://paperswithcode.com/", "Papers With Code", "open-science"),
    ("https://paperswithcode.com/datasets", "Papers With Code Datasets", "open-science"),
    ("https://www.openml.org/search?type=data", "OpenML Datasets", "open-science"),
    ("https://plos.org/", "PLOS", "open-science"),
    ("https://journals.plos.org/plosone/", "PLOS ONE", "open-science"),
    ("https://eric.ed.gov/", "ERIC Education", "open-science"),
    ("https://huggingface.co/datasets", "Hugging Face Datasets", "open-science"),
    ("https://huggingface.co/models", "Hugging Face Models", "open-science"),
    ("https://www.europeana.eu/en/search", "Europeana Search", "open-science"),
    ("https://www.openarchives.org/Register/BrowseSites", "OpenArchives OAI", "open-science"),
    # — open standards / catalogues —
    ("https://www.w3.org/TR/", "W3C Technical Reports", "standards"),
    ("https://www.rfc-editor.org/rfc-index.html", "IETF RFC Index", "standards"),
    ("https://datatracker.ietf.org/doc/", "IETF Datatracker", "standards"),
    ("https://www.iso.org/standards-catalogue/browse-by-ics.html", "ISO Catalogue", "standards"),
    ("https://spec.openapis.org/", "OpenAPI Specification", "standards"),
    ("https://unece.org/trade/uncefact/", "UN/CEFACT Standards", "standards"),
    # — intergovernmental / scientific agencies —
    ("https://www.who.int/data", "WHO Data", "intergovernmental"),
    ("https://www.who.int/publications", "WHO Publications", "intergovernmental"),
    ("https://www.fao.org/statistics/en/", "FAO Statistics", "intergovernmental"),
    ("https://www.fao.org/publications/en/", "FAO Publications", "intergovernmental"),
    ("https://www.unesco.org/en/publications", "UNESCO Publications", "intergovernmental"),
    ("https://www.wto.org/english/res_e/res_e.htm", "WTO Resources", "intergovernmental"),
    ("https://www.noaa.gov/data", "NOAA Data", "intergovernmental"),
    ("https://data.noaa.gov/datasetsearch/", "NOAA Dataset Search", "intergovernmental"),
    ("https://www.nasa.gov/open-data/", "NASA Open Data", "intergovernmental"),
    ("https://data.nasa.gov/browse", "NASA Data Browse", "intergovernmental"),
    ("https://www.usgs.gov/products/data", "USGS Data", "intergovernmental"),
    ("https://www.usgs.gov/products/publications", "USGS Publications", "intergovernmental"),
    ("https://www.copernicus.eu/en/access-data", "Copernicus Data", "intergovernmental"),
    ("https://www.unep.org/resources", "UNEP Resources", "intergovernmental"),
]


def curated_targets() -> list[tuple[str, str, str]]:
    """Return the curated (url, source_name, subject_id) seed catalogue. Never raises."""
    try:
        return list(CURATED_SEEDS)
    except Exception:  # noqa: BLE001
        return []
