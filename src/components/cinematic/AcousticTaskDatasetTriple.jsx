/**
 * F696 — Acoustic × Task × Dataset Triple Nexus (ACTDSET)
 * Three-way cross-reference: /v1/acoustic/contacts × /entities/Task × /v1/datasets.
 * Each acoustic contact is classified:
 *   FULLY_TRACKED — matches ≥1 task AND ≥1 dataset
 *   TASKED_ONLY   — task match but no dataset link
 *   DATA_ONLY     — dataset match but no task coverage
 *   DARK          — neither (no task or data coverage)
 * Coverage % tile = FULLY_TRACKED / total contacts.
 * Tabs: ALL / FULLY_TRACKED / TASKED_ONLY / DATA_ONLY / DARK + search.
 * Click-to-expand shows matched tasks + matched datasets per contact.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-second auto-refresh. Event: jarvis:actdset-toggle.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 149_240;
const Z_INDEX  = 232;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const ACTDSET_RE = /\b(actdset|acoustic\s+task\s+dataset|task\s+dataset\s+acoustic|acoustic\s+task\s+data|sensor\s+task\s+dataset|contact\s+task\s+data|acoustic\s+task\s+data\s+nexus)\b/i;

const STATUS_COLOR = {
  DONE:        "#00e5a0",
  COMPLETE:    "#00e5a0",
  IN_PROGRESS: "#29E7FF",
  PENDING:     "#ffcc00",
  BLOCKED:     "#ff4444",
  default:     "#667",
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

function normaliseTasks(raw) {
  if (Array.isArray(raw))        return raw;
  if (Array.isArray(raw?.tasks)) return raw.tasks;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.data))  return raw.data;
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

function crossRef(contacts, tasks, datasets) {
  return contacts.map(c => {
    const ct = contactText(c);
    const matchedTasks = tasks.filter(t => {
      const tt = [t.title, t.description, t.label, t.name, t.tags].filter(Boolean).join(" ");
      return overlap(ct, tt) > 0;
    }).map(t => ({
      ...t,
      hits: overlap(ct, [t.title, t.description, t.label].filter(Boolean).join(" ")),
    }));
    const matchedDatasets = datasets.filter(d => {
      const dt = [d.name, d.description, d.kind, d.source, d.tags].filter(Boolean).join(" ");
      return overlap(ct, dt) > 0;
    }).map(d => ({
      ...d,
      hits: overlap(ct, [d.name, d.description, d.kind].filter(Boolean).join(" ")),
    }));
    const hasTask    = matchedTasks.length > 0;
    const hasDataset = matchedDatasets.length > 0;
    const coverage   = hasTask && hasDataset ? "FULLY_TRACKED"
      : hasTask    ? "TASKED_ONLY"
      : hasDataset ? "DATA_ONLY"
      : "DARK";
    return { ...c, _tasks: matchedTasks, _datasets: matchedDatasets, _coverage: coverage };
  });
}

// ── JarvisBrain exports ────────────────────────────────────────────────────────

export function isActdsetQuery(text) {
  return ACTDSET_RE.test(text || "");
}

export async function buildActdsetScript() {
  const base    = apiBase();
  const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  try {
    const [cr, tr, dr] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts`, { headers }).then(r => r.json()),
      fetch(`${base}/entities/Task`,        { headers }).then(r => r.json()),
      fetch(`${base}/v1/datasets`,          { headers }).then(r => r.json()),
    ]);
    const contacts = normaliseContacts(cr);
    const tasks    = normaliseTasks(tr);
    const datasets = normaliseDatasets(dr);
    const enriched = crossRef(contacts, tasks, datasets);
    const fully    = enriched.filter(c => c._coverage === "FULLY_TRACKED");
    const dark     = enriched.filter(c => c._coverage === "DARK");
    const summary  = `${contacts.length} acoustic contacts cross-referenced with ${tasks.length} tasks and ${datasets.length} datasets. FULLY_TRACKED: ${fully.length}, DARK: ${dark.length}.`;
    const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers,
      body: JSON.stringify({
        message: `Acoustic × Task × Dataset Triple: ${summary} Dark contacts (no task or dataset coverage): ${dark.slice(0, 3).map(c => c.name || c.callsign || c.id).join(", ") || "none"}. Provide a 2-sentence acoustic task-data coverage brief.`,
      }),
    });
    const rj = await res.json();
    return rj?.response || rj?.message || rj?.answer || summary;
  } catch (e) {
    return `Acoustic Task Dataset Triple error: ${e.message}`;
  }
}

// ── coverage style map ────────────────────────────────────────────────────────

const COV_COLOR = {
  FULLY_TRACKED: { bg: "#00e5a022", border: "#00e5a055", text: "#00e5a0" },
  TASKED_ONLY:   { bg: "#29E7FF22", border: "#29E7FF55", text: "#29E7FF" },
  DATA_ONLY:     { bg: "#aa88ff22", border: "#aa88ff55", text: "#aa88ff" },
  DARK:          { bg: "#ff444422", border: "#ff444455", text: "#ff4444" },
};

// ── main component ────────────────────────────────────────────────────────────

export default function AcousticTaskDatasetTriple() {
  const [open,      setOpen]      = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [tasks,     setTasks]     = useState([]);
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
      const [cr, tr, dr] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts`, { headers }).then(r => r.json()),
        fetch(`${base}/entities/Task`,        { headers }).then(r => r.json()),
        fetch(`${base}/v1/datasets`,          { headers }).then(r => r.json()),
      ]);
      const c = normaliseContacts(cr);
      const t = normaliseTasks(tr);
      const d = normaliseDatasets(dr);
      setContacts(c);
      setTasks(t);
      setDatasets(d);
      setEnriched(crossRef(c, t, d));
    } catch (_) { /* stale data stays */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:actdset-toggle", toggle);
    return () => window.removeEventListener("jarvis:actdset-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const fully      = enriched.filter(c => c._coverage === "FULLY_TRACKED");
  const taskedOnly = enriched.filter(c => c._coverage === "TASKED_ONLY");
  const dataOnly   = enriched.filter(c => c._coverage === "DATA_ONLY");
  const dark       = enriched.filter(c => c._coverage === "DARK");
  const pct        = enriched.length > 0 ? Math.round(fully.length / enriched.length * 100) : 0;

  const tabMap = {
    ALL:           enriched,
    FULLY_TRACKED: fully,
    TASKED_ONLY:   taskedOnly,
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
      const summary = `${contacts.length} acoustic contacts: FULLY_TRACKED ${fully.length}, TASKED_ONLY ${taskedOnly.length}, DATA_ONLY ${dataOnly.length}, DARK ${dark.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers,
        body: JSON.stringify({
          message: `Acoustic × Task × Dataset Triple: ${summary} Dark contacts (no task or dataset coverage): ${dark.slice(0, 3).map(c => c.name || c.callsign || c.id).join(", ") || "none"}. Provide a 2-sentence sensor task-data assessment.`,
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
        title="Acoustic × Task × Dataset Triple Nexus (ACTDSET)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: dark.length > 0 ? "rgba(255,68,68,0.18)" : "rgba(0,30,60,0.82)",
          border: `1px solid ${dark.length > 0 ? "#ff4444" : "#00ffe7"}`,
          color: dark.length > 0 ? "#ff4444" : "#00ffe7",
          borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer",
          fontFamily: "monospace", letterSpacing: 1,
        }}
      >
        ◈ ACTDSET{dark.length > 0 ? ` [${dark.length}]` : ""}
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
          ◈ ACOUSTIC × TASK × DATASET
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <span style={{ color: "#ffaa00", fontSize: 11 }}>⟳</span>}
          <span style={{ color: "#888", fontSize: 10 }}>
            {contacts.length} contacts · {tasks.length} tasks · {datasets.length} datasets
          </span>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#ff4444", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: "1px solid #00ffe711" }}>
        {[
          { label: "FULLY TRACKED", val: fully.length,      color: "#00e5a0" },
          { label: "TASKED ONLY",   val: taskedOnly.length,  color: "#29E7FF" },
          { label: "DATA ONLY",     val: dataOnly.length,    color: "#aa88ff" },
          { label: "DARK",          val: dark.length,        color: dark.length > 0 ? "#ff4444" : "#444" },
          { label: "COVERAGE %",    val: `${pct}%`,          color: pct >= 50 ? "#00e5a0" : "#ff8800" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ flex: 1, background: "rgba(0,255,231,0.04)", border: "1px solid #00ffe711", borderRadius: 6, padding: "5px 6px", textAlign: "center" }}>
            <div style={{ color, fontSize: 15, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#556", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* tabs + search */}
      <div style={{ display: "flex", gap: 4, padding: "8px 14px 0", alignItems: "center", flexWrap: "wrap" }}>
        {["ALL", "FULLY_TRACKED", "TASKED_ONLY", "DATA_ONLY", "DARK"].map(t => {
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
                  {/* matched tasks */}
                  {c._tasks.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: "#29E7FF", fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>TASKS ({c._tasks.length})</div>
                      {c._tasks.slice(0, 4).map((t, ti) => (
                        <div key={ti} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ color: STATUS_COLOR[String(t.status || t.state || "").toUpperCase()] || STATUS_COLOR.default, fontSize: 9, fontWeight: 700, minWidth: 70 }}>
                            {String(t.status || t.state || "?").toUpperCase()}
                          </span>
                          <span style={{ color: "#c8f0ff", fontSize: 10, flex: 1 }}>{t.title || t.name || t.label || t.id || "—"}</span>
                          <span style={{ color: "#556", fontSize: 9 }}>×{t.hits}</span>
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
                  {c._tasks.length === 0 && c._datasets.length === 0 && (
                    <div style={{ color: "#ff4444", fontSize: 10 }}>No tasks or datasets matched — dark contact.</div>
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
