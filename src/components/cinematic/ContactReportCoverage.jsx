/**
 * ContactReportCoverage — F137.
 *
 * Parallel-fetches /entities/Contact + /v1/reports then keyword-correlates
 * each contact against the report catalog to surface REFERENCED contacts
 * (at least one report mentions them or their domain) vs UNTRACKED
 * (no paper trail — intelligence gap).
 *
 * Stat tiles: contacts / reports / referenced / untracked
 * Filter tabs: ALL / REFERENCED / UNTRACKED
 * Expand contact → matched reports with relevance score + type/year badge.
 * Click ▶ ASSESS → /v1/jarvis/agent/chat AI contact-documentation brief
 *   + jarvis:speak-dossier TTS.
 * 120 s auto-refresh.
 *
 * Intent: "contact report" / "report contact" / "who has reports" /
 *         "contact documentation" / "ctrpt"
 *   → jarvis:ctrpt-toggle + TTS brief via buildCtrptScript()
 *
 * Toggle: ◈ CTRPT at left:43560, bottom:8, zIndex 89.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const PURPLE = "#A78BFA";
const BTN_LEFT   = 43560;
const REFRESH_MS = 120_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseContacts(raw) {
  return normaliseArray(raw).map((c) => ({
    id:         c.id || c.contact_id || String(Math.random()),
    name:       c.name || c.full_name || c.display_name || "Unnamed",
    role:       c.role || c.title || c.position || "",
    department: c.department || c.dept || c.org || c.organisation || c.organization || "",
    notes:      c.notes || c.bio || c.description || "",
    tags:       [...(c.tags || []), ...(c.labels || [])].map(String),
  }));
}

function normaliseReports(raw) {
  return normaliseArray(raw).map((r) => ({
    id:      r.id || r.report_id || String(Math.random()),
    title:   r.title || r.name || "Unnamed Report",
    content: r.content || r.summary || r.description || r.body || r.excerpt || "",
    type:    r.type || r.category || r.report_type || "",
    year:    r.year || (r.date ? String(r.date).slice(0, 4) : "") ||
             (r.created_at ? String(r.created_at).slice(0, 4) : "") || "",
    tags:    [...(r.tags || []), ...(r.keywords || [])].map(String),
  }));
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchScore(contact, report) {
  const reportText = `${report.title} ${report.content} ${report.tags.join(" ")}`.toLowerCase();
  const words = [
    ...tokens(contact.name),
    ...tokens(contact.role),
    ...tokens(contact.department),
    ...tokens(contact.notes),
    ...contact.tags.flatMap(tokens),
  ];
  return words.reduce((acc, w) => acc + (reportText.includes(w) ? 1 : 0), 0);
}

function correlate(contacts, reports) {
  return contacts.map((c) => {
    const matched = reports
      .map((r) => ({ ...r, _score: matchScore(c, r) }))
      .filter((r) => r._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...c, matched };
  });
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const CTRPT_RE =
  /contact[\s-]?report|report[\s-]?contact|who[\s-]?has[\s-]?reports?|contact[\s-]?doc(?:ument(?:ation)?)?|ctrpt\b/i;

export function isCtrptQuery(q) {
  return CTRPT_RE.test(q || "");
}

export async function buildCtrptScript() {
  try {
    const [ctRaw, rpRaw] = await Promise.all([
      fetch(`${apiBase()}/entities/Contact?limit=100`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/v1/reports?limit=100`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const contacts = normaliseContacts(ctRaw);
    const reports  = normaliseReports(rpRaw);
    const corr     = correlate(contacts, reports);
    const ref      = corr.filter((c) => c.matched.length > 0);
    const untr     = corr.filter((c) => c.matched.length === 0);
    return `Contact-report coverage active, sir. ${contacts.length} contact${contacts.length !== 1 ? "s" : ""} cross-referenced against ${reports.length} report${reports.length !== 1 ? "s" : ""}. ${ref.length} contact${ref.length !== 1 ? "s are" : " is"} referenced in the report catalog. ${untr.length} contact${untr.length !== 1 ? "s have" : " has"} no paper trail — potential intelligence gaps. Select any contact to review matched reports and request an AI documentation assessment.`;
  } catch (_) {
    return "Contact-report coverage correlator is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ContactReportCoverage() {
  const [visible, setVisible]     = useState(false);
  const [contacts, setContacts]   = useState([]);
  const [reports, setReports]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [ctRaw, rpRaw] = await Promise.all([
        fetch(`${apiBase()}/entities/Contact?limit=100`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/v1/reports?limit=100`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setContacts(normaliseContacts(ctRaw));
      setReports(normaliseReports(rpRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:ctrpt-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ctrpt-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessContact(c) {
    setAssessing(c.id);
    const rptTitles = c.matched.map((r) => `"${r.title}"`).join(", ");
    const prompt = `As JARVIS, provide a 2-sentence contact-documentation assessment for ${c.name} (${c.role || "role unknown"}, ${c.department || "dept unknown"}). Reports found: ${rptTitles || "none"}. Assess the significance of this contact in the intelligence record and whether the documentation level is adequate.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient documentation to assess this contact, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Assessment unavailable at this time, sir." },
      }));
    }
    setAssessing(null);
  }

  const correlated  = correlate(contacts, reports);
  const referenced  = correlated.filter((c) => c.matched.length > 0);
  const untracked   = correlated.filter((c) => c.matched.length === 0);

  const base =
    tab === "REFERENCED" ? referenced :
    tab === "UNTRACKED"  ? untracked  : correlated;

  const displayed = search
    ? base.filter((c) =>
        `${c.name} ${c.role} ${c.department}`.toLowerCase().includes(search.toLowerCase())
      )
    : base;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Contact × Report Coverage (F137)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 89,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : `${CY}44`}`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ CTRPT
        {referenced.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{referenced.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: Math.max(8, BTN_LEFT - 280), zIndex: 89,
          width: 580, maxHeight: "70vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${CY}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>◈ CONTACT × REPORT COVERAGE</span>
            <button onClick={fetchData} style={{
              marginLeft: "auto", background: "transparent",
              border: `1px solid ${CY}33`, borderRadius: 3,
              color: `${CY}88`, padding: "2px 6px", fontSize: 7,
              cursor: "pointer", letterSpacing: 1,
            }}>↻ REFRESH</button>
            <button onClick={() => setVisible(false)} style={{
              background: "transparent", border: "none",
              color: "#445566", cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["CONTACTS",   contacts.length,   CY],
              ["REPORTS",    reports.length,    PURPLE],
              ["REFERENCED", referenced.length, GREEN],
              ["UNTRACKED",  untracked.length,  untracked.length > 0 ? AMBER : "#445566"],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : val}</div>
                <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {["ALL", "REFERENCED", "UNTRACKED"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${CY}22` : "transparent",
                border: `1px solid ${tab === t ? CY : "#1e3040"}`,
                color: tab === t ? CY : "#445566",
                borderRadius: 4, padding: "3px 10px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="search contacts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${CY}22`, borderRadius: 4,
              color: "#DCEBF5", padding: "5px 8px",
              fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
              outline: "none", marginBottom: 10,
            }}
          />

          {/* Contact rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              correlating contacts against report catalog…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "UNTRACKED"
                ? "All contacts appear in at least one report."
                : "No contacts in this filter."}
            </div>
          ) : (
            displayed.map((c) => {
              const isOpen    = expanded === c.id;
              const hasReports = c.matched.length > 0;
              return (
                <div key={c.id} style={{
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${isOpen ? `${CY}44` : "#1a2530"}`,
                  borderLeft: `3px solid ${hasReports ? GREEN : AMBER}`,
                  borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                  cursor: "pointer",
                }} onClick={() => setExpanded(isOpen ? null : c.id)}>
                  {/* Contact header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      width: 26, height: 26, borderRadius: "50%",
                      background: hasReports ? `${GREEN}22` : `${AMBER}22`,
                      border: `1px solid ${hasReports ? GREEN : AMBER}44`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, color: hasReports ? GREEN : AMBER,
                      fontWeight: "bold", flexShrink: 0,
                    }}>
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "#DCEBF5", fontSize: 10, fontWeight: "bold" }}>{c.name}</div>
                      {(c.role || c.department) && (
                        <div style={{ color: "#556677", fontSize: 8, marginTop: 1 }}>
                          {[c.role, c.department].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    <span style={{
                      fontSize: 7, whiteSpace: "nowrap",
                      color: hasReports ? GREEN : AMBER,
                      border: `1px solid ${hasReports ? GREEN : AMBER}44`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                    }}>
                      {hasReports
                        ? `${c.matched.length} report${c.matched.length !== 1 ? "s" : ""}`
                        : "UNTRACKED"}
                    </span>
                  </div>

                  {/* Assess button */}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); assessContact(c); }}
                      disabled={assessing === c.id}
                      style={{
                        background: assessing === c.id ? "#1a2530" : `${CY}18`,
                        color: assessing === c.id ? "#445566" : CY,
                        border: `1px solid ${CY}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1, cursor: assessing === c.id ? "default" : "pointer",
                      }}
                    >{assessing === c.id ? "…assessing" : "▶ ASSESS"}</button>
                  </div>

                  {/* Expanded report list */}
                  {isOpen && hasReports && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}18` }}>
                      {c.matched.map((r) => (
                        <div key={r.id} style={{
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid #1e3040",
                          borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                          display: "flex", alignItems: "flex-start", gap: 8,
                        }}>
                          {r.type && (
                            <span style={{
                              fontSize: 7, color: PURPLE, border: "1px solid #A78BFA44",
                              borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                              whiteSpace: "nowrap", flexShrink: 0, textTransform: "uppercase",
                            }}>{r.type}</span>
                          )}
                          <div style={{ flex: 1 }}>
                            <div style={{ color: "#a0b8cc", fontSize: 10 }}>{r.title}</div>
                            {r.year && (
                              <div style={{ color: "#334455", fontSize: 7, marginTop: 2 }}>{r.year}</div>
                            )}
                          </div>
                          <div style={{ fontSize: 7, color: `${CY}66`, whiteSpace: "nowrap" }}>
                            score {r._score}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isOpen && !hasReports && (
                    <div style={{
                      marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a2530",
                      color: AMBER, fontSize: 8,
                    }}>
                      ⚠ No reports reference this contact. Consider documenting their role in intelligence records.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /entities/Contact + /v1/reports · 120 s auto-refresh · ▶ ASSESS for AI documentation brief
          </div>
        </div>
      )}
    </>
  );
}
