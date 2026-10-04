/**
 * F731 — Scene × Report × Skill Triple Nexus (SCERPTSKL)
 *
 * Parallel-fetches all 10 /v1/cinematic/scene/{id} endpoints + /v1/reports +
 * /v1/aip/skill, then keyword-correlates each scene against reports AND skills:
 *
 *   FULLY_COVERED — matched ≥1 report AND ≥1 skill (evidenced + skilled)
 *   REPORT_ONLY   — has formal report coverage, no skill match
 *   SKILL_ONLY    — has skill domain coverage, no formal report
 *   DARK          — no report, no skill (uncovered scene)
 *
 * Stat tiles: SCENES | FULLY COVERED | REPORT ONLY | SKILL ONLY | DARK
 * Filter tabs: ALL | FULLY_COVERED | REPORT_ONLY | SKILL_ONLY | DARK + search
 * Expand scene → matched reports (source badge + hits) + matched skills (domain + score + hits)
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence scene coverage brief + TTS
 *
 * Button: ◈ SCERPTSKL  left:901240 bottom:8 zIndex:590
 * Event:  jarvis:scerptskl-toggle
 * Refresh: 90 s auto-poll
 * Voice:  "scerptskl / scene report skill / scene skill report / covered scenes /
 *          dark scenes / uncovered cinematic / scene coverage triple /
 *          scene report coverage / skill covered scenes"
 */
import { useCallback, useEffect, useRef, useState } from "react";

const CY = "#29E7FF";
const AM = "#FFB347";
const GN = "#39FF14";
const RD = "#FF4444";
const PR = "#B47FFF";
const BTN_LEFT = 901240;
const POLL_MS  = 90_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SCENE_IDS = [
  "01_command_atrium",
  "02_neural_bridge",
  "03_threat_matrix",
  "04_quantum_core",
  "05_data_vault",
  "06_field_ops",
  "07_comms_hub",
  "08_analytics_grid",
  "09_strategic_ops",
  "10_deep_intel",
];

const SCERPTSKL_RE =
  /\b(scerptskl|scene[\s._-]?report[\s._-]?skill|scene[\s._-]?skill[\s._-]?report|covered[\s._-]?scene|dark[\s._-]?scene|uncovered[\s._-]?scene|uncovered[\s._-]?cinematic|scene[\s._-]?coverage[\s._-]?triple|scene[\s._-]?report[\s._-]?coverage|skill[\s._-]?covered[\s._-]?scene|scene[\s._-]?triple[\s._-]?nexus)\b/i;

export function isScerptsklQuery(t) {
  return SCERPTSKL_RE.test(t || "");
}

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  return (env.VITE_API_BASE_URL || "").replace(/\/$/, "") || "http://localhost:8000";
}

function keywords(obj) {
  return [
    obj.title, obj.name, obj.description, obj.kind, obj.type,
    obj.source, obj.domain, obj.topic, obj.status, obj.category,
    obj.anchors?.map?.((a) => `${a.label ?? ""} ${a.value ?? ""}`).join(" "),
    obj.tags?.join?.(" "),
  ].filter(Boolean).join(" ").toLowerCase();
}

function scoreMatch(aKw, bKw) {
  const words = aKw.split(/\s+/).filter((w) => w.length > 3);
  let hits = 0;
  for (const w of words) if (bKw.includes(w)) hits++;
  return hits;
}

function classify(scene, reports, skills) {
  const skw = keywords(scene);
  const matchedReports = reports
    .map((r) => ({ ...r, hits: scoreMatch(skw, keywords(r)) }))
    .filter((r) => r.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 5);
  const matchedSkills = skills
    .map((s) => ({ ...s, hits: scoreMatch(skw, keywords(s)) }))
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 5);
  const hasReports = matchedReports.length > 0;
  const hasSkills  = matchedSkills.length > 0;
  const status =
    hasReports && hasSkills ? "FULLY_COVERED" :
    hasReports              ? "REPORT_ONLY"   :
    hasSkills               ? "SKILL_ONLY"    :
                              "DARK";
  return { ...scene, status, matchedReports, matchedSkills };
}

