/**
 * F81 — Investment × Scenario × Contact Execution Readiness Map (IEXRM)
 * Endpoints: /entities/Investment × /v1/scenario/list × /entities/Contact
 * Classification: FULLY_MAPPED     (scenario + contact both matched)
 *                 SCENARIO_BACKED  (scenario match, no contact)
 *                 CONTACT_COVERED  (contact match, no scenario)
 *                 EXPOSED          (no match in either source)
 */
import { useEffect, useState, useRef } from "react";

const BTN_LEFT = 988_840;
const POLL_MS  = 90_000;
const Z_INDEX  = 144;

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  import.meta.env?.VITE_API_KEY ||
  "";

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

const IEXRM_RE =
  /\b(iexrm|investment\s*(scenario|contact|execution|readiness|coverage)|execution\s*readiness|asset\s*(readiness|execution|coverage)|portfolio\s*(scenario|contact|readiness))\b/i;

export function isIexrmQuery(t) {
  return IEXRM_RE.test(t || "");
}

function normaliseInvestment(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.investment_id || raw._id || String(Math.random()),
    name: raw.name || raw.title || raw.asset_name || "Untitled Investment",
    description: raw.description || raw.summary || raw.notes || "",
    type: raw.type || raw.investment_type || raw.asset_type || "",
    sector: raw.sector || raw.industry || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };
}

function normaliseScenario(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.scenario_id || raw._id || String(Math.random()),
    name: raw.name || raw.title || raw.scenario_name || "Untitled Scenario",
    description: raw.description || raw.summary || raw.details || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };
}

function normaliseContact(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.contact_id || raw._id || String(Math.random()),
    name: raw.name || raw.full_name || raw.display_name || "Unknown Contact",
    role: raw.role || raw.title || raw.position || "",
    org: raw.org || raw.organisation || raw.organization || raw.company || "",
    description: raw.description || raw.bio || raw.notes || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };
}

function tokenize(s) {
  if (!s) return [];
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function scoreMatch(invTokens, item) {
  const itemTokens = tokenize(
    `${item.name} ${item.description || ""} ${(item.tags || []).join(" ")} ${item.type || ""} ${item.sector || ""} ${item.role || ""} ${item.org || ""}`
  );
  if (!invTokens.length || !itemTokens.length) return 0;
  const set = new Set(itemTokens);
  return invTokens.filter((t) => set.has(t)).length;
}

const CY = "#00e5ff";
const RD = "#ff4444";
const AM = "#ffc107";
const GR = "#4ade80";
const OR = "#f97316";

const CLASS_META = {
  FULLY_MAPPED:    { label: "FULLY MAPPED",    color: GR,    desc: "Backed by both a scenario playbook and a responsible contact" },
  SCENARIO_BACKED: { label: "SCENARIO BACKED", color: CY,    desc: "Has a scenario plan, no assigned contact" },
  CONTACT_COVERED: { label: "CONTACT COVERED", color: OR,    desc: "Has a responsible contact, no scenario plan" },
  EXPOSED:         { label: "EXPOSED",         color: "#555", desc: "No scenario or contact coverage — execution gap" },
};

const TABS = ["ALL", "FULLY_MAPPED", "SCENARIO_BACKED", "CONTACT_COVERED", "EXPOSED"];

export async function buildIexrmScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [invRes, scRes, ctRes] = await Promise.allSettled([
    fetch(`${base}/entities/Investment`, { headers }).then((r) => r.json()),
    fetch(`${base}/v1/scenario/list`,    { headers }).then((r) => r.json()),
    fetch(`${base}/entities/Contact`,    { headers }).then((r) => r.json()),
  ]);

  const investments = invRes.status === "fulfilled" ? invRes.value : [];
  const scenarios   = scRes.status  === "fulfilled" ? scRes.value  : [];
  const contacts    = ctRes.status  === "fulfilled" ? ctRes.value  : [];

  const invArr = (Array.isArray(investments) ? investments : investments?.items || investments?.data || []).map(normaliseInvestment).filter(Boolean);
  const scArr  = (Array.isArray(scenarios)   ? scenarios   : scenarios?.items   || scenarios?.data   || []).map(normaliseScenario).filter(Boolean);
  const ctArr  = (Array.isArray(contacts)    ? contacts    : contacts?.items    || contacts?.data    || []).map(normaliseContact).filter(Boolean);

  const counts = { FULLY_MAPPED: 0, SCENARIO_BACKED: 0, CONTACT_COVERED: 0, EXPOSED: 0 };
  for (const inv of invArr) {
    const tok  = tokenize(`${inv.name} ${inv.description} ${inv.type} ${inv.sector} ${inv.tags.join(" ")}`);
    const hasSc = scArr.some((s) => scoreMatch(tok, s) > 0);
    const hasCt = ctArr.some((c) => scoreMatch(tok, c) > 0);
    if (hasSc && hasCt)   counts.FULLY_MAPPED++;
    else if (hasSc)        counts.SCENARIO_BACKED++;
    else if (hasCt)        counts.CONTACT_COVERED++;
    else                   counts.EXPOSED++;
  }

  const readyPct = invArr.length
    ? Math.round((counts.FULLY_MAPPED / invArr.length) * 100)
    : 0;

  return `Investment Execution Readiness Map online, sir. ${invArr.length} investments cross-referenced against ${scArr.length} scenarios and ${ctArr.length} contacts — ${counts.FULLY_MAPPED} investments are fully mapped with both a scenario playbook and a responsible contact, ${counts.SCENARIO_BACKED} have scenario coverage only, ${counts.CONTACT_COVERED} have a contact but no playbook, and ${counts.EXPOSED} investments are completely exposed with no execution coverage whatsoever. Full execution readiness stands at ${readyPct}%.`.trim();
}

