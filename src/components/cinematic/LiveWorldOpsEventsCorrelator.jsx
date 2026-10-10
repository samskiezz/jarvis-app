/**
 * LiveWorldOpsEventsCorrelator — F569
 * "JARVIS, live world ops / lwops / world ops / ops correlation / real world ops"
 * Cross-references /functions/getLiveIntel + /v1/ops/events.
 * Finds CORRELATED ops events (≥1 live world event keyword-matches) vs ISOLATED.
 * Coverage % tile; ALL/CORRELATED/ISOLATED filter tabs + search; click-to-expand event detail.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4466";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 63_380;
const Z_INDEX  = 132;

const LWOPS_RE =
  /\blwops\b|\blive.?world.?ops\b|\bworld.?ops\b|\bops.?correlation\b|\breal.?world.?ops\b|\blive.?intel.?ops\b|\bworld.?event.?ops\b|\bops.?world.?event\b|\bops.?intel.?signal\b|\bworld.?ops.?event\b/i;

export function isLwopsQuery(text) {
  return LWOPS_RE.test(text || "");
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(keywords(a));
  return keywords(b).filter((w) => sa.has(w)).length;
}

function normaliseLiveEvents(data) {
  if (!data) return [];
  const all = [];

  const quakes = Array.isArray(data.earthquakes) ? data.earthquakes : [];
  quakes.forEach((q, i) => {
    all.push({
      id: q.id || `quake-${i}`,
      kind: "SEISMIC",
      name: q.place || q.name || `Magnitude ${q.magnitude} quake`,
      description: `Mag ${q.magnitude ?? "?"} at ${q.place || "unknown location"}. ${q.type || ""}`,
      tags: ["seismic", "earthquake", "geologic", "disaster", q.place || ""].join(" "),
    });
  });

  const coins = Array.isArray(data.crypto) ? data.crypto
    : Array.isArray(data.coins) ? data.coins : [];
  coins.forEach((c, i) => {
    const sym = c.symbol || c.coin || c.currency || `COIN${i}`;
    const chg = c.change_pct ?? c.change ?? c.pct_change ?? null;
    all.push({
      id: `crypto-${sym}`,
      kind: "CRYPTO",
      name: `${sym} ${chg !== null ? (chg >= 0 ? `+${chg.toFixed(2)}%` : `${chg.toFixed(2)}%`) : ""}`.trim(),
      description: `Cryptocurrency ${sym}: price ${c.price ?? "?"} USD.${chg !== null ? ` Change: ${chg.toFixed(2)}%` : ""}`,
      tags: `crypto ${sym} ${sym.toLowerCase()} digital asset market finance`.trim(),
    });
  });

  const fx = Array.isArray(data.fx) ? data.fx
    : Array.isArray(data.currencies) ? data.currencies : [];
  fx.forEach((f, i) => {
    const pair = f.pair || f.symbol || f.currency_pair || `FX${i}`;
    const rate = f.rate ?? f.price ?? null;
    all.push({
      id: `fx-${pair}`,
      kind: "FX",
      name: `${pair} ${rate !== null ? `@ ${rate}` : ""}`.trim(),
      description: `FX pair ${pair}. Rate: ${rate ?? "?"}.`,
      tags: `currency forex fx ${pair} ${pair.toLowerCase()} monetary exchange finance`.trim(),
    });
  });

  return all;
}

function normaliseOpsEvents(raw) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.events)          ? raw.events
    : Array.isArray(raw?.results)         ? raw.results
    : [];
  return arr.map((e, i) => ({
    id:          e.id            || e.event_id     || String(i),
    title:       e.title         || e.name         || e.event_type || e.type || `Ops Event ${i + 1}`,
    severity:    (e.severity     || e.level        || "INFO").toString().toUpperCase(),
    source:      (e.source       || e.service      || e.origin || "SYSTEM").toString(),
    description: (e.description  || e.message      || e.detail || e.summary || "").toString().slice(0, 300),
    tags:        Array.isArray(e.tags) ? e.tags.join(" ") : (e.tags || ""),
    timestamp:   e.timestamp     || e.created_at   || e.time || null,
  }));
}

function crossRef(opsEvents, liveEvents) {
  return opsEvents.map((ev) => {
    const haystack = `${ev.title} ${ev.description} ${ev.tags} ${ev.source}`;
    const matches = liveEvents
      .map((lev) => ({
        lev,
        hits: overlap(haystack, `${lev.name} ${lev.description} ${lev.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...ev,
      correlated: matches.length > 0,
      matches: matches.map(({ lev, hits }) => ({ ...lev, hits })),
    };
  });
}

// ─── buildLwopsScript (for JarvisBrain) ──────────────────────────────────────

export async function buildLwopsScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [liveRes, opsRes] = await Promise.all([
      fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
      fetch(`${base}/v1/ops/events`,          { headers: hdr }),
    ]);
    const liveData = liveRes.ok ? await liveRes.json() : {};
    const opsData  = opsRes.ok  ? await opsRes.json()  : {};

    const liveEvents = normaliseLiveEvents(liveData);
    const opsEvents  = normaliseOpsEvents(opsData);
    const crossed    = crossRef(opsEvents, liveEvents);

    const total      = crossed.length;
    const correlated = crossed.filter((e) => e.correlated).length;
    const isolated   = total - correlated;
    const coverage   = total > 0 ? Math.round((correlated / total) * 100) : 0;
    const topCorr    = crossed
      .filter((e) => e.correlated)
      .slice(0, 2)
      .map((e) => e.title)
      .join(", ");

    const brief =
      `${coverage}% of ${total} ops events correlate with live world signals. ` +
      `${correlated} CORRELATED, ${isolated} ISOLATED.` +
      (topCorr ? ` Top world-correlated ops: ${topCorr}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Live World × Ops Events Correlation: ${brief} Provide a 2-sentence operational intelligence assessment.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Live World × Ops Events Correlator unavailable: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

const KIND_COLOR = { SEISMIC: "#FF6B35", CRYPTO: GRN, FX: CY };
const SEV_COLOR  = { CRITICAL: RED, WARNING: AMB, INFO: CY, DEBUG: DIM };

export default function LiveWorldOpsEventsCorrelator() {
  const [open, setOpen]         = useState(false);
  const [liveEvents, setLive]   = useState([]);
  const [opsEvents, setOps]     = useState([]);
  const [crossed, setCrossed]   = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [query, setQuery]       = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssess]  = useState(false);
  const [brief, setBrief]       = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [liveRes, opsRes] = await Promise.all([
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
        fetch(`${base}/v1/ops/events`,          { headers: hdr }),
      ]);
      const liveData = liveRes.ok ? await liveRes.json() : {};
      const opsData  = opsRes.ok  ? await opsRes.json()  : {};

      const levs = normaliseLiveEvents(liveData);
      const oevs = normaliseOpsEvents(opsData);
      setLive(levs);
      setOps(oevs);
      setCrossed(crossRef(oevs, levs));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => {
      if (!v) load();
      return !v;
    });
    window.addEventListener("jarvis:lwops-toggle", onToggle);
    return () => window.removeEventListener("jarvis:lwops-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssess(true);
    setBrief("");
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const total      = crossed.length;
      const correlated = crossed.filter((e) => e.correlated).length;
      const isolated   = total - correlated;
      const coverage   = total > 0 ? Math.round((correlated / total) * 100) : 0;
      const prompt = `Live World × Ops Events: ${coverage}% correlation coverage (${correlated}/${total} correlated, ${isolated} isolated). Assess in 2 sentences.`;
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const d = res.ok ? await res.json() : {};
      const text = d.response || d.message || d.reply || "Assessment complete.";
      setBrief(text);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "onyx" }),
      });
    } catch (e) {
      setBrief(`Assessment error: ${e.message}`);
    } finally {
      setAssess(false);
    }
  }, [crossed]);

  const visible = crossed.filter((ev) => {
    if (tab === "CORRELATED" && !ev.correlated) return false;
    if (tab === "ISOLATED"   &&  ev.correlated) return false;
    if (query) {
      const q = query.toLowerCase();
      if (
        !ev.title.toLowerCase().includes(q) &&
        !ev.description.toLowerCase().includes(q) &&
        !ev.source.toLowerCase().includes(q) &&
        !ev.severity.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const total      = crossed.length;
  const nCorr      = crossed.filter((e) => e.correlated).length;
  const nIsol      = total - nCorr;
  const coverage   = total > 0 ? Math.round((nCorr / total) * 100) : 0;

  const btnStyle = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: Z_INDEX,
    background: "rgba(0,0,0,0.85)",
    border: `1px solid ${CY}`,
    color: CY,
    fontFamily: "monospace",
    fontSize: 10,
    padding: "2px 7px",
    cursor: "pointer",
    borderRadius: 3,
    userSelect: "none",
    display: "flex",
    alignItems: "center",
    gap: 4,
  };

  const panelStyle = {
    position: "fixed",
    right: 18,
    bottom: 54,
    width: 460,
    maxHeight: "78vh",
    overflowY: "auto",
    background: "rgba(0,6,18,0.97)",
    border: `1px solid ${CY}44`,
    borderRadius: 8,
    padding: 16,
    zIndex: 9999,
    fontFamily: "monospace",
    color: CY,
    boxSizing: "border-box",
  };

  return (
    <>
      <button
        style={btnStyle}
        onClick={() => { setOpen((v) => { if (!v) load(); return !v; }); }}
        title="Live World × Ops Events Correlator"
      >
        ◈ LWOPS
        {nIsol > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 8, padding: "0 4px", fontSize: 9 }}>
            {nIsol}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>LIVE WORLD × OPS EVENTS</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={load}
                style={{ background: "none", border: `1px solid ${CY}55`, color: CY, cursor: "pointer", padding: "2px 8px", borderRadius: 3, fontSize: 10 }}
                title="Refresh"
              >
                ↺
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[
              { label: "COVERAGE",    value: `${coverage}%`, color: coverage > 60 ? GRN : coverage > 30 ? AMB : RED },
              { label: "CORRELATED",  value: nCorr,          color: GRN },
              { label: "ISOLATED",    value: nIsol,          color: AMB },
              { label: "LIVE EVENTS", value: liveEvents.length, color: CY },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  flex: 1, background: "rgba(41,231,255,0.05)", border: `1px solid ${color}33`,
                  borderRadius: 4, padding: "6px 8px", textAlign: "center",
                }}
              >
                <div style={{ fontSize: 16, fontWeight: "bold", color }}>{value}</div>
                <div style={{ fontSize: 8, color: DIM, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Assess */}
          <div style={{ marginBottom: 10 }}>
            <button
              onClick={assess}
              disabled={assessing || crossed.length === 0}
              style={{
                background: assessing ? "rgba(41,231,255,0.1)" : "rgba(41,231,255,0.15)",
                border: `1px solid ${CY}88`,
                color: CY, cursor: assessing ? "wait" : "pointer",
                padding: "4px 14px", borderRadius: 3, fontSize: 10, fontFamily: "monospace",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, fontSize: 10, color: "#cde", lineHeight: 1.5, padding: "6px 8px", background: "rgba(41,231,255,0.05)", borderRadius: 3 }}>
                {brief}
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {["ALL", "CORRELATED", "ISOLATED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "none",
                  border: `1px solid ${tab === t ? CY : CY + "33"}`,
                  color: tab === t ? CY : DIM,
                  cursor: "pointer", padding: "2px 10px", borderRadius: 3,
                  fontSize: 10, fontFamily: "monospace",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ops events…"
            style={{
              width: "100%", background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}33`,
              color: CY, padding: "4px 8px", borderRadius: 3, fontSize: 10,
              marginBottom: 8, boxSizing: "border-box", fontFamily: "monospace",
            }}
          />

          {/* Ops Event rows */}
          {loading ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>No ops events match.</div>
          ) : (
            visible.map((ev) => (
              <div key={ev.id}>
                <div
                  onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 6px", marginBottom: 3, cursor: "pointer",
                    borderRadius: 3, background: "rgba(41,231,255,0.04)",
                    border: `1px solid ${ev.correlated ? GRN + "44" : DIM + "22"}`,
                  }}
                >
                  <span style={{
                    fontSize: 8, padding: "1px 4px", borderRadius: 2,
                    background: `${SEV_COLOR[ev.severity] || DIM}22`,
                    color: SEV_COLOR[ev.severity] || DIM,
                    minWidth: 44, textAlign: "center",
                  }}>
                    {ev.severity.slice(0, 8)}
                  </span>
                  <span style={{ flex: 1, fontSize: 10, color: ev.correlated ? GRN : DIM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ev.title}
                  </span>
                  {ev.correlated ? (
                    <span style={{ fontSize: 8, color: GRN }}>⬡ {ev.matches.length} sig</span>
                  ) : (
                    <span style={{ fontSize: 8, color: DIM }}>ISOLATED</span>
                  )}
                </div>

                {/* Expanded matched live events */}
                {expanded === ev.id && ev.correlated && (
                  <div style={{ marginLeft: 12, marginBottom: 6 }}>
                    {ev.description && (
                      <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>{ev.description.slice(0, 120)}</div>
                    )}
                    <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>
                      Source: <span style={{ color: CY }}>{ev.source}</span>
                    </div>
                    {ev.matches.map((lev) => (
                      <div
                        key={lev.id}
                        style={{
                          padding: "3px 6px", marginBottom: 2, borderRadius: 2,
                          background: "rgba(0,229,160,0.05)", border: `1px solid ${KIND_COLOR[lev.kind] || DIM}33`,
                          fontSize: 9,
                        }}
                      >
                        <span style={{ color: KIND_COLOR[lev.kind] || DIM, marginRight: 4 }}>[{lev.kind}]</span>
                        <span style={{ color: GRN }}>{lev.name}</span>
                        <span style={{ color: DIM, marginLeft: 6 }}>hits:{lev.hits}</span>
                      </div>
                    ))}
                  </div>
                )}

                {expanded === ev.id && !ev.correlated && (
                  <div style={{ marginLeft: 12, marginBottom: 6, fontSize: 9, color: DIM }}>
                    No live world signals correlate with this ops event.
                    {ev.description && <div style={{ marginTop: 2 }}>{ev.description.slice(0, 120)}</div>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