async function fetchAll() {
  const base    = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [sceneResults, rptR, sklR] = await Promise.all([
    Promise.allSettled(
      SCENE_IDS.map((id) =>
        fetch(`${base}/v1/cinematic/scene/${id}`, { headers }).then((r) => r.json())
      )
    ),
    fetch(`${base}/v1/reports`,  { headers }),
    fetch(`${base}/v1/aip/skill`, { headers }),
  ]);
  const scenes  = sceneResults.map((r, i) => ({
    id:    SCENE_IDS[i],
    title: SCENE_IDS[i].replace(/^\d+_/, "").replace(/_/g, " ").toUpperCase(),
    ...(r.status === "fulfilled" ? r.value : {}),
  }));
  const rptJ = rptR.ok  ? await rptR.json()  : [];
  const sklJ = sklR.ok  ? await sklR.json()  : [];
  const reports = Array.isArray(rptJ) ? rptJ : (rptJ.reports || rptJ.items || []);
  const skills  = Array.isArray(sklJ) ? sklJ : (sklJ.skills  || sklJ.items || []);
  return { scenes, reports, skills };
}

const STATUS_COLOR = {
  FULLY_COVERED: GN,
  REPORT_ONLY:   CY,
  SKILL_ONLY:    PR,
  DARK:          RD,
};

const TABS = ["ALL", "FULLY_COVERED", "REPORT_ONLY", "SKILL_ONLY", "DARK"];

export async function buildScerptsklScript() {
  try {
    const { scenes, reports, skills } = await fetchAll();
    const rows = scenes.map((s) => classify(s, reports, skills));
    const counts = { FULLY_COVERED: 0, REPORT_ONLY: 0, SKILL_ONLY: 0, DARK: 0 };
    rows.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status]++; });
    const darkList = rows.filter((r) => r.status === "DARK").map((r) => r.title).join(", ");
    const pct = rows.length ? Math.round((counts.FULLY_COVERED / rows.length) * 100) : 0;
    return (
      `Scene coverage triple — ${rows.length} cinematic scenes assessed against ${reports.length} reports and ${skills.length} skills. ` +
      `${counts.FULLY_COVERED} fully covered, ${counts.REPORT_ONLY} report-only, ${counts.SKILL_ONLY} skill-only, ${counts.DARK} dark.` +
      (counts.DARK > 0
        ? ` Dark scenes: ${darkList}. Coverage: ${pct}%.`
        : ` All scenes have at least partial coverage.`)
    );
  } catch (e) {
    return `Scene report skill triple error: ${e.message}`;
  }
}

