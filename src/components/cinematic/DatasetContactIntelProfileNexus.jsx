import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_059_960;
const Z_INDEX  = 271;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const DICNEX_RE = /\b(dicnex|data[\s-]intel[\s-]coverage|dataset[\s-]contact[\s-]profile|uncovered[\s-]dataset|data[\s-]coverage[\s-]nexus|intel[\s-]data[\s-]coverage)\b/i;
export function isDicnexQuery(q = "") { return DICNEX_RE.test(q); }

function keywords(text = "") {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3);
}

function scoreText(target = "", kws = []) {
  if (!kws.length || !target) return 0;
  const t = target.toLowerCase();
  return kws.reduce((n, k) => n + (t.includes(k) ? 1 : 0), 0) / kws.length;
}

function datasetText(d = {}) {
  return [d.name, d.description, d.dataset_type, d.type, d.tags?.join(" ")].filter(Boolean).join(" ");
}
function contactText(c = {}) {
  return [c.name, c.email, c.role, c.organization, c.org, c.tags?.join(" ")].filter(Boolean).join(" ");
}
function profileText(p = {}) {
  return [p.name, p.aliases?.join(" "), p.organization, p.org, p.role, p.description, p.tags?.join(" ")].filter(Boolean).join(" ");
}

const THRESHOLD = 0.08;

function classifyDataset(dataset, contacts, profiles) {
  const kws = keywords(datasetText(dataset));
  const matchedContacts  = contacts.filter(c => scoreText(contactText(c), kws) >= THRESHOLD);
  const matchedProfiles  = profiles.filter(p => scoreText(profileText(p), kws) >= THRESHOLD);
  const hasContact  = matchedContacts.length > 0;
  const hasProfile  = matchedProfiles.length > 0;
  const category =
    hasContact && hasProfile ? "FULLY_MAPPED"    :
    hasContact               ? "CONTACT_LINKED"  :
    hasProfile               ? "INTEL_PROFILED"  :
                               "UNCOVERED";
  return { ...dataset, category, matchedContacts, matchedProfiles };
}

