import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const GN = "#4CAF50"; const RD = "#FF3D3D";
const CY = "#00E5FF"; const OR = "#FF9800"; const PU = "#CE93D8";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) || "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT = 1104560;
const Z_IDX = 688;

function normScenarios(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.scenarios || raw?.items || raw?.data || []);
  return arr.map((s, i) => ({
    id: s.id || s._id || `s${i}`,
    name: s.name || s.title || s.scenario_name || `Scenario ${i + 1}`,
    type: s.type || s.scenario_type || s.category || "UNKNOWN",
    tags: Array.isArray(s.tags) ? s.tags : [],
    desc: s.description || s.summary || s.objective || "",
    status: s.status || s.state || "unknown",
  }));
}

function normKnowledge(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.articles || raw?.items || raw?.data || raw?.results || []);
  return arr.map((k, i) => ({
    id: k.id || k._id || `k${i}`,
    name: k.title || k.name || k.topic || `Article ${i + 1}`,
    category: k.category || k.type || k.domain || "",
    tags: Array.isArray(k.tags) ? k.tags : [],
    desc: k.summary || k.content || k.description || "",
  }));
}

function normDatasets(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.datasets || raw?.items || raw?.data || []);
  return arr.map((d, i) => ({
    id: d.id || d._id || `d${i}`,
    name: d.name || d.title || d.dataset_name || `Dataset ${i + 1}`,
    type: d.type || d.format || d.category || "",
    tags: Array.isArray(d.tags) ? d.tags : [],
    desc: d.description || d.summary || "",
  }));
}

function normContacts(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.contacts || raw?.items || raw?.data || []);
  return arr.map((c, i) => ({
    id: c.id || c._id || `c${i}`,
    name: c.name || c.full_name || c.contact_name || `Contact ${i + 1}`,
    role: c.role || c.title || c.position || "",
    org: c.org || c.organization || c.company || "",
    tags: Array.isArray(c.tags) ? c.tags : [],
    desc: c.description || c.bio || c.notes || "",
  }));
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function overlap(scenToks, obj) {
  const objText = [obj.name, obj.category || obj.type || obj.role, obj.desc, ...(obj.tags || [])].join(" ");
  const objToks = new Set(tokens(objText));
  return scenToks.filter(t => objToks.has(t)).length;
}

function classify(scenario, kb, datasets, contacts) {
  const sToks = tokens([scenario.name, scenario.type, scenario.desc, ...scenario.tags].join(" "));
  const hasKb = kb.some(k => overlap(sToks, k) >= 1);
  const hasDs = datasets.some(d => overlap(sToks, d) >= 1);
  const hasCt = contacts.some(c => overlap(sToks, c) >= 1);
  const count = [hasKb, hasDs, hasCt].filter(Boolean).length;
  if (count === 3) return "FULLY_RESOURCED";
  if (count === 2) return "DUAL_LINKED";
  if (count === 1) return "SINGLE_LINKED";
  return "UNSUPPORTED";
}

