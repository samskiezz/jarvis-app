/**
 * F180 — OpsEvent × Dataset × IntelProfile — Threat Intelligence Data Activation (TIDA)
 *
 * Parallel-fetches /v1/ops/events + /v1/datasets + /entities/IntelProfile every 90 s.
 * Keyword-correlates each ops event against available datasets AND intel profiles:
 *
 *   FULLY_ARMED   — matched ≥1 dataset AND ≥1 intel profile
 *   DATA_BACKED   — dataset matched, no intel profile
 *   INTEL_BACKED  — intel profile matched, no dataset
 *   UNACTIVATED   — neither — an operational event with no data or intelligence support
 *
 * Stat tiles: events / datasets / intel profiles / fully armed / unactivated
 * Filter tabs: ALL | FULLY_ARMED | DATA_BACKED | INTEL_BACKED | UNACTIVATED
 * Text search on event name / type / severity.
 * Expand row → matched datasets (green bars) + matched intel profiles (cyan bars).
 * Red badge + pulse on UNACTIVATED count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence intelligence activation brief + TTS.
 *
 * Toggle:  ◈ TIDA  at bottom:8 left:974240, zIndex:681.
 * Event:   jarvis:tida-toggle
 * Voice:   "tida / threat intel activation / ops intel data / unactivated ops event /
 *           intelligence data activation / ops event intelligence / data activation /
 *           threat data activation"
 * Refresh: 90 s auto-poll.
 */
import { useEffect, useRef, useState } from "react";

const BTN_LEFT = 974_240;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof window !== "undefined" && window.__JARVIS_API_BASE__) return window.__JARVIS_API_BASE__;
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── Exported intent helpers ───────────────────────────────────────────────────

const TIDA_RE =
  /\b(tida|threat\s+intel\s+activation|ops\s+intel\s+data|unactivated\s+ops\s+event|intelligence\s+data\s+activation|ops\s+event\s+intelligence|data\s+activation|threat\s+data\s+activation)\b/i;

export function isTidaQuery(q) { return TIDA_RE.test(q || ""); }

export async function buildTidaScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [oRes, dRes, iRes] = await Promise.all([
      fetch(`${base}/v1/ops/events`,         { headers: hdr }),
      fetch(`${base}/v1/datasets`,           { headers: hdr }),
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
    ]);
    const events   = normArr(await oRes.json(), ["events", "data", "items", "results"]);
    const datasets = normArr(await dRes.json(), ["datasets", "data", "items", "results"]);
    const intels   = normArr(await iRes.json(), ["profiles", "intel_profiles", "data", "items", "results"]);

    const rows        = classifyEvents(events, datasets, intels);
    const unactivated = rows.filter((r) => r.cls === "UNACTIVATED").length;
    const armed       = rows.filter((r) => r.cls === "FULLY_ARMED").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS threat intelligence data activation audit (TIDA): ${events.length} ops events ` +
          `cross-referenced against ${datasets.length} datasets and ${intels.length} intel profiles — ` +
          `${armed} fully armed (data + intel), ${unactivated} unactivated (neither dataset nor intel support). ` +
          `Give a 2-sentence operational intelligence activation brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Threat intelligence data activation audit complete, sir.").trim();
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:tida-toggle"));
    return "Threat intelligence data activation analysis unavailable at this time, sir.";
  }
}

// ── Normalisers ───────────────────────────────────────────────────────────────

