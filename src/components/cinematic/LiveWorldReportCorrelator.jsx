/**
 * LiveWorldReportCorrelator — F565
 * "JARVIS, live world report / lwrpt / world event reports / world backed reports"
 * Cross-references /functions/getLiveIntel + /v1/reports.
 * Finds COVERED reports (≥1 live event keyword-matches) vs UNMATCHED.
 * Coverage % tile; ALL/COVERED/UNMATCHED filter tabs + search; click-to-expand event detail.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 60_800;
const Z_INDEX  = 129;

const LWRPT_RE =
  /\blwrpt\b|\blive.?world.?report\b|\bworld.?event.?report\b|\bworld.?backed.?report\b|\bworld.?report\b|\breport.?world.?event\b|\blive.?intel.?report\b|\breal.?world.?report\b|\bworld.?signaled.?report\b|\bworld.?matched.?report\b/i;

export function isLwrptQuery(text) {
  return LWRPT_RE.test(text || "");
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
      tags: `crypto ${sym} ${sym.toLowerCase()} digital asset market finance currency`.trim(),
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
      tags: `currency forex fx ${pair} ${pair.toLowerCase()} monetary exchange finance market`.trim(),
    });
  });

  return all;
}

function normaliseReports(raw) {
  const arr = Array.isArray(raw)         ? raw
    : Array.isArray(raw?.reports)        ? raw.reports
    : Array.isArray(raw?.data)           ? raw.data
    : Array.isArray(raw?.items)          ? raw.items
    : Array.isArray(raw?.results)        ? raw.results
    : [];
  return arr.map((r, i) => ({
    id:          r.id           || String(i),
    title:       r.title        || r.name       || `Report ${i + 1}`,
    type:        (r.type        || r.kind       || r.category || "").toString().toUpperCase(),
    author:      r.author       || r.created_by || r.owner    || "",
    summary:     (r.summary     || r.description || r.abstract || r.content || "").toString().slice(0, 200),
    status:      (r.status      || "").toString().toUpperCase(),
    tags:        Array.isArray(r.tags) ? r.tags.join(" ") : (r.tags || ""),
  }));
}

function crossRef(reports, events) {
  return reports.map((rpt) => {
    const haystack = `${rpt.title} ${rpt.summary} ${rpt.type} ${rpt.tags}`;
    const matches = events
      .map((ev) => ({
        ev,
        hits: overlap(haystack, `${ev.name} ${ev.description} ${ev.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...rpt,
      covered: matches.length > 0,
      matches: matches.map(({ ev, hits }) => ({ ...ev, hits })),
    };
  });
}

// ─── buildLwrptScript (for JarvisBrain) ──────────────────────────────────────

export async function buildLwrptScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [liveRes, rptRes] = await Promise.all([
      fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
      fetch(`${base}/v1/reports`,             { headers: hdr }),
    ]);
    const liveData = liveRes.ok ? await liveRes.json() : {};
    const rptData  = rptRes.ok  ? await rptRes.json()  : {};

    const events   = normaliseLiveEvents(liveData);
    const reports  = normaliseReports(rptData);
    const crossed  = crossRef(reports, events);

    const total    = crossed.length;
    const covered  = crossed.filter((r) => r.covered).length;
    const unmatched = total - covered;
    const coverage = total > 0 ? Math.round((covered / total) * 100) : 0;
    const topCovered = crossed
      .filter((r) => r.covered)
      .slice(0, 2)
      .map((r) => r.title)
      .join(", ");

    const brief =
      `${coverage}% of ${total} reports correlate with live world events. ` +
      `${covered} COVERED, ${unmatched} UNMATCHED.` +
      (topCovered ? ` Top covered: ${topCovered}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Live World × Report Correlation: ${brief} Provide a 2-sentence intelligence coverage assessment.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Live World × Report Correlator unavailable: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

const KIND_COLOR = { SEISMIC: "#FF6B35", CRYPTO: GRN, FX: CY };

const TYPE_COLORS = {
  THREAT: "#FF4466",
  INTEL:  "#FF9900",
  OPS:    CY,
  KNOWLEDGE: GRN,
};

export default function LiveWorldReportCorrelator() {
  const [open, setOpen]       = useState(false);
  const [reports, setReports] = useState([]);
  const [events, setEvents]   = useState([]);
  const [crossed, setCrossed] = useState([]);
  const [tab, setTab]         = useState("ALL");
  const [query, setQuery]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssess] = useState(false);
  const [brief, setBrief]     = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [liveRes, rptRes] = await Promise.all([
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
        fetch(`${base}/v1/reports`,             { headers: hdr }),
      ]);
      const liveData = liveRes.ok ? await liveRes.json() : {};
      const rptData  = rptRes.ok  ? await rptRes.json()  : {};

      const evs  = normaliseLiveEvents(liveData);
      const rpts = normaliseReports(rptData);
      setEvents(evs);
      setReports(rpts);
      setCrossed(crossRef(rpts, evs));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => {
      if (!v) load();
      return !v;
    });
    window.addEventListener("jarvis:lwrpt-toggle", onToggle);
    return () => window.removeEventListener("jarvis:lwrpt-toggle", onToggle);
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
      const total    = crossed.length;
      const covered  = crossed.filter((r) => r.covered).length;
      const unmatched = total - covered;
      const coverage = total > 0 ? Math.round((covered / total) * 100) : 0;
      const prompt = `Live World × Reports: ${coverage}% world-event coverage (${covered}/${total} covered, ${unmatched} unmatched). Provide a 2-sentence intelligence coverage assessment.`;
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

  const visible = crossed.filter((r) => {
    if (tab === "COVERED"   && !r.covered) return false;
    if (tab === "UNMATCHED" &&  r.covered) return false;
    if (query) {
      const q = query.toLowerCase();
      if (
        !r.title.toLowerCase().includes(q) &&
        !r.summary.toLowerCase().includes(q) &&
        !r.type.toLowerCase().includes(q) &&
        !r.author.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const total      = crossed.length;
  const nCovered   = crossed.filter((r) => r.covered).length;
  const nUnmatched = total - nCovered;
  const coverage   = total > 0 ? Math.round((nCovered / total) * 100) : 0;

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
        title="Live World × Report Correlator"
      >
        ◈ LWRPT
        {nCovered > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 8, padding: "0 4px", fontSize: 9 }}>
            {nCovered}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>LIVE WORLD × REPORTS</span>
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
              { label: "COVERAGE",    value: `${coverage}%`, color: coverage > 60 ? GRN : coverage > 30 ? AMB : "#FF4466" },
              { label: "COVERED",     value: nCovered,       color: AMB },
              { label: "UNMATCHED",   value: nUnmatched,     color: DIM },
              { label: "LIVE EVENTS", value: events.length,  color: CY },
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
            {["ALL", "COVERED", "UNMATCHED"].map((t) => (
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
            placeholder="Search reports…"
            style={{
              width: "100%", background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}33`,
              color: CY, padding: "4px 8px", borderRadius: 3, fontSize: 10,
              marginBottom: 8, boxSizing: "border-box", fontFamily: "monospace",
            }}
          />

          {/* Report rows */}
          {loading ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>No reports match.</div>
          ) : (
            visible.map((rpt) => (
              <div key={rpt.id}>
                <div
                  onClick={() => setExpanded(expanded === rpt.id ? null : rpt.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 6px", marginBottom: 3, cursor: "pointer",
                    borderRadius: 3, background: "rgba(41,231,255,0.04)",
                    border: `1px solid ${rpt.covered ? AMB + "55" : DIM + "22"}`,
                  }}
                >
                  {rpt.type && (
                    <span style={{
                      fontSize: 8, padding: "1px 4px", borderRadius: 2,
                      background: `${TYPE_COLORS[rpt.type] || CY}11`,
                      color: TYPE_COLORS[rpt.type] || CY,
                      minWidth: 36, textAlign: "center",
                    }}>
                      {rpt.type.slice(0, 6)}
                    </span>
                  )}
                  <span style={{ flex: 1, fontSize: 10, color: rpt.covered ? AMB : DIM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {rpt.title}
                    {rpt.author ? <span style={{ color: DIM, marginLeft: 4, fontSize: 9 }}>· {rpt.author}</span> : null}
                  </span>
                  {rpt.covered ? (
                    <span style={{ fontSize: 8, color: AMB }}>⬡ {rpt.matches.length} ev</span>
                  ) : (
                    <span style={{ fontSize: 8, color: DIM }}>UNMATCHED</span>
                  )}
                </div>

                {/* Expanded matched events */}
                {expanded === rpt.id && rpt.covered && (
                  <div style={{ marginLeft: 12, marginBottom: 6 }}>
                    {rpt.summary && (
                      <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>{rpt.summary.slice(0, 120)}</div>
                    )}
                    {rpt.matches.map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          padding: "3px 6px", marginBottom: 2, borderRadius: 2,
                          background: "rgba(255,165,0,0.05)", border: `1px solid ${KIND_COLOR[ev.kind] || DIM}33`,
                          fontSize: 9,
                        }}
                      >
                        <span style={{ color: KIND_COLOR[ev.kind] || DIM, marginRight: 4 }}>[{ev.kind}]</span>
                        <span style={{ color: AMB }}>{ev.name}</span>
                        <span style={{ color: DIM, marginLeft: 6 }}>hits:{ev.hits}</span>
                      </div>
                    ))}
                  </div>
                )}

                {expanded === rpt.id && !rpt.covered && (
                  <div style={{ marginLeft: 12, marginBottom: 6, fontSize: 9, color: DIM }}>
                    No live world events correlate with this report.
                    {rpt.summary && <div style={{ marginTop: 2 }}>{rpt.summary.slice(0, 120)}</div>}
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
