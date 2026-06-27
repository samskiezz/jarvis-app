# SPECTRUM_SCHEMA — Full-Spectrum Solar-System Surveillance (Osiris)

Real-data, self-fetching right-drawer panel for the Osiris (palantir) Next.js 16 app.
Mirrors the existing `neo-feed` route shape (force-dynamic, `AbortSignal.timeout`, safe
fallbacks, honest `{ error }` on throttle) and the `FrequencyMonitor` panel pattern
(fixed right drawer, gold `#D4AF37` / cyan `#00E5FF` / red `#FF3D6A` mono glass,
self-fetching `useEffect`). NOT a map layer — opened by a right-tool-rail button in
`page.tsx` via a boolean state (e.g. `showSpectrum`), same as `showFrequency`.

New routes live under `palantir/src/app/api/spectrum/<name>/route.ts`. All routes are
`export const dynamic = 'force-dynamic'`. DONKI routes additionally set
`Cache-Control: public, s-maxage=3600, stale-while-revalidate=7200` because `DEMO_KEY`
is rate-limited to ~30/hr (confirmed live: throttle returns HTTP 429 +
`{"error":{"code":"OVER_RATE_LIMIT", ...}}` — the route must detect `!res.ok` and
return an honest empty payload, never fabricate events).

**Field names below were confirmed by curling each upstream live on 2026-06-23**, except
DONKI event arrays (schema is documented + stable; live arrays were rate-limited mid-audit).

Convention used throughout:
- `updated: string` = ISO-8601 timestamp the route assembled the response (`new Date().toISOString()`).
- `source: string` = human-readable attribution string for the upstream.
- Every numeric upstream value is `Number(...)`-coerced; non-finite → `null` (honest "no data"), never `0` faked.
- Every list field defaults to `[]` on upstream failure; the route still returns `200` with an `error` string when a *sub-feed* fails (partial), or `502` + empty shape when the *whole* route fails (mirrors `neo-feed`).

---

## 1. Normalized JSON response shapes

### `GET /api/spectrum/space-weather`
Fuses ALL SWPC products (no key needed). Each sub-feed is fetched via `Promise.allSettled`
so one failing feed never nulls the rest. Bands:

```ts
interface SpaceWeather {
  xray: {                         // GOES /json/goes/primary/xrays-6-hour.json — long band only
    flux: number | null;          // ← last item where energy==="0.1-0.8nm", field `flux` (W/m²)
    energy: string;               // ← "0.1-0.8nm" (the long band; short "0.05-0.4nm" ignored)
    flareClass: string;           // DERIVED from flux: A(<1e-7) B(1e-7) C(1e-6) M(1e-5) X(1e-4); e.g. "C8.2", "M1.0"
    satellite: number | null;     // ← `satellite` (e.g. 18)
    time: string | null;          // ← `time_tag`
  };
  solarWind: {
    speed: number | null;         // ← summary/solar-wind-speed.json [0].proton_speed (km/s); fallback plasma `speed`
    density: number | null;       // ← solar-wind/plasma-1-day.json last row col `density` (p/cm³)
    temp: number | null;          // ← plasma-1-day.json last row col `temperature` (K)
    bz: number | null;            // ← solar-wind/mag-1-day.json last row col `bz_gsm` (nT); <0 drives storms
    bt: number | null;            // ← mag-1-day.json last row col `bt` (nT, total field)
    time: string | null;          // ← plasma/mag last row col `time_tag`
  };
  kp: {
    value: number | null;         // ← json/planetary_k_index_1m.json last item `kp_index` (0..9); `estimated_kp` fallback
    gScale: string;               // DERIVED: Kp 5→G1 6→G2 7→G3 8→G4 9→G5, else "G0"
    time: string | null;          // ← last item `time_tag`
  };
  protons: {
    flux: number | null;          // ← json/goes/primary/integral-protons-6-hour.json last item where energy===">=10 MeV" (pfu)
    energy: string;               // ← ">=10 MeV"
    sScale: string;               // DERIVED from pfu: 10→S1 100→S2 1e3→S3 1e4→S4 1e5→S5, else "S0"
    time: string | null;          // ← `time_tag`
  };
  electrons: {
    flux: number | null;          // ← json/goes/primary/integral-electrons-6-hour.json last item where energy===">=2 MeV"
    energy: string;               // ← ">=2 MeV"
    time: string | null;          // ← `time_tag`
  };
  scales: {                       // ← products/noaa-scales.json, key "0" (current 24h observed)
    R: { scale: string | null; text: string | null };  // ← ["0"].R.Scale / .Text  (radio blackout)
    S: { scale: string | null; text: string | null };  // ← ["0"].S.Scale / .Text  (radiation storm)
    G: { scale: string | null; text: string | null };  // ← ["0"].G.Scale / .Text  (geomagnetic)
  };
  regions: Array<{               // ← json/solar_regions.json (active sunspot regions, latest observed_date)
    region: number;              // ← `region` (e.g. 4474)
    location: string;            // ← `location` (e.g. "N03W75")
    latitude: number | null;     // ← `latitude`
    longitude: number | null;    // ← `longitude`
    numberSpots: number | null;  // ← `number_spots`
    magClass: string | null;     // ← `mag_class` (e.g. "BG")
    spotClass: string | null;    // ← `spot_class` (e.g. "Cao")
    area: number | null;         // ← `area`
    mFlareProb: number | null;   // ← `m_flare_probability` (%)
    xFlareProb: number | null;   // ← `x_flare_probability` (%)
  }>;
  alerts: Array<{                // ← products/alerts.json (slice 0..10)
    id: string;                  // ← `product_id` (e.g. "TIIA")
    issued: string;              // ← `issue_datetime`
    message: string;             // ← `message`, trimmed to ~240 chars
  }>;
  updated: string;
  source: 'NOAA SWPC (services.swpc.noaa.gov)';
  errors?: string[];             // per-subfeed failures, e.g. ["xray 502","kp timeout"] — present only if non-empty
}
```