export async function buildDicnexScript() {
  const base = apiBase();
  const [dRes, cRes, pRes] = await Promise.allSettled([
    fetch(`${base}/v1/datasets`,           { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/entities/Contact`,      { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/entities/IntelProfile`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
  ]);
  const rawDatasets  = dRes.status === "fulfilled" ? (dRes.value?.items || dRes.value?.data || dRes.value || []) : [];
  const rawContacts  = cRes.status === "fulfilled" ? (cRes.value?.items || cRes.value?.data || []) : [];
  const rawProfiles  = pRes.status === "fulfilled" ? (pRes.value?.items || pRes.value?.data || []) : [];
  const datasets     = rawDatasets.map(d => classifyDataset(d, rawContacts, rawProfiles));
  const uncovered    = datasets.filter(d => d.category === "UNCOVERED").length;
  const fullyMapped  = datasets.filter(d => d.category === "FULLY_MAPPED").length;
  const pct          = datasets.length ? Math.round((fullyMapped / datasets.length) * 100) : 0;
  return `DICNEX Data Intelligence Coverage Nexus online, sir. Cross-referencing ${datasets.length} datasets against ` +
    `${rawContacts.length} contacts and ${rawProfiles.length} intel profiles. ` +
    `Full coverage: ${pct}%. ${uncovered} dataset${uncovered === 1 ? "" : "s"} uncovered — ` +
    `no matching contact or intel profile. Data intelligence gap review recommended.`;
}

const CAT_LABEL = {
  FULLY_MAPPED:   "FULLY MAPPED",
  CONTACT_LINKED: "CONTACT LINKED",
  INTEL_PROFILED: "INTEL PROFILED",
  UNCOVERED:      "UNCOVERED",
};
const CAT_COLOR = {
  FULLY_MAPPED:   "#29E7FF",
  CONTACT_LINKED: "#34D399",
  INTEL_PROFILED: "#F59E0B",
  UNCOVERED:      "#6B7280",
};
const TABS = ["ALL", "FULLY_MAPPED", "CONTACT_LINKED", "INTEL_PROFILED", "UNCOVERED"];

export default function DatasetContactIntelProfileNexus() {
  const [open, setOpen]         = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [dR, cR, pR] = await Promise.allSettled([
        fetch(`${base}/v1/datasets`,           { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/entities/Contact`,      { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/entities/IntelProfile`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const rawDatasets = dR.status === "fulfilled" ? (dR.value?.items || dR.value?.data || dR.value || []) : [];
      const rawContacts = cR.status === "fulfilled" ? (cR.value?.items || cR.value?.data || []) : [];
      const rawProfiles = pR.status === "fulfilled" ? (pR.value?.items || pR.value?.data || []) : [];
      setContacts(rawContacts);
      setProfiles(rawProfiles);
      setDatasets(rawDatasets.map(d => classifyDataset(d, rawContacts, rawProfiles)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      load();
      timer.current = setInterval(load, POLL_MS);
    } else {
      clearInterval(timer.current);
    }
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:dicnex-toggle", h);
    return () => window.removeEventListener("jarvis:dicnex-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    if (!datasets.length) return;
    setAssessing(true);
    setBrief("");
    try {
      const base      = apiBase();
      const uncovered = datasets.filter(d => d.category === "UNCOVERED").length;
      const mapped    = datasets.filter(d => d.category === "FULLY_MAPPED").length;
      const pct       = datasets.length ? Math.round((mapped / datasets.length) * 100) : 0;
      const ctx       = `DICNEX: ${datasets.length} datasets, ${mapped} fully mapped (${pct}%), ${uncovered} uncovered with no contact or intel profile match.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `In 2 sentences, assess data intelligence coverage gaps: ${ctx}` }),
      });
      const d   = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      if (txt) {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: txt }),
        });
      }
    } finally {
      setAssessing(false);
    }
  }, [datasets]);

  const classified = datasets.reduce((acc, d) => { acc[d.category] = (acc[d.category] || 0) + 1; return acc; }, {});
  const uncovered  = classified["UNCOVERED"] || 0;
  const fullyMapped = classified["FULLY_MAPPED"] || 0;
  const total      = datasets.length;
  const pct        = total ? Math.round((fullyMapped / total) * 100) : 0;
  const barColor   = pct >= 70 ? "#29E7FF" : pct >= 40 ? "#FCD34D" : "#F87171";

  const filtered = datasets.filter(d => {
    if (tab !== "ALL" && d.category !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return (d.name || d.id || "").toLowerCase().includes(s) ||
             (d.description || "").toLowerCase().includes(s);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(15,25,40,0.85)", border: "1px solid rgba(41,231,255,0.35)",
          color: "#29E7FF", fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          letterSpacing: 1, padding: "4px 10px", borderRadius: 3, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        {uncovered > 0 && (
          <span style={{ background: "#F59E0B", color: "#000", borderRadius: "50%", fontSize: 8, minWidth: 14, height: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
            {uncovered}
          </span>
        )}
        ◈ DICNEX
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 280, zIndex: Z_INDEX,
      width: 620, maxHeight: "72vh", background: "rgba(8,18,30,0.97)",
      border: "1px solid rgba(41,231,255,0.3)", borderRadius: 6,
      display: "flex", flexDirection: "column", fontFamily: "'JetBrains Mono',monospace",
      boxShadow: "0 0 24px rgba(41,231,255,0.08)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid rgba(41,231,255,0.15)", flexShrink: 0 }}>
        <span style={{ color: "#29E7FF", fontSize: 9, letterSpacing: 2 }}>◈ DICNEX — DATA INTELLIGENCE COVERAGE NEXUS</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6B9BAF", cursor: "pointer", fontSize: 11 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px", flexShrink: 0, flexWrap: "wrap" }}>
        {[
          { label: "DATASETS",       val: total,                                   color: "#29E7FF" },
          { label: "CONTACTS",       val: contacts.length,                         color: "#34D399" },
          { label: "INTEL PROFILES", val: profiles.length,                         color: "#F59E0B" },
          { label: "FULLY MAPPED",   val: fullyMapped,                             color: "#29E7FF" },
          { label: "CONTACT LINKED", val: classified["CONTACT_LINKED"]  || 0,      color: "#34D399" },
          { label: "INTEL PROFILED", val: classified["INTEL_PROFILED"]  || 0,      color: "#F59E0B" },
          { label: "UNCOVERED",      val: uncovered,                               color: "#F87171" },
          { label: "COVERAGE%",      val: `${pct}%`,                               color: barColor  },
        ].map(t => (
          <div key={t.label} style={{ background: "rgba(41,231,255,0.05)", border: "1px solid rgba(41,231,255,0.12)", borderRadius: 4, padding: "4px 8px", minWidth: 64 }}>
            <div style={{ fontSize: 7, color: "#6B9BAF", letterSpacing: 1 }}>{t.label}</div>
            <div style={{ fontSize: 13, color: t.color, fontWeight: 700 }}>{loading ? "…" : t.val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {total > 0 && (
        <div style={{ margin: "0 12px 6px", height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, flexShrink: 0 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 2, transition: "width 0.5s" }} />
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "4px 12px", flexShrink: 0, overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "rgba(41,231,255,0.18)" : "rgba(41,231,255,0.04)",
            border: `1px solid ${tab === t ? "rgba(41,231,255,0.5)" : "rgba(41,231,255,0.12)"}`,
            color: tab === t ? "#29E7FF" : "#6B9BAF", fontFamily: "'JetBrains Mono',monospace",
            fontSize: 8, letterSpacing: 1, padding: "3px 8px", borderRadius: 3, cursor: "pointer", whiteSpace: "nowrap",
          }}>
            {CAT_LABEL[t] || t}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "4px 12px", flexShrink: 0 }}>
        <input
          placeholder="SEARCH DATASETS…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%", background: "rgba(41,231,255,0.06)", border: "1px solid rgba(41,231,255,0.2)",
            color: "#C0D8E8", fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
            padding: "4px 8px", borderRadius: 3, outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Dataset list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "4px 12px" }}>
        {loading && <div style={{ textAlign: "center", padding: 16, color: "#29E7FF", fontSize: 9 }}>◌ LOADING…</div>}
        {filtered.map((dataset, i) => {
          const isExp = expanded === (dataset.id || i);
          return (
            <div key={dataset.id || i} style={{
              marginBottom: 4, background: "rgba(41,231,255,0.03)",
              border: `1px solid ${dataset.category === "UNCOVERED" ? "rgba(248,113,113,0.3)" : "rgba(41,231,255,0.12)"}`,
              borderRadius: 4, padding: "6px 8px",
              animation: dataset.category === "UNCOVERED" ? "dicnex-pulse 2s infinite" : undefined,
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : (dataset.id || i))}
                style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
              >
                <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 2, background: `${CAT_COLOR[dataset.category]}22`, color: CAT_COLOR[dataset.category], letterSpacing: 1, flexShrink: 0 }}>
                  {CAT_LABEL[dataset.category]}
                </span>
                <span style={{ fontSize: 9, color: "#C0D8E8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {dataset.name || dataset.id || "Unnamed Dataset"}
                </span>
                {dataset.dataset_type || dataset.type ? (
                  <span style={{ fontSize: 7, color: "#6B9BAF", flexShrink: 0 }}>{(dataset.dataset_type || dataset.type || "").toUpperCase()}</span>
                ) : null}
                <span style={{ fontSize: 8, color: "#29E7FF", flexShrink: 0 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ marginTop: 6, paddingLeft: 8, fontSize: 8, color: "#8AA8B8", lineHeight: 1.6 }}>
                  {dataset.description || "No description available."}
                  {dataset.matchedContacts?.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ color: "#34D399", letterSpacing: 1, marginBottom: 3 }}>CONTACTS ({dataset.matchedContacts.length})</div>
                      {dataset.matchedContacts.slice(0, 4).map((c, ci) => (
                        <div key={ci} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 7, padding: "1px 4px", borderRadius: 2, background: "rgba(52,211,153,0.12)", color: "#34D399" }}>
                            {(c.role || "CONTACT").toUpperCase().slice(0, 8)}
                          </span>
                          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name || c.id}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {dataset.matchedProfiles?.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ color: "#F59E0B", letterSpacing: 1, marginBottom: 3 }}>INTEL PROFILES ({dataset.matchedProfiles.length})</div>
                      {dataset.matchedProfiles.slice(0, 4).map((p, pi) => (
                        <div key={pi} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 7, padding: "1px 4px", borderRadius: 2, background: "rgba(245,158,11,0.12)", color: "#F59E0B" }}>
                            {(p.role || "ACTOR").toUpperCase().slice(0, 8)}
                          </span>
                          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name || p.id}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 24, color: "#6B9BAF", fontSize: 9 }}>NO DATASETS MATCH CURRENT FILTER</div>
        )}
      </div>

      {/* AI Assess */}
      <div style={{ borderTop: "1px solid rgba(41,231,255,0.15)", padding: "8px 12px", flexShrink: 0 }}>
        {brief && (
          <div style={{ marginBottom: 6, fontSize: 8, color: "#A0C8D8", lineHeight: 1.6, maxHeight: 80, overflowY: "auto", background: "rgba(41,231,255,0.05)", borderRadius: 4, padding: "4px 8px" }}>
            {brief}
          </div>
        )}
        <button
          onClick={assess}
          disabled={assessing || datasets.length === 0}
          style={{
            background: assessing ? "rgba(41,231,255,0.08)" : "rgba(41,231,255,0.14)",
            border: "1px solid rgba(41,231,255,0.4)", color: assessing ? "#6B9BAF" : "#29E7FF",
            fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: 1,
            padding: "5px 14px", borderRadius: 3, cursor: assessing ? "not-allowed" : "pointer",
          }}
        >
          {assessing ? "◌ ASSESSING…" : "⬡ ASSESS COVERAGE"}
        </button>
      </div>

      <style>{`@keyframes dicnex-pulse { 0%,100% { border-color: rgba(248,113,113,0.3); } 50% { border-color: rgba(248,113,113,0.7); } }`}</style>
    </div>
  );
}
