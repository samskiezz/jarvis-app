import { useState, useEffect, useCallback, useRef } from "react";

const API = "";
const SWJOPS_RE =
  /\b(swarm[._\-\s]?ops|ops[._\-\s]?swarm|swjops|automated[._\-\s]?ops|manual[._\-\s]?ops|ops[._\-\s]?automation[._\-\s]?gap|swarm[._\-\s]?ops[._\-\s]?coverage|which[._\-\s]?ops[._\-\s]?have[._\-\s]?swarm|ops[._\-\s]?without[._\-\s]?swarm|unautomated[._\-\s]?ops|automation[._\-\s]?coverage)\b/i;

export function isSwjopsQuery(t) {
  return SWJOPS_RE.test(t || "");
}

function tok(s) {
  return String(s || "")
    .toLowerCase()
    .split(/[\s,;|/\-_.]+/)
    .filter((w) => w.length > 2);
}

function normOpsEvent(e) {
  const label =
    e.name || e.title || e.event_name || e.type || e.id || "Ops Event";
  const description = [e.description, e.details, e.summary, e.notes]
    .filter(Boolean)
    .join(" ");
  const tokens = tok(
    [label, description, e.type, e.category, e.severity, e.status].join(" ")
  );
  return { id: e.id || label, label, type: e.type || e.category || "EVENT", status: e.status || "", description, tokens };
}

function normSwarmJob(j) {
  const label = j.name || j.job_name || j.title || j.id || "SwarmJob";
  const description = [j.description, j.target, j.details, j.notes]
    .filter(Boolean)
    .join(" ");
  const tokens = tok(
    [label, description, j.job_type, j.type, j.target, j.status, j.kind].join(" ")
  );
  return { id: j.id || label, label, type: j.job_type || j.type || "JOB", status: j.status || "", description, tokens };
}

function matchScore(eventTokens, jobTokens) {
  if (!eventTokens.length || !jobTokens.length) return 0;
  let hits = 0;
  for (const et of eventTokens) {
    if (jobTokens.some((jt) => jt.includes(et) || et.includes(jt))) hits++;
  }
  return Math.round((hits / Math.max(eventTokens.length, 1)) * 100);
}

function correlate(events, jobs) {
  return events.map((ev) => {
    const matches = jobs
      .map((j) => ({ ...j, score: matchScore(ev.tokens, j.tokens) }))
      .filter((j) => j.score >= 12)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const automated = matches.length > 0;
    return { ...ev, matches, automated };
  });
}

export async function buildSwjopsScript() {
  try {
    const API_KEY =
      (typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.VITE_API_KEY) ||
      "dev-key";
    const hdrs = { Authorization: `Bearer ${API_KEY}` };
    const [evR, jR] = await Promise.allSettled([
      fetch(`${API}/v1/ops/events`, { headers: hdrs }).then((r) => r.json()),
      fetch(`${API}/entities/SwarmJob`, { headers: hdrs }).then((r) => r.json()),
    ]);
    const rawEv = evR.status === "fulfilled" ? evR.value : [];
    const rawJ = jR.status === "fulfilled" ? jR.value : [];
    const evArr = Array.isArray(rawEv)
      ? rawEv
      : rawEv.items || rawEv.events || rawEv.data || [];
    const jArr = Array.isArray(rawJ)
      ? rawJ
      : rawJ.items || rawJ.jobs || rawJ.data || [];
    const events = evArr.map(normOpsEvent);
    const jobs = jArr.map(normSwarmJob);
    const correlated = correlate(events, jobs);
    const auto = correlated.filter((e) => e.automated).length;
    const manual = correlated.length - auto;
    const pct =
      correlated.length > 0 ? Math.round((auto / correlated.length) * 100) : 0;
    return (
      `SWARM OPS AUTOMATION COVERAGE — ${correlated.length} ops events, ${jobs.length} swarm jobs. ` +
      `AUTOMATED: ${auto} events have swarm backing. ` +
      `MANUAL (gap): ${manual} events have NO swarm automation. ` +
      `Coverage: ${pct}%. ` +
      (manual > 0
        ? `Top unautomated: ${correlated
            .filter((e) => !e.automated)
            .slice(0, 3)
            .map((e) => e.label)
            .join(", ")}.`
        : "All ops events are covered by swarm automation.")
    );
  } catch {
    return "SWJOPS: Unable to fetch ops event / swarm job data.";
  }
}

const CY = "#29E7FF";
const AMB = "#F59E0B";
const TABS = ["ALL", "AUTOMATED", "MANUAL"];