### `GET /api/spectrum/donki`
Fetches the 7 NASA DONKI event types in parallel over a 30-day window
(`startDate = today-30`, `endDate = today`, `api_key = process.env.NASA_API_KEY || 'DEMO_KEY'`).
1h server cache. On 429/non-ok per type → that array is `[]` and the type name is pushed to `errors`.

```ts
interface Donki {
  cme: Array<{
    id: string;            // ← `activityID`
    startTime: string;     // ← `startTime`
    sourceLocation: string;// ← `sourceLocation`
    activeRegion: number | null; // ← `activeRegionNum`
    speed: number | null;  // ← cmeAnalyses[isMostAccurate||last].speed (km/s)
    halfAngle: number | null;    // ← cmeAnalyses[…].halfAngle (deg)
    type: string | null;   // ← cmeAnalyses[…].type ("S","C","O","R","ER")
    note: string;          // ← `note`
    link: string;          // ← `link`
  }>;
  flr: Array<{
    id: string;            // ← `flrID`
    classType: string;     // ← `classType` (e.g. "M1.5","X2.0","C3.1")
    beginTime: string;     // ← `beginTime`
    peakTime: string;      // ← `peakTime`
    endTime: string | null;// ← `endTime`
    sourceLocation: string;// ← `sourceLocation`
    activeRegion: number | null; // ← `activeRegionNum`
    link: string;          // ← `link`
  }>;
  gst: Array<{
    id: string;            // ← `gstID`
    startTime: string;     // ← `startTime`
    maxKp: number | null;  // ← max of allKpIndex[].kpIndex
    kpReadings: number;    // ← allKpIndex.length
    link: string;          // ← `link`
  }>;
  sep: Array<{ id: string; eventTime: string; link: string }>;  // ← sepID, eventTime, link
  ips: Array<{ id: string; location: string; eventTime: string; link: string }>; // ← activityID, location, eventTime, link
  rbe: Array<{ id: string; eventTime: string; link: string }>;  // ← rbeID, eventTime, link
  hss: Array<{ id: string; eventTime: string; link: string }>;  // ← hssID, eventTime, link
  window: { startDate: string; endDate: string };
  updated: string;
  source: 'NASA DONKI (api.nasa.gov/DONKI)';
  errors?: string[];       // e.g. ["FLR over_rate_limit"] — DEMO_KEY throttled
}
```

### `GET /api/spectrum/dsn`
Fetches `https://eyes.nasa.gov/dsn/data/dsn.xml` and parses XML → JSON. Deep-space RF band
(real antenna↔spacecraft links). A dish with no active up/down signal still appears, with
empty `dishes[].signals`. Bands present: `S, X, Ka, K` (← `band` attr).

