import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const CY = "#00E5FF"; const GN = "#4CAF50";
const OR = "#FF9800"; const RD = "#FF3D3D";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const REFRESH_MS = 90_000;
const BTN_LEFT   = 1096720;
const Z_IDX      = 674;

const CSDCOV_RE = /\b(csdcov|contact scenario dataset|contact operational coverage|contact data scenario|scenario contact coverage|dataset contact scenario|contact coverage gap|operational intelligence coverage)\b/i;
export function isCsdcovQuery(t) { return CSDCOV_RE.test(t || ""); }

function tokens(s) {
  return String(s || "").toLowerCase().split(/[\s,;:|\/\-_]+/).filter(w => w.length > 3);
}
function overlap(a, b) {
  const sa = new Set(tokens(a));
  let n = 0;
  for (const w of tokens(b)) if (sa.has(w)) n++;
  return n;
}

function normContacts(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.contacts) ? raw.contacts
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.data) ? raw.data
    : [];
  return arr.map(c => ({
    id: c.id || c._id || "",
    label: c.name || c.full_name || c.display_name || c.label || String(c.id || ""),
    role: c.role || c.title || c.position || "",
    org: c.org || c.organization || c.company || "",
    tags: Array.isArray(c.tags) ? c.tags.join(" ") : String(c.tags || ""),
  }));
}

function normScenarios(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.scenarios) ? raw.scenarios
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.data) ? raw.data
    : [];
  return arr.map(s => ({
    id: s.id || s._id || "",
    label: s.name || s.title || s.scenario_name || s.label || String(s.id || ""),
    description: s.description || s.summary || "",
    type: s.type || s.category || "",
  }));
}

function normDatasets(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.datasets) ? raw.datasets
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.data) ? raw.data
    : [];
  return arr.map(d => ({
    id: d.id || d._id || "",
    label: d.name || d.title || d.dataset_name || d.label || String(d.id || ""),
    description: d.description || d.summary || "",
    type: d.type || d.category || "",
  }));
}

function classify(contact, scenarios, datasets) {
  const hay = contact.label + " " + contact.role + " " + contact.org + " " + contact.tags;
  const hasScenario = scenarios.some(s => overlap(hay, s.label + " " + s.description) >= 1);
  const hasDataset  = datasets.some(d => overlap(hay, d.label + " " + d.description) >= 1);
  if (hasScenario && hasDataset) return "FULLY_COVERED";
  if (hasScenario)               return "SCENARIO_ONLY";
  if (hasDataset)                return "DATASET_ONLY";
  return "UNCOVERED";
}

function relevance(contactHay, itemText) {
  const n = overlap(contactHay, itemText);
  return Math.min(100, n * 20);
}

export async function buildCsdcovScript() {
  const base = apiBase();
  const hdr = { Authorization: `Bearer ${API_KEY}` };
  const [cRaw, sRaw, dRaw] = await Promise.all([
    fetch(`${base}/entities/Contact`, { headers: hdr }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/scenario/list`,  { headers: hdr }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/datasets`,       { headers: hdr }).then(r => r.ok ? r.json() : []),
  ]);
  const contacts  = normContacts(cRaw);
  const scenarios = normScenarios(sRaw);
  const datasets  = normDatasets(dRaw);
  const classified = contacts.map(c => ({ ...c, cls: classify(c, scenarios, datasets) }));
  const uncovered  = classified.filter(x => x.cls === "UNCOVERED").length;
  const fullyCov   = classified.filter(x => x.cls === "FULLY_COVERED").length;
  const pct = contacts.length ? Math.round(fullyCov / contacts.length * 100) : 0;
  return `CSDCOV online, sir. ${contacts.length} contacts cross-referenced against ${scenarios.length} scenarios and ${datasets.length} datasets. ${fullyCov} contacts are fully covered with both scenario and dataset support — ${pct}% operational intelligence coverage. ${uncovered} contacts remain uncovered with no scenario or dataset backing, representing a potential operational intelligence gap.`;
}