export default function SwarmJobOpsEventCoverage() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState("");
  const timerRef = useRef(null);

  const API_KEY =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.VITE_API_KEY) ||
    "dev-key";
  const hdrs = { Authorization: `Bearer ${API_KEY}` };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [evR, jR] = await Promise.allSettled([
        fetch(`${API}/v1/ops/events`, { headers: hdrs }).then((r) => r.json()),
        fetch(`${API}/entities/SwarmJob`, { headers: hdrs }).then((r) => r.json()),
      ]);
      const rawEv = evR.status === "fulfilled" ? evR.value : [];
      const rawJ = jR.status === "fulfilled" ? jR.value : [];
      const evArr = Array.isArray(rawEv)
        ? rawEv
        : rawEv.items || rawEv.events || rawEv.data || [];
      const jArr = Array.isArray(rawJ)
        ? rawJ
        : rawJ.items || rawJ.jobs || rawJ.data || [];
      setJobs(jArr.map(normSwarmJob));
      setEvents(evArr.map(normOpsEvent));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen((o) => {
        if (!o) load();
        return !o;
      });
    };
    window.addEventListener("jarvis:swjops-toggle", toggle);
    return () => window.removeEventListener("jarvis:swjops-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const correlated = correlate(events, jobs);
  const auto = correlated.filter((e) => e.automated).length;
  const manual = correlated.length - auto;
  const pct =
    correlated.length > 0 ? Math.round((auto / correlated.length) * 100) : 0;

  const filtered = correlated.filter((e) => {
    if (tab === "AUTOMATED" && !e.automated) return false;
    if (tab === "MANUAL" && e.automated) return false;
    const q = search.toLowerCase();
    return !q || e.label.toLowerCase().includes(q) || e.type.toLowerCase().includes(q);
  });

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const prompt = `SwarmJob × Ops Event automation coverage: ${correlated.length} ops events, ${jobs.length} swarm jobs. AUTOMATED: ${auto}, MANUAL gap: ${manual} (${100 - pct}% uncovered). Top manual gaps: ${correlated.filter((e) => !e.automated).slice(0, 3).map((e) => e.label).join(", ")}. Provide a 2-sentence operational automation-gap assessment.`;
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const txt =
        d.response || d.text || d.message || d.answer || "No assessment returned.";
      setBrief(txt);
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } })
      );
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  };

  const S = {
    btn: {
      position: "fixed",
      left: 626560,
      bottom: 8,
      zIndex: 232,
      background: "rgba(10,15,25,0.92)",
      border: `1px solid ${AMB}44`,
      borderRadius: 4,
      color: AMB,
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: 9,
      letterSpacing: 1.5,
      padding: "3px 7px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: 5,
    },
    badge: {
      background: AMB,
      color: "#000",
      borderRadius: 8,
      fontSize: 8,
      padding: "1px 5px",
      fontWeight: 700,
      minWidth: 14,
      textAlign: "center",
    },
    overlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.55)",
      zIndex: 9000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    panel: {
      position: "fixed",
      left: "50%",
      top: "50%",
      transform: "translate(-50%,-50%)",
      zIndex: 9001,
      width: 580,
      maxHeight: 560,
      overflowY: "auto",
      background: "rgba(8,14,24,0.97)",
      border: `1px solid ${AMB}55`,
      borderRadius: 8,
      padding: 20,
      fontFamily: "'JetBrains Mono',monospace",
      color: CY,
      boxShadow: `0 0 40px ${AMB}22`,
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14,
    },
    title: { fontSize: 11, letterSpacing: 2, color: AMB },
    close: {
      background: "none",
      border: "none",
      color: "#888",
      fontSize: 14,
      cursor: "pointer",
    },
    statRow: {
      display: "flex",
      gap: 8,
      marginBottom: 14,
    },
    stat: {
      flex: 1,
      background: "rgba(245,158,11,0.07)",
      border: `1px solid ${AMB}33`,
      borderRadius: 5,
      padding: "8px 10px",
      textAlign: "center",
    },
    statVal: { fontSize: 18, fontWeight: 700, color: AMB },
    statLbl: { fontSize: 8, color: "#888", letterSpacing: 1, marginTop: 2 },
    tabs: { display: "flex", gap: 6, marginBottom: 10 },
    tab: (active) => ({
      padding: "3px 10px",
      borderRadius: 4,
      fontSize: 9,
      cursor: "pointer",
      border: `1px solid ${active ? AMB : "#333"}`,
      background: active ? `${AMB}22` : "transparent",
      color: active ? AMB : "#666",
      letterSpacing: 1,
    }),
    search: {
      width: "100%",
      background: "rgba(255,255,255,0.04)",
      border: `1px solid #333`,
      borderRadius: 4,
      color: CY,
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: 9,
      padding: "4px 8px",
      marginBottom: 10,
      boxSizing: "border-box",
    },
    row: {
      borderBottom: "1px solid #1a2030",
      padding: "8px 0",
      cursor: "pointer",
    },
    rowTop: { display: "flex", alignItems: "center", gap: 8 },
    typeBadge: (auto) => ({
      fontSize: 7,
      padding: "1px 5px",
      borderRadius: 3,
      background: auto ? `${CY}22` : `${AMB}22`,
      color: auto ? CY : AMB,
      border: `1px solid ${auto ? CY : AMB}44`,
      letterSpacing: 1,
    }),
    label: { fontSize: 10, color: "#ccc", flex: 1 },
    matchCount: { fontSize: 8, color: "#666" },
    jobRow: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      marginTop: 5,
      paddingLeft: 12,
    },
    jobLabel: { fontSize: 8, color: "#999", flex: 1 },
    scoreBar: (pct) => ({
      width: Math.max(4, Math.min(80, pct)),
      height: 4,
      borderRadius: 2,
      background: `linear-gradient(90deg,${AMB},${CY})`,
      opacity: 0.7,
    }),
    assessBtn: {
      marginTop: 12,
      padding: "5px 14px",
      background: `${AMB}18`,
      border: `1px solid ${AMB}55`,
      borderRadius: 4,
      color: AMB,
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: 9,
      cursor: "pointer",
      letterSpacing: 1,
    },
    brief: {
      marginTop: 10,
      padding: 10,
      background: "rgba(245,158,11,0.05)",
      border: `1px solid ${AMB}33`,
      borderRadius: 4,
      fontSize: 9,
      color: "#aaa",
      lineHeight: 1.6,
    },
  };

  return (
    <>
      <button style={S.btn} onClick={() => { setOpen((o) => { if (!o) load(); return !o; })} }>
        ◈ SWJOPS
        {manual > 0 && <span style={S.badge}>{manual}</span>}
      </button>
      {open && (
        <>
          <div style={S.overlay} onClick={() => setOpen(false)} />
          <div style={S.panel} onClick={(e) => e.stopPropagation()}>
            <div style={S.header}>
              <span style={S.title}>◈ SWARM JOB × OPS EVENT COVERAGE</span>
              <button style={S.close} onClick={() => setOpen(false)}>✕</button>
            </div>
            <div style={S.statRow}>
              <div style={S.stat}>
                <div style={S.statVal}>{correlated.length}</div>
                <div style={S.statLbl}>OPS EVENTS</div>
              </div>
              <div style={S.stat}>
                <div style={S.statVal}>{jobs.length}</div>
                <div style={S.statLbl}>SWARM JOBS</div>
              </div>
              <div style={S.stat}>
                <div style={{ ...S.statVal, color: CY }}>{auto}</div>
                <div style={S.statLbl}>AUTOMATED</div>
              </div>
              <div style={S.stat}>
                <div style={{ ...S.statVal, color: AMB }}>{manual}</div>
                <div style={S.statLbl}>MANUAL GAP</div>
              </div>
            </div>
            <div style={S.tabs}>
              {TABS.map((t) => (
                <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>
                  {t}
                </button>
              ))}
              <span style={{ marginLeft: "auto", fontSize: 8, color: "#555", alignSelf: "center" }}>
                {pct}% automated
              </span>
            </div>
            <input
              style={S.search}
              placeholder="search ops events…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {loading ? (
              <div style={{ fontSize: 9, color: "#555", padding: 10 }}>◌ loading…</div>
            ) : filtered.length === 0 ? (
              <div style={{ fontSize: 9, color: "#555", padding: 10 }}>No events found.</div>
            ) : (
              filtered.map((ev) => (
                <div
                  key={ev.id}
                  style={S.row}
                  onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                >
                  <div style={S.rowTop}>
                    <span style={S.typeBadge(ev.automated)}>
                      {ev.automated ? "AUTOMATED" : "MANUAL"}
                    </span>
                    <span style={S.label}>{ev.label}</span>
                    <span style={{ fontSize: 8, color: "#555" }}>{ev.type}</span>
                    <span style={S.matchCount}>
                      {ev.matches.length > 0 ? `${ev.matches.length} jobs` : "no match"}
                    </span>
                  </div>
                  {expanded === ev.id && (
                    <div style={{ marginTop: 6, paddingLeft: 8 }}>
                      {ev.automated ? (
                        ev.matches.map((j) => (
                          <div key={j.id} style={S.jobRow}>
                            <span style={{ ...S.typeBadge(true), color: "#aaa", background: "transparent", border: "none" }}>
                              {j.type}
                            </span>
                            <span style={S.jobLabel}>{j.label}</span>
                            <div style={S.scoreBar(j.score)} />
                            <span style={{ fontSize: 7, color: "#555" }}>{j.score}%</span>
                          </div>
                        ))
                      ) : (
                        <div style={{ fontSize: 8, color: AMB, paddingTop: 4 }}>
                          ⚠ No swarm job covers this ops event — manual intervention required.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
            <button style={S.assessBtn} onClick={assess} disabled={assessing}>
              {assessing ? "◌ assessing…" : "▶ ASSESS"}
            </button>
            {brief && <div style={S.brief}>{brief}</div>}
          </div>
        </>
      )}
    </>
  );
}