```ts
interface Dsn {
  stations: Array<{
    name: string;          // ← <station name>      (e.g. "gdscc","mdscc","cdscc")
    friendlyName: string;  // ← <station friendlyName> (e.g. "Goldstone","Madrid","Canberra")
    dishes: Array<{
      dish: string;        // ← <dish name>         (e.g. "DSS24")
      activity: string;    // ← <dish activity>     (e.g. "Spacecraft Telemetry, Tracking, and Command")
      elevation: number | null; // ← <dish elevationAngle>
      azimuth: number | null;    // ← <dish azimuthAngle>
      signals: Array<{
        spacecraft: string;   // ← <up|downSignal spacecraft>   (e.g. "JWST","ORX")
        direction: 'up' | 'down'; // ← element tag upSignal/downSignal
        band: string | null;  // ← `band` attr ("S","X","Ka","K") — the RF band
        frequencyHz: number | null; // ← `frequency` attr (Hz; upstream often 0 = unreported)
        dataRateBps: number | null;  // ← `dataRate` attr (bits/s)
        powerDbm: number | null;     // ← `power` attr (dBm; tx for up, rx for down)
      }>;
    }>;
  }>;
  updated: string;         // ← derive ISO from <station timeUTC> (epoch ms) or response time
  source: 'NASA DSN Now (eyes.nasa.gov/dsn)';
  error?: string;
}
```

### `GET /api/spectrum/neo-risk`
Orbital/gravitational band — close approaches + impact-risk objects. Two JPL SSD feeds
(no key). 1 LD (lunar distance) = 0.00257 AU; `distLD = distAU / 0.00257`.

```ts
interface NeoRisk {
  closeApproaches: Array<{   // ← ssd-api.jpl.nasa.gov/cad.api (dist-max=0.05 AU, +60d, limit 50)
    des: string;             // ← fields/data col `des`  (e.g. "2026 MW1")
    date: string;            // ← col `cd`   (close-approach calendar date, e.g. "2026-Jun-23 11:50")
    distAU: number | null;   // ← col `dist` (AU)
    distLD: number | null;   // DERIVED: dist / 0.00257
    velKps: number | null;   // ← col `v_rel` (km/s)
    diameterM: number | null;// ESTIMATED from col `h` (absolute mag) via standard 0.14-albedo formula; null if h missing
    hMag: number | null;     // ← col `h` (raw absolute magnitude, kept for honesty about the estimate)
  }>;
  sentry: Array<{            // ← ssd-api.jpl.nasa.gov/sentry.api (default call)
    des: string;             // ← `des`      (e.g. "1979 XB")
    fullname: string;        // ← `fullname`
    ps: number | null;       // ← `ps_max`   (Palermo Scale, cumulative hazard; higher = riskier)
    ip: number | null;       // ← `ip`       (cumulative impact probability)
    nImp: number | null;     // ← `n_imp`    (number of potential impacts)
    diameterKm: number | null; // ← `diameter` (km)
    velKps: number | null;   // ← `v_inf`    (km/s)
    range: string | null;    // ← `range`    (impact-window years, e.g. "2056-2113")
  }>;
  updated: string;
  source: 'JPL SSD/CNEOS (ssd-api.jpl.nasa.gov)';
  errors?: string[];
}
```

### `GET /api/spectrum/correlate`
Fusion engine. Server-side fetches the 4 routes above (absolute-URL `fetch` against own
origin, `cache:'no-store'`, each guarded so a missing route degrades gracefully) and emits
deterministic correlated events. See §2 for rules.

```ts
type Band = 'xray' | 'radio' | 'solarWind' | 'magnetic' | 'protons' | 'electrons'
          | 'cme' | 'kp' | 'orbital';

interface CorrelatedEvent {
  id: string;              // deterministic, e.g. "solar-eruption", "geo-storm-G2", "neo-2026MW1"
  kind: 'majorSolarEruption' | 'geomagneticStorm' | 'radiationStorm'
      | 'radioBlackout' | 'neoCloseApproach' | 'impactRiskObject';
  severity: number;        // 0..100
  confidence: number;      // 0..1
  bands: Band[];           // which bands contributed (multi-band = higher confidence)
  earthDirected?: boolean; // solar events only: true if CME/source location is geo-effective
  summary: string;         // one-line human description with the driving numbers
  infrastructureRisk: {
    gps: Severity; hfRadio: Severity; satellites: Severity;
    powerGrid: Severity; aviation: Severity;
  };
  recommendation: string;  // concrete operator action
  ts: string;              // ISO timestamp the contributing data was observed
}
type Severity = 'none' | 'low' | 'moderate' | 'high' | 'severe';

interface Correlate {
  events: CorrelatedEvent[];        // sorted by severity desc
  overallThreat: {
    score: number;                  // 0..100 = max event severity (0 if none)
    level: 'NOMINAL' | 'ELEVATED' | 'HIGH' | 'SEVERE';
    headline: string;               // e.g. "All quiet" or "M3.2 flare + earth-directed CME"
  };
  inputs: { spaceWeather: boolean; donki: boolean; dsn: boolean; neoRisk: boolean }; // which sub-routes succeeded
  updated: string;
  errors?: string[];
}
```

