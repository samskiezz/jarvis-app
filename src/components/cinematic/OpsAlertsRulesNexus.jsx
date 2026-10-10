/**
 * OpsAlertsRulesNexus — F660
 * "JARVIS, oalrule / ops alert rule / alert rule / which alerts match rules /
 *  rule-triggered alerts / alert rule coverage / watchtower alert / rule alert nexus"
 * Cross-references /v1/ops/alerts against /v1/rules.
 * RULE-TRIGGERED alerts (≥1 rule keyword-matches) vs UNMATCHED (no rule backing).
 * Coverage % tile; ALL/RULE-TRIGGERED/UNMATCHED filter tabs + search; click-to-expand matched rules.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 119_140;
const Z_INDEX  = 197;

const OALRULE_RE =
  /\boalrule\b|\bops.?alert.?rule\b|\balert.?rule\b|\bwhich.?alerts?.?match.?rules?\b|\brule.?triggered.?alert\b|\balert.?rule.?coverage\b|\bwatchtower.?alert\b|\brule.?alert.?nexus\b/i;

export function isOalruleQuery(text) {
  return OALRULE_RE.test(text || "");
}

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(keywords(a));
  return keywords(b).filter((w) => sa.has(w)).length;
}

function normaliseAlerts(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.alerts)
    ? data.alerts
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((a, i) => ({
    id:       a.id       || a.alert_id || String(i),
    title:    a.title    || a.name     || a.summary    || `Alert ${i + 1}`,
    severity: (a.severity || a.level   || "INFO").toString().toUpperCase(),
    source:   a.source   || a.service  || a.origin || "",
    message:  a.message  || a.description || a.body || "",
  }));
}

function normaliseRules(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.rules)
    ? data.rules
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((r, i) => ({
    id:       r.id       || `rule-${i}`,
    name:     r.name     || r.title    || `Rule ${i + 1}`,
    target:   r.target   || r.entity   || r.type || "",
    severity: (r.severity || r.level   || "MEDIUM").toString().toUpperCase(),
    enabled:  r.enabled !== false,
    condition: r.condition || r.expression || "",
  }));
}

function correlate(alerts, rules) {
  return alerts.map((alert) => {
    const haystack = [alert.title, alert.message, alert.source].join(" ");
    const matched = rules
      .map((rule) => {
        const needle = [rule.name, rule.target, rule.condition].join(" ");
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...rule, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 6);
    return { ...alert, _matched: matched, _triggered: matched.length > 0 };
  });
}

export async function buildOalruleScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [alR, rlR] = await Promise.allSettled([
      fetch(`${base}/v1/ops/alerts`, { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/v1/rules`, { headers: hdr }).then((r) => r.json()),
    ]);
    const alerts = normaliseAlerts(alR.status === "fulfilled" ? alR.value : []);
    const rules  = normaliseRules(rlR.status === "fulfilled" ? rlR.value : []);
    const enriched   = correlate(alerts, rules);
    const triggered  = enriched.filter((a) => a._triggered).length;
    const unmatched  = enriched.length - triggered;
    const topUnmatched = enriched
      .filter((a) => !a._triggered)
      .slice(0, 3)
      .map((a) => a.title)
      .join(", ") || "none";
    return (
      `Ops Alerts × Rules Nexus: ${alerts.length} alerts, ${rules.length} WATCHTOWER rules indexed. ` +
      `${triggered} alerts are rule-triggered; ${unmatched} are unmatched (no rule backing). ` +
      `Unmatched alerts: ${topUnmatched}.`
    );
  } catch {
    return "Ops Alerts × Rules Nexus is online. Opening coverage panel now, sir.";
  }
}

function SevBadge({ sev }) {
  const color =
    sev === "CRITICAL" ? RED :
    sev === "HIGH"     ? AMB :
    sev === "WARNING"  ? AMB :
    sev === "INFO"     ? CY  : DIM;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color, border: `1px solid ${color}`,
      borderRadius: 3, padding: "1px 4px", marginRight: 4,
    }}>{sev}</span>
  );
}

export default function OpsAlertsRulesNexus() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [alR, rlR] = await Promise.allSettled([
        fetch(`${base}/v1/ops/alerts`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/v1/rules`, { headers: hdr }).then((r) => r.json()),
      ]);
      const alerts = normaliseAlerts(alR.status === "fulfilled" ? alR.value : []);
      const rules  = normaliseRules(rlR.status === "fulfilled" ? rlR.value : []);
      setData({ alerts: correlate(alerts, rules), ruleCount: rules.length });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:oalrule-toggle", handler);
    return () => window.removeEventListener("jarvis:oalrule-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const alerts    = data?.alerts || [];
  const triggered = alerts.filter((a) => a._triggered).length;
  const unmatched = alerts.length - triggered;
  const pct = alerts.length ? Math.round((triggered / alerts.length) * 100) : 0;

  const visible = alerts.filter((a) => {
    if (tab === "RULE-TRIGGERED" && !a._triggered) return false;
    if (tab === "UNMATCHED"      &&  a._triggered) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.title.toLowerCase().includes(q) && !a.source.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildOalruleScript();
      const base   = apiBase();
      const hdr    = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const aiRes  = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({ message: script }),
      });
      const aiJson = await aiRes.json();
      const text   = aiJson?.response || aiJson?.message || script;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: text }));
    } catch {
      /* silent */
    } finally {
      setAssessing(false);
    }
  }, []);

  const btnStyle = {
    position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
    background: "rgba(0,20,40,0.85)", border: `1px solid ${AMB}`,
    color: AMB, fontSize: 9, fontWeight: 700, padding: "3px 6px",
    borderRadius: 4, cursor: "pointer", fontFamily: "monospace",
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen((o) => !o)} title="Ops Alerts × Rules Nexus">
        ◈ OALRULE
        {unmatched > 0 && (
          <span style={{
            marginLeft: 4, background: AMB, color: "#000",
            borderRadius: 8, fontSize: 8, padding: "1px 4px",
          }}>{unmatched}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", top: 60, right: 20, width: 480, maxHeight: "80vh",
          background: "rgba(0,12,28,0.97)", border: `1px solid ${AMB}`,
          borderRadius: 8, zIndex: Z_INDEX + 1, display: "flex", flexDirection: "column",
          fontFamily: "monospace", color: CY, overflowY: "auto",
        }}>
          {/* header */}
          <div style={{ padding: "10px 14px 6px", borderBottom: `1px solid rgba(255,165,0,0.25)`, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, fontWeight: 700, fontSize: 11, color: AMB }}>
              ◈ OPS ALERTS × RULES NEXUS
            </span>
            <button onClick={assess} disabled={assessing} style={{
              background: assessing ? "#333" : "rgba(0,200,120,0.15)",
              border: `1px solid ${GRN}`, color: GRN, fontSize: 9, padding: "2px 7px",
              borderRadius: 3, cursor: assessing ? "wait" : "pointer",
            }}>{assessing ? "…" : "▶ ASSESS"}</button>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: DIM, fontSize: 14, cursor: "pointer",
            }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid rgba(255,165,0,0.15)` }}>
            {[
              { label: "ALERTS",        val: alerts.length,         col: CY },
              { label: "RULES",         val: data?.ruleCount || 0,  col: CY },
              { label: "RULE-TRIGGERED", val: triggered,            col: GRN },
              { label: "UNMATCHED",     val: unmatched,             col: AMB },
              { label: "COVERAGE",      val: `${pct}%`,             col: pct >= 60 ? GRN : AMB },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1, textAlign: "center", background: "rgba(255,255,255,0.04)",
                borderRadius: 4, padding: "4px 2px",
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: col }}>{val}</div>
                <div style={{ fontSize: 8, color: DIM }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ display: "flex", gap: 6, padding: "6px 14px", borderBottom: `1px solid rgba(255,165,0,0.1)`, alignItems: "center" }}>
            {["ALL", "RULE-TRIGGERED", "UNMATCHED"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${AMB}22` : "none",
                border: `1px solid ${tab === t ? AMB : "#334"}`,
                color: tab === t ? AMB : DIM, fontSize: 8, padding: "2px 6px",
                borderRadius: 3, cursor: "pointer",
              }}>{t}</button>
            ))}
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.06)",
                border: `1px solid #334`, color: CY, fontSize: 9,
                padding: "2px 6px", borderRadius: 3, width: 120,
              }}
            />
          </div>

          {/* rows */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
            {loading && !alerts.length && (
              <div style={{ color: DIM, fontSize: 10, padding: 8 }}>Loading…</div>
            )}
            {!loading && !visible.length && (
              <div style={{ color: DIM, fontSize: 10, padding: 8 }}>No alerts match this filter.</div>
            )}
            {visible.map((alert) => (
              <div key={alert.id} style={{
                borderBottom: `1px solid rgba(255,165,0,0.08)`,
                padding: "6px 0", cursor: "pointer",
              }} onClick={() => setExpanded(expanded === alert.id ? null : alert.id)}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <SevBadge sev={alert.severity} />
                  <span style={{
                    flex: 1, fontSize: 10, color: alert._triggered ? CY : DIM,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{alert.title}</span>
                  <span style={{
                    fontSize: 8, color: alert._triggered ? GRN : "#556",
                    background: alert._triggered ? "rgba(0,200,120,0.1)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${alert._triggered ? GRN : "#334"}`,
                    borderRadius: 3, padding: "1px 4px",
                  }}>{alert._triggered ? "RULE-TRIGGERED" : "UNMATCHED"}</span>
                </div>
                {alert.source && (
                  <div style={{ fontSize: 8, color: DIM, marginTop: 2, paddingLeft: 2 }}>
                    src: {alert.source}
                  </div>
                )}
                {expanded === alert.id && alert._matched.length > 0 && (
                  <div style={{ marginTop: 6, paddingLeft: 4 }}>
                    {alert._matched.map((rule) => (
                      <div key={rule.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "3px 0", borderTop: `1px solid rgba(41,231,255,0.08)`,
                      }}>
                        <span style={{ fontSize: 9, color: CY, flex: 1,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {rule.name}
                        </span>
                        <SevBadge sev={rule.severity} />
                        <span style={{ fontSize: 8, color: rule.enabled ? GRN : DIM }}>
                          {rule.enabled ? "ON" : "OFF"}
                        </span>
                        <span style={{
                          fontSize: 8, color: GRN, background: "rgba(0,200,120,0.1)",
                          border: `1px solid ${GRN}`, borderRadius: 3, padding: "1px 3px",
                        }}>{rule.hits} hit{rule.hits !== 1 ? "s" : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
                {expanded === alert.id && !alert._matched.length && (
                  <div style={{ fontSize: 8, color: DIM, marginTop: 4, paddingLeft: 4 }}>
                    No WATCHTOWER rules match this alert.
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
