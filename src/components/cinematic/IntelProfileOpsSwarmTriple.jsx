/**
 * F736 — Intel Profile × Ops Events × SwarmJob Triple Nexus (IOESWRTRI)
 *
 * Cross-references /entities/IntelProfile × /v1/ops/events × /entities/SwarmJob.
 * Keyword-matches each tracked threat actor/subject against live ops events and
 * active swarm automation jobs.
 *
 *   FULLY_COVERED — profile matches ≥1 ops event AND ≥1 swarm job
 *   OPS_ONLY      — matches an ops event, no swarm job coverage
 *   SWARM_ONLY    — backed by a swarm job, no matching ops event
 *   DARK          — no ops event or swarm job matches this profile
 *
 * Stat tiles: PROFILES | FULLY COVERED | OPS ONLY | SWARM ONLY | DARK | COVERAGE %
 * Filter tabs: ALL | FULLY_COVERED | OPS_ONLY | SWARM_ONLY | DARK + search
 * Expand profile → matched ops events (severity badge + hits) + matched swarm jobs (status + hits)
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence threat coverage brief + TTS
 *
 * Button: ◈ IOESWRTRI  left:905540 bottom:8 zIndex:595
 * Event:  jarvis:ioeswrtri-toggle
 * Refresh: 90 s auto-poll
 * Voice:  "ioeswrtri / intel profile ops swarm / threat actor swarm / profile ops events /
 *          dark profiles / covered profiles / profile triple nexus / intel triple /
 *          threat actor coverage / profile automation coverage"
 */
import { useCallback, useEffect, useRef, useState } from "react";

const CY  = "#29E7FF";
const AM  = "#FFB347";
const GN  = "#39FF14";
const RD  = "#FF4444";
const PR  = "#B47FFF";
const DIM = "#8899AA";
const DK  = "#556677";

const BTN_LEFT = 905540;
const POLL_MS  = 90_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const IOESWRTRI_RE =
  /\b(ioeswrtri|intel[\s._-]?profile[\s._-]?ops[\s._-]?swarm|threat[\s._-]?actor[\s._-]?swarm|profile[\s._-]?ops[\s._-]?events?|dark[\s._-]?profiles?|covered[\s._-]?profiles?|profile[\s._-]?triple[\s._-]?nexus|intel[\s._-]?triple|threat[\s._-]?actor[\s._-]?coverage|profile[\s._-]?automation[\s._-]?coverage)\b/i;

export function isIoeswrtriQuery(t) {
  return IOESWRTRI_RE.test(t || "");
}

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  return (env.VITE_API_BASE_URL || "").replace(/\/$/, "") || "http://localhost:8000";
}

