import { useState, useEffect, useCallback, useRef } from "react";

const API = "";
const SKOPS_RE =
  /\b(skill[._\-\s]?ops|ops[._\-\s]?skill|skops|in[._\-\s]?demand[._\-\s]?skills?|skill[._\-\s]?readiness|operational[._\-\s]?skill[._\-\s]?gap|ops[._\-\s]?skill[._\-\s]?coverage|which[._\-\s]?skills?[._\-\s]?are[._\-\s]?needed|skill[._\-\s]?ops[._\-\s]?alignment|dormant[._\-\s]?skills?)\b/i;

export function isSkopsQuery(t) {
  return SKOPS_RE.test(t || "");
}

function tok(s) {
  return String(s || "")
    .toLowerCase()
    .split(/[\s,;|/\-_.]+/)
    .filter((w) => w.length > 2);
}

function normSkill(s) {
  const label = s.name || s.title || s.skill_name || s.id || "Skill";
  const description = [s.description, s.summary, s.details, s.notes]
    .filter(Boolean)
    .join(" ");
  const tokens = tok(
    [label, description, s.category, s.domain, s.type, ...(s.tags || [])].join(" ")
  );
  return { id: s.id || label, label, category: s.category || s.type || "SKILL", domain: s.domain || "", description, tokens };
}

function normOpsEvent(e) {
  const label = e.name || e.title || e.event_name || e.type || e.id || "Ops Event";
  const description = [e.description, e.details, e.summary, e.notes]
    .filter(Boolean)
    .join(" ");
  const tokens = tok(
    [label, description, e.type, e.category, e.severity, e.status].join(" ")
  );
  return { id: e.id || label, label, type: e.type || e.category || "EVENT", severity: e.severity || "", description, tokens };
}

function matchScore(skillTokens, eventTokens) {
  if (!skillTokens.length || !eventTokens.length) return 0;
  let hits = 0;
  for (const st of skillTokens) {
    if (eventTokens.some((et) => et.includes(st) || st.includes(et))) hits++;
  }
  return Math.round((hits / Math.max(skillTokens.length, 1)) * 100);
}

function correlate(skills, events) {
  return skills.map((sk) => {
    const matches = events
      .map((ev) => ({ ...ev, score: matchScore(sk.tokens, ev.tokens) }))
      .filter((ev) => ev.score >= 12)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const inDemand = matches.length > 0;
    return { ...sk, matches, inDemand };
  });
}

export async function buildSkopsScript() {
  try {
    const API_KEY =
      (typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.VITE_API_KEY) ||
      "dev-key";
    const hdrs = { Authorization: `Bearer ${API_KEY}` };
    const [skR, evR] = await Promise.allSettled([
      fetch(`${API}/v1/aip/skill`, { headers: hdrs }).then((r) => r.json()),
      fetch(`${API}/v1/ops/events`, { headers: hdrs }).then((r) => r.json()),
    ]);
    const rawSk = skR.status === "fulfilled" ? skR.value : [];
    const rawEv = evR.status === "fulfilled" ? evR.value : [];
    const skArr = Array.isArray(rawSk) ? rawSk : rawSk.items || rawSk.skills || rawSk.data || [];
    const evArr = Array.isArray(rawEv) ? rawEv : rawEv.items || rawEv.events || rawEv.data || [];
    const skills = skArr.map(normSkill);
    const events = evArr.map(normOpsEvent);
    const correlated = correlate(skills, events);
    const inDemand = correlated.filter((s) => s.inDemand).length;
    const dormant = correlated.length - inDemand;
    const pct = correlated.length > 0 ? Math.round((inDemand / correlated.length) * 100) : 0;
    return (
      `SKILL × OPS EVENT COVERAGE — ${correlated.length} skills, ${events.length} ops events. ` +
      `IN-DEMAND: ${inDemand} skills are active against current ops situations. ` +
      `DORMANT: ${dormant} skills have no active ops alignment. ` +
      `Operational readiness: ${pct}%. ` +
      (inDemand > 0
        ? `Top demanded: ${correlated
            .filter((s) => s.inDemand)
            .slice(0, 3)
            .map((s) => s.label)
            .join(", ")}.`
        : "No skills are currently demanded by active ops events.")
    );
  } catch {
    return "SKOPS: Unable to fetch skill / ops event data.";
  }
}

const CY = "#29E7FF";
const AMB = "#F59E0B";
const TABS = ["ALL", "IN-DEMAND", "DORMANT"];

const SEV_COLORS = { CRITICAL: "#ef4444", WARNING: AMB, INFO: "#6b7280" };

