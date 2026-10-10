/**
 * F700 — Acoustic × SwarmJob × Risk Signal Triple Nexus (ACSWRSK)
 * Three-way cross-reference:
 *   /v1/acoustic/contacts × /entities/SwarmJob × /entities/RiskSignal
 * Each acoustic contact is classified:
 *   FULLY_COVERED — matches ≥1 swarm job AND ≥1 risk signal
 *   SWARM_ONLY    — swarm job match but no risk signal link
 *   RISK_ONLY     — risk signal match but no swarm job link
 *   DARK          — no swarm or risk match
 * Coverage % tile = FULLY_COVERED / total contacts.
 * Tabs: ALL / FULLY_COVERED / SWARM_ONLY / RISK_ONLY / DARK + search.
 * Click-to-expand shows matched swarm jobs + matched risk signals per contact.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-second auto-refresh. Event: jarvis:acswrsk-toggle.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 152_680;
const Z_INDEX  = 236;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const ACSWRSK_RE = /\b(acswrsk|acoustic\s+swarm\s+risk|swarm\s+risk\s+acoustic|acoustic\s+swarm\s+signal|sensor\s+swarm\s+risk|acoustic\s+automated\s+risk|swarm\s+covered\s+acoustic|acoustic\s+risk\s+automation|risk\s+swarm\s+acoustic)\b/i;

export function isAcswrskQuery(q) { return ACSWRSK_RE.test(q); }

const TIER_COLOR = {
  FULLY_COVERED: "#00e5a0",
  SWARM_ONLY:    "#29E7FF",
  RISK_ONLY:     "#ff6600",
  DARK:          "#667788",
};

const STATUS_COLOR = {
  running:   "#00e5a0",
  completed: "#29E7FF",
  pending:   "#FFA500",
  failed:    "#ff2244",
  default:   "#667788",
};

const SEV_COLOR = {
  CRITICAL: "#ff2244",
  HIGH:     "#ff6600",
  MEDIUM:   "#ffcc00",
  LOW:      "#00e5a0",
  default:  "#667788",
};

// ── helpers ───────────────────────────────────────────────────────────────────

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3);
}

function overlaps(words, target) {
  const tWords = keywords(target);
  return words.some(w => tWords.includes(w));
}

function normaliseAcoustic(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.contacts || raw?.items || raw?.data || []);
  return arr.map(c => ({
    id:    c.id || c.contact_id || String(Math.random()),
    label: c.label || c.name || c.classification || "Unknown",
    lat:   c.lat ?? c.latitude ?? null,
    lon:   c.lon ?? c.longitude ?? null,
  }));
}

function normaliseSwarm(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.items || raw?.data || raw?.jobs || []);
  return arr.map(j => ({
    id:       j.id || j.job_id || String(Math.random()),
    title:    j.title || j.name || j.job_name || "Unnamed Job",
    status:   (j.status || "pending").toLowerCase(),
    progress: j.progress ?? j.completion_pct ?? 0,
    desc:     j.description || j.detail || "",
  }));
}

function normaliseRisk(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.items || raw?.data || raw?.signals || []);
  return arr.map(s => ({
    id:       s.id || s.signal_id || String(Math.random()),
    title:    s.title || s.name || s.signal || "Unknown Signal",
    severity: (s.severity || s.level || "LOW").toUpperCase(),
    desc:     s.description || s.detail || "",
  }));
}

function crossRef(acoustic, swarm, risks) {
  return acoustic.map(c => {
    const cWords   = keywords(c.label);
    const matchedSwarm = swarm.filter(j => overlaps(cWords, j.title + " " + j.desc));
    const matchedRisk  = risks.filter(s => overlaps(cWords, s.title + " " + s.desc));
    let tier;
    if (matchedSwarm.length && matchedRisk.length) tier = "FULLY_COVERED";
    else if (matchedSwarm.length)                  tier = "SWARM_ONLY";
    else if (matchedRisk.length)                   tier = "RISK_ONLY";
    else                                           tier = "DARK";
    return { ...c, tier, matchedSwarm, matchedRisk };
  });
}

// ── voice build script ────────────────────────────────────────────────────────

export async function buildAcswrskScript() {
  try {
    const base = apiBase();
    const [ar, sr, rr] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/entities/SwarmJob`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/entities/RiskSignal`,   { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const acoustic = normaliseAcoustic(await ar.json());
    const swarm    = normaliseSwarm(await sr.json());
    const risks    = normaliseRisk(await rr.json());
    const rows     = crossRef(acoustic, swarm, risks);
    const covered  = rows.filter(r => r.tier === "FULLY_COVERED").length;
    const swarmOnly = rows.filter(r => r.tier === "SWARM_ONLY").length;
    const riskOnly  = rows.filter(r => r.tier === "RISK_ONLY").length;
    const dark      = rows.filter(r => r.tier === "DARK").length;
    const total     = rows.length;
    const pct       = total ? Math.round((covered / total) * 100) : 0;

    const briefResp = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `JARVIS acoustic swarm-risk triple nexus: ${total} acoustic contacts total. ${covered} fully covered (both swarm job + risk signal match), ${swarmOnly} swarm only (no risk signal), ${riskOnly} risk only (no swarm job), ${dark} dark (no coverage). Give a 2-sentence automated risk-coverage assessment.`,
      }),
    });
    const brief = ((await briefResp.json()).answer || "").trim();
    return brief || `Acoustic swarm-risk coverage: ${pct}% fully covered. ${covered} of ${total} contacts have both automated swarm tasking and risk signal backing, sir.`;
  } catch {
    return "Acoustic swarm-risk triple nexus is temporarily unreachable, sir.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "FULLY_COVERED", "SWARM_ONLY", "RISK_ONLY", "DARK"];
const TAB_LABEL = {
  ALL: "ALL", FULLY_COVERED: "COVERED", SWARM_ONLY: "SWARM", RISK_ONLY: "RISK", DARK: "DARK",
};

const CY  = "#29E7FF";
const DIM = "#8899AA";
const AMB = "#FFA500";
const GRN = "#00e5a0";

export default function AcousticSwarmRiskTriple() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const [badge,     setBadge]     = useState(0);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const [ar, sr, rr] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/SwarmJob`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/RiskSignal`,   { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const acoustic = normaliseAcoustic(await ar.json());
      const swarm    = normaliseSwarm(await sr.json());
      const risks    = normaliseRisk(await rr.json());
      const data     = crossRef(acoustic, swarm, risks);
      setRows(data);
      setBadge(data.filter(r => r.tier === "FULLY_COVERED").length);
    } catch { /* network error — keep stale data */ }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:acswrsk-toggle", toggle);
    return () => window.removeEventListener("jarvis:acswrsk-toggle", toggle);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const text = await buildAcswrskScript();
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } finally {
      setAssessing(false);
    }
  }, []);

  const filtered = rows.filter(r => {
    if (tab !== "ALL" && r.tier !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.label.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const total   = rows.length;
  const covered = rows.filter(r => r.tier === "FULLY_COVERED").length;
  const swarmOnly = rows.filter(r => r.tier === "SWARM_ONLY").length;
  const riskOnly  = rows.filter(r => r.tier === "RISK_ONLY").length;
  const dark      = rows.filter(r => r.tier === "DARK").length;
  const pct       = total ? Math.round((covered / total) * 100) : 0;

  const btnStyle = {
    position: "fixed",
    bottom: 8,
    left: BTN_LEFT,
    zIndex: Z_INDEX,
    background: "rgba(0,10,20,0.85)",
    border: `1px solid ${GRN}`,
    borderRadius: 4,
    color: GRN,
    fontSize: 9,
    fontFamily: "monospace",
    letterSpacing: 1,
    padding: "3px 8px",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  const panelStyle = {
    position: "fixed",
    bottom: 36,
    left: BTN_LEFT - 300,
    width: 520,
    maxHeight: "60vh",
    overflowY: "auto",
    zIndex: Z_INDEX + 1,
    background: "rgba(0,8,18,0.97)",
    border: `1px solid ${GRN}`,
    borderRadius: 6,
    padding: 14,
    fontFamily: "monospace",
    color: "#DCEBF5",
    fontSize: 11,
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(o => !o)}>
        ◈ ACSWRSK{badge > 0 && (
          <span style={{
            marginLeft: 4,
            background: GRN,
            color: "#000",
            borderRadius: 8,
            padding: "0 4px",
            fontSize: 8,
          }}>{badge}</span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ color: GRN, fontSize: 12, fontWeight: "bold", letterSpacing: 1 }}>
              ◈ ACOUSTIC × SWARM × RISK TRIPLE NEXUS
            </span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {[
              ["CONTACTS", total,    CY],
              ["FULLY COV", covered, GRN],
              ["SWARM ONLY", swarmOnly, "#29E7FF"],
              ["RISK ONLY",  riskOnly,  "#ff6600"],
              ["COVERAGE",  `${pct}%`,  pct >= 60 ? GRN : AMB],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: "rgba(0,20,40,0.7)",
                border: `1px solid ${col}`,
                borderRadius: 4,
                padding: "4px 10px",
                textAlign: "center",
                minWidth: 64,
              }}>
                <div style={{ color: col, fontSize: 14, fontWeight: "bold" }}>{val}</div>
                <div style={{ color: DIM, fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? GRN : "rgba(0,20,40,0.6)",
                border: `1px solid ${tab === t ? GRN : DIM}`,
                borderRadius: 3,
                color: tab === t ? "#000" : DIM,
                fontSize: 9,
                padding: "2px 7px",
                cursor: "pointer",
                letterSpacing: 1,
              }}>{TAB_LABEL[t]}</button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search contacts…"
            style={{
              width: "100%",
              background: "rgba(0,20,40,0.5)",
              border: `1px solid ${DIM}`,
              borderRadius: 3,
              color: "#DCEBF5",
              fontSize: 10,
              padding: "3px 7px",
              marginBottom: 8,
              boxSizing: "border-box",
            }}
          />

          {/* rows */}
          <div>
            {filtered.length === 0 && (
              <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 12 }}>
                No contacts match current filter.
              </div>
            )}
            {filtered.map(r => (
              <div key={r.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    padding: "4px 6px",
                    borderRadius: 3,
                    background: "rgba(0,20,40,0.4)",
                    border: `1px solid ${TIER_COLOR[r.tier] || DIM}`,
                  }}
                >
                  <span style={{
                    background: TIER_COLOR[r.tier] || DIM,
                    color: "#000",
                    fontSize: 8,
                    borderRadius: 3,
                    padding: "1px 5px",
                    letterSpacing: 0.5,
                    minWidth: 58,
                    textAlign: "center",
                  }}>{r.tier.replace("_", " ")}</span>
                  <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{r.label}</span>
                  {r.lat != null && (
                    <span style={{ color: DIM, fontSize: 9 }}>{Number(r.lat).toFixed(2)},{Number(r.lon).toFixed(2)}</span>
                  )}
                  <span style={{ color: DIM, fontSize: 10 }}>{expanded === r.id ? "▲" : "▼"}</span>
                </div>

                {expanded === r.id && (
                  <div style={{ padding: "6px 10px", background: "rgba(0,15,30,0.5)", borderRadius: "0 0 3px 3px", borderTop: "none" }}>
                    {r.matchedSwarm.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>MATCHED SWARM JOBS ({r.matchedSwarm.length})</div>
                        {r.matchedSwarm.slice(0, 4).map(j => (
                          <div key={j.id} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                            <span style={{
                              background: STATUS_COLOR[j.status] || STATUS_COLOR.default,
                              color: "#000",
                              fontSize: 7,
                              borderRadius: 2,
                              padding: "1px 4px",
                              letterSpacing: 0.5,
                            }}>{j.status.toUpperCase()}</span>
                            <span style={{ flex: 1, color: "#DCEBF5", fontSize: 9 }}>{j.title}</span>
                            <span style={{ color: CY, fontSize: 9 }}>{j.progress}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {r.matchedRisk.length > 0 && (
                      <div>
                        <div style={{ color: "#ff6600", fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>MATCHED RISK SIGNALS ({r.matchedRisk.length})</div>
                        {r.matchedRisk.slice(0, 4).map(s => (
                          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                            <span style={{
                              background: SEV_COLOR[s.severity] || SEV_COLOR.default,
                              color: "#000",
                              fontSize: 7,
                              borderRadius: 2,
                              padding: "1px 4px",
                              letterSpacing: 0.5,
                            }}>{s.severity}</span>
                            <span style={{ flex: 1, color: "#DCEBF5", fontSize: 9 }}>{s.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {r.matchedSwarm.length === 0 && r.matchedRisk.length === 0 && (
                      <div style={{ color: DIM, fontSize: 9 }}>No swarm or risk signal matches found.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* assess */}
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              marginTop: 10,
              background: assessing ? "rgba(0,229,160,0.2)" : "rgba(0,229,160,0.15)",
              border: `1px solid ${GRN}`,
              borderRadius: 5,
              color: GRN,
              padding: "5px 12px",
              cursor: "pointer",
              fontSize: 10,
              letterSpacing: 1,
              width: "100%",
              opacity: assessing ? 0.6 : 1,
            }}
          >
            {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
          </button>
          {brief && (
            <div style={{
              marginTop: 8,
              color: "#DCEBF5",
              fontSize: 10,
              lineHeight: 1.5,
              borderLeft: `2px solid ${GRN}`,
              paddingLeft: 8,
            }}>
              {brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
