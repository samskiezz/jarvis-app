/**
 * F276 — IntelProfile × RiskSignal × Investigation × Dataset Intelligence Risk Coverage Matrix (IRCMAT)
 *
 * Parallel-fetches /entities/IntelProfile, /entities/RiskSignal, /v1/investigations, /v1/datasets;
 * keyword-correlates each intel profile against risk signals AND open investigations AND datasets
 * to classify:
 *   FULLY_MAPPED  — matched by ≥1 risk signal AND ≥1 investigation AND ≥1 dataset
 *   DUAL_MAPPED   — matched by any 2 of the 3 sources
 *   SINGLE_LINKED — matched by exactly 1 source
 *   UNMAPPED      — no match (intelligence risk coverage gap)
 *
 * Stat tiles: INTEL PROFILES / RISK SIGS / INVESTIGATIONS / DATASETS / FULLY MAPPED /
 *             DUAL MAPPED / SINGLE LINKED / UNMAPPED / COV%
 * Filter tabs: ALL | FULLY_MAPPED | DUAL_MAPPED | SINGLE_LINKED | UNMAPPED
 * Expand any profile → matched risk signal cards (red) + investigation cards (teal) + dataset cards (amber)
 * ▶ ASSESS RISK COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle:  ◈ IRCMAT  left:1110720, bottom:8, zIndex:699
 * Voice:   "ircmat / intel risk matrix / intel risk coverage / risk investigation dataset /
 *           unmapped intel / intel coverage matrix / threat coverage matrix"
 * Event:   jarvis:ircmat-toggle
 * Refresh: 90-s auto-poll
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 1110720;
const POLL_MS  = 90_000;
const API_KEY  = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

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

const IRCMAT_RE =
  /\b(ircmat|intel\s+risk\s+matrix|intel\s+risk\s+coverage|risk\s+investigation\s+dataset|unmapped\s+intel(?:\s+profile)?|intel\s+coverage\s+matrix|threat\s+coverage\s+matrix)\b/i;

export function isIrcmatQuery(q) { return IRCMAT_RE.test(q); }

export async function buildIrcmatScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [intelRes, riskRes, invRes, dsRes] = await Promise.all([
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,   { headers: hdr }),
      fetch(`${base}/v1/investigations`,     { headers: hdr }),
      fetch(`${base}/v1/datasets`,           { headers: hdr }),
    ]);
    const intelRaw = await intelRes.json();
    const riskRaw  = await riskRes.json();
    const invRaw   = await invRes.json();
    const dsRaw    = await dsRes.json();

    const profiles = normaliseProfiles(intelRaw);
    const risks    = normaliseRisks(riskRaw);
    const invs     = normaliseInvestigations(invRaw);
    const datasets = normaliseDatasets(dsRaw);
    const corr     = buildCorrelated(profiles, risks, invs, datasets);

    const full   = corr.filter(p => p.cls === "FULLY_MAPPED").length;
    const dual   = corr.filter(p => p.cls === "DUAL_MAPPED").length;
    const single = corr.filter(p => p.cls === "SINGLE_LINKED").length;
    const unmapped = corr.filter(p => p.cls === "UNMAPPED").length;
    const pct    = profiles.length ? Math.round((full / profiles.length) * 100) : 0;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS intel risk coverage matrix (IRCMAT): ${profiles.length} intel profiles cross-referenced ` +
          `against ${risks.length} risk signals, ${invs.length} investigations, and ${datasets.length} datasets. ` +
          `Classification — FULLY_MAPPED: ${full}, DUAL_MAPPED: ${dual}, ` +
          `SINGLE_LINKED: ${single}, UNMAPPED (gap): ${unmapped}. Full coverage: ${pct}%. ` +
          `Give a 2-sentence intel risk coverage brief — formal British butler tone, first person.`,
      }),
    });
    if (!r.ok) throw new Error("agent chat failed");
    const j = await r.json();
    return j.response || j.message || j.content || "";
  } catch {
    return "IRCMAT online, sir. Assessing intel profile risk coverage across signals, investigations, and datasets.";
  }
}

// ── normalisation ─────────────────────────────────────────────────────────────

function normaliseProfiles(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.data)  ? raw.data
    : [];
  return arr.map(p => ({
    id:   p.id || p._id || String(Math.random()),
    name: p.name || p.title || p.actor_name || "Unnamed Profile",
    org:  p.org || p.organization || p.affiliation || "",
    role: p.role || "",
    desc: `${p.name || ""} ${p.description || ""} ${p.org || ""} ${p.role || ""} ${p.tags?.join(" ") || ""}`.toLowerCase(),
  }));
}

function normaliseRisks(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.data)  ? raw.data
    : [];
  return arr.map(r => ({
    id:       r.id || r._id || String(Math.random()),
    name:     r.name || r.title || r.signal_name || "Unnamed Risk",
    severity: r.severity || r.level || r.risk_level || "MEDIUM",
    type:     r.type || r.signal_type || "",
    desc: `${r.name || ""} ${r.description || ""} ${r.type || ""} ${r.tags?.join(" ") || ""}`.toLowerCase(),
  }));
}

function normaliseInvestigations(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.data)  ? raw.data
    : Array.isArray(raw?.investigations) ? raw.investigations
    : [];
  return arr.map(i => ({
    id:     i.id || i._id || String(Math.random()),
    name:   i.name || i.title || i.subject || "Unnamed Investigation",
    status: i.status || i.state || "open",
    type:   i.type || i.investigation_type || "",
    desc: `${i.name || ""} ${i.title || ""} ${i.description || ""} ${i.type || ""} ${i.tags?.join(" ") || ""}`.toLowerCase(),
  }));
}

function normaliseDatasets(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.data)  ? raw.data
    : Array.isArray(raw?.datasets) ? raw.datasets
    : [];
  return arr.map(d => ({
    id:   d.id || d._id || String(Math.random()),
    name: d.name || d.title || d.dataset_name || "Unnamed Dataset",
    type: d.type || d.dataset_type || "",
    desc: `${d.name || ""} ${d.description || ""} ${d.type || ""} ${d.tags?.join(" ") || ""}`.toLowerCase(),
  }));
}

function tokenize(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

function relevance(tokens, desc) {
  const hits = tokens.filter(t => desc.includes(t)).length;
  return tokens.length ? Math.round((hits / tokens.length) * 100) : 0;
}

function buildCorrelated(profiles, risks, invs, datasets) {
  return profiles.map(prof => {
    const tokens = tokenize(prof.desc);
    const mRisks = risks
      .map(r => ({ ...r, rel: relevance(tokens, r.desc) }))
      .filter(r => r.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const mInvs = invs
      .map(i => ({ ...i, rel: relevance(tokens, i.desc) }))
      .filter(i => i.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const mDatasets = datasets
      .map(d => ({ ...d, rel: relevance(tokens, d.desc) }))
      .filter(d => d.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const matched = (mRisks.length > 0 ? 1 : 0) + (mInvs.length > 0 ? 1 : 0) + (mDatasets.length > 0 ? 1 : 0);
    let cls;
    if (matched === 3)      cls = "FULLY_MAPPED";
    else if (matched === 2) cls = "DUAL_MAPPED";
    else if (matched === 1) cls = "SINGLE_LINKED";
    else                    cls = "UNMAPPED";
    return { ...prof, cls, mRisks, mInvs, mDatasets };
  });
}

// ── severity colour ───────────────────────────────────────────────────────────
function sevColor(s) {
  const sl = (s || "").toLowerCase();
  if (sl === "critical") return "#ef4444";
  if (sl === "high")     return "#f97316";
  if (sl === "medium")   return "#eab308";
  return "#6b7280";
}

// ── component ─────────────────────────────────────────────────────────────────
export default function IntelProfileRiskInvestigationDatasetMatrix() {
  const [open,      setOpen]      = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [profiles,  setProfiles]  = useState([]);
  const [risks,     setRisks]     = useState([]);
  const [invs,      setInvs]      = useState([]);
  const [datasets,  setDatasets]  = useState([]);
  const [corr,      setCorr]      = useState([]);
  const [expanded,  setExpanded]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assess,    setAssess]    = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [intelRes, riskRes, invRes, dsRes] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`,   { headers: hdr }),
        fetch(`${base}/v1/investigations`,     { headers: hdr }),
        fetch(`${base}/v1/datasets`,           { headers: hdr }),
      ]);
      const intelRaw = await intelRes.json();
      const riskRaw  = await riskRes.json();
      const invRaw   = await invRes.json();
      const dsRaw    = await dsRes.json();
      const p = normaliseProfiles(intelRaw);
      const r = normaliseRisks(riskRaw);
      const i = normaliseInvestigations(invRaw);
      const d = normaliseDatasets(dsRaw);
      setProfiles(p); setRisks(r); setInvs(i); setDatasets(d);
      setCorr(buildCorrelated(p, r, i, d));
    } catch { /* keep previous data */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:ircmat-toggle", handler);
    return () => window.removeEventListener("jarvis:ircmat-toggle", handler);
  }, []);

  const handleAssess = useCallback(async () => {
    setAssessing(true); setAssess("");
    const script = await buildIrcmatScript();
    setAssess(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  }, []);

  const full   = corr.filter(p => p.cls === "FULLY_MAPPED").length;
  const dual   = corr.filter(p => p.cls === "DUAL_MAPPED").length;
  const single = corr.filter(p => p.cls === "SINGLE_LINKED").length;
  const unmapped = corr.filter(p => p.cls === "UNMAPPED").length;
  const pct    = profiles.length ? Math.round((full / profiles.length) * 100) : 0;

  const TABS = ["ALL", "FULLY_MAPPED", "DUAL_MAPPED", "SINGLE_LINKED", "UNMAPPED"];

  const visible = corr.filter(p => {
    const matchTab    = tab === "ALL" || p.cls === tab;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const clsColor = cls => ({
    FULLY_MAPPED:  "#22c55e",
    DUAL_MAPPED:   "#22d3ee",
    SINGLE_LINKED: "#eab308",
    UNMAPPED:      "#ef4444",
  }[cls] || "#6b7280");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 699,
          background: "rgba(0,0,0,0.7)", border: "1px solid #22c55e",
          color: "#22c55e", padding: "4px 10px", fontSize: 11,
          borderRadius: 4, cursor: "pointer", fontFamily: "monospace",
          whiteSpace: "nowrap",
        }}
      >
        ◈ IRCMAT {unmapped > 0 && <span style={{ color: "#ef4444", marginLeft: 4 }}>● {unmapped}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", right: 20, top: 60, width: 720, maxHeight: "85vh",
      background: "rgba(0,4,12,0.97)", border: "1px solid #22c55e",
      borderRadius: 8, zIndex: 9999, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: "#e2e8f0", overflow: "hidden",
    }}>
      {/* header */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #1e3a5f", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 13 }}>
          ◈ IRCMAT — Intel Risk Coverage Matrix
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      {/* primary stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, padding: "10px 14px 6px" }}>
        {[
          { label: "INTEL PROFILES", val: profiles.length,  col: "#22c55e" },
          { label: "RISK SIGS",      val: risks.length,     col: "#ef4444" },
          { label: "INVESTIGATIONS", val: invs.length,      col: "#22d3ee" },
          { label: "DATASETS",       val: datasets.length,  col: "#eab308" },
          { label: "COV%",           val: `${pct}%`,        col: pct >= 70 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444" },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#64748b", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* class stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, padding: "0 14px 6px" }}>
        {[
          { label: "FULLY MAPPED",  val: full,     col: "#22c55e" },
          { label: "DUAL MAPPED",   val: dual,     col: "#22d3ee" },
          { label: "SINGLE LINKED", val: single,   col: "#eab308" },
          { label: "UNMAPPED",      val: unmapped, col: "#ef4444" },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "4px 8px", textAlign: "center" }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#64748b", fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      <div style={{ margin: "0 14px 8px", background: "#1e293b", borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: pct >= 70 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444", transition: "width 0.5s" }} />
      </div>

      {/* filter tabs + search */}
      <div style={{ padding: "0 14px 6px", display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "#22c55e" : "rgba(255,255,255,0.05)",
            color: tab === t ? "#000" : "#94a3b8", border: "none",
            borderRadius: 4, padding: "3px 8px", fontSize: 10, cursor: "pointer",
          }}>
            {t.replace(/_/g, " ")}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search profiles…"
          style={{
            marginLeft: "auto", background: "rgba(255,255,255,0.06)", border: "1px solid #334155",
            color: "#e2e8f0", borderRadius: 4, padding: "3px 8px", fontSize: 11, width: 160,
          }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 10px" }}>
        {loading && <div style={{ color: "#64748b", textAlign: "center", padding: 20, fontSize: 12 }}>Loading…</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color: "#64748b", textAlign: "center", padding: 20, fontSize: 12 }}>No profiles match.</div>
        )}
        {visible.map(prof => (
          <div key={prof.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === prof.id ? null : prof.id)}
              style={{
                background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "8px 12px",
                cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                border: `1px solid ${prof.cls === "UNMAPPED" ? "rgba(239,68,68,0.3)" : "transparent"}`,
                animation: prof.cls === "UNMAPPED" ? "ircmat-pulse 2s ease-in-out infinite" : "none",
              }}
            >
              <div>
                <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}>{prof.name}</span>
                {prof.org  && <span style={{ color: "#64748b", fontSize: 10, marginLeft: 6 }}>{prof.org}</span>}
                {prof.role && <span style={{ color: "#64748b", fontSize: 10, marginLeft: 6 }}>· {prof.role}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  background: `${clsColor(prof.cls)}22`, color: clsColor(prof.cls),
                  borderRadius: 4, padding: "2px 7px", fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                }}>
                  {prof.cls.replace(/_/g, " ")}
                </span>
                <span style={{ color: "#475569", fontSize: 12 }}>{expanded === prof.id ? "▲" : "▼"}</span>
              </div>
            </div>

            {expanded === prof.id && (
              <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "0 0 6px 6px", marginTop: -2 }}>
                {prof.mRisks.length > 0 && (
                  <>
                    <div style={{ color: "#ef4444", fontSize: 10, marginBottom: 4, fontWeight: 700 }}>RISK SIGNALS ({prof.mRisks.length})</div>
                    {prof.mRisks.map(r => (
                      <div key={r.id} style={{ marginBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ color: "#fca5a5", fontSize: 11 }}>{r.name}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ background: `${sevColor(r.severity)}22`, color: sevColor(r.severity), borderRadius: 3, padding: "1px 5px", fontSize: 9 }}>{r.severity}</span>
                            <span style={{ color: "#64748b", fontSize: 10 }}>{r.rel}%</span>
                          </span>
                        </div>
                        <div style={{ background: "#1e293b", borderRadius: 3, height: 4, overflow: "hidden" }}>
                          <div style={{ width: `${r.rel}%`, height: "100%", background: sevColor(r.severity) }} />
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {prof.mInvs.length > 0 && (
                  <>
                    <div style={{ color: "#22d3ee", fontSize: 10, margin: "8px 0 4px", fontWeight: 700 }}>INVESTIGATIONS ({prof.mInvs.length})</div>
                    {prof.mInvs.map(i => (
                      <div key={i.id} style={{ marginBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ color: "#67e8f9", fontSize: 11 }}>{i.name}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ background: "rgba(34,211,238,0.1)", color: "#22d3ee", borderRadius: 3, padding: "1px 5px", fontSize: 9 }}>{i.status}</span>
                            <span style={{ color: "#64748b", fontSize: 10 }}>{i.rel}%</span>
                          </span>
                        </div>
                        <div style={{ background: "#1e293b", borderRadius: 3, height: 4, overflow: "hidden" }}>
                          <div style={{ width: `${i.rel}%`, height: "100%", background: "#22d3ee" }} />
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {prof.mDatasets.length > 0 && (
                  <>
                    <div style={{ color: "#eab308", fontSize: 10, margin: "8px 0 4px", fontWeight: 700 }}>DATASETS ({prof.mDatasets.length})</div>
                    {prof.mDatasets.map(d => (
                      <div key={d.id} style={{ marginBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ color: "#fde047", fontSize: 11 }}>{d.name}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {d.type && <span style={{ background: "rgba(234,179,8,0.1)", color: "#eab308", borderRadius: 3, padding: "1px 5px", fontSize: 9 }}>{d.type}</span>}
                            <span style={{ color: "#64748b", fontSize: 10 }}>{d.rel}%</span>
                          </span>
                        </div>
                        <div style={{ background: "#1e293b", borderRadius: 3, height: 4, overflow: "hidden" }}>
                          <div style={{ width: `${d.rel}%`, height: "100%", background: "#eab308" }} />
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {prof.mRisks.length === 0 && prof.mInvs.length === 0 && prof.mDatasets.length === 0 && (
                  <div style={{ color: "#ef4444", fontSize: 11 }}>⚠ No risk signal, investigation, or dataset coverage — intel gap.</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* assess */}
      <div style={{ padding: "8px 14px 12px", borderTop: "1px solid #1e3a5f" }}>
        <button
          onClick={handleAssess}
          disabled={assessing}
          style={{
            background: "#22c55e", color: "#000", border: "none", borderRadius: 6,
            padding: "6px 18px", fontSize: 12, fontWeight: 700, cursor: assessing ? "not-allowed" : "pointer", opacity: assessing ? 0.7 : 1,
          }}
        >
          {assessing ? "▶ ASSESSING…" : "▶ ASSESS RISK COVERAGE"}
        </button>
        {assess && (
          <div style={{ marginTop: 8, color: "#94a3b8", fontSize: 11, lineHeight: 1.5 }}>{assess}</div>
        )}
      </div>

      <style>{`@keyframes ircmat-pulse{0%,100%{border-color:rgba(239,68,68,0.3)}50%{border-color:rgba(239,68,68,0.7)}}`}</style>
    </div>
  );
}
