/**
 * F695 — Acoustic × Rules × Dataset Triple Nexus (ACRLDSET)
 * Three-way cross-reference: /v1/acoustic/contacts × /v1/rules × /v1/datasets.
 * Each acoustic contact is classified:
 *   FULLY_COVERED — matches ≥1 WATCHTOWER rule AND ≥1 dataset
 *   RULE_ONLY     — rule match but no dataset link
 *   DATA_ONLY     — dataset match but no rule coverage
 *   DARK          — neither (no automated oversight or data)
 * Coverage % tile = FULLY_COVERED / total contacts.
 * Tabs: ALL / FULLY_COVERED / RULE_ONLY / DATA_ONLY / DARK + search.
 * Click-to-expand shows matched rules + matched datasets per contact.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-second auto-refresh. Event: jarvis:acrldset-toggle.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 148_380;
const Z_INDEX  = 231;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const ACRLDSET_RE = /\b(acrldset|acoustic\s+rules?\s+dataset|acoustic\s+rule\s+data|sensor\s+rules?\s+dataset|rule\s+data\s+acoustic|acoustic\s+covered\s+data|acoustic\s+data\s+rule|acoustic\s+watchtower\s+data|rule\s+dataset\s+acoustic)\b/i;

const SEV_COLOR = {
  CRITICAL: "#ff4444",
  HIGH:     "#ff8800",
  MEDIUM:   "#ffcc00",
  LOW:      "#667",
};
const KIND_COLOR = {
  geospatial: "#29E7FF",
  financial:  "#00e5a0",
  telemetry:  "#aa88ff",
  logs:       "#ff8800",
  default:    "#667",
};

// ── helpers ──────────────────────────────────────────────────────────────────

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3);
}

function overlap(a, b) {
  const setA = new Set(keywords(a));
  return keywords(b).filter(w => setA.has(w)).length;
}

function normaliseContacts(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.contacts)) return raw.contacts;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normaliseRules(raw) {
  if (Array.isArray(raw))          return raw;
  if (Array.isArray(raw?.rules))   return raw.rules;
  if (Array.isArray(raw?.items))   return raw.items;
  if (Array.isArray(raw?.data))    return raw.data;
  return [];
}

function normaliseDatasets(raw) {
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.datasets))  return raw.datasets;
  if (Array.isArray(raw?.items))     return raw.items;
  if (Array.isArray(raw?.data))      return raw.data;
  return [];
}

function contactText(c) {
  return [c.name, c.callsign, c.id, c.type, c.classification, c.vessel_type, c.description]
    .filter(Boolean).join(" ");
}

function crossRef(contacts, rules, datasets) {
  return contacts.map(c => {
    const ct = contactText(c);
    const matchedRules = rules.filter(r => {
      const rt = [r.name, r.target, r.condition, r.description].filter(Boolean).join(" ");
      return overlap(ct, rt) > 0;
    }).map(r => ({
      ...r,
      hits: overlap(ct, [r.name, r.target, r.condition].filter(Boolean).join(" ")),
    }));
    const matchedDatasets = datasets.filter(d => {
      const dt = [d.name, d.description, d.kind, d.source, d.tags].filter(Boolean).join(" ");
      return overlap(ct, dt) > 0;
    }).map(d => ({
      ...d,
      hits: overlap(ct, [d.name, d.description, d.kind].filter(Boolean).join(" ")),
    }));
    const hasRule    = matchedRules.length > 0;
    const hasDataset = matchedDatasets.length > 0;
    const coverage   = hasRule && hasDataset ? "FULLY_COVERED"
      : hasRule    ? "RULE_ONLY"
      : hasDataset ? "DATA_ONLY"
      : "DARK";
    return { ...c, _rules: matchedRules, _datasets: matchedDatasets, _coverage: coverage };
  });
}

// ── JarvisBrain exports ────────────────────────────────────────────────────────

export function isAcrldsetQuery(text) {
  return ACRLDSET_RE.test(text || "");
}

export async function buildAcrldsetScript() {
  const base    = apiBase();
  const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  try {
    const [cr, rr, dr] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts`, { headers }).then(r => r.json()),
      fetch(`${base}/v1/rules`,             { headers }).then(r => r.json()),
      fetch(`${base}/v1/datasets`,          { headers }).then(r => r.json()),
    ]);
    const contacts = normaliseContacts(cr);
    const rules    = normaliseRules(rr);
    const datasets = normaliseDatasets(dr);
    const enriched = crossRef(contacts, rules, datasets);
    const fully    = enriched.filter(c => c._coverage === "FULLY_COVERED");
    const dark     = enriched.filter(c => c._coverage === "DARK");
    const summary  = `${contacts.length} acoustic contacts cross-referenced with ${rules.length} rules and ${datasets.length} datasets. FULLY_COVERED: ${fully.length}, DARK: ${dark.length}.`;
    const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers,
      body: JSON.stringify({
        message: `Acoustic × Rules × Dataset Triple: ${summary} Dark contacts (no rule or dataset coverage): ${dark.slice(0, 3).map(c => c.name || c.callsign || c.id).join(", ") || "none"}. Provide a 2-sentence acoustic rule-data coverage brief.`,
      }),
    });
    const rj = await res.json();
    return rj?.response || rj?.message || rj?.answer || summary;
  } catch (e) {
    return `Acoustic Rules Dataset Triple error: ${e.message}`;
  }
}

// ── coverage style map ────────────────────────────────────────────────────────

const COV_COLOR = {
  FULLY_COVERED: { bg: "#00e5a022", border: "#00e5a055", text: "#00e5a0" },
  RULE_ONLY:     { bg: "#29E7FF22", border: "#29E7FF55", text: "#29E7FF" },
  DATA_ONLY:     { bg: "#aa88ff22", border: "#aa88ff55", text: "#aa88ff" },
  DARK:          { bg: "#ff444422", border: "#ff444455", text: "#ff4444" },
};

// ── main component ────────────────────────────────────────────────────────────

export default function AcousticRulesDatasetTriple() {
  const [open,      setOpen]      = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [rules,     setRules]     = useState([]);
  const [datasets,  setDatasets]  = useState([]);
  const [enriched,  setEnriched]  = useState([]);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const base    = apiBase();
      const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const [cr, rr, dr] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts`, { headers }).then(r => r.json()),
        fetch(`${base}/v1/rules`,             { headers }).then(r => r.json()),
        fetch(`${base}/v1/datasets`,          { headers }).then(r => r.json()),
      ]);
      const c = normaliseContacts(cr);
      const r = normaliseRules(rr);
      const d = normaliseDatasets(dr);
      setContacts(c);
      setRules(r);
      setDatasets(d);
      setEnriched(crossRef(c, r, d));
    } catch (_) { /* stale data stays */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:acrldset-toggle", toggle);
    return () => window.removeEventListener("jarvis:acrldset-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const fully     = enriched.filter(c => c._coverage === "FULLY_COVERED");
  const ruleOnly  = enriched.filter(c => c._coverage === "RULE_ONLY");
  const dataOnly  = enriched.filter(c => c._coverage === "DATA_ONLY");
  const dark      = enriched.filter(c => c._coverage === "DARK");
  const pct       = enriched.length > 0 ? Math.round(fully.length / enriched.length * 100) : 0;

  const tabMap = {
    ALL:           enriched,
    FULLY_COVERED: fully,
    RULE_ONLY:     ruleOnly,
    DATA_ONLY:     dataOnly,
    DARK:          dark,
  };
  const visible = (tabMap[tab] || enriched)
    .filter(c => !search || [c.name, c.callsign, c.id, c.type]
      .some(f => String(f || "").toLowerCase().includes(search.toLowerCase())));

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base    = apiBase();
      const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const summary = `${contacts.length} acoustic contacts: FULLY_COVERED ${fully.length}, RULE_ONLY ${ruleOnly.length}, DATA_ONLY ${dataOnly.length}, DARK ${dark.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers,
        body: JSON.stringify({
          message: `Acoustic × Rules × Dataset Triple: ${summary} Dark contacts (no rule or dataset coverage): ${dark.slice(0, 3).map(c => c.name || c.callsign || c.id).join(", ") || "none"}. Provide a 2-sentence sensor rule-data assessment.`,
        }),
      });
      const j    = await r.json();
      const text = j?.response || j?.message || j?.answer || summary;
      setBrief(text);
      const ttsRes = await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers,
        body: JSON.stringify({ text }),
      });
      if (ttsRes.ok) {
        const blob = await ttsRes.blob();
        new Audio(URL.createObjectURL(blob)).play().catch(() => {});
      }
    } catch (e) { setBrief(`Assessment error: ${e.message}`); }
    setAssessing(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Acoustic × Rules × Dataset Triple Nexus (ACRLDSET)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: dark.length > 0 ? "rgba(255,68,68,0.18)" : "rgba(0,30,60,0.82)",
          border: `1px solid ${dark.length > 0 ? "#ff4444" : "#00ffe7"}`,
          color: dark.length > 0 ? "#ff4444" : "#00ffe7",
          borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer",
          fontFamily: "monospace", letterSpacing: 1,
        }}
      >
        ◈ ACRLDSET{dark.length > 0 ? ` [${dark.length}]` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 20, width: 560, maxHeight: "85vh",
      background: "rgba(0,8,20,0.97)", border: "1px solid #00ffe7",
      borderRadius: 10, zIndex: Z_INDEX + 100, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: "#c8f0ff", boxShadow: "0 0 40px #00ffe722",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #00ffe733" }}>
        <span style={{ color: "#00ffe7", fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>
          ◈ ACOUSTIC × RULES × DATASET
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <span style={{ color: "#ffaa00", fontSize: 11 }}>⟳</span>}
          <span style={{ color: "#888", fontSize: 10 }}>
            {contacts.length} contacts · {rules.length} rules · {datasets.length} datasets
          </span>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#ff4444", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: "1px solid #00ffe711" }}>
        {[
          { label: "FULLY COV",  val: fully.length,    color: "#00e5a0" },
          { label: "RULE ONLY",  val: ruleOnly.length,  color: "#29E7FF" },
          { label: "DATA ONLY",  val: dataOnly.length,  color: "#aa88ff" },
          { label: "DARK",       val: dark.length,      color: dark.length > 0 ? "#ff4444" : "#444" },
          { label: "COVERAGE %", val: `${pct}%`,        color: pct >= 50 ? "#00e5a0" : "#ff8800" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ flex: 1, background: "rgba(0,255,231,0.04)", border: "1px solid #00ffe711", borderRadius: 6, padding: "5px 6px", textAlign: "center" }}>
            <div style={{ color, fontSize: 15, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#556", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* tabs + search */}
      <div style={{ display: "flex", gap: 4, padding: "8px 14px 0", alignItems: "center", flexWrap: "wrap" }}>
        {["ALL", "FULLY_COVERED", "RULE_ONLY", "DATA_ONLY", "DARK"].map(t => {
          const ct    = COV_COLOR[t] || { border: "#333", text: "#667", bg: "none" };
          const count = tabMap[t]?.length ?? enriched.length;
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? (ct.bg || "#00ffe722") : "none",
              border: `1px solid ${tab === t ? (ct.border || "#00ffe7") : "#333"}`,
              color: tab === t ? (ct.text || "#00ffe7") : "#667",
              borderRadius: 4, padding: "2px 7px", fontSize: 9, cursor: "pointer",
              letterSpacing: 0.5,
            }}>
              {t.replace(/_/g, " ")} ({count})
            </button>
          );
        })}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{ marginLeft: "auto", background: "rgba(0,255,231,0.06)", border: "1px solid #00ffe733", borderRadius: 4, padding: "2px 8px", color: "#c8f0ff", fontSize: 11, width: 100, outline: "none" }}
        />
      </div>

      {/* contact list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px" }}>
        {visible.length === 0 && (
          <div style={{ color: "#444", fontSize: 12, textAlign: "center", marginTop: 20 }}>No contacts</div>
        )}
        {visible.map((c, i) => {
          const id    = c.id || c.callsign || i;
          const label = c.name || c.callsign || c.id || `Contact ${i + 1}`;
          const isExp = expanded === id;
          const cc    = COV_COLOR[c._coverage] || COV_COLOR.DARK;
          return (
            <div key={id} style={{ marginBottom: 6, background: "rgba(0,255,231,0.03)", border: `1px solid ${cc.border}`, borderRadius: 6, overflow: "hidden" }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer" }}
              >
                <span style={{ color: cc.text, fontSize: 9, letterSpacing: 1, fontWeight: 700, minWidth: 90 }}>
                  {c._coverage.replace(/_/g, " ")}
                </span>
                <span style={{ flex: 1, fontSize: 11, color: "#c8f0ff" }}>{label}</span>
                {c.type && <span style={{ color: "#556", fontSize: 9 }}>{c.type}</span>}
                <span style={{ color: "#444", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "6px 12px 10px", borderTop: `1px solid ${cc.border}44` }}>
                  {/* matched rules */}
                  {c._rules.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: "#29E7FF", fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>WATCHTOWER RULES ({c._rules.length})</div>
                      {c._rules.slice(0, 4).map((r, ri) => (
                        <div key={ri} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ color: SEV_COLOR[String(r.severity || "").toUpperCase()] || "#667", fontSize: 9, fontWeight: 700, minWidth: 55 }}>
                            {String(r.severity || "?").toUpperCase()}
                          </span>
                          <span style={{ color: "#c8f0ff", fontSize: 10, flex: 1 }}>{r.name || r.id || "—"}</span>
                          <span style={{ color: "#556", fontSize: 9 }}>×{r.hits}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* matched datasets */}
                  {c._datasets.length > 0 && (
                    <div>
                      <div style={{ color: "#aa88ff", fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>DATASETS ({c._datasets.length})</div>
                      {c._datasets.slice(0, 4).map((d, di) => (
                        <div key={di} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ color: KIND_COLOR[String(d.kind || "").toLowerCase()] || KIND_COLOR.default, fontSize: 9, fontWeight: 700, minWidth: 70 }}>
                            {String(d.kind || "?").toUpperCase()}
                          </span>
                          <span style={{ color: "#c8f0ff", fontSize: 10, flex: 1 }}>{d.name || d.id || "—"}</span>
                          {d.row_count != null && <span style={{ color: "#556", fontSize: 9 }}>{d.row_count.toLocaleString()} rows</span>}
                          <span style={{ color: "#556", fontSize: 9 }}>×{d.hits}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {c._rules.length === 0 && c._datasets.length === 0 && (
                    <div style={{ color: "#ff4444", fontSize: 10 }}>No WATCHTOWER rules or datasets matched — dark contact.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess + brief */}
      <div style={{ padding: "8px 14px", borderTop: "1px solid #00ffe711" }}>
        <button
          onClick={assess} disabled={assessing}
          style={{ background: assessing ? "#333" : "rgba(0,255,231,0.12)", border: "1px solid #00ffe744", color: "#00ffe7", borderRadius: 6, padding: "5px 16px", fontSize: 11, cursor: assessing ? "not-allowed" : "pointer", letterSpacing: 1 }}
        >
          {assessing ? "⟳ ASSESSING…" : "▶ ASSESS"}
        </button>
        {brief && (
          <div style={{ marginTop: 8, color: "#c8f0ff", fontSize: 11, lineHeight: 1.5, background: "rgba(0,255,231,0.04)", border: "1px solid #00ffe722", borderRadius: 6, padding: "6px 10px" }}>
            {brief}
          </div>
        )}
      </div>
    </div>
  );
}
