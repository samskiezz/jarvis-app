# Cross-Correlation Daemon Final Spec

## Scrape sources

- Official APIs.
- Direct vendor websites.
- Standards and compliance pages.
- DNSP / utility bulletins.
- Manuals and PDFs.
- Forums / community troubleshooting threads.
- GitHub issues and release notes.
- News/public data feeds only when relevant.

## Jobs

1. Deduplicate before insert.
2. Canonicalize names, aliases, IDs, hashes, slugs, coordinates and source URLs.
3. Link topics, documents, measurements, assets, places and events.
4. Detect conflicts and score confidence.
5. Use deterministic rules and embeddings before any LLM.
6. Recommend tier routing before strong-model use.
7. Maintain a canonical entity graph and merge history.

## Sleep Mode research rule

If user says they are going to sleep and autonomous work involves uncertain external facts, dependency changes, vendor behaviour, APIs, compliance, or technical claims, require:

1. one web search,
2. one official/direct source,
3. one forum/community/source-of-truth discussion.

Local deterministic UI/code cleanup and non-destructive tests do not require external research.
