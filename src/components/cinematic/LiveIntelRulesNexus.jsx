/**
 * LiveIntelRulesNexus — F705
 * "JARVIS, lirules / live intel rules / rules triggered by live events /
 *  watchtower live / live world rules / which rules have live signals /
 *  live triggered rules / live intel watchtower"
 * Cross-references /functions/getLiveIntel (seismic/crypto/FX events)
 * against /v1/rules (Watchtower decision rules).
 * TRIGGERED rules (≥1 live event keyword-match) vs DORMANT (no current signal).
 * Coverage % tile; ALL/TRIGGERED/DORMANT filter tabs + search;
 * click-to-expand matched live events with KIND badge + hit count.
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

const POLL_MS  = 300_000; // getLiveIntel is external — 5-min refresh
const BTN_LEFT = 883_180;
const Z_INDEX  = 241;

const LIRULES_RE =
  /\blirules\b|\blive.?intel.?rules?\b|\brules?.?triggered.?by.?live\b|\bwatchtower.?live\b|\blive.?world.?rules?\b|\bwhich.?rules?.?have.?live\b|\blive.?triggered.?rules?\b|\blive.?intel.?watchtower\b/i;

export function isLirulesQuery(text) {
  return LIRULES_RE.test(text || "");
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

function normaliseEvents(data) {
  if (!data) return [];
  const seismic = (data.seismic || data.earthquakes || []).map((e, i) => ({
    id:   `seis-${i}`,
    name: e.place || e.location || e.description || `Quake ${i + 1}`,
    kind: "SEISMIC",
    desc: `mag ${e.magnitude ?? e.mag ?? "?"}`,
  }));
  const crypto = (data.crypto || data.cryptocurrency || []).map((c, i) => ({
    id:   `cryp-${i}`,
    name: c.name || c.symbol || `Crypto ${i + 1}`,
    kind: "CRYPTO",
    desc: c.price != null ? `$${c.price}` : "",
  }));
  const fx = (data.fx || data.forex || data.currencies || []).map((f, i) => ({
    id:   `fx-${i}`,
    name: f.pair || f.symbol || f.name || `FX ${i + 1}`,
    kind: "FX",
    desc: f.rate != null ? `${f.rate}` : "",
  }));
  return [...seismic, ...crypto, ...fx];
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
    id:        r.id       || `rule-${i}`,
    name:      r.name     || r.title  || `Rule ${i + 1}`,
    severity:  (r.severity || r.level  || r.priority || "MEDIUM").toString().toUpperCase(),
    target:    r.target   || r.entity || r.scope || "",
    condition: r.condition || r.expression || r.query || "",
    enabled:   r.enabled !== false,
  }));
}

function crossRef(rules, events) {
  return rules.map((rule) => {
    const haystack = `${rule.name} ${rule.target} ${rule.condition}`;
    const matches = events
      .map((ev) => {
        const needle = `${ev.name} ${ev.desc} ${ev.kind}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...ev, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...rule, matches, triggered: matches.length > 0 };
  });
}

function sevColor(s) {
  if (s === "CRITICAL") return RED;
  if (s === "HIGH")     return AMB;
  if (s === "WARNING")  return AMB;
  return CY;
}

function kindColor(k) {
  if (k === "SEISMIC") return AMB;
  if (k === "CRYPTO")  return CY;
  if (k === "FX")      return GRN;
  return DIM;
}

export async function buildLirulesScript() {
  try {
    const base = apiBase();
    const [evRes, ruleRes] = await Promise.all([
      fetch(`${base}/functions/getLiveIntel`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/rules`,               { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const [evData, ruleData] = await Promise.all([evRes.json(), ruleRes.json()]);
    const events   = normaliseEvents(evData);
    const rules    = normaliseRules(ruleData);
    const enriched = crossRef(rules, events);
    const triggered = enriched.filter((r) => r.triggered);
    const pct       = rules.length > 0 ? Math.round((triggered.length / rules.length) * 100) : 0;
    const topTriggered = triggered.slice(0, 3).map((r) => r.name).join(", ");
    return (
      `Live intel × decision rules nexus: ${rules.length} Watchtower rules cross-referenced against ` +
      `${events.length} live world events. ` +
      `${triggered.length} rules are currently triggered by live signals (${pct}% activation), ` +
      `${rules.length - triggered.length} are dormant. ` +
      (topTriggered ? `Top triggered rules: ${topTriggered}.` : "")
    ).trim();
  } catch {
    return "Unable to reach the live intel or rules endpoint, sir.";
  }
}

export default function LiveIntelRulesNexus() {
  const [open, setOpen]       = useState(false);
  const [events, setEvents]   = useState([]);
  const [rules, setRules]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [assess, setAssess]   = useState("");
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [evRes, ruleRes] = await Promise.all([
        fetch(`${base}/functions/getLiveIntel`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/rules`,               { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [evData, ruleData] = await Promise.all([evRes.json(), ruleRes.json()]);
      setEvents(normaliseEvents(evData));
      setRules(normaliseRules(ruleData));
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [open, load]);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:lirules-toggle", toggle);
    return () => window.removeEventListener("jarvis:lirules-toggle", toggle);
  }, []);

  const enriched  = crossRef(rules, events);
  const triggered = enriched.filter((r) => r.triggered);
  const pct       = rules.length > 0 ? Math.round((triggered.length / rules.length) * 100) : 0;

  const filtered = enriched
    .filter((r) => {
      if (tab === "TRIGGERED") return r.triggered;
      if (tab === "DORMANT")   return !r.triggered;
      return true;
    })
    .filter((r) => {
      const q = search.toLowerCase();
      return !q || r.name.toLowerCase().includes(q) || r.target.toLowerCase().includes(q);
    });

  async function runAssess() {
    setAssessing(true); setAssess("");
    try {
      const prompt =
        `JARVIS live intel × decision rules nexus: ${rules.length} rules, ` +
        `${events.length} live events. ${triggered.length} rules triggered (${pct}%). ` +
        `Give a 2-sentence Watchtower live-signal activation brief.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssess(txt);
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: txt }),
      });
    } catch {
      setAssess("Assessment unavailable.");
    }
    setAssessing(false);
  }

  const tile = (label, val, color) => (
    <div style={{ flex: 1, minWidth: 90, background: "rgba(0,0,0,0.35)", borderRadius: 8,
      padding: "8px 10px", border: `1px solid ${color}33`, textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
      <div style={{ fontSize: 9, color: DIM, letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );

  const TABS = ["ALL", "TRIGGERED", "DORMANT"];

  return (
    <>
      {/* trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Live Intel × Decision Rules (LIRULES)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: open ? CY : "rgba(5,8,13,0.82)", color: open ? "#04060A" : CY,
          border: `1px solid ${CY}`, borderRadius: 6, padding: "3px 8px",
          fontSize: 10, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: 1, boxShadow: `0 0 10px ${CY}44`, whiteSpace: "nowrap",
        }}>
        ◈ LIRULES
        {!open && triggered.length > 0 && (
          <span style={{ marginLeft: 4, background: RED, color: "#fff", borderRadius: 3,
            padding: "0 4px", fontSize: 9, fontWeight: 700 }}>
            {triggered.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: BTN_LEFT - 360, bottom: 36, zIndex: Z_INDEX,
          width: 420, maxHeight: "70vh", display: "flex", flexDirection: "column",
          background: "rgba(6,10,18,0.96)", border: `1px solid ${CY}44`, borderRadius: 12,
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          boxShadow: `0 0 40px ${CY}22`, overflow: "hidden",
        }}>
          {/* header */}
          <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: CY, fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>
              LIVE INTEL × DECISION RULES
            </span>
            <span style={{ marginLeft: "auto", fontSize: 9, color: DIM }}>
              {loading ? "loading…" : `${rules.length} rules · ${events.length} events`}
            </span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none",
              color: DIM, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 12px", flexWrap: "wrap" }}>
            {tile("RULES",     rules.length,              CY)}
            {tile("LIVE EVTS", events.length,             AMB)}
            {tile("TRIGGERED", triggered.length,          RED)}
            {tile("DORMANT",   rules.length - triggered.length, DIM)}
            {tile("ACTIVATION", `${pct}%`, pct >= 50 ? RED : pct >= 20 ? AMB : GRN)}
          </div>

          {/* filter tabs + search */}
          <div style={{ display: "flex", gap: 4, padding: "0 12px 6px", flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? CY : "rgba(0,0,0,0.4)", color: tab === t ? "#04060A" : CY,
                border: `1px solid ${CY}44`, borderRadius: 4, padding: "2px 8px",
                fontSize: 9, cursor: "pointer", letterSpacing: 1,
              }}>{t}</button>
            ))}
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="search rules…"
              style={{ marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`,
                borderRadius: 4, padding: "2px 8px", fontSize: 9, color: "#DCEBF5",
                outline: "none", width: 120 }}
            />
          </div>

          {/* rule list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 8px" }}>
            {filtered.length === 0 && (
              <div style={{ color: DIM, fontSize: 10, padding: "12px 0", textAlign: "center" }}>
                {loading ? "Loading data…" : "No rules match."}
              </div>
            )}
            {filtered.map((rule) => (
              <div key={rule.id}>
                <div
                  onClick={() => setExpanded(expanded === rule.id ? null : rule.id)}
                  style={{
                    padding: "6px 8px", marginBottom: 4, borderRadius: 6, cursor: "pointer",
                    background: expanded === rule.id ? "rgba(41,231,255,0.06)" : "rgba(0,0,0,0.25)",
                    border: `1px solid ${rule.triggered ? RED : DIM}33`,
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                  <span style={{ fontSize: 9, color: sevColor(rule.severity), fontWeight: 700,
                    minWidth: 52 }}>
                    {rule.severity}
                  </span>
                  <span style={{ fontSize: 10, flex: 1, color: "#DCEBF5" }}>{rule.name}</span>
                  <span style={{ fontSize: 9, color: rule.triggered ? RED : DIM, fontWeight: 700 }}>
                    {rule.triggered
                      ? `${rule.matches.length} event${rule.matches.length !== 1 ? "s" : ""}`
                      : "DORMANT"}
                  </span>
                  <span style={{ fontSize: 10, color: DIM }}>{expanded === rule.id ? "▲" : "▼"}</span>
                </div>
                {expanded === rule.id && (
                  <div style={{ marginBottom: 6, padding: "6px 10px", borderRadius: 6,
                    background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}22` }}>
                    {rule.target && (
                      <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>
                        TARGET: {rule.target}
                      </div>
                    )}
                    {rule.condition && (
                      <div style={{ fontSize: 9, color: "#9AAFBF", marginBottom: 6,
                        fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                        {rule.condition.slice(0, 200)}
                      </div>
                    )}
                    {rule.triggered ? (
                      rule.matches.map((ev) => (
                        <div key={ev.id} style={{ padding: "4px 6px", marginBottom: 3,
                          borderRadius: 4, background: "rgba(255,68,68,0.06)",
                          border: `1px solid ${kindColor(ev.kind)}33`, fontSize: 9 }}>
                          <span style={{ color: kindColor(ev.kind), fontWeight: 700,
                            marginRight: 6 }}>
                            {ev.kind}
                          </span>
                          <span style={{ color: "#DCEBF5" }}>{ev.name}</span>
                          {ev.desc && (
                            <span style={{ color: DIM, marginLeft: 6 }}>{ev.desc}</span>
                          )}
                          <span style={{ color: DIM, marginLeft: 6 }}>
                            ({ev.hits} hit{ev.hits !== 1 ? "s" : ""})
                          </span>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: DIM, fontSize: 9, padding: "4px 0" }}>
                        No live event currently triggers this rule.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* assess */}
          {assess && (
            <div style={{ margin: "0 12px 8px", padding: "8px 10px", borderRadius: 6,
              background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}33`,
              fontSize: 10, color: "#DCEBF5", lineHeight: 1.5 }}>
              {assess}
            </div>
          )}
          <div style={{ padding: "6px 12px 10px", borderTop: `1px solid ${CY}22` }}>
            <button onClick={runAssess} disabled={assessing} style={{
              background: assessing ? "rgba(0,0,0,0.4)" : CY, color: assessing ? CY : "#04060A",
              border: `1px solid ${CY}`, borderRadius: 5, padding: "4px 14px",
              fontSize: 10, cursor: assessing ? "not-allowed" : "pointer",
              fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1, fontWeight: 700,
            }}>
              {assessing ? "▶ assessing…" : "▶ ASSESS"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