export default function InvestmentScenarioContactMap() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [brief, setBrief]         = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [invRes, scRes, ctRes] = await Promise.allSettled([
        fetch(`${base}/entities/Investment`, { headers }).then((r) => r.json()),
        fetch(`${base}/v1/scenario/list`,    { headers }).then((r) => r.json()),
        fetch(`${base}/entities/Contact`,    { headers }).then((r) => r.json()),
      ]);

      const investments = invRes.status === "fulfilled" ? invRes.value : [];
      const scenarios   = scRes.status  === "fulfilled" ? scRes.value  : [];
      const contacts    = ctRes.status  === "fulfilled" ? ctRes.value  : [];

      const invArr = (Array.isArray(investments) ? investments : investments?.items || investments?.data || []).map(normaliseInvestment).filter(Boolean);
      const scArr  = (Array.isArray(scenarios)   ? scenarios   : scenarios?.items   || scenarios?.data   || []).map(normaliseScenario).filter(Boolean);
      const ctArr  = (Array.isArray(contacts)    ? contacts    : contacts?.items    || contacts?.data    || []).map(normaliseContact).filter(Boolean);

      const mapped = invArr.map((inv) => {
        const tok = tokenize(`${inv.name} ${inv.description} ${inv.type} ${inv.sector} ${inv.tags.join(" ")}`);
        const matchedScenarios = scArr
          .map((s) => ({ ...s, score: scoreMatch(tok, s) }))
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score);
        const matchedContacts = ctArr
          .map((c) => ({ ...c, score: scoreMatch(tok, c) }))
          .filter((c) => c.score > 0)
          .sort((a, b) => b.score - a.score);
        const hasSc = matchedScenarios.length > 0;
        const hasCt = matchedContacts.length  > 0;
        const cls =
          hasSc && hasCt ? "FULLY_MAPPED"    :
          hasSc           ? "SCENARIO_BACKED" :
          hasCt           ? "CONTACT_COVERED" :
                            "EXPOSED";
        return { inv, matchedScenarios, matchedContacts, cls };
      });

      setRows(mapped);
    } catch (e) {
      setError(e?.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  useEffect(() => {
    const h = () => setOpen((v) => !v);
    window.addEventListener("jarvis:iexrm-toggle", h);
    return () => window.removeEventListener("jarvis:iexrm-toggle", h);
  }, []);

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const counts = { FULLY_MAPPED: 0, SCENARIO_BACKED: 0, CONTACT_COVERED: 0, EXPOSED: 0 };
      rows.forEach((r) => counts[r.cls]++);
      const readyPct = rows.length
        ? Math.round((counts.FULLY_MAPPED / rows.length) * 100)
        : 0;
      const prompt = `JARVIS investment execution readiness: ${rows.length} investments cross-referenced against scenarios and contacts. ${counts.FULLY_MAPPED} fully mapped, ${counts.SCENARIO_BACKED} scenario-only, ${counts.CONTACT_COVERED} contact-only, ${counts.EXPOSED} completely exposed. Execution readiness ${readyPct}%. Provide a 2-sentence investment readiness gap brief and prioritised actions.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      setBrief(d.answer || "Assessment unavailable.");
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  const counts = { FULLY_MAPPED: 0, SCENARIO_BACKED: 0, CONTACT_COVERED: 0, EXPOSED: 0 };
  rows.forEach((r) => counts[r.cls]++);
  const exposedCount = counts.EXPOSED;

  const filtered = rows.filter((r) => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        r.inv.name.toLowerCase().includes(s) ||
        r.inv.description.toLowerCase().includes(s) ||
        r.inv.type.toLowerCase().includes(s) ||
        r.inv.sector.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const PANEL_STYLE = {
    position: "fixed",
    bottom: 60,
    left: BTN_LEFT,
    zIndex: Z_INDEX,
    width: 520,
    maxHeight: "82vh",
    overflowY: "auto",
    background: "rgba(6,10,18,0.94)",
    border: `1px solid ${CY}44`,
    borderRadius: 12,
    fontFamily: "'JetBrains Mono',monospace",
    color: "#DCEBF5",
    fontSize: 11,
    boxShadow: `0 0 40px ${CY}18`,
    backdropFilter: "blur(10px)",
    padding: "14px 16px",
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Investment × Scenario × Contact Execution Readiness Map (F81)"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: Z_INDEX,
          background: open ? CY : "rgba(6,10,18,0.82)",
          color: open ? "#040810" : CY,
          border: `1px solid ${CY}66`,
          borderRadius: 6,
          padding: "4px 9px",
          fontSize: 10,
          fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: 1,
          cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}
      >
        {exposedCount > 0 && !open && (
          <span style={{
            marginRight: 4,
            background: AM,
            color: "#040810",
            borderRadius: 8,
            padding: "1px 5px",
            fontSize: 9,
          }}>
            {exposedCount}
          </span>
        )}
        ◈ IEXRM
      </button>

      {open && (
        <div style={PANEL_STYLE}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, letterSpacing: 2, fontSize: 12 }}>◈ IEXRM</span>
            <span style={{ color: "#6E8AA0", fontSize: 10, flexGrow: 1 }}>
              Investment × Scenario × Contact Readiness
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14,
            }}>×</button>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {Object.entries(counts).map(([cls, n]) => (
              <div key={cls} style={{
                background: `${CLASS_META[cls].color}18`,
                border: `1px solid ${CLASS_META[cls].color}44`,
                borderRadius: 6,
                padding: "4px 8px",
                textAlign: "center",
              }}>
                <div style={{ color: CLASS_META[cls].color, fontSize: 14, fontWeight: "bold" }}>{n}</div>
                <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 0.5 }}>{CLASS_META[cls].label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? CY : "rgba(41,231,255,0.06)",
                color: tab === t ? "#040810" : CY,
                border: `1px solid ${CY}44`,
                borderRadius: 4,
                padding: "2px 7px",
                fontSize: 9,
                cursor: "pointer",
                letterSpacing: 0.5,
              }}>
                {t === "ALL"             ? `ALL (${rows.length})` :
                 t === "FULLY_MAPPED"    ? `FULLY MAPPED (${counts.FULLY_MAPPED})` :
                 t === "SCENARIO_BACKED" ? `SCENARIO (${counts.SCENARIO_BACKED})` :
                 t === "CONTACT_COVERED" ? `CONTACT (${counts.CONTACT_COVERED})` :
                 `EXPOSED (${counts.EXPOSED})`}
              </button>
            ))}
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search investments…"
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "rgba(41,231,255,0.05)",
              border: `1px solid ${CY}33`,
              borderRadius: 5,
              padding: "4px 8px",
              color: "#DCEBF5",
              fontSize: 10,
              marginBottom: 8,
              outline: "none",
              fontFamily: "inherit",
            }}
          />

          {loading && <div style={{ color: "#6E8AA0", fontSize: 10, marginBottom: 6 }}>◌ loading…</div>}
          {error   && <div style={{ color: RD,        fontSize: 10, marginBottom: 6 }}>✗ {error}</div>}

          <div style={{ maxHeight: "48vh", overflowY: "auto" }}>
            {filtered.map((row) => {
              const { inv, matchedScenarios, matchedContacts, cls } = row;
              const meta  = CLASS_META[cls];
              const isExp = expanded === inv.id;
              return (
                <div key={inv.id} style={{
                  borderBottom: `1px solid ${CY}18`,
                  paddingBottom: 8,
                  marginBottom: 8,
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : inv.id)}
                    style={{ cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 8 }}
                  >
                    <div style={{
                      minWidth: 100,
                      padding: "2px 5px",
                      background: `${meta.color}18`,
                      border: `1px solid ${meta.color}55`,
                      borderRadius: 4,
                      color: meta.color,
                      fontSize: 8,
                      letterSpacing: 0.5,
                      textAlign: "center",
                    }}>
                      {meta.label}
                    </div>
                    <div style={{ flexGrow: 1, minWidth: 0 }}>
                      <div style={{ color: "#DCEBF5", fontSize: 11, fontWeight: "bold", wordBreak: "break-word" }}>
                        {inv.name}
                      </div>
                      {(inv.type || inv.sector) && (
                        <span style={{ color: "#6E8AA0", fontSize: 9 }}>
                          {[inv.type, inv.sector].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      <div style={{ color: "#4a6a80", fontSize: 9, marginTop: 2, display: "flex", gap: 8 }}>
                        <span>scenarios: {matchedScenarios.length}</span>
                        <span>contacts: {matchedContacts.length}</span>
                      </div>
                    </div>
                    <span style={{ color: CY, fontSize: 10, marginLeft: "auto", flexShrink: 0 }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 8, paddingLeft: 10 }}>
                      {matchedScenarios.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            SCENARIOS ({matchedScenarios.length})
                          </div>
                          {matchedScenarios.slice(0, 4).map((s) => (
                            <div key={s.id} style={{
                              background: `${CY}10`,
                              border: `1px solid ${CY}33`,
                              borderRadius: 5,
                              padding: "4px 7px",
                              marginBottom: 3,
                            }}>
                              <div style={{ color: "#DCEBF5", fontSize: 10 }}>{s.name}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                                <div style={{
                                  flexGrow: 1, height: 3, background: "#1a2a3a",
                                  borderRadius: 2, overflow: "hidden",
                                }}>
                                  <div style={{
                                    width: `${Math.min(100, s.score * 20)}%`,
                                    height: "100%", background: CY, borderRadius: 2,
                                  }} />
                                </div>
                                <span style={{ color: CY, fontSize: 8 }}>relevance {s.score}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {matchedContacts.length > 0 && (
                        <div>
                          <div style={{ color: OR, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            CONTACTS ({matchedContacts.length})
                          </div>
                          {matchedContacts.slice(0, 4).map((c) => (
                            <div key={c.id} style={{
                              background: `${OR}10`,
                              border: `1px solid ${OR}33`,
                              borderRadius: 5,
                              padding: "4px 7px",
                              marginBottom: 3,
                            }}>
                              <div style={{ color: "#DCEBF5", fontSize: 10 }}>{c.name}</div>
                              {(c.role || c.org) && (
                                <div style={{ color: OR, fontSize: 8, marginTop: 1 }}>
                                  {[c.role, c.org].filter(Boolean).join(" · ")}
                                </div>
                              )}
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                                <div style={{
                                  flexGrow: 1, height: 3, background: "#1a2a3a",
                                  borderRadius: 2, overflow: "hidden",
                                }}>
                                  <div style={{
                                    width: `${Math.min(100, c.score * 20)}%`,
                                    height: "100%", background: OR, borderRadius: 2,
                                  }} />
                                </div>
                                <span style={{ color: OR, fontSize: 8 }}>relevance {c.score}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {matchedScenarios.length === 0 && matchedContacts.length === 0 && (
                        <div style={{ color: "#4a6a80", fontSize: 10 }}>
                          No scenarios or contacts match this investment.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && !loading && (
              <div style={{ color: "#4a6a80", fontSize: 10 }}>No investments match the current filter.</div>
            )}
          </div>

          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={assess} disabled={assessing || rows.length === 0} style={{
              background: assessing ? "#1a2a3a" : `${CY}18`,
              border: `1px solid ${CY}55`,
              borderRadius: 5,
              color: CY,
              padding: "4px 10px",
              fontSize: 10,
              cursor: rows.length === 0 ? "default" : "pointer",
              fontFamily: "inherit",
              letterSpacing: 0.5,
            }}>
              {assessing ? "◌ assessing…" : "▶ ASSESS READINESS"}
            </button>
            <button onClick={load} style={{
              background: "none",
              border: `1px solid ${CY}33`,
              borderRadius: 5,
              color: "#6E8AA0",
              padding: "4px 8px",
              fontSize: 9,
              cursor: "pointer",
              fontFamily: "inherit",
            }}>
              ↻
            </button>
          </div>

          {brief && (
            <div style={{
              marginTop: 8,
              background: `${CY}0a`,
              border: `1px solid ${CY}33`,
              borderRadius: 6,
              padding: "7px 9px",
              color: "#DCEBF5",
              fontSize: 10,
              lineHeight: 1.5,
            }}>
              {brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
