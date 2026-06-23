# JARVIS · PALANTIR — Unification Record & Audit

**Date:** 2026-06-23 · **Status:** LIVE (running under PM2) · **Surface:** `/opt/jarvis-app-1/palantir/`

This is the unification of **Osiris** (`github.com/simplifaisoul/osiris`, MIT) with the
**JARVIS** backend into ONE interactive intelligence surface — *not two apps side by side*.
Osiris is the body (live world-rendering Common Operating Picture); JARVIS is the brain
(real ontology graph + live-intel backend). The old fake `world_os/` scaffold + ~90 APEX
tabs are superseded by this single surface (left in place, not deleted).

---

## 1. What was dissected

### Osiris (the body — front-of-house)
- Next.js 16 + React 19 single-page dashboard. **One full-screen MapLibre surface with
  z-stacked overlay panels** (no tabs) — exactly the "one interactive thing" model.
- ~50 API routes, **almost all key-free public sources**: OpenSky/ADS-B flights, AISStream
  maritime, CelesTrak satellites, USGS earthquakes, NASA FIRMS fires, GDELT, DeepState
  frontlines, NOAA space-weather, CISA KEV + abuse.ch cyber, a full `osint/*` suite
  (shodan InternetDB, crt.sh certs, RDAP whois, BGPView, DoH dns, XposedOrNot leaks),
  region-dossier, Sentinel SAR, CCTV.
- **Cleanest integration seam:** `/api/entity/expand` proxies to `INTEL_URL/resolve`
  returning `{nodes,links}` — a drop-in for any ontology backend.
- Separate `intel/` Express resolver (OFAC SDN + Wikidata + RIPEstat) on :4000.

### JARVIS (the brain — the real backend, NOT the fake scaffold)
- FastAPI (:8001) `/v1/graph/*` over a **real 497k-object / 782k-link ontology**
  (`brain.db`, `ontology.db`). Node `{id,label,type,props}`, edge `{a,b,relation,strength}`.
- `/v1/cop`, `/v1/geo`, `/v1/entities`, `getLiveIntel` (USGS/OpenSky/Open-Meteo) — all real.
- The **fake** parts (correctly identified by the owner): the `world_os/` Python scaffold
  and the ~90 stub APEX pages. These are *superseded*, not used by the new surface.

---

## 2. Blending analysis (who wins where)

| Capability | Winner | In the unified surface |
|---|---|---|
| Live world map / COP | **Osiris** | MapLibre base, 16 live layers |
| Flights / maritime / satellites / fires / quakes | **Osiris** (JARVIS lacked UI) | native feeds |
| OSINT / cyber / sanctions | **Osiris** | `osint/*` + intel resolver (19,794 OFAC entries) |
| Knowledge ontology / link analysis | **JARVIS** (497k objects) | `/api/jarvis/graph` → FOUNDRY view |
| Entity resolution (map entities) | **Osiris** intel svc | `/api/entity/expand` |
| Live-intel aggregation | tie | both wired |

The blend: Osiris renders the world; JARVIS's ontology is exposed as the **FOUNDRY** brain
inside the same surface.

---

## 3. Gap audit (two rounds, condensed)

**Round 1 — what the surface was missing to be "JARVIS, real, unified":**
1. JARVIS brain not reachable from Osiris UI → **fixed**: `/api/jarvis/graph` bridge
   translates `{nodes,edges}`→`{nodes,links}` against real `/v1/graph`.
2. Osiris branded/monetised for upstream → **fixed**: rebranded JARVIS; removed `TokenPanel`
   ($OSIRIS pump.fun), `middleware.ts` (Umami IP tracker), Ko-fi donation links, and all
   `osirisai.live` / `@simplifaisoul` metadata. Served HTML has **zero** upstream artifacts.
3. Not running / not in repo → **fixed**: vendored to `palantir/`, built, PM2-managed.

**Round 2 — residual gaps (intentionally deferred, documented not hidden):**
- The four planes are surfaced as live layers (map=Gotham COP, FOUNDRY=JARVIS ontology,
  AIP=AiAnalyst panel, Apollo=health) but AIP still uses Gemini (could be routed to the
  JARVIS LLM) and Apollo is a status panel (not yet PM2-driven). Map-entity types
  (`aircraft/vessel/...`) and ontology types (`topic/...`) are distinct graphs by design.
- Internal fan-out routes (`markets`, `scm-suppliers`) hardcode `127.0.0.1:3000` → surface
  runs on **port 3000** to keep them working.
- Some Osiris feeds need keys for full depth (`AIS_API_KEY` maritime live ships,
  `SCANNER_*` active recon, `GEMINI_API_KEY_*` AI). Everything else is key-free and live.

---

## 4. What runs now

| Process (PM2) | Port | Role |
|---|---|---|
| `jarvis-palantir` | 3000 | the unified Next.js surface (Osiris body + JARVIS bridge) |
| `jarvis-palantir-intel` | 4000 | entity-resolution resolver (OFAC/Wikidata/RIPE) |
| `jarvis-backend` (existing) | 8001 | the JARVIS brain (`/v1/graph` etc.) the bridge calls |

- **Live URL:** http://localhost:3000  (host: http://76.13.176.135:3000)
- Config: `palantir/.env` (`JARVIS_API_BASE=http://127.0.0.1:8001`, `INTEL_URL=http://127.0.0.1:4000`).
- New code: `palantir/src/app/api/jarvis/graph/route.ts` (brain bridge),
  `EntityGraphPanel.tsx` (`source` prop), `page.tsx` (FOUNDRY button + render).
- **Untouched:** theme-locked `server/jarvis_live.html`, the other 24 PM2 processes,
  `world_os/`, the FastAPI backend (bridge is read-only over existing `/v1/graph`).

## 5. Verified live (2026-06-23)
- Surface 200; build green (49 routes). Feeds real and **updating** across samples:
  flights 12,417 → 8,330 → 8,446 (varies by hour), satellites 18,593 → 18,597,
  CCTV 6,041 → 6,365, 50 live USGS quakes (ts = request time), 57 nuclear.
- FOUNDRY: `/api/jarvis/graph` → **7,031 real ontology nodes** from JARVIS brain.
- Intel resolver: 19,794 OFAC sanctions loaded.

## 6. Operate
```bash
# after code changes:
cd /opt/jarvis-app-1/palantir && npm run build && pm2 restart jarvis-palantir
pm2 logs jarvis-palantir --lines 50    # debug
```
To add keys (optional depth): put them in `palantir/.env` then rebuild + restart.