function normArr(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of keys) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    for (const v of Object.values(raw)) {
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

function kw(obj) {
  return JSON.stringify(obj)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function score(aKws, other) {
  const otherKws = new Set(kw(other));
  return aKws.filter((w) => otherKws.has(w)).length;
}

function classifyEvents(events, datasets, intels) {
  return events.map((ev) => {
    const evKws = kw(ev);
    const matchedDatasets = datasets
      .map((d) => ({ ...d, score: score(evKws, d) }))
      .filter((d) => d.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const matchedIntels = intels
      .map((p) => ({ ...p, score: score(evKws, p) }))
      .filter((p) => p.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const hasData  = matchedDatasets.length > 0;
    const hasIntel = matchedIntels.length > 0;
    const cls =
      hasData && hasIntel ? "FULLY_ARMED" :
      hasData             ? "DATA_BACKED" :
      hasIntel            ? "INTEL_BACKED" :
                            "UNACTIVATED";

    return {
      id:       ev.id || ev._id || ev.event_id || String(Math.random()),
      title:    ev.title || ev.name || ev.event_type || ev.type || ev.summary || "Unnamed Event",
      severity: ev.severity || ev.level || ev.priority || "",
      cls,
      matchedDatasets,
      matchedIntels,
      extra: ev,
    };
  });
}

// ── Style constants ───────────────────────────────────────────────────────────

const CLS_COLOR = {
  FULLY_ARMED:  "#22D3EE",
  DATA_BACKED:  "#22C55E",
  INTEL_BACKED: "#A78BFA",
  UNACTIVATED:  "#EF4444",
};
const CLS_LABEL = {
  FULLY_ARMED:  "FULLY ARMED",
  DATA_BACKED:  "DATA BACKED",
  INTEL_BACKED: "INTEL BACKED",
  UNACTIVATED:  "UNACTIVATED",
};

const TABS = ["ALL", "FULLY_ARMED", "DATA_BACKED", "INTEL_BACKED", "UNACTIVATED"];
const CY = "#22D3EE";
const GN = "#22C55E";
const RD = "#EF4444";

// ── Component ─────────────────────────────────────────────────────────────────

export default function OpsEventDatasetIntelActivation() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [datasetCount, setDatasetCount] = useState(0);
  const [intelCount, setIntelCount] = useState(0);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [oRes, dRes, iRes] = await Promise.all([
        fetch(`${base}/v1/ops/events`,         { headers: hdr }),
        fetch(`${base}/v1/datasets`,           { headers: hdr }),
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
      ]);
      const events   = normArr(await oRes.json(), ["events", "data", "items", "results"]);
      const datasets = normArr(await dRes.json(), ["datasets", "data", "items", "results"]);
      const intels   = normArr(await iRes.json(), ["profiles", "intel_profiles", "data", "items", "results"]);
      setDatasetCount(datasets.length);
      setIntelCount(intels.length);
      setRows(classifyEvents(events, datasets, intels));
    } catch {
      /* backend may be down — keep stale rows */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:tida-toggle", toggle);
    return () => window.removeEventListener("jarvis:tida-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const unactivatedCount = rows.filter((r) => r.cls === "UNACTIVATED").length;
  const armedCount       = rows.filter((r) => r.cls === "FULLY_ARMED").length;
  const dataOnlyCount    = rows.filter((r) => r.cls === "DATA_BACKED").length;
  const intelOnlyCount   = rows.filter((r) => r.cls === "INTEL_BACKED").length;

  const visible = rows.filter((r) => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (r.title + r.severity).toLowerCase().includes(s);
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment("");
    try {
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `JARVIS TIDA threat intelligence data activation audit: ${rows.length} ops events — ` +
            `${armedCount} fully armed (data + intel), ${dataOnlyCount} data-backed, ` +
            `${intelOnlyCount} intel-backed, ${unactivatedCount} unactivated (no data or intel support). ` +
            `Give a 2-sentence intelligence activation brief — formal British butler tone.`,
        }),
      });
      const d   = await r.json();
      const txt = (d.answer || "Threat intelligence data activation assessment complete, sir.").trim();
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessment("Assessment unavailable at this time, sir.");
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 681,
          background: "rgba(8,14,22,0.82)", border: `1px solid ${CY}55`,
          borderRadius: 6, padding: "3px 9px", cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          color: CY, letterSpacing: 2,
          boxShadow: unactivatedCount > 0 ? `0 0 12px ${RD}88` : "none",
          animation: unactivatedCount > 0 ? "tidaPulse 1.8s ease-in-out infinite" : "none",
        }}
      >
        ◈ TIDA
        {unactivatedCount > 0 && (
          <span style={{
            marginLeft: 5, background: RD, color: "#fff",
            borderRadius: 9, padding: "1px 5px", fontSize: 9,
          }}>
            {unactivatedCount}
          </span>
        )}
        <style>{`@keyframes tidaPulse{0%,100%{box-shadow:0 0 8px ${RD}55}50%{box-shadow:0 0 18px ${RD}}}`}</style>
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 8, left: BTN_LEFT - 440, zIndex: 681,
      width: "min(500px,92vw)", maxHeight: "82vh", overflowY: "auto",
      background: "rgba(6,11,18,0.94)", border: `1px solid ${CY}44`,
      borderRadius: 12, padding: "14px 16px",
      backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${CY}18`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5", fontSize: 11,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 3, fontSize: 12 }}>◈ TIDA</span>
        <span style={{ color: "#6E8AA0", fontSize: 10 }}>THREAT INTELLIGENCE DATA ACTIVATION</span>
        <span style={{ marginLeft: "auto", cursor: "pointer", color: "#6E8AA0" }} onClick={() => setOpen(false)}>✕</span>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {[
          ["EVENTS",      rows.length,       CY],
          ["DATASETS",    datasetCount,      GN],
          ["INTEL",       intelCount,        "#A78BFA"],
          ["ARMED",       armedCount,        CY],
          ["DATA ONLY",   dataOnlyCount,     GN],
          ["INTEL ONLY",  intelOnlyCount,    "#A78BFA"],
          ["UNACTIVATED", unactivatedCount,  RD],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{
            background: "rgba(34,211,238,0.06)", border: `1px solid ${col}33`,
            borderRadius: 6, padding: "4px 8px", textAlign: "center", minWidth: 56,
          }}>
            <div style={{ color: col, fontSize: 13, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#6E8AA0", fontSize: 9 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${CLS_COLOR[t] || CY}22` : "transparent",
            border: `1px solid ${tab === t ? (CLS_COLOR[t] || CY) : "#1E3A4A"}`,
            borderRadius: 4, padding: "2px 7px", cursor: "pointer", fontSize: 9,
            color: tab === t ? (CLS_COLOR[t] || CY) : "#6E8AA0", letterSpacing: 1,
          }}>
            {t === "ALL" ? "ALL" : CLS_LABEL[t] || t}
          </button>
        ))}
      </div>
      <input
        value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="search ops events…"
        style={{
          width: "100%", boxSizing: "border-box", marginBottom: 8,
          background: "rgba(34,211,238,0.05)", border: `1px solid ${CY}33`,
          borderRadius: 5, padding: "4px 8px", color: "#DCEBF5", fontSize: 11,
          fontFamily: "'JetBrains Mono',monospace",
        }}
      />

      {loading && <div style={{ color: "#6E8AA0", marginBottom: 8 }}>Loading ops events…</div>}

      {/* Event rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {visible.map((row) => (
          <div key={row.id}>
            <div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
                background: "rgba(34,211,238,0.04)", border: `1px solid ${CLS_COLOR[row.cls]}33`,
                borderRadius: 6, cursor: "pointer",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%",
                background: CLS_COLOR[row.cls], flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.title}
              </span>
              {row.severity && (
                <span style={{ fontSize: 9, color: "#6E8AA0", background: "rgba(0,0,0,0.3)",
                  padding: "1px 4px", borderRadius: 3 }}>
                  {row.severity}
                </span>
              )}
              <span style={{ fontSize: 9, color: CLS_COLOR[row.cls], letterSpacing: 1 }}>
                {CLS_LABEL[row.cls]}
              </span>
              <span style={{ color: "#6E8AA0", fontSize: 10 }}>
                {expanded === row.id ? "▲" : "▼"}
              </span>
            </div>

            {expanded === row.id && (
              <div style={{
                margin: "2px 0 2px 16px", padding: "8px 10px",
                background: "rgba(34,211,238,0.03)", border: `1px solid ${CY}22`,
                borderRadius: 6, display: "flex", gap: 12, flexWrap: "wrap",
              }}>
                {/* Datasets */}
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ color: GN, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>
                    DATASETS ({row.matchedDatasets.length})
                  </div>
                  {row.matchedDatasets.length === 0
                    ? <div style={{ color: "#6E8AA0", fontSize: 9 }}>none matched</div>
                    : row.matchedDatasets.map((d, i) => (
                      <div key={i} style={{ marginBottom: 3 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#DCEBF5" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>
                            {d.name || d.title || d.dataset_id || `Dataset ${i + 1}`}
                          </span>
                          <span style={{ color: GN }}>{d.score}</span>
                        </div>
                        <div style={{ height: 3, background: `${GN}22`, borderRadius: 2, marginTop: 1 }}>
                          <div style={{ height: "100%", width: `${Math.min(100, d.score * 20)}%`,
                            background: GN, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))
                  }
                </div>
                {/* Intel Profiles */}
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ color: CY, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>
                    INTEL PROFILES ({row.matchedIntels.length})
                  </div>
                  {row.matchedIntels.length === 0
                    ? <div style={{ color: "#6E8AA0", fontSize: 9 }}>none matched</div>
                    : row.matchedIntels.map((p, i) => (
                      <div key={i} style={{ marginBottom: 3 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#DCEBF5" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>
                            {p.name || p.title || p.actor || p.profile_id || `Intel ${i + 1}`}
                          </span>
                          <span style={{ color: CY }}>{p.score}</span>
                        </div>
                        <div style={{ height: 3, background: `${CY}22`, borderRadius: 2, marginTop: 1 }}>
                          <div style={{ height: "100%", width: `${Math.min(100, p.score * 20)}%`,
                            background: CY, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        ))}
        {!loading && visible.length === 0 && (
          <div style={{ color: "#6E8AA0", textAlign: "center", padding: "12px 0" }}>
            No ops events match current filter.
          </div>
        )}
      </div>

      {/* Assess button + result */}
      <div style={{ marginTop: 10 }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? "rgba(34,211,238,0.1)" : `${CY}18`,
          border: `1px solid ${CY}55`, borderRadius: 5, padding: "4px 12px",
          cursor: assessing ? "default" : "pointer", color: CY, fontSize: 10,
          fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1,
        }}>
          {assessing ? "⟳ assessing…" : "▶ ASSESS"}
        </button>
        {assessment && (
          <div style={{
            marginTop: 8, padding: "7px 10px", background: "rgba(34,211,238,0.05)",
            border: `1px solid ${CY}33`, borderRadius: 6, fontSize: 11,
            color: "#DCEBF5", lineHeight: 1.5,
          }}>
            {assessment}
          </div>
        )}
      </div>

      <div style={{ marginTop: 8, color: "#334F62", fontSize: 9 }}>
        auto-refresh {POLL_MS / 1000}s · {rows.length} events · {datasetCount} datasets · {intelCount} intel profiles
      </div>
    </div>
  );
}
