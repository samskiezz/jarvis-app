/**
 * LiveIntelInvestigationCorrelator — F261.
 *
 * Data sources (real — confirmed endpoints):
 *   GET /functions/getLiveIntel
 *       → { earthquakes:[{place,magnitude,time,lat,lng}], crypto:[{symbol,price,change_pct}], fx:[{pair,rate,change_pct}] }
 *   GET /v1/investigations
 *       → [ {id, title, description, status, seeds, ...} ]
 *   POST /v1/jarvis/agent/chat  { message }
 *       → { answer }
 *   POST /v1/voice/tts  { text, voice }  → audio blob (via jarvis:speak-dossier)
 *
 * Logic:
 *   Parallel-fetches live world events and open investigations, then keyword-correlates
 *   quake place names, crypto tickers, and FX pairs against investigation
 *   titles/descriptions to surface FLAGGED vs CLEAR cases.
 *
 * Displays:
 *   - Stat tiles: events / cases / flagged / clear
 *   - ALL / FLAGGED / CLEAR filter tabs + text search
 *   - Per investigation: FLAGGED/CLEAR badge + matched event chips + expand for detail
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence correlation brief + TTS
 *
 * Toggle: ⊕ LIIC at left:215040, bottom:8, zIndex:140.
 * Badge: amber = flagged investigation count (>0).
 * 5 min auto-refresh (polling live events is the bottleneck).
 *
 * Exported helpers for JarvisBrain:
 *   isLiicQuery(q) / buildLiicScript()
 *
 * Voice triggers: "live intel correlator / liic / investigation alert /
 *   world events investigations / quake cases / intel case match /
 *   flagged investigations / world alert cases / correlate investigations"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AM  = "#F5A623";
const GN  = "#4ADE80";
const DIM = "#3A4A55";

const BTN_LEFT   = 215040;
const REFRESH_MS = 300_000; // 5 min
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const LIIC_RE =
  /\b(live intel correlator|liic|investigation alert|world events? investigations?|quake cases?|intel case match|flagged investigations?|world alert cases?|correlat(?:e|or|ion) invest)\b/i;

export function isLiicQuery(t) {
  return LIIC_RE.test(t || "");
}

export async function buildLiicScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [ir, lr] = await Promise.allSettled([
      fetch(`${base}/v1/investigations`, { headers: hdr }).then((r) => r.ok ? r.json() : []),
      fetch(`${base}/functions/getLiveIntel`, { headers: hdr }).then((r) => r.ok ? r.json() : {}),
    ]);
    const raw   = ir.value ?? [];
    const cases = Array.isArray(raw) ? raw : (raw.items ?? raw.results ?? []);
    const intel = lr.value ?? {};
    const quakes = intel.earthquakes ?? [];
    const crypto = intel.crypto ?? [];
    const fx     = intel.fx ?? [];

    const events = deriveEvents(intel);
    const flagged = cases.filter((c) => correlate(c, events).length > 0);

    const eventCount = quakes.length + crypto.length + fx.length;
    if (flagged.length === 0) {
      return (
        `Correlator scanned ${eventCount} live world events against ${cases.length} open investigations. ` +
        `No keyword overlaps detected — all investigations are clear of current world events.`
      );
    }
    const top = flagged[0];
    return (
      `Live intel correlator flagged ${flagged.length} investigation${flagged.length !== 1 ? "s" : ""} ` +
      `from ${cases.length} open cases based on overlap with ${eventCount} live world events ` +
      `(${quakes.length} seismic / ${crypto.length} crypto / ${fx.length} FX). ` +
      `Lead: "${top.title || top.id}".`
    );
  } catch {
    return "Unable to reach the live intel or investigations endpoints at this time.";
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const KIND_COLOR = { QUAKE: "#F87171", CRYPTO: "#A78BFA", FX: GN };

function deriveEvents(intel) {
  const quakes = (intel?.earthquakes ?? []).map((q) => ({
    kind: "QUAKE",
    label: `M${q.magnitude != null ? parseFloat(q.magnitude).toFixed(1) : "?"} ${q.place || "?"}`,
    keyword: (q.place || "").toLowerCase(),
  }));
  const crypto = (intel?.crypto ?? []).map((c) => ({
    kind: "CRYPTO",
    label: `${c.symbol || "?"} ${c.change_pct != null ? (c.change_pct >= 0 ? "+" : "") + parseFloat(c.change_pct).toFixed(1) + "%" : ""}`.trim(),
    keyword: (c.symbol || "").toLowerCase(),
  }));
  const fx = (intel?.fx ?? []).map((f) => ({
    kind: "FX",
    label: `${f.pair || "?"} ${f.change_pct != null ? (f.change_pct >= 0 ? "+" : "") + parseFloat(f.change_pct).toFixed(2) + "%" : ""}`.trim(),
    keyword: (f.pair || "").toLowerCase().replace("/", ""),
  }));
  return [...quakes, ...crypto, ...fx];
}

function correlate(investigation, events) {
  const hay = `${investigation.title || ""} ${investigation.description || ""}`.toLowerCase();
  return events.filter((ev) => ev.keyword && hay.includes(ev.keyword));
}

async function fetchInvestigations() {
  const r = await fetch(`${apiBase()}/v1/investigations`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return Array.isArray(d) ? d : (d.items ?? d.results ?? []);
}

async function fetchLiveIntel() {
  const r = await fetch(`${apiBase()}/functions/getLiveIntel`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function agentAssess(flaggedCount, totalCases, eventCount) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message:
        `Assess in 2 sentences: the live intel correlator flagged ${flaggedCount} of ${totalCases} ` +
        `open investigations from keyword overlap with ${eventCount} live world events ` +
        `(seismic, crypto, FX). What is the operational significance and recommended next action?`,
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "No assessment available.";
}

// ─── sub-components ───────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 56, background: `${color}0d`,
      border: `1px solid ${color}33`, borderRadius: 8,
      padding: "8px 10px", display: "flex", flexDirection: "column", gap: 3,
    }}>
      <span style={{ fontSize: 7, color: DIM, letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color, letterSpacing: 1 }}>{value}</span>
    </div>
  );
}

function EventChip({ ev }) {
  const color = KIND_COLOR[ev.kind] || CY;
  return (
    <span style={{
      fontSize: 6, padding: "1px 5px", borderRadius: 3,
      border: `1px solid ${color}55`, color, background: `${color}11`,
      whiteSpace: "nowrap", display: "inline-block", marginBottom: 2,
    }}>
      {ev.kind} {ev.label}
    </span>
  );
}

function InvRow({ inv, events }) {
  const [expanded, setExpanded] = useState(false);
  const matched   = correlate(inv, events);
  const isFlagged = matched.length > 0;
  const hue       = isFlagged ? AM : GN;

  return (
    <div
      style={{ padding: "7px 12px", borderBottom: `1px solid ${CY}11`, cursor: "pointer" }}
      onClick={() => setExpanded((v) => !v)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          fontSize: 6, padding: "1px 5px", borderRadius: 3,
          border: `1px solid ${hue}55`, color: hue, flexShrink: 0,
        }}>
          {isFlagged ? "⚠ FLAGGED" : "✓ CLEAR"}
        </span>
        <span style={{
          fontSize: 8, color: "#C8D8E0", flex: 1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {inv.title || inv.id || "Untitled"}
        </span>
        {isFlagged && (
          <span style={{ fontSize: 7, color: AM, flexShrink: 0 }}>
            {matched.length} event{matched.length !== 1 ? "s" : ""}
          </span>
        )}
        <span style={{ fontSize: 8, color: DIM, flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 6, paddingLeft: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {inv.description && (
            <div style={{ fontSize: 7, color: DIM, lineHeight: 1.5 }}>
              {inv.description.slice(0, 200)}{inv.description.length > 200 ? "…" : ""}
            </div>
          )}
          {matched.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
              {matched.map((ev, i) => <EventChip key={i} ev={ev} />)}
            </div>
          ) : (
            <div style={{ fontSize: 7, color: DIM }}>No live event overlap.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function LiveIntelInvestigationCorrelator() {
  const [open,      setOpen]      = useState(false);
  const [cases,     setCases]     = useState([]);
  const [intel,     setIntel]     = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [assessing, setAssessing] = useState(false);
  const [dossier,   setDossier]   = useState(null);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, intelRes] = await Promise.allSettled([
        fetchInvestigations(),
        fetchLiveIntel(),
      ]);
      if (invRes.status === "fulfilled")   setCases(invRes.value);
      if (intelRes.status === "fulfilled") setIntel(intelRes.value);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (LIIC_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:liic-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:liic-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function handleAssess() {
    if (assessing) return;
    setAssessing(true);
    setDossier(null);
    try {
      const events  = deriveEvents(intel);
      const flagged = cases.filter((c) => correlate(c, events).length > 0);
      const brief   = await agentAssess(flagged.length, cases.length, events.length);
      setDossier(brief);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } }));
    } catch (_) {
      setDossier("Assessment unavailable.");
    }
    setAssessing(false);
  }

  // derived
  const events  = deriveEvents(intel);
  const flagged = cases.filter((c) => correlate(c, events).length > 0);
  const clear   = cases.filter((c) => correlate(c, events).length === 0);

  const visible = cases
    .filter((c) => {
      if (tab === "FLAGGED") return correlate(c, events).length > 0;
      if (tab === "CLEAR")   return correlate(c, events).length === 0;
      return true;
    })
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (c.title || "").toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => correlate(b, events).length - correlate(a, events).length);

  const badgeCount = flagged.length;
  const TABS = ["ALL", "FLAGGED", "CLEAR"];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 140,
          background: "#091520", border: `1px solid ${CY}44`, borderRadius: 6,
          color: CY, fontSize: 7, padding: "3px 7px", cursor: "pointer",
          letterSpacing: 1, display: "flex", alignItems: "center", gap: 4,
          whiteSpace: "nowrap",
        }}
      >
        ⊕ LIIC
        {badgeCount > 0 && (
          <span style={{
            background: AM, color: "#000", borderRadius: "50%",
            fontSize: 6, width: 12, height: 12, display: "flex",
            alignItems: "center", justifyContent: "center", fontWeight: 700,
          }}>
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 300, bottom: 32, zIndex: 140,
      width: 340, maxHeight: 560,
      background: "rgba(6,16,24,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 10, display: "flex", flexDirection: "column",
      fontFamily: "monospace", boxShadow: `0 0 18px ${CY}22`,
    }}>
      {/* header */}
      <div style={{
        padding: "8px 12px", borderBottom: `1px solid ${CY}22`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 8, color: CY, letterSpacing: 2, fontWeight: 700, flex: 1 }}>
          ⊕ LIVE INTEL CORRELATOR
        </span>
        {loading && <span style={{ fontSize: 8, color: DIM }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: DIM,
          fontSize: 10, cursor: "pointer", lineHeight: 1,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <Tile label="EVENTS"  value={events.length}  color={CY} />
        <Tile label="CASES"   value={cases.length}   color={DIM} />
        <Tile label="FLAGGED" value={badgeCount}     color={badgeCount > 0 ? AM : GN} />
        <Tile label="CLEAR"   value={clear.length}   color={GN} />
      </div>

      {/* tabs + search */}
      <div style={{ padding: "0 12px 6px", display: "flex", gap: 4, alignItems: "center" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontSize: 7, padding: "2px 7px", borderRadius: 4, cursor: "pointer",
              border: `1px solid ${tab === t ? CY : CY + "33"}`,
              color: tab === t ? CY : DIM,
              background: tab === t ? `${CY}14` : "transparent",
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            flex: 1, fontSize: 7, padding: "2px 6px", borderRadius: 4,
            background: "#0a1a24", border: `1px solid ${CY}22`, color: "#C8D8E0",
            outline: "none",
          }}
        />
      </div>

      {/* assess */}
      <div style={{ padding: "0 12px 6px" }}>
        <button
          onClick={handleAssess}
          disabled={assessing}
          style={{
            width: "100%", fontSize: 8, padding: "4px 0", borderRadius: 5, cursor: "pointer",
            border: `1px solid ${CY}55`, color: CY, background: `${CY}0d`,
            opacity: assessing ? 0.6 : 1,
          }}
        >
          {assessing ? "▶ Assessing…" : "▶ ASSESS"}
        </button>
        {dossier && (
          <div style={{
            marginTop: 5, fontSize: 8, color: AM, lineHeight: 1.4,
            padding: "5px 7px", background: `${AM}0a`, borderRadius: 5,
          }}>
            {dossier}
          </div>
        )}
      </div>

      {/* investigation list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {visible.length === 0 ? (
          <div style={{ fontSize: 8, color: DIM, padding: "12px 16px", textAlign: "center" }}>
            {loading ? "Loading…" : "No investigations found."}
          </div>
        ) : (
          visible.map((inv) => (
            <InvRow key={inv.id || inv.title} inv={inv} events={events} />
          ))
        )}
      </div>

      {/* footer */}
      <div style={{
        padding: "5px 12px", borderTop: `1px solid ${CY}11`,
        fontSize: 7, color: DIM, display: "flex", justifyContent: "space-between",
      }}>
        <span>{visible.length} shown · {badgeCount} flagged</span>
        <span>5 min poll · /getLiveIntel + /v1/investigations</span>
      </div>
    </div>
  );
}
