/**
 * F200 — Graph Annotation × Scenario × Contact Intelligence Readiness Nexus (GASCRIN)
 *
 * Parallel-fetches /v1/graph/annotations + /v1/scenario/list + /entities/Contact
 * and keyword-correlates each graph annotation against scenario playbooks AND contacts to classify:
 *
 *   FULLY_MAPPED      — matched scenario + contact (annotation has full coverage)
 *   SCENARIO_ONLY     — scenario match only, no contact
 *   CONTACT_LINKED    — contact match only, no scenario
 *   UNMAPPED          — no matches (intelligence readiness gap)
 *
 * Stat tiles: ANNOTATIONS / SCENARIOS / CONTACTS + four class counts + MAPPED%.
 * Amber badge on UNMAPPED count.
 * Filter tabs ALL / FULLY_MAPPED / SCENARIO_ONLY / CONTACT_LINKED / UNMAPPED + text search.
 * Expand annotation → matched scenario cards (purple) + contact cards (teal) with relevance bars.
 * ▶ ASSESS READINESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:gascrin-toggle event.
 *
 * Voice triggers:
 *   "gascrin / annotation scenario contact / graph readiness nexus /
 *    unmapped annotation / annotation scenario / annotation contact"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_054_360;
const Z_INDEX  = 261;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const GASCRIN_RE = /\b(gascrin|annotation[\s-]scenario[\s-]contact|graph[\s-]readiness[\s-]nexus|unmapped[\s-]annotation|annotation[\s-]scenario|annotation[\s-]contact)\b/i;

export function isGascrinQuery(q = "") { return GASCRIN_RE.test(q); }

export async function buildGascrinScript() {
  const base = apiBase();
  const [annRes, scnRes, ctRes] = await Promise.allSettled([
    fetch(`${base}/v1/graph/annotations`).then(r => r.json()),
    fetch(`${base}/v1/scenario/list`).then(r => r.json()),
    fetch(`${base}/entities/Contact`).then(r => r.json()),
  ]);
  const annotations = (annRes.status === "fulfilled" ? (annRes.value?.items || annRes.value?.annotations || annRes.value || []) : []);
  const scenarios   = (scnRes.status === "fulfilled" ? (scnRes.value?.items || scnRes.value?.scenarios || scnRes.value || []) : []);
  const contacts    = (ctRes.status  === "fulfilled" ? (ctRes.value?.items  || ctRes.value?.contacts  || ctRes.value  || []) : []);

  let unmapped = 0;
  let fullyMapped = 0;
  for (const ann of annotations) {
    const kws = keywords(annText(ann));
    const hasScn = scenarios.some(s => scoreText(scnText(s), kws) > 0);
    const hasCt  = contacts.some(c  => scoreText(ctText(c),  kws) > 0);
    if (!hasScn && !hasCt) unmapped++;
    if (hasScn && hasCt)   fullyMapped++;
  }
  const total   = annotations.length;
  const mappedPct = total ? Math.round((fullyMapped / total) * 100) : 0;
  return `GASCRIN Intelligence Readiness Nexus online, sir. I am correlating ${total} graph annotations across ${scenarios.length} scenario playbooks and ${contacts.length} contacts. ${fullyMapped} annotation${fullyMapped === 1 ? " is" : "s are"} fully mapped to both a scenario and a contact — ${mappedPct}% coverage. ${unmapped} annotation${unmapped === 1 ? " has" : "s have"} no scenario or contact linkage, representing active intelligence readiness gaps that require immediate assignment.`;
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function keywords(text = "") {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 3);
}
function scoreText(text = "", kws = []) {
  const t = text.toLowerCase();
  return kws.filter(k => t.includes(k)).length;
}
function annText(a) {
  return [a.text, a.label, a.node_id, a.content, a.type, a.category].filter(Boolean).join(" ");
}
function scnText(s) {
  return [s.name, s.description, s.type, s.tags?.join?.(" ")].filter(Boolean).join(" ");
}
function ctText(c) {
  return [c.name, c.email, c.role, c.org, c.organisation, c.tags?.join?.(" ")].filter(Boolean).join(" ");
}

// ─── colors ───────────────────────────────────────────────────────────────────
const CY     = "#00CFFF";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const PU     = "#A78BFA";
const TE     = "#2DD4BF";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_MAPPED:   GR,
  SCENARIO_ONLY:  PU,
  CONTACT_LINKED: TE,
  UNMAPPED:       AM,
};

const TABS = ["ALL", "FULLY_MAPPED", "SCENARIO_ONLY", "CONTACT_LINKED", "UNMAPPED"];

// ─── component ────────────────────────────────────────────────────────────────
export default function GraphAnnotationScenarioContactNexus() {
  const [open,       setOpen]       = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [scenarios,  setScenarios]  = useState([]);
  const [contacts,   setContacts]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [brief,      setBrief]      = useState("");
  const timerRef = useRef(null);

  // ── listen for voice toggle ────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:gascrin-toggle", handler);
    return () => window.removeEventListener("jarvis:gascrin-toggle", handler);
  }, []);

  // ── fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const [annRes, scnRes, ctRes] = await Promise.allSettled([
        fetch(`${base}/v1/graph/annotations`).then(r => r.json()),
        fetch(`${base}/v1/scenario/list`).then(r => r.json()),
        fetch(`${base}/entities/Contact`).then(r => r.json()),
      ]);
      setAnnotations(annRes.status === "fulfilled" ? (annRes.value?.items || annRes.value?.annotations || annRes.value || []) : []);
      setScenarios(scnRes.status === "fulfilled"   ? (scnRes.value?.items || scnRes.value?.scenarios || scnRes.value || []) : []);
      setContacts(ctRes.status  === "fulfilled"    ? (ctRes.value?.items  || ctRes.value?.contacts  || ctRes.value  || []) : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  // ── classify ──────────────────────────────────────────────────────────────
  const classified = (annotations || []).map(ann => {
    const kws  = keywords(annText(ann));
    const scns = scenarios.filter(s => scoreText(scnText(s), kws) > 0).map(s => ({ ...s, _score: scoreText(scnText(s), kws) })).sort((a, b) => b._score - a._score).slice(0, 5);
    const cts  = contacts.filter(c  => scoreText(ctText(c),  kws) > 0).map(c => ({ ...c, _score: scoreText(ctText(c),  kws) })).sort((a, b) => b._score - a._score).slice(0, 5);
    const cls  = (scns.length > 0 && cts.length > 0) ? "FULLY_MAPPED"
               : (scns.length > 0) ? "SCENARIO_ONLY"
               : (cts.length  > 0) ? "CONTACT_LINKED"
               :                     "UNMAPPED";
    return { ...ann, _cls: cls, _scns: scns, _cts: cts };
  });

  const fullyMapped    = classified.filter(a => a._cls === "FULLY_MAPPED").length;
  const scenarioOnly   = classified.filter(a => a._cls === "SCENARIO_ONLY").length;
  const contactLinked  = classified.filter(a => a._cls === "CONTACT_LINKED").length;
  const unmapped       = classified.filter(a => a._cls === "UNMAPPED").length;
  const total          = classified.length;
  const mappedPct      = total ? Math.round((fullyMapped / total) * 100) : 0;

  const visible = classified.filter(a => {
    if (tab !== "ALL" && a._cls !== tab) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return annText(a).toLowerCase().includes(s);
  });

  // ── assess ────────────────────────────────────────────────────────────────
  const assess = async () => {
    setAssessing(true); setBrief("");
    try {
      const base = apiBase();
      const ctx = `GASCRIN: ${total} graph annotations. ${fullyMapped} fully mapped (scenario+contact). ${scenarioOnly} scenario-only. ${contactLinked} contact-linked. ${unmapped} unmapped (readiness gap). ${mappedPct}% mapped.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `GASCRIN Intelligence Readiness Nexus assessment: ${ctx}. Provide a 2-sentence prioritised readiness brief.` }),
      });
      const d = await r.json();
      const text = d?.response || d?.message || d?.content || "Assessment complete.";
      setBrief(text);
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Graph Annotation × Scenario × Contact Intelligence Readiness Nexus (GASCRIN)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: open ? AM : "rgba(5,8,13,0.85)",
          border: `1px solid ${AM}`,
          color: open ? "#fff" : AM,
          fontFamily: FONT, fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", borderRadius: 3, cursor: "pointer",
          boxShadow: unmapped > 0 ? `0 0 8px ${AM}88` : "none",
          whiteSpace: "nowrap",
        }}
      >
        ◈ GASCRIN
        {unmapped > 0 && (
          <span style={{
            marginLeft: 4, background: AM, color: "#fff",
            borderRadius: 8, fontSize: 8, padding: "0 4px", fontWeight: 700,
          }}>{unmapped}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: Math.max(8, BTN_LEFT - 300),
          zIndex: Z_INDEX + 100, width: 820, maxHeight: "82vh",
          background: BG, border: `1px solid ${BORDER}`,
          borderRadius: 8, fontFamily: FONT, fontSize: 11,
          color: "#DCEBF5", overflow: "hidden", display: "flex", flexDirection: "column",
          boxShadow: `0 0 40px rgba(0,207,255,0.12)`,
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ color: AM, fontWeight: 700, letterSpacing: 2 }}>GASCRIN</span>
              <span style={{ color: "#6B7280", marginLeft: 8, fontSize: 10 }}>Graph Annotation × Scenario × Contact — Intelligence Readiness Nexus</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: "8px 14px", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: `1px solid ${BORDER}` }}>
            {[
              { label: "ANNOTATIONS",    val: total,              clr: CY },
              { label: "SCENARIOS",      val: scenarios.length,   clr: PU },
              { label: "CONTACTS",       val: contacts.length,    clr: TE },
              { label: "FULLY MAPPED",   val: fullyMapped,        clr: GR },
              { label: "SCENARIO ONLY",  val: scenarioOnly,       clr: PU },
              { label: "CONTACT LINKED", val: contactLinked,      clr: TE },
              { label: "UNMAPPED",       val: unmapped,           clr: AM },
              { label: "MAPPED%",        val: `${mappedPct}%`,    clr: mappedPct > 70 ? GR : mappedPct > 40 ? AM : RD },
            ].map(t => (
              <div key={t.label} style={{
                background: "rgba(0,0,0,0.3)", border: `1px solid ${t.clr}33`,
                borderRadius: 4, padding: "4px 8px", minWidth: 80, textAlign: "center",
              }}>
                <div style={{ color: t.clr, fontSize: 14, fontWeight: 700 }}>{loading ? "…" : t.val}</div>
                <div style={{ color: "#6B7280", fontSize: 8, letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          {!loading && total > 0 && (
            <div style={{ padding: "4px 14px", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ height: 4, background: "#1e2936", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${mappedPct}%`, background: mappedPct > 70 ? GR : AM, borderRadius: 2, transition: "width 0.4s" }} />
              </div>
            </div>
          )}

          {/* Controls */}
          <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? AM : "rgba(0,0,0,0.4)",
                border: `1px solid ${tab === t ? AM : "#334155"}`,
                color: tab === t ? "#fff" : "#94A3B8",
                fontFamily: FONT, fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer",
              }}>{t.replace(/_/g, " ")}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search annotations…"
              style={{
                marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid #334155`,
                color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "2px 8px", borderRadius: 3,
                width: 160, outline: "none",
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
            {error && <div style={{ color: RD, padding: 8 }}>Error: {error}</div>}
            {!loading && !error && visible.length === 0 && (
              <div style={{ color: "#6B7280", padding: 12, textAlign: "center" }}>No annotations match current filter.</div>
            )}
            {visible.map((ann, i) => {
              const clr   = CLASS_COLOR[ann._cls] || AM;
              const isExp = expanded === i;
              const label = ann.text || ann.label || ann.content || ann.node_id || `Annotation #${i + 1}`;
              return (
                <div key={i} style={{ marginBottom: 4 }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
                      background: "rgba(0,0,0,0.3)", borderRadius: 4,
                      border: `1px solid ${isExp ? clr : "transparent"}`,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ color: clr, fontSize: 9, letterSpacing: 1, minWidth: 120 }}>{ann._cls.replace(/_/g, " ")}</span>
                    <span style={{ flex: 1, color: "#DCEBF5", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                    {ann.type && <span style={{ color: "#6B7280", fontSize: 8, border: "1px solid #334155", borderRadius: 2, padding: "0 3px" }}>{ann.type}</span>}
                    <span style={{ color: "#334155", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: "6px 12px", background: "rgba(0,0,0,0.2)", borderRadius: "0 0 4px 4px", marginTop: 1 }}>
                      {ann._scns.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>MATCHED SCENARIOS ({ann._scns.length})</div>
                          {ann._scns.map((s, k) => (
                            <div key={k} style={{ marginBottom: 3, padding: "3px 6px", background: "rgba(167,139,250,0.06)", borderRadius: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{s.name || s.title || "Scenario"}</span>
                                {s.type && <span style={{ color: PU, fontSize: 8, border: `1px solid ${PU}33`, borderRadius: 2, padding: "0 3px" }}>{s.type}</span>}
                              </div>
                              <div style={{ marginTop: 2, height: 3, background: "#1e2936", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, (s._score / 5) * 100)}%`, background: PU, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {ann._cts.length > 0 && (
                        <div>
                          <div style={{ color: TE, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>MATCHED CONTACTS ({ann._cts.length})</div>
                          {ann._cts.map((c, k) => (
                            <div key={k} style={{ marginBottom: 3, padding: "3px 6px", background: "rgba(45,212,191,0.06)", borderRadius: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{c.name || "Contact"}</span>
                                {c.role && <span style={{ color: TE, fontSize: 8, border: `1px solid ${TE}33`, borderRadius: 2, padding: "0 3px" }}>{c.role}</span>}
                              </div>
                              <div style={{ marginTop: 2, height: 3, background: "#1e2936", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, (c._score / 5) * 100)}%`, background: TE, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {ann._scns.length === 0 && ann._cts.length === 0 && (
                        <div style={{ color: "#6B7280", fontSize: 10, padding: "4px 0" }}>No scenario or contact match — annotation unmapped.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? "#1e2936" : AM, color: assessing ? "#6B7280" : "#fff",
                border: "none", fontFamily: FONT, fontSize: 9, letterSpacing: 1,
                padding: "4px 12px", borderRadius: 3, cursor: assessing ? "not-allowed" : "pointer",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS READINESS"}
            </button>
            {brief && <div style={{ flex: 1, color: "#94A3B8", fontSize: 10, lineHeight: 1.4 }}>{brief}</div>}
            <span style={{ color: "#334155", fontSize: 9, marginLeft: "auto" }}>
              auto-refresh 90s · /v1/graph/annotations · /v1/scenario/list · /entities/Contact
            </span>
          </div>
        </div>
      )}
    </>
  );
}