---

## 2. Correlation + threat-scoring rules (`/correlate`)

All rules are deterministic, computed from the fetched route payloads. `severity` is
the documented mapping; `overallThreat.score = max(event.severity)`; level thresholds:
`>=80 SEVERE`, `>=55 HIGH`, `>=25 ELEVATED`, else `NOMINAL`.

**A. `radioBlackout` (R-scale)** — from live X-ray class OR DONKI FLR.
- Trigger: `spaceWeather.xray.flux >= 1e-5` (M-class) OR any `donki.flr` with `classType` ≥ M in last 24h.
- Mapping: M1→R1 (sev 30), M5→R2 (45), X1→R3 (65), X10→R4 (80), X20→R5 (90).
- bands: `['xray','radio']`. confidence 0.9 (live X-ray) / 0.7 (DONKI only).
- infrastructureRisk: hfRadio = high/severe (dayside HF blackout), aviation = moderate (polar/HF routes), gps = low→moderate. powerGrid none.
- recommendation: "HF comms degraded on sunlit side; switch to SATCOM/VHF; expect 10–60 min blackout."

**B. `majorSolarEruption`** — the multi-band flagship event.
- Trigger: (X-ray ≥ M1 OR recent DONKI FLR class M/X) **AND** (recent DONKI CME OR SEP OR IPS in window).
- `earthDirected`: true when CME `sourceLocation`/FLR `sourceLocation` is within ±45° longitude of central meridian (e.g. `W00`–`W45`/`E00`–`E45`), or a CME `type` of "ER"/"C"/"O" with non-null speed and the FLR is near disk-center.
- severity: base from flare class (M=40, X=70) + `+15` if earthDirected + `+10` if SEP present (particle radiation) + `+5` if IPS (shock arriving). Cap 100.
- bands: union of `['xray','cme']` plus `'protons'` if SEP, `'magnetic'` if IPS. confidence 0.95 when ≥3 bands agree, 0.8 for 2, 0.6 for 1+DONKI.
- infrastructureRisk: satellites = high (SEU/charging), aviation = high if earthDirected (polar reroute + crew dose), hfRadio = high, gps = moderate→high, powerGrid = moderate (if earthDirected, GIC risk follows).
- recommendation: "Earth-directed eruption — expect geomagnetic storm in 18–72h; alert grid/aviation; monitor /correlate for G-scale escalation." (non-earth-directed → "Limb event, low Earth impact; monitor for backside activity.")

**C. `geomagneticStorm` (G-scale)** — from live Kp OR DONKI GST.
- Trigger: `spaceWeather.kp.value >= 5` OR any `donki.gst.maxKp >= 5`. Reinforced (confidence +0.1) when `solarWind.bz <= -10` (strong southward IMF).
- Mapping: Kp5→G1 (sev 35), 6→G2 (50), 7→G3 (65), 8→G4 (80), 9→G5 (95).
- bands: `['kp','magnetic']` (+`'solarWind'` if Bz corroborates). confidence 0.9 (live Kp) / 0.75 (GST only).
- infrastructureRisk: powerGrid = moderate→severe by G-scale (GIC), gps = moderate→high (positioning error), satellites = moderate (drag + charging), hfRadio = moderate (auroral absorption), aviation = low→moderate (HF + dose at high lat).
- recommendation: "Gx geomagnetic storm — grid operators watch GIC; high-lat aviation expect HF degradation; aurora visible to lower latitudes."

