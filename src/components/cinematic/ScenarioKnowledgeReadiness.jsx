/**
 * ScenarioKnowledgeReadiness — F57
 * /v1/scenario/list × /knowledge/ → for each scenario, keyword-correlates against
 * knowledge articles to classify READY (≥2 articles) / PARTIAL (1) / DARK (0).
 * Voice trigger: "scenario knowledge"/"sknow"/"scenario readiness"/"how ready are we".
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const GRN = "#4ADE80";
const AMB = "#FFBB33";
const RED = "#FF4455";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SKR_RE =
  /\bscenario\s*knowledge\b|\bsknow\b|\bscenario\s*readiness\b|\bhow\s*ready\s*are\s*we\b|\bknowledge\s*readiness\b|\bscenario\s*coverage\b|\bknowledge\s*gap\s*scenario\b/i;

export function isSkrQuery(text) {
  return SKR_RE.test(text || "");
}

async function fetchScenarios() {
  const r = await fetch(`${apiBase()}/v1/scenario/list`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)            ? d
    : Array.isArray(d?.data)         ? d.data
    : Array.isArray(d?.items)        ? d.items
    : Array.isArray(d?.scenarios)    ? d.scenarios
    : Array.isArray(d?.results)      ? d.results
    : [];
}

async function fetchKnowledge() {
  const r = await fetch(`${apiBase()}/knowledge/`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)             ? d
    : Array.isArray(d?.data)          ? d.data
    : Array.isArray(d?.items)         ? d.items
    : Array.isArray(d?.knowledge)     ? d.knowledge
    : Array.isArray(d?.results)       ? d.results
    : Array.isArray(d?.articles)      ? d.articles
    : Array.isArray(d?.chunks)        ? d.chunks
    : [];
}

function keywords(obj) {
  return [
    obj?.name, obj?.title, obj?.description, obj?.topic,
    obj?.subject, obj?.summary, obj?.type, obj?.category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 3);
}

function correlate(scenarios, articles) {
  return scenarios.map(s => {
    const sWords = new Set(keywords(s));
    const matched = articles.filter(a => {
      const aWords = keywords(a);
      return aWords.some(w => sWords.has(w));
    });
    const status = matched.length >= 2 ? "READY" : matched.length === 1 ? "PARTIAL" : "DARK";
    return { scenario: s, articles: matched, status };
  });
}

export async function buildSkrScript() {
  const [scenRes, knowRes] = await Promise.allSettled([fetchScenarios(), fetchKnowledge()]);
  const scenarios = scenRes.status === "fulfilled" ? scenRes.value : [];
  const articles  = knowRes.status  === "fulfilled" ? knowRes.value  : [];
  if (!scenarios.length) return "No scenarios available to assess knowledge readiness, sir.";
  const rows = correlate(scenarios, articles);
  const ready   = rows.filter(r => r.status === "READY").length;
  const partial = rows.filter(r => r.status === "PARTIAL").length;
  const dark    = rows.filter(r => r.status === "DARK").length;
  const total   = rows.length;
  return (
    `Scenario knowledge readiness: ${total} scenario${total !== 1 ? "s" : ""} assessed against ` +
    `${articles.length} knowledge article${articles.length !== 1 ? "s" : ""}. ` +
    `${ready} READY, ${partial} PARTIAL, ${dark} DARK — no knowledge backing.`
  );
}

const TABS = ["ALL", "READY", "PARTIAL", "DARK"];

export default function ScenarioKnowledgeReadiness() {
  const [open, setOpen]     = useState(false);
  const [rows, setRows]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);
  const [tab, setTab]       = useState("ALL");
  const [q, setQ]           = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [verdict, setVerdict] = useState({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [scenarios, articles] = await Promise.all([fetchScenarios(), fetchKnowledge()]);
      setRows(correlate(scenarios, articles));
    } catch (e) {
      setError(e.message || "Fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:skr-toggle", toggle);
    return () => window.removeEventListener("jarvis:skr-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90000);
    return () => clearInterval(id);
  }, [open, load]);

  async function assess(row, idx) {
    setAssessing(idx);
    const sName = row.scenario?.name || row.scenario?.title || "this scenario";
    const artList = row.articles.slice(0, 3).map(a => a.title || a.name || "article").join(", ");
    const prompt = row.articles.length
      ? `Briefly assess scenario knowledge readiness for "${sName}". Known articles: ${artList}. Two sentences max.`
      : `"${sName}" has NO knowledge articles backing it. What critical knowledge gaps should be filled first? Two sentences max.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const ans = (d.answer || "No assessment available.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setVerdict(v => ({ ...v, [idx]: ans }));
      const voice = getActiveVoice?.() || "ash";
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ans, voice }),
      }).then(async res => {
        if (!res.ok) return;
        const url = URL.createObjectURL(await res.blob());
        const a = new Audio(url); a.onended = () => URL.revokeObjectURL(url); a.play().catch(() => {});
      }).catch(() => {});
    } catch (_) {
      setVerdict(v => ({ ...v, [idx]: "Assessment unavailable." }));
    } finally {
      setAssessing(null);
    }
  }

  if (!open) {
    const dark = rows.filter(r => r.status === "DARK").length;
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: "fixed", bottom: 8, left: 12920, zIndex: 66,
          background: "rgba(5,8,13,0.7)", border: `1px solid ${dark > 0 ? AMB : CY}44`,
          color: dark > 0 ? AMB : CY, fontSize: 10, letterSpacing: 1, padding: "3px 8px",
          borderRadius: 4, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          whiteSpace: "nowrap",
        }}
        title="Scenario × Knowledge Readiness"
      >
        ◈ SKR{dark > 0 ? ` ${dark}` : ""}
      </button>
    );
  }

  const ready   = rows.filter(r => r.status === "READY").length;
  const partial = rows.filter(r => r.status === "PARTIAL").length;
  const dark    = rows.filter(r => r.status === "DARK").length;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.status !== tab) return false;
    if (q) {
      const n = (r.scenario?.name || r.scenario?.title || "").toLowerCase();
      return n.includes(q.toLowerCase());
    }
    return true;
  });

  const statusColor = s => s === "READY" ? GRN : s === "PARTIAL" ? AMB : RED;

  return (
    <div style={{
      position: "fixed", top: 60, right: 18, zIndex: 200, width: "min(480px,92vw)",
      background: "rgba(6,10,16,0.96)", border: `1px solid ${CY}33`, borderRadius: 12,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
      boxShadow: `0 0 40px ${CY}18`, display: "flex", flexDirection: "column", maxHeight: "84vh",
    }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${CY}22`, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>◈ SCENARIO × KNOWLEDGE</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#4A6070" }}>READINESS</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#4A6070", cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px", borderBottom: `1px solid ${CY}11` }}>
        {[
          { label: "TOTAL",   val: rows.length,   col: CY },
          { label: "READY",   val: ready,          col: GRN },
          { label: "PARTIAL", val: partial,        col: AMB },
          { label: "DARK",    val: dark,           col: RED },
        ].map(t => (
          <div key={t.label} style={{
            flex: 1, textAlign: "center", background: `${t.col}09`,
            border: `1px solid ${t.col}22`, borderRadius: 6, padding: "6px 0",
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.col }}>{t.val}</div>
            <div style={{ fontSize: 9, color: "#4A6070", letterSpacing: 1 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div style={{ display: "flex", gap: 4, padding: "8px 16px 4px", borderBottom: `1px solid ${CY}11`, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${CY}22` : "none", border: `1px solid ${tab === t ? CY : CY + "22"}`,
            color: tab === t ? CY : "#4A6070", fontSize: 9, letterSpacing: 1, padding: "2px 8px",
            borderRadius: 3, cursor: "pointer",
          }}>{t}</button>
        ))}
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="search scenarios…"
          style={{
            marginLeft: "auto", background: "transparent", border: `1px solid ${CY}22`,
            color: "#DCEBF5", fontSize: 10, padding: "2px 8px", borderRadius: 3, outline: "none", width: 140,
          }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
        {loading && (
          <div style={{ padding: "20px", textAlign: "center", color: "#4A6070", fontSize: 11 }}>
            loading…
          </div>
        )}
        {error && (
          <div style={{ padding: "12px 16px", color: RED, fontSize: 11 }}>⚠ {error}</div>
        )}
        {!loading && !error && visible.length === 0 && (
          <div style={{ padding: "20px", textAlign: "center", color: "#4A6070", fontSize: 11 }}>
            no scenarios match
          </div>
        )}
        {visible.map((row, idx) => {
          const name = row.scenario?.name || row.scenario?.title || row.scenario?.id || `Scenario ${idx + 1}`;
          const isExp = expanded === idx;
          const sc = statusColor(row.status);
          return (
            <div key={idx} style={{ borderBottom: `1px solid ${CY}0D` }}>
              <div
                onClick={() => setExpanded(isExp ? null : idx)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 16px", cursor: "pointer",
                  background: isExp ? `${CY}08` : "transparent",
                }}
              >
                <span style={{
                  width: 52, textAlign: "center", fontSize: 9, letterSpacing: 1,
                  color: sc, border: `1px solid ${sc}44`, borderRadius: 3, padding: "1px 4px",
                  flexShrink: 0,
                }}>{row.status}</span>
                <span style={{ fontSize: 11, flex: 1, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {name}
                </span>
                <span style={{ fontSize: 9, color: "#4A6070", flexShrink: 0 }}>
                  {row.articles.length} art{row.articles.length !== 1 ? "s" : ""}
                </span>
                <span style={{ fontSize: 10, color: "#2E4050" }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "6px 16px 10px 24px" }}>
                  {row.articles.length > 0 ? (
                    <div style={{ marginBottom: 8 }}>
                      {row.articles.slice(0, 5).map((a, ai) => (
                        <div key={ai} style={{
                          padding: "4px 8px", marginBottom: 3, borderRadius: 4,
                          background: `${GRN}09`, border: `1px solid ${GRN}22`,
                        }}>
                          <span style={{ fontSize: 10, color: GRN }}>
                            {a.title || a.name || a.topic || "Untitled article"}
                          </span>
                          {a.category && (
                            <span style={{ marginLeft: 8, fontSize: 9, color: "#4A6070" }}>{a.category}</span>
                          )}
                        </div>
                      ))}
                      {row.articles.length > 5 && (
                        <div style={{ fontSize: 9, color: "#4A6070", padding: "2px 8px" }}>
                          +{row.articles.length - 5} more articles
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: RED, marginBottom: 8, padding: "4px 8px" }}>
                      No knowledge articles back this scenario.
                    </div>
                  )}

                  {verdict[idx] && (
                    <div style={{
                      padding: "6px 8px", borderRadius: 4, background: `${CY}09`,
                      border: `1px solid ${CY}22`, fontSize: 10, color: "#DCEBF5", marginBottom: 6,
                    }}>
                      {verdict[idx]}
                    </div>
                  )}

                  <button
                    onClick={() => assess(row, idx)}
                    disabled={assessing === idx}
                    style={{
                      background: assessing === idx ? `${CY}11` : `${CY}18`,
                      border: `1px solid ${CY}44`, color: CY, fontSize: 9, letterSpacing: 1,
                      padding: "3px 10px", borderRadius: 3, cursor: assessing === idx ? "default" : "pointer",
                    }}
                  >
                    {assessing === idx ? "…assessing" : "▶ ASSESS"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: "6px 16px", borderTop: `1px solid ${CY}11`,
        fontSize: 9, color: "#2E4050", display: "flex", gap: 12,
      }}>
        <span>{rows.length} scenarios · {rows.reduce((n, r) => n + r.articles.length, 0)} article links</span>
        <button onClick={load} style={{ marginLeft: "auto", background: "none", border: "none", color: `${CY}66`, cursor: "pointer", fontSize: 9 }}>↺ refresh</button>
      </div>
    </div>
  );
}
