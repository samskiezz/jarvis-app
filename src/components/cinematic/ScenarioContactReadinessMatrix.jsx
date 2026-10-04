/**
 * ScenarioContactReadinessMatrix — F71 (SCRMX)
 * ◈ SCRMX button (left:984360, bottom:8, zIndex:135)
 * Parallel-fetches /v1/scenario/list + /entities/Contact every 90 s.
 * Keyword-correlates each scenario name/description against contact
 * name/role/org/tags to classify:
 *   CONTACT_ASSIGNED  — ≥1 matching contact found
 *   UNASSIGNED        — no contact coverage (readiness gap)
 * Amber badge on unassigned count.
 * Filter tabs ALL / CONTACT_ASSIGNED / UNASSIGNED + text search.
 * Expand scenario → matched contact cards with role badge + relevance bar.
 * ▶ ASSESS READINESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Voice triggers: "scrmx / scenario contact / contact readiness /
 *   unassigned scenario / scenario staffing / readiness matrix /
 *   who covers scenario / scenario coverage contact"
 * jarvis:scrmx-toggle event; 90-s auto-refresh.
 */
import { useEffect, useState, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AM = "#F59E0B";
const GR = "#10B981";
const RD = "#EF4444";
const PU = "#A78BFA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SCRMX_RE =
  /\bscrmx\b|\bscenario.contact|\bcontact.readiness|\bunassigned.scenario|\bscenario.staffing|\breadiness.matrix|\bwho.covers.scenario|\bscenario.coverage.contact|\bscenario.assign|\bcontact.assign.*scenario|\bscenario.contact.cover/i;

export function isScrmxQuery(text) {
  return SCRMX_RE.test(text || "");
}

function tokenise(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

const STOP = new Set([
  "the", "and", "for", "are", "was", "were", "has", "have", "had",
  "not", "but", "with", "this", "that", "from", "will", "can",
  "its", "any", "all", "new", "our", "your", "their", "about",
]);

function relevance(scenario, contact) {
  const scenTokens = new Set(
    tokenise(
      `${scenario.name || ""} ${scenario.description || ""} ${(scenario.tags || []).join(" ")} ${scenario.type || ""}`
    ).filter((t) => !STOP.has(t))
  );
  const contactTokens = tokenise(
    `${contact.name || ""} ${contact.role || ""} ${contact.org || ""} ${(contact.tags || []).join(" ")} ${contact.email || ""}`
  ).filter((t) => !STOP.has(t));

  if (!scenTokens.size || !contactTokens.length) return 0;
  const matches = contactTokens.filter((t) => scenTokens.has(t)).length;
  return Math.round((matches / Math.max(scenTokens.size, 1)) * 100);
}

export async function buildScrmxScript() {
  const base = apiBase();
  const [scenRes, contactRes] = await Promise.all([
    fetch(`${base}/v1/scenario/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    fetch(`${base}/entities/Contact`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
  ]);
  const scenData = await scenRes.json();
  const contactData = await contactRes.json();
  const scenarios = Array.isArray(scenData) ? scenData : (scenData.items || scenData.data || scenData.scenarios || []);
  const contacts = Array.isArray(contactData) ? contactData : (contactData.items || contactData.data || []);
  const assigned = scenarios.filter((s) =>
    contacts.some((c) => relevance(s, c) > 0)
  ).length;
  const unassigned = scenarios.length - assigned;
  return `Scenario Contact Readiness Matrix loaded, sir. Of ${scenarios.length} operational scenarios, ${assigned} have at least one contact assigned, while ${unassigned} are unassigned — representing critical staffing gaps that could compromise operational readiness.`;
}

export default function ScenarioContactReadinessMatrix() {
  const [open, setOpen] = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState("");
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    try {
      const base = apiBase();
      const [sRes, cRes] = await Promise.all([
        fetch(`${base}/v1/scenario/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/Contact`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const sData = await sRes.json();
      const cData = await cRes.json();
      setScenarios(Array.isArray(sData) ? sData : (sData.items || sData.data || sData.scenarios || []));
      setContacts(Array.isArray(cData) ? cData : (cData.items || cData.data || []));
    } catch {
      // silently retain prior state
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:scrmx-toggle", onToggle);
    return () => window.removeEventListener("jarvis:scrmx-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const enriched = scenarios.map((s) => {
    const matched = contacts
      .map((c) => ({ ...c, score: relevance(s, c) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...s, matched, status: matched.length > 0 ? "CONTACT_ASSIGNED" : "UNASSIGNED" };
  });

  const assigned = enriched.filter((s) => s.status === "CONTACT_ASSIGNED").length;
  const unassigned = enriched.filter((s) => s.status === "UNASSIGNED").length;

  const visible = enriched
    .filter((s) => {
      if (filter === "CONTACT_ASSIGNED") return s.status === "CONTACT_ASSIGNED";
      if (filter === "UNASSIGNED") return s.status === "UNASSIGNED";
      return true;
    })
    .filter((s) =>
      !search ||
      (s.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (s.description || "").toLowerCase().includes(search.toLowerCase()) ||
      (s.type || "").toLowerCase().includes(search.toLowerCase())
    );

  async function assess() {
    setAssessing(true);
    try {
      const base = apiBase();
      const context = `Scenarios: ${scenarios.length}. Contacts: ${contacts.length}. Assigned: ${assigned}. Unassigned (gaps): ${unassigned}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Assess scenario contact readiness. ${context} Which unassigned scenarios represent the highest operational risk?` }),
      });
      const d = await r.json();
      const text = (d.answer || "").trim();
      setBrief(text);
      if (text) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  function roleColor(role) {
    if (!role) return CY;
    const r = role.toLowerCase();
    if (r.includes("lead") || r.includes("head") || r.includes("director")) return PU;
    if (r.includes("analyst") || r.includes("intel")) return CY;
    if (r.includes("ops") || r.includes("engineer")) return GR;
    if (r.includes("risk") || r.includes("threat")) return RD;
    return AM;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Scenario × Contact Readiness Matrix (SCRMX)"
        style={{
          position: "fixed", left: 984360, bottom: 8, zIndex: 135,
          background: "rgba(5,8,13,0.75)", border: `1px solid ${AM}`,
          color: AM, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
          letterSpacing: 1,
        }}
      >
        ◈ SCRMX{unassigned > 0 && (
          <span style={{ marginLeft: 5, background: AM, color: "#000", borderRadius: 3, padding: "1px 4px", fontSize: 9 }}>
            {unassigned}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh",
      background: "rgba(0,0,0,0.82)", zIndex: 135, display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'JetBrains Mono',monospace",
    }}>
      <div style={{
        background: "rgba(8,14,22,0.97)", border: `1px solid ${AM}44`,
        borderRadius: 14, padding: "20px 24px", width: "min(820px,94vw)",
        maxHeight: "88vh", overflowY: "auto", boxShadow: `0 0 60px ${AM}22`,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <span style={{ color: AM, fontWeight: 700, letterSpacing: 3, fontSize: 13 }}>◈ SCRMX</span>
            <span style={{ color: "#607080", fontSize: 10, marginLeft: 10 }}>Scenario × Contact Readiness Matrix</span>
          </div>
          <button onClick={() => setOpen(false)} style={{ color: "#607080", background: "none", border: "none", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          {[
            { label: "SCENARIOS", val: scenarios.length, c: CY },
            { label: "CONTACTS", val: contacts.length, c: CY },
            { label: "ASSIGNED", val: assigned, c: GR },
            { label: "UNASSIGNED", val: unassigned, c: AM },
          ].map(({ label, val, c }) => (
            <div key={label} style={{
              flex: "1 1 130px", background: "rgba(255,255,255,0.03)", border: `1px solid ${c}33`,
              borderRadius: 8, padding: "8px 12px", textAlign: "center",
            }}>
              <div style={{ color: c, fontSize: 20, fontWeight: 700 }}>{val}</div>
              <div style={{ color: "#607080", fontSize: 9, letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Coverage bar */}
        {scenarios.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#607080", marginBottom: 4 }}>
              <span>READINESS COVERAGE</span>
              <span>{Math.round((assigned / scenarios.length) * 100)}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
              <div style={{
                height: "100%", borderRadius: 2,
                width: `${Math.round((assigned / scenarios.length) * 100)}%`,
                background: assigned / scenarios.length > 0.7 ? GR : assigned / scenarios.length > 0.4 ? AM : RD,
              }} />
            </div>
          </div>
        )}

        {/* Filter + Search */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          {["ALL", "CONTACT_ASSIGNED", "UNASSIGNED"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              background: filter === f ? AM : "rgba(255,255,255,0.04)",
              color: filter === f ? "#000" : "#607080",
              border: `1px solid ${filter === f ? AM : "rgba(255,255,255,0.1)"}`,
              borderRadius: 4, padding: "3px 10px", fontSize: 10, cursor: "pointer", letterSpacing: 1,
            }}>{f}</button>
          ))}
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="search scenarios…"
            style={{
              flex: 1, minWidth: 160, background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4,
              color: "#DCEBF5", padding: "3px 8px", fontSize: 10,
            }}
          />
          <button onClick={() => { setAssessing(true); assess(); }} disabled={assessing} style={{
            background: assessing ? "rgba(255,255,255,0.04)" : AM, color: assessing ? "#607080" : "#000",
            border: `1px solid ${AM}`, borderRadius: 4, padding: "3px 12px", fontSize: 10,
            cursor: assessing ? "default" : "pointer", letterSpacing: 1,
          }}>
            {assessing ? "…" : "▶ ASSESS READINESS"}
          </button>
        </div>

        {brief && (
          <div style={{
            background: "rgba(247,179,11,0.07)", border: `1px solid ${AM}44`,
            borderRadius: 6, padding: "8px 12px", marginBottom: 12, color: "#DCEBF5", fontSize: 11,
          }}>{brief}</div>
        )}

        {loading && <div style={{ color: "#607080", fontSize: 11, textAlign: "center", padding: 20 }}>loading…</div>}

        {/* Scenario list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((s) => {
            const isExp = expanded === (s.id || s.name);
            const borderC = s.status === "CONTACT_ASSIGNED" ? GR : AM;
            return (
              <div key={s.id || s.name} style={{
                background: "rgba(255,255,255,0.03)", border: `1px solid ${borderC}33`,
                borderRadius: 8, overflow: "hidden",
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : (s.id || s.name))}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer" }}
                >
                  <span style={{
                    fontSize: 9, letterSpacing: 1, padding: "2px 6px", borderRadius: 3,
                    background: s.status === "CONTACT_ASSIGNED" ? `${GR}22` : `${AM}22`,
                    color: s.status === "CONTACT_ASSIGNED" ? GR : AM,
                    border: `1px solid ${borderC}44`,
                  }}>{s.status}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#DCEBF5", fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.name || "Unnamed Scenario"}
                    </div>
                    <div style={{ color: "#607080", fontSize: 10 }}>
                      {s.type || "scenario"}{s.description ? ` · ${String(s.description).slice(0, 60)}…` : ""}
                    </div>
                  </div>
                  <span style={{ color: "#607080", fontSize: 10 }}>{s.matched.length} contact{s.matched.length !== 1 ? "s" : ""}</span>
                  <span style={{ color: "#607080", fontSize: 12 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ padding: "0 14px 12px" }}>
                    {s.matched.length === 0 ? (
                      <div style={{ color: AM, fontSize: 11, padding: "8px 0" }}>
                        ⚠ No contacts assigned to this scenario — readiness gap.
                      </div>
                    ) : (
                      s.matched.map((c) => (
                        <div key={c.id || c.name} style={{
                          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                          borderRadius: 6, padding: "8px 12px", marginBottom: 6,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{
                              fontSize: 9, padding: "1px 5px", borderRadius: 3,
                              background: `${roleColor(c.role)}22`, color: roleColor(c.role),
                              border: `1px solid ${roleColor(c.role)}44`,
                            }}>{c.role || "CONTACT"}</span>
                            <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {c.name || "Unnamed Contact"}
                            </span>
                            {c.org && <span style={{ color: "#607080", fontSize: 9 }}>{c.org}</span>}
                            <span style={{ color: "#607080", fontSize: 9 }}>score {c.score}</span>
                          </div>
                          <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                            <div style={{ height: "100%", borderRadius: 2, width: `${Math.min(c.score, 100)}%`, background: roleColor(c.role) }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!loading && visible.length === 0 && (
          <div style={{ color: "#607080", fontSize: 11, textAlign: "center", padding: 20 }}>
            No scenarios match the current filter.
          </div>
        )}

        <div style={{ marginTop: 14, fontSize: 9, color: "#607080", textAlign: "right" }}>
          auto-refresh 90s · {scenarios.length} scenarios · {contacts.length} contacts
        </div>
      </div>
    </div>
  );
}
