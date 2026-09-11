/**
 * F89 — RiskSignal × AIP Skill Coverage (RSSC)
 *
 * Parallel-fetches /entities/RiskSignal + /v1/aip/skill, then keyword-correlates
 * each risk signal (title, description, severity, category, tags) against AIP
 * skills (name, description, category, tags) to surface:
 *
 *   MITIGATED  — at least one AIP skill keyword-matches this risk signal
 *   UNCOVERED  — no AIP skill aligns with this risk signal currently
 *
 * Stat tiles: signals / skills / mitigated / uncovered
 * Filter tabs: ALL | MITIGATED | UNCOVERED + text search
 * Expand signal → matched skills with category badge + relevance score bar.
 * Amber badge on uncovered count.
 * ▶ ASSESS: 2-sentence risk × skill coverage brief via /v1/jarvis/agent/chat +
 *   jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ RSSC  at left:2820 bottom:18, zIndex:68.
 * Event:   jarvis:rsask-toggle
 * Voice:   "risk skill / skill risk / rssc / risk signal skill / uncovered risks /
 *           which risks have no skill / risk skill coverage / skill gap risk /
 *           aip risk / risk aip coverage"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 2820;
const POLL_MS  = 90_000;
const AMBER    = "#F59E0B";
const CYAN     = "#29E7FF";
const GREEN    = "#34D399";
const SLATE    = "#6E8AA0";
const ROSE     = "#FB7185";
const PURPLE   = "#A78BFA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const RSASK_RE =
  /\b(risk\s+aip\s+skill[s]?|aip\s+skill\s+risk[s]?|rsask|risk\s+signal\s+aip\s+skill[s]?|uncovered\s+risk\s+aip|which\s+risks?\s+(have\s+)?no\s+aip\s+skill|risk\s+aip\s+skill\s+coverage|aip\s+skill\s+gap\s+risk[s]?|risk\s+mitigation\s+skill[s]?|skill\s+backed\s+risk[s]?|unmitigated\s+risk\s+aip)\b/i;

export function isRsaskQuery(q) { return RSASK_RE.test(q); }

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseRisks(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.items ?? raw?.data ?? raw?.signals ?? []);
  return arr.map((x) => ({
    id:       x.id ?? x._id ?? String(Math.random()),
    title:    String(x.title ?? x.name ?? x.signal ?? "Risk signal"),
    desc:     String(x.description ?? x.summary ?? x.details ?? ""),
    severity: String(x.severity ?? x.level ?? x.priority ?? "MEDIUM").toUpperCase(),
    category: String(x.category ?? x.type ?? x.source ?? ""),
    tags:     Array.isArray(x.tags) ? x.tags.join(" ") : String(x.tags ?? ""),
    keywords: [
      x.title ?? "", x.name ?? "", x.signal ?? "",
      x.description ?? "", x.category ?? "", x.type ?? "",
      x.tags ? (Array.isArray(x.tags) ? x.tags.join(" ") : x.tags) : "",
    ].join(" ").toLowerCase(),
  }));
}

function normaliseSkills(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.items ?? raw?.data ?? raw?.skills ?? []);
  return arr.map((x) => ({
    id:       x.id ?? x._id ?? String(Math.random()),
    name:     String(x.name ?? x.title ?? "Skill"),
    desc:     String(x.description ?? x.summary ?? ""),
    category: String(x.category ?? x.type ?? x.domain ?? ""),
    tags:     Array.isArray(x.tags) ? x.tags.join(" ") : String(x.tags ?? ""),
    keywords: [
      x.name ?? "", x.title ?? "",
      x.description ?? "", x.category ?? "", x.domain ?? "",
      x.tags ? (Array.isArray(x.tags) ? x.tags.join(" ") : x.tags) : "",
    ].join(" ").toLowerCase(),
  }));
}

function relevance(risk, skill) {
  const needles = skill.keywords.split(/\s+/).filter((w) => w.length > 2);
  let score = 0;
  needles.forEach((n) => { if (risk.keywords.includes(n)) score += 1; });
  return score;
}

function correlate(risks, skills) {
  return risks.map((r) => {
    const matches = skills
      .map((sk) => ({ sk, score: relevance(r, sk) }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...r, matches, mitigated: matches.length > 0 };
  });
}

// ── async build helper exported for JarvisBrain ───────────────────────────────

export async function buildRsaskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [riskRes, skillRes] = await Promise.all([
      fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
      fetch(`${base}/v1/aip/skill`,        { headers: hdr }),
    ]);
    const risks  = normaliseRisks(await riskRes.json());
    const skills = normaliseSkills(await skillRes.json());
    const rows   = correlate(risks, skills);

    const mitigated = rows.filter((r) => r.mitigated).length;
    const uncovered = risks.length - mitigated;
    const critical  = risks.filter((r) => r.severity === "CRITICAL").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS risk signal × AIP skill coverage scan: ${risks.length} active risk signals cross-referenced ` +
          `against ${skills.length} AIP skills (${critical} critical severity risks). ` +
          `${mitigated} signals have at least one matching AIP skill (MITIGATED); ` +
          `${uncovered} signals have zero skill coverage (UNCOVERED). ` +
          `Provide a 2-sentence risk-skill coverage brief — formal British butler tone, ` +
          `first person, highlight the most exposed risk domains lacking AIP skill backing.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Risk signal skill coverage scan complete, sir.").trim();
  } catch {
    return "Risk signal skill coverage analysis unavailable at this time, sir.";
  }
}

// ── severity colour helper ────────────────────────────────────────────────────

function sevStyle(sev) {
  const s = (sev || "MEDIUM").toUpperCase();
  if (s === "CRITICAL") return { background: `${ROSE}22`,   color: ROSE,   border: `1px solid ${ROSE}44` };
  if (s === "HIGH")     return { background: `${AMBER}22`,  color: AMBER,  border: `1px solid ${AMBER}44` };
  if (s === "LOW")      return { background: `${GREEN}22`,  color: GREEN,  border: `1px solid ${GREEN}44` };
  return { background: `${SLATE}22`, color: PURPLE, border: `1px solid ${SLATE}44` };
}

// ── component ─────────────────────────────────────────────────────────────────

export default function RiskSignalAipSkillCoverage() {
  const [open,      setOpen]      = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [rows,      setRows]      = useState([]);
  const [skills,    setSkills]    = useState([]);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const [err,       setErr]       = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [riskRes, skillRes] = await Promise.all([
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
        fetch(`${base}/v1/aip/skill`,        { headers: hdr }),
      ]);
      if (!riskRes.ok || !skillRes.ok) throw new Error("fetch failed");
      const risks = normaliseRisks(await riskRes.json());
      const sk    = normaliseSkills(await skillRes.json());
      setRows(correlate(risks, sk));
      setSkills(sk);
      setErr("");
    } catch (e) {
      setErr(String(e.message ?? e));
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const h = () => setOpen((o) => !o);
    window.addEventListener("jarvis:rsask-toggle", h);
    return () => window.removeEventListener("jarvis:rsask-toggle", h);
  }, []);

  const mitigated = rows.filter((r) => r.mitigated).length;
  const uncovered = rows.length - mitigated;

  const filtered = rows.filter((r) => {
    if (tab === "MITIGATED" && !r.mitigated) return false;
    if (tab === "UNCOVERED" &&  r.mitigated) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!r.title.toLowerCase().includes(s) && !r.category.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true); setBrief("");
    const script = await buildRsaskScript();
    setBrief(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  };

  const S = {
    overlay: {
      position: "fixed", bottom: 56, left: BTN_LEFT, zIndex: 68,
      background: "rgba(10,20,35,0.97)", border: "1px solid #29E7FF44",
      borderRadius: 10, padding: 18, width: 560, maxHeight: "80vh",
      overflowY: "auto", fontFamily: "'JetBrains Mono',monospace",
      color: "#C8D8E8", fontSize: 11,
    },
    btn: {
      position: "fixed", bottom: 18, left: BTN_LEFT, zIndex: 68,
      background: uncovered > 0 ? "rgba(245,158,11,0.18)" : "rgba(10,20,35,0.85)",
      border: `1px solid ${uncovered > 0 ? AMBER : "#29E7FF44"}`,
      borderRadius: 6, color: uncovered > 0 ? AMBER : CYAN,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
      padding: "4px 9px", cursor: "pointer", letterSpacing: 1,
    },
    tile: {
      display: "inline-block", background: "rgba(41,231,255,0.07)",
      border: "1px solid #29E7FF22", borderRadius: 6,
      padding: "5px 10px", margin: "0 6px 6px 0", minWidth: 80,
    },
    tileVal: { fontSize: 17, fontWeight: 700, color: CYAN },
    tileLabel: { fontSize: 9, color: SLATE, letterSpacing: 1 },
    tabBtn: (active) => ({
      background: active ? "rgba(41,231,255,0.15)" : "transparent",
      border: `1px solid ${active ? CYAN : "#29E7FF33"}`,
      borderRadius: 4, color: active ? CYAN : SLATE,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
      padding: "3px 8px", cursor: "pointer", marginRight: 4,
    }),
    row: { borderBottom: "1px solid #29E7FF11", padding: "8px 0", cursor: "pointer" },
    badge: (m) => ({
      display: "inline-block", borderRadius: 3, padding: "1px 5px",
      fontSize: 9, fontWeight: 700, marginLeft: 6,
      background: m ? `${GREEN}22` : `${AMBER}22`,
      color: m ? GREEN : AMBER,
      border: `1px solid ${m ? GREEN : AMBER}44`,
    }),
  };

  return (
    <>
      <button style={S.btn} onClick={() => setOpen((o) => !o)}>
        ◈ RSSC
        {uncovered > 0 && (
          <span style={{
            background: AMBER, color: "#000", borderRadius: 8,
            padding: "0 5px", marginLeft: 5, fontSize: 9, fontWeight: 700,
          }}>{uncovered}</span>
        )}
      </button>

      {open && (
        <div style={S.overlay}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ color: CYAN, fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>
              ◈ RISK SIGNAL × AIP SKILL COVERAGE
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "transparent", border: "none", color: SLATE,
              cursor: "pointer", fontSize: 14,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ marginBottom: 12 }}>
            {[
              { val: rows.length,   label: "RISK SIGNALS" },
              { val: skills.length, label: "AIP SKILLS" },
              { val: mitigated,     label: "MITIGATED", color: GREEN },
              { val: uncovered,     label: "UNCOVERED",  color: AMBER },
            ].map(({ val, label, color }) => (
              <span key={label} style={S.tile}>
                <div style={{ ...S.tileVal, color: color ?? CYAN }}>{val}</div>
                <div style={S.tileLabel}>{label}</div>
              </span>
            ))}
          </div>

          {/* Severity breakdown */}
          <div style={{ marginBottom: 10, fontSize: 10, color: SLATE }}>
            Severity: {rows.filter((r) => r.severity === "CRITICAL").length} CRITICAL
            · {rows.filter((r) => r.severity === "HIGH").length} HIGH
            · {rows.filter((r) => r.severity === "MEDIUM").length} MEDIUM
            · {rows.filter((r) => r.severity === "LOW").length} LOW
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
            {["ALL", "MITIGATED", "UNCOVERED"].map((t) => (
              <button key={t} style={S.tabBtn(tab === t)} onClick={() => setTab(t)}>{t}</button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search risk signals…"
              style={{
                background: "rgba(41,231,255,0.06)", border: "1px solid #29E7FF33",
                borderRadius: 4, color: "#C8D8E8", fontFamily: "'JetBrains Mono',monospace",
                fontSize: 10, padding: "3px 8px", marginLeft: "auto", width: 160,
              }}
            />
          </div>

          {/* Assess button */}
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: "rgba(41,231,255,0.1)", border: "1px solid #29E7FF55",
              borderRadius: 5, color: CYAN, fontFamily: "'JetBrains Mono',monospace",
              fontSize: 10, padding: "4px 12px", cursor: "pointer", marginBottom: 10,
            }}
          >
            {assessing ? "▷ ASSESSING…" : "▶ ASSESS"}
          </button>

          {brief && (
            <div style={{
              background: "rgba(41,231,255,0.06)", border: "1px solid #29E7FF33",
              borderRadius: 6, padding: 10, marginBottom: 10, color: "#C8D8E8",
              fontSize: 10, lineHeight: 1.6,
            }}>
              {brief}
            </div>
          )}

          {err && <div style={{ color: ROSE, fontSize: 10, marginBottom: 8 }}>⚠ {err}</div>}

          {/* Risk signal rows */}
          <div>
            {filtered.length === 0 && (
              <div style={{ color: SLATE, fontSize: 10, padding: "12px 0" }}>No risk signals match filter.</div>
            )}
            {filtered.map((r) => {
              const isExp = expanded === r.id;
              return (
                <div key={r.id} style={S.row} onClick={() => setExpanded(isExp ? null : r.id)}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span style={{ color: "#C8D8E8", fontWeight: 600, flex: 1 }}>{r.title}</span>
                    <span style={S.badge(r.mitigated)}>{r.mitigated ? "MITIGATED" : "UNCOVERED"}</span>
                    {r.severity && (
                      <span style={{ ...sevStyle(r.severity), borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700, marginLeft: 4 }}>
                        {r.severity}
                      </span>
                    )}
                    <span style={{ marginLeft: 8, color: SLATE, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 8, paddingLeft: 4 }}>
                      {r.category && (
                        <div style={{ color: SLATE, fontSize: 10, marginBottom: 4 }}>
                          Category: {r.category}
                        </div>
                      )}
                      {r.desc && (
                        <div style={{ color: SLATE, fontSize: 10, marginBottom: 6 }}>{r.desc}</div>
                      )}
                      {r.matches.length === 0 ? (
                        <div style={{ color: AMBER, fontSize: 10 }}>No AIP skills cover this risk signal.</div>
                      ) : (
                        r.matches.slice(0, 8).map(({ sk, score }) => {
                          const maxScore = r.matches[0].score || 1;
                          const pct = Math.round((score / maxScore) * 100);
                          return (
                            <div key={sk.id} style={{
                              background: "rgba(41,231,255,0.04)", borderRadius: 4,
                              padding: "5px 8px", marginBottom: 4,
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                {sk.category && (
                                  <span style={{
                                    background: `${PURPLE}22`, color: PURPLE,
                                    border: `1px solid ${PURPLE}44`,
                                    borderRadius: 3, padding: "1px 5px",
                                    fontSize: 9, fontWeight: 700,
                                  }}>{sk.category}</span>
                                )}
                                <span style={{ color: "#C8D8E8", fontSize: 10, flex: 1 }}>{sk.name}</span>
                                <span style={{ color: CYAN, fontSize: 10 }}>{score} pts</span>
                              </div>
                              {/* Relevance bar */}
                              <div style={{ height: 3, background: "#29E7FF15", borderRadius: 2 }}>
                                <div style={{
                                  height: 3, borderRadius: 2,
                                  width: `${pct}%`, background: CYAN,
                                }} />
                              </div>
                            </div>
                          );
                        })
                      )}
                      {r.matches.length > 8 && (
                        <div style={{ color: SLATE, fontSize: 9, marginTop: 4 }}>
                          +{r.matches.length - 8} more skills
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
