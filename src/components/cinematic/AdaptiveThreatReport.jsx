/**
 * AdaptiveThreatReport — F64.
 *
 * Parallel-fetches /entities/RiskSignal + /entities/IntelProfile +
 * /v1/ops/events + /v1/investigations, compiles the live data into a
 * structured context block, and asks /v1/jarvis/agent/chat to author a
 * multi-section Threat Intelligence Report (executive summary, active
 * threats, threat actors, operational events, open cases, recommendations).
 *
 * The full AI-written report is displayed in a scrollable panel.
 * Executive summary is spoken via jarvis:speak-dossier + TTS.
 * Clipboard copy button for portability.
 *
 * Intent: "threat report" / "generate threat report" / "threat intelligence"
 *   → jarvis:athrep-toggle + TTS brief via buildAthrepScript()
 *
 * Toggle: ◎ ATHREP at left:5380, zIndex 65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const RED = "#FF3D5A";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const VIOLET = "#A78BFA";
const BTN_LEFT = 5380;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isAthrepQuery(q) {
  return /threat\s+(report|intelligence|brief|document|assessment|overview)|generate\s+(report|threat|brief|intel)|intel(ligence)?\s+report|full\s+(threat|intel|brief)\s*(report|doc)?|threat\s+doc|athrep\b/i.test(
    q || ""
  );
}

export async function buildAthrepScript() {
  try {
    const [rr, ir, or_] = await Promise.all([
      fetch(`${apiBase()}/entities/RiskSignal`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/entities/IntelProfile`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/ops/events`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const risks = normaliseArray(rr.ok ? await rr.json() : []);
    const profiles = normaliseArray(ir.ok ? await ir.json() : []);
    const events = normaliseArray(or_.ok ? await or_.json() : []);
    const openRisks = risks.filter(
      (r) =>
        !["resolved", "closed", "dismissed"].includes(
          (r.status || "").toLowerCase()
        )
    );
    const criticals = openRisks.filter((r) => {
      const s = r.severity || r.score || 0;
      return (typeof s === "number" ? s : parseInt(s, 10) || 0) >= 90;
    });
    window.dispatchEvent(new CustomEvent("jarvis:athrep-toggle"));
    return `Adaptive Threat Report panel open, sir. I have ${openRisks.length} active risk signal${openRisks.length !== 1 ? "s" : ""}, ${profiles.length} intelligence profile${profiles.length !== 1 ? "s" : ""}, and ${events.length} recent operational event${events.length !== 1 ? "s" : ""} to synthesise. ${criticals.length > 0 ? `${criticals.length} critical risk${criticals.length !== 1 ? "s" : ""} require${criticals.length === 1 ? "s" : ""} immediate attention.` : "No critical risks detected."} Click Generate for the full threat intelligence document.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:athrep-toggle"));
    return "Adaptive Threat Report panel open, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function AdaptiveThreatReport() {
  const [visible, setVisible] = useState(false);
  const [report, setReport] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genTime, setGenTime] = useState(null);
  const [stats, setStats] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:athrep-toggle", onToggle);
    return () => window.removeEventListener("jarvis:athrep-toggle", onToggle);
  }, []);

  const generateReport = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    setReport("");
    setStats(null);
    const t0 = Date.now();
    try {
      const [rr, ir, or_, inv] = await Promise.all([
        fetch(`${apiBase()}/entities/RiskSignal`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${apiBase()}/entities/IntelProfile`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${apiBase()}/v1/ops/events`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${apiBase()}/v1/investigations`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      const risks = normaliseArray(rr.ok ? await rr.json() : []);
      const profiles = normaliseArray(ir.ok ? await ir.json() : []);
      const events = normaliseArray(or_.ok ? await or_.json() : []);
      const cases = normaliseArray(inv.ok ? await inv.json() : []);

      const openRisks = risks.filter(
        (r) =>
          !["resolved", "closed", "dismissed"].includes(
            (r.status || "").toLowerCase()
          )
      );
      const criticals = openRisks.filter((r) => {
        const s = r.severity || r.score || 0;
        return (typeof s === "number" ? s : parseInt(s, 10) || 0) >= 90;
      });
      const openCases = cases.filter(
        (c) =>
          !["closed", "resolved"].includes((c.status || "").toLowerCase())
      );
      const recentEvents = events.slice(0, 15);

      setStats({
        risks: openRisks.length,
        criticals: criticals.length,
        profiles: profiles.length,
        events: recentEvents.length,
        cases: openCases.length,
      });

      const ctx = buildContext(openRisks, profiles, recentEvents, openCases);

      const prompt = `You are JARVIS, the AI strategic intelligence system. Based on the following live operational data, author a concise but comprehensive Threat Intelligence Report. Structure it with these exact section headers in ALL CAPS followed by a colon: EXECUTIVE SUMMARY, ACTIVE THREATS, THREAT ACTORS, OPERATIONAL EVENTS, OPEN CASES, STRATEGIC RECOMMENDATIONS. Under EXECUTIVE SUMMARY write 2-3 sentences. Under ACTIVE THREATS list top 5 risks by severity, one per line. Under THREAT ACTORS list top 5 intel profiles, one per line. Under OPERATIONAL EVENTS list top 5 recent events, one per line. Under OPEN CASES write a single summary sentence with count and key themes. Under STRATEGIC RECOMMENDATIONS write 3 numbered actionable recommendations. Use plain text, no markdown symbols. Intelligence-grade language, British-butler tone.\n\nLIVE DATA:\n${ctx}`;

      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "")
        .replace(/<<ACTION:[^>]*>>/g, "")
        .trim();
      setReport(
        answer ||
          "No report generated. The reasoning core returned an empty response."
      );
      setGenTime(((Date.now() - t0) / 1000).toFixed(1));

      if (answer) {
        const execMatch = answer.match(
          /EXECUTIVE SUMMARY[:\s]*([\s\S]*?)(?=\n[A-Z]{4,}[:\s]|\n\d\.|\n\n[A-Z]|$)/i
        );
        const execSummary = execMatch
          ? execMatch[1].trim().slice(0, 300)
          : answer.slice(0, 300);
        if (execSummary) {
          window.dispatchEvent(
            new CustomEvent("jarvis:speak-dossier", {
              detail: { text: execSummary },
            })
          );
        }
      }
    } catch {
      setReport(
        "Unable to generate threat report. Reasoning core unreachable."
      );
      setGenTime(null);
    } finally {
      setGenerating(false);
    }
  }, [generating]);

  function copyReport() {
    if (!report) return;
    navigator.clipboard
      .writeText(report)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  const criticalCount = stats?.criticals ?? 0;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Adaptive Threat Intelligence Report"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 65,
          height: 26,
          padding: "0 8px",
          background: visible ? `${VIOLET}22` : "rgba(8,14,22,0.82)",
          border: `1px solid ${visible ? VIOLET : "#2A3A4A"}`,
          borderRadius: 5,
          color: visible ? VIOLET : "#6E8AA0",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {criticalCount > 0 && !visible && (
          <span
            style={{
              display: "inline-block",
              marginRight: 5,
              background: RED,
              color: "#fff",
              borderRadius: "50%",
              width: 14,
              height: 14,
              fontSize: 9,
              lineHeight: "14px",
              textAlign: "center",
            }}
          >
            {criticalCount}
          </span>
        )}
        ◎ ATHREP
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 44,
            left: Math.min(BTN_LEFT, window.innerWidth - 680),
            zIndex: 65,
            width: 660,
            maxHeight: "78vh",
            display: "flex",
            flexDirection: "column",
            background: "rgba(4,10,18,0.97)",
            border: `1px solid ${VIOLET}44`,
            borderTop: `2px solid ${VIOLET}`,
            borderRadius: 12,
            boxShadow: `0 0 40px ${VIOLET}14, 0 8px 32px rgba(0,0,0,0.75)`,
            fontFamily: "'JetBrains Mono', monospace",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderBottom: `1px solid ${VIOLET}22`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: VIOLET, fontSize: 13 }}>◎</span>
            <span
              style={{
                color: VIOLET,
                fontSize: 11,
                letterSpacing: 2,
                fontWeight: 700,
              }}
            >
              ADAPTIVE THREAT INTELLIGENCE REPORT
            </span>
            {genTime && (
              <span
                style={{ fontSize: 9, color: GREEN, letterSpacing: 1 }}
              >
                ✓ {genTime}s
              </span>
            )}
            <div style={{ flex: 1 }} />
            <button
              onClick={copyReport}
              disabled={!report}
              title="Copy report to clipboard"
              style={{
                padding: "2px 8px",
                borderRadius: 4,
                border: `1px solid ${copied ? GREEN + "66" : "#2A3A4A"}`,
                background: copied ? `${GREEN}12` : "transparent",
                color: copied ? GREEN : "#6E8AA0",
                fontSize: 9,
                letterSpacing: 1,
                cursor: report ? "pointer" : "default",
                fontFamily: "inherit",
              }}
            >
              {copied ? "✓ COPIED" : "⎘ COPY"}
            </button>
            <button
              onClick={() => setVisible(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#6E8AA0",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          {stats && (
            <div
              style={{
                display: "flex",
                gap: 8,
                padding: "8px 14px",
                borderBottom: "1px solid #1A2A3A",
                flexShrink: 0,
              }}
            >
              {[
                { label: "RISKS", val: stats.risks, col: AMBER },
                { label: "CRITICAL", val: stats.criticals, col: RED },
                { label: "PROFILES", val: stats.profiles, col: VIOLET },
                { label: "EVENTS", val: stats.events, col: CY },
                { label: "CASES", val: stats.cases, col: GREEN },
              ].map((t) => (
                <div
                  key={t.label}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid #1A2A3A",
                    borderRadius: 6,
                    padding: "5px 8px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      color: t.col,
                      fontWeight: 700,
                    }}
                  >
                    {t.val}
                  </div>
                  <div
                    style={{
                      fontSize: 8,
                      color: "#4E6A7A",
                      letterSpacing: 1,
                      marginTop: 1,
                    }}
                  >
                    {t.label}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Report body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
            {!report && !generating && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "32px 0",
                  gap: 14,
                }}
              >
                <div style={{ fontSize: 30, color: `${VIOLET}55` }}>◎</div>
                <div
                  style={{
                    color: "#6E8AA0",
                    fontSize: 10,
                    letterSpacing: 1,
                    textAlign: "center",
                    lineHeight: 1.6,
                  }}
                >
                  No report generated yet.
                  <br />
                  Click GENERATE to compile a live threat intelligence document.
                </div>
                <button
                  onClick={generateReport}
                  style={{
                    padding: "6px 20px",
                    borderRadius: 5,
                    border: `1px solid ${VIOLET}66`,
                    background: `${VIOLET}18`,
                    color: VIOLET,
                    fontSize: 10,
                    letterSpacing: 2,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  ▶ GENERATE REPORT
                </button>
              </div>
            )}

            {generating && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "32px 0",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    color: VIOLET,
                    fontSize: 22,
                    opacity: 0.8,
                  }}
                >
                  ◎
                </div>
                <div
                  style={{
                    color: VIOLET,
                    fontSize: 10,
                    letterSpacing: 2,
                  }}
                >
                  COMPILING THREAT INTELLIGENCE REPORT…
                </div>
                <div style={{ color: "#4E6A7A", fontSize: 9 }}>
                  Fetching live data · synthesising via reasoning core
                </div>
              </div>
            )}

            {report && !generating && (
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: 10,
                  color: "#C8DDF0",
                  lineHeight: 1.75,
                  margin: 0,
                  fontFamily: "inherit",
                }}
              >
                {formatReport(report)}
              </pre>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "7px 14px",
              borderTop: `1px solid ${VIOLET}18`,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <button
              onClick={generateReport}
              disabled={generating}
              style={{
                padding: "3px 12px",
                borderRadius: 4,
                border: `1px solid ${generating ? "#2A3A4A" : VIOLET + "66"}`,
                background: generating ? "transparent" : `${VIOLET}18`,
                color: generating ? "#4E6A7A" : VIOLET,
                fontSize: 9,
                letterSpacing: 1,
                cursor: generating ? "default" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {generating ? "generating…" : report ? "↻ REGENERATE" : "▶ GENERATE"}
            </button>
            <span
              style={{
                fontSize: 9,
                color: "#4E6A7A",
                letterSpacing: 1,
                flex: 1,
              }}
            >
              /entities/RiskSignal + IntelProfile + /v1/ops/events +
              /v1/investigations → /v1/jarvis/agent/chat
            </span>
          </div>
        </div>
      )}
    </>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of [
      "items",
      "results",
      "data",
      "signals",
      "risks",
      "profiles",
      "events",
      "cases",
      "investigations",
      "records",
    ]) {
      if (Array.isArray(data[k])) return data[k];
    }
  }
  return [];
}

function sev(r) {
  const s = r.severity || r.score || r.priority || 0;
  return typeof s === "number" ? s : parseInt(s, 10) || 0;
}

function buildContext(risks, profiles, events, cases) {
  const top5Risks = [...risks]
    .sort((a, b) => sev(b) - sev(a))
    .slice(0, 5)
    .map((r) => {
      const s = sev(r);
      const label = s >= 90 ? "CRITICAL" : s >= 70 ? "HIGH" : s >= 40 ? "MEDIUM" : "LOW";
      return `  - [${label}] ${r.title || r.name || r.description || r.id || "Unknown"} (sev: ${s}, status: ${r.status || "open"})`;
    });

  const top5Profiles = profiles.slice(0, 5).map((p) => {
    const threat = p.threat_level || p.threatLevel || p.classification || "unknown";
    return `  - ${p.name || p.title || p.id || "Unknown"} (type: ${p.type || "unknown"}, threat: ${threat})`;
  });

  const top5Events = events.slice(0, 5).map((e) => {
    const s = sev(e);
    return `  - [sev:${s}] ${e.title || e.message || e.name || e.description || "Event"} (source: ${e.source || e.service || "unknown"})`;
  });

  const openCases = cases.filter(
    (c) => !["closed", "resolved"].includes((c.status || "").toLowerCase())
  );

  return [
    `RISK SIGNALS (${risks.length} total, ${risks.length - (risks.filter((r) => ["resolved","closed","dismissed"].includes((r.status||"").toLowerCase())).length)} open):`,
    ...top5Risks,
    "",
    `INTEL PROFILES (${profiles.length} total):`,
    ...top5Profiles,
    "",
    `RECENT OPS EVENTS (showing ${events.slice(0,5).length} of ${events.length}):`,
    ...top5Events,
    "",
    `OPEN INVESTIGATIONS (${openCases.length} of ${cases.length} total):`,
    ...openCases.slice(0, 5).map(
      (c) =>
        `  - [${(c.status || "open").toUpperCase()}] ${c.title || c.name || c.id || "Case"} (priority: ${c.priority || "unknown"})`
    ),
  ].join("\n");
}

function formatReport(text) {
  return text
    .split("\n")
    .map((line) => {
      const sectionMatch = line.match(/^([A-Z][A-Z\s]{3,}):(.*)$/);
      if (sectionMatch) {
        return `\n◈ ${sectionMatch[1]}:${sectionMatch[2]}`;
      }
      return line;
    })
    .join("\n");
}
