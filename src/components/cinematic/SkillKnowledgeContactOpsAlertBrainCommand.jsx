/**
 * F165 Skill × Knowledge × Contact × Ops Alert × Brain
 * Capability Intelligence Command — ◈ SKCOBR
 *
 * Fetches: /v1/aip/skill + /knowledge/ + /entities/Contact
 *          + /v1/ops/alerts + /v1/cinematic/brain
 * Keyword-matches each skill against knowledge articles, contacts,
 * ops alerts, and brain nodes to classify:
 *   COMMANDED — matched all 4 supporting sources (fully grounded capability)
 *   CAPABLE   — matched 2–3 sources
 *   PARTIAL   — matched 1 source
 *   BLIND     — zero matches (isolated skills with no knowledge article,
 *               no contact owner, no ops alert, no brain model — capability blind spots)
 * Red pulse on BLIND count.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CYAN  = "#29E7FF";
const GREEN = "#00FF88";
const AMBER = "#FFB347";
const RED   = "#FF3B6B";
const DIM   = "#566878";

const CLS_COLOR = { COMMANDED: GREEN, CAPABLE: CYAN, PARTIAL: AMBER, BLIND: RED };
const CLS_ORDER = { COMMANDED: 4, CAPABLE: 3, PARTIAL: 2, BLIND: 1 };

const REFRESH_MS = 90_000;

const SKCOBR_RE = /\b(skcobr|skill.*knowledge.*contact|skill.*brain.*command|skill.*ops.*alert.*brain|capability.*intelligence.*command|capability.*command|blind.*skill|skill.*blind.?spot|skill.*capability.*gap|capability.*blind|skill.*coverage|skill.*brain.*coverage|commanded.*skill|skill.*commanded)\b/i;

export function isSkcobrQuery(q) { return SKCOBR_RE.test(q || ""); }

export function buildSkcobrScript(rows) {
  const total     = rows.length;
  const commanded = rows.filter(r => r.cls === "COMMANDED").length;
  const blind     = rows.filter(r => r.cls === "BLIND").length;
  return (
    `Capability Intelligence Command: ${total} skill${total !== 1 ? "s" : ""} assessed across knowledge articles, contacts, ops alerts, and brain nodes. ` +
    `${commanded} fully commanded (knowledge grounding, contact owner, ops alert coverage, and brain model all confirmed). ` +
    (blind > 0
      ? `${blind} blind — no knowledge article, no contact, no ops alert, no brain model. These capabilities are ungrounded blind spots with zero intelligence backing.`
      : "No blind capabilities detected — all skills have full intelligence command coverage.")
  );
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  const bToks = new Set(tokens(bStr));
  return aToks.some(t => bToks.has(t));
}

function normalizeArray(raw) {
  return Array.isArray(raw)                    ? raw
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.items)                ? raw.items
    : Array.isArray(raw?.results)              ? raw.results
    : Array.isArray(raw?.skills)               ? raw.skills
    : Array.isArray(raw?.articles)             ? raw.articles
    : Array.isArray(raw?.contacts)             ? raw.contacts
    : Array.isArray(raw?.alerts)               ? raw.alerts
    : Array.isArray(raw?.nodes)                ? raw.nodes
    : Array.isArray(raw?.brain_nodes)          ? raw.brain_nodes
    : [];
}

async function fetcher(path) {
  try {
    const r = await fetch(`${apiBase()}${path}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

function classifySkill(skill, knowledge, contacts, opsAlerts, brainNodes) {
  const sText = [
    skill.name, skill.title, skill.description,
    skill.category, skill.type, skill.tags,
    skill.id, skill.domain,
  ].filter(Boolean).join(" ");
  const aToks = tokens(sText);

  const matchedKnowledge = knowledge.filter(k =>
    overlaps(aToks, [k.title, k.name, k.summary, k.category, k.tags, k.content, k.description].join(" "))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(aToks, [c.name, c.first_name, c.last_name, c.org, c.organisation, c.role, c.tags, c.expertise].join(" "))
  );
  const matchedAlerts = opsAlerts.filter(a =>
    overlaps(aToks, [a.title, a.name, a.message, a.description, a.category, a.type, a.severity].join(" "))
  );
  const matchedBrain = brainNodes.filter(b =>
    overlaps(aToks, [b.label, b.id, b.name, b.type, b.category, b.description].join(" "))
  );

  const sources = [
    matchedKnowledge.length > 0,
    matchedContacts.length > 0,
    matchedAlerts.length > 0,
    matchedBrain.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 4)      cls = "COMMANDED";
  else if (sources >= 2)  cls = "CAPABLE";
  else if (sources === 1) cls = "PARTIAL";
  else                    cls = "BLIND";

  return { skill, cls, matchedKnowledge, matchedContacts, matchedAlerts, matchedBrain };
}

export default function SkillKnowledgeContactOpsAlertBrainCommand() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [filter, setFilter]       = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [skillsRaw, knowledgeRaw, contactsRaw, alertsRaw, brainRaw] = await Promise.all([
        fetcher("/v1/aip/skill"),
        fetcher("/knowledge/"),
        fetcher("/entities/Contact"),
        fetcher("/v1/ops/alerts"),
        fetcher("/v1/cinematic/brain"),
      ]);

      const skills     = normalizeArray(skillsRaw);
      const knowledge  = normalizeArray(knowledgeRaw);
      const contacts   = normalizeArray(contactsRaw);
      const opsAlerts  = normalizeArray(alertsRaw);
      const brainNodes = normalizeArray(brainRaw?.nodes ?? brainRaw);

      const built = skills.map(s =>
        classifySkill(s, knowledge, contacts, opsAlerts, brainNodes)
      );
      built.sort((a, b) => (CLS_ORDER[a.cls] || 0) - (CLS_ORDER[b.cls] || 0));
      setRows(built);
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:skcobr-toggle", toggle);
    return () => window.removeEventListener("jarvis:skcobr-toggle", toggle);
  }, []);

  const blindCount = rows.filter(r => r.cls === "BLIND").length;
  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const label = (r.skill?.name || r.skill?.title || r.skill?.id || "").toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildSkcobrScript(rows);
      const resp = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await resp.json();
      const text = d.response || d.answer || d.message || script;
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text }),
      });
    } catch { /* non-fatal */ }
    finally { setAssessing(false); }
  }, [assessing, rows]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Skill × Knowledge × Contact × Ops Alert × Brain — Capability Intelligence Command"
        style={{
          position: "fixed", left: 140760, bottom: 8, zIndex: 262,
          background: "rgba(0,20,40,0.82)", border: `1px solid ${blindCount > 0 ? RED : CYAN}`,
          color: blindCount > 0 ? RED : CYAN, borderRadius: 4, padding: "3px 7px",
          fontSize: 10, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: blindCount > 0 ? `0 0 6px ${RED}` : "none",
          animation: blindCount > 0 ? "pulse-red 1.4s infinite" : "none",
        }}
      >
        ◈ SKCOBR{blindCount > 0 ? ` — ${blindCount} BLIND` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9262,
      background: "rgba(0,8,20,0.96)", display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CYAN, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        borderBottom: `1px solid ${CYAN}22`, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ◈ SKCOBR — CAPABILITY INTELLIGENCE COMMAND
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          Skill × Knowledge × Contact × Ops Alert × Brain (5-source)
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
          {rows.length} skills ·{" "}
          {blindCount > 0
            ? <span style={{ color: RED, fontWeight: 700 }}>{blindCount} BLIND</span>
            : <span style={{ color: GREEN }}>0 blind</span>}
        </span>
        <button onClick={assess} disabled={assessing || rows.length === 0}
          style={{ background: "none", border: `1px solid ${CYAN}`, color: CYAN,
            borderRadius: 3, padding: "2px 10px", fontSize: 11, cursor: "pointer" }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: DIM,
            fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, padding: "8px 16px", flexShrink: 0,
        borderBottom: `1px solid ${CYAN}11` }}>
        {["ALL", "COMMANDED", "CAPABLE", "PARTIAL", "BLIND"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              background: filter === f ? `${CLS_COLOR[f] || CYAN}22` : "none",
              border: `1px solid ${filter === f ? (CLS_COLOR[f] || CYAN) : DIM}`,
              color: filter === f ? (CLS_COLOR[f] || CYAN) : DIM,
              borderRadius: 3, padding: "2px 8px", fontSize: 10, cursor: "pointer",
            }}>
            {f}{f !== "ALL" ? ` (${rows.filter(r => r.cls === f).length})` : ` (${rows.length})`}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search skills…"
          style={{ marginLeft: "auto", background: "rgba(255,255,255,0.05)",
            border: `1px solid ${CYAN}33`, color: CYAN, borderRadius: 3,
            padding: "2px 8px", fontSize: 10, outline: "none", width: 160 }}
        />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
        {loading && <div style={{ color: DIM, fontSize: 11, padding: 8 }}>Loading…</div>}
        {error   && <div style={{ color: RED, fontSize: 11, padding: 8 }}>Error: {error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 11, padding: 8 }}>No skills match current filter.</div>
        )}
        {visible.map((row, i) => {
          const skillLabel = row.skill?.name || row.skill?.title || row.skill?.id || `skill-${i}`;
          const skillScore = row.skill?.score ?? row.skill?.confidence ?? row.skill?.level ?? null;
          const isExp = expanded[i];
          return (
            <div key={i} style={{ marginBottom: 4 }}>
              <div
                onClick={() => setExpanded(p => ({ ...p, [i]: !p[i] }))}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 8px", borderRadius: 3, cursor: "pointer",
                  background: isExp ? "rgba(41,231,255,0.06)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${CLS_COLOR[row.cls] || CYAN}33`,
                }}
              >
                <span style={{ fontSize: 9, color: CLS_COLOR[row.cls] || CYAN,
                  border: `1px solid ${CLS_COLOR[row.cls] || CYAN}`,
                  borderRadius: 2, padding: "1px 4px", minWidth: 64, textAlign: "center" }}>
                  {row.cls}
                </span>
                <span style={{ fontSize: 11, flex: 1, color: CYAN }}>{skillLabel}</span>
                {skillScore !== null && skillScore !== undefined && (
                  <span style={{ fontSize: 9, color: DIM,
                    border: `1px solid ${DIM}55`, borderRadius: 2, padding: "1px 4px" }}>
                    score:{typeof skillScore === "number" ? skillScore.toFixed(2) : skillScore}
                  </span>
                )}
                <span style={{ fontSize: 10, color: DIM }}>
                  {row.matchedKnowledge.length}k · {row.matchedContacts.length}c ·{" "}
                  {row.matchedAlerts.length}a · {row.matchedBrain.length}b
                </span>
                <span style={{ fontSize: 10, color: DIM }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "6px 12px 8px 20px", fontSize: 10,
                  borderLeft: `2px solid ${CLS_COLOR[row.cls] || CYAN}44`, marginLeft: 8 }}>

                  {/* Knowledge articles */}
                  {row.matchedKnowledge.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>KNOWLEDGE ARTICLES</div>
                      {row.matchedKnowledge.slice(0, 5).map((k, ki) => (
                        <div key={ki} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{k.title || k.name || `article-${ki}`}</span>
                          {(k.category || k.type) && (
                            <span style={{ fontSize: 8, color: DIM,
                              border: `1px solid ${DIM}55`, borderRadius: 2, padding: "0 3px" }}>
                              {k.category || k.type}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Contacts */}
                  {row.matchedContacts.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>CONTACTS</div>
                      {row.matchedContacts.slice(0, 5).map((c, ci) => (
                        <div key={ci} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{c.name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || `contact-${ci}`}</span>
                          {(c.role || c.title) && (
                            <span style={{ fontSize: 8, color: DIM,
                              border: `1px solid ${DIM}55`, borderRadius: 2, padding: "0 3px" }}>
                              {c.role || c.title}
                            </span>
                          )}
                          {(c.org || c.organisation || c.organization) && (
                            <span style={{ fontSize: 8, color: DIM,
                              border: `1px solid ${DIM}55`, borderRadius: 2, padding: "0 3px" }}>
                              {c.org || c.organisation || c.organization}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ops Alerts */}
                  {row.matchedAlerts.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>OPS ALERTS</div>
                      {row.matchedAlerts.slice(0, 5).map((a, ai) => (
                        <div key={ai} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{a.title || a.name || a.message || `alert-${ai}`}</span>
                          {(a.severity || a.priority || a.level) && (
                            <span style={{ fontSize: 8,
                              color: (a.severity || a.priority || "").toLowerCase().includes("crit") ||
                                     (a.severity || a.priority || "").toLowerCase().includes("high") ? RED : AMBER,
                              border: `1px solid ${(a.severity || a.priority || "").toLowerCase().includes("crit") ||
                                (a.severity || a.priority || "").toLowerCase().includes("high") ? RED : AMBER}55`,
                              borderRadius: 2, padding: "0 3px" }}>
                              {a.severity || a.priority || a.level}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Brain nodes */}
                  {row.matchedBrain.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>BRAIN NODES</div>
                      {row.matchedBrain.slice(0, 5).map((b, bi) => (
                        <div key={bi} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{b.label || b.id || b.name || `brain-${bi}`}</span>
                          {b.type && (
                            <span style={{ fontSize: 8, color: DIM,
                              border: `1px solid ${DIM}55`, borderRadius: 2, padding: "0 3px" }}>
                              {b.type}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {row.matchedKnowledge.length === 0 && row.matchedContacts.length === 0 &&
                   row.matchedAlerts.length === 0 && row.matchedBrain.length === 0 && (
                    <div style={{ color: RED, fontStyle: "italic" }}>
                      No knowledge article, contact, ops alert, or brain model matched — capability is blind with zero intelligence command backing.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: "6px 16px", borderTop: `1px solid ${CYAN}22`,
        fontSize: 10, color: DIM, flexShrink: 0 }}>
        Skill × Knowledge × Contact × Ops Alert × Brain · auto-refresh 90s ·{" "}
        {rows.filter(r => r.cls === "COMMANDED").length} commanded ·{" "}
        {rows.filter(r => r.cls === "CAPABLE").length} capable ·{" "}
        {rows.filter(r => r.cls === "PARTIAL").length} partial ·{" "}
        <span style={{ color: blindCount > 0 ? RED : DIM }}>{blindCount} blind</span>
      </div>
    </div>
  );
}
