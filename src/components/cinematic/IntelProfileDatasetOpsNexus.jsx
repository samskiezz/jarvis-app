/**
 * F198 — IntelProfile × Dataset × Ops Event Intelligence Evidence Nexus (IDENEX)
 *
 * Parallel-fetches /entities/IntelProfile + /v1/datasets + /v1/ops/events
 * and keyword-correlates each intel actor profile against datasets AND ops events
 * to classify:
 *
 *   FULLY_EVIDENCED — matched dataset + ops event (actor backed by data AND live ops)
 *   DATA_BACKED      — dataset present, no ops event match
 *   OPS_LINKED       — ops event present, no dataset match
 *   UNEVIDENCED      — neither (intelligence evidence gap)
 *
 * Stat tiles: INTEL PROFILES / DATASETS / OPS EVENTS + four class counts + EVIDENCED%.
 * Amber badge on UNEVIDENCED count.
 * Filter tabs ALL / FULLY_EVIDENCED / DATA_BACKED / OPS_LINKED / UNEVIDENCED + text search.
 * Expand profile → matched dataset cards (purple) + ops event cards (blue) with relevance bars.
 * ▶ ASSESS EVIDENCE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:idenex-toggle event.
 *
 * Voice triggers:
 *   "idenex / intel profile evidence / intel evidence nexus / unevidenced actor /
 *    actor dataset / actor ops event / intel ops nexus / evidence nexus"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_053_240;
const Z_INDEX  = 259;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const IDENEX_RE = /\b(idenex|intel[\s-]profile[\s-]evidence|intel[\s-]evidence[\s-]nexus|unevidenced[\s-]actor|actor[\s-]dataset|actor[\s-]ops[\s-]event|intel[\s-]ops[\s-]nexus|evidence[\s-]nexus)\b/i;

export function isIdenexQuery(q = "") { return IDENEX_RE.test(q); }

export async function buildIdenexScript() {
  const base = apiBase();
  const [ipRes, dsRes, evRes] = await Promise.allSettled([
    fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
    fetch(`${base}/v1/datasets`).then(r => r.json()),
    fetch(`${base}/v1/ops/events`).then(r => r.json()),
  ]);
  const profiles  = ipRes.status === "fulfilled" ? (ipRes.value?.items || ipRes.value?.profiles  || ipRes.value || []) : [];
  const datasets  = dsRes.status === "fulfilled" ? (dsRes.value?.items || dsRes.value?.datasets  || dsRes.value || []) : [];
  const events    = evRes.status === "fulfilled" ? (evRes.value?.items || evRes.value?.events    || evRes.value || []) : [];

  let fullyEvidenced = 0, unEvidenced = 0;
  for (const p of profiles) {
    const kws   = keywords(profileText(p));
    const hasDs = datasets.some(d => scoreText(datasetText(d), kws) > 0);
    const hasEv = events.some(e   => scoreText(eventText(e),   kws) > 0);
    if (hasDs && hasEv) fullyEvidenced++;
    else if (!hasDs && !hasEv) unEvidenced++;
  }
  const total        = profiles.length;
  const evidencedPct = total ? Math.round((fullyEvidenced / total) * 100) : 0;
  return `IDENEX Intelligence Evidence Nexus online, sir. I have cross-referenced ${total} threat actor intel profiles against ${datasets.length} datasets and ${events.length} ops events. ${fullyEvidenced} profiles are fully evidenced with both dataset backing and an active ops event linkage, representing ${evidencedPct}% evidence coverage. ${unEvidenced} profiles are completely unevidenced — no dataset source and no ops event linkage. Recommend immediate evidence-building for those ${unEvidenced} unevidenced threat actors to close the intelligence gap, sir.`;
}

const CY     = "#00CFFF";
const PU     = "#A78BFA";
const BL     = "#60A5FA";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const GR     = "#22C55E";
const OR     = "#FB923C";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_EVIDENCED: GR,
  DATA_BACKED:     PU,
  OPS_LINKED:      BL,
  UNEVIDENCED:     AM,
};

const TABS = ["ALL", "FULLY_EVIDENCED", "DATA_BACKED", "OPS_LINKED", "UNEVIDENCED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function profileText(p) {
  return [p.name, p.aliases, p.org, p.organization, p.role, p.description, p.tags, p.category, p.type, p.nationality, p.motivation].filter(Boolean).join(" ");
}
function datasetText(d) {
  return [d.name, d.title, d.description, d.type, d.category, d.tags, d.source, d.topic, d.domain].filter(Boolean).join(" ");
}
function eventText(e) {
  return [e.title, e.name, e.description, e.type, e.category, e.tags, e.source, e.status, e.severity, e.location].filter(Boolean).join(" ");
}

function classify(profile, datasets, events) {
  const kws = keywords(profileText(profile));
  const matchedDatasets = datasets
    .map(d => ({ ...d, _score: scoreText(datasetText(d), kws) }))
    .filter(d => d._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedEvents = events
    .map(e => ({ ...e, _score: scoreText(eventText(e), kws) }))
    .filter(e => e._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const hasDs = matchedDatasets.length > 0;
  const hasEv = matchedEvents.length > 0;
  let cls;
  if (hasDs && hasEv)  cls = "FULLY_EVIDENCED";
  else if (hasDs)       cls = "DATA_BACKED";
  else if (hasEv)       cls = "OPS_LINKED";
  else                  cls = "UNEVIDENCED";
  return { ...profile, _cls: cls, _datasets: matchedDatasets, _events: matchedEvents };
}

export default function IntelProfileDatasetOpsNexus() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [profiles, setProfiles]     = useState([]);
  const [datasets, setDatasets]     = useState([]);
  const [events, setEvents]         = useState([]);
  const [classified, setClassified] = useState([]);
  const [tab, setTab]               = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [brief, setBrief]           = useState("");
  const [assessing, setAssessing]   = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [ipRes, dsRes, evRes] = await Promise.allSettled([
        fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
        fetch(`${base}/v1/datasets`).then(r => r.json()),
        fetch(`${base}/v1/ops/events`).then(r => r.json()),
      ]);
      const ip = ipRes.status === "fulfilled" ? (ipRes.value?.items || ipRes.value?.profiles || ipRes.value || []) : [];
      const ds = dsRes.status === "fulfilled" ? (dsRes.value?.items || dsRes.value?.datasets || dsRes.value || []) : [];
      const ev = evRes.status === "fulfilled" ? (evRes.value?.items || evRes.value?.events   || evRes.value || []) : [];
      setProfiles(ip);
      setDatasets(ds);
      setEvents(ev);
      setClassified(ip.map(p => classify(p, ds, ev)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:idenex-toggle", onToggle);
    return () => window.removeEventListener("jarvis:idenex-toggle", onToggle);
  }, []);

  const fullyEvidenced = classified.filter(c => c._cls === "FULLY_EVIDENCED").length;
  const dataBacked     = classified.filter(c => c._cls === "DATA_BACKED").length;
  const opsLinked      = classified.filter(c => c._cls === "OPS_LINKED").length;
  const unEvidenced    = classified.filter(c => c._cls === "UNEVIDENCED").length;
  const total          = classified.length;
  const evidencedPct   = total ? Math.round((fullyEvidenced / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || profileText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `IDENEX: ${total} intel profiles — FULLY_EVIDENCED: ${fullyEvidenced}, DATA_BACKED: ${dataBacked}, OPS_LINKED: ${opsLinked}, UNEVIDENCED: ${unEvidenced} (${evidencedPct}% evidenced). Datasets: ${datasets.length}. Ops events: ${events.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `IDENEX intelligence evidence nexus assessment. Context: ${ctx}. Provide a 2-sentence intelligence brief identifying which unevidenced threat actor profiles represent the highest intelligence gap and recommend the most urgent dataset or ops event linkage actions to close the evidence gap. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "Evidence assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      const tts = await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: txt }),
      });
      if (tts.ok) {
        const blob = await tts.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
      }
    } catch (e) {
      setBrief("Assessment unavailable: " + e.message);
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="IntelProfile × Dataset × Ops Event Intelligence Evidence Nexus (IDENEX)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${AM}55`,
          color: AM, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {unEvidenced > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {unEvidenced}
          </span>
        )}
        ◈ IDENEX
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: Z_INDEX,
      background: BG, fontFamily: FONT, overflowY: "auto", padding: "18px 20px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ color: CY, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ IDENEX</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          IntelProfile × Dataset × Ops Event — Intelligence Evidence Nexus
        </span>
        {loading && <span style={{ color: AM, fontSize: 10 }}>◌ loading…</span>}
        <button onClick={load} style={smallBtn(CY)} title="Refresh">↺</button>
        <button onClick={() => setOpen(false)} style={smallBtn(RD)}>✕</button>
      </div>

      {error && (
        <div style={{ color: RD, fontSize: 11, marginBottom: 10, padding: "6px 10px", border: `1px solid ${RD}44`, borderRadius: 4 }}>
          {error}
        </div>
      )}

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          ["INTEL PROFILES",   total,            OR],
          ["DATASETS",         datasets.length,  PU],
          ["OPS EVENTS",       events.length,    BL],
          ["FULLY EVIDENCED",  fullyEvidenced,   GR],
          ["DATA BACKED",      dataBacked,       PU],
          ["OPS LINKED",       opsLinked,        BL],
          ["UNEVIDENCED",      unEvidenced,      AM],
          ["EVIDENCED%",       evidencedPct + "%", GR],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(0,207,255,0.04)", border: `1px solid ${col}33`,
            borderRadius: 5, padding: "5px 10px", minWidth: 80, textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>INTELLIGENCE EVIDENCE COVERAGE</div>
        <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", position: "relative", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${evidencedPct}%`, background: GR, borderRadius: 3, transition: "width 0.4s" }} />
        </div>
        <div style={{ color: GR, fontSize: 9, marginTop: 2 }}>{evidencedPct}% of threat actor profiles backed by both dataset and ops event evidence</div>
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={assess} disabled={assessing} style={{
          fontFamily: FONT, fontSize: 10, letterSpacing: 1, cursor: assessing ? "not-allowed" : "pointer",
          background: assessing ? "rgba(0,207,255,0.1)" : "rgba(0,207,255,0.15)",
          border: `1px solid ${CY}66`, color: CY, padding: "4px 10px", borderRadius: 4,
        }}>
          {assessing ? "◌ assessing…" : "▶ ASSESS EVIDENCE"}
        </button>
      </div>
      {brief && (
        <div style={{ color: "#DCEBF5", fontSize: 12, lineHeight: 1.5, marginBottom: 12,
          padding: "8px 12px", background: "rgba(0,207,255,0.06)", borderRadius: 6,
          border: `1px solid ${CY}22` }}>
          {brief}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontFamily: FONT, fontSize: 9, letterSpacing: 1, padding: "3px 8px", borderRadius: 4,
            cursor: "pointer",
            background: tab === t ? (CLASS_COLOR[t] || CY) : "rgba(0,207,255,0.06)",
            border: `1px solid ${tab === t ? (CLASS_COLOR[t] || CY) : "rgba(0,207,255,0.18)"}`,
            color: tab === t ? "#000" : (CLASS_COLOR[t] || CY),
          }}>
            {t.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="search intel profiles…"
        style={{
          fontFamily: FONT, fontSize: 11, width: "100%", maxWidth: 340, marginBottom: 12,
          background: "rgba(0,207,255,0.04)", border: `1px solid ${BORDER}`,
          color: "#DCEBF5", borderRadius: 4, padding: "5px 10px", outline: "none",
        }}
      />

      {/* Profile list */}
      {visible.length === 0 && !loading && (
        <div style={{ color: "#6E8AA0", fontSize: 11 }}>No profiles match current filter.</div>
      )}
      {visible.map((p, i) => {
        const col   = CLASS_COLOR[p._cls];
        const isExp = expanded === i;
        const name  = p.name || `Intel Profile ${i + 1}`;
        return (
          <div key={i} style={{
            marginBottom: 6, border: `1px solid ${col}33`, borderRadius: 6,
            background: "rgba(0,207,255,0.02)", overflow: "hidden",
          }}>
            <div
              onClick={() => setExpanded(isExp ? null : i)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
            >
              <span style={{
                color: col, fontSize: 9, letterSpacing: 1, border: `1px solid ${col}55`,
                borderRadius: 3, padding: "1px 5px", whiteSpace: "nowrap",
              }}>
                {p._cls.replace(/_/g, " ")}
              </span>
              <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {name}
              </span>
              {p.role && (
                <span style={{ color: OR, fontSize: 9, border: `1px solid ${OR}44`, borderRadius: 2, padding: "0 4px", whiteSpace: "nowrap" }}>
                  {p.role}
                </span>
              )}
              <span style={{ color: "#6E8AA0", fontSize: 9, marginLeft: "auto" }}>
                DS:{p._datasets.length} EV:{p._events.length}
              </span>
              <span style={{ color: "#6E8AA0", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
            </div>

            {isExp && (
              <div style={{ padding: "0 10px 10px", borderTop: `1px solid ${col}22` }}>
                {p.org && <div style={{ color: "#6E8AA0", fontSize: 10, marginTop: 6 }}>Org: {p.org}</div>}
                {p.description && (
                  <div style={{ color: "#94A3B8", fontSize: 10, margin: "4px 0 8px", lineHeight: 1.4 }}>
                    {p.description.slice(0, 200)}{p.description.length > 200 ? "…" : ""}
                  </div>
                )}

                {p._datasets.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>▸ MATCHED DATASETS</div>
                    {p._datasets.map((d, k) => {
                      const maxScore = Math.max(...p._datasets.map(x => x._score), 1);
                      const bar = Math.round((d._score / maxScore) * 100);
                      return (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>
                              {d.name || d.title || "Dataset"}
                            </span>
                            {d.type && (
                              <span style={{ color: PU, fontSize: 9, border: `1px solid ${PU}44`, borderRadius: 2, padding: "0 4px" }}>
                                {d.type}
                              </span>
                            )}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.05)", marginTop: 2 }}>
                            <div style={{ height: "100%", width: `${bar}%`, background: PU, borderRadius: 2, opacity: 0.7 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {p._events.length > 0 && (
                  <div>
                    <div style={{ color: BL, fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>▸ MATCHED OPS EVENTS</div>
                    {p._events.map((e, k) => {
                      const maxScore = Math.max(...p._events.map(x => x._score), 1);
                      const bar = Math.round((e._score / maxScore) * 100);
                      return (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>
                              {e.title || e.name || "Ops Event"}
                            </span>
                            {e.severity && (
                              <span style={{ color: BL, fontSize: 9, border: `1px solid ${BL}44`, borderRadius: 2, padding: "0 4px" }}>
                                {e.severity}
                              </span>
                            )}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.05)", marginTop: 2 }}>
                            <div style={{ height: "100%", width: `${bar}%`, background: BL, borderRadius: 2, opacity: 0.7 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {p._datasets.length === 0 && p._events.length === 0 && (
                  <div style={{ color: AM, fontSize: 10, marginTop: 6 }}>
                    ◌ No dataset or ops event match — threat actor completely unevidenced
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function smallBtn(color) {
  return {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10, cursor: "pointer",
    background: "transparent", border: `1px solid ${color}55`,
    color: color, padding: "2px 6px", borderRadius: 3,
  };
}
