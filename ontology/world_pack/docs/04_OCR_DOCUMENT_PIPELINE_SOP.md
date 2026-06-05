# OCR Document Pipeline SOP

## Scope
Covers public, licensed or enterprise-owned documents, including PDFs, scanned PDFs, HTML reports, public filings, standards overviews, public-domain books and archives.

## Pipeline
1. Download under licence/terms.
2. Hash original file.
3. Store original in object storage.
4. Extract metadata.
5. Extract embedded text.
6. Detect scanned/low-text pages.
7. Run OCR only where permitted.
8. Capture OCR confidence, language and page quality.
9. Chunk text.
10. Create citation anchors.
11. Extract entities, dates, places, identifiers and measurements.
12. Map extracted facts to ontology.
13. Embed permitted chunks into vector memory.
14. Write provenance and audit.

## Quality metrics
- OCR confidence
- page coverage
- citation anchor rate
- parser error rate
- duplicate rate
- language detection confidence
- extraction completeness
- source trust score
