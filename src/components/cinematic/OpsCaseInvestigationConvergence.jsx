/**
 * OpsCaseInvestigationConvergence — F319.
 *
 * Data sources (all real):
 *   GET /v1/ops/cases        → [{id,title,description,status,severity,created_at,...}]
 *   GET /v1/investigations   → [{id,title,description,status,...}]
 *   POST /v1/jarvis/agent/chat → ASSESS
 *
 * Displays:
 *   - Cases list cross-referenced against investigations by title+description keywords.
 *   - Classification per case:
 *       LINKED       – matched case + investigation (green)
 *       CASED        – ops case with no investigation match (amber)
 *       INVESTIGATED – investigation with no ops case match (blue)
 *       OPEN         – unresolved / no operational coverage (red)
 *   - Red pulse on OPEN count.
 *   - Expandable rows show matched investigations with status badge.
 *   - ASSESS → /v1/jarvis/agent/chat + TTS.
 *
 * Toggle: ◈ OPSINV  left:226440  bottom:8  zIndex:415
 * Event:  jarvis:opsinv-toggle
 * Voice:  "ops case investigation / opsinv / case convergence /
 *          ops cases investigation / case investigation convergence / ops investigation"
 *
 * Exported for JarvisBrain: isOpsinvQuery, buildOpsinvScript
 * Mounted via src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

// ── palette ────────────────────────────────────────────────────────────────
const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const VI   = "#A78BFA";
const SURF = "rgba(6,11,18,0.97)";
const BORD = "rgba(41,231,255,0.18)";
const DIM  = "rgba(41,231,255,0.35)";

// ── constants ─────────────────────────────────────────────────────────────
const BTN_LEFT = 226440;
const PANEL_W  = 960;
const PANEL_H  = 680;
const REFRESH  = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ── JarvisBrain exports ───────────────────────────────────────────────────
const OPSINV_RE =
  /\b(ops[\s-]?case[\s-]?invest|opsinv\b|case[\s-]?convergence|ops[\s-]?cases[\s-]?invest|case[\s-]?invest[\s-]?convergence|ops[\s-]?invest)\b/i;

export function isOpsinvQuery(q) {
  return OPSINV_RE.test(q || "");
}

export function buildOpsinvScript(q) {
  return `Open the Ops Case–Investigation Convergence panel and analyse case coverage gaps related to: "${q}".`;
}

// ── helpers ───────────────────────────────────────────────────────────────
const hdrs = () => ({
  "Content-Type": "application/json",
  "x-api-key": API_KEY,
  Authorization: `Bearer ${API_KEY}`,
});

function keywords(str) {
  if (!str) return [];
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlaps(a, b) {
  const ka = new Set(keywords(a));
  for (const w of keywords(b)) {
    if (ka.has(w)) return true;
  }
  return false;
}

function matches(cas, inv) {
  const haystack = `${inv.title || ""} ${inv.description || ""}`;
  const needle   = `${cas.title || ""} ${cas.description || ""}`;
  return overlaps(needle, haystack);
}

function classify(cas, invMatches) {
  const open = ["open", "new", "pending", "active"].includes(
    (cas.status || "").toLowerCase()
  );
  if (invMatches.length > 0) return "LINKED";
  if (!open)                 return "CASED";
  return "OPEN";
}

function statusBadge(status) {
  const s = (status || "unknown").toLowerCase();
  const c =
    s.includes("open") || s.includes("active") ? RD :
    s.includes("closed") || s.includes("resolved") ? GN :
    AM;
  return { label: status || "unknown", color: c };
}

function severityBadge(sev) {
  const s = (sev || "").toLowerCase();
  const c =
    s === "critical" ? RD :
    s === "high"     ? AM :
    s === "medium"   ? VI :
    CY;
  return { label: sev || "–", color: c };
}

// ── component ─────────────────────────────────────────────────────────────
export default function OpsCaseInvestigationConvergence() {
  const [open,     setOpen]     = useState(false);
  const [cases,    setCases]    = useState([]);
  const [invList,  setInvList]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [assessing,setAssessing]= useState(false);
  const [assess,   setAssess]   = useState("");
  const timerRef = useRef(null);

  // ── event listener for toggle ────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:opsinv-toggle", handler);
    return () => window.removeEventListener("jarvis:opsinv-toggle", handler);
  }, []);

  // ── fetch ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = apiBase();
      const [cr, ir] = await Promise.all([
        fetch(`${base}/v1/ops/cases`, { headers: hdrs() }),
        fetch(`${base}/v1/investigations`, { headers: hdrs() }),
      ]);
      const [cd, id_] = await Promise.all([cr.json(), ir.json()]);
      setCases(Array.isArray(cd) ? cd : (cd.items || cd.cases || []));
      setInvList(Array.isArray(id_) ? id_ : (id_.items || id_.investigations || []));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  // ── classify rows ────────────────────────────────────────────────────────
  const rows = cases.map((cas) => {
    const invMatches = invList.filter((inv) => matches(cas, inv));
    return { cas, invMatches, cls: classify(cas, invMatches) };
  });

  // Also surface investigations with NO matching case
  const casedInvIds = new Set(
    rows.flatMap(({ invMatches }) => invMatches.map((i) => i.id))
  );
  const soloInvs = invList.filter((inv) => !casedInvIds.has(inv.id));

  const counts = {
    LINKED: rows.filter((r) => r.cls === "LINKED").length,
    CASED:  rows.filter((r) => r.cls === "CASED").length,
    OPEN:   rows.filter((r) => r.cls === "OPEN").length,
    INVESTIGATED: soloInvs.length,
  };

  const clsColor = { LINKED: GN, CASED: AM, INVESTIGATED: CY, OPEN: RD };

  // ── ASSESS ───────────────────────────────────────────────────────────────
  const runAssess = useCallback(async () => {
    setAssessing(true);
    setAssess("");
    try {
      const base = apiBase();
      const prompt =
        `JARVIS ops-case investigation convergence summary: ` +
        `${counts.LINKED} cases linked to investigations, ` +
        `${counts.OPEN} open cases with no investigation, ` +
        `${counts.CASED} resolved cases not yet investigated, ` +
        `${counts.INVESTIGATED} investigations with no linked ops case. ` +
        `Provide a two-sentence operational gap advisory.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: hdrs(),
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const txt = d.response || d.message || d.content || JSON.stringify(d);
      setAssess(txt);
      // TTS
      try {
        const tv = await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: hdrs(),
          body: JSON.stringify({ text: txt.slice(0, 400) }),
        });
        if (tv.ok) {
          const ab = await tv.arrayBuffer();
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const buf = await ctx.decodeAudioData(ab);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          src.start();
        }
      } catch {
        // TTS optional
      }
    } catch (e) {
      setAssess(`ASSESS error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, [counts]);

  // ── render ───────────────────────────────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 415,
          background: "rgba(6,11,18,0.88)",
          border: `1px solid ${DIM}`,
          borderRadius: 6,
          color: CY,
          fontFamily: "monospace",
          fontSize: 11,
          padding: "3px 8px",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ OPSINV
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 48,
        left: BTN_LEFT - PANEL_W / 2,
        width: PANEL_W,
        height: PANEL_H,
        zIndex: 415,
        background: SURF,
        border: `1px solid ${BORD}`,
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        fontFamily: "monospace",
        overflow: "hidden",
        boxShadow: "0 8px 40px rgba(0,0,0,0.8)",
      }}
    >
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: `1px solid ${BORD}`,
          flexShrink: 0,
        }}
      >
        <span style={{ color: CY, fontSize: 13, fontWeight: 700 }}>
          ◈ OPS CASE × INVESTIGATION CONVERGENCE
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* count badges */}
          {Object.entries(counts).map(([k, v]) => (
            <span
              key={k}
              style={{
                background: `${clsColor[k]}22`,
                border: `1px solid ${clsColor[k]}55`,
                borderRadius: 4,
                color: clsColor[k],
                fontSize: 10,
                padding: "2px 6px",
                animation: k === "OPEN" && v > 0 ? "opsinv-pulse 1.4s infinite" : "none",
              }}
            >
              {k} {v}
            </span>
          ))}
          <button
            onClick={() => { setAssess(""); runAssess(); }}
            disabled={assessing || loading}
            style={{
              background: "transparent",
              border: `1px solid ${AM}`,
              borderRadius: 5,
              color: AM,
              fontSize: 10,
              padding: "2px 8px",
              cursor: "pointer",
            }}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "transparent",
              border: "none",
              color: DIM,
              fontSize: 16,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* body */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
        {loading && (
          <div style={{ color: DIM, fontSize: 11, padding: "20px 14px" }}>
            Loading ops cases and investigations…
          </div>
        )}
        {err && (
          <div style={{ color: RD, fontSize: 11, padding: "8px 14px" }}>{err}</div>
        )}
        {!loading && !err && rows.length === 0 && (
          <div style={{ color: DIM, fontSize: 11, padding: "20px 14px" }}>
            No ops cases found.
          </div>
        )}

        {/* ops case rows */}
        {rows.map(({ cas, invMatches, cls }) => {
          const exp = expanded.has(`c:${cas.id}`);
          const sb  = statusBadge(cas.status);
          const svb = severityBadge(cas.severity);
          return (
            <div key={cas.id} style={{ borderBottom: `1px solid ${BORD}22` }}>
              <div
                onClick={() => {
                  setExpanded((prev) => {
                    const s = new Set(prev);
                    s.has(`c:${cas.id}`) ? s.delete(`c:${cas.id}`) : s.add(`c:${cas.id}`);
                    return s;
                  });
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  cursor: "pointer",
                  background: exp ? "rgba(41,231,255,0.04)" : "transparent",
                }}
              >
                <span style={{ color: clsColor[cls], fontSize: 10, minWidth: 86 }}>{cls}</span>
                <span style={{ color: CY, fontSize: 11, flex: 1 }}>{cas.title || cas.id}</span>
                <span
                  style={{
                    background: `${sb.color}22`,
                    border: `1px solid ${sb.color}55`,
                    borderRadius: 3,
                    color: sb.color,
                    fontSize: 9,
                    padding: "1px 5px",
                  }}
                >
                  {sb.label}
                </span>
                <span
                  style={{
                    background: `${svb.color}22`,
                    border: `1px solid ${svb.color}55`,
                    borderRadius: 3,
                    color: svb.color,
                    fontSize: 9,
                    padding: "1px 5px",
                  }}
                >
                  {svb.label}
                </span>
                {invMatches.length > 0 && (
                  <span style={{ color: GN, fontSize: 9 }}>
                    {invMatches.length} inv
                  </span>
                )}
                <span style={{ color: DIM, fontSize: 9 }}>{exp ? "▲" : "▼"}</span>
              </div>

              {exp && (
                <div style={{ padding: "4px 14px 8px 28px", background: "rgba(6,11,18,0.6)" }}>
                  {cas.description && (
                    <div style={{ color: DIM, fontSize: 10, marginBottom: 4 }}>
                      {cas.description.slice(0, 200)}
                    </div>
                  )}
                  {invMatches.length === 0 ? (
                    <div style={{ color: RD, fontSize: 10 }}>No matching investigations found.</div>
                  ) : (
                    invMatches.map((inv) => {
                      const ib = statusBadge(inv.status);
                      return (
                        <div
                          key={inv.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginBottom: 3,
                          }}
                        >
                          <span style={{ color: CY, fontSize: 10 }}>↳</span>
                          <span style={{ color: "#cde", fontSize: 10, flex: 1 }}>
                            {inv.title || inv.id}
                          </span>
                          <span
                            style={{
                              background: `${ib.color}22`,
                              border: `1px solid ${ib.color}44`,
                              borderRadius: 3,
                              color: ib.color,
                              fontSize: 9,
                              padding: "1px 5px",
                            }}
                          >
                            {ib.label}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* investigations with no ops case */}
        {soloInvs.length > 0 && (
          <>
            <div
              style={{
                color: CY,
                fontSize: 10,
                padding: "8px 14px 4px",
                borderTop: `1px solid ${BORD}`,
                opacity: 0.6,
              }}
            >
              INVESTIGATIONS WITHOUT MATCHING OPS CASE ({soloInvs.length})
            </div>
            {soloInvs.map((inv) => {
              const ib = statusBadge(inv.status);
              return (
                <div
                  key={inv.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 14px",
                    borderBottom: `1px solid ${BORD}22`,
                  }}
                >
                  <span style={{ color: CY, fontSize: 10, minWidth: 86 }}>INVESTIGATED</span>
                  <span style={{ color: "#cde", fontSize: 11, flex: 1 }}>{inv.title || inv.id}</span>
                  <span
                    style={{
                      background: `${ib.color}22`,
                      border: `1px solid ${ib.color}44`,
                      borderRadius: 3,
                      color: ib.color,
                      fontSize: 9,
                      padding: "1px 5px",
                    }}
                  >
                    {ib.label}
                  </span>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* assess output */}
      {assess && (
        <div
          style={{
            padding: "8px 14px",
            borderTop: `1px solid ${BORD}`,
            color: AM,
            fontSize: 11,
            maxHeight: 80,
            overflow: "auto",
            flexShrink: 0,
          }}
        >
          {assess}
        </div>
      )}

      <style>{`
        @keyframes opsinv-pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.3; }
        }
      `}</style>
    </div>
  );
}
