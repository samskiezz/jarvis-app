/**
 * RiskInvestigationMatrix — F35.
 *
 * Cross-references active risk signals against open investigations to surface
 * which critical risks have investigation coverage and which are unmanaged.
 *
 * Endpoints used:
 *   /entities/RiskSignal  — active risk signals
 *   /v1/investigations    — open investigation cases
 *
 * Stat tiles: risks / investigations / covered / uncovered
 * Filter tabs: ALL / COVERED / UNCOVERED / CRITICAL
 * Panel: risk row → severity badge → linked investigation (or "NO INVESTIGATION")
 * ▶ ASSESS per risk → /v1/jarvis/agent/chat 2-sentence coverage brief + TTS
 *   via jarvis:speak-dossier.
 * 60 s auto-refresh.
 *
 * Intent: "risk coverage" / "risk investigation" / "uncovered risks" /
 *         "risgap" / "risk gap" / "risk investigation matrix" /
 *         "which risks have no investigation" / "unmanaged risks"
 *   → jarvis:risgap-toggle + TTS brief via buildRisGapScript()
 *
 * Toggle: ◈ RISGAP at left:10120, bottom:8, zIndex:66.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const RED    = "#FF3D5A";
const VIOLET = "#A78BFA";
const BTN_LEFT   = 10120;
const REFRESH_MS = 60_000;
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

function normaliseRisks(raw) {
  return normaliseArray(raw).map((r) => ({
    id:          r.id || r.risk_id || String(Math.random()),
    title:       r.title || r.name || r.signal_name || r.description || "Unnamed Risk",
    severity:    typeof r.severity === "number" ? r.severity
                 : typeof r.score === "number" ? r.score
                 : r.severity || r.level || 0,
    category:    r.category || r.type || r.risk_type || "",
    status:      (r.status || "active").toLowerCase(),
    subject:     r.subject || r.entity || r.target || "",
  }));
}

function normaliseInvestigations(raw) {
  return normaliseArray(raw).map((inv) => ({
    id:      inv.id || inv.case_id || String(Math.random()),
    title:   inv.title || inv.name || inv.case_name || "Unnamed Case",
    status:  (inv.status || "open").toLowerCase(),
    subject: inv.subject || inv.target || "",
    tags:    Array.isArray(inv.tags) ? inv.tags : [],
  }));
}

function severityLabel(s) {
  const n = typeof s === "number" ? s : parseInt(s, 10) || 0;
  if (n >= 90) return { label: "CRITICAL", color: RED };
  if (n >= 70) return { label: "HIGH",     color: AMBER };
  if (n >= 40) return { label: "MEDIUM",   color: CY };
  return { label: "LOW", color: GREEN };
}

function kwMatch(a = "", b = "") {
  const words = (str) =>
    str.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3);
  const aw = words(a);
  const bw = words(b);
  return aw.some((w) => bw.includes(w));
}

function linkRisksToInvestigations(risks, investigations) {
  return risks.map((risk) => {
    const linked = investigations.filter(
      (inv) =>
        kwMatch(risk.title, inv.title) ||
        kwMatch(risk.subject, inv.subject) ||
        kwMatch(risk.title, inv.subject) ||
        kwMatch(risk.subject, inv.title) ||
        inv.tags.some((tag) => kwMatch(risk.title, tag))
    );
    return { ...risk, investigations: linked, covered: linked.length > 0 };
  });
}

// ─── exported helpers for JarvisBrain voice routing ──────────────────────────

export function isRisGapQuery(q = "") {
  const lq = q.toLowerCase();
  return (
    lq.includes("risgap") ||
    lq.includes("risk gap") ||
    lq.includes("risk coverage") ||
    lq.includes("risk investigation") ||
    lq.includes("uncovered risk") ||
    lq.includes("unmanaged risk") ||
    lq.includes("risk investigation matrix") ||
    lq.includes("which risks have no investigation")
  );
}

export async function buildRisGapScript() {
  const ak = API_KEY;
  const base = apiBase();
  const [rr, ir] = await Promise.all([
    fetch(`${base}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${ak}` } }),
    fetch(`${base}/v1/investigations`,   { headers: { Authorization: `Bearer ${ak}` } }),
  ]);
  const risks = normaliseRisks(await rr.json());
  const investigations = normaliseInvestigations(await ir.json());
  const linked = linkRisksToInvestigations(risks, investigations);
  const uncovered = linked.filter((r) => !r.covered);
  const critical  = uncovered.filter((r) => {
    const n = typeof r.severity === "number" ? r.severity : parseInt(r.severity, 10) || 0;
    return n >= 70;
  });
  if (linked.length === 0) return "Risk-investigation matrix is initialising, sir. No risk signals found.";
  const pct = Math.round((linked.filter((r) => r.covered).length / linked.length) * 100);
  return (
    `Risk-investigation matrix: ${linked.length} active risk signals, ${risks.length - uncovered.length} covered by investigations — ${pct}% coverage. ` +
    (critical.length > 0
      ? `${critical.length} critical or high-severity risk${critical.length > 1 ? "s" : ""} currently have no assigned investigation, including ${critical[0].title}. Immediate attention is advised, sir.`
      : `All high-severity risks currently have investigation coverage. Excellent operational discipline, sir.`)
  );
}

// ─── component ───────────────────────────────────────────────────────────────

const FILTERS = ["ALL", "COVERED", "UNCOVERED", "CRITICAL"];

export default function RiskInvestigationMatrix() {
  const [open,   setOpen]   = useState(false);
  const [linked, setLinked] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(null);
  const [assessResult, setAssessResult] = useState({});
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rr, ir] = await Promise.all([
        fetch(`${apiBase()}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/v1/investigations`,   { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const risks         = normaliseRisks(await rr.json());
      const investigations = normaliseInvestigations(await ir.json());
      setLinked(linkRisksToInvestigations(risks, investigations));
    } catch {
      // network error; keep stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:risgap-toggle", handler);
    return () => window.removeEventListener("jarvis:risgap-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const covered   = linked.filter((r) => r.covered);
  const uncovered = linked.filter((r) => !r.covered);
  const critical  = linked.filter((r) => {
    const n = typeof r.severity === "number" ? r.severity : parseInt(r.severity, 10) || 0;
    return n >= 70 && !r.covered;
  });

  const displayed = filter === "ALL"      ? linked
    : filter === "COVERED"   ? covered
    : filter === "UNCOVERED" ? uncovered
    : critical;

  const assess = useCallback(async (risk) => {
    setAssessing(risk.id);
    try {
      const prompt =
        `Risk signal: "${risk.title}" (severity ${risk.severity}, category ${risk.category || "unknown"}).` +
        (risk.covered
          ? ` It has ${risk.investigations.length} linked investigation(s): ${risk.investigations.map((i) => i.title).join(", ")}.`
          : " It currently has NO linked investigations.") +
        " Provide a 2-sentence brief on the operational priority and recommended next step.";
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessResult((prev) => ({ ...prev, [risk.id]: txt }));
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessResult((prev) => ({ ...prev, [risk.id]: "Assessment unavailable." }));
    } finally {
      setAssessing(null);
    }
  }, []);

  // ── toggle button (always visible) ─────────────────────────────────────────
  const uncoveredCount = uncovered.length;

  return (
    <>
      {/* Toggle pill */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 66,
          background: open ? CY : "rgba(0,0,0,0.55)",
          color: open ? "#000" : CY,
          border: `1px solid ${CY}`,
          borderRadius: 4,
          padding: "3px 8px",
          fontSize: 10,
          fontFamily: "monospace",
          cursor: "pointer",
          letterSpacing: 1,
          whiteSpace: "nowrap",
        }}
      >
        ◈ RISGAP
        {uncoveredCount > 0 && (
          <span
            style={{
              marginLeft: 4,
              background: critical.length > 0 ? RED : AMBER,
              color: "#000",
              borderRadius: 3,
              padding: "0 4px",
              fontWeight: 700,
              fontSize: 9,
            }}
          >
            {uncoveredCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 40,
            width: 540,
            maxHeight: "72vh",
            background: "rgba(0,8,20,0.97)",
            border: `1px solid ${CY}`,
            borderRadius: 6,
            zIndex: 9001,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: `0 0 24px ${CY}44`,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "10px 14px 8px",
              borderBottom: `1px solid ${CY}33`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ color: CY, fontFamily: "monospace", fontSize: 11, letterSpacing: 2 }}>
              ◈ RISK-INVESTIGATION MATRIX
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {loading && (
                <span style={{ color: CY, fontSize: 9, opacity: 0.7, fontFamily: "monospace" }}>SYNC…</span>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14 }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${CY}22` }}>
            {[
              { label: "RISKS",         val: linked.length,     col: CY    },
              { label: "COVERED",       val: covered.length,    col: GREEN },
              { label: "UNCOVERED",     val: uncovered.length,  col: AMBER },
              { label: "CRITICAL GAP",  val: critical.length,   col: RED   },
            ].map(({ label, val, col }) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 4,
                  padding: "6px 8px",
                  textAlign: "center",
                  border: `1px solid ${col}44`,
                }}
              >
                <div style={{ color: col, fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>{val}</div>
                <div style={{ color: col, fontSize: 8, opacity: 0.7, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "6px 14px", borderBottom: `1px solid ${CY}22` }}>
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? CY : "transparent",
                  color: filter === f ? "#000" : CY,
                  border: `1px solid ${CY}66`,
                  borderRadius: 3,
                  padding: "2px 8px",
                  fontSize: 9,
                  fontFamily: "monospace",
                  cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                {f} {f === "UNCOVERED" && uncoveredCount > 0 ? `(${uncoveredCount})` : ""}
                {f === "CRITICAL" && critical.length > 0 ? `(${critical.length})` : ""}
              </button>
            ))}
          </div>

          {/* Risk list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px 12px" }}>
            {displayed.length === 0 && (
              <div style={{ color: CY, opacity: 0.5, fontFamily: "monospace", fontSize: 10, padding: "16px 0" }}>
                {loading ? "Loading risk signals…" : "No risks in this view."}
              </div>
            )}
            {displayed.map((risk) => {
              const sev = severityLabel(risk.severity);
              return (
                <div
                  key={risk.id}
                  style={{
                    marginBottom: 8,
                    background: "rgba(255,255,255,0.03)",
                    border: `1px solid ${risk.covered ? CY + "44" : RED + "55"}`,
                    borderRadius: 4,
                    padding: "8px 10px",
                  }}
                >
                  {/* Risk header row */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <span
                        style={{
                          display: "inline-block",
                          background: sev.color + "22",
                          border: `1px solid ${sev.color}`,
                          color: sev.color,
                          borderRadius: 3,
                          padding: "0 5px",
                          fontSize: 8,
                          fontFamily: "monospace",
                          marginRight: 6,
                          verticalAlign: "middle",
                        }}
                      >
                        {sev.label}
                      </span>
                      <span style={{ color: "#e0e8ff", fontSize: 11, fontWeight: 600 }}>{risk.title}</span>
                      {risk.category && (
                        <span style={{ color: VIOLET, fontSize: 9, marginLeft: 6, opacity: 0.8 }}>
                          [{risk.category}]
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        color: risk.covered ? GREEN : RED,
                        fontSize: 8,
                        fontFamily: "monospace",
                        letterSpacing: 1,
                        whiteSpace: "nowrap",
                        padding: "2px 6px",
                        border: `1px solid ${risk.covered ? GREEN : RED}`,
                        borderRadius: 3,
                      }}
                    >
                      {risk.covered ? `✓ ${risk.investigations.length} INV` : "✗ NO INV"}
                    </span>
                  </div>

                  {/* Linked investigations */}
                  {risk.covered && (
                    <div style={{ marginTop: 4, paddingLeft: 8, borderLeft: `2px solid ${GREEN}44` }}>
                      {risk.investigations.slice(0, 3).map((inv) => (
                        <div key={inv.id} style={{ color: GREEN, fontSize: 9, opacity: 0.9, fontFamily: "monospace" }}>
                          → {inv.title}
                        </div>
                      ))}
                      {risk.investigations.length > 3 && (
                        <div style={{ color: CY, fontSize: 8, opacity: 0.6, fontFamily: "monospace" }}>
                          +{risk.investigations.length - 3} more
                        </div>
                      )}
                    </div>
                  )}

                  {/* Assess button + result */}
                  <div style={{ marginTop: 6 }}>
                    <button
                      onClick={() => assess(risk)}
                      disabled={assessing === risk.id}
                      style={{
                        background: "transparent",
                        border: `1px solid ${CY}`,
                        color: CY,
                        borderRadius: 3,
                        padding: "2px 8px",
                        fontSize: 9,
                        fontFamily: "monospace",
                        cursor: assessing === risk.id ? "wait" : "pointer",
                        letterSpacing: 1,
                      }}
                    >
                      {assessing === risk.id ? "ASSESSING…" : "▶ ASSESS"}
                    </button>
                    {assessResult[risk.id] && (
                      <div
                        style={{
                          marginTop: 4,
                          color: "#b0c8e8",
                          fontSize: 9,
                          lineHeight: 1.5,
                          fontFamily: "monospace",
                          borderLeft: `2px solid ${CY}`,
                          paddingLeft: 6,
                        }}
                      >
                        {assessResult[risk.id]}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