export default function SceneReportSkillTriple() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { scenes, reports, skills } = await fetchAll();
      setRows(scenes.map((s) => classify(s, reports, skills)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onVoice  = (e) => {
      if (isScerptsklQuery(e?.detail?.query ?? "")) setOpen(true);
    };
    window.addEventListener("jarvis:scerptskl-toggle", onToggle);
    window.addEventListener("jarvis:command", onVoice);
    return () => {
      window.removeEventListener("jarvis:scerptskl-toggle", onToggle);
      window.removeEventListener("jarvis:command", onVoice);
    };
  }, []);

  const counts = { FULLY_COVERED: 0, REPORT_ONLY: 0, SKILL_ONLY: 0, DARK: 0 };
  rows.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status]++; });

  const visible = rows.filter((r) => {
    if (tab !== "ALL" && r.status !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.title ?? r.id ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    try {
      const script = await buildScerptsklScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const j = r.ok ? await r.json() : {};
      const reply = j.response ?? j.message ?? script;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: reply } }));
    } catch (_) {
    } finally {
      setAssessing(false);
    }
  };

  const S = {
    panel: {
      position: "fixed", bottom: 48, left: BTN_LEFT - 700, width: 720, maxHeight: 560,
      background: "rgba(10,14,26,0.97)", border: `1px solid ${GN}44`,
      borderRadius: 10, color: "#C8D8E4", fontFamily: "'JetBrains Mono', monospace",
      fontSize: 12, zIndex: 590, display: "flex", flexDirection: "column",
      overflow: "hidden", boxShadow: `0 4px 32px ${GN}18`,
    },
    hdr: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 14px", borderBottom: `1px solid ${GN}22`,
    },
    title: { color: GN, letterSpacing: 2, fontSize: 11, fontWeight: 700 },
    close: { cursor: "pointer", color: "#4A6070", fontSize: 16, background: "none", border: "none", padding: 0 },
    tiles: { display: "flex", gap: 12, padding: "8px 14px", borderBottom: `1px solid ${GN}18`, flexWrap: "wrap" },
    tile: (color) => ({
      display: "flex", flexDirection: "column", alignItems: "center", minWidth: 64,
      background: `${color}18`, border: `1px solid ${color}44`, borderRadius: 6, padding: "4px 10px",
    }),
    tileN: (color) => ({ color, fontWeight: 700, fontSize: 16 }),
    tileL: { fontSize: 9, letterSpacing: 1, color: "#4A6070", marginTop: 1 },
    tabs: { display: "flex", gap: 6, padding: "6px 14px", borderBottom: `1px solid ${GN}18`, flexWrap: "wrap" },
    tab: (active) => ({
      background: active ? `${GN}22` : "transparent", border: `1px solid ${active ? GN : "#4A6070"}`,
      borderRadius: 4, color: active ? GN : "#4A6070", fontSize: 9, letterSpacing: 1,
      padding: "3px 8px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
    }),
    search: {
      background: "rgba(255,255,255,0.05)", border: `1px solid ${GN}44`, borderRadius: 4,
      color: "#C8D8E4", fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
      padding: "3px 8px", outline: "none", width: 160,
    },
    list: { overflowY: "auto", flex: 1 },
    row: {
      padding: "6px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)",
      cursor: "pointer",
    },
    rowHdr: { display: "flex", alignItems: "center", gap: 8 },
    dot: (color) => ({ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }),
    name: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    badge: (color) => ({
      fontSize: 9, letterSpacing: 1, fontWeight: 700, color,
      border: `1px solid ${color}55`, borderRadius: 3, padding: "1px 5px",
    }),
    expand: { marginTop: 6, paddingLeft: 16 },
    expSect: { marginTop: 4 },
    expLabel: { fontSize: 9, letterSpacing: 1, color: "#4A6070", marginBottom: 2 },
    expRow: { display: "flex", alignItems: "center", gap: 6, padding: "2px 0" },
    expName: { fontSize: 11, color: "#C8D8E4", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    hits: { fontSize: 9, color: "#4A6070" },
    footer: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "6px 14px", borderTop: `1px solid ${GN}18`,
    },
    assess: {
      background: `${GN}22`, border: `1px solid ${GN}66`, borderRadius: 4, color: GN,
      cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
      letterSpacing: 1.5, padding: "4px 10px",
    },
    info: { color: "#4A6070", fontSize: 10 },
    btn: {
      position: "fixed", bottom: 8, left: BTN_LEFT,
      background: "rgba(10,14,26,0.88)", border: `1px solid ${GN}55`,
      borderRadius: 5, color: GN, fontFamily: "'JetBrains Mono', monospace",
      fontSize: 9, fontWeight: 700, letterSpacing: 1.5, padding: "4px 10px",
      cursor: "pointer", zIndex: 590, whiteSpace: "nowrap",
    },
  };

  return (
    <>
      <button style={S.btn} onClick={() => setOpen((v) => !v)} title="Scene × Report × Skill Triple Nexus">
        ◈ SCERPTSKL
      </button>

      {open && (
        <div style={S.panel}>
          <div style={S.hdr}>
            <span style={S.title}>◈ SCENE × REPORT × SKILL — {rows.length} SCENES</span>
            <button style={S.close} onClick={() => setOpen(false)}>✕</button>
          </div>

          <div style={S.tiles}>
            {[
              { k: "SCENES",        n: rows.length,              c: GN },
              { k: "FULLY COVERED", n: counts.FULLY_COVERED,     c: GN },
              { k: "REPORT ONLY",   n: counts.REPORT_ONLY,       c: CY },
              { k: "SKILL ONLY",    n: counts.SKILL_ONLY,        c: PR },
              { k: "DARK",          n: counts.DARK,              c: RD },
            ].map(({ k, n, c }) => (
              <div key={k} style={S.tile(c)}>
                <span style={S.tileN(c)}>{n}</span>
                <span style={S.tileL}>{k}</span>
              </div>
            ))}
          </div>

          <div style={S.tabs}>
            {TABS.map((t) => (
              <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
            <input
              style={S.search}
              placeholder="search scenes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={S.list}>
            {loading && (
              <div style={{ padding: "10px 14px", color: "#4A6070", fontSize: 11 }}>
                LOADING…
              </div>
            )}
            {err && (
              <div style={{ padding: "10px 14px", color: RD, fontSize: 11 }}>
                ERR: {err}
              </div>
            )}
            {!loading && !err && visible.length === 0 && (
              <div style={{ padding: "10px 14px", color: "#4A6070", fontSize: 11 }}>
                No scenes match.
              </div>
            )}
            {visible.map((row) => {
              const col  = STATUS_COLOR[row.status] ?? "#4A6070";
              const isEx = expanded === (row.id ?? row.title);
              return (
                <div
                  key={row.id ?? row.title}
                  style={S.row}
                  onClick={() => setExpanded(isEx ? null : (row.id ?? row.title))}
                >
                  <div style={S.rowHdr}>
                    <div style={S.dot(col)} />
                    <span style={S.name}>{row.title ?? row.id}</span>
                    <span style={S.badge(col)}>{row.status}</span>
                    {row.matchedReports?.length > 0 && (
                      <span style={S.badge(CY)}>{row.matchedReports.length} RPT</span>
                    )}
                    {row.matchedSkills?.length > 0 && (
                      <span style={S.badge(PR)}>{row.matchedSkills.length} SKL</span>
                    )}
                  </div>

                  {isEx && (
                    <div style={S.expand}>
                      {row.matchedReports?.length > 0 && (
                        <div style={S.expSect}>
                          <div style={S.expLabel}>MATCHED REPORTS</div>
                          {row.matchedReports.map((r, i) => (
                            <div key={i} style={S.expRow}>
                              <span style={S.badge(CY)}>{r.source ?? r.type ?? "RPT"}</span>
                              <span style={S.expName}>{r.title ?? r.name ?? r.id}</span>
                              <span style={S.hits}>{r.hits} hit{r.hits !== 1 ? "s" : ""}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {row.matchedSkills?.length > 0 && (
                        <div style={S.expSect}>
                          <div style={S.expLabel}>MATCHED SKILLS</div>
                          {row.matchedSkills.map((s, i) => (
                            <div key={i} style={S.expRow}>
                              <span style={S.badge(PR)}>{s.domain ?? s.category ?? "SKL"}</span>
                              <span style={S.expName}>{s.name ?? s.title ?? s.id}</span>
                              <span style={S.hits}>
                                {s.score != null ? `${Math.round(s.score * 100)}% · ` : ""}
                                {s.hits} hit{s.hits !== 1 ? "s" : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {row.matchedReports?.length === 0 && row.matchedSkills?.length === 0 && (
                        <div style={{ color: "#4A6070", fontSize: 11, padding: "4px 0" }}>
                          No report or skill match found for this scene.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={S.footer}>
            <button style={S.assess} onClick={assess} disabled={assessing}>
              {assessing ? "ASSESSING…" : "▶ ASSESS"}
            </button>
            <span style={S.info}>
              {counts.DARK > 0
                ? `⚠ ${counts.DARK} DARK scene${counts.DARK !== 1 ? "s" : ""}`
                : "All scenes have coverage"}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