export default function ContactScenarioDatasetCoverage() {
  const [open, setOpen] = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [datasets,  setDatasets]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [cRaw, sRaw, dRaw] = await Promise.all([
        fetch(`${base}/entities/Contact`, { headers: hdr }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/scenario/list`,  { headers: hdr }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/datasets`,       { headers: hdr }).then(r => r.ok ? r.json() : []),
      ]);
      setContacts(normContacts(cRaw));
      setScenarios(normScenarios(sRaw));
      setDatasets(normDatasets(dRaw));
    } catch (e) {
      setError(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:csdcov-toggle", handler);
    return () => window.removeEventListener("jarvis:csdcov-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const classified = contacts.map(c => ({ ...c, cls: classify(c, scenarios, datasets) }));
  const total       = classified.length;
  const fullyCov    = classified.filter(x => x.cls === "FULLY_COVERED").length;
  const scenOnly    = classified.filter(x => x.cls === "SCENARIO_ONLY").length;
  const dataOnly    = classified.filter(x => x.cls === "DATASET_ONLY").length;
  const uncovered   = classified.filter(x => x.cls === "UNCOVERED").length;
  const pct         = total ? Math.round(fullyCov / total * 100) : 0;

  const visible = classified.filter(c => {
    if (filter !== "ALL" && c.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.label.toLowerCase().includes(q) || c.role.toLowerCase().includes(q) || c.org.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = useCallback(async () => {
    setAssessing(true); setBrief("");
    try {
      const base = apiBase();
      const snapshot = `Contacts: ${total}. Fully covered: ${fullyCov}. Scenario only: ${scenOnly}. Dataset only: ${dataOnly}. Uncovered: ${uncovered}. Coverage: ${pct}%.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `CSDCOV operational intelligence coverage assessment. ${snapshot} Provide a 2-sentence brief on coverage gaps and recommended actions.` }),
      });
      const d = await r.json();
      const txt = d.response || d.message || d.text || d.answer || "";
      setBrief(txt);
      if (txt) {
        const voice = getActiveVoice ? getActiveVoice() : "ash";
        const ttsR = await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: txt, voice }),
        });
        if (ttsR.ok) {
          const blob = await ttsR.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.play().catch(() => {});
        }
      }
    } catch (e) {
      setBrief("Assessment error: " + (e.message || "unknown"));
    } finally {
      setAssessing(false);
    }
  }, [total, fullyCov, scenOnly, dataOnly, uncovered, pct]);

  const clsColor = cls => cls === "FULLY_COVERED" ? GN : cls === "SCENARIO_ONLY" ? CY : cls === "DATASET_ONLY" ? OR : RD;
  const clsLabel = cls => cls === "FULLY_COVERED" ? "FULLY COVERED" : cls === "SCENARIO_ONLY" ? "SCENARIO ONLY" : cls === "DATASET_ONLY" ? "DATASET ONLY" : "UNCOVERED";

  const FILTERS = ["ALL", "FULLY_COVERED", "SCENARIO_ONLY", "DATASET_ONLY", "UNCOVERED"];

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_IDX,
          background: open ? AM : "rgba(255,179,0,0.15)",
          border: `1px solid ${AM}`, borderRadius: 4,
          color: open ? "#000" : AM, fontFamily: MN,
          fontSize: 10, fontWeight: 700, padding: "3px 7px", cursor: "pointer",
          boxShadow: uncovered > 0 ? `0 0 8px ${AM}88` : "none",
        }}
      >
        ◈ CSDCOV {uncovered > 0 && <span style={{ background: AM, color: "#000", borderRadius: 3, padding: "0 4px", marginLeft: 4 }}>{uncovered}</span>}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 50, left: BTN_LEFT - 440, zIndex: Z_IDX + 1,
          width: 500, maxHeight: "70vh", overflowY: "auto",
          background: BG, border: `1px solid ${AM}55`,
          borderRadius: 8, padding: 16, fontFamily: MN, fontSize: 12, color: "#ccc",
          boxShadow: `0 4px 32px rgba(0,0,0,0.8)`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ color: AM, fontWeight: 700, fontSize: 13 }}>◈ CSDCOV — Contact × Scenario × Dataset</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {[
              ["CONTACTS", total, "#fff"],
              ["SCENARIOS", scenarios.length, CY],
              ["DATASETS", datasets.length, OR],
              ["FULLY COV.", fullyCov, GN],
              ["SCEN. ONLY", scenOnly, CY],
              ["DATA ONLY", dataOnly, OR],
              ["UNCOVERED", uncovered, RD],
            ].map(([lbl, val, col]) => (
              <div key={lbl} style={{ background: DIM, border: `1px solid ${col}33`, borderRadius: 4, padding: "4px 8px", textAlign: "center", minWidth: 70 }}>
                <div style={{ color: col, fontWeight: 700, fontSize: 14 }}>{val}</div>
                <div style={{ color: "#888", fontSize: 9 }}>{lbl}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#888", marginBottom: 3 }}>
              <span>COVERAGE</span><span style={{ color: pct > 60 ? GN : pct > 30 ? AM : RD }}>{pct}%</span>
            </div>
            <div style={{ background: "#111", borderRadius: 3, height: 6 }}>
              <div style={{ width: `${pct}%`, height: "100%", background: pct > 60 ? GN : pct > 30 ? AM : RD, borderRadius: 3, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                background: filter === f ? AM : "transparent",
                border: `1px solid ${AM}44`, borderRadius: 3,
                color: filter === f ? "#000" : AM, fontSize: 9, fontWeight: 700,
                padding: "2px 6px", cursor: "pointer",
              }}>{f.replace(/_/g, " ")}</button>
            ))}
          </div>

          {/* search */}
          <input
            placeholder="search contacts…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%", background: "#0a0f1a", border: `1px solid ${AM}44`,
              borderRadius: 4, padding: "4px 8px", color: "#ccc",
              fontFamily: MN, fontSize: 11, marginBottom: 10, boxSizing: "border-box",
            }}
          />

          {loading && <div style={{ color: AM, textAlign: "center", padding: 20 }}>loading…</div>}
          {error && <div style={{ color: RD, padding: 8 }}>Error: {error}</div>}

          {/* rows */}
          {!loading && visible.map(c => {
            const hay = c.label + " " + c.role + " " + c.org + " " + c.tags;
            const matchedScen = scenarios.filter(s => overlap(hay, s.label + " " + s.description) >= 1);
            const matchedData = datasets.filter(d => overlap(hay, d.label + " " + d.description) >= 1);
            const isExp = expanded === c.id;
            return (
              <div key={c.id} style={{
                background: DIM, border: `1px solid ${clsColor(c.cls)}22`,
                borderRadius: 5, marginBottom: 6, padding: "7px 10px",
                animation: c.cls === "UNCOVERED" ? "csdPulse 2.4s ease-in-out infinite" : "none",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ color: "#fff", fontWeight: 700 }}>{c.label}</span>
                    {c.role && <span style={{ color: "#888", marginLeft: 6, fontSize: 10 }}>{c.role}</span>}
                    {c.org  && <span style={{ color: "#666", marginLeft: 6, fontSize: 10 }}>{c.org}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{
                      background: `${clsColor(c.cls)}22`, border: `1px solid ${clsColor(c.cls)}`,
                      color: clsColor(c.cls), borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700,
                    }}>{clsLabel(c.cls)}</span>
                    <button onClick={() => setExpanded(isExp ? null : c.id)} style={{
                      background: "none", border: `1px solid #333`, borderRadius: 3,
                      color: "#888", fontSize: 9, padding: "1px 5px", cursor: "pointer",
                    }}>{isExp ? "▲" : "▼"}</button>
                  </div>
                </div>

                {isExp && (
                  <div style={{ marginTop: 8 }}>
                    {matchedScen.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ color: CY, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>MATCHED SCENARIOS ({matchedScen.length})</div>
                        {matchedScen.slice(0, 4).map(s => {
                          const rel = relevance(hay, s.label + " " + s.description);
                          return (
                            <div key={s.id} style={{ background: `${CY}0a`, border: `1px solid ${CY}22`, borderRadius: 3, padding: "4px 8px", marginBottom: 3 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ color: "#ccc", fontSize: 11 }}>{s.label}</span>
                                {s.type && <span style={{ background: `${CY}22`, color: CY, borderRadius: 2, padding: "0 4px", fontSize: 8 }}>{s.type}</span>}
                              </div>
                              <div style={{ marginTop: 3, background: "#111", borderRadius: 2, height: 3 }}>
                                <div style={{ width: `${rel}%`, height: "100%", background: CY, borderRadius: 2 }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {matchedData.length > 0 && (
                      <div>
                        <div style={{ color: OR, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>MATCHED DATASETS ({matchedData.length})</div>
                        {matchedData.slice(0, 4).map(d => {
                          const rel = relevance(hay, d.label + " " + d.description);
                          return (
                            <div key={d.id} style={{ background: `${OR}0a`, border: `1px solid ${OR}22`, borderRadius: 3, padding: "4px 8px", marginBottom: 3 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ color: "#ccc", fontSize: 11 }}>{d.label}</span>
                                {d.type && <span style={{ background: `${OR}22`, color: OR, borderRadius: 2, padding: "0 4px", fontSize: 8 }}>{d.type}</span>}
                              </div>
                              <div style={{ marginTop: 3, background: "#111", borderRadius: 2, height: 3 }}>
                                <div style={{ width: `${rel}%`, height: "100%", background: OR, borderRadius: 2 }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {matchedScen.length === 0 && matchedData.length === 0 && (
                      <div style={{ color: RD, fontSize: 10, padding: "4px 0" }}>No scenario or dataset match — intelligence coverage gap.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* assess */}
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              marginTop: 10, width: "100%", background: assessing ? "#111" : `${AM}22`,
              border: `1px solid ${AM}`, borderRadius: 4, color: AM,
              fontFamily: MN, fontSize: 11, fontWeight: 700, padding: "6px 0", cursor: assessing ? "default" : "pointer",
            }}
          >
            {assessing ? "ASSESSING…" : "▶ ASSESS COVERAGE"}
          </button>
          {brief && (
            <div style={{ marginTop: 8, background: `${AM}11`, border: `1px solid ${AM}33`, borderRadius: 4, padding: 8, color: "#ccc", fontSize: 11, lineHeight: 1.5 }}>
              {brief}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes csdPulse {
          0%,100% { border-color: ${RD}22; }
          50% { border-color: ${RD}88; box-shadow: 0 0 6px ${RD}44; }
        }
      `}</style>
    </>
  );
}
