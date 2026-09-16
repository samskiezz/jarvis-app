/**
 * ContactScenarioNexus — F494
 * "JARVIS, contact scenario / scenario contact / cscnx / who has scenarios /
 *  contact simulation / which contacts have scenarios / scenario for contacts"
 * Cross-references /entities/Contact + /v1/scenario/list.
 * Keyword-matches contacts against active scenarios by name/description/tags.
 * KIND-badged; click to expand matched scenarios; ▶ ASSESS → /v1/jarvis/agent/chat + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const ORG = "#FF8C42";
const PRP = "#A855F7";
const GRN = "#00E5A0";
const DIM = "#8899AA";
const AMB = "#FFD700";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 90_000;

const CSCNX_RE =
  /\bcontact.?scenario\b|\bscenario.?contact\b|\bcscnx\b|\bwho.has.scenarios\b|\bcontact.simulation\b|\bsimulation.contact\b|\bscenario.for.contacts\b|\bcontact.coverage\b|\bcontact.forecast\b|\bcontact.scenario.nexus\b/i;

export function isCscnxQuery(text) {
  return CSCNX_RE.test(text || "");
}

const KIND_COLOR = { THREAT: ORG, RISK: ORG, FINANCIAL: GRN, INTEL: CY, OPERATIONS: PRP };
function kindColor(kind) {
  const k = (kind || "").toUpperCase();
  return KIND_COLOR[k] || AMB;
}

function normaliseContacts(data) {
  if (!data) return [];
  const raw = data.contacts || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((c, i) => ({
    id:   c.id || `c-${i}`,
    name: (c.name || c.full_name || c.display_name || `Contact ${i + 1}`).trim(),
    tags: [
      ...(c.tags || []),
      ...(c.labels || []),
      c.organization, c.org, c.company, c.role, c.title,
    ].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function normaliseScenarios(data) {
  if (!data) return [];
  const raw = data.scenarios || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:          s.id || `sc-${i}`,
    name:        s.name || s.title || s.scenario_name || `Scenario ${i + 1}`,
    kind:        (s.kind || s.type || s.category || "").toUpperCase(),
    description: s.description || s.summary || s.detail || null,
    tags: [
      ...(s.tags || []),
      ...(s.labels || []),
      s.target, s.entity, s.related_entity,
    ].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function buildNexus(contacts, scenarios) {
  return contacts
    .map(contact => {
      const matched = scenarios.filter(sc => {
        const cName = contact.name.toLowerCase();
        const sName = sc.name.toLowerCase();
        const sDesc = (sc.description || "").toLowerCase();
        const nameHit = sName.includes(cName) || sDesc.includes(cName) || cName.includes(sName);
        const tagHit  = contact.tags.some(ct =>
          sc.tags.some(st => st && ct && (st.includes(ct) || ct.includes(st)))
        );
        return nameHit || tagHit;
      });
      return { contact, scenarios: matched };
    })
    .filter(row => row.scenarios.length > 0)
    .sort((a, b) => b.scenarios.length - a.scenarios.length);
}

export async function buildCscnxScript() {
  let contactData = null, scenarioData = null;
  try {
    const [cr, sr] = await Promise.all([
      fetch(`${apiBase()}/entities/Contact`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/scenario/list`,      { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    if (cr.ok)  contactData  = await cr.json();
    if (sr.ok)  scenarioData = await sr.json();
  } catch (_) {}

  if (!contactData && !scenarioData)
    return "Unable to retrieve contact-scenario nexus data at this time, sir.";

  const contacts  = normaliseContacts(contactData);
  const scenarios = normaliseScenarios(scenarioData);
  const nexus     = buildNexus(contacts, scenarios);

  if (!nexus.length) {
    return `Contact-Scenario Nexus: ${contacts.length} contacts and ${scenarios.length} scenarios scanned. No direct name or tag overlaps detected, sir.`;
  }

  const top = nexus.slice(0, 2).map(r =>
    `${r.contact.name} (${r.scenarios.length} scenario${r.scenarios.length !== 1 ? "s" : ""})`
  ).join("; ");

  return [
    `Contact-Scenario Nexus: ${nexus.length} of ${contacts.length} contacts are referenced in active scenarios.`,
    `${scenarios.length} total scenarios scanned across ${[...new Set(scenarios.map(s => s.kind).filter(Boolean))].length || "multiple"} categories.`,
    top ? `Top contacts: ${top}.` : null,
  ].filter(Boolean).join(" ");
}

export default function ContactScenarioNexus() {
  const [open,      setOpen]      = useState(false);
  const [nexus,     setNexus]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [lastTs,    setLastTs]    = useState(null);
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cr, sr] = await Promise.all([
        fetch(`${apiBase()}/entities/Contact`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/v1/scenario/list`,      { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const contactData  = cr.ok ? await cr.json() : null;
      const scenarioData = sr.ok ? await sr.json() : null;
      const contacts  = normaliseContacts(contactData);
      const scenarios = normaliseScenarios(scenarioData);
      setNexus(buildNexus(contacts, scenarios));
      setLastTs(Date.now());
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen(o => { if (!o) load(); return !o; });
    };
    window.addEventListener("jarvis:cscnx-toggle", toggle);
    return () => window.removeEventListener("jarvis:cscnx-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async (row) => {
    setAssessing(row.contact.id);
    try {
      const prompt = `Briefly assess why contact "${row.contact.name}" appears in the following scenarios: ${row.scenarios.map(s => `${s.name}${s.kind ? " [" + s.kind + "]" : ""}${s.description ? ": " + s.description.slice(0, 80) : ""}`).join("; ")}. Two sentences max.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      if (r.ok) {
        const d = await r.json();
        const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
        if (txt) {
          await fetch(`${apiBase()}/v1/voice/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
            body: JSON.stringify({ text: txt, voice: "onyx" }),
          });
        }
      }
    } catch (_) {}
    finally { setAssessing(null); }
  }, []);

  const kinds = [...new Set(nexus.flatMap(r => r.scenarios.map(s => s.kind)).filter(Boolean))];
  const tabs  = ["ALL", ...kinds];

  const visible = nexus
    .filter(row => {
      if (filter !== "ALL" && !row.scenarios.some(s => s.kind === filter)) return false;
      if (search && !row.contact.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => { setOpen(o => { if (!o) load(); return !o; }); }}
        style={{
          position: "fixed", left: 21240, bottom: 8, zIndex: 83,
          background: open ? CY : "rgba(0,20,40,0.92)",
          color: open ? "#000" : CY,
          border: `1px solid ${CY}`,
          borderRadius: 4, padding: "3px 8px",
          fontSize: 10, fontFamily: "monospace", letterSpacing: 1,
          cursor: "pointer", whiteSpace: "nowrap",
        }}
        title="Contact × Scenario Nexus (CSCNX)"
      >
        ◈ CSCNX{nexus.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMB, color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{nexus.length}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 83,
          width: 490, maxHeight: "72vh",
          background: "rgba(0,12,28,0.97)",
          border: `1px solid ${CY}`,
          borderRadius: 8, overflow: "hidden",
          display: "flex", flexDirection: "column",
          boxShadow: `0 0 24px ${CY}44`,
          fontFamily: "monospace",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${CY}33`,
            background: "rgba(41,231,255,0.06)",
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
              ◈ CONTACT × SCENARIO NEXUS
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {loading && <span style={{ color: DIM, fontSize: 9 }}>SCANNING…</span>}
              {lastTs && !loading && (
                <span style={{ color: DIM, fontSize: 9 }}>
                  {new Date(lastTs).toLocaleTimeString()}
                </span>
              )}
              <button
                onClick={load}
                style={{ background: "none", border: `1px solid ${CY}44`, color: CY,
                         borderRadius: 3, padding: "1px 6px", fontSize: 9, cursor: "pointer" }}
              >↺</button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: DIM,
                         fontSize: 13, cursor: "pointer", lineHeight: 1 }}
              >✕</button>
            </div>
          </div>

          {/* Stats bar */}
          <div style={{
            display: "flex", gap: 16, padding: "6px 12px",
            borderBottom: `1px solid ${CY}22`,
          }}>
            {[
              ["MATCHED",   nexus.length,                                                AMB],
              ["SCENARIOS", nexus.reduce((s, r) => s + r.scenarios.length, 0),           CY],
              ["KINDS",     kinds.length,                                                PRP],
              ["TOP",       nexus[0] ? nexus[0].scenarios.length : 0,                   GRN],
            ].map(([label, val, col]) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ color: col, fontSize: 14, fontWeight: "bold" }}>{val}</div>
                <div style={{ color: DIM, fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Search + filter tabs */}
          <div style={{ padding: "6px 12px", borderBottom: `1px solid ${CY}22` }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search contacts…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}44`,
                borderRadius: 4, padding: "4px 8px", color: "#d0e8ff", fontSize: 10,
                fontFamily: "monospace", outline: "none", marginBottom: 6,
              }}
            />
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {tabs.map(t => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  style={{
                    background: filter === t ? CY : "rgba(41,231,255,0.08)",
                    color: filter === t ? "#000" : CY,
                    border: `1px solid ${CY}55`, borderRadius: 3,
                    padding: "1px 6px", fontSize: 8, cursor: "pointer", letterSpacing: 1,
                  }}
                >{t}</button>
              ))}
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, padding: 16, textAlign: "center" }}>
                No contact-scenario overlaps detected.
              </div>
            )}
            {visible.map(row => {
              const isExp = expanded === row.contact.id;
              const rowScenarios = filter !== "ALL"
                ? row.scenarios.filter(s => s.kind === filter)
                : row.scenarios;
              return (
                <div
                  key={row.contact.id}
                  style={{ borderBottom: `1px solid ${CY}18`, padding: "8px 12px", cursor: "pointer" }}
                  onClick={() => setExpanded(isExp ? null : row.contact.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        background: AMB + "22", color: AMB, border: `1px solid ${AMB}55`,
                        borderRadius: 3, padding: "1px 5px", fontSize: 8, letterSpacing: 1,
                      }}>{rowScenarios.length} SCN</span>
                      <span style={{ color: "#e0f0ff", fontSize: 11 }}>{row.contact.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button
                        onClick={e => { e.stopPropagation(); assess(row); }}
                        disabled={assessing === row.contact.id}
                        style={{
                          background: "none", border: `1px solid ${CY}55`, color: CY,
                          borderRadius: 3, padding: "1px 5px", fontSize: 8, cursor: "pointer",
                          opacity: assessing === row.contact.id ? 0.5 : 1,
                        }}
                      >
                        {assessing === row.contact.id ? "…" : "▶ ASSESS"}
                      </button>
                      <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 6, paddingLeft: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {rowScenarios.map(sc => {
                        const kCol = kindColor(sc.kind);
                        return (
                          <div key={sc.id} style={{
                            background: "rgba(41,231,255,0.04)",
                            border: `1px solid ${kCol}33`,
                            borderRadius: 4, padding: "5px 8px",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {sc.kind && (
                                <span style={{
                                  background: kCol + "22", color: kCol,
                                  border: `1px solid ${kCol}55`,
                                  borderRadius: 3, padding: "0 4px", fontSize: 7, letterSpacing: 1,
                                }}>{sc.kind}</span>
                              )}
                              <span style={{ color: "#c0d8f0", fontSize: 10 }}>{sc.name}</span>
                            </div>
                            {sc.description && (
                              <div style={{ color: DIM, fontSize: 9, marginTop: 3, lineHeight: 1.4 }}>
                                {sc.description.slice(0, 160)}
                                {sc.description.length > 160 ? "…" : ""}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "5px 12px", borderTop: `1px solid ${CY}22`,
            color: DIM, fontSize: 8, letterSpacing: 1,
          }}>
            AUTO-REFRESH {POLL_MS / 1000}s · /entities/Contact + /v1/scenario/list
          </div>
        </div>
      )}
    </>
  );
}