**D. `radiationStorm` (S-scale)** — from live proton flux OR DONKI SEP.
- Trigger: `spaceWeather.protons.flux >= 10` (pfu, ≥10 MeV) OR any `donki.sep` in last 24h.
- Mapping: 10 pfu→S1 (sev 35), 100→S2 (50), 1e3→S3 (65), 1e4→S4 (80), 1e5→S5 (95).
- bands: `['protons']` (+`'cme'`/`'xray'` if a parent eruption is also flagged). confidence 0.9 live / 0.7 SEP-only.
- infrastructureRisk: satellites = high (single-event upsets), aviation = high (polar route dose — reroute trigger at S3+), hfRadio = moderate (polar cap absorption), gps = low, powerGrid = none.
- recommendation: "Solar radiation storm Sx — polar flights reroute at S3+; satellite operators safe-mode sensitive payloads; EVA hold."

**E. `neoCloseApproach`** — from JPL CAD.
- Trigger: any `neoRisk.closeApproaches` with `distLD <= N` (default N = 10 LD).
- severity: scaled by proximity and size — `min(95, round(40*(10/distLD) ... ))` style; closer + larger = higher. Concretely: base 20, `+ up to 40` as distLD→0, `+ up to 25` as diameterM grows past 50/140/300 m thresholds.
- bands: `['orbital']`. confidence 0.95 (JPL ephemeris is precise) — but explicitly NOT an impact warning unless it also appears in Sentry.
- infrastructureRisk: all `none` for a flyby (honest — a close approach is not an impact); set aviation/powerGrid `none`, note in summary it is a non-impacting pass.
- recommendation: "Tracked flyby at {distLD} LD on {date} — no impact risk; observation opportunity."

**F. `impactRiskObject`** — from JPL Sentry.
- Trigger: any `neoRisk.sentry` with `ps > -2` (Palermo) OR `ip >= 1e-4`.
- severity: from Palermo Scale — `ps >= 0`→90, `-1..0`→70, `-2..-1`→45, else not emitted. confidence = clamp(ip-derived), but capped 0.6 because Sentry risks routinely fall off with new observations (state this in summary).
- bands: `['orbital']`.
- infrastructureRisk: all `none` (long-horizon statistical risk, not imminent). recommendation: "Long-horizon impact-risk object (PS {ps}, window {range}); statistical only — risk typically decreases with new astrometry."

**`overallThreat.headline`** is built from the highest-severity event's `summary`, or
`"All bands nominal"` when `events` is empty.

---

## 3. BAND → ROUTE → SOURCE table

LIVE = real machine-readable feed wired into a spectrum route. REFERENCE-SCAFFOLD = no
public live JSON stream; the panel shows an authoritative link + an explicit
"not a live stream" note, `source:'reference'`. Existing-route links are NOT duplicated.

| Band | Status | Route / Source |
|---|---|---|
| **RF — deep-space comms** | LIVE | `/api/spectrum/dsn` ← DSN Now `eyes.nasa.gov/dsn/data/dsn.xml` (S/X/Ka/K antenna links) |
| **RF — radio blackout (solar)** | LIVE | `/api/spectrum/space-weather` → `scales.R` + `/correlate` `radioBlackout` ← SWPC GOES X-ray |
| **Microwave — solar radio flux (F10.7) / radio bursts** | REFERENCE-SCAFFOLD | note "no real-time public JSON"; link DRAO/Penticton `https://www.spaceweather.gc.ca/forecast-prevision/solar-solaire/solarflux/sx-en.php` and NRAO `https://www.cv.nrao.edu` |
| **IR — solar/thermal imaging** | REFERENCE-SCAFFOLD | SDO/AIA is imagery not JSON; link `https://sdo.gsfc.nasa.gov/data/` (image), `source:'reference+image'` |
| **Visible / optical — planet positions** | LIVE-ELSEWHERE (link, do not duplicate) | existing `/api/jarvis/astro` (astropy ephemeris) via SolarSystemTracker; panel LINKS to it |
| **Visible — optical telescope object tracking** | REFERENCE-SCAFFOLD | no real-time public stream; link Minor Planet Center `https://minorplanetcenter.net` |
| **UV / EUV — solar imaging** | REFERENCE-SCAFFOLD | SDO/AIA 171/193/304 Å latest images (not JSON); link `https://sdo.gsfc.nasa.gov/assets/img/latest/` `source:'reference+image'` |
| **X-ray — solar flare flux** | LIVE | `/api/spectrum/space-weather` → `xray` ← SWPC GOES `xrays-6-hour.json` (0.1-0.8nm band) |
| **Gamma — GRB / high-energy transients** | LIVE-ELSEWHERE (link, do not duplicate) | existing `/api/jarvis/grb` ← NASA GCN Circulars; panel LINKS to it, does NOT re-fetch |
| **Cosmic-ray / solar energetic particles** | LIVE | `/api/spectrum/space-weather` → `protons`,`electrons` + `/api/spectrum/donki` → `sep` ← SWPC GOES integral protons/electrons + DONKI SEP |
| **Solar wind (plasma)** | LIVE | `/api/spectrum/space-weather` → `solarWind` ← SWPC plasma-1-day + solar-wind-speed summary |
| **Magnetic (IMF / Bz)** | LIVE | `/api/spectrum/space-weather` → `solarWind.bz/bt` ← SWPC mag-1-day; geomag state in `scales.G`/`kp` |
| **Gravitational / orbital (NEO close-approach + impact)** | LIVE | `/api/spectrum/neo-risk` ← JPL CAD + Sentry; airburst events ← JPL Fireball |
| **Radar — asteroid radar (Goldstone/Arecibo)** | REFERENCE-SCAFFOLD | no real-time public stream; link `https://echo.jpl.nasa.gov/asteroids/` "not a live stream" |
| **Pulsar / planetary-radio astronomy** | REFERENCE-SCAFFOLD | no real-time public JSON; link `https://www.cv.nrao.edu` |
| **Thermal — fireball / airburst energy** | LIVE | `/api/spectrum/neo-risk` (fireball sub-feed) ← JPL Fireball API (`energy`,`impact-e`,`vel`) |
| **Satellite telemetry — deep-space link state** | LIVE | `/api/spectrum/dsn` ← DSN Now (per-spacecraft band/dataRate/power) |
| **Geomagnetic activity (Kp / G-scale)** | LIVE | `/api/spectrum/space-weather` → `kp`,`scales.G` ← SWPC planetary_k_index_1m + noaa-scales |

