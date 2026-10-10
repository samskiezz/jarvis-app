/**
 * LiveWorldDecisionRulesCorrelator — F564 (LWRULS)
 * "JARVIS, live world rules / lwruls / world decision rules / event triggered rules"
 * Cross-references /functions/getLiveIntel + /v1/rules.
 * Finds TRIGGERED rules (≥1 live-event keyword-matches the rule name/target) vs DORMANT.
 * Coverage % tile; ALL/TRIGGERED/DORMANT filter tabs + search; click-to-expand event detail.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4466";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 59_940;
const Z_INDEX  = 128;

const LWRULS_RE =
  /\blwruls\b|\blive.?world.?rules?\b|\bworld.?decision.?rules?\b|\bevent.?triggered.?rules?\b|\blive.?intel.?rules?\b|\bworld.?rule.?alert\b|\brules?.?triggered.?by.?event\b|\blive.?rule.?trigger\b|\bworld.?rules?\b|\bwatch\s*tower.?live\b/i;

export function isLwrulsQuery(text) {
  return LWRULS_RE.test(text || "");
}

// ─── helpers ─────────────────────────────────────────────────────────────────

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

function normaliseLiveEvents(data) {
  if (!data) return [];
  const all = [];

  const quakes = Array.isArray(data.earthquakes) ? data.earthquakes : [];
  quakes.forEach((q, i) => {
    all.push({
      id: q.id || `quake-${i}`,
      kind: "SEISMIC",
      name: q.place || q.name || `Magnitude ${q.magnitude} quake`,
      description: `Mag ${q.magnitude ?? "?"} at ${q.place || "unknown location"}. ${q.type || ""}`,
      tags: ["seismic", "earthquake", "geologic", "disaster", q.place || ""].join(" "),
    });
  });

  const coins = Array.isArray(data.crypto) ? data.crypto
    : Array.isArray(data.coins) ? data.coins : [];
  coins.forEach((c, i) => {
    const sym = c.symbol || c.coin || c.currency || `COIN${i}`;
    const chg = c.change_pct ?? c.change ?? c.pct_change ?? null;
    all.push({
      id: `crypto-${sym}`,
      kind: "CRYPTO",
      name: `${sym} ${chg !== null ? (chg >= 0 ? `+${chg.toFixed(2)}%` : `${chg.toFixed(2)}%`) : ""}`.trim(),
      description: `Cryptocurrency ${sym}: price ${c.price ?? "?"} USD.${chg !== null ? ` Change: ${chg.toFixed(2)}%` : ""}`,
      tags: `crypto ${sym} ${sym.toLowerCase()} digital asset market finance currency volatile`.trim(),
    });
  });

  const fx = Array.isArray(data.fx) ? data.fx
    : Array.isArray(data.currencies) ? data.currencies : [];
  fx.forEach((f, i) => {
    const pair = f.pair || f.symbol || f.currency_pair || `FX${i}`;
    const rate = f.rate ?? f.price ?? null;
    all.push({
      id: `fx-${pair}`,
      kind: "FX",
      name: `${pair} ${rate !== null ? `@ ${rate}` : ""}`.trim(),
      description: `FX pair ${pair}. Rate: ${rate ?? "?"}.`,
      tags: `currency forex fx ${pair} ${pair.toLowerCase()} monetary exchange finance market`.trim(),
    });
  });

  return all;
}

function normaliseRules(data) {
  if (!data) return [];
  const raw =
    Array.isArray(data) ? data
    : Array.isArray(data.rules) ? data.rules
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return raw.map((r, i) => ({
    id:       r.id       || `rule-${i}`,
    name:     r.name     || `Rule ${i + 1}`,
    severity: typeof r.severity === "number" ? r.severity : 50,
    target:   r.target   || "",
    enabled:  r.enabled !== false,
    expr:     r.expr ? (typeof r.expr === "string" ? r.expr : JSON.stringify(r.expr)) : "",
  })).sort((a, b) => b.severity - a.severity);
}

function crossRef(rules, events) {
  return rules.map((rule) => {
    const haystack = `${rule.name} ${rule.target} ${rule.expr}`;
    const matches = events
      .map((ev) => ({
        ev,
        hits: overlap(haystack, `${ev.name} ${ev.description} ${ev.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...rule,
      triggered: matches.length > 0,
      matches: matches.map(({ ev, hits }) => ({ ...ev, hits })),
    };
  });
}

function sevColor(sev) {
  if (sev >= 80) return RED;
  if (sev >= 60) return AMB;
  if (sev >= 40) return CY;
  return GRN;
}

// ─── buildLwrulsScript (for JarvisBrain) ─────────────────────────────────────

export async function buildLwrulsScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [liveRes, rulesRes] = await Promise.all([
      fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
      fetch(`${base}/v1/rules`,               { headers: hdr }),
    ]);
    const liveData  = liveRes.ok  ? await liveRes.json()  : {};
    const rulesData = rulesRes.ok ? await rulesRes.json() : {};

    const events  = normaliseLiveEvents(liveData);
    const rules   = normaliseRules(rulesData);
    const crossed = crossRef(rules, events);

    const total     = crossed.length;
    const triggered = crossed.filter((r) => r.triggered).length;
    const dormant   = total - triggered;
    const coverage  = total > 0 ? Math.round((triggered / total) * 100) : 0;
    const topTriggered = crossed
      .filter((r) => r.triggered)
      .slice(0, 2)
      .map((r) => r.name)
      .join(", ");

    const brief =
      `${coverage}% of ${total} decision rules have live-world triggers. ` +
      `${triggered} TRIGGERED, ${dormant} DORMANT.` +
      (topTriggered ? ` Active rules: ${topTriggered}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Live World × Decision Rules: ${brief} Provide a 2-sentence watchtower readiness assessment.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Live World × Decision Rules Correlator unavailable: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

const KIND_COLOR = { SEISMIC: "#FF6B35", CRYPTO: GRN, FX: CY };

export default function LiveWorldDecisionRulesCorrelator() {
  const [open, setOpen]       = useState(false);
  const [rules, setRules]     = useState([]);
  const [events, setEvents]   = useState([]);
  const [crossed, setCrossed] = useState([]);
  const [tab, setTab]         = useState("ALL");
  const [query, setQuery]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssess] = useState(false);
  const [brief, setBrief]     = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [liveRes, rulesRes] = await Promise.all([
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
        fetch(`${base}/v1/rules`,               { headers: hdr }),
      ]);
      const liveData  = liveRes.ok  ? await liveRes.json()  : {};
      const rulesData = rulesRes.ok ? await rulesRes.json() : {};

      const evs   = normaliseLiveEvents(liveData);
      const rls   = normaliseRules(rulesData);
      setEvents(evs);
      setRules(rls);
      setCrossed(crossRef(rls, evs));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => {
      if (!v) load();
      return !v;
    });
    window.addEventListener("jarvis:lwruls-toggle", onToggle);
    return () => window.removeEventListener("jarvis:lwruls-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssess(true);
    setBrief("");
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const total     = crossed.length;
      const triggered = crossed.filter((r) => r.triggered).length;
      const dormant   = total - triggered;
      const coverage  = total > 0 ? Math.round((triggered / total) * 100) : 0;
      const prompt = `Live World × Decision Rules: ${coverage}% trigger coverage (${triggered}/${total} triggered, ${dormant} dormant). Provide a 2-sentence watchtower readiness assessment.`;
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const d = res.ok ? await res.json() : {};
      const text = d.response || d.message || d.reply || "Assessment complete.";
      setBrief(text);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "onyx" }),
      });
    } catch (e) {
      setBrief(`Assessment error: ${e.message}`);
    } finally {
      setAssess(false);
    }
  }, [crossed]);

  const visible = crossed.filter((rule) => {
    if (tab === "TRIGGERED" && !rule.triggered) return false;
    if (tab === "DORMANT"   &&  rule.triggered) return false;
    if (query) {
      const q = query.toLowerCase();
      if (
        !rule.name.toLowerCase().includes(q) &&
        !rule.target.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const total      = crossed.length;
  const nTriggered = crossed.filter((r) => r.triggered).length;
  const nDormant   = total - nTriggered;
  const coverage   = total > 0 ? Math.round((nTriggered / total) * 100) : 0;

  const btnStyle = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: Z_INDEX,
    background: "rgba(0,0,0,0.85)",
    border: `1px solid ${CY}`,
    color: CY,
    fontFamily: "monospace",
    fontSize: 10,
    padding: "2px 7px",
    cursor: "pointer",
    borderRadius: 3,
    userSelect: "none",
    display: "flex",
    alignItems: "center",
    gap: 4,
  };

  const panelStyle = {
    position: "fixed",
    right: 18,
    bottom: 54,
    width: 460,
    maxHeight: "78vh",
    overflowY: "auto",
    background: "rgba(0,6,18,0.97)",
    border: `1px solid ${CY}44`,
    borderRadius: 8,
    padding: 16,
    zIndex: 9999,
    fontFamily: "monospace",
    color: CY,
    boxSizing: "border-box",
  };

  return (
    <>
      <button
        style={btnStyle}
        onClick={() => { setOpen((v) => { if (!v) load(); return !v; }); }}
        title="Live World × Decision Rules Correlator"
      >
        ◈ LWRULS
        {nTriggered > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 8, padding: "0 4px", fontSize: 9 }}>
            {nTriggered}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>LIVE WORLD × DECISION RULES</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={load}
                style={{ background: "none", border: `1px solid ${CY}55`, color: CY, cursor: "pointer", padding: "2px 8px", borderRadius: 3, fontSize: 10 }}
                title="Refresh"
              >
                ↺
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[
              { label: "TRIGGER COVERAGE", value: `${coverage}%`, color: coverage > 60 ? GRN : coverage > 30 ? AMB : RED },
              { label: "TRIGGERED",        value: nTriggered,     color: AMB },
              { label: "DORMANT",          value: nDormant,       color: DIM },
              { label: "LIVE EVENTS",      value: events.length,  color: CY },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  flex: 1, background: "rgba(41,231,255,0.05)", border: `1px solid ${color}33`,
                  borderRadius: 4, padding: "6px 8px", textAlign: "center",
                }}
              >
                <div style={{ fontSize: 16, fontWeight: "bold", color }}>{value}</div>
                <div style={{ fontSize: 8, color: DIM, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Assess */}
          <div style={{ marginBottom: 10 }}>
            <button
              onClick={assess}
              disabled={assessing || crossed.length === 0}
              style={{
                background: assessing ? "rgba(41,231,255,0.1)" : "rgba(41,231,255,0.15)",
                border: `1px solid ${CY}88`,
                color: CY, cursor: assessing ? "wait" : "pointer",
                padding: "4px 14px", borderRadius: 3, fontSize: 10, fontFamily: "monospace",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, fontSize: 10, color: "#cde", lineHeight: 1.5, padding: "6px 8px", background: "rgba(41,231,255,0.05)", borderRadius: 3 }}>
                {brief}
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {["ALL", "TRIGGERED", "DORMANT"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "none",
                  border: `1px solid ${tab === t ? CY : CY + "33"}`,
                  color: tab === t ? CY : DIM,
                  cursor: "pointer", padding: "2px 10px", borderRadius: 3,
                  fontSize: 10, fontFamily: "monospace",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rules…"
            style={{
              width: "100%", background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}33`,
              color: CY, padding: "4px 8px", borderRadius: 3, fontSize: 10,
              marginBottom: 8, boxSizing: "border-box", fontFamily: "monospace",
            }}
          />

          {/* Rule rows */}
          {loading ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>No rules match.</div>
          ) : (
            visible.map((rule) => (
              <div key={rule.id}>
                <div
                  onClick={() => setExpanded(expanded === rule.id ? null : rule.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 6px", marginBottom: 3, cursor: "pointer",
                    borderRadius: 3, background: "rgba(41,231,255,0.04)",
                    border: `1px solid ${rule.triggered ? AMB + "55" : DIM + "22"}`,
                  }}
                >
                  <span style={{
                    fontSize: 8, padding: "1px 4px", borderRadius: 2,
                    background: `${sevColor(rule.severity)}22`, color: sevColor(rule.severity),
                    minWidth: 24, textAlign: "center",
                  }}>
                    {rule.severity}
                  </span>
                  <span style={{ flex: 1, fontSize: 10, color: rule.triggered ? AMB : DIM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {rule.name}
                    {rule.target ? <span style={{ color: DIM, marginLeft: 4, fontSize: 9 }}>→ {rule.target}</span> : null}
                  </span>
                  {rule.triggered ? (
                    <span style={{ fontSize: 8, color: AMB }}>⬡ {rule.matches.length} ev</span>
                  ) : (
                    <span style={{ fontSize: 8, color: DIM }}>DORMANT</span>
                  )}
                </div>

                {/* Expanded matched events */}
                {expanded === rule.id && rule.triggered && (
                  <div style={{ marginLeft: 12, marginBottom: 6 }}>
                    {rule.expr && (
                      <div style={{ fontSize: 9, color: DIM, marginBottom: 4, wordBreak: "break-all" }}>
                        expr: {rule.expr.slice(0, 120)}
                      </div>
                    )}
                    {rule.matches.map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          padding: "3px 6px", marginBottom: 2, borderRadius: 2,
                          background: "rgba(255,165,0,0.05)", border: `1px solid ${KIND_COLOR[ev.kind] || DIM}33`,
                          fontSize: 9,
                        }}
                      >
                        <span style={{ color: KIND_COLOR[ev.kind] || DIM, marginRight: 4 }}>[{ev.kind}]</span>
                        <span style={{ color: AMB }}>{ev.name}</span>
                        <span style={{ color: DIM, marginLeft: 6 }}>hits:{ev.hits}</span>
                      </div>
                    ))}
                  </div>
                )}

                {expanded === rule.id && !rule.triggered && (
                  <div style={{ marginLeft: 12, marginBottom: 6, fontSize: 9, color: DIM }}>
                    No live world events correlate with this rule.
                    {rule.target && <div style={{ marginTop: 2 }}>Target: {rule.target}</div>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
