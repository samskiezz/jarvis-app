/**
 * F189 — Graph Node × Scenario × Investigation — Node Mission Alignment (NOMA)
 *
 * Parallel-fetches /v1/graph/centrality + /v1/scenario/list + /v1/investigations every 90 s.
 * Keyword-correlates each graph node (by label/id) against active scenarios AND open
 * investigations:
 *
 *   FULLY_TRACKED  — matched ≥1 scenario AND ≥1 investigation
 *   SCENARIO_ONLY  — scenario coverage found, no investigation linkage
 *   CASE_ONLY      — investigation linkage found, no scenario coverage
 *   ORPHAN         — neither scenario nor investigation linkage (dark node)
 *
 * Stat tiles: nodes / scenarios / investigations / fully tracked / orphan
 * Filter tabs: ALL | FULLY_TRACKED | SCENARIO_ONLY | CASE_ONLY | ORPHAN
 * Text search on node label / id / type.
 * Expand row → matched scenarios (amber bars) + matched investigations (cyan bars).
 * Red badge + pulse on ORPHAN count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 *
 * Toggle:  ◈ NOMA  at bottom:8 left:981980, zIndex:690.
 * Event:   jarvis:noma-toggle
 * Voice:   "noma / node mission alignment / graph node scenario / graph node investigation /
 *           orphan node / dark node / graph alignment / node coverage / untracked node"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 981_980;
const POLL_MS  = 90_000;
const CY       = "#29E7FF";
const AMBER    = "#FFB020";
const RED      = "#FF4545";
const GREEN    = "#00FF88";
const MONO     = "'JetBrains Mono',monospace";

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

const NOMA_RE =
  /\b(noma|node\s+mission\s+alignment|graph\s+node\s+scenario|graph\s+node\s+investigation|orphan\s+node|dark\s+node|graph\s+alignment|node\s+coverage|untracked\s+node)\b/i;

export function isNomaQuery(q) {
  return NOMA_RE.test(q || "");
}

function toArr(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (v.nodes) return v.nodes;
  if (v.items) return v.items;
  if (v.data) return Array.isArray(v.data) ? v.data : [];
  return [];
}

function keywords(obj) {
  if (!obj) return [];
  const raw = [
    obj.label, obj.id, obj.name, obj.title, obj.type,
    obj.description, obj.summary, obj.entity, obj.node_type,
  ].filter(Boolean).join(" ").toLowerCase();
  return raw.split(/[\s,;|_/-]+/).filter(w => w.length > 2);
}

function matchKws(kws, obj) {
  if (!kws.length) return false;
  const haystack = [
    obj.label, obj.id, obj.name, obj.title, obj.type,
    obj.description, obj.summary, obj.scenario_name, obj.investigation_name,
    obj.status, obj.threat_actor,
  ].filter(Boolean).join(" ").toLowerCase();
  return kws.some(k => haystack.includes(k));
}

export async function buildNomaScript() {
  const base = apiBase();
  const h = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [grr, scr, invr] = await Promise.allSettled([
      fetch(`${base}/v1/graph/centrality`,  { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/v1/scenario/list`,     { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/v1/investigations`,    { headers: h }).then(r => r.ok ? r.json() : []),
    ]);
    const nodes         = toArr(grr.value);
    const scenarios     = toArr(scr.value);
    const investigations = toArr(invr.value);
    let orphan = 0;
    nodes.forEach(n => {
      const kws = keywords(n);
      const hasScenario = scenarios.some(s => matchKws(kws, s));
      const hasCase     = investigations.some(i => matchKws(kws, i));
      if (!hasScenario && !hasCase) orphan++;
    });
    return `Node Mission Alignment: ${nodes.length} graph nodes assessed against ${scenarios.length} active scenarios and ${investigations.length} open investigations. ${orphan} nodes are ORPHAN — no scenario coverage and no investigation linkage, representing blind spots in the operational network model.`;
  } catch {
    return "NOMA assessment unavailable.";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CLASS_COLOR = { FULLY_TRACKED: GREEN, SCENARIO_ONLY: AMBER, CASE_ONLY: CY, ORPHAN: RED };
const CLASSES     = ["ALL", "FULLY_TRACKED", "SCENARIO_ONLY", "CASE_ONLY", "ORPHAN"];

function classify(kws, scenarios, investigations) {
  const hasScenario = scenarios.some(s => matchKws(kws, s));
  const hasCase     = investigations.some(i => matchKws(kws, i));
  if (hasScenario && hasCase) return "FULLY_TRACKED";
  if (hasScenario)             return "SCENARIO_ONLY";
  if (hasCase)                 return "CASE_ONLY";
  return "ORPHAN";
}

function matched(kws, items) {
  return items.filter(i => matchKws(kws, i));
}

function nodeLabel(n) {
  return n.label || n.name || n.id || "node";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GraphNodeMissionAlignment() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [scenarios, setScen]  = useState([]);
  const [investigations, setInv] = useState([]);
  const [filter, setFilter]   = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpand] = useState(null);
  const [assessing, setAssess] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef              = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    const h = { Authorization: `Bearer ${API_KEY}` };
    try {
      const [grr, scr, invr] = await Promise.allSettled([
        fetch(`${base}/v1/graph/centrality`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/scenario/list`,    { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/investigations`,   { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const nodes  = toArr(grr.value);
      const scens  = toArr(scr.value);
      const invs   = toArr(invr.value);
      setScen(scens);
      setInv(invs);
      const enriched = nodes.map(n => {
        const kws = keywords(n);
        const cls = classify(kws, scens, invs);
        return { ...n, _kws: kws, _class: cls, _scens: matched(kws, scens), _invs: matched(kws, invs) };
      });
      setRows(enriched);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => !o); };
    window.addEventListener("jarvis:noma-toggle", toggle);
    return () => window.removeEventListener("jarvis:noma-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssess(true);
    try {
      const script = await buildNomaScript();
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d.response || d.message || script;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } finally {
      setAssess(false);
    }
  }, []);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const counts = { FULLY_TRACKED: 0, SCENARIO_ONLY: 0, CASE_ONLY: 0, ORPHAN: 0 };
  rows.forEach(r => counts[r._class]++);

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r._class !== filter) return false;
    if (search) {
      const hay = [nodeLabel(r), r.id, r.type].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  // ── Floating toggle button ────────────────────────────────────────────────
  const btn = (
    <button
      onClick={() => setOpen(o => !o)}
      style={{
        position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 690,
        background: open ? "rgba(41,231,255,.18)" : "rgba(0,0,0,.55)",
        border: `1px solid ${open ? CY : "rgba(41,231,255,.35)"}`,
        color: CY, fontFamily: MONO, fontSize: 10, padding: "3px 7px",
        borderRadius: 4, cursor: "pointer", letterSpacing: 1,
        boxShadow: counts.ORPHAN > 0 ? `0 0 8px ${RED}` : "none",
        transition: "all .2s",
      }}
    >
      ◈ NOMA{counts.ORPHAN > 0 ? ` [${counts.ORPHAN}]` : ""}
    </button>
  );

  if (!open) return btn;

  // ── Panel ─────────────────────────────────────────────────────────────────
  return (
    <>
      {btn}
      <div style={{
        position: "fixed", bottom: 36, left: BTN_LEFT - 580, zIndex: 690,
        width: 640, maxHeight: "70vh", background: "rgba(0,4,12,.93)",
        border: `1px solid ${CY}44`, borderRadius: 8, display: "flex",
        flexDirection: "column", overflow: "hidden",
        boxShadow: "0 0 32px rgba(41,231,255,.12)",
        fontFamily: MONO,
      }}>
        {/* Header */}
        <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${CY}22`, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
              NOMA — NODE MISSION ALIGNMENT
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {loading && <span style={{ color: AMBER, fontSize: 9 }}>LOADING…</span>}
              <button onClick={assess} disabled={assessing} style={{
                background: "none", border: `1px solid ${AMBER}`, color: AMBER,
                fontFamily: MONO, fontSize: 9, padding: "2px 8px", borderRadius: 3,
                cursor: "pointer", letterSpacing: 1,
              }}>
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button onClick={() => setOpen(false)} style={{
                background: "none", border: "none", color: "#666",
                cursor: "pointer", fontSize: 14, padding: 0,
              }}>✕</button>
            </div>
          </div>
          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {[
              ["NODES",    rows.length,            CY],
              ["SCENARIOS", scenarios.length,       AMBER],
              ["CASES",    investigations.length,   CY],
              ["TRACKED",  counts.FULLY_TRACKED,    GREEN],
              ["ORPHAN",   counts.ORPHAN,            RED],
            ].map(([lbl, val, clr]) => (
              <div key={lbl} style={{
                background: "rgba(255,255,255,.04)", border: `1px solid ${clr}33`,
                borderRadius: 4, padding: "4px 10px", textAlign: "center",
              }}>
                <div style={{ color: clr, fontSize: 13, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "#888", fontSize: 8, letterSpacing: 1 }}>{lbl}</div>
              </div>
            ))}
          </div>
          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
            {CLASSES.map(c => (
              <button key={c} onClick={() => setFilter(c)} style={{
                background: filter === c ? `${CLASS_COLOR[c] || CY}22` : "none",
                border: `1px solid ${filter === c ? (CLASS_COLOR[c] || CY) : "#333"}`,
                color: filter === c ? (CLASS_COLOR[c] || CY) : "#666",
                fontFamily: MONO, fontSize: 8, padding: "2px 7px", borderRadius: 3, cursor: "pointer",
              }}>
                {c}{c !== "ALL" ? ` (${counts[c] || 0})` : ""}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search nodes…"
              style={{
                background: "none", border: "1px solid #333", color: "#ccc",
                fontFamily: MONO, fontSize: 9, padding: "2px 8px", borderRadius: 3,
                outline: "none", marginLeft: "auto", width: 140,
              }}
            />
          </div>
        </div>

        {/* Rows */}
        <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
          {visible.length === 0 && (
            <div style={{ color: "#555", fontSize: 10, textAlign: "center", padding: 20 }}>
              {loading ? "loading…" : "no nodes"}
            </div>
          )}
          {visible.map((n, i) => {
            const isExp = expanded === i;
            const clr   = CLASS_COLOR[n._class];
            return (
              <div key={i}>
                <div
                  onClick={() => setExpand(isExp ? null : i)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "5px 14px", cursor: "pointer",
                    borderLeft: `3px solid ${clr}`,
                    background: isExp ? "rgba(41,231,255,.04)" : "transparent",
                    borderBottom: "1px solid rgba(255,255,255,.03)",
                  }}
                >
                  <span style={{ color: clr, fontSize: 8, minWidth: 90, letterSpacing: 1 }}>{n._class}</span>
                  <span style={{ color: "#ccc", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {nodeLabel(n)}
                  </span>
                  <span style={{ color: "#555", fontSize: 8 }}>{n.type || ""}</span>
                  <span style={{ color: AMBER, fontSize: 9 }}>S:{n._scens.length}</span>
                  <span style={{ color: CY,    fontSize: 9 }}>C:{n._invs.length}</span>
                  <span style={{ color: "#444", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>
                {isExp && (
                  <div style={{
                    padding: "8px 14px 12px 24px",
                    background: "rgba(41,231,255,.025)",
                    borderBottom: "1px solid rgba(255,255,255,.04)",
                    display: "flex", gap: 16,
                  }}>
                    {/* Scenarios */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: AMBER, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>SCENARIOS ({n._scens.length})</div>
                      {n._scens.length === 0
                        ? <div style={{ color: "#444", fontSize: 9 }}>— none matched</div>
                        : n._scens.map((s, si) => (
                            <div key={si} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                              <div style={{ height: 6, background: AMBER, borderRadius: 2, width: `${Math.min(100, 40 + si * 12)}%`, maxWidth: 160 }} />
                              <span style={{ color: "#aaa", fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {s.name || s.title || s.id || "scenario"}
                              </span>
                            </div>
                          ))
                      }
                    </div>
                    {/* Investigations */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>INVESTIGATIONS ({n._invs.length})</div>
                      {n._invs.length === 0
                        ? <div style={{ color: "#444", fontSize: 9 }}>— none matched</div>
                        : n._invs.map((inv, ii) => (
                            <div key={ii} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                              <div style={{ height: 6, background: CY, borderRadius: 2, width: `${Math.min(100, 40 + ii * 12)}%`, maxWidth: 160 }} />
                              <span style={{ color: "#aaa", fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {inv.name || inv.title || inv.investigation_name || inv.id || "investigation"}
                              </span>
                            </div>
                          ))
                      }
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: "5px 14px", borderTop: `1px solid ${CY}22`,
          fontSize: 8, color: "#444", flexShrink: 0,
          display: "flex", justifyContent: "space-between",
        }}>
          <span>/v1/graph/centrality × /v1/scenario/list × /v1/investigations</span>
          <span style={{ color: counts.ORPHAN > 0 ? RED : "#444" }}>
            {counts.ORPHAN > 0 ? `${counts.ORPHAN} ORPHAN NODE${counts.ORPHAN > 1 ? "S" : ""} — NO COVERAGE` : "all nodes covered"}
          </span>
        </div>
      </div>
    </>
  );
}
