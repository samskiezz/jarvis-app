/**
 * F68 — Investigation–Scenario Convergence Tracker
 *
 * Parallel-fetches /v1/investigations + /v1/scenario/list + /entities/RiskSignal,
 * then keyword-correlates each investigation against every scenario to surface:
 *   CONVERGED — investigations that have at least one matched scenario
 *   ISOLATED  — investigations with zero scenario backing (operational gap)
 *
 * Stat tiles: investigations / scenarios / converged / isolated.
 * Filter tabs: ALL | CONVERGED | ISOLATED.
 * Text search over investigation title / status / priority.
 * Expand any investigation → matched scenarios (relevance score + status badge)
 *   + associated risk signals that keyword-match the investigation.
 * ▶ ASSESS: /v1/jarvis/agent/chat 2-sentence convergence brief + TTS
 *   via jarvis:speak-dossier.
 *
 * Toggle:  ◈ ISVCON  at bottom:8 left:16060, zIndex 69.
 * Event:   jarvis:isvcon-toggle
 * Voice:   "investigation scenario convergence / investigation scenarios /
 *           which investigations have scenarios / isvcon / convergence tracker"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 16060;
const POLL_MS  = 90_000; // 90 s

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ──────────────────────────────────────────────────

const ISVCON_RE =
  /\b(investigation[\s-]*scenario[\s-]*conv(?:ergence)?|investigation[\s-]*scenarios?|which\s+investigations?\s+(have|lack|need)\s+scenarios?|scenario[\s-]*backed\s+investigations?|isvcon|convergence[\s-]*tracker)\b/i;

export function isIsvconQuery(q) { return ISVCON_RE.test(q); }

export async function buildIsvconScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [invRes, scRes, rsRes] = await Promise.all([
      fetch(`${base}/v1/investigations`,   { headers: hdr }),
      fetch(`${base}/v1/scenario/list`,    { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
    ]);
    const invRaw = await invRes.json();
    const scRaw  = await scRes.json();
    const rsRaw  = await rsRes.json();

    const investigations = normaliseInvestigations(invRaw);
    const scenarios      = normaliseScenarios(scRaw);

    const converged = investigations.filter((inv) =>
      scenarios.some((sc) => scenarioRelevance(inv, sc) > 0)
    ).length;
    const isolated = investigations.length - converged;
    const pct      = investigations.length ? Math.round((converged / investigations.length) * 100) : 0;

    const worstIso = investigations.find((inv) =>
      !scenarios.some((sc) => scenarioRelevance(inv, sc) > 0)
    );

    const risks = normaliseRisks(rsRaw);
    const criticalRisks = risks.filter((r) => r.severity === "critical" || r.severity === "high").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS investigation-scenario convergence analysis: ${investigations.length} active investigations ` +
          `mapped against ${scenarios.length} operational scenarios — ${converged} investigations have scenario ` +
          `backing (${pct}%), ${isolated} investigations are isolated with no matched scenario. ` +
          `${criticalRisks} critical/high risk signals in the threat landscape. ` +
          `${worstIso ? `First isolated investigation: "${worstIso.title}" (status: ${worstIso.status}). ` : ""}` +
          `Give a 2-sentence operational convergence brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Investigation-scenario convergence analysis complete, sir.").trim();
  } catch {
    return "Convergence tracker unavailable at this time, sir.";
  }
}

// ── normalisers ───────────────────────────────────────────────────────────────

function normaliseInvestigations(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.investigations)       ? raw.investigations
    : Array.isArray(raw?.items)                ? raw.items
    : Array.isArray(raw?.results)              ? raw.results
    : [];
  return arr.map((inv, i) => ({
    id:       inv.id       || String(i),
    title:    inv.title    || inv.name        || inv.subject  || `Investigation ${i + 1}`,
    status:   (inv.status  || "open").toLowerCase(),
    priority: (inv.priority || inv.severity   || "medium").toLowerCase(),
    summary:  (inv.summary  || inv.description || inv.notes  || "").toString().slice(0, 300),
    tags:     Array.isArray(inv.tags) ? inv.tags.join(" ") : (inv.tags || ""),
  }));
}

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.scenarios)            ? raw.scenarios
    : Array.isArray(raw?.items)                ? raw.items
    : Array.isArray(raw?.results)              ? raw.results
    : [];
  return arr.map((s, i) => ({
    id:          s.id          || String(i),
    name:        s.name        || s.title       || s.scenario_name || `Scenario ${i + 1}`,
    description: (s.description || s.objective  || s.summary      || s.details || "").toString().slice(0, 300),
    status:      (s.status      || "unknown").toLowerCase(),
    type:        s.type        || s.scenario_type || "",
  }));
}

function normaliseRisks(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.risks)                ? raw.risks
    : Array.isArray(raw?.items)                ? raw.items
    : Array.isArray(raw?.results)              ? raw.results
    : [];
  return arr.map((r, i) => ({
    id:       r.id       || String(i),
    title:    r.title    || r.name     || `Risk ${i + 1}`,
    severity: (r.severity || r.level   || r.threat_level || "low").toLowerCase(),
    category: r.category || r.type     || "",
    summary:  (r.description || r.summary || "").toString().slice(0, 200),
  }));
}

// ── keyword helpers ───────────────────────────────────────────────────────────

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]"']+/)
    .filter((w) => w.length >= 3);
}

function scenarioRelevance(inv, sc) {
  const iw = keywords(`${inv.title} ${inv.summary} ${inv.tags}`);
  const sw = keywords(`${sc.name} ${sc.description} ${sc.type}`);
  return iw.filter((w) => sw.some((r) => r.includes(w) || w.includes(r))).length;
}

function riskRelevance(inv, risk) {
  const iw = keywords(`${inv.title} ${inv.summary} ${inv.tags}`);
  const rw = keywords(`${risk.title} ${risk.summary} ${risk.category}`);
  return iw.filter((w) => rw.some((r) => r.includes(w) || w.includes(r))).length;
}

function buildCorrelatedInvestigations(investigations, scenarios, risks) {
  return investigations.map((inv) => {
    const matchedScenarios = scenarios
      .map((sc) => ({ ...sc, score: scenarioRelevance(inv, sc) }))
      .filter((sc) => sc.score > 0)
      .sort((a, b) => b.score - a.score);
    const matchedRisks = risks
      .map((r) => ({ ...r, score: riskRelevance(inv, r) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    return { ...inv, scenarios: matchedScenarios, risks: matchedRisks, converged: matchedScenarios.length > 0 };
  });
}

// ── colour helpers ────────────────────────────────────────────────────────────

function statusColor(s) {
  if (s === "running" || s === "active")   return "#4ADE80";
  if (s === "pending" || s === "open")     return "#FFD700";
  if (s === "queued")                      return "#60A5FA";
  if (s === "failed" || s === "closed")    return "#6B7280";
  if (s === "investigating")               return "#C084FC";
  return "#9CA3AF";
}

function priorityColor(p) {
  if (p === "critical")   return "#FF3333";
  if (p === "high")       return "#FF8800";
  if (p === "medium")     return "#FFD700";
  return "#9CA3AF";
}

function severityColor(s) {
  if (s === "critical")   return "#FF3333";
  if (s === "high")       return "#FF8800";
  if (s === "medium")     return "#FFD700";
  if (s === "low")        return "#4ADE80";
  return "#9CA3AF";
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "CONVERGED", "ISOLATED"];

export default function InvestigationScenarioConvergence() {
  const [open,            setOpen]            = useState(false);
  const [investigations,  setInvestigations]  = useState([]);
  const [scenarios,       setScenarios]       = useState([]);
  const [risks,           setRisks]           = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [filter,          setFilter]          = useState("ALL");
  const [search,          setSearch]          = useState("");
  const [expanded,        setExpanded]        = useState(null);
  const [assessing,       setAssessing]       = useState(false);
  const [lastFetch,       setLastFetch]       = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [invRes, scRes, rsRes] = await Promise.all([
        fetch(`${base}/v1/investigations`,   { headers: hdr }),
        fetch(`${base}/v1/scenario/list`,    { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
      ]);
      const invRaw = await invRes.json();
      const scRaw  = await scRes.json();
      const rsRaw  = await rsRes.json();
      setInvestigations(normaliseInvestigations(invRaw));
      setScenarios(normaliseScenarios(scRaw));
      setRisks(normaliseRisks(rsRaw));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:isvcon-toggle", onToggle);
    return () => window.removeEventListener("jarvis:isvcon-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isIsvconQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated = buildCorrelatedInvestigations(investigations, scenarios, risks);
  const converged  = correlated.filter((inv) => inv.converged).length;
  const isolated   = investigations.length - converged;

  const q = search.toLowerCase();
  const visible = correlated
    .filter((inv) => {
      if (filter === "CONVERGED") return inv.converged;
      if (filter === "ISOLATED")  return !inv.converged;
      return true;
    })
    .filter((inv) =>
      !q ||
      inv.title.toLowerCase().includes(q) ||
      inv.status.toLowerCase().includes(q) ||
      inv.priority.toLowerCase().includes(q)
    );

  async function assess() {
    setAssessing(true);
    const text = await buildIsvconScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Investigation–Scenario Convergence (◈ ISVCON)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ ISVCON{isolated > 0 && (
          <span style={{
            marginLeft: 4, background: "#FF8800", color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{isolated}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 390,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${C.neon}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "68vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: C.neon, letterSpacing: 2, fontWeight: 700 }}>
              INVESTIGATION↔SCENARIO
            </span>
            <button
              onClick={assess}
              disabled={assessing || investigations.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || investigations.length === 0) ? 0.4 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 12px",
          }}>
            {[
              { label: "INVEST.",   val: investigations.length, color: C.blue    },
              { label: "SCENARIOS", val: scenarios.length,      color: C.neon    },
              { label: "CONVERGED", val: converged,             color: "#4ADE80" },
              { label: "ISOLATED",  val: isolated,              color: isolated > 0 ? "#FF8800" : "#6B7280" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 6,
                padding: "5px 4px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: S.fs.lg, fontWeight: 700 }}>{val}</div>
                <div style={{ color: S.text, fontSize: "8px", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 12px 4px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1, background: filter === t ? `${C.neon}22` : "transparent",
                border: `1px solid ${filter === t ? C.neon : S.border}`,
                color: filter === t ? C.neon : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>
                {t}{t === "ISOLATED" && isolated > 0 ? ` (${isolated})` : ""}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 12px 6px" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search title / status / priority…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,0,0,0.3)", border: `1px solid ${S.border}`,
                borderRadius: S.radius, color: S.textHi,
                fontFamily: S.mono, fontSize: "9px", padding: "3px 7px",
                outline: "none",
              }}
            />
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && investigations.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No investigations match.</div>
            ) : (
              visible.map((inv) => (
                <div key={inv.id} style={{ marginBottom: 6 }}>
                  <div
                    onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                      background: "rgba(0,0,0,0.25)",
                      borderLeft: `3px solid ${inv.converged ? "#4ADE80" : "#FF8800"}`,
                    }}
                  >
                    <span style={{ color: inv.converged ? "#4ADE80" : "#FF8800", fontSize: 10, width: 10 }}>
                      {inv.converged ? "●" : "○"}
                    </span>
                    <span style={{
                      flex: 1, color: S.textHi,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {inv.title}
                    </span>
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${priorityColor(inv.priority)}22`, color: priorityColor(inv.priority),
                      border: `1px solid ${priorityColor(inv.priority)}55`,
                      whiteSpace: "nowrap", textTransform: "uppercase",
                    }}>
                      {inv.priority || "?"}
                    </span>
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${statusColor(inv.status)}22`, color: statusColor(inv.status),
                      border: `1px solid ${statusColor(inv.status)}55`,
                      whiteSpace: "nowrap", textTransform: "uppercase",
                    }}>
                      {inv.status || "?"}
                    </span>
                    <span style={{
                      color: inv.converged ? "#4ADE80" : "#FF8800",
                      fontSize: "9px", minWidth: 28, textAlign: "right",
                    }}>
                      {inv.converged ? `${inv.scenarios.length}S` : "—"}
                    </span>
                    <span style={{ color: S.text, fontSize: 9 }}>
                      {expanded === inv.id ? "▴" : "▾"}
                    </span>
                  </div>

                  {expanded === inv.id && (
                    <div style={{
                      margin: "2px 0 2px 18px",
                      background: "rgba(0,0,0,0.18)", borderRadius: 4,
                      padding: "5px 8px",
                    }}>
                      {/* Matched scenarios */}
                      {inv.converged ? (
                        <>
                          <div style={{ color: C.neon, fontSize: "8px", letterSpacing: 1, marginBottom: 4 }}>
                            LINKED SCENARIOS
                          </div>
                          {inv.scenarios.map((sc) => (
                            <div key={sc.id} style={{
                              display: "flex", alignItems: "flex-start", gap: 6,
                              padding: "3px 0", borderBottom: `1px solid ${S.border}33`,
                            }}>
                              <span style={{ color: C.neon, fontSize: 9, marginTop: 1 }}>◦</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                  color: S.textHi, fontSize: "9px",
                                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>
                                  {sc.name}
                                </div>
                                {sc.type && (
                                  <div style={{ color: S.text, fontSize: "8px" }}>{sc.type}</div>
                                )}
                              </div>
                              <span style={{
                                fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                                background: `${statusColor(sc.status)}22`, color: statusColor(sc.status),
                                border: `1px solid ${statusColor(sc.status)}55`, whiteSpace: "nowrap",
                              }}>
                                {sc.status || "?"}
                              </span>
                              <span style={{ color: C.blue, fontSize: "9px", whiteSpace: "nowrap" }}>
                                rel:{sc.score}
                              </span>
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ color: "#FF8800", fontSize: "9px", padding: "2px 0" }}>
                          No scenarios aligned — this investigation lacks scenario coverage.
                        </div>
                      )}

                      {/* Associated risks */}
                      {inv.risks.length > 0 && (
                        <>
                          <div style={{ color: "#FF8800", fontSize: "8px", letterSpacing: 1, marginTop: 6, marginBottom: 4 }}>
                            ASSOCIATED RISKS
                          </div>
                          {inv.risks.map((r) => (
                            <div key={r.id} style={{
                              display: "flex", alignItems: "center", gap: 6,
                              padding: "2px 0", borderBottom: `1px solid ${S.border}22`,
                            }}>
                              <span style={{ color: severityColor(r.severity), fontSize: 9 }}>◆</span>
                              <span style={{
                                flex: 1, color: S.textHi, fontSize: "9px",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}>
                                {r.title}
                              </span>
                              <span style={{
                                fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                                background: `${severityColor(r.severity)}22`, color: severityColor(r.severity),
                                border: `1px solid ${severityColor(r.severity)}55`, whiteSpace: "nowrap",
                                textTransform: "uppercase",
                              }}>
                                {r.severity || "?"}
                              </span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "8px", letterSpacing: 0.5,
          }}>
            /v1/investigations · /v1/scenario/list · /entities/RiskSignal ·{" "}
            {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
