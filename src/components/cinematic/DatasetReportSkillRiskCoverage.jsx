/**
 * DatasetReportSkillRiskCoverage — F244.
 *
 * Parallel-fetches /v1/datasets × /v1/reports × /v1/aip/skill × /entities/RiskSignal
 * and keyword-correlates each dataset against reports, AIP skills, AND risk signals
 * to classify intelligence production coverage:
 *
 *   FULLY_COVERED  — dataset has ≥1 matching report AND ≥1 matching skill AND ≥1 matching risk signal
 *   DUAL_COVERED   — any two of the three sources match
 *   SINGLE_LINKED  — only one source matches
 *   UNCOVERED      — no reports, skills, or risk signals reference this dataset
 *
 * Stat tiles: DATASETS / REPORTS / SKILLS / UNCOVERED
 * Amber badge: UNCOVERED count on toggle button; uncovered rows pulse amber.
 * Filter tabs: ALL | FULLY_COVERED | DUAL_COVERED | SINGLE_LINKED | UNCOVERED + text search.
 * Expand dataset → matched report cards (cyan) + skill cards (green) + risk signal cards (red)
 *   with relevance bars.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence intel production coverage brief + TTS.
 *
 * Toggle:  ◈ DRASCOV at left:1093360, bottom:8, zIndex:668.
 * Event:   jarvis:drascov-toggle
 * Voice:   "drascov" / "dataset report skill" / "dataset production" /
 *          "uncovered datasets" / "intelligence production coverage" /
 *          "dataset coverage" / "production coverage gap"
 * Refresh: 90s auto-refresh while open.
 * Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#00E5FF";
const GN  = "#4CAF50";
const RD  = "#FF3D3D";
const AM  = "#FFB300";
const OR  = "#FF8A00";
const DIM = "rgba(255,255,255,0.04)";
const BG  = "rgba(6,10,18,0.94)";
const MN  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT   = 1093360;
const Z_IDX      = 668;

const DRASCOV_RE =
  /\b(drascov|dataset[._\-\s]report[._\-\s]skill|dataset[._\-\s]production|uncovered[._\-\s]datasets?|intelligence[._\-\s]production[._\-\s]coverage|dataset[._\-\s]coverage|production[._\-\s]coverage[._\-\s]gap)\b/i;

export function isDrascovQuery(t) {
  return DRASCOV_RE.test(t || "");
}

// ── normalisers ───────────────────────────────────────────────────────────────

function normDatasets(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.datasets || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((v, i) => ({
    id:   v.id || String(i),
    name: v.name || v.title || v.label || `Dataset ${i + 1}`,
    desc: v.description || v.summary || v.detail || "",
    type: v.type || v.category || v.format || "",
    tags: (v.tags || []).join(" "),
  }));
}

function normReports(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.reports || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((r, i) => ({
    id:   r.id || String(i),
    name: r.name || r.title || r.subject || `Report ${i + 1}`,
    desc: r.description || r.summary || r.content || r.body || "",
    type: r.type || r.category || "",
    tags: (r.tags || []).join(" "),
  }));
}

function normSkills(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.skills || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((s, i) => ({
    id:   s.id || String(i),
    name: s.name || s.title || s.skill_name || `Skill ${i + 1}`,
    desc: s.description || s.summary || s.detail || "",
    type: s.type || s.category || s.domain || "",
    tags: (s.tags || []).join(" "),
  }));
}

function normSignals(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.signals || raw.risks || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((v, i) => ({
    id:       v.id || String(i),
    name:     v.name || v.title || v.signal || `Signal ${i + 1}`,
    desc:     v.description || v.detail || v.summary || "",
    severity: v.severity || v.level || v.priority || "",
    type:     v.type || v.category || "",
    tags:     (v.tags || []).join(" "),
  }));
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevanceScore(dataset, other) {
  const dWords = new Set(tokens(`${dataset.name} ${dataset.desc} ${dataset.type} ${dataset.tags}`));
  const oWords = tokens(`${other.name} ${other.desc} ${other.type || ""} ${other.tags || ""}`);
  const hits = oWords.filter(w => dWords.has(w));
  return hits.length / Math.max(oWords.length, 1);
}

function classify(datasets, reports, skills, signals) {
  return datasets.map(ds => {
    const matchedReports = reports
      .map(r => ({ ...r, score: relevanceScore(ds, r) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score);

    const matchedSkills = skills
      .map(s => ({ ...s, score: relevanceScore(ds, s) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);

    const matchedSignals = signals
      .map(s => ({ ...s, score: relevanceScore(ds, s) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);

    const matchCount = [matchedReports.length > 0, matchedSkills.length > 0, matchedSignals.length > 0]
      .filter(Boolean).length;

    let coverage;
    if (matchCount === 3)      coverage = "FULLY_COVERED";
    else if (matchCount === 2) coverage = "DUAL_COVERED";
    else if (matchCount === 1) coverage = "SINGLE_LINKED";
    else                        coverage = "UNCOVERED";

    return { ...ds, coverage, matchedReports, matchedSkills, matchedSignals };
  });
}

// ── voice script ─────────────────────────────────────────────────────────────

export async function buildDrascovScript() {
  const base = apiBase();
  const [dsRaw, rpRaw, skRaw, rsRaw] = await Promise.all([
    fetch(`${base}/v1/datasets`,       { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/v1/reports`,        { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/v1/aip/skill`,      { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
  ]);
  const datasets = normDatasets(dsRaw);
  const reports  = normReports(rpRaw);
  const skills   = normSkills(skRaw);
  const signals  = normSignals(rsRaw);
  const rows     = classify(datasets, reports, skills, signals);
  const uncovered = rows.filter(r => r.coverage === "UNCOVERED").length;
  const fully     = rows.filter(r => r.coverage === "FULLY_COVERED").length;
  return `Intelligence Production Coverage online, sir. Of ${datasets.length} datasets cross-referenced against ${reports.length} reports, ${skills.length} AIP skills, and ${signals.length} risk signals, ${fully} datasets have full intelligence production coverage — but ${uncovered} datasets remain completely uncovered by any report, skill, or risk signal, representing critical intelligence production gaps.`;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function coverageColour(c) {
  if (c === "FULLY_COVERED") return GN;
  if (c === "DUAL_COVERED")  return CY;
  if (c === "SINGLE_LINKED") return OR;
  return AM;
}

function coverageLabel(c) {
  if (c === "FULLY_COVERED") return "FULLY COVERED";
  if (c === "DUAL_COVERED")  return "DUAL COVERED";
  if (c === "SINGLE_LINKED") return "SINGLE LINKED";
  return "UNCOVERED";
}

function RelevanceBar({ score }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
      <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
        <div style={{ width: `${Math.round(score * 100)}%`, height: "100%", background: CY, borderRadius: 2 }} />
      </div>
      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 9 }}>{Math.round(score * 100)}%</span>
    </div>
  );
}

// ── component ────────────────────────────────────────────────────────────────

export default function DatasetReportSkillRiskCoverage() {
  const [open,       setOpen]       = useState(false);
  const [rows,       setRows]       = useState([]);
  const [datasets,   setDatasets]   = useState([]);
  const [reports,    setReports]    = useState([]);
  const [skills,     setSkills]     = useState([]);
  const [signals,    setSignals]    = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [err,        setErr]        = useState("");
  const [filter,     setFilter]     = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState({});
  const [assessing,  setAssessing]  = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const base = apiBase();
      const [dsRaw, rpRaw, skRaw, rsRaw] = await Promise.all([
        fetch(`${base}/v1/datasets`,         { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/v1/reports`,          { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/v1/aip/skill`,        { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const ds  = normDatasets(dsRaw);
      const rp  = normReports(rpRaw);
      const sk  = normSkills(skRaw);
      const rs  = normSignals(rsRaw);
      setDatasets(ds); setReports(rp); setSkills(sk); setSignals(rs);
      setRows(classify(ds, rp, sk, rs));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:drascov-toggle", handler);
    return () => window.removeEventListener("jarvis:drascov-toggle", handler);
  }, []);

  const uncoveredCount = rows.filter(r => r.coverage === "UNCOVERED").length;

  const filtered = rows.filter(r => {
    if (filter !== "ALL" && r.coverage !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${r.name} ${r.desc} ${r.type} ${r.tags}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const toggleExpand = id => setExpanded(v => ({ ...v, [id]: !v[id] }));

  const assess = async () => {
    setAssessing(true);
    try {
      const base = apiBase();
      const script = await buildDrascovScript();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = (d.answer || script).replace(/<<ACTION:[^>]*>>/g, "").trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text, voice: getActiveVoice() } }));
    } catch {
      // silent — TTS optional
    } finally {
      setAssessing(false);
    }
  };

  const TABS = ["ALL", "FULLY_COVERED", "DUAL_COVERED", "SINGLE_LINKED", "UNCOVERED"];
  const TAB_LABELS = {
    ALL: "ALL", FULLY_COVERED: "FULLY COVERED", DUAL_COVERED: "DUAL COVERED",
    SINGLE_LINKED: "SINGLE LINKED", UNCOVERED: "UNCOVERED",
  };

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_IDX,
          background: open ? AM : "rgba(20,22,34,0.92)",
          color: open ? "#000" : AM, border: `1px solid ${AM}`,
          borderRadius: 4, padding: "2px 8px", fontSize: 10, fontFamily: MN,
          cursor: "pointer", letterSpacing: 1,
        }}
      >
        ◈ DRASCOV
        {uncoveredCount > 0 && !open && (
          <span style={{
            marginLeft: 5, background: AM, color: "#000",
            borderRadius: 8, padding: "0 5px", fontSize: 9, fontWeight: 700,
          }}>{uncoveredCount}</span>
        )}
      </button>

      {/* panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: BTN_LEFT - 360, width: 640, maxHeight: "72vh",
          overflowY: "auto", background: BG, border: `1px solid ${AM}`,
          borderRadius: 6, zIndex: Z_IDX + 1, fontFamily: MN, fontSize: 11,
          boxShadow: `0 0 24px ${AM}33`,
        }}>
          {/* header */}
          <div style={{ padding: "8px 12px", borderBottom: `1px solid rgba(255,179,0,0.2)`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: AM, fontWeight: 700, letterSpacing: 1, fontSize: 12 }}>
              ◈ DRASCOV — Intelligence Production Coverage
            </span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${DIM}` }}>
            {[
              { label: "DATASETS", val: datasets.length, col: AM },
              { label: "REPORTS",  val: reports.length,  col: CY },
              { label: "SKILLS",   val: skills.length,   col: GN },
              { label: "UNCOVERED", val: uncoveredCount, col: RD },
            ].map(({ label, val, col }) => (
              <div key={label} style={{ flex: 1, background: DIM, borderRadius: 4, padding: "6px 8px", textAlign: "center" }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          {rows.length > 0 && (
            <div style={{ padding: "6px 12px", display: "flex", gap: 3, alignItems: "center", borderBottom: `1px solid ${DIM}` }}>
              {["FULLY_COVERED", "DUAL_COVERED", "SINGLE_LINKED", "UNCOVERED"].map(c => {
                const pct = Math.round(rows.filter(r => r.coverage === c).length / rows.length * 100);
                if (!pct) return null;
                return (
                  <div key={c} title={`${coverageLabel(c)}: ${pct}%`}
                    style={{ flex: pct, height: 6, background: coverageColour(c), borderRadius: 2, opacity: 0.85 }} />
                );
              })}
            </div>
          )}

          {/* controls */}
          <div style={{ padding: "6px 12px", display: "flex", gap: 6, flexWrap: "wrap", borderBottom: `1px solid ${DIM}`, alignItems: "center" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setFilter(t)} style={{
                background: filter === t ? AM : DIM, color: filter === t ? "#000" : "rgba(255,255,255,0.6)",
                border: `1px solid ${filter === t ? AM : "rgba(255,255,255,0.1)"}`,
                borderRadius: 3, padding: "2px 7px", fontSize: 9, cursor: "pointer", letterSpacing: 1,
              }}>{TAB_LABELS[t]}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search datasets…"
              style={{
                marginLeft: "auto", background: DIM, border: `1px solid rgba(255,255,255,0.15)`,
                borderRadius: 3, padding: "2px 8px", color: "#fff", fontSize: 10, fontFamily: MN, width: 160,
                outline: "none",
              }}
            />
          </div>

          {/* rows */}
          <div style={{ padding: "4px 0" }}>
            {loading && <div style={{ padding: 16, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>Loading…</div>}
            {err && <div style={{ padding: 12, color: RD }}>{err}</div>}
            {!loading && filtered.map(row => {
              const isExp = expanded[row.id];
              const pulse = row.coverage === "UNCOVERED"
                ? { animation: "drascov-pulse 2s ease-in-out infinite" } : {};
              return (
                <div key={row.id} style={{ borderBottom: `1px solid ${DIM}` }}>
                  <div
                    onClick={() => toggleExpand(row.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
                      cursor: "pointer", ...pulse,
                    }}
                  >
                    <span style={{ color: coverageColour(row.coverage), fontSize: 9, minWidth: 90, letterSpacing: 1 }}>
                      {coverageLabel(row.coverage)}
                    </span>
                    <span style={{ color: "#fff", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.name}
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>{row.type}</span>
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginLeft: 4 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: "4px 12px 10px 32px", background: "rgba(0,0,0,0.3)" }}>
                      {row.desc && <div style={{ color: "rgba(255,255,255,0.5)", marginBottom: 6, fontSize: 10 }}>{row.desc}</div>}

                      {/* matched reports */}
                      {row.matchedReports.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>REPORTS ({row.matchedReports.length})</div>
                          {row.matchedReports.slice(0, 4).map(r => (
                            <div key={r.id} style={{ background: "rgba(0,229,255,0.07)", borderRadius: 3, padding: "3px 7px", marginBottom: 2 }}>
                              <div style={{ color: CY, fontSize: 10 }}>{r.name}</div>
                              <RelevanceBar score={r.score} />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* matched skills */}
                      {row.matchedSkills.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: GN, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>AIP SKILLS ({row.matchedSkills.length})</div>
                          {row.matchedSkills.slice(0, 4).map(s => (
                            <div key={s.id} style={{ background: "rgba(76,175,80,0.07)", borderRadius: 3, padding: "3px 7px", marginBottom: 2 }}>
                              <div style={{ color: GN, fontSize: 10 }}>{s.name}</div>
                              <RelevanceBar score={s.score} />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* matched risk signals */}
                      {row.matchedSignals.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: RD, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>RISK SIGNALS ({row.matchedSignals.length})</div>
                          {row.matchedSignals.slice(0, 4).map(s => (
                            <div key={s.id} style={{ background: "rgba(255,61,61,0.07)", borderRadius: 3, padding: "3px 7px", marginBottom: 2 }}>
                              <div style={{ color: RD, fontSize: 10 }}>{s.name}
                                {s.severity && <span style={{ color: OR, marginLeft: 6, fontSize: 9 }}>{s.severity}</span>}
                              </div>
                              <RelevanceBar score={s.score} />
                            </div>
                          ))}
                        </div>
                      )}

                      {row.coverage === "UNCOVERED" && (
                        <div style={{ color: AM, fontSize: 9, marginTop: 4 }}>
                          ⚠ No reports, skills, or risk signals reference this dataset — intelligence production gap
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && filtered.length === 0 && !err && (
              <div style={{ padding: 16, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>No datasets match current filter.</div>
            )}
          </div>

          {/* assess footer */}
          <div style={{ padding: "8px 12px", borderTop: `1px solid ${DIM}`, display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
            <button onClick={load} style={{
              background: DIM, color: "rgba(255,255,255,0.5)", border: `1px solid rgba(255,255,255,0.15)`,
              borderRadius: 3, padding: "3px 10px", fontSize: 9, cursor: "pointer", letterSpacing: 1,
            }}>↺ REFRESH</button>
            <button onClick={assess} disabled={assessing} style={{
              background: assessing ? "rgba(255,179,0,0.2)" : AM, color: assessing ? AM : "#000",
              border: `1px solid ${AM}`, borderRadius: 3, padding: "3px 12px", fontSize: 10,
              cursor: assessing ? "not-allowed" : "pointer", letterSpacing: 1, fontWeight: 700,
            }}>
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes drascov-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
      `}</style>
    </>
  );
}
