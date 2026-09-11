/**
 * WatchtowerRulesPanel — F35 Watchtower Rules Monitor.
 * Sources from /v1/rules (rule list) and POST /v1/rules/evaluate (live-intel evaluation).
 * ⬡ RULES button; 60-s auto-refresh; badge shows enabled rule count.
 * EVALUATE → runs /v1/rules/evaluate against live-intel snapshot → shows matched alerts + TTS.
 * Voice trigger: "JARVIS, rules" / "watchtower" / "automation rules" / "alert rules" / "rules".
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const PRP = "#A855F7";
const GLD = "#FFD700";
const RED = "#FF3B6B";
const GRN = "#00E5A0";
const OR  = "#FF8800";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const RULES_RE = /\b(rules?|watchtower|automation\s*rule|alert\s*rule|rule\s*engine|trigger\s*rule|rule\s*set)\b/i;

function sevColor(sev) {
  const n = typeof sev === "number" ? sev : 50;
  if (n >= 80) return RED;
  if (n >= 60) return OR;
  if (n >= 40) return GLD;
  return GRN;
}

function sevLabel(sev) {
  const n = typeof sev === "number" ? sev : 50;
  if (n >= 80) return "CRITICAL";
  if (n >= 60) return "HIGH";
  if (n >= 40) return "MEDIUM";
  return "LOW";
}

async function fetchRules() {
  const r = await fetch(`${apiBase()}/v1/rules`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return Array.isArray(d)
    ? d
    : Array.isArray(d?.rules)
    ? d.rules
    : Array.isArray(d?.items)
    ? d.items
    : Array.isArray(d?.data)
    ? d.data
    : [];
}

async function evaluateRules() {
  const r = await fetch(`${apiBase()}/v1/rules/evaluate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return Array.isArray(d)
    ? d
    : Array.isArray(d?.alerts)
    ? d.alerts
    : Array.isArray(d?.fired)
    ? d.fired
    : Array.isArray(d?.matches)
    ? d.matches
    : [];
}

async function fetchAgentChat(prompt) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: prompt }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return d?.response || d?.reply || d?.text || d?.content || "";
}

export function isRulesQuery(text) {
  return RULES_RE.test(text || "");
}
export { isRulesQuery as isWtwrQuery };

export async function buildRulesScript() {
  let rules = [];
  try { rules = await fetchRules(); } catch (_) {}
  const enabled = rules.filter(r => r.enabled !== false);
  if (!rules.length) return "Watchtower rules monitor: no rules configured.";
  const highSev = enabled.filter(r => (r.severity || 50) >= 60);
  return (
    `Watchtower: ${rules.length} automation rule${rules.length !== 1 ? "s" : ""} loaded, ` +
    `${enabled.length} enabled. ` +
    (highSev.length > 0
      ? `${highSev.length} high-severity rule${highSev.length !== 1 ? "s" : ""} active.`
      : "No high-severity rules active.")
  );
}
export { buildRulesScript as buildWtwrScript };

function RuleCard({ rule }) {
  const color = sevColor(rule.severity);
  const label = sevLabel(rule.severity);
  const enabled = rule.enabled !== false;
  return (
    <div style={{
      background: "rgba(41,231,255,0.04)",
      border: `1px solid ${enabled ? color + "44" : "#333"}`,
      borderRadius: 6,
      padding: "10px 12px",
      marginBottom: 8,
      opacity: enabled ? 1 : 0.55,
      position: "relative",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 1, color,
          border: `1px solid ${color}55`, borderRadius: 3, padding: "1px 5px",
        }}>{label}</span>
        <span style={{ fontSize: 9, color: enabled ? GRN : "#666", letterSpacing: 1 }}>
          {enabled ? "ENABLED" : "DISABLED"}
        </span>
        {rule.target && (
          <span style={{ fontSize: 9, color: "#888", marginLeft: "auto" }}>
            → {rule.target}
          </span>
        )}
      </div>
      <div style={{ color: CY, fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        {rule.name || rule.id || "Unnamed rule"}
      </div>
      {rule.expr && Object.keys(rule.expr).length > 0 && (
        <div style={{
          fontFamily: "monospace", fontSize: 10, color: "#aaa",
          background: "rgba(0,0,0,0.3)", borderRadius: 3, padding: "3px 6px",
          wordBreak: "break-all",
        }}>
          {JSON.stringify(rule.expr)}
        </div>
      )}
    </div>
  );
}

function AlertCard({ alert }) {
  const color = alert.severity >= 80 ? RED : alert.severity >= 60 ? OR : GLD;
  return (
    <div style={{
      background: `${color}18`,
      border: `1px solid ${color}55`,
      borderRadius: 6,
      padding: "8px 12px",
      marginBottom: 6,
    }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 9, color, fontWeight: 700, letterSpacing: 1 }}>
          {alert.rule_name || alert.name || alert.rule || "Rule fired"}
        </span>
        {alert.severity != null && (
          <span style={{ fontSize: 9, color: "#888" }}>sev {alert.severity}</span>
        )}
      </div>
      {alert.message && (
        <div style={{ fontSize: 11, color: "#ddd", marginTop: 2 }}>{alert.message}</div>
      )}
    </div>
  );
}

export default function WatchtowerRulesPanel() {
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [evalLoading, setEvalLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [evalMsg, setEvalMsg] = useState("");
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRules();
      setRules(data);
      setLastFetch(new Date().toLocaleTimeString());
    } catch (e) {
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    function handler() { setOpen(o => !o); }
    window.addEventListener("jarvis:rules-toggle", handler);
    window.addEventListener("jarvis:wtwr-toggle", handler);
    return () => {
      window.removeEventListener("jarvis:rules-toggle", handler);
      window.removeEventListener("jarvis:wtwr-toggle", handler);
    };
  }, []);

  const handleEvaluate = async () => {
    setEvalLoading(true);
    setAlerts([]);
    setEvalMsg("");
    try {
      const fired = await evaluateRules();
      setAlerts(fired);
      if (fired.length === 0) {
        setEvalMsg("No rules matched current live-intel snapshot.");
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Watchtower evaluation complete. No rules matched the current live-intel snapshot." }
        }));
      } else {
        setEvalMsg(`${fired.length} rule${fired.length !== 1 ? "s" : ""} fired.`);
        const names = fired.slice(0, 3).map(a => a.rule_name || a.name || "rule").join(", ");
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
          detail: { text: `Watchtower alert: ${fired.length} rule${fired.length !== 1 ? "s" : ""} fired. ${names}.` }
        }));
      }
    } catch (e) {
      setEvalMsg(`Evaluate error: ${e.message}`);
    } finally {
      setEvalLoading(false);
    }
  };

  const handleAssess = async () => {
    if (!rules.length) return;
    const enabled = rules.filter(r => r.enabled !== false);
    const summary = rules.slice(0, 6).map(r => `${r.name || "rule"} (sev ${r.severity || 50}, ${r.enabled !== false ? "enabled" : "disabled"})`).join("; ");
    const prompt = `Jarvis, analyse these watchtower automation rules and give a 2-sentence operational assessment: ${summary}. Are the right rules active?`;
    try {
      const reply = await fetchAgentChat(prompt);
      if (reply) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: reply } }));
      }
    } catch (_) {}
  };

  const visibleRules = filter === "enabled"
    ? rules.filter(r => r.enabled !== false)
    : filter === "disabled"
    ? rules.filter(r => r.enabled === false)
    : rules;

  const enabledCount = rules.filter(r => r.enabled !== false).length;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Watchtower Rules Monitor"
        style={{
          position: "fixed", bottom: 8, left: 11640, zIndex: 62,
          background: "rgba(41,231,255,0.08)", border: "1px solid rgba(41,231,255,0.3)",
          color: CY, borderRadius: 4, padding: "3px 8px", fontSize: 10,
          fontFamily: "monospace", cursor: "pointer", letterSpacing: 1,
        }}
      >
        ⬡ RULES{enabledCount > 0 ? <span style={{ marginLeft: 4, color: GRN, fontSize: 9 }}>{enabledCount}</span> : null}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 20, width: 420, maxHeight: "80vh",
      background: "rgba(8,12,24,0.97)", border: "1px solid rgba(41,231,255,0.25)",
      borderRadius: 10, zIndex: 9200, display: "flex", flexDirection: "column",
      fontFamily: "monospace", boxShadow: "0 4px 32px rgba(0,0,0,0.6)",
    }}>
      {/* header */}
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid rgba(41,231,255,0.15)",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ color: CY, fontSize: 13, fontWeight: 700, flex: 1 }}>
          ⬡ WATCHTOWER RULES
        </span>
        {lastFetch && <span style={{ fontSize: 9, color: "#666" }}>{lastFetch}</span>}
        <button onClick={handleEvaluate} disabled={evalLoading} style={{
          background: `rgba(255,56,107,0.12)`, border: "1px solid rgba(255,56,107,0.4)",
          color: RED, borderRadius: 4, padding: "3px 8px", fontSize: 10,
          cursor: evalLoading ? "wait" : "pointer", letterSpacing: 1,
        }}>
          {evalLoading ? "…" : "▶ EVAL"}
        </button>
        <button onClick={handleAssess} style={{
          background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.3)",
          color: PRP, borderRadius: 4, padding: "3px 8px", fontSize: 10,
          cursor: "pointer", letterSpacing: 1,
        }}>
          AI ASSESS
        </button>
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: "#666", fontSize: 16, cursor: "pointer",
        }}>×</button>
      </div>

      {/* stat row */}
      <div style={{
        padding: "8px 16px", borderBottom: "1px solid rgba(41,231,255,0.1)",
        display: "flex", gap: 16,
      }}>
        {[
          { label: "TOTAL", val: rules.length, c: CY },
          { label: "ENABLED", val: enabledCount, c: GRN },
          { label: "DISABLED", val: rules.length - enabledCount, c: "#666" },
          { label: "FIRED", val: alerts.length, c: alerts.length > 0 ? RED : "#666" },
        ].map(({ label, val, c }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{val}</div>
            <div style={{ fontSize: 8, color: "#666", letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* eval result */}
      {evalMsg && (
        <div style={{
          padding: "6px 16px", background: alerts.length > 0 ? "rgba(255,56,107,0.08)" : "rgba(0,229,160,0.06)",
          borderBottom: "1px solid rgba(41,231,255,0.1)", fontSize: 11,
          color: alerts.length > 0 ? RED : GRN,
        }}>
          {evalMsg}
        </div>
      )}

      {/* alert results */}
      {alerts.length > 0 && (
        <div style={{ padding: "8px 14px", borderBottom: "1px solid rgba(41,231,255,0.1)" }}>
          <div style={{ fontSize: 9, color: RED, letterSpacing: 1, marginBottom: 6 }}>FIRED ALERTS</div>
          {alerts.map((a, i) => <AlertCard key={i} alert={a} />)}
        </div>
      )}

      {/* filter tabs */}
      <div style={{
        padding: "6px 14px", borderBottom: "1px solid rgba(41,231,255,0.1)",
        display: "flex", gap: 8,
      }}>
        {["all", "enabled", "disabled"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? "rgba(41,231,255,0.12)" : "none",
            border: `1px solid ${filter === f ? CY + "66" : "#333"}`,
            color: filter === f ? CY : "#666", borderRadius: 3,
            padding: "2px 8px", fontSize: 9, cursor: "pointer", letterSpacing: 1,
            textTransform: "uppercase",
          }}>
            {f}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 9, color: "#555", alignSelf: "center" }}>
          {loading ? "refreshing…" : `${visibleRules.length} rules`}
        </span>
      </div>

      {/* rules list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "10px 14px" }}>
        {loading && !rules.length ? (
          <div style={{ color: "#555", fontSize: 11, textAlign: "center", padding: 20 }}>
            Loading rules…
          </div>
        ) : visibleRules.length === 0 ? (
          <div style={{ color: "#555", fontSize: 11, textAlign: "center", padding: 20 }}>
            No rules found. Configure rules via POST /v1/rules.
          </div>
        ) : (
          visibleRules.map((rule, i) => (
            <RuleCard key={rule.id || rule.name || i} rule={rule} />
          ))
        )}
      </div>
    </div>
  );
}
