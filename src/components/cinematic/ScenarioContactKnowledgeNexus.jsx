/**
 * F62 – Scenario × Contact × Knowledge Targeting Nexus (SCKNEX)
 * Cross-correlates /v1/scenario/list × /entities/Contact × /knowledge/.
 * Classifies each scenario:
 *   FULL_INTEL    – matched contact AND KB article
 *   CONTACT_ONLY  – matched contact, no KB article
 *   KB_ONLY       – matched KB article, no contact
 *   BLIND         – no match in either (intelligence gap)
 * BLIND rows pulse red.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT  = 946720;
const Z         = 645;
const REFRESH_MS = 90_000;

const CY  = "#29E7FF";
const GR  = "#00c878";
const AM  = "#F5A623";
const RD  = "#FF3B3B";
const PU  = "#a855f7";
const DIM = "#3a5060";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
function authHdr() { return { Authorization: `Bearer ${API_KEY}` }; }

const SCKNEX_RE = /\b(scknex|scenario.{0,12}contact|scenario.{0,12}knowledge|contact.{0,12}scenario|blind.{0,12}scenario|scenario.{0,12}target(ing)?|scenario.{0,12}intel.{0,12}(gap|cover)|scenario.{0,12}(grounded|covered|backed))\b/i;

export function isScknexQuery(text) { return SCKNEX_RE.test(text || ""); }

export async function buildScknexScript() {
  try {
    const base = apiBase();
    const [scRes, ctRes, kbRes] = await Promise.all([
      fetch(`${base}/v1/scenario/list`, { headers: authHdr() }),
      fetch(`${base}/entities/Contact`,  { headers: authHdr() }),
      fetch(`${base}/knowledge/`,         { headers: authHdr() }),
    ]);
    const [scenarios, contacts, kb] = await Promise.all([
      scRes.ok ? scRes.json() : [],
      ctRes.ok ? ctRes.json() : [],
      kbRes.ok ? kbRes.json() : [],
    ]);
    const scArr = (Array.isArray(scenarios) ? scenarios : scenarios?.scenarios ?? scenarios?.data ?? []).slice(0, 60);
    const ctArr = (Array.isArray(contacts) ? contacts : contacts?.data ?? []).slice(0, 200);
    const kbArr = (Array.isArray(kb) ? kb : kb?.data ?? kb?.articles ?? []).slice(0, 200);
    const classified = classify(scArr, ctArr, kbArr);
    const blind = classified.filter(r => r.cls === "BLIND").length;
    const full  = classified.filter(r => r.cls === "FULL_INTEL").length;
    return `SCKNEX nexus: ${scArr.length} scenarios, ${ctArr.length} contacts, ${kbArr.length} KB articles. ` +
      `Coverage: FULL_INTEL ${full}, CONTACT_ONLY ${classified.filter(r => r.cls === "CONTACT_ONLY").length}, ` +
      `KB_ONLY ${classified.filter(r => r.cls === "KB_ONLY").length}, BLIND ${blind}. ` +
      (blind > 0
        ? `${blind} scenario${blind !== 1 ? "s" : ""} have no contact or knowledge backing — intelligence gap requiring immediate attention.`
        : "All scenarios have at least one targeting anchor.");
  } catch (e) {
    return `SCKNEX nexus unavailable: ${e.message}`;
  }
}

function tok(str) {
  return String(str || "").toLowerCase().split(/\W+/).filter(t => t.length > 2);
}
function overlap(a, b) {
  const setB = new Set(b);
  return a.some(t => setB.has(t));
}

function classify(scenarios, contacts, kb) {
  return scenarios.map(sc => {
    const stoks = tok((sc.title || sc.name || sc.description || ""));
    const matchedContacts = contacts.filter(c =>
      overlap(stoks, tok((c.name || "") + " " + (c.role || "") + " " + (c.organisation || c.org || "") + " " + (c.description || "")))
    );
    const matchedKb = kb.filter(k =>
      overlap(stoks, tok((k.title || k.name || "") + " " + (k.description || k.summary || "") + " " + (k.category || "")))
    );
    const hasCt = matchedContacts.length > 0;
    const hasKb = matchedKb.length > 0;
    let cls;
    if (hasCt && hasKb)       cls = "FULL_INTEL";
    else if (hasCt && !hasKb) cls = "CONTACT_ONLY";
    else if (!hasCt && hasKb) cls = "KB_ONLY";
    else                      cls = "BLIND";
    return { sc, cls, matchedContacts, matchedKb };
  });
}

const CLS_COLOR = {
  FULL_INTEL:    GR,
  CONTACT_ONLY:  CY,
  KB_ONLY:       AM,
  BLIND:         RD,
};
const CLS_LABEL = {
  FULL_INTEL:    "FULL INTEL",
  CONTACT_ONLY:  "CONTACT ONLY",
  KB_ONLY:       "KB ONLY",
  BLIND:         "BLIND",
};
const TABS = ["ALL", "FULL_INTEL", "CONTACT_ONLY", "KB_ONLY", "BLIND"];

export default function ScenarioContactKnowledgeNexus() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [ctCount, setCtCount] = useState(0);
  const [kbCount, setKbCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [scRes, ctRes, kbRes] = await Promise.all([
        fetch(`${base}/v1/scenario/list`, { headers: authHdr() }),
        fetch(`${base}/entities/Contact`,  { headers: authHdr() }),
        fetch(`${base}/knowledge/`,         { headers: authHdr() }),
      ]);
      const [scenarios, contacts, kb] = await Promise.all([
        scRes.ok ? scRes.json() : [],
        ctRes.ok ? ctRes.json() : [],
        kbRes.ok ? kbRes.json() : [],
      ]);
      const scArr = (Array.isArray(scenarios) ? scenarios : scenarios?.scenarios ?? scenarios?.data ?? []).slice(0, 60);
      const ctArr = (Array.isArray(contacts) ? contacts : contacts?.data ?? []).slice(0, 200);
      const kbArr = (Array.isArray(kb) ? kb : kb?.data ?? kb?.articles ?? []).slice(0, 200);
      setCtCount(ctArr.length);
      setKbCount(kbArr.length);
      setRows(classify(scArr, ctArr, kbArr));
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) { load(); timerRef.current = setInterval(load, REFRESH_MS); }
    else { clearInterval(timerRef.current); }
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:scknex-toggle", handler);
    return () => window.removeEventListener("jarvis:scknex-toggle", handler);
  }, []);

  const blind    = rows.filter(r => r.cls === "BLIND").length;
  const visible  = rows
    .filter(r => tab === "ALL" || r.cls === tab)
    .filter(r => {
      if (!search) return true;
      const name = r.sc.title || r.sc.name || "";
      return name.toLowerCase().includes(search.toLowerCase());
    });

  async function assess() {
    setAssessing(true);
    try {
      const base = apiBase();
      const script = await buildScknexScript();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const reply = (d.answer || d.response || script).slice(0, 500);
      const voice = (typeof getActiveVoice === "function" ? getActiveVoice() : null) || "ash";
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply, voice }),
      });
    } catch (_) {}
    setAssessing(false);
  }

  const btnPulse = blind > 0;

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z,
          background: open ? `rgba(41,231,255,0.18)` : `rgba(5,12,20,0.82)`,
          border: `1px solid ${open ? CY : DIM}`,
          borderRadius: 6,
          color: open ? CY : DIM,
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 1.5,
          padding: "4px 9px",
          cursor: "pointer",
          whiteSpace: "nowrap",
          animation: btnPulse && !open ? "scknex-pulse 2.4s ease-in-out infinite" : "none",
        }}
        title="Scenario × Contact × Knowledge Targeting Nexus"
      >
        ◈ SCKNEX
      </button>

      <style>{`
        @keyframes scknex-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(255,59,59,0); border-color: #3a5060; }
          50%      { box-shadow: 0 0 0 5px rgba(255,59,59,0.28); border-color: ${RD}; }
        }
      `}</style>

      {open && (
        <div
          style={{
            position: "fixed", right: 16, top: 64, zIndex: Z + 100,
            width: "min(640px, 96vw)",
            maxHeight: "82vh",
            display: "flex", flexDirection: "column",
            background: "rgba(5,12,20,0.95)",
            backdropFilter: "blur(16px)",
            border: `1px solid rgba(41,231,255,0.18)`,
            borderTop: `2px solid ${CY}`,
            borderRadius: 10,
            boxShadow: `0 0 60px rgba(41,231,255,0.10), 0 20px 48px rgba(0,0,0,0.75)`,
            fontFamily: SANS,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px",
            borderBottom: `1px solid rgba(41,231,255,0.09)`,
          }}>
            <span style={{ color: CY, fontFamily: MONO, fontSize: 11, letterSpacing: 1.5 }}>◈ SCKNEX</span>
            <span style={{ color: "#5a7a8a", fontFamily: MONO, fontSize: 10, flex: 1, letterSpacing: 1 }}>
              SCENARIO × CONTACT × KNOWLEDGE NEXUS
            </span>
            {loading && <span style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>SYNC…</span>}
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14, lineHeight: 1 }}
            >×</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 14px 0" }}>
            {[
              { label: "SCENARIOS", val: rows.length,                                         color: CY },
              { label: "CONTACTS",  val: ctCount,                                              color: GR },
              { label: "KB ARTS",   val: kbCount,                                              color: AM },
              { label: "BLIND",     val: blind,                                                color: RD },
            ].map(t => (
              <div key={t.label} style={{
                flex: 1, background: "rgba(255,255,255,0.03)",
                border: `1px solid rgba(41,231,255,0.08)`, borderRadius: 6,
                padding: "8px 10px", textAlign: "center",
              }}>
                <div style={{ color: t.color, fontFamily: MONO, fontSize: 16, fontWeight: 700 }}>{t.val}</div>
                <div style={{ color: DIM, fontFamily: MONO, fontSize: 9, letterSpacing: 1.5, marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 6, padding: "10px 14px 0", flexWrap: "wrap", alignItems: "center" }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `rgba(41,231,255,0.12)` : "transparent",
                  border: `1px solid ${tab === t ? CY : DIM}`,
                  borderRadius: 5, color: tab === t ? CY : DIM,
                  fontFamily: MONO, fontSize: 9, letterSpacing: 1.2,
                  padding: "3px 8px", cursor: "pointer",
                }}
              >
                {t === "ALL" ? "ALL" : CLS_LABEL[t] || t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search scenarios…"
              style={{
                marginLeft: "auto",
                background: "rgba(41,231,255,0.04)",
                border: `1px solid ${DIM}`,
                borderRadius: 5, color: "#a0c0cc",
                fontFamily: MONO, fontSize: 10, padding: "3px 8px",
                outline: "none", width: 150,
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px 0" }}>
            {visible.length === 0 && (
              <div style={{ color: DIM, fontFamily: MONO, fontSize: 11, textAlign: "center", padding: "24px 0" }}>
                {loading ? "Loading nexus…" : "No scenarios match filter."}
              </div>
            )}
            {visible.map((r, i) => {
              const name  = r.sc.title || r.sc.name || `Scenario ${i + 1}`;
              const color = CLS_COLOR[r.cls];
              const isExp = expanded === i;
              return (
                <div key={i}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "7px 10px", marginBottom: 3, borderRadius: 6,
                      background: isExp ? "rgba(41,231,255,0.05)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${isExp ? `rgba(41,231,255,0.18)` : "rgba(41,231,255,0.05)"}`,
                      cursor: "pointer",
                      borderLeft: `3px solid ${r.cls === "BLIND" ? RD : color}`,
                      animation: r.cls === "BLIND" ? "scknex-pulse 2.4s ease-in-out infinite" : "none",
                    }}
                  >
                    <span style={{ color, fontFamily: MONO, fontSize: 9, letterSpacing: 1, flexShrink: 0, width: 90 }}>
                      {CLS_LABEL[r.cls]}
                    </span>
                    <span style={{ flex: 1, color: "#b0ccd5", fontSize: 12, fontFamily: SANS, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                    </span>
                    <span style={{ color: DIM, fontFamily: MONO, fontSize: 9, flexShrink: 0 }}>
                      {r.matchedContacts.length}ct / {r.matchedKb.length}kb
                    </span>
                    <span style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{
                      marginBottom: 6, padding: "8px 10px",
                      background: "rgba(41,231,255,0.02)",
                      border: "1px solid rgba(41,231,255,0.08)",
                      borderRadius: 6, borderLeft: `3px solid ${CY}44`,
                    }}>
                      {/* Contacts */}
                      {r.matchedContacts.length > 0 ? (
                        <>
                          <div style={{ color: CY, fontFamily: MONO, fontSize: 9, letterSpacing: 1.2, marginBottom: 5 }}>CONTACTS ({r.matchedContacts.length})</div>
                          {r.matchedContacts.slice(0, 5).map((c, ci) => {
                            const cname = c.name || c.full_name || `Contact ${ci + 1}`;
                            const crole = c.role || c.title || "";
                            const w = Math.round(70 + Math.random() * 30);
                            return (
                              <div key={ci} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <div style={{ height: 4, width: `${w}%`, maxWidth: 180, background: CY, borderRadius: 2, opacity: 0.7 }} />
                                <span style={{ color: "#8aabb5", fontFamily: MONO, fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {cname}{crole ? ` · ${crole}` : ""}
                                </span>
                              </div>
                            );
                          })}
                          {r.matchedContacts.length > 5 && (
                            <div style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>+{r.matchedContacts.length - 5} more contacts</div>
                          )}
                        </>
                      ) : (
                        <div style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>No contact matches.</div>
                      )}

                      {/* KB articles */}
                      {r.matchedKb.length > 0 && (
                        <>
                          <div style={{ color: AM, fontFamily: MONO, fontSize: 9, letterSpacing: 1.2, marginTop: 8, marginBottom: 5 }}>KNOWLEDGE ({r.matchedKb.length})</div>
                          {r.matchedKb.slice(0, 5).map((k, ki) => {
                            const ktitle = k.title || k.name || `Article ${ki + 1}`;
                            const w = Math.round(55 + Math.random() * 40);
                            return (
                              <div key={ki} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <div style={{ height: 4, width: `${w}%`, maxWidth: 180, background: AM, borderRadius: 2, opacity: 0.7 }} />
                                <span style={{ color: "#8aabb5", fontFamily: MONO, fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {ktitle}
                                </span>
                              </div>
                            );
                          })}
                          {r.matchedKb.length > 5 && (
                            <div style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>+{r.matchedKb.length - 5} more articles</div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "8px 14px",
            borderTop: `1px solid rgba(41,231,255,0.07)`,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ color: DIM, fontFamily: MONO, fontSize: 9, flex: 1 }}>
              {visible.length} of {rows.length} scenarios · 90 s refresh
            </span>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? "rgba(41,231,255,0.06)" : "rgba(41,231,255,0.12)",
                border: `1px solid ${assessing ? DIM : CY}`,
                borderRadius: 5, color: assessing ? DIM : CY,
                fontFamily: MONO, fontSize: 10, letterSpacing: 1,
                padding: "4px 14px", cursor: assessing ? "not-allowed" : "pointer",
              }}
            >
              {assessing ? "ASSESSING…" : "▶ ASSESS"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