---

## 12-line summary

1. Five new routes under `palantir/src/app/api/spectrum/`: `space-weather`, `donki`, `dsn`, `neo-risk`, `correlate` — all `force-dynamic`, honest `{error}` on throttle, no faked data.
2. `space-weather` fuses ALL SWPC products (key-free) into bands: xray, solarWind, kp, protons, electrons, scales{R,S,G}, regions[], alerts[] — field names confirmed live 2026-06-23.
3. `donki` fetches 7 NASA DONKI types (CME/FLR/GST/SEP/IPS/RBE/HSS) over a 30-day window, `DEMO_KEY` fallback, 1h server cache (DEMO_KEY is ~30/hr — 429 confirmed and handled).
4. `dsn` parses `eyes.nasa.gov/dsn/data/dsn.xml` → stations[].dishes[].signals[] (S/X/Ka/K band, frequencyHz, dataRateBps, powerDbm).
5. `neo-risk` fuses JPL CAD (close approaches, distLD-derived) + Sentry (Palermo/ip impact risk) + Fireball (thermal airbursts), no key.
6. `correlate` server-fetches the 4 routes and fuses them into deterministic events.
7. Correlate event kinds: `majorSolarEruption`, `geomagneticStorm`, `radiationStorm`, `radioBlackout`, `neoCloseApproach`, `impactRiskObject`.
8. Each event: id, kind, severity(0-100), confidence(0-1), bands[], earthDirected?, infrastructureRisk{gps,hfRadio,satellites,powerGrid,aviation}, recommendation, ts — plus top-level overallThreat{score,level,headline}.
9. LIVE bands: RF(DSN), X-ray, solar wind, magnetic/Bz, Kp/geomagnetic, protons/electrons (cosmic-ray/SEP), orbital NEO (CAD+Sentry), thermal fireball, satellite telemetry, radio-blackout.
10. LINK-not-duplicate bands: gamma (existing `/api/jarvis/grb` GCN), visible/optical planets (existing `/api/jarvis/astro`).
11. REFERENCE-SCAFFOLD bands (honest, no faking): microwave/F10.7, IR-solar, UV/EUV (SDO images), pulsar/planetary-radio (NRAO), asteroid radar (Goldstone/echo.jpl), optical-telescope tracking (MPC).
12. Panel = self-fetching right drawer (gold/cyan/red mono glass) opened by a `page.tsx` right-rail button via a `showSpectrum` boolean — mirrors `FrequencyMonitor`, never a map layer; does not touch FastAPI, jarvis_live.html, or OsirisMap.