function matchItems(scenToks, list, max = 4) {
  return list
    .map(item => ({ item, score: overlap(scenToks, item) }))
    .filter(x => x.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(x => x.item);
}

function relScore(scenToks, item) {
  const raw = overlap(scenToks, item);
  return Math.min(1, raw / Math.max(1, scenToks.length * 0.3));
}

export async function buildSkdcrnexScript() {
  const base = apiBase();
  const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  const [sr, kr, dr, cr] = await Promise.allSettled([
    fetch(`${base}/v1/scenario/list`, { headers: hdrs }).then(r => r.json()),
    fetch(`${base}/knowledge/`, { headers: hdrs }).then(r => r.json()),
    fetch(`${base}/v1/datasets`, { headers: hdrs }).then(r => r.json()),
    fetch(`${base}/entities/Contact`, { headers: hdrs }).then(r => r.json()),
  ]);
  const scenarios = normScenarios(sr.status === "fulfilled" ? sr.value : []);
  const kb = normKnowledge(kr.status === "fulfilled" ? kr.value : []);
  const datasets = normDatasets(dr.status === "fulfilled" ? dr.value : []);
  const contacts = normContacts(cr.status === "fulfilled" ? cr.value : []);
  const total = scenarios.length;
  if (!total) return "SKDCRNEX online, sir. No scenarios found to assess against knowledge, datasets, and contacts.";
  const counts = { FULLY_RESOURCED: 0, DUAL_LINKED: 0, SINGLE_LINKED: 0, UNSUPPORTED: 0 };
  scenarios.forEach(s => counts[classify(s, kb, datasets, contacts)]++);
  const pct = Math.round((counts.FULLY_RESOURCED / total) * 100);
  return `SKDCRNEX assessment complete, sir. ${total} scenarios evaluated against ${kb.length} knowledge articles, ${datasets.length} datasets, and ${contacts.length} contacts. ${counts.FULLY_RESOURCED} scenarios are fully resourced across all three domains, representing ${pct}% full coverage. ${counts.DUAL_LINKED} have dual links, ${counts.SINGLE_LINKED} single links, and ${counts.UNSUPPORTED} remain unsupported. Recommend prioritising resourcing for the ${counts.UNSUPPORTED} unsupported scenarios.`;
}

export function isSkdcrnexQuery(q) {
  return /skdcrnex|scenario.{0,20}(knowledge|dataset|contact|resource)|full.?readiness.?nexus|unsupported scenario|scenario readiness|readiness nexus|scenario full resource/i.test(q);
}

const TABS = ["ALL", "FULLY_RESOURCED", "DUAL_LINKED", "SINGLE_LINKED", "UNSUPPORTED"];
const TAB_COL = { FULLY_RESOURCED: GN, DUAL_LINKED: CY, SINGLE_LINKED: OR, UNSUPPORTED: RD, ALL: AM };

export default function ScenarioKnowledgeDatasetContactNexus() {
  const [open, setOpen] = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [kb, setKb] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [aiText, setAiText] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const base = apiBase();
    const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
    try {
      const [sr, kr, dr, cr] = await Promise.allSettled([
        fetch(`${base}/v1/scenario/list`, { headers: hdrs }).then(r => r.json()),
        fetch(`${base}/knowledge/`, { headers: hdrs }).then(r => r.json()),
        fetch(`${base}/v1/datasets`, { headers: hdrs }).then(r => r.json()),
        fetch(`${base}/entities/Contact`, { headers: hdrs }).then(r => r.json()),
      ]);
      setScenarios(normScenarios(sr.status === "fulfilled" ? sr.value : []));
      setKb(normKnowledge(kr.status === "fulfilled" ? kr.value : []));
      setDatasets(normDatasets(dr.status === "fulfilled" ? dr.value : []));
      setContacts(normContacts(cr.status === "fulfilled" ? cr.value : []));
    } catch (e) {
      setErr(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:skdcrnex-toggle", handler);
    return () => window.removeEventListener("jarvis:skdcrnex-toggle", handler);
  }, []);

  useEffect(() => {
    if (open) { load(); }
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true); setAiText("");
    const base = apiBase();
    const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
    const total = scenarios.length;
    const counts = { FULLY_RESOURCED: 0, DUAL_LINKED: 0, SINGLE_LINKED: 0, UNSUPPORTED: 0 };
    scenarios.forEach(s => counts[classify(s, kb, datasets, contacts)]++);
    const prompt = `SKDCRNEX: ${total} scenarios vs ${kb.length} KB articles, ${datasets.length} datasets, ${contacts.length} contacts. Fully resourced: ${counts.FULLY_RESOURCED}, dual: ${counts.DUAL_LINKED}, single: ${counts.SINGLE_LINKED}, unsupported: ${counts.UNSUPPORTED}. Provide a concise readiness assessment and top recommendation.`;
    try {
      const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdrs,
        body: JSON.stringify({ message: prompt }),
      });
      const data = await resp.json();
      const text = data.response || data.message || data.content || "Assessment complete.";
      setAiText(text);
      const voice = getActiveVoice();
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers: hdrs,
        body: JSON.stringify({ text: text.slice(0, 300), voice }),
      });
    } catch {
      setAiText("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  };

  const enriched = scenarios.map(s => {
    const sToks = tokens([s.name, s.type, s.desc, ...s.tags].join(" "));
    return {
      ...s,
      classification: classify(s, kb, datasets, contacts),
      matchedKb: matchItems(sToks, kb),
      matchedDs: matchItems(sToks, datasets),
      matchedCt: matchItems(sToks, contacts),
      sToks,
    };
  });

  const counts = { FULLY_RESOURCED: 0, DUAL_LINKED: 0, SINGLE_LINKED: 0, UNSUPPORTED: 0 };
  enriched.forEach(s => counts[s.classification]++);
  const total = enriched.length;
  const pct = total ? Math.round((counts.FULLY_RESOURCED / total) * 100) : 0;

  const filtered = enriched.filter(s => {
    if (tab !== "ALL" && s.classification !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.type.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_IDX,
          background: BG, border: `1px solid ${GN}`, color: GN,
          fontFamily: MN, fontSize: 11, padding: "4px 10px", cursor: "pointer",
          borderRadius: 4, letterSpacing: "0.05em", whiteSpace: "nowrap",
        }}
      >
        ◈ SKDCRNEX
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 16, zIndex: Z_IDX,
      width: 540, maxHeight: "80vh", display: "flex", flexDirection: "column",
      background: BG, border: `1px solid ${GN}`, borderRadius: 8,
      fontFamily: MN, fontSize: 12, color: "#e0e0e0", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "10px 14px", borderBottom: `1px solid rgba(255,255,255,0.08)`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ color: GN, fontWeight: 700, fontSize: 13, flex: 1 }}>◈ SKDCRNEX</span>
        <span style={{ background: "rgba(76,175,80,0.15)", border: `1px solid ${GN}`, color: GN, padding: "1px 7px", borderRadius: 10, fontSize: 10 }}>
          {total} scenarios
        </span>
        <button onClick={assess} disabled={assessing} style={{ background: "transparent", border: `1px solid ${CY}`, color: CY, fontFamily: MN, fontSize: 10, padding: "2px 8px", cursor: "pointer", borderRadius: 3 }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button onClick={load} style={{ background: "transparent", border: `1px solid ${AM}`, color: AM, fontFamily: MN, fontSize: 10, padding: "2px 8px", cursor: "pointer", borderRadius: 3 }}>↺</button>
        <button onClick={() => setOpen(false)} style={{ background: "transparent", border: "none", color: RD, fontFamily: MN, fontSize: 14, padding: "0 4px", cursor: "pointer" }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, padding: "8px 14px" }}>
        {[
          { label: "TOTAL", val: total, col: AM },
          { label: "FULL", val: counts.FULLY_RESOURCED, col: GN },
          { label: "DUAL", val: counts.DUAL_LINKED, col: CY },
          { label: "SINGLE", val: counts.SINGLE_LINKED, col: OR },
          { label: "NONE", val: counts.UNSUPPORTED, col: RD },
          { label: "KB", val: kb.length, col: PU },
          { label: "DS", val: datasets.length, col: "#80CBC4" },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background: DIM, border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 4, padding: "4px 2px", textAlign: "center" }}>
            <div style={{ color: col, fontSize: 15, fontWeight: 700 }}>{loading ? "…" : val}</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: "0 14px 8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>Full coverage</span>
          <span style={{ color: GN, fontSize: 10 }}>{pct}%</span>
        </div>
        <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
          <div style={{ height: "100%", width: `${pct}%`, background: GN, borderRadius: 2, transition: "width 0.4s" }} />
        </div>
      </div>

      {/* AI output */}
      {aiText && (
        <div style={{ margin: "0 14px 8px", background: "rgba(0,229,255,0.06)", border: `1px solid ${CY}`, borderRadius: 4, padding: "6px 10px", fontSize: 11, color: CY, maxHeight: 80, overflowY: "auto" }}>
          {aiText}
        </div>
      )}

      {/* Error */}
      {err && <div style={{ margin: "0 14px 8px", color: RD, fontSize: 11 }}>⚠ {err}</div>}

      {/* Tabs + search */}
      <div style={{ padding: "0 14px 6px", display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${TAB_COL[t]}22` : "transparent",
            border: `1px solid ${tab === t ? TAB_COL[t] : "rgba(255,255,255,0.15)"}`,
            color: tab === t ? TAB_COL[t] : "rgba(255,255,255,0.4)",
            fontFamily: MN, fontSize: 9, padding: "2px 7px", cursor: "pointer", borderRadius: 3,
          }}>{t === "ALL" ? `ALL (${total})` : t === "FULLY_RESOURCED" ? `FULL (${counts.FULLY_RESOURCED})` : t === "DUAL_LINKED" ? `DUAL (${counts.DUAL_LINKED})` : t === "SINGLE_LINKED" ? `SINGLE (${counts.SINGLE_LINKED})` : `NONE (${counts.UNSUPPORTED})`}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search…"
          style={{ marginLeft: "auto", background: DIM, border: "1px solid rgba(255,255,255,0.1)", color: "#e0e0e0", fontFamily: MN, fontSize: 11, padding: "2px 8px", borderRadius: 3, width: 120 }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 10px" }}>
        {loading && <div style={{ color: AM, padding: 10 }}>Loading…</div>}
        {!loading && filtered.length === 0 && <div style={{ color: "rgba(255,255,255,0.3)", padding: 10 }}>No scenarios match.</div>}
        {filtered.map(s => {
          const isExp = expanded === s.id;
          const col = TAB_COL[s.classification];
          return (
            <div key={s.id} style={{ marginBottom: 4, border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 4, overflow: "hidden" }}>
              <div onClick={() => setExpanded(isExp ? null : s.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer", background: DIM }}>
                <span style={{ color: col, fontSize: 10, minWidth: 80, fontWeight: 700 }}>{s.classification.replace("_", " ")}</span>
                <span style={{ flex: 1, color: "#e0e0e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>{s.type}</span>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "8px 10px", background: "rgba(0,0,0,0.3)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  {s.desc && <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginBottom: 8 }}>{s.desc}</div>}
                  {/* KB matches */}
                  {s.matchedKb.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: PU, fontSize: 10, marginBottom: 3 }}>◈ KNOWLEDGE ({s.matchedKb.length})</div>
                      {s.matchedKb.map(k => {
                        const sc = relScore(s.sToks, k);
                        return (
                          <div key={k.id} style={{ marginBottom: 3, display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#e0e0e0", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.name}</span>
                            <div style={{ width: 60, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                              <div style={{ width: `${Math.round(sc * 100)}%`, height: "100%", background: PU, borderRadius: 2 }} />
                            </div>
                            <span style={{ color: PU, fontSize: 9, minWidth: 28 }}>{Math.round(sc * 100)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Dataset matches */}
                  {s.matchedDs.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: "#80CBC4", fontSize: 10, marginBottom: 3 }}>◈ DATASETS ({s.matchedDs.length})</div>
                      {s.matchedDs.map(d => {
                        const sc = relScore(s.sToks, d);
                        return (
                          <div key={d.id} style={{ marginBottom: 3, display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#e0e0e0", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                            <div style={{ width: 60, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                              <div style={{ width: `${Math.round(sc * 100)}%`, height: "100%", background: "#80CBC4", borderRadius: 2 }} />
                            </div>
                            <span style={{ color: "#80CBC4", fontSize: 9, minWidth: 28 }}>{Math.round(sc * 100)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Contact matches */}
                  {s.matchedCt.length > 0 && (
                    <div>
                      <div style={{ color: OR, fontSize: 10, marginBottom: 3 }}>◈ CONTACTS ({s.matchedCt.length})</div>
                      {s.matchedCt.map(c => {
                        const sc = relScore(s.sToks, c);
                        return (
                          <div key={c.id} style={{ marginBottom: 3, display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#e0e0e0", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}{c.role ? ` · ${c.role}` : ""}</span>
                            <div style={{ width: 60, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                              <div style={{ width: `${Math.round(sc * 100)}%`, height: "100%", background: OR, borderRadius: 2 }} />
                            </div>
                            <span style={{ color: OR, fontSize: 9, minWidth: 28 }}>{Math.round(sc * 100)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {s.matchedKb.length === 0 && s.matchedDs.length === 0 && s.matchedCt.length === 0 && (
                    <div style={{ color: RD, fontSize: 10 }}>⚠ No matched resources — scenario is unsupported.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
