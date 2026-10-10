/**
 * F176 — Dataset × Risk Signal Coverage (DSRISK)
 *
 * Parallel-fetches /v1/datasets + /entities/RiskSignal, then
 * keyword-correlates each dataset against active risk signals to surface:
 *   IMPLICATED — at least one risk signal has keyword overlap with this dataset
 *   CLEAR      — no active risk signal references this dataset
 *                (data source is unmonitored from a risk perspective)
 *
 * Stat tiles: datasets / signals / implicated / clear
 * Filter tabs: ALL | IMPLICATED | CLEAR
 * Text search across dataset names / types.
 * Expand any dataset → matched risk signals with severity badge + relevance score.
 * Amber badge on implicated count.
 * ▶ ASSESS: 2-sentence data-risk exposure brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ DSRISK  at bottom:8 left:60120, zIndex:117.
 * Event:   jarvis:dsrisk-toggle
 * Voice:   "dataset risk / risk dataset / data risk coverage / dsrisk /
 *           dataset signal / data exposure / dataset threat / risky datasets /
 *           data risk / which datasets are risky"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 60120;
const POLL_MS  = 90_000;
const AMBER    = "#FBBF24";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ───────────────────────────────────────────────────

const DSRISK_RE =
  /\b(dataset\s+risk[s]?|risk\s+dataset[s]?|data\s+risk\s+coverage|dsrisk|dataset\s+signal[s]?|data\s+exposure|dataset\s+threat[s]?|risky\s+dataset[s]?|data\s+risk|which\s+dataset[s]?\s+(are|have|show|linked|tied|associated)\s+(risk|threat|signal)|dataset\s+risk\s+map|data\s+source\s+risk[s]?)\b/i;

export function isDsriskQuery(q) { return DSRISK_RE.test(q); }

export async function buildDsriskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [dsRes, riskRes] = await Promise.all([
      fetch(`${base}/v1/datasets`,          { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,  { headers: hdr }),
    ]);
    const datasets = normaliseDatasets(await dsRes.json());
    const signals  = normaliseSignals(await riskRes.json());

    const implicated = datasets.filter((d) => signals.some((s) => relevance(d, s) > 0)).length;
    const clear      = datasets.length - implicated;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS dataset × risk-signal coverage analysis: ${datasets.length} datasets on record, ` +
          `${signals.length} active risk signals. ${implicated} datasets are implicated by at least ` +
          `one active risk signal; ${clear} datasets show no risk signal coverage ` +
          `(potential unmonitored data sources). Provide a 2-sentence data-risk exposure brief — ` +
          `formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Dataset risk coverage analysis complete, sir.").trim();
  } catch {
    return "Dataset risk coverage analysis unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseDatasets(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.datasets)         ? raw.datasets
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.results)          ? raw.results
    : Array.isArray(raw?.items)            ? raw.items
    : [];
  return arr.map((d, i) => ({
    id:          d.id         || d.dataset_id  || String(i),
    name:        d.name       || d.title       || d.label   || `Dataset ${i + 1}`,
    type:        d.type       || d.source_type || d.kind    || "",
    tags:        Array.isArray(d.tags) ? d.tags.join(" ") : (d.tags || ""),
    description: (d.description || d.summary || d.details || "").toString().slice(0, 300),
    rows:        Number(d.row_count || d.rows || d.record_count || 0),
  }));
}

function normaliseSignals(raw) {
  const arr = Array.isArray(raw)                   ? raw
    : Array.isArray(raw?.risk_signals)             ? raw.risk_signals
    : Array.isArray(raw?.signals)                  ? raw.signals
    : Array.isArray(raw?.data)                     ? raw.data
    : Array.isArray(raw?.results)                  ? raw.results
    : Array.isArray(raw?.items)                    ? raw.items
    : [];
  return arr.map((s, i) => ({
    id:          s.id          || s.signal_id  || String(i),
    name:        s.name        || s.title      || s.label   || `Signal ${i + 1}`,
    severity:    s.severity    || s.level      || s.risk_level || "medium",
    category:    s.category    || s.type       || "",
    tags:        Array.isArray(s.tags) ? s.tags.join(" ") : (s.tags || ""),
    description: (s.description || s.summary || s.details || s.notes || "").toString().slice(0, 300),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(dataset, signal) {
  const dw = keywords(`${dataset.name} ${dataset.type} ${dataset.description} ${dataset.tags}`);
  const sw = keywords(`${signal.name} ${signal.category} ${signal.description} ${signal.tags}`);
  return dw.filter((w) => sw.some((p) => p.includes(w) || w.includes(p))).length;
}

function buildLinked(datasets, signals) {
  return datasets.map((ds) => {
    const matched = signals
      .map((s) => ({ ...s, score: relevance(ds, s) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...ds, signals: matched, implicated: matched.length > 0 };
  });
}

function severityColor(sev) {
  const lc = String(sev || "").toLowerCase();
  if (lc === "critical")  return "#F87171";
  if (lc === "high")      return "#FB923C";
  if (lc === "medium")    return "#FBBF24";
  return "#94A3B8";
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "IMPLICATED", "CLEAR"];

export default function DatasetRiskCoverage() {
  const [open,      setOpen]      = useState(false);
  const [datasets,  setDatasets]  = useState([]);
  const [signals,   setSignals]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [dsRes, riskRes] = await Promise.all([
        fetch(`${base}/v1/datasets`,         { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
      ]);
      setDatasets(normaliseDatasets(await dsRes.json()));
      setSignals(normaliseSignals(await riskRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:dsrisk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:dsrisk-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildDsriskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked      = buildLinked(datasets, signals);
  const implicated  = linked.filter((d) => d.implicated).length;
  const clear       = linked.length - implicated;

  const displayed = linked.filter((d) => {
    if (filter === "IMPLICATED" && !d.implicated) return false;
    if (filter === "CLEAR" && d.implicated)        return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      d.name.toLowerCase().includes(q) ||
      d.type.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q)
    );
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Dataset × Risk Signal Coverage (DSRISK)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 117,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${AMBER}55`,
          color: AMBER, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {implicated > 0
          ? <><span style={{ background: AMBER, color: "#04060A", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{implicated}</span>◈ DSRISK</>
          : "◈ DSRISK"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 117,
      width: 480, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${AMBER}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${AMBER}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${AMBER}33` }}>
        <span style={{ color: AMBER, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ DSRISK</span>
        <span style={{ color: "#6E8AA0", fontSize: 9, flex: 1 }}>DATASET × RISK SIGNAL COVERAGE</span>
        {lastFetch && <span style={{ color: "#6E8AA0", fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: AMBER, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${AMBER}22` }}>
        {[
          { label: "DATASETS",   value: linked.length,   col: "#60A5FA" },
          { label: "SIGNALS",    value: signals.length,  col: "#A78BFA" },
          { label: "IMPLICATED", value: implicated,      col: AMBER },
          { label: "CLEAR",      value: clear,           col: "#4ADE80" },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: "#6E8AA0", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${AMBER}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${AMBER}22` : "none",
            border: `1px solid ${filter === t ? AMBER : "#6E8AA0"}`,
            color: filter === t ? AMBER : "#6E8AA0",
            borderRadius: 5, padding: "2px 8px", fontSize: 9,
            cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search datasets…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)",
            border: "1px solid #6E8AA044", borderRadius: 5, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 9, outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          background: "none", border: `1px solid ${AMBER}`,
          color: AMBER, borderRadius: 5, padding: "2px 8px",
          fontSize: 9, cursor: "pointer", letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* dataset list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: "#6E8AA0", fontSize: 10, textAlign: "center", padding: 20 }}>
            No datasets match the current filter.
          </div>
        )}
        {displayed.map((ds) => {
          const isExp  = expanded === ds.id;
          const status = ds.implicated ? "IMPLICATED" : "CLEAR";
          const col    = ds.implicated ? AMBER : "#4ADE80";
          return (
            <div key={ds.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : ds.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${AMBER}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${ds.implicated ? AMBER + "44" : "#6E8AA022"}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col,
                }}>
                  {status}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{ds.name}</span>
                {ds.type && <span style={{ fontSize: 8, color: "#6E8AA0" }}>{ds.type}</span>}
                {ds.implicated && (
                  <span style={{ fontSize: 8, color: AMBER }}>{ds.signals.length} signal{ds.signals.length !== 1 ? "s" : ""}</span>
                )}
                <span style={{ color: "#6E8AA0", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${AMBER}22` }}>
                  {ds.rows > 0 && (
                    <div style={{ fontSize: 9, color: "#6E8AA0", marginBottom: 6 }}>
                      {ds.rows.toLocaleString()} records · {ds.description.slice(0, 120) || "No description."}
                    </div>
                  )}
                  {ds.signals.length === 0 ? (
                    <div style={{ fontSize: 9, color: "#4ADE80" }}>No active risk signals reference this dataset.</div>
                  ) : (
                    ds.signals.map((sig) => (
                      <div key={sig.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: `${severityColor(sig.severity)}22`, color: severityColor(sig.severity),
                          letterSpacing: 1,
                        }}>
                          {String(sig.severity || "MED").toUpperCase()}
                        </span>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5" }}>{sig.name}</span>
                        {sig.category && <span style={{ fontSize: 8, color: "#6E8AA0" }}>{sig.category}</span>}
                        <span style={{ fontSize: 8, color: AMBER }}>rel:{sig.score}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
