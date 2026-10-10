/**
 * F173 — Investigation × Contact × Dataset × RiskSignal Full-Stack Operations Coverage (FSOPS)
 *
 * Parallel-fetches /v1/investigations + /entities/Contact + /v1/datasets + /entities/RiskSignal
 * and keyword-correlates each investigation against contacts AND datasets AND risk signals to classify:
 *
 *   FULLY_RESOURCED — matched contacts + datasets + risk signals (maximum operational coverage)
 *   DUAL_RESOURCED  — matched any two resource types
 *   SINGLE_LINKED   — matched exactly one resource type
 *   BARE            — no matches (operational coverage gap)
 *
 * Stat tiles: INVESTIGATIONS / CONTACTS / DATASETS / RISK SIGNALS + four class counts + COVERAGE%.
 * Amber badge on bare count.
 * Filter tabs ALL / FULLY_RESOURCED / DUAL_RESOURCED / SINGLE_LINKED / BARE + text search.
 * Expand investigation → matched contact cards (orange, role badge) + dataset cards (teal)
 *                      + risk signal cards (red, severity badge) with relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:fsops-toggle event.
 *
 * Voice triggers: "fsops / full stack ops / investigation coverage /
 *                  bare investigations / investigation resource / ops coverage gap"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_039_240;
const Z_INDEX  = 234;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const FSOPS_RE = /\b(fsops|full[\s-]stack[\s-]ops|investigation[\s-]coverage|bare[\s-]investigations|investigation[\s-]resource|ops[\s-]coverage[\s-]gap)\b/i;

const CY     = "#00CFFF";
const OR     = "#F97316";
const TE     = "#14B8A6";
const RD     = "#EF4444";
const AM     = "#F59E0B";
const GR     = "#22C55E";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_RESOURCED: GR,
  DUAL_RESOURCED:  CY,
  SINGLE_LINKED:   AM,
  BARE:            RD,
};

const TABS = ["ALL", "FULLY_RESOURCED", "DUAL_RESOURCED", "SINGLE_LINKED", "BARE"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function invText(i) {
  return `${i.title || i.name || ""} ${i.description || i.summary || ""} ${i.status || ""} ${i.priority || ""} ${(i.tags || []).join(" ")}`;
}
function contactText(c) {
  return `${c.name || c.full_name || ""} ${c.role || c.title || ""} ${c.org || c.organization || ""} ${c.email || ""} ${(c.tags || []).join(" ")}`;
}
function datasetText(d) {
  return `${d.name || d.title || ""} ${d.description || d.summary || ""} ${d.type || d.category || ""} ${(d.tags || []).join(" ")}`;
}
function signalText(s) {
  return `${s.title || s.name || ""} ${s.description || s.summary || ""} ${s.severity || ""} ${s.category || ""} ${(s.tags || []).join(" ")}`;
}

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

async function loadAll() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [invRes, conRes, datRes, sigRes] = await Promise.allSettled([
    fetch(`${apiBase}/v1/investigations`,    { headers }),
    fetch(`${apiBase}/entities/Contact`,     { headers }),
    fetch(`${apiBase}/v1/datasets`,          { headers }),
    fetch(`${apiBase}/entities/RiskSignal`,  { headers }),
  ]);
  const investigations = invRes.status === "fulfilled" && invRes.value.ok
    ? normaliseArray(await invRes.value.json(), ["investigations", "items"]) : [];
  const contacts = conRes.status === "fulfilled" && conRes.value.ok
    ? normaliseArray(await conRes.value.json(), ["contacts", "items"]) : [];
  const datasets = datRes.status === "fulfilled" && datRes.value.ok
    ? normaliseArray(await datRes.value.json(), ["datasets", "items"]) : [];
  const signals = sigRes.status === "fulfilled" && sigRes.value.ok
    ? normaliseArray(await sigRes.value.json(), ["signals", "risk_signals", "items"]) : [];
  return { investigations, contacts, datasets, signals };
}

function correlate(investigations, contacts, datasets, signals) {
  return investigations.map(inv => {
    const kws = keywords(invText(inv));
    const matchedContacts = contacts
      .map(c => ({ c, rel: score(contactText(c), kws) }))
      .filter(x => x.rel > 0).sort((a, b) => b.rel - a.rel).slice(0, 4);
    const matchedDatasets = datasets
      .map(d => ({ d, rel: score(datasetText(d), kws) }))
      .filter(x => x.rel > 0).sort((a, b) => b.rel - a.rel).slice(0, 4);
    const matchedSignals = signals
      .map(s => ({ s, rel: score(signalText(s), kws) }))
      .filter(x => x.rel > 0).sort((a, b) => b.rel - a.rel).slice(0, 4);
    const hasC = matchedContacts.length > 0;
    const hasD = matchedDatasets.length > 0;
    const hasS = matchedSignals.length > 0;
    const matchCount = (hasC ? 1 : 0) + (hasD ? 1 : 0) + (hasS ? 1 : 0);
    const cls = matchCount === 3 ? "FULLY_RESOURCED"
              : matchCount === 2 ? "DUAL_RESOURCED"
              : matchCount === 1 ? "SINGLE_LINKED"
              :                    "BARE";
    return { ...inv, _cls: cls, _contacts: matchedContacts, _datasets: matchedDatasets, _signals: matchedSignals };
  });
}

export function isFsopsQuery(q = "") { return FSOPS_RE.test(q); }

export async function buildFsopsScript() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [invRes, conRes, datRes, sigRes] = await Promise.allSettled([
    fetch(`${apiBase}/v1/investigations`,    { headers }),
    fetch(`${apiBase}/entities/Contact`,     { headers }),
    fetch(`${apiBase}/v1/datasets`,          { headers }),
    fetch(`${apiBase}/entities/RiskSignal`,  { headers }),
  ]);
  const investigations = invRes.status === "fulfilled" && invRes.value.ok
    ? normaliseArray(await invRes.value.json(), ["investigations", "items"]) : [];
  const contacts = conRes.status === "fulfilled" && conRes.value.ok
    ? normaliseArray(await conRes.value.json(), ["contacts", "items"]) : [];
  const datasets = datRes.status === "fulfilled" && datRes.value.ok
    ? normaliseArray(await datRes.value.json(), ["datasets", "items"]) : [];
  const signals = sigRes.status === "fulfilled" && sigRes.value.ok
    ? normaliseArray(await sigRes.value.json(), ["signals", "risk_signals", "items"]) : [];
  const rows  = correlate(investigations, contacts, datasets, signals);
  const fully = rows.filter(r => r._cls === "FULLY_RESOURCED").length;
  const bare  = rows.filter(r => r._cls === "BARE").length;
  const pct   = rows.length ? Math.round((rows.length - bare) / rows.length * 100) : 0;
  return `Full-Stack Operations Coverage online, sir. Across ${rows.length} investigations cross-referenced against ${contacts.length} contacts, ${datasets.length} datasets, and ${signals.length} risk signals, ${fully} investigations are fully resourced. ${bare} remain bare — ${pct}% overall operations coverage. Opening the FSOPS panel for full visibility now.`;
}

export default function InvestigationFullStackCoverage() {
  const [open,       setOpen]       = useState(false);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [rows,       setRows]       = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [expanded,   setExpanded]   = useState(null);
  const [totals,     setTotals]     = useState({ investigations: 0, contacts: 0, datasets: 0, signals: 0 });
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { investigations, contacts, datasets, signals } = await loadAll();
      setTotals({ investigations: investigations.length, contacts: contacts.length, datasets: datasets.length, signals: signals.length });
      setRows(correlate(investigations, contacts, datasets, signals));
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(v => { if (!v) load(); return !v; }); };
    window.addEventListener("jarvis:fsops-toggle", toggle);
    return () => window.removeEventListener("jarvis:fsops-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true); setAssessment("");
    try {
      const body = await buildFsopsScript();
      const res  = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
        },
        body: JSON.stringify({ message: `You are JARVIS. In exactly 2 sentences, assess this full-stack operations coverage:\n${body}` }),
      });
      const data = await res.json();
      const txt  = data?.response || data?.message || data?.content || "";
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessment("Unable to assess full-stack operations coverage at this time, sir.");
    } finally {
      setAssessing(false);
    }
  }

  const counts = {
    FULLY_RESOURCED: rows.filter(r => r._cls === "FULLY_RESOURCED").length,
    DUAL_RESOURCED:  rows.filter(r => r._cls === "DUAL_RESOURCED").length,
    SINGLE_LINKED:   rows.filter(r => r._cls === "SINGLE_LINKED").length,
    BARE:            rows.filter(r => r._cls === "BARE").length,
  };
  const coveragePct = rows.length ? Math.round((rows.length - counts.BARE) / rows.length * 100) : 0;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r._cls !== tab) return false;
    if (!search) return true;
    return invText(r).toLowerCase().includes(search.toLowerCase());
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.85)", border: "1px solid rgba(0,207,255,0.35)",
          color: CY, fontFamily: FONT, fontSize: 10, padding: "3px 7px",
          cursor: "pointer", borderRadius: 3, letterSpacing: 1,
        }}
      >
        ◈ FSOPS{counts.BARE > 0 && <span style={{ color: AM, marginLeft: 4 }}>{counts.BARE}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 50, right: 20, zIndex: Z_INDEX,
      width: 660, maxHeight: "78vh", display: "flex", flexDirection: "column",
      background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
      fontFamily: FONT, color: CY, boxShadow: "0 0 32px rgba(0,207,255,0.15)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ fontSize: 11, letterSpacing: 2, color: CY }}>◈ FSOPS — FULL-STACK OPERATIONS COVERAGE</span>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: RD, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
        {[
          ["INVESTIGATIONS", totals.investigations, CY],
          ["CONTACTS",       totals.contacts,       OR],
          ["DATASETS",       totals.datasets,       TE],
          ["RISK SIGNALS",   totals.signals,        RD],
          ["FULLY RES.",     counts.FULLY_RESOURCED, GR],
          ["DUAL RES.",      counts.DUAL_RESOURCED,  CY],
          ["SINGLE",         counts.SINGLE_LINKED,   AM],
          ["BARE",           counts.BARE,            RD],
          [`COV ${coveragePct}%`, coveragePct,       coveragePct >= 80 ? GR : coveragePct >= 50 ? AM : RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(0,0,0,0.35)", border: `1px solid ${col}33`,
            borderRadius: 4, padding: "4px 10px", textAlign: "center", minWidth: 66,
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 8, color: "#888", letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: "0 14px 8px" }}>
        <div style={{ height: 4, background: "#111", borderRadius: 2 }}>
          <div style={{ height: 4, width: `${coveragePct}%`,
            background: coveragePct >= 80 ? GR : AM,
            borderRadius: 2, transition: "width 0.4s" }} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "rgba(0,207,255,0.15)" : "rgba(0,0,0,0.3)",
            border: `1px solid ${tab === t ? CY : "#333"}`,
            color: tab === t ? CY : "#666", fontSize: 9, padding: "3px 8px",
            cursor: "pointer", borderRadius: 3, letterSpacing: 1,
          }}>{t.replace(/_/g, " ")}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "0 14px 8px" }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search investigations..."
          style={{
            width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid #333",
            color: CY, fontFamily: FONT, fontSize: 10, padding: "4px 8px",
            borderRadius: 3, boxSizing: "border-box", outline: "none",
          }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 14px 8px" }}>
        {loading && <div style={{ color: "#555", fontSize: 10, padding: 8 }}>Loading…</div>}
        {error   && <div style={{ color: RD,   fontSize: 10, padding: 8 }}>{error}</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color: "#555", fontSize: 10, padding: 8 }}>No investigations match.</div>
        )}
        {visible.map((inv, i) => {
          const id    = inv.id || inv._id || i;
          const title = inv.title || inv.name || `Investigation ${i + 1}`;
          const status = inv.status || inv.state || "";
          const isExp  = expanded === id;
          const col    = CLASS_COLOR[inv._cls] || CY;
          return (
            <div key={id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "rgba(0,0,0,0.3)", border: `1px solid ${col}33`,
                  borderRadius: 4, padding: "6px 10px", cursor: "pointer",
                }}
              >
                <div>
                  <span style={{ fontSize: 11, color: CY }}>{title}</span>
                  {status && <span style={{ fontSize: 9, color: "#666", marginLeft: 8 }}>{status}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 9, color: col, letterSpacing: 1 }}>{inv._cls.replace(/_/g, " ")}</span>
                  <span style={{ fontSize: 9, color: "#555" }}>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>

              {isExp && (
                <div style={{ padding: "6px 10px", background: "rgba(0,0,0,0.2)",
                  borderLeft: `2px solid ${col}`, marginLeft: 4 }}>
                  {/* Matched contacts */}
                  {inv._contacts.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: OR, marginBottom: 4, letterSpacing: 1 }}>CONTACTS</div>
                      {inv._contacts.map(({ c, rel }, k) => (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: "#ccc" }}>{c.name || c.full_name || `Contact ${k + 1}`}</span>
                            <span style={{ fontSize: 9, color: OR, padding: "1px 5px",
                              background: "rgba(249,115,22,0.1)", borderRadius: 2 }}>{c.role || c.title || "CONTACT"}</span>
                          </div>
                          <div style={{ height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: 3, width: `${Math.min(rel * 20, 100)}%`,
                              background: OR, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Matched datasets */}
                  {inv._datasets.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: TE, marginBottom: 4, letterSpacing: 1 }}>DATASETS</div>
                      {inv._datasets.map(({ d, rel }, k) => (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: "#ccc" }}>{d.name || d.title || `Dataset ${k + 1}`}</span>
                            <span style={{ fontSize: 9, color: TE, padding: "1px 5px",
                              background: "rgba(20,184,166,0.1)", borderRadius: 2 }}>{d.type || d.category || "DATASET"}</span>
                          </div>
                          <div style={{ height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: 3, width: `${Math.min(rel * 20, 100)}%`,
                              background: TE, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Matched risk signals */}
                  {inv._signals.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: RD, marginBottom: 4, letterSpacing: 1 }}>RISK SIGNALS</div>
                      {inv._signals.map(({ s, rel }, k) => (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: "#ccc" }}>{s.title || s.name || `Signal ${k + 1}`}</span>
                            <span style={{ fontSize: 9, color: RD, padding: "1px 5px",
                              background: "rgba(239,68,68,0.1)", borderRadius: 2 }}>
                              {(s.severity || "SIGNAL").toUpperCase()}
                            </span>
                          </div>
                          <div style={{ height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: 3, width: `${Math.min(rel * 20, 100)}%`,
                              background: RD, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {inv._contacts.length === 0 && inv._datasets.length === 0 && inv._signals.length === 0 && (
                    <div style={{ fontSize: 9, color: "#555" }}>No contacts, datasets, or risk signals matched this investigation.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assess */}
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}` }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? "rgba(0,0,0,0.3)" : "rgba(0,207,255,0.08)",
          border: `1px solid ${assessing ? "#333" : CY}`,
          color: assessing ? "#555" : CY, fontFamily: FONT, fontSize: 10,
          padding: "4px 12px", cursor: assessing ? "not-allowed" : "pointer", borderRadius: 3,
        }}>
          {assessing ? "Assessing…" : "▶ ASSESS OPERATIONS COVERAGE"}
        </button>
        {assessment && (
          <div style={{ marginTop: 8, fontSize: 10, color: "#aaa", lineHeight: 1.5,
            padding: "6px 10px", background: "rgba(0,207,255,0.05)",
            border: "1px solid rgba(0,207,255,0.15)", borderRadius: 4 }}>
            {assessment}
          </div>
        )}
      </div>
    </div>
  );
}
