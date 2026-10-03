/**
 * F204 — Contact × Report × Scenario × Knowledge Personnel Operational Intelligence Map (CRSKPOI)
 *
 * Parallel-fetches /entities/Contact + /v1/reports + /v1/scenario/list + /knowledge/
 * and keyword-correlates each contact against reports AND scenarios AND KB articles to classify:
 *
 *   FULLY_INFORMED — matched report + scenario + KB article (all three)
 *   DUAL_COVERED   — matched any two of the three
 *   SINGLE_LINKED  — matched exactly one
 *   UNINFORMED     — no matches (personnel intel gap)
 *
 * Stat tiles: CONTACTS / REPORTS / SCENARIOS / KB ARTICLES + four class counts + INFORMED%.
 * Amber badge on UNINFORMED count.
 * Filter tabs ALL / FULLY_INFORMED / DUAL_COVERED / SINGLE_LINKED / UNINFORMED + text search.
 * Expand contact → matched report cards (purple) + scenario cards (teal) + KB article cards (green) with relevance bars.
 * ▶ ASSESS INTELLIGENCE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:crskpoi-toggle event.
 *
 * Voice triggers:
 *   "crskpoi / personnel intel / contact report scenario / contact intelligence map /
 *    uninformed contacts / contact knowledge scenario / personnel operational intel"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_056_600;
const Z_INDEX  = 265;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const CRSKPOI_RE = /\b(crskpoi|personnel[\s-]intel(?:ligence)?|contact[\s-]report[\s-]scenario|contact[\s-]intelligence[\s-]map|uninformed[\s-]contacts?|contact[\s-]knowledge[\s-]scenario|personnel[\s-]operational[\s-]intel)\b/i;

export function isCrskpoiQuery(q = "") { return CRSKPOI_RE.test(q); }

function keywords(text = "") {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function scoreText(target = "", kws = []) {
  const t = target.toLowerCase();
  return kws.filter(k => t.includes(k)).length;
}

function contactText(c) {
  return [c.name, c.role, c.org, c.organisation, c.email, (c.tags || []).join(" "), c.description, c.department].filter(Boolean).join(" ");
}

function reportText(r) {
  return [r.title, r.name, r.description, r.type, r.category, r.author, (r.tags || []).join(" ")].filter(Boolean).join(" ");
}

function scenarioText(s) {
  return [s.name, s.title, s.description, s.type, s.category, (s.tags || []).join(" ")].filter(Boolean).join(" ");
}

function kbText(k) {
  return [k.title, k.name, k.content, k.summary, k.category, (k.tags || []).join(" ")].filter(Boolean).join(" ");
}

export async function buildCrskpoiScript() {
  const base = apiBase();
  const [conRes, repRes, scnRes, kbRes] = await Promise.allSettled([
    fetch(`${base}/entities/Contact`).then(r => r.json()),
    fetch(`${base}/v1/reports`).then(r => r.json()),
    fetch(`${base}/v1/scenario/list`).then(r => r.json()),
    fetch(`${base}/knowledge/`).then(r => r.json()),
  ]);
  const contacts  = (conRes.status === "fulfilled" ? (conRes.value?.items   || conRes.value?.contacts  || conRes.value   || []) : []);
  const reports   = (repRes.status === "fulfilled" ? (repRes.value?.items   || repRes.value?.reports   || repRes.value   || []) : []);
  const scenarios = (scnRes.status === "fulfilled" ? (scnRes.value?.items   || scnRes.value?.scenarios || scnRes.value   || []) : []);
  const articles  = (kbRes.status  === "fulfilled" ? (kbRes.value?.items    || kbRes.value?.articles   || kbRes.value    || []) : []);

  let uninformed = 0, fullyInformed = 0;
  contacts.forEach(c => {
    const kws = keywords(contactText(c));
    const hasR = reports.some(r => scoreText(reportText(r), kws) > 0);
    const hasS = scenarios.some(s => scoreText(scenarioText(s), kws) > 0);
    const hasK = articles.some(k => scoreText(kbText(k), kws) > 0);
    if (!hasR && !hasS && !hasK) uninformed++;
    if (hasR && hasS && hasK) fullyInformed++;
  });
  const total  = contacts.length;
  const covPct = total ? Math.round(((total - uninformed) / total) * 100) : 0;
  return `CRSKPOI Personnel Operational Intelligence Map online, sir. I am cross-referencing ${total} contacts against ${reports.length} intelligence reports, ${scenarios.length} scenario playbooks, and ${articles.length} knowledge base articles. ${fullyInformed} contact${fullyInformed === 1 ? "" : "s"} are fully informed — matched against all three sources. ${uninformed} contact${uninformed === 1 ? "" : "s"} are uninformed with no report, scenario, or knowledge linkage. Overall personnel intelligence coverage stands at ${covPct}%. Recommend prioritising uninformed contacts for immediate briefing and scenario assignment.`;
}

const CY     = "#00CFFF";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const PU     = "#A855F7";
const TE     = "#14B8A6";
const GR     = "#22C55E";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_INFORMED: GR,
  DUAL_COVERED:   CY,
  SINGLE_LINKED:  TE,
  UNINFORMED:     AM,
};

function classify(c, reports, scenarios, articles) {
  const kws  = keywords(contactText(c));
  const hasR = reports.some(r => scoreText(reportText(r), kws) > 0);
  const hasS = scenarios.some(s => scoreText(scenarioText(s), kws) > 0);
  const hasK = articles.some(k => scoreText(kbText(k), kws) > 0);
  const count = (hasR ? 1 : 0) + (hasS ? 1 : 0) + (hasK ? 1 : 0);
  if (count === 3) return "FULLY_INFORMED";
  if (count === 2) return "DUAL_COVERED";
  if (count === 1) return "SINGLE_LINKED";
  return "UNINFORMED";
}

function getMatches(c, list, textFn) {
  const kws = keywords(contactText(c));
  return list
    .map(item => ({ item, score: scoreText(textFn(item), kws) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

export default function ContactReportScenarioKnowledgeMap() {
  const [open,      setOpen]      = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [reports,   setReports]   = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [articles,  setArticles]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    const [conR, repR, scnR, kbR] = await Promise.allSettled([
      fetch(`${base}/entities/Contact`).then(r => r.json()),
      fetch(`${base}/v1/reports`).then(r => r.json()),
      fetch(`${base}/v1/scenario/list`).then(r => r.json()),
      fetch(`${base}/knowledge/`).then(r => r.json()),
    ]);
    setContacts(conR.status === "fulfilled" ? (conR.value?.items   || conR.value?.contacts  || conR.value   || []) : []);
    setReports(repR.status  === "fulfilled" ? (repR.value?.items   || repR.value?.reports   || repR.value   || []) : []);
    setScenarios(scnR.status === "fulfilled" ? (scnR.value?.items  || scnR.value?.scenarios || scnR.value   || []) : []);
    setArticles(kbR.status  === "fulfilled" ? (kbR.value?.items    || kbR.value?.articles   || kbR.value    || []) : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener("jarvis:crskpoi-toggle", handler);
    return () => window.removeEventListener("jarvis:crskpoi-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const classified = contacts.map(c => ({ c, cls: classify(c, reports, scenarios, articles) }));
  const counts = { FULLY_INFORMED: 0, DUAL_COVERED: 0, SINGLE_LINKED: 0, UNINFORMED: 0 };
  classified.forEach(({ cls }) => counts[cls]++);
  const covPct = contacts.length ? Math.round(((contacts.length - counts.UNINFORMED) / contacts.length) * 100) : 0;

  const filtered = classified.filter(({ c, cls }) => {
    if (tab !== "ALL" && cls !== tab) return false;
    if (!search) return true;
    return contactText(c).toLowerCase().includes(search.toLowerCase());
  });

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const base = apiBase();
      const ctx  = `${contacts.length} contacts, ${reports.length} reports, ${scenarios.length} scenarios, ${articles.length} KB articles. FULLY_INFORMED:${counts.FULLY_INFORMED} DUAL_COVERED:${counts.DUAL_COVERED} SINGLE_LINKED:${counts.SINGLE_LINKED} UNINFORMED:${counts.UNINFORMED} Coverage:${covPct}%`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `CRSKPOI personnel operational intelligence map assessment. Data: ${ctx}. Provide a 2-sentence brief identifying which uninformed contacts represent the highest operational risk and the immediate recommended action to close those intelligence gaps.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "Assessment unavailable.";
      setBrief(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setBrief("Assessment unavailable.");
    }
    setAssessing(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(0,207,255,0.08)", border: `1px solid ${CY}`,
          color: CY, fontFamily: FONT, fontSize: 10, padding: "3px 7px",
          cursor: "pointer", borderRadius: 3, letterSpacing: 1,
        }}
        title="Contact × Report × Scenario × Knowledge Personnel Operational Intelligence Map"
      >
        ◈ CRSKPOI
        {counts.UNINFORMED > 0 && (
          <span style={{ marginLeft: 4, background: AM, color: "#000", borderRadius: 3, padding: "0 4px", fontSize: 9 }}>
            {counts.UNINFORMED}
          </span>
        )}
      </button>
    );
  }

  const TABS = ["ALL", "FULLY_INFORMED", "DUAL_COVERED", "SINGLE_LINKED", "UNINFORMED"];

  return (
    <div style={{
      position: "fixed", top: 40, left: "50%", transform: "translateX(-50%)",
      width: 780, maxHeight: "82vh", overflowY: "auto",
      background: BG, border: `1px solid ${CY}`, borderRadius: 8,
      zIndex: Z_INDEX + 1000, fontFamily: FONT, color: CY, padding: 18,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>
          ◈ CRSKPOI — CONTACT × REPORT × SCENARIO × KNOWLEDGE PERSONNEL INTEL MAP
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: RD, cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 6, marginBottom: 12 }}>
        {[
          ["CONTACTS",       contacts.length,          CY],
          ["REPORTS",        reports.length,           CY],
          ["SCENARIOS",      scenarios.length,         CY],
          ["KB ARTICLES",    articles.length,          CY],
          ["FULLY INFORMED", counts.FULLY_INFORMED,    GR],
          ["DUAL COVERED",   counts.DUAL_COVERED,      CY],
          ["SINGLE LINKED",  counts.SINGLE_LINKED,     TE],
          ["UNINFORMED",     counts.UNINFORMED,        AM],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: "rgba(0,207,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 5, padding: "6px 4px", textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 8, color: "#888", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#666", marginBottom: 3 }}>
          <span>PERSONNEL INTELLIGENCE COVERAGE</span><span>{covPct}%</span>
        </div>
        <div style={{ background: "rgba(0,207,255,0.1)", borderRadius: 3, height: 6 }}>
          <div style={{ width: `${covPct}%`, background: covPct >= 70 ? GR : covPct >= 40 ? AM : RD, height: "100%", borderRadius: 3, transition: "width 0.4s" }} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "rgba(0,207,255,0.18)" : "rgba(0,207,255,0.04)",
            border: `1px solid ${tab === t ? CY : BORDER}`,
            color: tab === t ? CY : "#666", fontFamily: FONT, fontSize: 9,
            padding: "3px 8px", cursor: "pointer", borderRadius: 3,
          }}>
            {t} {t !== "ALL" ? `(${counts[t] ?? 0})` : `(${contacts.length})`}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search contacts..."
          style={{
            marginLeft: "auto", background: "rgba(0,207,255,0.06)", border: `1px solid ${BORDER}`,
            color: CY, fontFamily: FONT, fontSize: 9, padding: "3px 8px", borderRadius: 3, outline: "none", width: 160,
          }}
        />
      </div>

      {loading && <div style={{ textAlign: "center", color: "#666", fontSize: 11, padding: 12 }}>LOADING...</div>}

      {/* Contact rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}>
        {filtered.map(({ c, cls }) => {
          const id       = c.id || c.name || Math.random();
          const isExp    = expanded === id;
          const col      = CLASS_COLOR[cls];
          const repMatches = getMatches(c, reports,   reportText);
          const scnMatches = getMatches(c, scenarios, scenarioText);
          const kbMatches  = getMatches(c, articles,  kbText);
          const maxScore   = Math.max(
            ...repMatches.map(x => x.score),
            ...scnMatches.map(x => x.score),
            ...kbMatches.map(x => x.score),
            1
          );
          return (
            <div key={id} style={{ border: `1px solid rgba(0,207,255,0.12)`, borderRadius: 5, overflow: "hidden" }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer", background: "rgba(0,207,255,0.03)" }}
              >
                <span style={{ fontSize: 10, color: col, minWidth: 110, letterSpacing: 1 }}>{cls}</span>
                <span style={{ fontSize: 11, flex: 1, color: "#ddd" }}>{c.name || "(unnamed)"}</span>
                {c.role && <span style={{ fontSize: 9, color: "#888" }}>{c.role}</span>}
                {c.org || c.organisation ? <span style={{ fontSize: 9, color: "#666" }}>{c.org || c.organisation}</span> : null}
                <span style={{ fontSize: 9, color: "#555" }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "8px 12px", background: "rgba(0,207,255,0.02)", display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Reports */}
                  {repMatches.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: PU, marginBottom: 4, letterSpacing: 1 }}>MATCHED REPORTS ({repMatches.length})</div>
                      {repMatches.map(({ item, score }) => (
                        <div key={item.id || item.title} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 9, color: PU, background: "rgba(168,85,247,0.12)", padding: "1px 5px", borderRadius: 3, minWidth: 60, textAlign: "center" }}>
                            {(item.type || "REPORT").toUpperCase().slice(0, 8)}
                          </span>
                          <span style={{ fontSize: 10, color: "#ccc", flex: 1 }}>{item.title || item.name || "(untitled)"}</span>
                          <div style={{ width: 60, background: "rgba(168,85,247,0.15)", borderRadius: 2, height: 4 }}>
                            <div style={{ width: `${Math.round((score / maxScore) * 100)}%`, background: PU, height: "100%", borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Scenarios */}
                  {scnMatches.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: TE, marginBottom: 4, letterSpacing: 1 }}>MATCHED SCENARIOS ({scnMatches.length})</div>
                      {scnMatches.map(({ item, score }) => (
                        <div key={item.id || item.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 9, color: TE, background: "rgba(20,184,166,0.12)", padding: "1px 5px", borderRadius: 3, minWidth: 60, textAlign: "center" }}>
                            {(item.type || "SCENARIO").toUpperCase().slice(0, 8)}
                          </span>
                          <span style={{ fontSize: 10, color: "#ccc", flex: 1 }}>{item.name || item.title || "(unnamed)"}</span>
                          <div style={{ width: 60, background: "rgba(20,184,166,0.15)", borderRadius: 2, height: 4 }}>
                            <div style={{ width: `${Math.round((score / maxScore) * 100)}%`, background: TE, height: "100%", borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* KB Articles */}
                  {kbMatches.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: GR, marginBottom: 4, letterSpacing: 1 }}>MATCHED KB ARTICLES ({kbMatches.length})</div>
                      {kbMatches.map(({ item, score }) => (
                        <div key={item.id || item.title} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 9, color: GR, background: "rgba(34,197,94,0.12)", padding: "1px 5px", borderRadius: 3, minWidth: 60, textAlign: "center" }}>
                            {(item.category || "KB").toUpperCase().slice(0, 8)}
                          </span>
                          <span style={{ fontSize: 10, color: "#ccc", flex: 1 }}>{item.title || item.name || "(untitled)"}</span>
                          <div style={{ width: 60, background: "rgba(34,197,94,0.15)", borderRadius: 2, height: 4 }}>
                            <div style={{ width: `${Math.round((score / maxScore) * 100)}%`, background: GR, height: "100%", borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {repMatches.length === 0 && scnMatches.length === 0 && kbMatches.length === 0 && (
                    <div style={{ fontSize: 10, color: "#555", fontStyle: "italic" }}>No matches found in reports, scenarios, or knowledge base.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", color: "#555", fontSize: 11, padding: 12 }}>No contacts match the current filter.</div>
        )}
      </div>

      {/* Assess button */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          onClick={assess} disabled={assessing}
          style={{
            background: "rgba(0,207,255,0.12)", border: `1px solid ${CY}`,
            color: CY, fontFamily: FONT, fontSize: 10, padding: "5px 14px",
            cursor: assessing ? "default" : "pointer", borderRadius: 4, letterSpacing: 1,
          }}
        >
          {assessing ? "ASSESSING..." : "▶ ASSESS INTELLIGENCE"}
        </button>
        <span style={{ fontSize: 9, color: "#555" }}>auto-refresh 90s · {contacts.length} contacts</span>
      </div>
      {brief && (
        <div style={{ marginTop: 10, background: "rgba(0,207,255,0.06)", border: `1px solid ${BORDER}`, borderRadius: 5, padding: "8px 12px", fontSize: 11, color: "#ccc", lineHeight: 1.5 }}>
          {brief}
        </div>
      )}
    </div>
  );
}
