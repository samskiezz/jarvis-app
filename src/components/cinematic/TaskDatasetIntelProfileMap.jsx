/**
 * F187 — Task × Dataset × IntelProfile Intelligence Task Coverage (TDIPMAP)
 *
 * Parallel-fetches /entities/Task + /v1/datasets + /entities/IntelProfile
 * and keyword-correlates each task against datasets AND intel profiles to classify:
 *
 *   FULLY_BACKED   — matched dataset + intel profile (full intelligence grounding)
 *   DATA_SOURCED   — dataset match only, no profile
 *   PROFILE_LINKED — intel profile match only, no dataset
 *   UNANCHORED     — no matches (intelligence gap)
 *
 * Stat tiles: TASKS / DATASETS / INTEL PROFILES + four class counts + BACKED%.
 * Amber badge on UNANCHORED count.
 * Filter tabs ALL / FULLY_BACKED / DATA_SOURCED / PROFILE_LINKED / UNANCHORED + text search.
 * Expand task → matched dataset cards (teal) + intel profile cards (orange) with relevance bars.
 * ▶ ASSESS TASK INTELLIGENCE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:tdipmap-toggle event.
 *
 * Voice triggers:
 *   "tdipmap / task dataset intel / task intelligence coverage /
 *    unanchored task / task data source / task intel profile / task coverage map"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_047_080;
const Z_INDEX  = 248;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const TDIPMAP_RE = /\b(tdipmap|task[\s-]dataset[\s-]intel|task[\s-]intelligence[\s-]coverage|unanchored[\s-]task|task[\s-]data[\s-]source|task[\s-]intel[\s-]profile|task[\s-]coverage[\s-]map)\b/i;

export function isTdipmapQuery(q = "") { return TDIPMAP_RE.test(q); }

export async function buildTdipmapScript() {
  const base = apiBase();
  const [tasksRes, datasetsRes, profilesRes] = await Promise.allSettled([
    fetch(`${base}/entities/Task`).then(r => r.json()),
    fetch(`${base}/v1/datasets`).then(r => r.json()),
    fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
  ]);
  const tasks    = (tasksRes.status    === "fulfilled" ? (tasksRes.value?.items    || tasksRes.value    || []) : []);
  const datasets = (datasetsRes.status === "fulfilled" ? (datasetsRes.value?.items || datasetsRes.value || []) : []);
  const profiles = (profilesRes.status === "fulfilled" ? (profilesRes.value?.items || profilesRes.value || []) : []);
  const unanchored = tasks.filter(t => {
    const kws = keywords(taskText(t));
    const hasDs = datasets.some(d => scoreText(dsText(d), kws) > 0);
    const hasPr = profiles.some(p => scoreText(profText(p), kws) > 0);
    return !hasDs && !hasPr;
  }).length;
  const total  = tasks.length;
  const backed = total - unanchored;
  const pct    = total ? Math.round((backed / total) * 100) : 0;
  return `TDIPMAP Task Intelligence Coverage online, sir. I am correlating ${total} tasks against ${datasets.length} datasets and ${profiles.length} intel profiles. ${backed} tasks have intelligence grounding — ${pct}% task coverage. ${unanchored} task${unanchored === 1 ? "" : "s"} remain unanchored with no data source and no actor profile. Recommend assigning datasets or linking intel profiles to those unanchored tasks immediately.`;
}

const CY     = "#00CFFF";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const TE     = "#2DD4BF";
const OR     = "#F97316";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_BACKED:   GR,
  DATA_SOURCED:   TE,
  PROFILE_LINKED: OR,
  UNANCHORED:     AM,
};

const PRIORITY_COLOR = {
  critical: RD,
  high:     OR,
  medium:   AM,
  low:      GR,
};

const TABS = ["ALL", "FULLY_BACKED", "DATA_SOURCED", "PROFILE_LINKED", "UNANCHORED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function taskText(t) {
  return [t.name, t.title, t.description, t.type, t.priority, t.status, t.tags].filter(Boolean).join(" ");
}
function dsText(d) {
  return [d.name, d.title, d.description, d.type, d.tags, d.category].filter(Boolean).join(" ");
}
function profText(p) {
  return [p.name, p.aliases, p.org, p.role, p.description, p.tags, p.origin].filter(Boolean).join(" ");
}

function classify(task, datasets, profiles) {
  const kws = keywords(taskText(task));
  const matchedDs = datasets
    .map(d => ({ ...d, _score: scoreText(dsText(d), kws) }))
    .filter(d => d._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
  const matchedPr = profiles
    .map(p => ({ ...p, _score: scoreText(profText(p), kws) }))
    .filter(p => p._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
  const hasDs = matchedDs.length > 0;
  const hasPr = matchedPr.length > 0;
  let cls;
  if (hasDs && hasPr) cls = "FULLY_BACKED";
  else if (hasDs)     cls = "DATA_SOURCED";
  else if (hasPr)     cls = "PROFILE_LINKED";
  else                cls = "UNANCHORED";
  return { ...task, _cls: cls, _ds: matchedDs, _pr: matchedPr };
}

export default function TaskDatasetIntelProfileMap() {
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [tasks, setTasks]         = useState([]);
  const [datasets, setDatasets]   = useState([]);
  const [profiles, setProfiles]   = useState([]);
  const [classified, setClassified] = useState([]);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [brief, setBrief]         = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [tasksRes, datasetsRes, profilesRes] = await Promise.allSettled([
        fetch(`${base}/entities/Task`).then(r => r.json()),
        fetch(`${base}/v1/datasets`).then(r => r.json()),
        fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
      ]);
      const ts = tasksRes.status    === "fulfilled" ? (tasksRes.value?.items    || tasksRes.value    || []) : [];
      const ds = datasetsRes.status === "fulfilled" ? (datasetsRes.value?.items || datasetsRes.value || []) : [];
      const pr = profilesRes.status === "fulfilled" ? (profilesRes.value?.items || profilesRes.value || []) : [];
      setTasks(ts);
      setDatasets(ds);
      setProfiles(pr);
      setClassified(ts.map(t => classify(t, ds, pr)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:tdipmap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:tdipmap-toggle", onToggle);
  }, []);

  const fully    = classified.filter(s => s._cls === "FULLY_BACKED").length;
  const dataSrc  = classified.filter(s => s._cls === "DATA_SOURCED").length;
  const profLnk  = classified.filter(s => s._cls === "PROFILE_LINKED").length;
  const unanchor = classified.filter(s => s._cls === "UNANCHORED").length;
  const total    = classified.length;
  const backedPct = total ? Math.round(((fully + dataSrc + profLnk) / total) * 100) : 0;

  const visible = classified
    .filter(s => tab === "ALL" || s._cls === tab)
    .filter(s => !search || taskText(s).toLowerCase().includes(search.toLowerCase()));

  const assess = async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const base = apiBase();
      const ctx = `Tasks:${total} Datasets:${datasets.length} IntelProfiles:${profiles.length} FullyBacked:${fully} DataSourced:${dataSrc} ProfileLinked:${profLnk} Unanchored:${unanchor} Coverage:${backedPct}%`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `In 2 sentences, assess the intelligence task coverage gaps: ${ctx}` }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      if (txt) {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: txt }),
        }).then(async res => {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.play().catch(() => {});
        }).catch(() => {});
      }
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Task × Dataset × IntelProfile Intelligence Task Coverage (TDIPMAP)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: open ? AM : "rgba(5,8,13,0.85)",
          border: `1px solid ${AM}`,
          color: open ? "#000" : AM,
          fontFamily: FONT, fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", borderRadius: 3, cursor: "pointer",
          boxShadow: unanchor > 0 ? `0 0 8px ${AM}88` : "none",
          whiteSpace: "nowrap",
        }}
      >
        ◈ TDIPMAP
        {unanchor > 0 && (
          <span style={{
            marginLeft: 4, background: AM, color: "#000",
            borderRadius: 8, fontSize: 8, padding: "0 4px", fontWeight: 700,
          }}>{unanchor}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: Math.max(8, BTN_LEFT - 300),
          zIndex: Z_INDEX + 100, width: 820, maxHeight: "82vh",
          background: BG, border: `1px solid ${BORDER}`,
          borderRadius: 8, fontFamily: FONT, fontSize: 11,
          color: "#DCEBF5", overflow: "hidden", display: "flex", flexDirection: "column",
          boxShadow: `0 0 40px rgba(0,207,255,0.12)`,
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ color: AM, fontWeight: 700, letterSpacing: 2 }}>TDIPMAP</span>
              <span style={{ color: "#6B7280", marginLeft: 8, fontSize: 10 }}>Task × Dataset × IntelProfile — Intelligence Task Coverage</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: "8px 14px", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: `1px solid ${BORDER}` }}>
            {[
              { label: "TASKS",          val: tasks.length,    clr: CY },
              { label: "DATASETS",       val: datasets.length, clr: TE },
              { label: "INTEL PROFILES", val: profiles.length, clr: OR },
              { label: "FULLY BACKED",   val: fully,           clr: GR },
              { label: "DATA SOURCED",   val: dataSrc,         clr: TE },
              { label: "PROFILE LINKED", val: profLnk,         clr: OR },
              { label: "UNANCHORED",     val: unanchor,        clr: AM },
              { label: "BACKED%",        val: `${backedPct}%`, clr: backedPct >= 70 ? GR : backedPct >= 40 ? AM : RD },
            ].map(t => (
              <div key={t.label} style={{
                background: "rgba(0,0,0,0.3)", border: `1px solid ${t.clr}33`,
                borderRadius: 4, padding: "4px 8px", minWidth: 80, textAlign: "center",
              }}>
                <div style={{ color: t.clr, fontSize: 14, fontWeight: 700 }}>{loading ? "…" : t.val}</div>
                <div style={{ color: "#6B7280", fontSize: 8, letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          {!loading && total > 0 && (
            <div style={{ padding: "4px 14px", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ height: 4, background: "#1e2936", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${backedPct}%`, background: backedPct >= 70 ? GR : backedPct >= 40 ? AM : RD, borderRadius: 2, transition: "width 0.4s" }} />
              </div>
            </div>
          )}

          {/* Controls */}
          <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? AM : "rgba(0,0,0,0.4)",
                border: `1px solid ${tab === t ? AM : "#334155"}`,
                color: tab === t ? "#000" : "#94A3B8",
                fontFamily: FONT, fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer",
              }}>{t.replace(/_/g, " ")}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search tasks…"
              style={{
                marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid #334155`,
                color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "2px 8px", borderRadius: 3,
                width: 160, outline: "none",
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
            {error && <div style={{ color: RD, padding: 8 }}>Error: {error}</div>}
            {!loading && !error && visible.length === 0 && (
              <div style={{ color: "#6B7280", padding: 12, textAlign: "center" }}>No tasks match current filter.</div>
            )}
            {visible.map((t, i) => {
              const clr    = CLASS_COLOR[t._cls] || AM;
              const priClr = PRIORITY_COLOR[(t.priority || "").toLowerCase()] || AM;
              const isExp  = expanded === i;
              return (
                <div key={t.id || i} style={{ marginBottom: 4 }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
                      background: "rgba(0,0,0,0.3)", borderRadius: 4,
                      border: `1px solid ${isExp ? clr : "transparent"}`,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ color: clr, fontSize: 9, letterSpacing: 1, minWidth: 120 }}>{t._cls.replace(/_/g, " ")}</span>
                    <span style={{ flex: 1, color: "#DCEBF5", fontSize: 10 }}>{t.name || t.title || "Unknown Task"}</span>
                    {t.priority && <span style={{ color: priClr, fontSize: 8, border: `1px solid ${priClr}44`, borderRadius: 2, padding: "0 4px" }}>{t.priority}</span>}
                    <span style={{ color: "#334155", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: "6px 12px", background: "rgba(0,0,0,0.2)", borderRadius: "0 0 4px 4px", marginTop: 1 }}>
                      {t._ds.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: TE, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>DATASETS ({t._ds.length})</div>
                          {t._ds.map((d, k) => (
                            <div key={k} style={{ marginBottom: 3, padding: "3px 6px", background: "rgba(45,212,191,0.06)", borderRadius: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{d.name || d.title || "Dataset"}</span>
                                {d.type && <span style={{ color: TE, fontSize: 8, border: `1px solid ${TE}33`, borderRadius: 2, padding: "0 3px" }}>{d.type}</span>}
                              </div>
                              <div style={{ marginTop: 2, height: 3, background: "#1e2936", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, (d._score / 5) * 100)}%`, background: TE, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {t._pr.length > 0 && (
                        <div>
                          <div style={{ color: OR, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>INTEL PROFILES ({t._pr.length})</div>
                          {t._pr.map((p, k) => (
                            <div key={k} style={{ marginBottom: 3, padding: "3px 6px", background: "rgba(249,115,22,0.06)", borderRadius: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{p.name || p.title || "Profile"}</span>
                                {p.role && <span style={{ color: OR, fontSize: 8, border: `1px solid ${OR}33`, borderRadius: 2, padding: "0 3px" }}>{p.role}</span>}
                              </div>
                              <div style={{ marginTop: 2, height: 3, background: "#1e2936", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, (p._score / 5) * 100)}%`, background: OR, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {t._ds.length === 0 && t._pr.length === 0 && (
                        <div style={{ color: "#6B7280", fontSize: 10, padding: "4px 0" }}>No dataset or intel profile coverage — task intelligence gap.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? "#1e2936" : AM, color: assessing ? "#6B7280" : "#000",
                border: "none", fontFamily: FONT, fontSize: 9, letterSpacing: 1,
                padding: "4px 12px", borderRadius: 3, cursor: assessing ? "not-allowed" : "pointer",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS TASK INTELLIGENCE"}
            </button>
            {brief && <div style={{ flex: 1, color: "#94A3B8", fontSize: 10, lineHeight: 1.4 }}>{brief}</div>}
            <span style={{ color: "#334155", fontSize: 9, marginLeft: "auto" }}>
              auto-refresh 90s · /entities/Task · /v1/datasets · /entities/IntelProfile
            </span>
          </div>
        </div>
      )}
    </>
  );
}
