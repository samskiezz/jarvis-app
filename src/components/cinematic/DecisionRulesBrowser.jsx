/**
 * DecisionRulesBrowser — F477
 * Fetches /v1/rules and renders a JARVIS WATCHTOWER alert-rule browser.
 * Voice: "JARVIS, rules / decision rules / alert rules / watchtower / show rules / rule browser"
 * Toggle: jarvis:rules-browser-toggle  |  ◈ RULES button
 * Additive only — mounted via App.jsx; helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const YLW = "#FFD700";
const RED = "#FF3B3B";
const DIM = "#3A4A5A";
const BG  = "rgba(4,8,14,0.92)";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 120_000;
const BTN_LEFT = 11780;

const RULES_RE =
  /\brules?\b|\bdecision.rules?\b|\balert.rules?\b|\bwatchtower.rules?\b|\brule.browser\b|\bshow.rules?\b|\bactive.rules?\b|\brule.engine\b/i;

export function isRulesBrowserQuery(text) {
  return RULES_RE.test(text || "");
}

function normaliseRules(data) {
  if (!data) return [];
  const raw =
    data.rules || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:       r.id || `rule-${i}`,
    name:     r.name || `Rule ${i + 1}`,
    severity: typeof r.severity === "number" ? r.severity : 50,
    target:   r.target || null,
    enabled:  r.enabled !== false,
    expr:     r.expr ? JSON.stringify(r.expr) : null,
  })).sort((a, b) => b.severity - a.severity);
}

function sevColor(sev) {
  if (sev >= 80) return RED;
  if (sev >= 60) return YLW;
  if (sev >= 40) return CY;
  return GRN;
}

function sevLabel(sev) {
  if (sev >= 80) return "CRITICAL";
  if (sev >= 60) return "HIGH";
  if (sev >= 40) return "MEDIUM";
  return "LOW";
}

export async function buildRulesBrowserScript() {
  let data = null;
  try {
    const r = await fetch(`${apiBase()}/v1/rules`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (r.ok) data = await r.json();
  } catch (_) {}

  window.dispatchEvent(new CustomEvent("jarvis:rules-browser-toggle"));

  if (!data) return "Unable to retrieve decision rules at this time, sir.";
  const rules = normaliseRules(data);
  if (!rules.length) return "No decision rules on record at this time, sir.";

  const enabled  = rules.filter(r => r.enabled);
  const critical = rules.filter(r => r.enabled && r.severity >= 80);
  const high     = rules.filter(r => r.enabled && r.severity >= 60 && r.severity < 80);

  const topNames = enabled.slice(0, 3).map(r => r.name).join(", ");
  const critPart = critical.length
    ? ` ${critical.length} critical-severity`
    : "";
  const highPart = high.length ? `, ${high.length} high-severity` : "";

  return (
    `WATCHTOWER: ${rules.length} decision rules on record, ${enabled.length} active.` +
    (critPart || highPart ? ` Enabled rules include${critPart}${highPart}.` : "") +
    (topNames ? ` Top rules: ${topNames}.` : "") +
    " Decision rules browser is now open, sir."
  );
}

export default function DecisionRulesBrowser() {
  const [open, setOpen]     = useState(false);
  const [rules, setRules]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState(null);
  const [query, setQuery]   = useState("");
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`${apiBase()}/v1/rules`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setRules(normaliseRules(data));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:rules-browser-toggle", toggle);
    return () => window.removeEventListener("jarvis:rules-browser-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const enabledCount = rules.filter(r => r.enabled).length;

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Decision Rules Browser"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 72,
          background: "rgba(4,8,14,0.82)", border: `1px solid ${CY}55`,
          color: CY, fontSize: 10, padding: "3px 7px", borderRadius: 4,
          cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: 1, whiteSpace: "nowrap",
        }}
      >
        ◈ RULES
        {enabledCount > 0 && (
          <span style={{
            marginLeft: 5, background: GRN, color: "#04080E",
            borderRadius: 8, padding: "0px 5px", fontSize: 9, fontWeight: 700,
          }}>{enabledCount}</span>
        )}
      </button>
    );
  }

  const visible = rules.filter(r =>
    !query ||
    r.name.toLowerCase().includes(query.toLowerCase()) ||
    (r.target || "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div style={{
      position: "fixed", right: 18, top: 18, zIndex: 72,
      width: "min(560px,92vw)", maxHeight: "88vh",
      background: BG, border: `1px solid ${CY}44`, borderRadius: 14,
      backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${CY}18`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px", borderBottom: `1px solid ${CY}22`, flexShrink: 0,
      }}>
        <span style={{ color: CY, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>
          ◈ WATCHTOWER RULES
        </span>
        <span style={{
          background: `${GRN}22`, color: GRN,
          borderRadius: 10, padding: "1px 8px", fontSize: 11,
        }}>{enabledCount} active</span>
        <span style={{
          background: `${DIM}44`, color: "#6E8AA0",
          borderRadius: 10, padding: "1px 8px", fontSize: 11,
        }}>{rules.length} total</span>
        <button
          onClick={load}
          style={{
            marginLeft: "auto", background: "none", border: `1px solid ${DIM}`,
            color: "#6E8AA0", borderRadius: 4, padding: "2px 7px",
            fontSize: 10, cursor: "pointer",
          }}
          title="Refresh"
        >↻</button>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "none", border: "none",
            color: "#6E8AA0", cursor: "pointer", fontSize: 16, lineHeight: 1,
          }}
        >✕</button>
      </div>

      {/* Search */}
      <div style={{ padding: "8px 16px", borderBottom: `1px solid ${CY}11`, flexShrink: 0 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search rules by name or target…"
          style={{
            width: "100%", background: "rgba(41,231,255,0.06)",
            border: `1px solid ${CY}33`, borderRadius: 6,
            color: "#DCEBF5", padding: "5px 10px", fontSize: 12,
            fontFamily: "'JetBrains Mono',monospace", outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Body */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>
        {loading && (
          <div style={{ textAlign: "center", color: CY, fontSize: 12, padding: 24 }}>
            loading rules…
          </div>
        )}
        {err && !loading && (
          <div style={{ textAlign: "center", color: RED, fontSize: 12, padding: 24 }}>
            {err}
          </div>
        )}
        {!loading && !err && visible.length === 0 && (
          <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, padding: 24 }}>
            no rules found
          </div>
        )}
        {visible.map(rule => {
          const isExp = expanded === rule.id;
          const sc    = sevColor(rule.severity);
          return (
            <div
              key={rule.id}
              onClick={() => setExpanded(isExp ? null : rule.id)}
              style={{
                margin: "0 12px 6px",
                background: isExp ? "rgba(41,231,255,0.06)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${isExp ? sc + "55" : DIM + "44"}`,
                borderRadius: 8, padding: "10px 14px", cursor: "pointer",
                transition: "background 0.15s",
                opacity: rule.enabled ? 1 : 0.45,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{
                  background: sc + "22", color: sc,
                  borderRadius: 3, padding: "1px 6px", fontSize: 9,
                  letterSpacing: 1, textTransform: "uppercase", flexShrink: 0,
                }}>{sevLabel(rule.severity)}</span>
                <span style={{
                  background: rule.enabled ? `${GRN}18` : `${DIM}44`,
                  color: rule.enabled ? GRN : "#6E8AA0",
                  borderRadius: 3, padding: "1px 5px", fontSize: 9,
                  letterSpacing: 1, flexShrink: 0,
                }}>{rule.enabled ? "ON" : "OFF"}</span>
                <span style={{
                  fontSize: 12, color: "#DCEBF5", flex: 1, minWidth: 0,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {rule.name}
                </span>
                <span style={{ fontSize: 9, color: sc, flexShrink: 0, fontWeight: 700 }}>
                  {rule.severity}
                </span>
              </div>
              {isExp && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#9BAFC0", lineHeight: 1.6 }}>
                  {rule.target && (
                    <div><span style={{ color: CY }}>Target:</span> {rule.target}</div>
                  )}
                  {rule.expr && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ color: CY }}>Condition:</span>{" "}
                      <code style={{
                        background: "rgba(41,231,255,0.08)", borderRadius: 3,
                        padding: "1px 5px", fontSize: 10, color: "#DCEBF5",
                        wordBreak: "break-all",
                      }}>{rule.expr}</code>
                    </div>
                  )}
                  <div style={{ marginTop: 4 }}>
                    <span style={{ color: CY }}>Severity score:</span> {rule.severity}/100
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: "8px 16px", borderTop: `1px solid ${CY}11`,
        fontSize: 10, color: "#3A4A5A", flexShrink: 0,
        display: "flex", justifyContent: "space-between",
      }}>
        <span>showing {visible.length}/{rules.length} rules</span>
        <span>auto-refresh every 2 min</span>
      </div>
    </div>
  );
}
