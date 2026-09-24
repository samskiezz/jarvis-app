/**
 * ContactScenarioMapper — F67
 * /entities/Contact × /v1/scenario/list → keyword-correlates known contacts against
 * threat scenarios to surface ENGAGED (contact whose name/role/org matches a scenario
 * keyword) vs CLEAR (no scenario link found).
 * Voice: "contact scenario"/"csem"/"who handles"/"scenario contacts"/"contact engagement".
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const GRN = "#4ADE80";
const AMB = "#FFBB33";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CSEM_RE =
  /\bcontact\s*scenario\b|\bscenario\s*contact\b|\bcsem\b|\bwho\s*handles?\b|\bwho\s*is\s*in\s*what\s*scenario\b|\bcontact\s*engagement\b|\bscenario\s*people\b|\bperson\s*scenario\b|\bpeople\s*scenario\b|\bcontact\s*readiness\b/i;

export function isCsemQuery(text) {
  return CSEM_RE.test(text || "");
}

async function fetchContacts() {
  const r = await fetch(`${apiBase()}/entities/Contact`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)           ? d
    : Array.isArray(d?.data)        ? d.data
    : Array.isArray(d?.results)     ? d.results
    : Array.isArray(d?.contacts)    ? d.contacts
    : Array.isArray(d?.items)       ? d.items
    : [];
}

async function fetchScenarios() {
  const r = await fetch(`${apiBase()}/v1/scenario/list`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)           ? d
    : Array.isArray(d?.data)        ? d.data
    : Array.isArray(d?.results)     ? d.results
    : Array.isArray(d?.scenarios)   ? d.scenarios
    : Array.isArray(d?.items)       ? d.items
    : [];
}

function contactKeywords(c) {
  return [
    c?.name, c?.full_name, c?.display_name,
    c?.role, c?.title, c?.organisation, c?.organization, c?.company,
    c?.department, c?.tags?.join?.(" "), c?.skills?.join?.(" "),
    c?.bio, c?.summary, c?.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scenarioKeywords(s) {
  return [
    s?.name, s?.title, s?.description, s?.summary,
    s?.type, s?.category, s?.tags?.join?.(" "),
    s?.actors?.join?.(" "), s?.domain,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function correlate(contact, scenarios) {
  const cKw   = contactKeywords(contact);
  const tokens = cKw.split(/\W+/).filter((t) => t.length > 3);
  const matched = scenarios.filter((s) => {
    const sKw     = scenarioKeywords(s);
    const sTokens = sKw.split(/\W+/).filter((t) => t.length > 3);
    return tokens.some((t) => sKw.includes(t)) || sTokens.some((t) => cKw.includes(t));
  });
  return { matched, status: matched.length > 0 ? "ENGAGED" : "CLEAR" };
}

function contactLabel(c) {
  return c?.name || c?.full_name || c?.display_name || "Unknown Contact";
}

function scenarioLabel(s) {
  return s?.name || s?.title || "Unnamed Scenario";
}

export async function buildCsemScript() {
  const [contacts, scenarios] = await Promise.all([fetchContacts(), fetchScenarios()]);
  if (!contacts.length) return "Contact scenario engagement data is unavailable, sir.";
  const rows    = contacts.map((c) => ({ c, ...correlate(c, scenarios) }));
  const engaged = rows.filter((r) => r.status === "ENGAGED");
  const clear   = rows.filter((r) => r.status === "CLEAR");
  const topEngaged = engaged.slice(0, 3).map((r) => contactLabel(r.c)).join(", ");
  return (
    `Contact Scenario Engagement: ${contacts.length} contacts assessed against ${scenarios.length} active scenarios. ` +
    `${engaged.length} ENGAGED, ${clear.length} CLEAR. ` +
    (engaged.length
      ? `Top scenario-linked contacts: ${topEngaged}.`
      : "No contacts currently map to active scenarios, sir.")
  );
}

export default function ContactScenarioMapper() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [filter, setFilter]       = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [loading, setLoading]     = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [contacts, scenarios] = await Promise.all([fetchContacts(), fetchScenarios()]);
      setRows(contacts.map((c) => ({ c, ...correlate(c, scenarios) })));
    } catch {
      // keep stale
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen((v) => { if (!v) refresh(); return !v; });
    window.addEventListener("jarvis:csem-toggle", toggle);
    return () => window.removeEventListener("jarvis:csem-toggle", toggle);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(refresh, 90_000);
    return () => clearInterval(id);
  }, [open, refresh]);

  const engaged = rows.filter((r) => r.status === "ENGAGED");
  const clear   = rows.filter((r) => r.status === "CLEAR");

  const visible = rows.filter((r) => {
    if (filter === "ENGAGED" && r.status !== "ENGAGED") return false;
    if (filter === "CLEAR"   && r.status !== "CLEAR")   return false;
    if (search) {
      const label = contactLabel(r.c).toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  async function assess(row) {
    const cLabel = contactLabel(row.c);
    setAssessing(cLabel);
    const scenNames = row.matched.map((s) => scenarioLabel(s)).join(", ") || "none";
    const prompt =
      `Contact "${cLabel}" is ${row.status} against active scenarios. ` +
      (row.matched.length
        ? `Linked scenarios: ${scenNames}.`
        : "No active scenarios currently match this contact.") +
      " Provide a 2-sentence scenario engagement brief and recommended briefing action.";
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const brief = d?.response || d?.message || d?.content || "Assessment complete.";
      const voice = getActiveVoice?.() ?? "ash";
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: brief, voice }),
      });
    } catch {
      // ignore TTS errors
    }
    setAssessing(null);
  }

  if (!open) {
    const engagedCount = engaged.length;
    return (
      <button
        onClick={() => { setOpen(true); refresh(); }}
        title="Contact × Scenario Engagement Mapper (F67)"
        style={{
          position: "fixed", left: 18520, bottom: 8, zIndex: 75,
          background: "rgba(5,8,13,0.72)", border: `1px solid ${engagedCount > 0 ? GRN : CY}55`,
          borderRadius: 6, padding: "3px 9px", cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 11, color: engagedCount > 0 ? GRN : CY,
          letterSpacing: 1, backdropFilter: "blur(6px)",
        }}
      >
        ◈ CSEM{engagedCount > 0 && <sup style={{ color: GRN, marginLeft: 2 }}>{engagedCount}</sup>}
      </button>
    );
  }

  const statusColor = (s) => s === "ENGAGED" ? GRN : AMB;

  return (
    <div style={{
      position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh",
      background: "rgba(2,5,10,0.88)", zIndex: 9100, display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'JetBrains Mono',monospace",
    }}>
      <div style={{
        width: "min(820px,94vw)", maxHeight: "88vh", overflowY: "auto",
        background: "rgba(8,14,22,0.96)", border: `1px solid ${CY}44`,
        borderRadius: 14, padding: "20px 22px",
        boxShadow: `0 0 60px ${CY}18`,
      }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ color: CY, fontSize: 13, letterSpacing: 3, textShadow: `0 0 12px ${CY}` }}>
            ◈ CONTACT × SCENARIO ENGAGEMENT
          </span>
          {loading && <span style={{ color: CY, fontSize: 10, marginLeft: "auto" }}>refreshing…</span>}
          <button onClick={() => setOpen(false)}
            style={{ marginLeft: loading ? 0 : "auto", background: "none", border: "none",
              cursor: "pointer", color: "#6E8AA0", fontSize: 16 }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          {[
            { label: "CONTACTS", val: rows.length,     col: CY  },
            { label: "ENGAGED",  val: engaged.length,  col: GRN },
            { label: "CLEAR",    val: clear.length,    col: AMB },
          ].map(({ label, val, col }) => (
            <div key={label} style={{
              flex: "1 1 120px", background: "rgba(41,231,255,0.05)",
              border: `1px solid ${col}33`, borderRadius: 8, padding: "8px 12px", textAlign: "center",
            }}>
              <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{val}</div>
              <div style={{ color: "#6E8AA0", fontSize: 10, letterSpacing: 1, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* filter + search */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {["ALL", "ENGAGED", "CLEAR"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                background: filter === f ? `${CY}22` : "none",
                border: `1px solid ${filter === f ? CY : "#6E8AA0"}55`,
                borderRadius: 5, padding: "3px 10px", cursor: "pointer",
                color: filter === f ? CY : "#6E8AA0", fontSize: 11,
              }}>{f}</button>
          ))}
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="search contacts…"
            style={{
              marginLeft: "auto", background: "rgba(41,231,255,0.06)",
              border: `1px solid ${CY}33`, borderRadius: 5,
              padding: "3px 10px", color: CY, fontSize: 11,
              outline: "none", width: 160,
            }}
          />
        </div>

        {/* rows */}
        {visible.length === 0 && (
          <div style={{ color: "#6E8AA0", fontSize: 12, textAlign: "center", padding: 20 }}>
            {loading ? "Loading…" : "No contacts match current filter."}
          </div>
        )}
        {visible.map((row, i) => {
          const label = contactLabel(row.c);
          const isExp = expanded === i;
          const col   = statusColor(row.status);
          const busy  = assessing === label;
          return (
            <div key={i} style={{
              border: `1px solid ${col}33`, borderRadius: 8, marginBottom: 8,
              background: "rgba(8,14,22,0.6)",
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : i)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer" }}
              >
                <span style={{ color: col, fontSize: 10, letterSpacing: 1, minWidth: 80 }}>{row.status}</span>
                <span style={{ color: "#DCEBF5", fontSize: 12, flex: 1 }}>{label}</span>
                {(row.c?.role || row.c?.title) && (
                  <span style={{ color: "#6E8AA0", fontSize: 10 }}>{row.c.role || row.c.title}</span>
                )}
                <span style={{ color: "#6E8AA0", fontSize: 10 }}>
                  {row.matched.length} scenario{row.matched.length !== 1 ? "s" : ""}
                </span>
                <span style={{ color: CY, fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "0 12px 12px" }}>
                  {(row.c?.bio || row.c?.summary || row.c?.notes) && (
                    <div style={{ color: "#6E8AA0", fontSize: 11, marginBottom: 8, fontStyle: "italic" }}>
                      {(row.c.bio || row.c.summary || row.c.notes).slice(0, 180)}
                      {(row.c.bio || row.c.summary || row.c.notes).length > 180 ? "…" : ""}
                    </div>
                  )}
                  {row.matched.length === 0 ? (
                    <div style={{ color: AMB, fontSize: 11, marginBottom: 8 }}>
                      No active scenarios match this contact — CLEAR.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      {row.matched.map((s, j) => (
                        <div key={j} style={{
                          background: "rgba(74,222,128,0.07)", border: `1px solid ${GRN}33`,
                          borderRadius: 6, padding: "5px 10px", fontSize: 11,
                        }}>
                          <div style={{ color: GRN }}>{scenarioLabel(s)}</div>
                          {(s.type || s.category) && (
                            <div style={{ color: "#6E8AA0", fontSize: 10, marginTop: 1 }}>
                              {s.type || s.category}
                            </div>
                          )}
                          {(s.description || s.summary) && (
                            <div style={{ color: "#6E8AA0", marginTop: 2, maxWidth: 260 }}>
                              {(s.description || s.summary).slice(0, 80)}
                              {(s.description || s.summary).length > 80 ? "…" : ""}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => assess(row)}
                    disabled={busy}
                    style={{
                      background: busy ? "rgba(41,231,255,0.05)" : `${CY}18`,
                      border: `1px solid ${CY}44`, borderRadius: 5,
                      padding: "4px 12px", cursor: busy ? "wait" : "pointer",
                      color: CY, fontSize: 11,
                    }}
                  >
                    {busy ? "assessing…" : "▶ ASSESS"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