function normaliseProfiles(data) {
  if (!data) return [];
  const raw = data.profiles || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((p, i) => ({
    id:           p.id       || `prof-${i}`,
    name:         p.name     || p.subject || p.entity || `Profile ${i + 1}`,
    threat_level: (p.threat_level || p.threat || p.severity || "UNKNOWN").toUpperCase(),
    category:     p.category || p.type || p.kind || "",
    nationality:  p.nationality || p.country || "",
    tags:         [p.name, p.subject, p.entity, p.category, p.nationality, ...(p.tags || [])].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function normaliseEvents(data) {
  if (!data) return [];
  const raw = data.events || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((e, i) => ({
    id:       e.id       || `evt-${i}`,
    title:    e.title    || e.name || e.event_type || `Event ${i + 1}`,
    severity: (e.severity || e.level || e.priority || "INFO").toUpperCase(),
    source:   e.source   || e.origin || "",
    tags:     [e.title, e.name, e.event_type, e.source, e.category, ...(e.tags || [])].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function normaliseJobs(data) {
  if (!data) return [];
  const raw = data.jobs || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((j, i) => ({
    id:     j.id     || `job-${i}`,
    name:   j.name   || j.title || j.job_name || `Job ${i + 1}`,
    status: (j.status || j.state || "UNKNOWN").toUpperCase(),
    kind:   j.kind   || j.type  || "",
    tags:   [j.name, j.title, j.kind, j.type, ...(j.tags || [])].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function kw(obj) {
  return [obj.name || obj.title, ...(obj.tags || [])].filter(Boolean).join(" ").toLowerCase();
}

function scoreMatch(aKw, bKw) {
  const words = aKw.split(/\s+/).filter(w => w.length > 3);
  let hits = 0;
  for (const w of words) if (bKw.includes(w)) hits++;
  return hits;
}

function classifyProfile(p, events, jobs) {
  const pk = kw(p);
  const matchedEvents = events.filter(e => scoreMatch(pk, kw(e)) > 0).map(e => ({ ...e, hits: scoreMatch(pk, kw(e)) }));
  const matchedJobs   = jobs.filter(j => scoreMatch(pk, kw(j)) > 0).map(j => ({ ...j, hits: scoreMatch(pk, kw(j)) }));
  const hasOps   = matchedEvents.length > 0;
  const hasSwarm = matchedJobs.length > 0;
  let classification;
  if (hasOps && hasSwarm) classification = "FULLY_COVERED";
  else if (hasOps)        classification = "OPS_ONLY";
  else if (hasSwarm)      classification = "SWARM_ONLY";
  else                    classification = "DARK";
  return { ...p, classification, matchedEvents, matchedJobs };
}

const SEV_COLOR = { CRITICAL: RD, HIGH: AM, MEDIUM: CY, LOW: GN, INFO: DIM };
const THREAT_COLOR = { CRITICAL: RD, HIGH: AM, MEDIUM: CY, LOW: GN, UNKNOWN: DIM };
const STATUS_COLOR = { RUNNING: GN, ACTIVE: GN, PENDING: AM, QUEUED: AM, COMPLETED: CY, FAILED: RD, UNKNOWN: DIM };
const CLS_COLOR = { FULLY_COVERED: GN, OPS_ONLY: CY, SWARM_ONLY: PR, DARK: DK };

export async function buildIoeswrtriScript() {
  const base = apiBase();
  const h = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  try {
    const [pRes, eRes, jRes] = await Promise.all([
      fetch(`${base}/entities/IntelProfile`, { headers: h }),
      fetch(`${base}/v1/ops/events`, { headers: h }),
      fetch(`${base}/entities/SwarmJob`, { headers: h }),
    ]);
    const [pData, eData, jData] = await Promise.all([
      pRes.ok ? pRes.json() : {},
      eRes.ok ? eRes.json() : {},
      jRes.ok ? jRes.json() : {},
    ]);
    const profiles = normaliseProfiles(pData);
    const events   = normaliseEvents(eData);
    const jobs     = normaliseJobs(jData);
    const classified = profiles.map(p => classifyProfile(p, events, jobs));
    const fully  = classified.filter(p => p.classification === "FULLY_COVERED").length;
    const ops    = classified.filter(p => p.classification === "OPS_ONLY").length;
    const swarm  = classified.filter(p => p.classification === "SWARM_ONLY").length;
    const dark   = classified.filter(p => p.classification === "DARK").length;
    const pct    = profiles.length ? Math.round((fully / profiles.length) * 100) : 0;
    const top3   = classified.filter(p => p.classification === "DARK").slice(0, 3).map(p => p.name).join(", ");
    const prompt = `Intel profile ops-swarm triple nexus: ${profiles.length} tracked profiles; ${fully} fully covered (ops event + swarm job), ${ops} ops-event only, ${swarm} swarm only, ${dark} dark (no coverage, ${pct}% fully covered). Dark profiles include: ${top3 || "none"}. In 2 sentences, summarise the threat-actor automation and operational coverage gaps.`;
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers: h,
      body: JSON.stringify({ message: prompt }),
    });
    if (r.ok) {
      const d = await r.json();
      return d.response || d.message || `${profiles.length} profiles: ${fully} fully covered, ${dark} dark (${pct}%).`;
    }
    return `${profiles.length} profiles: ${fully} fully covered, ${ops} ops-only, ${swarm} swarm-only, ${dark} dark. Coverage: ${pct}%.`;
  } catch (e) {
    return `Intel profile ops-swarm triple nexus unavailable: ${e.message}`;
  }
}

export default function IntelProfileOpsSwarmTriple() {
  const [open, setOpen]   = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [events, setEvents] = useState([]);
  const [jobs, setJobs]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]     = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    const h = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
    try {
      const [pRes, eRes, jRes] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers: h }),
        fetch(`${base}/v1/ops/events`, { headers: h }),
        fetch(`${base}/entities/SwarmJob`, { headers: h }),
      ]);
      const [pData, eData, jData] = await Promise.all([
        pRes.ok ? pRes.json() : {},
        eRes.ok ? eRes.json() : {},
        jRes.ok ? jRes.json() : {},
      ]);
      setProfiles(normaliseProfiles(pData));
      setEvents(normaliseEvents(eData));
      setJobs(normaliseJobs(jData));
    } catch {
      // silently retain prior data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => !o); if (!profiles.length) load(); };
    window.addEventListener("jarvis:ioeswrtri-toggle", toggle);
    return () => window.removeEventListener("jarvis:ioeswrtri-toggle", toggle);
  }, [load, profiles.length]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const classified = profiles.map(p => classifyProfile(p, events, jobs));
  const fully  = classified.filter(p => p.classification === "FULLY_COVERED").length;
  const ops    = classified.filter(p => p.classification === "OPS_ONLY").length;
  const swarm  = classified.filter(p => p.classification === "SWARM_ONLY").length;
  const dark   = classified.filter(p => p.classification === "DARK").length;
  const pct    = classified.length ? Math.round((fully / classified.length) * 100) : 0;

  const visible = classified.filter(p => {
    if (tab !== "ALL" && p.classification !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.nationality.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    try {
      const txt = await buildIoeswrtriScript();
      setBrief(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } finally {
      setAssessing(false);
    }
  };

  const S = {
    btn: {
      position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 595,
      background: dark > 0 ? `${RD}22` : "#0A1628CC",
      border: `1px solid ${dark > 0 ? RD : CY}44`, borderRadius: 6, padding: "4px 10px",
      color: CY, fontSize: 10, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
    },
    badge: {
      display: "inline-block", marginLeft: 4, padding: "1px 5px",
      background: RD, borderRadius: 8, color: "#fff", fontSize: 9, fontWeight: 700,
    },
    panel: {
      position: "fixed", bottom: 48, left: BTN_LEFT - 20, zIndex: 596,
      width: 600, maxHeight: "80vh", display: "flex", flexDirection: "column",
      background: "#050F1E", border: `1px solid ${CY}33`, borderRadius: 8,
      fontFamily: "monospace", fontSize: 11, color: CY,
    },
    header: { padding: "10px 14px 6px", borderBottom: `1px solid ${CY}22`, display: "flex", justifyContent: "space-between", alignItems: "center" },
    tiles: { display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${CY}22`, flexWrap: "wrap" },
    tile: (col) => ({ background: `${col}18`, border: `1px solid ${col}44`, borderRadius: 6, padding: "4px 10px", textAlign: "center" }),
    tabs: { display: "flex", gap: 6, padding: "6px 14px", borderBottom: `1px solid ${CY}22` },
    tab: (active) => ({ padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontSize: 10, background: active ? `${CY}22` : "transparent", border: `1px solid ${active ? CY : DK}`, color: active ? CY : DIM }),
    search: { margin: "6px 14px", background: "#0A1A2A", border: `1px solid ${CY}33`, borderRadius: 4, padding: "4px 8px", color: CY, fontSize: 11, width: "calc(100% - 28px)" },
    list: { overflowY: "auto", flex: 1 },
    row: (cls) => ({ padding: "8px 14px", borderBottom: `1px solid ${CY}11`, cursor: "pointer", background: expanded === cls ? `${CY}08` : "transparent" }),
    badge2: (col) => ({ display: "inline-block", padding: "1px 6px", borderRadius: 3, background: `${col}22`, border: `1px solid ${col}55`, color: col, fontSize: 9, marginRight: 4 }),
    bar: (col, pct) => ({ display: "inline-block", width: `${Math.min(pct * 4, 80)}px`, height: 6, background: col, borderRadius: 2, marginLeft: 4, verticalAlign: "middle" }),
    assess: { margin: "8px 14px", padding: "5px 12px", background: `${GN}22`, border: `1px solid ${GN}55`, borderRadius: 5, color: GN, cursor: "pointer", fontSize: 10 },
    brief: { margin: "4px 14px 10px", padding: "8px", background: "#0A1628", border: `1px solid ${CY}22`, borderRadius: 4, fontSize: 10, color: DIM, lineHeight: 1.5 },
    footer: { padding: "6px 14px", borderTop: `1px solid ${CY}22`, color: DIM, fontSize: 9 },
  };

  if (!open) return (
    <button style={S.btn} onClick={() => { setOpen(true); load(); }}>
      ◈ IOESWRTRI {dark > 0 && <span style={S.badge}>{dark}</span>}
    </button>
  );

  return (
    <>
      <button style={S.btn} onClick={() => setOpen(false)}>◈ IOESWRTRI ✕</button>
      <div style={S.panel}>
        <div style={S.header}>
          <span>◈ INTEL PROFILE × OPS × SWARM TRIPLE NEXUS</span>
          <span style={{ color: DIM, fontSize: 9 }}>{loading ? "refreshing…" : `${classified.length} profiles`}</span>
        </div>

        <div style={S.tiles}>
          {[
            ["PROFILES",      classified.length, CY],
            ["FULLY COV.",    fully,              GN],
            ["OPS ONLY",      ops,                CY],
            ["SWARM ONLY",    swarm,              PR],
            ["DARK",          dark,               DK],
            ["COVERAGE %",    `${pct}%`,          pct >= 70 ? GN : pct >= 40 ? AM : RD],
          ].map(([label, val, col]) => (
            <div key={label} style={S.tile(col)}>
              <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
              <div style={{ color: DIM, fontSize: 9 }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={S.tabs}>
          {["ALL", "FULLY_COVERED", "OPS_ONLY", "SWARM_ONLY", "DARK"].map(t => (
            <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>{t.replace(/_/g, " ")}</button>
          ))}
        </div>

        <input
          style={S.search}
          placeholder="Search profiles…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div style={S.list}>
          {visible.length === 0 && (
            <div style={{ padding: "16px 14px", color: DIM, textAlign: "center" }}>
              {loading ? "Loading…" : "No profiles match."}
            </div>
          )}
          {visible.map(p => (
            <div key={p.id}>
              <div style={S.row(p.id)} onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                <span style={S.badge2(THREAT_COLOR[p.threat_level] || DIM)}>{p.threat_level}</span>
                <span style={S.badge2(CLS_COLOR[p.classification] || DIM)}>{p.classification.replace(/_/g, " ")}</span>
                <strong style={{ color: CY }}>{p.name}</strong>
                {p.category && <span style={{ color: DIM, marginLeft: 6 }}>[{p.category}]</span>}
                {p.nationality && <span style={{ color: DIM, marginLeft: 4 }}>{p.nationality}</span>}
                <span style={{ color: DIM, float: "right" }}>
                  {p.matchedEvents.length} evt · {p.matchedJobs.length} swarm
                </span>
              </div>
              {expanded === p.id && (
                <div style={{ padding: "8px 14px 10px 28px", background: "#060E1C", borderBottom: `1px solid ${CY}11` }}>
                  <div style={{ display: "flex", gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: CY, fontSize: 9, marginBottom: 4 }}>OPS EVENTS ({p.matchedEvents.length})</div>
                      {p.matchedEvents.length === 0 && <div style={{ color: DK }}>None matched</div>}
                      {p.matchedEvents.slice(0, 5).map(e => (
                        <div key={e.id} style={{ marginBottom: 3 }}>
                          <span style={S.badge2(SEV_COLOR[e.severity] || DIM)}>{e.severity}</span>
                          <span style={{ color: AM }}>{e.title}</span>
                          <span style={S.bar(AM, e.hits)} />
                          <span style={{ color: DIM, marginLeft: 4 }}>×{e.hits}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: PR, fontSize: 9, marginBottom: 4 }}>SWARM JOBS ({p.matchedJobs.length})</div>
                      {p.matchedJobs.length === 0 && <div style={{ color: DK }}>None matched</div>}
                      {p.matchedJobs.slice(0, 5).map(j => (
                        <div key={j.id} style={{ marginBottom: 3 }}>
                          <span style={S.badge2(STATUS_COLOR[j.status] || DIM)}>{j.status}</span>
                          <span style={{ color: PR }}>{j.name}</span>
                          <span style={S.bar(PR, j.hits)} />
                          <span style={{ color: DIM, marginLeft: 4 }}>×{j.hits}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <button style={S.assess} onClick={assess} disabled={assessing}>
          {assessing ? "Assessing…" : "▶ ASSESS — threat coverage brief"}
        </button>
        {brief && <div style={S.brief}>{brief}</div>}

        <div style={S.footer}>
          /entities/IntelProfile × /v1/ops/events × /entities/SwarmJob · 90 s refresh
        </div>
      </div>
    </>
  );
}
