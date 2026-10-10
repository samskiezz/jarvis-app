/**
 * F167 — Dataset × AIP Skill × Investigation Data Science Nexus (DSINEX)
 *
 * Parallel-fetches /v1/datasets + /v1/aip/skill + /v1/investigations and
 * keyword-correlates each dataset (name/description/type/tags) against
 * AIP skills AND investigations to classify:
 *
 *   FULLY_ANALYZED  — matched both a skill AND an investigation
 *   SKILL_MAPPED    — matched a skill, no investigation
 *   INVESTIGATED    — matched an investigation, no skill
 *   DARK            — no matches (data science gap)
 *
 * Stat tiles: DATASETS / SKILLS / INVESTIGATIONS + all four class counts + COVERAGE%.
 * Amber badge on dark count.
 * Filter tabs ALL / FULLY_ANALYZED / SKILL_MAPPED / INVESTIGATED / DARK + text search.
 * Expand dataset → matched AIP skill cards (purple, type badge) +
 *                  matched investigation cards (cyan, priority badge) with relevance bars.
 * ▶ ASSESS DATA SCIENCE COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:dsinex-toggle event.
 *
 * Voice triggers: "dsinex / dataset science / data science nexus / dark datasets /
 *                  dataset coverage / dataset skill investigation / unanalyzed datasets".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_035_880;
const Z_INDEX  = 228;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const DSINEX_RE = /\b(dsinex|dataset[\s-]science|data[\s-]science[\s-]nexus|dark[\s-]datasets?|dataset[\s-]coverage|dataset[\s-]skill[\s-]investigation|unanalyzed[\s-]datasets?)\b/i;

const PU     = "#A855F7";
const CY     = "#00CFFF";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(168,85,247,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_ANALYZED: GR,
  SKILL_MAPPED:   PU,
  INVESTIGATED:   CY,
  DARK:           AM,
};

const TABS = ["ALL", "FULLY_ANALYZED", "SKILL_MAPPED", "INVESTIGATED", "DARK"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function datasetText(d) {
  return `${d.name || d.title || ""} ${d.description || d.summary || ""} ${d.type || d.format || ""} ${(d.tags || []).join(" ")}`;
}
function skillText(s) {
  return `${s.name || s.title || s.skill || ""} ${s.description || s.summary || ""} ${s.type || s.category || ""} ${(s.tags || []).join(" ")}`;
}
function invText(i) {
  return `${i.title || i.name || ""} ${i.description || i.summary || ""} ${i.status || ""} ${i.type || ""} ${(i.tags || []).join(" ")}`;
}

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

async function loadAll() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [dsRes, skRes, invRes] = await Promise.allSettled([
    fetch(`${apiBase}/v1/datasets`,    { headers }),
    fetch(`${apiBase}/v1/aip/skill`,   { headers }),
    fetch(`${apiBase}/v1/investigations`, { headers }),
  ]);
  const datasets      = dsRes.status  === "fulfilled" && dsRes.value.ok
    ? normaliseArray(await dsRes.value.json(),  ["datasets", "data", "items"]) : [];
  const skills        = skRes.status  === "fulfilled" && skRes.value.ok
    ? normaliseArray(await skRes.value.json(),  ["skills", "aip_skills", "items"]) : [];
  const investigations = invRes.status === "fulfilled" && invRes.value.ok
    ? normaliseArray(await invRes.value.json(), ["investigations", "cases", "items"]) : [];
  return { datasets, skills, investigations };
}

function correlate(datasets, skills, investigations) {
  return datasets.map(d => {
    const kws = keywords(datasetText(d));
    const matchedSkills = skills
      .map(s => ({ skill: s, rel: score(skillText(s), kws) }))
      .filter(x => x.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const matchedInv = investigations
      .map(i => ({ inv: i, rel: score(invText(i), kws) }))
      .filter(x => x.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const hasSk  = matchedSkills.length > 0;
    const hasInv = matchedInv.length > 0;
    const cls = hasSk && hasInv ? "FULLY_ANALYZED"
              : hasSk           ? "SKILL_MAPPED"
              : hasInv          ? "INVESTIGATED"
              :                   "DARK";
    return { ...d, _cls: cls, _skills: matchedSkills, _inv: matchedInv };
  });
}

export function isDsinexQuery(q = "") { return DSINEX_RE.test(q); }

export async function buildDsinexScript() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [dsRes, skRes, invRes] = await Promise.allSettled([
    fetch(`${apiBase}/v1/datasets`,       { headers }),
    fetch(`${apiBase}/v1/aip/skill`,      { headers }),
    fetch(`${apiBase}/v1/investigations`, { headers }),
  ]);
  const datasets      = dsRes.status  === "fulfilled" && dsRes.value.ok
    ? normaliseArray(await dsRes.value.json(),  ["datasets", "data", "items"]) : [];
  const skills        = skRes.status  === "fulfilled" && skRes.value.ok
    ? normaliseArray(await skRes.value.json(),  ["skills", "aip_skills", "items"]) : [];
  const investigations = invRes.status === "fulfilled" && invRes.value.ok
    ? normaliseArray(await invRes.value.json(), ["investigations", "cases", "items"]) : [];
  const rows         = correlate(datasets, skills, investigations);
  const fullyAnalyzed = rows.filter(r => r._cls === "FULLY_ANALYZED").length;
  const dark          = rows.filter(r => r._cls === "DARK").length;
  const covPct        = rows.length ? Math.round((rows.length - dark) / rows.length * 100) : 0;
  return `DSINEX Data Science Nexus online, sir. Across ${rows.length} datasets cross-referenced against ${skills.length} AIP skills and ${investigations.length} investigations, ${fullyAnalyzed} datasets are fully analyzed with both skill coverage and active investigations. ${dark} datasets remain dark — ${covPct}% data science coverage. Opening the panel for full visibility now.`;
}

export default function DataScienceNexus() {
  const [open,        setOpen]        = useState(false);
  const [tab,         setTab]         = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [rows,        setRows]        = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [expanded,    setExpanded]    = useState(null);
  const [totals,      setTotals]      = useState({ datasets: 0, skills: 0, investigations: 0 });
  const [assessing,   setAssessing]   = useState(false);
  const [assessment,  setAssessment]  = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { datasets, skills, investigations } = await loadAll();
      setTotals({ datasets: datasets.length, skills: skills.length, investigations: investigations.length });
      setRows(correlate(datasets, skills, investigations));
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(v => { if (!v) load(); return !v; }); };
    window.addEventListener("jarvis:dsinex-toggle", toggle);
    return () => window.removeEventListener("jarvis:dsinex-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true); setAssessment("");
    try {
      const body = await buildDsinexScript();
      const res = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
        },
        body: JSON.stringify({ message: `You are JARVIS. In exactly 2 sentences, assess this data science coverage:\n${body}` }),
      });
      const data = await res.json();
      const txt  = data?.response || data?.message || data?.content || "";
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessment("Unable to assess data science coverage at this time, sir.");
    } finally {
      setAssessing(false);
    }
  }

  const counts = {
    FULLY_ANALYZED: rows.filter(r => r._cls === "FULLY_ANALYZED").length,
    SKILL_MAPPED:   rows.filter(r => r._cls === "SKILL_MAPPED").length,
    INVESTIGATED:   rows.filter(r => r._cls === "INVESTIGATED").length,
    DARK:           rows.filter(r => r._cls === "DARK").length,
  };
  const covPct = rows.length ? Math.round((rows.length - counts.DARK) / rows.length * 100) : 0;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r._cls !== tab) return false;
    if (!search) return true;
    return datasetText(r).toLowerCase().includes(search.toLowerCase());
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.85)", border: "1px solid rgba(168,85,247,0.35)",
          color: CY, fontFamily: FONT, fontSize: 10, padding: "3px 7px",
          cursor: "pointer", borderRadius: 3, letterSpacing: 1,
        }}
      >
        ◈ DSINEX{counts.DARK > 0 && <span style={{ color: AM, marginLeft: 4 }}>{counts.DARK}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 50, right: 20, zIndex: Z_INDEX,
      width: 640, maxHeight: "78vh", display: "flex", flexDirection: "column",
      background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
      fontFamily: FONT, color: CY, boxShadow: "0 0 32px rgba(168,85,247,0.15)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ fontSize: 11, letterSpacing: 2, color: PU }}>◈ DSINEX — DATA SCIENCE NEXUS</span>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: RD, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
        {[
          ["DATASETS",       totals.datasets,          CY],
          ["AIP SKILLS",     totals.skills,             PU],
          ["INVESTIGATIONS",  totals.investigations,    "#00CFFF"],
          ["FULLY ANALYZED", counts.FULLY_ANALYZED,    GR],
          ["SKILL MAPPED",   counts.SKILL_MAPPED,       PU],
          ["INVESTIGATED",   counts.INVESTIGATED,       CY],
          ["DARK",           counts.DARK,               AM],
          [`COVERAGE ${covPct}%`, covPct,              covPct >= 80 ? GR : covPct >= 50 ? AM : RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(0,0,0,0.35)", border: `1px solid ${col}33`,
            borderRadius: 4, padding: "4px 10px", textAlign: "center", minWidth: 70,
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 8, color: "#888", letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: "0 14px 8px" }}>
        <div style={{ height: 4, background: "#111", borderRadius: 2 }}>
          <div style={{ height: 4, width: `${covPct}%`, background: covPct >= 80 ? GR : AM,
            borderRadius: 2, transition: "width 0.4s" }} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "rgba(168,85,247,0.2)" : "rgba(0,0,0,0.3)",
            border: `1px solid ${tab === t ? PU : "#333"}`,
            color: tab === t ? CY : "#666", fontSize: 9, padding: "3px 8px",
            cursor: "pointer", borderRadius: 3, letterSpacing: 1,
          }}>{t.replace(/_/g, " ")}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "0 14px 8px" }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search datasets..."
          style={{
            width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid #333",
            color: CY, fontFamily: FONT, fontSize: 10, padding: "4px 8px",
            borderRadius: 3, boxSizing: "border-box", outline: "none",
          }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 14px 8px" }}>
        {loading && <div style={{ color: "#555", fontSize: 10, padding: 8 }}>Loading…</div>}
        {error   && <div style={{ color: RD,   fontSize: 10, padding: 8 }}>{error}</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color: "#555", fontSize: 10, padding: 8 }}>No datasets match.</div>
        )}
        {visible.map((d, i) => {
          const id    = d.id || d._id || i;
          const name  = d.name || d.title || `Dataset ${i + 1}`;
          const type  = d.type || d.format || "";
          const isExp = expanded === id;
          const col   = CLASS_COLOR[d._cls] || CY;
          return (
            <div key={id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "rgba(0,0,0,0.3)", border: `1px solid ${col}33`,
                  borderRadius: 4, padding: "6px 10px", cursor: "pointer",
                }}
              >
                <div>
                  <span style={{ fontSize: 11, color: CY }}>{name}</span>
                  {type && <span style={{ fontSize: 9, color: "#666", marginLeft: 8 }}>{type}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 9, color: col, letterSpacing: 1 }}>{d._cls.replace(/_/g, " ")}</span>
                  <span style={{ fontSize: 9, color: "#555" }}>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>

              {isExp && (
                <div style={{ padding: "6px 10px", background: "rgba(0,0,0,0.2)",
                  borderLeft: `2px solid ${col}`, marginLeft: 4 }}>
                  {/* Matched AIP skills */}
                  {d._skills.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: PU, marginBottom: 4, letterSpacing: 1 }}>AIP SKILLS</div>
                      {d._skills.map(({ skill: s, rel }, j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: "#ccc" }}>{s.name || s.title || s.skill || `Skill ${j + 1}`}</span>
                            <span style={{ fontSize: 9, color: PU, padding: "1px 5px",
                              background: "rgba(168,85,247,0.12)", borderRadius: 2 }}>{s.type || s.category || "SKILL"}</span>
                          </div>
                          <div style={{ height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: 3, width: `${Math.min(rel * 20, 100)}%`,
                              background: PU, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Matched investigations */}
                  {d._inv.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: CY, marginBottom: 4, letterSpacing: 1 }}>INVESTIGATIONS</div>
                      {d._inv.map(({ inv: inv, rel }, j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: "#ccc" }}>{inv.title || inv.name || `Investigation ${j + 1}`}</span>
                            <span style={{ fontSize: 9, color: CY, padding: "1px 5px",
                              background: "rgba(0,207,255,0.1)", borderRadius: 2 }}>{inv.priority || inv.status || "ACTIVE"}</span>
                          </div>
                          <div style={{ height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: 3, width: `${Math.min(rel * 20, 100)}%`,
                              background: CY, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {d._skills.length === 0 && d._inv.length === 0 && (
                    <div style={{ fontSize: 9, color: "#555" }}>No skills or investigations matched this dataset.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assess */}
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}` }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? "rgba(0,0,0,0.3)" : "rgba(168,85,247,0.12)",
          border: `1px solid ${assessing ? "#333" : PU}`,
          color: assessing ? "#555" : PU, fontFamily: FONT, fontSize: 10,
          padding: "4px 12px", cursor: assessing ? "not-allowed" : "pointer", borderRadius: 3,
        }}>
          {assessing ? "Assessing…" : "▶ ASSESS DATA SCIENCE COVERAGE"}
        </button>
        {assessment && (
          <div style={{ marginTop: 8, fontSize: 10, color: "#aaa", lineHeight: 1.5,
            padding: "6px 10px", background: "rgba(168,85,247,0.06)",
            border: "1px solid rgba(168,85,247,0.15)", borderRadius: 4 }}>
            {assessment}
          </div>
        )}
      </div>
    </div>
  );
}
