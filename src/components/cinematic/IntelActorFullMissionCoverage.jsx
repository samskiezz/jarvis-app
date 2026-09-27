/**
 * F132 — IntelProfile × Task × Knowledge × Scenario
 *         Full Actor Mission Intelligence Coverage (FAMICOV)
 *
 * Parallel-fetches:
 *   /entities/IntelProfile  → known threat actor profiles
 *   /entities/Task          → active mission tasks
 *   /knowledge/             → knowledge-base articles
 *   /v1/scenario/list       → scenario playbooks
 *
 * Keyword-correlates each intel actor profile (name/aliases/org/role/tags)
 * against tasks AND KB articles AND scenarios to classify:
 *   FULLY_TRACKED  — matched all three sources
 *   DUAL_COVERED   — matched any two sources
 *   SINGLE_TRACKED — matched exactly one source
 *   UNTRACKED      — no match (intelligence gap)
 *
 * Red pulse badge on untracked count.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh.  jarvis:famicov-toggle event.
 * Voice: "famicov / full actor coverage / actor mission intel /
 *         intel actor mission / tracked actors / untracked actors".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_016_840;
const Z_INDEX  = 194;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const FAMICOV_RE =
  /\b(famicov|full[\s-]actor[\s-]coverage|actor[\s-]mission[\s-]intel|intel[\s-]actor[\s-]mission|tracked[\s-]actors?|untracked[\s-]actors?)\b/i;

// ── colours ───────────────────────────────────────────────────────────────────
const CY     = "#00CFFF";
const AM     = "#F59E0B";
const GR     = "#22C55E";
const OR     = "#F97316";
const TE     = "#14B8A6";
const PU     = "#A855F7";
const RE     = "#EF4444";
const DIM    = "#6E8AA0";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

// ── exports for JarvisBrain ───────────────────────────────────────────────────
export function isFamicovQuery(text) {
  return FAMICOV_RE.test(text || "");
}

export async function buildFamicovScript() {
  const base = apiBase();
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const [ipRes, tRes, kRes, sRes] = await Promise.allSettled([
    fetch(`${base}/entities/IntelProfile`,  { headers: hdr }).then(r => r.json()),
    fetch(`${base}/entities/Task`,          { headers: hdr }).then(r => r.json()),
    fetch(`${base}/knowledge/`,             { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/scenario/list`,       { headers: hdr }).then(r => r.json()),
  ]);
  const actors    = Array.isArray(ipRes.value) ? ipRes.value
                  : Array.isArray(ipRes.value?.data) ? ipRes.value.data : [];
  const tasks     = Array.isArray(tRes.value)  ? tRes.value
                  : Array.isArray(tRes.value?.data)  ? tRes.value.data  : [];
  const articles  = Array.isArray(kRes.value)  ? kRes.value
                  : Array.isArray(kRes.value?.articles) ? kRes.value.articles
                  : Array.isArray(kRes.value?.data)  ? kRes.value.data  : [];
  const scenarios = Array.isArray(sRes.value)  ? sRes.value
                  : Array.isArray(sRes.value?.scenarios) ? sRes.value.scenarios
                  : Array.isArray(sRes.value?.data)  ? sRes.value.data  : [];

  const untracked = actors.filter(a => {
    const terms = [a.name, ...(a.aliases || []), a.org, a.role, ...(a.tags || [])]
      .filter(Boolean).map(s => s.toLowerCase()).filter(w => w.length > 3);
    const hasTask = tasks.some(t => {
      const txt = `${t.title||""} ${t.description||""} ${t.name||""}`.toLowerCase();
      return terms.some(w => txt.includes(w));
    });
    const hasKb = articles.some(ar => {
      const txt = `${ar.title||""} ${ar.content||""} ${ar.summary||""} ${(ar.tags||[]).join(" ")}`.toLowerCase();
      return terms.some(w => txt.includes(w));
    });
    const hasSc = scenarios.some(sc => {
      const txt = `${sc.name||""} ${sc.description||""} ${sc.title||""}`.toLowerCase();
      return terms.some(w => txt.includes(w));
    });
    return !hasTask && !hasKb && !hasSc;
  });

  return `FAMICOV Full Actor Mission Coverage online, sir. ${actors.length} intel profiles cross-referenced against ${tasks.length} tasks, ${articles.length} knowledge articles, and ${scenarios.length} scenarios. ${untracked.length} actors remain completely untracked across all three intelligence dimensions. Recommend immediate coverage sweep for untracked threat actors.`;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function keywords(actor) {
  return [actor.name, ...(actor.aliases || []), actor.org, actor.role, ...(actor.tags || [])]
    .filter(Boolean)
    .map(s => s.toLowerCase())
    .filter(w => w.length > 3);
}

function relevance(terms, text) {
  const lo = text.toLowerCase();
  return terms.reduce((acc, w) => acc + (lo.includes(w) ? 1 : 0), 0);
}

function classify(actor, tasks, articles, scenarios) {
  const terms = keywords(actor);
  const matchedTasks = tasks.filter(t => {
    const txt = `${t.title||""} ${t.description||""} ${t.name||""} ${t.status||""}`.toLowerCase();
    return relevance(terms, txt) > 0;
  });
  const matchedKb = articles.filter(a => {
    const txt = `${a.title||""} ${a.content||""} ${a.summary||""} ${(a.tags||[]).join(" ")}`.toLowerCase();
    return relevance(terms, txt) > 0;
  });
  const matchedSc = scenarios.filter(s => {
    const txt = `${s.name||""} ${s.description||""} ${s.title||""}`.toLowerCase();
    return relevance(terms, txt) > 0;
  });
  const count = (matchedTasks.length > 0 ? 1 : 0) + (matchedKb.length > 0 ? 1 : 0) + (matchedSc.length > 0 ? 1 : 0);
  const cls = count === 3 ? "FULLY_TRACKED"
            : count === 2 ? "DUAL_COVERED"
            : count === 1 ? "SINGLE_TRACKED"
            :               "UNTRACKED";
  return { ...actor, cls, matchedTasks, matchedKb, matchedSc };
}

const CLS_COLOR = {
  FULLY_TRACKED:  GR,
  DUAL_COVERED:   CY,
  SINGLE_TRACKED: OR,
  UNTRACKED:      RE,
};

// ── component ─────────────────────────────────────────────────────────────────
export default function IntelActorFullMissionCoverage() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [counts,    setCounts]    = useState({ total: 0, tasks: 0, articles: 0, scenarios: 0 });
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [ipRes, tRes, kRes, sRes] = await Promise.allSettled([
        fetch(`${base}/entities/IntelProfile`,  { headers: hdr }).then(r => r.json()),
        fetch(`${base}/entities/Task`,          { headers: hdr }).then(r => r.json()),
        fetch(`${base}/knowledge/`,             { headers: hdr }).then(r => r.json()),
        fetch(`${base}/v1/scenario/list`,       { headers: hdr }).then(r => r.json()),
      ]);
      const actors    = Array.isArray(ipRes.value) ? ipRes.value
                      : Array.isArray(ipRes.value?.data) ? ipRes.value.data : [];
      const tasks     = Array.isArray(tRes.value)  ? tRes.value
                      : Array.isArray(tRes.value?.data)  ? tRes.value.data  : [];
      const articles  = Array.isArray(kRes.value)  ? kRes.value
                      : Array.isArray(kRes.value?.articles) ? kRes.value.articles
                      : Array.isArray(kRes.value?.data)  ? kRes.value.data  : [];
      const scenarios = Array.isArray(sRes.value)  ? sRes.value
                      : Array.isArray(sRes.value?.scenarios) ? sRes.value.scenarios
                      : Array.isArray(sRes.value?.data)  ? sRes.value.data  : [];
      setCounts({ total: actors.length, tasks: tasks.length, articles: articles.length, scenarios: scenarios.length });
      setRows(actors.map(a => classify(a, tasks, articles, scenarios)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:famicov-toggle", toggle);
    return () => window.removeEventListener("jarvis:famicov-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const hdr  = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const fully   = rows.filter(r => r.cls === "FULLY_TRACKED").length;
      const dual    = rows.filter(r => r.cls === "DUAL_COVERED").length;
      const single  = rows.filter(r => r.cls === "SINGLE_TRACKED").length;
      const untrk   = rows.filter(r => r.cls === "UNTRACKED").length;
      const prompt  = `JARVIS full actor mission coverage: ${counts.total} intel profiles cross-referenced against ${counts.tasks} tasks, ${counts.articles} KB articles, and ${counts.scenarios} scenarios. Fully tracked (all three): ${fully}. Dual covered: ${dual}. Single tracked: ${single}. Completely untracked: ${untrk}. In two sentences assess the coverage gaps and identify the most critical actor tracking failure.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      if (txt) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
      }
    } catch {
      setBrief("Coverage assessment unavailable — reasoning core unreachable.");
    } finally {
      setAssessing(false);
    }
  }, [rows, counts]);

  if (!open) {
    const untracked = rows.filter(r => r.cls === "UNTRACKED").length;
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.82)", border: `1px solid ${BORDER}`,
          color: CY, fontFamily: FONT, fontSize: 10, padding: "3px 8px",
          cursor: "pointer", borderRadius: 3,
        }}
      >
        ◈ FAMICOV
        {untracked > 0 && (
          <span style={{ color: RE, marginLeft: 4 }}>{untracked}</span>
        )}
      </button>
    );
  }

  const fully  = rows.filter(r => r.cls === "FULLY_TRACKED").length;
  const dual   = rows.filter(r => r.cls === "DUAL_COVERED").length;
  const single = rows.filter(r => r.cls === "SINGLE_TRACKED").length;
  const untrk  = rows.filter(r => r.cls === "UNTRACKED").length;
  const covered = fully + dual + single;
  const pct     = counts.total ? Math.round((covered / counts.total) * 100) : 0;

  const TABS = ["ALL", "FULLY_TRACKED", "DUAL_COVERED", "SINGLE_TRACKED", "UNTRACKED"];
  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const lo = search.toLowerCase();
      return `${r.name||""} ${r.role||""} ${r.org||""} ${(r.aliases||[]).join(" ")}`.toLowerCase().includes(lo);
    }
    return true;
  });

  return (
    <div style={{
      position: "fixed", bottom: 56, right: 24, zIndex: Z_INDEX,
      width: 720, maxHeight: "80vh", background: BG,
      border: `1px solid ${BORDER}`, borderRadius: 8,
      fontFamily: FONT, color: CY, display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        padding: "10px 14px", borderBottom: `1px solid ${BORDER}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>
          ◈ FAMICOV — Full Actor Mission Intelligence Coverage
          {loading && <span style={{ color: DIM, marginLeft: 8, fontWeight: 400 }}>loading…</span>}
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${BORDER}`, flexWrap: "wrap" }}>
        {[
          ["ACTORS",       counts.total,  CY],
          ["TASKS",        counts.tasks,  TE],
          ["KB ARTICLES",  counts.articles, GR],
          ["SCENARIOS",    counts.scenarios, PU],
          ["FULLY TRACKED", fully,        GR],
          ["DUAL COVERED", dual,          CY],
          ["SINGLE",       single,        OR],
          ["UNTRACKED",    untrk,         RE],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            flex: "1 0 60px", background: "rgba(0,207,255,0.04)",
            border: `1px solid ${BORDER}`, borderRadius: 4, padding: "4px 6px", textAlign: "center",
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 9, color: DIM }}>{label}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      <div style={{ padding: "4px 14px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 9, color: DIM, marginBottom: 2 }}>COVERAGE {pct}%</div>
        <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
          <div style={{
            height: "100%", borderRadius: 2,
            width: `${pct}%`,
            background: "linear-gradient(90deg,#22C55E,#00CFFF)",
          }} />
        </div>
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "6px 14px", borderBottom: `1px solid ${BORDER}`, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? CY : "rgba(0,207,255,0.08)",
            color: filter === t ? "#060B16" : CY,
            border: `1px solid ${BORDER}`, borderRadius: 3,
            fontFamily: FONT, fontSize: 9, padding: "2px 8px", cursor: "pointer",
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search actors…"
          style={{
            marginLeft: "auto", background: "rgba(0,207,255,0.06)",
            border: `1px solid ${BORDER}`, borderRadius: 3,
            color: CY, fontFamily: FONT, fontSize: 10, padding: "2px 8px",
            width: 140, outline: "none",
          }}
        />
      </div>

      {/* rows */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {visible.length === 0 && (
          <div style={{ padding: 20, color: DIM, fontSize: 11, textAlign: "center" }}>
            {loading ? "Loading intel profiles…" : "No actors match current filter."}
          </div>
        )}
        {visible.map((row, i) => {
          const isExp = expanded === i;
          return (
            <div key={i} style={{ borderBottom: `1px solid rgba(0,207,255,0.07)` }}>
              <div
                onClick={() => setExpanded(isExp ? null : i)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", cursor: "pointer" }}
              >
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[row.cls], minWidth: 110 }}>{row.cls}</span>
                <span style={{ flex: 1, fontSize: 11 }}>{row.name || "(unnamed)"}</span>
                {row.role && <span style={{ fontSize: 9, color: OR }}>{row.role}</span>}
                {row.org  && <span style={{ fontSize: 9, color: DIM }}>{row.org}</span>}
                <span style={{ fontSize: 9, color: TE }}>T:{row.matchedTasks.length}</span>
                <span style={{ fontSize: 9, color: GR }}>K:{row.matchedKb.length}</span>
                <span style={{ fontSize: 9, color: PU }}>S:{row.matchedSc.length}</span>
                <span style={{ fontSize: 10, color: DIM }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "4px 14px 10px 14px" }}>
                  {row.matchedTasks.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: TE, marginBottom: 3 }}>TASKS ({row.matchedTasks.length})</div>
                      {row.matchedTasks.slice(0, 4).map((t, j) => {
                        const terms = keywords(row);
                        const txt   = `${t.title||""} ${t.description||""} ${t.name||""}`.toLowerCase();
                        const rel   = terms.length ? Math.min(100, Math.round((relevance(terms, txt) / terms.length) * 100)) : 0;
                        return (
                          <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 9, color: TE, minWidth: 60 }}>{t.status || "TASK"}</span>
                            <span style={{ flex: 1, fontSize: 10 }}>{t.title || t.name || "(no title)"}</span>
                            <div style={{ width: 60, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                              <div style={{ height: "100%", width: `${rel}%`, background: TE, borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedKb.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: GR, marginBottom: 3 }}>KB ARTICLES ({row.matchedKb.length})</div>
                      {row.matchedKb.slice(0, 4).map((a, j) => {
                        const terms = keywords(row);
                        const txt   = `${a.title||""} ${a.content||""} ${a.summary||""}`.toLowerCase();
                        const rel   = terms.length ? Math.min(100, Math.round((relevance(terms, txt) / terms.length) * 100)) : 0;
                        return (
                          <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 9, color: GR, minWidth: 60 }}>ARTICLE</span>
                            <span style={{ flex: 1, fontSize: 10 }}>{a.title || "(no title)"}</span>
                            <div style={{ width: 60, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                              <div style={{ height: "100%", width: `${rel}%`, background: GR, borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedSc.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: PU, marginBottom: 3 }}>SCENARIOS ({row.matchedSc.length})</div>
                      {row.matchedSc.slice(0, 4).map((s, j) => {
                        const terms = keywords(row);
                        const txt   = `${s.name||""} ${s.description||""} ${s.title||""}`.toLowerCase();
                        const rel   = terms.length ? Math.min(100, Math.round((relevance(terms, txt) / terms.length) * 100)) : 0;
                        return (
                          <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 9, color: PU, minWidth: 60 }}>SCENARIO</span>
                            <span style={{ flex: 1, fontSize: 10 }}>{s.name || s.title || "(no title)"}</span>
                            <div style={{ width: 60, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                              <div style={{ height: "100%", width: `${rel}%`, background: PU, borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedTasks.length === 0 && row.matchedKb.length === 0 && row.matchedSc.length === 0 && (
                    <div style={{ fontSize: 10, color: RE }}>Actor has zero task, knowledge, or scenario linkage — complete intelligence gap.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess button + brief */}
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}` }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? "rgba(0,207,255,0.1)" : "rgba(0,207,255,0.18)",
          border: `1px solid ${CY}`, color: CY, fontFamily: FONT,
          fontSize: 10, padding: "4px 12px", cursor: assessing ? "default" : "pointer",
          borderRadius: 3,
        }}>
          {assessing ? "ASSESSING…" : "▶ ASSESS COVERAGE"}
        </button>
        {brief && (
          <div style={{ marginTop: 6, fontSize: 10, color: "#C0D8E8", lineHeight: 1.5 }}>{brief}</div>
        )}
      </div>
    </div>
  );
}
