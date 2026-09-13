/**
 * F94 — SwarmJob × AIP Skill Coverage (SJASC)
 *
 * Parallel-fetches /entities/SwarmJob + /v1/aip/skill every 90 s.
 * Keyword-correlates each swarm job (name/description/target/objective/tags)
 * against AIP skills (name/description/category/tags) to classify:
 *   SKILLED     — at least one AIP skill maps to this swarm job
 *   UNSUPPORTED — no AIP skill covers this swarm job
 *
 * Amber badge on UNSUPPORTED count.
 *
 * Voice intents: "swarm aip / swarm skill / sjasc /
 *                swarm job skill / skilled swarm / unsupported swarm /
 *                aip swarm coverage / swarm capability coverage /
 *                swarm skill coverage / which swarm jobs have skills"
 * Strip button: ◈ SJASC  left:3120 bottom:18 zIndex:68
 * Custom event: jarvis:sjasc-toggle
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const DIM = "#5A7A9A";
const POLL = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const hdrs = { Authorization: `Bearer ${API_KEY}` };

const SJASC_RE =
  /\b(swarm[._\s]?aip|swarm[._\s]?skill|sjasc|swarm[._\s]?job[._\s]?skill|skilled[._\s]?swarm|unsupported[._\s]?swarm|aip[._\s]?swarm[._\s]?coverage|swarm[._\s]?capability[._\s]?coverage|swarm[._\s]?skill[._\s]?coverage|which[._\s]?swarm[._\s]?jobs[._\s]?have[._\s]?skills)\b/i;

export function isJascQuery(t) { return SJASC_RE.test(t || ""); }

function tokenize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevance(job, skill) {
  const a = tokenize([
    job.name, job.description,
    job.target || "", job.objective || "",
    (job.tags || []).join(" "),
  ].join(" "));
  const b = tokenize([
    skill.name, skill.description,
    skill.category || "",
    (skill.tags || []).join(" "),
  ].join(" "));
  const setB = new Set(b);
  const hits = a.filter(w => setB.has(w)).length;
  if (!hits) return 0;
  return Math.round((hits / Math.max(a.length, 1)) * 100);
}

export async function buildJascScript() {
  try {
    const base = apiBase();
    const [jr, sr] = await Promise.all([
      fetch(`${base}/entities/SwarmJob`, { headers: hdrs }),
      fetch(`${base}/v1/aip/skill`, { headers: hdrs }),
    ]);
    const [jd, sd] = await Promise.all([jr.json(), sr.json()]);
    const jobs = Array.isArray(jd) ? jd : jd.results || jd.items || jd.jobs || [];
    const skills = Array.isArray(sd) ? sd : sd.results || sd.items || sd.skills || [];
    const skilled = jobs.filter(j => skills.some(s => relevance(j, s) > 0)).length;
    const unsupported = jobs.length - skilled;
    return `SwarmJob × AIP Skill Coverage: ${jobs.length} swarm jobs correlated against ${skills.length} AIP skills. ${skilled} jobs are SKILLED (mapped to at least one capability), ${unsupported} are UNSUPPORTED (no AIP skill match). ${unsupported > 0 ? `Recommend creating AIP skills to cover the ${unsupported} unsupported swarm jobs and close capability gaps.` : "Full AIP skill coverage across all active swarm jobs — well configured."}`;
  } catch {
    return "SwarmJob and AIP skill data temporarily unavailable.";
  }
}

const BTN = {
  position: "fixed", left: 3120, bottom: 18, zIndex: 68,
  background: "rgba(0,20,40,0.82)", border: `1px solid ${CY}44`,
  color: CY, fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
  letterSpacing: 1.4, padding: "4px 8px", cursor: "pointer",
  borderRadius: 3, userSelect: "none",
};
const PANEL = {
  position: "fixed", bottom: 52, left: 3010, width: 420,
  background: "rgba(0,10,24,0.97)", border: `1px solid ${CY}55`,
  borderRadius: 6, zIndex: 200, fontFamily: "'JetBrains Mono',monospace",
  color: CY, fontSize: 10, padding: 14, maxHeight: 520, overflowY: "auto",
};
const ROW_ST = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "4px 0", borderBottom: `1px solid ${CY}18`, cursor: "pointer",
};
const BADGE = (c) => ({
  fontSize: 8, letterSpacing: 1, padding: "1px 5px",
  borderRadius: 2, background: c + "22", border: `1px solid ${c}55`, color: c,
});

const STATUS_COLOR = { RUNNING: GRN, PENDING: AMB, FAILED: "#FF3B3B", DONE: CY };

export default function SwarmJobAipSkillCoverage() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [skillCount, setSkillCount] = useState(0);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const [jr, sr] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`, { headers: hdrs }),
        fetch(`${base}/v1/aip/skill`, { headers: hdrs }),
      ]);
      const [jd, sd] = await Promise.all([jr.json(), sr.json()]);
      const rawJobs = Array.isArray(jd) ? jd : jd.results || jd.items || jd.jobs || [];
      const rawSkills = Array.isArray(sd) ? sd : sd.results || sd.items || sd.skills || [];
      setSkillCount(rawSkills.length);
      setJobs(rawJobs.map(j => ({
        ...j,
        matches: rawSkills
          .map(s => ({ ...s, score: relevance(j, s) }))
          .filter(s => s.score > 0)
          .sort((x, y) => y.score - x.score),
      })));
    } catch {}
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.query && !isJascQuery(e.detail.query)) return;
      setOpen(v => !v);
    };
    window.addEventListener("jarvis:sjasc-toggle", handler);
    return () => window.removeEventListener("jarvis:sjasc-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const classified = jobs.map(j => ({ ...j, status: j.matches?.length > 0 ? "SKILLED" : "UNSUPPORTED" }));
  const filtered = classified
    .filter(j => tab === "ALL" || j.status === tab)
    .filter(j => !search || [j.name, j.description, j.target, j.objective, (j.tags || []).join(" ")].join(" ").toLowerCase().includes(search.toLowerCase()));

  const skilled = classified.filter(j => j.status === "SKILLED").length;
  const unsupported = classified.filter(j => j.status === "UNSUPPORTED").length;

  const assess = async () => {
    setAssessing(true); setAssessment("");
    const script = await buildJascScript();
    setAssessment(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  };

  if (!open) {
    return (
      <button style={BTN} onClick={() => setOpen(true)} title="SwarmJob × AIP Skill Coverage">
        ◈ SJASC{unsupported > 0 && <span style={{ marginLeft: 4, color: AMB }}>▲{unsupported}</span>}
      </button>
    );
  }

  return (
    <>
      <button style={{ ...BTN, borderColor: CY }} onClick={() => setOpen(false)}>◈ SJASC ✕</button>
      <div style={PANEL}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ color: CY, letterSpacing: 2, fontSize: 9 }}>SWARM JOB × AIP SKILL</span>
          <button onClick={assess} disabled={assessing}
            style={{ fontSize: 8, color: GRN, background: "none", border: `1px solid ${GRN}44`, borderRadius: 2, padding: "1px 6px", cursor: "pointer" }}>
            {assessing ? "…" : "▶ ASSESS"}
          </button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, marginBottom: 8 }}>
          {[
            ["JOBS", jobs.length, CY],
            ["SKILLS", skillCount, CY],
            ["SKILLED", skilled, GRN],
            ["UNSUPPORTED", unsupported, AMB],
          ].map(([label, val, c]) => (
            <div key={label} style={{ background: "#0a1628", borderRadius: 3, padding: "4px 6px", textAlign: "center" }}>
              <div style={{ color: c, fontSize: 13, fontWeight: 700 }}>{val}</div>
              <div style={{ color: DIM, fontSize: 7, letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
          {["ALL", "SKILLED", "UNSUPPORTED"].map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ fontSize: 8, padding: "2px 7px", borderRadius: 2, cursor: "pointer",
                background: tab === t ? CY + "22" : "none",
                color: tab === t ? CY : DIM,
                border: `1px solid ${tab === t ? CY + "55" : DIM + "33"}` }}>
              {t}
            </button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search jobs…"
            style={{ marginLeft: "auto", fontSize: 8, background: "#0a1628", border: `1px solid ${CY}33`,
              borderRadius: 2, color: CY, padding: "2px 6px", width: 110, outline: "none" }} />
        </div>

        {/* Job rows */}
        {filtered.length === 0 && (
          <div style={{ color: DIM, fontSize: 9, textAlign: "center", padding: 12 }}>No data yet — fetching…</div>
        )}
        {filtered.map((j, i) => {
          const isExp = expanded === i;
          const sc = j.status === "SKILLED" ? GRN : AMB;
          const stC = STATUS_COLOR[(j.status_label || j.status || "").toUpperCase()] || DIM;
          return (
            <div key={j.id || j.name || i}>
              <div style={ROW_ST} onClick={() => setExpanded(isExp ? null : i)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color: CY, fontSize: 9 }}>{j.name || j.id}</span>
                  {(j.status_label || j.status) && (
                    <span style={{ color: stC, fontSize: 8, marginLeft: 4 }}>[{j.status_label || j.status}]</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={BADGE(sc)}>{j.status}</span>
                  <span style={{ color: DIM, fontSize: 8 }}>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>
              {isExp && (
                <div style={{ background: "#060f1e", borderRadius: 3, padding: "6px 8px", marginBottom: 4 }}>
                  {j.matches?.length > 0 ? (
                    j.matches.slice(0, 6).map((sk, k) => (
                      <div key={k} style={{ marginBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ color: CY, fontSize: 8 }}>{sk.name || sk.id}</span>
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            {sk.category && <span style={BADGE(DIM)}>{sk.category}</span>}
                            <span style={{ color: GRN, fontSize: 8 }}>{sk.score}%</span>
                          </div>
                        </div>
                        <div style={{ height: 3, background: CY + "18", borderRadius: 2 }}>
                          <div style={{ height: "100%", width: `${sk.score}%`, background: GRN, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: AMB, fontSize: 8 }}>No AIP skill match — job is UNSUPPORTED</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {assessment && (
          <div style={{ marginTop: 8, background: "#060f1e", borderRadius: 3, padding: "6px 8px",
            color: GRN, fontSize: 8, lineHeight: 1.5 }}>
            {assessment}
          </div>
        )}
      </div>
    </>
  );
}
