/**
 * DecisionRulesRiskNexus — F502
 * "JARVIS, rules risk / triggered rules / rulsrsk / which rules are active / rule triggers"
 * Cross-references /v1/rules + /entities/RiskSignal.
 * Identifies which WATCHTOWER decision rules have at least one keyword-matching active risk
 * signal (TRIGGERED — rule is live) vs rules with no active signal match (IDLE — untriggered).
 * Coverage % tile; ALL/TRIGGERED/IDLE filter tabs + search; click-to-expand matched signals.
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

const POLL_MS = 120_000;

const RULSRSK_RE =
  /\brulsrsk\b|\brules?.risk\b|\brisk.?rules?\b|\btriggered.?rules?\b|\bwhich.?rules?.?(are.?)?active\b|\brule.?triggers?\b|\bwatchtower.?triggered\b|\bactive.?rules?\b|\bdecision.?rules?.?risk\b|\brisk.?signal.?rules?\b|\brules?.?with.?signals?\b/i;

export function isRulsrskQuery(text) {
  return RULSRSK_RE.test(text || "");
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

const SEV_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function normaliseRules(data) {
  if (!data) return [];
  const raw =
    data.rules || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:        r.id || `rule-${i}`,
    name:      r.name || r.title || r.rule_name || `Rule ${i + 1}`,
    target:    r.target || r.entity || r.applies_to || null,
    condition: r.condition || r.expression || r.logic || null,
    severity:  (r.severity || r.level || "MEDIUM").toUpperCase(),
    enabled:   r.enabled !== false,
  }));
}

function normaliseSignals(data) {
  if (!data) return [];
  const raw =
    data.signals || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:          s.id || `sig-${i}`,
    title:       s.title || s.name || s.signal_name || `Signal ${i + 1}`,
    severity:    (s.severity || s.level || "MEDIUM").toUpperCase(),
    description: s.description || s.summary || null,
    source:      s.source || null,
    tags:        s.tags || [],
  }));
}

function crossRef(rules, signals) {
  return rules
    .map((rule) => {
      const haystack = `${rule.name} ${rule.target || ""} ${rule.condition || ""}`;
      const matches = signals
        .map((sig) => {
          const hits = overlap(
            haystack,
            `${sig.title} ${sig.description || ""} ${(sig.tags || []).join(" ")}`
          );
          return hits > 0 ? { ...sig, hits } : null;
        })
        .filter(Boolean)
        .sort((a, b) => {
          const sd = (SEV_ORDER[a.severity] ?? 2) - (SEV_ORDER[b.severity] ?? 2);
          return sd !== 0 ? sd : b.hits - a.hits;
        })
        .slice(0, 6);
      return { ...rule, signals: matches, triggered: matches.length > 0 };
    })
    .sort((a, b) => {
      if (a.triggered !== b.triggered) return a.triggered ? -1 : 1;
      return (SEV_ORDER[a.severity] ?? 2) - (SEV_ORDER[b.severity] ?? 2);
    });
}

export async function buildRulsrskScript() {
  try {
    const base = apiBase();
    const [rRes, sRes] = await Promise.all([
      fetch(`${base}/v1/rules`,          { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const [rData, sData] = await Promise.all([rRes.json(), sRes.json()]);
    const rules   = normaliseRules(rData);
    const signals = normaliseSignals(sData);
    const rows    = crossRef(rules, signals);
    const triggered = rows.filter((r) => r.triggered).length;
    const idle      = rows.length - triggered;
    const pct = rows.length ? Math.round((triggered / rows.length) * 100) : 0;
    if (!rows.length) return "No decision rules found in the system, sir.";
    const critTriggered = rows.filter(
      (r) => r.triggered && r.severity === "CRITICAL"
    ).length;
    return (
      `${triggered} of ${rules.length} decision rules are actively triggered by live risk signals ` +
      `(${pct}% rule activation rate). ` +
      (critTriggered > 0
        ? `${critTriggered} CRITICAL rule${critTriggered !== 1 ? "s" : ""} are triggered — immediate review recommended.`
        : `${idle} rule${idle !== 1 ? "s" : ""} remain idle with no matching active signals.`)
    );
  } catch {
    return "Unable to reach rules or risk signal endpoints, sir.";
  }
}

export default function DecisionRulesRiskNexus() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [rRes, sRes] = await Promise.all([
        fetch(`${base}/v1/rules`,          { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [rData, sData] = await Promise.all([rRes.json(), sRes.json()]);
      setRows(crossRef(normaliseRules(rData), normaliseSignals(sData)));
    } catch {
      /* network errors are non-fatal */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:rulsrsk-toggle", toggle);
    return () => window.removeEventListener("jarvis:rulsrsk-toggle", toggle);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const triggered = rows.filter((r) => r.triggered);
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `Assess decision rules risk signal activation: ${rows.length} rules total, ` +
            `${triggered.length} triggered by live signals, ` +
            `${rows.length - triggered.length} idle. ` +
            `Critical triggered: ${triggered.filter((r) => r.severity === "CRITICAL").map((r) => r.name).slice(0, 3).join(", ") || "none"}. ` +
            "Give a 2-sentence operational brief and recommended action.",
        }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      if (text) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [rows]);

  const triggered = rows.filter((r) => r.triggered).length;
  const idle      = rows.length - triggered;
  const pct       = rows.length ? Math.round((triggered / rows.length) * 100) : 0;
  const critCount = rows.filter((r) => r.triggered && r.severity === "CRITICAL").length;

  const visible = rows
    .filter((r) => {
      if (tab === "TRIGGERED") return r.triggered;
      if (tab === "IDLE")      return !r.triggered;
      return true;
    })
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        (r.target || "").toLowerCase().includes(q) ||
        (r.severity || "").toLowerCase().includes(q)
      );
    });

  const SEV_COLOR = { CRITICAL: RED, HIGH: AMB, MEDIUM: CY, LOW: GRN };

  const BTN_LEFT = 26_400;
  const BTN_STYLE = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: 89,
    padding: "4px 10px",
    background: "rgba(5,8,13,0.82)",
    border: `1px solid ${critCount > 0 ? RED : triggered > 0 ? AMB : CY}55`,
    borderRadius: 6,
    cursor: "pointer",
    color: CY,
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10,
    letterSpacing: 1,
    display: "flex",
    alignItems: "center",
    gap: 5,
    backdropFilter: "blur(6px)",
  };

  const PANEL = {
    position: "fixed",
    left: BTN_LEFT - 320,
    bottom: 38,
    zIndex: 89,
    width: 390,
    maxHeight: "70vh",
    overflowY: "auto",
    background: "rgba(6,10,16,0.94)",
    border: `1px solid ${CY}44`,
    borderRadius: 10,
    padding: 14,
    fontFamily: "'JetBrains Mono',monospace",
    color: "#DCEBF5",
    backdropFilter: "blur(10px)",
    boxShadow: `0 0 40px ${CY}18`,
  };

  const tabStyle = (t) => ({
    padding: "3px 8px",
    border: `1px solid ${tab === t ? CY : CY + "33"}`,
    borderRadius: 4,
    cursor: "pointer",
    background: tab === t ? CY + "22" : "transparent",
    color: tab === t ? CY : DIM,
    fontSize: 10,
    letterSpacing: 1,
  });

  return (
    <>
      <button style={BTN_STYLE} onClick={() => setOpen((o) => !o)} title="Decision Rules × Risk Signal Nexus">
        ◈ RULSRSK
        {critCount > 0 && (
          <span style={{ background: RED, color: "#fff", borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>
            {critCount}
          </span>
        )}
        {critCount === 0 && triggered > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>
            {triggered}
          </span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>DECISION RULES × RISK NEXUS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { label: "RULES",     value: rows.length, color: CY },
              { label: "TRIGGERED", value: triggered,   color: triggered > 0 ? AMB : GRN },
              { label: "IDLE",      value: idle,        color: idle > 0 ? DIM : GRN },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${color}33`, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                <div style={{ color, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : value}</div>
                <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* activation bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>RULE ACTIVATION</span>
              <span style={{ color: pct >= 50 ? RED : pct >= 25 ? AMB : GRN, fontSize: 10, fontWeight: "bold" }}>{pct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 50 ? RED : pct >= 25 ? AMB : GRN, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            {["ALL", "TRIGGERED", "IDLE"].map((t) => (
              <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search rules…"
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`, borderRadius: 5, color: "#DCEBF5", padding: "5px 8px", fontSize: 11, marginBottom: 8, outline: "none" }}
          />

          {/* list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 12 }}>No rules match.</div>
            )}
            {visible.map((rule) => (
              <div
                key={rule.id}
                style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${rule.triggered ? AMB : DIM}33`, borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === rule.id ? null : rule.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: rule.triggered ? AMB : DIM, fontSize: 10 }}>{rule.triggered ? "●" : "○"}</span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{rule.name}</span>
                  <span style={{ color: SEV_COLOR[rule.severity] || CY, fontSize: 9, border: `1px solid ${(SEV_COLOR[rule.severity] || CY)}44`, borderRadius: 3, padding: "1px 4px" }}>{rule.severity}</span>
                  <span style={{ color: rule.triggered ? AMB : DIM, fontSize: 9 }}>{rule.triggered ? `${rule.signals.length} sig.` : "IDLE"}</span>
                </div>
                {rule.target && (
                  <div style={{ color: DIM, fontSize: 9 }}>target: {rule.target}</div>
                )}

                {expanded === rule.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${CY}22`, paddingTop: 6 }}>
                    {rule.triggered ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {rule.signals.map((sig) => (
                          <div key={sig.id} style={{ background: `rgba(255,165,0,0.05)`, border: `1px solid ${AMB}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ color: SEV_COLOR[sig.severity] || CY, fontSize: 9, fontWeight: "bold" }}>{sig.severity}</span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{sig.title}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {sig.hits}</span>
                            </div>
                            {sig.description && (
                              <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>{sig.description.slice(0, 80)}{sig.description.length > 80 ? "…" : ""}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No active risk signals matched this rule — rule is idle.</div>
                    )}
                    {rule.condition && (
                      <div style={{ marginTop: 5, color: DIM, fontSize: 9, borderLeft: `2px solid ${CY}33`, paddingLeft: 6 }}>
                        condition: {String(rule.condition).slice(0, 120)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${CY}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{ background: `${CY}18`, border: `1px solid ${CY}55`, borderRadius: 5, color: CY, padding: "5px 12px", cursor: "pointer", fontSize: 10, letterSpacing: 1, width: "100%", opacity: assessing ? 0.6 : 1 }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5, borderLeft: `2px solid ${CY}`, paddingLeft: 8 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