export default function SkillOpsEventCoverage() {
  const [open, setOpen] = useState(false);
  const [skills, setSkills] = useState([]);
  const [events, setEvents] = useState([]);
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
      const [skR, evR] = await Promise.allSettled([
        fetch(`${API}/v1/aip/skill`, { headers: hdrs }).then((r) => r.json()),
        fetch(`${API}/v1/ops/events`, { headers: hdrs }).then((r) => r.json()),
      ]);
      const rawSk = skR.status === "fulfilled" ? skR.value : [];
      const rawEv = evR.status === "fulfilled" ? evR.value : [];
      const skArr = Array.isArray(rawSk) ? rawSk : rawSk.items || rawSk.skills || rawSk.data || [];
      const evArr = Array.isArray(rawEv) ? rawEv : rawEv.items || rawEv.events || rawEv.data || [];
      setSkills(skArr.map(normSkill));
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
    window.addEventListener("jarvis:skops-toggle", toggle);
    return () => window.removeEventListener("jarvis:skops-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const correlated = correlate(skills, events);
  const inDemand = correlated.filter((s) => s.inDemand).length;
  const dormant = correlated.length - inDemand;
  const pct = correlated.length > 0 ? Math.round((inDemand / correlated.length) * 100) : 0;

  const filtered = correlated.filter((s) => {
    if (tab === "IN-DEMAND" && !s.inDemand) return false;
    if (tab === "DORMANT" && s.inDemand) return false;
    const q = search.toLowerCase();
    return !q || s.label.toLowerCase().includes(q) || s.category.toLowerCase().includes(q);
  });

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const prompt = `Skill × Ops Event Coverage: ${correlated.length} skills, ${events.length} ops events. IN-DEMAND: ${inDemand} skills active in current ops. DORMANT: ${dormant} skills have no ops alignment (${100 - pct}% dormant). Top in-demand: ${correlated.filter((s) => s.inDemand).slice(0, 3).map((s) => s.label).join(", ")}. Provide a 2-sentence operational skill readiness assessment.`;
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const txt = d.response || d.text || d.message || d.answer || "No assessment returned.";
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
      left: 627120,
      bottom: 8,
      zIndex: 233,
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
    statRow: { display: "flex", gap: 8, marginBottom: 14 },
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
    row: { borderBottom: "1px solid #1a2030", padding: "8px 0", cursor: "pointer" },
    rowTop: { display: "flex", alignItems: "center", gap: 8 },
    statusBadge: (active) => ({
      fontSize: 7,
      padding: "1px 5px",
      borderRadius: 3,
      background: active ? `${CY}22` : `${AMB}22`,
      color: active ? CY : AMB,
      border: `1px solid ${active ? CY : AMB}44`,
      letterSpacing: 1,
    }),
    label: { fontSize: 10, color: "#ccc", flex: 1 },
    catBadge: {
      fontSize: 7,
      padding: "1px 5px",
      borderRadius: 3,
      background: "rgba(255,255,255,0.06)",
      color: "#888",
      border: "1px solid #333",
      letterSpacing: 1,
    },
    matchCount: { fontSize: 8, color: "#666" },
    evRow: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      marginTop: 5,
      paddingLeft: 12,
    },
    evLabel: { fontSize: 8, color: "#999", flex: 1 },
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
      <button
        style={S.btn}
        onClick={() => { setOpen((o) => { if (!o) load(); return !o; }); }}
      >
        ◈ SKOPS
        {dormant > 0 && <span style={S.badge}>{dormant}</span>}
      </button>
      {open && (
        <>
          <div style={S.overlay} onClick={() => setOpen(false)} />
          <div style={S.panel} onClick={(e) => e.stopPropagation()}>
            <div style={S.header}>
              <span style={S.title}>◈ SKILL × OPS EVENT COVERAGE</span>
              <button style={S.close} onClick={() => setOpen(false)}>✕</button>
            </div>
            <div style={S.statRow}>
              <div style={S.stat}>
                <div style={S.statVal}>{correlated.length}</div>
                <div style={S.statLbl}>SKILLS</div>
              </div>
              <div style={S.stat}>
                <div style={S.statVal}>{events.length}</div>
                <div style={S.statLbl}>OPS EVENTS</div>
              </div>
              <div style={S.stat}>
                <div style={{ ...S.statVal, color: CY }}>{inDemand}</div>
                <div style={S.statLbl}>IN-DEMAND</div>
              </div>
              <div style={S.stat}>
                <div style={{ ...S.statVal, color: AMB }}>{dormant}</div>
                <div style={S.statLbl}>DORMANT</div>
              </div>
            </div>
            <div style={S.tabs}>
              {TABS.map((t) => (
                <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>
                  {t}
                </button>
              ))}
              <span style={{ marginLeft: "auto", fontSize: 8, color: "#555", alignSelf: "center" }}>
                {pct}% ops-aligned
              </span>
            </div>
            <input
              style={S.search}
              placeholder="search skills…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {loading ? (
              <div style={{ fontSize: 9, color: "#555", padding: 10 }}>◌ loading…</div>
            ) : filtered.length === 0 ? (
              <div style={{ fontSize: 9, color: "#555", padding: 10 }}>No skills found.</div>
            ) : (
              filtered.map((sk) => (
                <div
                  key={sk.id}
                  style={S.row}
                  onClick={() => setExpanded(expanded === sk.id ? null : sk.id)}
                >
                  <div style={S.rowTop}>
                    <span style={S.statusBadge(sk.inDemand)}>
                      {sk.inDemand ? "IN-DEMAND" : "DORMANT"}
                    </span>
                    <span style={S.label}>{sk.label}</span>
                    <span style={S.catBadge}>{sk.category}</span>
                    <span style={S.matchCount}>
                      {sk.matches.length > 0 ? `${sk.matches.length} events` : "no match"}
                    </span>
                  </div>
                  {expanded === sk.id && (
                    <div style={{ marginTop: 6, paddingLeft: 8 }}>
                      {sk.inDemand ? (
                        sk.matches.map((ev) => (
                          <div key={ev.id} style={S.evRow}>
                            <span style={{
                              fontSize: 7,
                              padding: "1px 5px",
                              borderRadius: 3,
                              background: "transparent",
                              border: "none",
                              color: SEV_COLORS[ev.severity?.toUpperCase()] || "#aaa",
                              letterSpacing: 1,
                            }}>
                              {ev.severity || ev.type}
                            </span>
                            <span style={S.evLabel}>{ev.label}</span>
                            <div style={S.scoreBar(ev.score)} />
                            <span style={{ fontSize: 7, color: "#555" }}>{ev.score}%</span>
                          </div>
                        ))
                      ) : (
                        <div style={{ fontSize: 8, color: AMB, paddingTop: 4 }}>
                          ○ This skill has no active ops event alignment — currently dormant.
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
