/**
 * SystemStatusAipSkillCoverage — F52.
 *
 * Parallel-fetches /v1/jarvis/system/status + /v1/aip/skill and
 * keyword-correlates each detected service (by name/type/status key)
 * against JARVIS AIP skills (name/description/category/domain) to surface:
 *
 *   SKILLED   — service has ≥1 matching AIP skill
 *   UNSKILLED — no skill covers this service (automation gap)
 *
 * Stat tiles: services / skills / skilled / unskilled.
 * Amber badge: unskilled count on toggle button.
 * Filter tabs: ALL | SKILLED | UNSKILLED + text search.
 * Expand service → matched AIP skill cards with type badge + relevance bar.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence coverage brief + TTS.
 *
 * Toggle:  ◈ SSAIP at left:978200, bottom:8, zIndex:124.
 * Event:   jarvis:ssaip-toggle
 * Voice:   "ssaip" / "service skill coverage" / "system skill" /
 *          "unskilled service" / "service coverage" / "skill gap service" /
 *          "service automation gap" / "which services have skills"
 * Refresh: 90s auto-refresh while open.
 * Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#00E5FF";
const AM  = "#FFB300";
const GR  = "#4CAF50";
const DIM = "rgba(255,255,255,0.04)";
const BG  = "rgba(6,10,18,0.94)";
const MN  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT   = 978200;
const Z_INDEX    = 124;

const SSAIP_RE =
  /\b(ssaip|service[._\-\s]skill[._\-\s]coverage|system[._\-\s]skill|unskilled[._\-\s]service|service[._\-\s]coverage|skill[._\-\s]gap[._\-\s]service|service[._\-\s]automation[._\-\s]gap|which[._\-\s]services[._\-\s]have[._\-\s]skills?)\b/i;

export function isSsaipQuery(t) {
  return SSAIP_RE.test(t || "");
}

// ── normalisers ───────────────────────────────────────────────────────────────

function normServices(raw) {
  if (!raw) return [];
  const arr = raw.services || raw.components || raw.checks || raw.modules || raw.items || [];
  if (Array.isArray(arr) && arr.length > 0) {
    return arr.map((s, i) => ({
      id:     s.id || s.name || String(i),
      name:   s.name || s.service || s.component || s.module || `Service ${i + 1}`,
      status: (s.status || s.health || s.state || "unknown").toLowerCase(),
      detail: String(s.message || s.detail || s.error || s.latency_ms || "").slice(0, 160),
    }));
  }
  // Flat object shape: { "backend": "ok", "vllm": "error" }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const entries = Object.entries(raw).filter(
      ([k, v]) => typeof v === "string" || (typeof v === "object" && v !== null)
    );
    if (entries.length > 0) {
      return entries.map(([k, v]) => {
        const status = typeof v === "string" ? v : (v?.status || v?.health || "unknown");
        const detail = typeof v === "object" ? String(v?.message || v?.detail || "").slice(0, 160) : "";
        return { id: k, name: k, status: status.toLowerCase(), detail };
      });
    }
  }
  return [];
}

function normSkills(raw) {
  if (!raw) return [];
  for (const k of ["skills", "aip_skills", "items", "results", "data"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return Array.isArray(raw) ? raw : [];
}

// ── keyword scoring ───────────────────────────────────────────────────────────

function tokens(s) {
  return String(s || "")
    .toLowerCase()
    .split(/[\s,._\-/|:;()\[\]]+/)
    .filter(t => t.length > 2);
}

function serviceTokens(svc) {
  return tokens(`${svc.name} ${svc.id} ${svc.detail}`);
}

function skillTokens(sk) {
  return tokens(
    [sk.name, sk.description, sk.category, sk.type, sk.domain,
     sk.capability, sk.skill_id, sk.id,
     ...(Array.isArray(sk.tags) ? sk.tags : [])].join(" ")
  );
}

function scoreMatch(svc, sk) {
  const st = serviceTokens(svc);
  const kt = skillTokens(sk);
  if (!st.length || !kt.length) return 0;
  const shared = st.filter(w => kt.includes(w));
  return shared.length / Math.max(st.length, kt.length);
}

// ── async script builder for JarvisBrain ─────────────────────────────────────

export async function buildSsaipScript() {
  const base = apiBase();
  const h = { Authorization: `Bearer ${API_KEY}` };
  const [sRes, kRes] = await Promise.allSettled([
    fetch(`${base}/v1/jarvis/system/status`, { headers: h }).then(r => r.json()),
    fetch(`${base}/v1/aip/skill`,             { headers: h }).then(r => r.json()),
  ]);
  const services = normServices(sRes.status === "fulfilled" ? sRes.value : null);
  const skills   = normSkills  (kRes.status === "fulfilled" ? kRes.value : null);

  const skilled   = services.filter(svc => skills.some(sk => scoreMatch(svc, sk) > 0));
  const unskilled = services.filter(svc => !skills.some(sk => scoreMatch(svc, sk) > 0));

  const snapshot =
    `Services detected: ${services.length}, AIP skills: ${skills.length}, ` +
    `skilled: ${skilled.length}, unskilled (coverage gap): ${unskilled.length}.` +
    (unskilled.length ? ` Unskilled services: ${unskilled.map(s => s.name).join(", ")}.` : "");

  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body:    JSON.stringify({
      message: `System service AIP skill coverage analysis. Provide exactly 2 sentences: current automation coverage status across detected services, and recommended action to close skill gaps. Data: ${snapshot}`,
    }),
  });
  const d = await r.json();
  return (d.answer ||
    `${unskilled.length} services lack AIP skill automation coverage. ` +
    `Prioritise skill development for uncovered services to improve autonomous operations.`
  ).replace(/<<ACTION:[^>]*>>/g, "").trim();
}

// ── component ─────────────────────────────────────────────────────────────────

export default function SystemStatusAipSkillCoverage() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [services, setServices] = useState([]);
  const [skills, setSkills]     = useState([]);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [briefText, setBrief]   = useState("");
  const [briefing, setBriefing] = useState(false);
  const [ts, setTs]             = useState(null);
  const timerRef                = useRef(null);
  const audioRef                = useRef(null);
  const base                    = apiBase();

  const authH = useCallback(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_KEY}`,
  }), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const h = { Authorization: `Bearer ${API_KEY}` };
      const [sRes, kRes] = await Promise.allSettled([
        fetch(`${base}/v1/jarvis/system/status`, { headers: h }).then(r => r.json()),
        fetch(`${base}/v1/aip/skill`,             { headers: h }).then(r => r.json()),
      ]);
      setServices(normServices(sRes.status === "fulfilled" ? sRes.value : null));
      setSkills  (normSkills  (kRes.status === "fulfilled" ? kRes.value : null));
      setTs(new Date());
    } catch { /* retain last data */ }
    finally { setLoading(false); }
  }, [base]);

  const speak = useCallback(async (text) => {
    if (!text) return;
    try {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      const voice = getActiveVoice ? getActiveVoice() : "onyx";
      const r = await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers: authH(),
        body:   JSON.stringify({ text: text.slice(0, 400), voice }),
      });
      const blob  = await r.blob();
      const url   = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play().catch(() => {});
      audio.onended = () => URL.revokeObjectURL(url);
    } catch { /* TTS unavailable */ }
  }, [base, authH]);

  const runBrief = useCallback(async () => {
    setBriefing(true);
    try {
      const text = await buildSsaipScript();
      setBrief(text);
      speak(text);
    } catch { setBrief("Service AIP skill coverage assessment unavailable."); }
    finally { setBriefing(false); }
  }, [speak]);

  // Auto-refresh while open
  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  // Event toggle
  useEffect(() => {
    const handler = () => { setOpen(v => { if (!v) fetchData(); return !v; }); };
    window.addEventListener("jarvis:ssaip-toggle", handler);
    return () => window.removeEventListener("jarvis:ssaip-toggle", handler);
  }, [fetchData]);

  // Enrich each service with matched skills
  const enriched = services.map(svc => {
    const links = skills
      .map(sk => ({ sk, score: scoreMatch(svc, sk) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...svc, links, skilled: links.length > 0 };
  });

  const unskilledCount = enriched.filter(s => !s.skilled).length;

  const filtered = enriched.filter(svc => {
    if (filter === "SKILLED"   && !svc.skilled) return false;
    if (filter === "UNSKILLED" &&  svc.skilled) return false;
    if (search) {
      const q = search.toLowerCase();
      return svc.name.toLowerCase().includes(q) ||
             svc.status.toLowerCase().includes(q) ||
             svc.detail.toLowerCase().includes(q);
    }
    return true;
  });

  const TABS = ["ALL", "SKILLED", "UNSKILLED"];

  function statusColor(st = "") {
    if (st === "ok" || st === "online" || st === "up" || st === "healthy") return GR;
    if (st === "error" || st === "down" || st === "critical" || st === "offline") return "#EF4444";
    if (st === "degraded" || st === "warning" || st === "slow") return AM;
    return CY;
  }

  function skillTypeColor(type = "") {
    const t = type.toLowerCase();
    if (t.includes("security")) return "#EF4444";
    if (t.includes("infra") || t.includes("ops")) return AM;
    if (t.includes("data") || t.includes("analytics")) return "#818CF8";
    return CY;
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { if (!open) { setOpen(true); fetchData(); } else setOpen(false); }}
        title="System Status × AIP Skill Coverage"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: MN, fontSize: 10, letterSpacing: 1,
          background: open ? CY : "rgba(5,8,13,0.82)",
          color:      open ? "#04060A" : CY,
          border:     `1px solid ${CY}`, borderRadius: 4, padding: "3px 8px",
          cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: `0 0 10px ${CY}${open ? "" : "44"}`,
        }}
      >
        ◈ SSAIP
        {unskilledCount > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#04060A",
            borderRadius: 3, padding: "0 4px", fontSize: 9, fontWeight: 700,
          }}>{unskilledCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: BTN_LEFT, bottom: 36, zIndex: Z_INDEX,
          width: "min(560px,92vw)", maxHeight: "74vh",
          background: BG, border: `1px solid ${CY}44`,
          borderRadius: 10, padding: "14px 16px",
          backdropFilter: "blur(12px)", boxShadow: `0 0 40px ${CY}18`,
          fontFamily: MN, color: "#DCEBF5",
          display: "flex", flexDirection: "column", gap: 10, overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>
              SYSTEM STATUS × AIP SKILL COVERAGE
            </span>
            {ts && (
              <span style={{ marginLeft: "auto", fontSize: 9, color: "#6E8AA0" }}>
                {ts.toLocaleTimeString()}
              </span>
            )}
            <button onClick={fetchData} title="Refresh"
              style={{ background: "none", border: `1px solid ${CY}44`, color: CY, borderRadius: 3, padding: "1px 6px", fontSize: 10, cursor: "pointer" }}>
              ↻
            </button>
          </div>

          {/* Stat tiles */}
          {services.length > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              {[
                ["SERVICES",  services.length,                                    CY],
                ["AIP SKILLS", skills.length,                                      "#B0BEC5"],
                ["SKILLED",   enriched.filter(s => s.skilled).length,             GR],
                ["UNSKILLED", unskilledCount,                                      AM],
              ].map(([label, val, col]) => (
                <div key={label} style={{
                  flex: 1, textAlign: "center",
                  background: DIM, borderRadius: 6, padding: "6px 4px",
                  border: `1px solid ${col}22`,
                }}>
                  <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                  <div style={{ color: "#6E8AA0", fontSize: 8, letterSpacing: 1 }}>{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setFilter(t)} style={{
                background: filter === t ? CY : "rgba(255,255,255,0.05)",
                color:      filter === t ? "#04060A" : "#8AADCC",
                border: `1px solid ${CY}44`, borderRadius: 4, padding: "2px 10px",
                fontSize: 9, cursor: "pointer", letterSpacing: 1,
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search services…"
              style={{
                marginLeft: "auto", background: "rgba(0,229,255,0.06)",
                border: `1px solid ${CY}33`, borderRadius: 4, padding: "3px 8px",
                color: "#DCEBF5", fontSize: 10, outline: "none", width: 150,
              }}
            />
          </div>

          {/* Service list */}
          <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
            {loading && <span style={{ color: "#6E8AA0", fontSize: 11 }}>loading…</span>}
            {!loading && services.length === 0 && (
              <span style={{ color: "#6E8AA0", fontSize: 11 }}>No services detected from system status endpoint.</span>
            )}
            {!loading && services.length > 0 && filtered.length === 0 && (
              <span style={{ color: "#6E8AA0", fontSize: 11 }}>No services match current filter.</span>
            )}
            {filtered.map((svc, i) => {
              const isExp   = expanded === i;
              const covCol  = svc.skilled ? GR : AM;
              const stCol   = statusColor(svc.status);
              return (
                <div key={svc.id || i} style={{
                  background: isExp ? "rgba(0,229,255,0.07)" : "rgba(255,255,255,0.03)",
                  border:     `1px solid ${covCol}33`,
                  borderRadius: 7, padding: "8px 10px", cursor: "pointer",
                }} onClick={() => setExpanded(isExp ? null : i)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize: 8, letterSpacing: 1, padding: "1px 6px",
                      background: `${covCol}22`, color: covCol,
                      border: `1px solid ${covCol}55`, borderRadius: 3,
                    }}>{svc.skilled ? "SKILLED" : "UNSKILLED"}</span>
                    <span style={{
                      fontSize: 8, padding: "1px 5px",
                      background: `${stCol}18`, color: stCol,
                      border: `1px solid ${stCol}44`, borderRadius: 3,
                    }}>{svc.status.toUpperCase() || "UNKNOWN"}</span>
                    <span style={{ fontSize: 11, flex: 1 }}>{svc.name}</span>
                    <span style={{ fontSize: 10, color: CY }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {svc.detail && (
                    <div style={{ fontSize: 9, color: "#6E8AA0", marginTop: 2 }}>
                      {svc.detail.slice(0, 100)}{svc.detail.length > 100 ? "…" : ""}
                    </div>
                  )}

                  {/* Expanded: matched AIP skills */}
                  {isExp && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                      {svc.links.length === 0 && (
                        <span style={{ fontSize: 9, color: AM }}>
                          No AIP skills cover this service — automation gap identified.
                        </span>
                      )}
                      {svc.links.map(({ sk, score }, li) => {
                        const tcol = skillTypeColor(sk.type || sk.category || "");
                        return (
                          <div key={sk.id || sk.skill_id || li} style={{
                            background: "rgba(0,229,255,0.05)",
                            border: `1px solid ${tcol}22`,
                            borderRadius: 5, padding: "6px 8px",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {(sk.type || sk.category) && (
                                <span style={{
                                  fontSize: 8, padding: "1px 5px",
                                  background: `${tcol}22`, color: tcol,
                                  border: `1px solid ${tcol}55`, borderRadius: 3, letterSpacing: 1,
                                }}>{(sk.type || sk.category).toUpperCase()}</span>
                              )}
                              <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1 }}>
                                {sk.name || sk.skill_id || "(unnamed skill)"}
                              </span>
                            </div>
                            {sk.description && (
                              <div style={{ fontSize: 9, color: "#6E8AA0", marginTop: 2 }}>
                                {sk.description.slice(0, 80)}{sk.description.length > 80 ? "…" : ""}
                              </div>
                            )}
                            {/* Relevance bar */}
                            <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                                <div style={{ width: `${Math.round(score * 100)}%`, height: "100%", background: CY, borderRadius: 2 }} />
                              </div>
                              <span style={{ fontSize: 8, color: CY, minWidth: 28 }}>
                                {Math.round(score * 100)}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* AI brief */}
          <div style={{ borderTop: `1px solid ${CY}22`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {briefText && (
              <div style={{ fontSize: 10, color: "#B0C4D8", lineHeight: 1.5 }}>{briefText}</div>
            )}
            <button onClick={runBrief} disabled={briefing} style={{
              alignSelf: "flex-start",
              background: briefing ? "rgba(0,229,255,0.1)" : "rgba(0,229,255,0.14)",
              border: `1px solid ${CY}55`, color: CY, borderRadius: 4,
              padding: "4px 12px", fontSize: 10,
              cursor: briefing ? "default" : "pointer", letterSpacing: 1,
            }}>
              {briefing ? "assessing…" : "▶ ASSESS COVERAGE"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
