/**
 * F83 – Ops Alert × Scenario × Knowledge Response Playbook Nexus (ASPKNEX)
 * Cross-correlates /v1/ops/alerts × /v1/scenario/list × /knowledge/.
 * Classifies each alert:
 *   FULLY_PLAYBOOKED – matched scenario AND KB article
 *   SCENARIO_ONLY    – matched scenario, no KB
 *   KB_ONLY          – matched KB article, no scenario
 *   UNPLAYBOOKED     – no scenario or KB backing (response blind spot)
 * UNPLAYBOOKED rows pulse red.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT   = 963920;
const Z          = 665;
const REFRESH_MS = 90_000;

const CY   = "#29E7FF";
const GR   = "#00c878";
const AM   = "#F5A623";
const RD   = "#FF3B3B";
const DIM  = "#3a5060";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
function authHdr() { return { Authorization: `Bearer ${API_KEY}` }; }

function kw(item) {
  return [
    item.name, item.title, item.description,
    item.type, item.kind, item.category,
    item.source, item.tags, item.severity,
    item.subject, item.rule,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function overlap(a, b) {
  const wa = a.split(/\W+/).filter(w => w.length > 3);
  const wb = new Set(b.split(/\W+/).filter(w => w.length > 3));
  return wa.filter(w => wb.has(w)).length;
}

function classify(alert, scenarios, articles) {
  const ak = kw(alert);
  const matchedScenarios = scenarios.filter(s => overlap(ak, kw(s)) >= 2);
  const matchedArticles  = articles.filter(a  => overlap(ak, kw(a)) >= 2);

  const hasScen = matchedScenarios.length > 0;
  const hasKb   = matchedArticles.length > 0;
  let cls;
  if (hasScen && hasKb) cls = "FULLY_PLAYBOOKED";
  else if (hasScen)     cls = "SCENARIO_ONLY";
  else if (hasKb)       cls = "KB_ONLY";
  else                  cls = "UNPLAYBOOKED";

  return {
    id: alert.id || alert.name || Math.random().toString(36).slice(2),
    alert,
    cls,
    matchedScenarios: matchedScenarios.slice(0, 5).map(s => ({
      name:  s.name || s.title || "?",
      score: overlap(ak, kw(s)),
    })),
    matchedArticles: matchedArticles.slice(0, 5).map(a => ({
      name:  a.title || a.name || a.subject || "?",
      score: overlap(ak, kw(a)),
    })),
  };
}

async function loadAll(base) {
  const [ar, sr, kr] = await Promise.all([
    fetch(`${base}/v1/ops/alerts`,    { headers: authHdr() }),
    fetch(`${base}/v1/scenario/list`, { headers: authHdr() }),
    fetch(`${base}/knowledge/`,       { headers: authHdr() }),
  ]);
  const [ad, sd, kd] = await Promise.all([
    ar.ok ? ar.json() : [],
    sr.ok ? sr.json() : [],
    kr.ok ? kr.json() : [],
  ]);
  const alerts    = Array.isArray(ad) ? ad : ad.data || ad.alerts || ad.items || [];
  const scenarios = Array.isArray(sd) ? sd : sd.data || sd.scenarios || sd.items || [];
  const articles  = Array.isArray(kd) ? kd : kd.data || kd.articles || kd.items || [];
  return { alerts, scenarios, articles };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────
export function isAspknexQuery(q) {
  return /\b(aspknex|alert\s+playbook|response\s+playbook|unplaybooked\s+alert|alert\s+scenario\s+knowledge|playbook\s+gap|alert\s+knowledge\s+gap|response\s+gap\s+knowledge|alert\s+kb|alert\s+knowledge)\b/i.test(q);
}

export async function buildAspknexScript() {
  try {
    const base = apiBase();
    const { alerts, scenarios, articles } = await loadAll(base);
    const rows       = alerts.map(a => classify(a, scenarios, articles));
    const unplayb    = rows.filter(r => r.cls === "UNPLAYBOOKED").length;
    const fully      = rows.filter(r => r.cls === "FULLY_PLAYBOOKED").length;
    const pct        = alerts.length ? Math.round((fully / alerts.length) * 100) : 0;
    return `Alert response playbook nexus: ${alerts.length} alerts, ${scenarios.length} scenarios, ${articles.length} KB articles. Fully playbooked: ${fully} (${pct}%). Unplaybooked (no scenario or KB backing): ${unplayb}. ${unplayb > 0 ? `${unplayb} alert${unplayb > 1 ? "s" : ""} lack any response plan — these are response blind spots.` : "All alerts have playbook coverage."}`;
  } catch (_) {
    return "Alert response playbook nexus status unavailable.";
  }
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function OpsAlertScenarioKnowledgeNexus() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState({});
  const [counts, setCounts]   = useState({ total: 0, fully: 0, scenOnly: 0, kbOnly: 0, unp: 0 });
  const timerRef              = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const { alerts, scenarios, articles } = await loadAll(base);
      const classified = alerts.map(a => classify(a, scenarios, articles));
      setRows(classified);
      setCounts({
        total:    classified.length,
        fully:    classified.filter(r => r.cls === "FULLY_PLAYBOOKED").length,
        scenOnly: classified.filter(r => r.cls === "SCENARIO_ONLY").length,
        kbOnly:   classified.filter(r => r.cls === "KB_ONLY").length,
        unp:      classified.filter(r => r.cls === "UNPLAYBOOKED").length,
      });
    } catch (e) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:aspknex-toggle", toggle);
    return () => window.removeEventListener("jarvis:aspknex-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      const name = (r.alert.name || r.alert.title || r.alert.rule || "").toLowerCase();
      if (!name.includes(s)) return false;
    }
    return true;
  });

  function toggleExpand(id) {
    setExpanded(e => ({ ...e, [id]: !e[id] }));
  }

  async function handleAssess() {
    try {
      const base = apiBase();
      const script = await buildAspknexScript();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const answer = (d.answer || script).slice(0, 400);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: await buildAspknexScript() } }));
    }
  }

  function clsColor(cls) {
    if (cls === "FULLY_PLAYBOOKED") return GR;
    if (cls === "SCENARIO_ONLY")    return AM;
    if (cls === "KB_ONLY")          return CY;
    return RD;
  }

  const TABS = ["ALL", "FULLY_PLAYBOOKED", "SCENARIO_ONLY", "KB_ONLY", "UNPLAYBOOKED"];

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z,
          background: "rgba(0,20,35,0.82)", border: `1px solid ${CY}`,
          color: CY, fontFamily: MONO, fontSize: 10, padding: "3px 8px",
          borderRadius: 3, cursor: "pointer", letterSpacing: 1,
        }}
        title="Alert × Scenario × Knowledge Response Playbook Nexus"
      >
        ◈ ASPKNEX
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: Z,
      background: "rgba(0,8,20,0.96)", display: "flex", flexDirection: "column",
      fontFamily: SANS, color: "#e0f0ff", overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        borderBottom: `1px solid ${CY}22`, background: "rgba(0,20,40,0.6)",
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: MONO, color: CY, fontSize: 12, letterSpacing: 2 }}>
          ◈ ASPKNEX
        </span>
        <span style={{ color: "#7090a0", fontSize: 11 }}>
          Ops Alert × Scenario × Knowledge Response Playbook Nexus
        </span>
        <button onClick={handleAssess} style={{
          marginLeft: "auto", background: "none", border: `1px solid ${AM}`,
          color: AM, fontFamily: MONO, fontSize: 10, padding: "2px 10px",
          borderRadius: 3, cursor: "pointer",
        }}>▶ ASSESS</button>
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: "#ff4466",
          fontSize: 16, cursor: "pointer", lineHeight: 1,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 10, padding: "10px 16px", flexShrink: 0 }}>
        {[
          { label: "ALERTS",            val: counts.total,    col: CY },
          { label: "FULLY PLAYBOOKED",  val: counts.fully,    col: GR },
          { label: "SCENARIO ONLY",     val: counts.scenOnly, col: AM },
          { label: "KB ONLY",           val: counts.kbOnly,   col: CY },
          { label: "UNPLAYBOOKED",      val: counts.unp,      col: RD },
        ].map(({ label, val, col }) => (
          <div key={label} style={{
            background: "rgba(0,30,50,0.6)", border: `1px solid ${col}33`,
            borderRadius: 6, padding: "6px 14px", minWidth: 90, textAlign: "center",
          }}>
            <div style={{ fontFamily: MONO, fontSize: 18, color: col }}>{val}</div>
            <div style={{ fontSize: 9, color: "#7090a0", letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* filter + search */}
      <div style={{ display: "flex", gap: 8, padding: "0 16px 8px", flexShrink: 0, alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${CY}22` : "none",
            border: `1px solid ${tab === t ? CY : DIM}`,
            color: tab === t ? CY : "#7090a0", fontFamily: MONO,
            fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer",
          }}>{t.replace("_", " ")}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search alerts…"
          style={{
            marginLeft: "auto", background: "rgba(0,20,40,0.5)",
            border: `1px solid ${DIM}`, borderRadius: 3, color: "#cce", padding: "3px 8px",
            fontFamily: MONO, fontSize: 10, width: 180,
          }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
        {loading && <div style={{ color: CY, fontFamily: MONO, fontSize: 11, padding: 20 }}>Loading…</div>}
        {error   && <div style={{ color: RD, fontFamily: MONO, fontSize: 11, padding: 20 }}>{error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: "#7090a0", fontFamily: MONO, fontSize: 11, padding: 20 }}>No alerts match filter.</div>
        )}
        {visible.map(r => {
          const name = r.alert.name || r.alert.title || r.alert.rule || r.id;
          const sev  = r.alert.severity || r.alert.level || "";
          const isUnp = r.cls === "UNPLAYBOOKED";
          return (
            <div key={r.id} style={{
              marginBottom: 6, borderRadius: 5,
              border: `1px solid ${clsColor(r.cls)}44`,
              background: isUnp ? "rgba(255,59,59,0.06)" : "rgba(0,25,45,0.4)",
              boxShadow: isUnp ? `0 0 8px ${RD}33` : "none",
              animation: isUnp ? "aspknexPulse 2.2s ease-in-out infinite" : "none",
            }}>
              <div
                onClick={() => toggleExpand(r.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 12px", cursor: "pointer",
                }}
              >
                <span style={{ fontFamily: MONO, fontSize: 10, color: clsColor(r.cls), minWidth: 130 }}>
                  {r.cls.replace(/_/g, " ")}
                </span>
                <span style={{ flex: 1, fontSize: 11, color: "#cce" }}>{name}</span>
                {sev && (
                  <span style={{
                    fontSize: 9, fontFamily: MONO, padding: "1px 5px", borderRadius: 2,
                    background: sev === "critical" ? RD + "33" : sev === "high" ? AM + "33" : DIM,
                    color: sev === "critical" ? RD : sev === "high" ? AM : "#7090a0",
                    border: `1px solid ${sev === "critical" ? RD : sev === "high" ? AM : DIM}55`,
                  }}>{sev.toUpperCase()}</span>
                )}
                <span style={{ color: "#5070a0", fontSize: 10, marginLeft: 4 }}>
                  {expanded[r.id] ? "▲" : "▼"}
                </span>
              </div>
              {expanded[r.id] && (
                <div style={{ padding: "0 12px 10px", borderTop: `1px solid ${DIM}55` }}>
                  {r.matchedScenarios.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: AM, fontFamily: MONO, marginBottom: 4, letterSpacing: 1 }}>
                        MATCHED SCENARIOS
                      </div>
                      {r.matchedScenarios.map((s, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 10, color: "#bcc", minWidth: 160, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.name}
                          </span>
                          <div style={{ flex: 1, height: 4, background: DIM, borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ width: `${Math.min(100, s.score * 20)}%`, height: "100%", background: AM }} />
                          </div>
                          <span style={{ fontFamily: MONO, fontSize: 9, color: AM, minWidth: 20 }}>{s.score}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {r.matchedArticles.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: CY, fontFamily: MONO, marginBottom: 4, letterSpacing: 1 }}>
                        MATCHED KB ARTICLES
                      </div>
                      {r.matchedArticles.map((a, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 10, color: "#bcc", minWidth: 160, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {a.name}
                          </span>
                          <div style={{ flex: 1, height: 4, background: DIM, borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ width: `${Math.min(100, a.score * 20)}%`, height: "100%", background: CY }} />
                          </div>
                          <span style={{ fontFamily: MONO, fontSize: 9, color: CY, minWidth: 20 }}>{a.score}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {r.matchedScenarios.length === 0 && r.matchedArticles.length === 0 && (
                    <div style={{ fontSize: 10, color: RD, fontFamily: MONO, marginTop: 8 }}>
                      No scenario or KB article coverage — response blind spot.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes aspknexPulse {
          0%, 100% { box-shadow: 0 0 8px ${RD}33; }
          50%       { box-shadow: 0 0 20px ${RD}88; }
        }
      `}</style>
    </div>
  );
}
