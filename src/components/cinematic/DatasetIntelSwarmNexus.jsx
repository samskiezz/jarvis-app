/**
 * F97 — Dataset × IntelProfile × SwarmJob Intelligence Automation Nexus (DIASWAN)
 * Parallel-fetches /v1/datasets + /entities/IntelProfile + /entities/SwarmJob.
 * Keyword-correlates each dataset against known threat actor intel profiles AND active
 * swarm jobs to classify:
 *   FULLY_ARMED  (intel profile + swarm job match) | ACTOR_LINKED (intel profile only)
 *   SWARM_ACTIVE (swarm job only)                  | UNLINKED     (neither)
 * Amber badge on unlinked count. Stat tiles DATASETS/PROFILES/JOBS/classifications.
 * Filter tabs ALL/FULLY_ARMED/ACTOR_LINKED/SWARM_ACTIVE/UNLINKED + text search.
 * Expand dataset → matched intel profile cards (orange) + swarm job cards (cyan) with relevance bars.
 * ▶ ASSESS NEXUS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Voice trigger: "diaswan/dataset intel swarm/intel dataset/swarm dataset/dataset automation nexus/armed dataset".
 * Event: jarvis:diaswan-toggle | 90-s auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 997_240;
const Z_INDEX  = 159;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const DIASWAN_RE = /\b(diaswan|dataset\s+intel\s+swarm|intel\s+dataset|swarm\s+dataset|dataset\s+automation\s+nexus|armed\s+dataset|dataset\s+actor|actor\s+linked\s+dataset|swarm\s+active\s+dataset|dataset\s+nexus)\b/i;

const CY = "#00CFFF";
const AM = "#F59E0B";
const OR = "#F97316";
const GR = "#22C55E";
const RD = "#EF4444";
const BG = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_ARMED:  GR,
  ACTOR_LINKED: OR,
  SWARM_ACTIVE: CY,
  UNLINKED:     AM,
};

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isDiaswanQuery(text) {
  return DIASWAN_RE.test(text || "");
}

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function kwTokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function overlap(aStr, bStr) {
  const at = new Set(kwTokens(aStr));
  const bt = kwTokens(bStr);
  if (!at.size || !bt.length) return 0;
  return bt.filter(w => at.has(w)).length / Math.max(at.size, bt.length);
}

function scoreDatasetVsActor(dataset, actor) {
  const dStr = [dataset.name, dataset.description, dataset.type, dataset.source,
    (dataset.tags || []).join(" ")].join(" ");
  const aStr = [actor.name, actor.org, actor.role, (actor.aliases || []).join(" "),
    (actor.tags || []).join(" ")].join(" ");
  return overlap(dStr, aStr);
}

function scoreDatasetVsSwarm(dataset, job) {
  const dStr = [dataset.name, dataset.description, dataset.type, dataset.source,
    (dataset.tags || []).join(" ")].join(" ");
  const sStr = [job.name, job.description, job.type, job.status,
    (job.tags || []).join(" ")].join(" ");
  return overlap(dStr, sStr);
}

async function fetchAll() {
  const h = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const base = apiBase();
  const [rDatasets, rActors, rSwarm] = await Promise.all([
    fetch(`${base}/v1/datasets`,          { headers: h }).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/entities/IntelProfile`, { headers: h }).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/entities/SwarmJob`,     { headers: h }).then(r => r.json()).catch(() => ({})),
  ]);
  const datasets = norm(rDatasets, ["items", "data", "results", "datasets"]);
  const actors   = norm(rActors,   ["items", "data", "results", "intel_profiles", "profiles"]);
  const swarm    = norm(rSwarm,    ["items", "data", "results", "swarm_jobs", "jobs"]);

  const THRESH = 0.06;
  const rows = datasets.map(dataset => {
    const matchedActors = actors
      .map(a => ({ ...a, _rel: scoreDatasetVsActor(dataset, a) }))
      .filter(a => a._rel >= THRESH)
      .sort((a, b) => b._rel - a._rel)
      .slice(0, 4);
    const matchedJobs = swarm
      .map(j => ({ ...j, _rel: scoreDatasetVsSwarm(dataset, j) }))
      .filter(j => j._rel >= THRESH)
      .sort((a, b) => b._rel - a._rel)
      .slice(0, 4);
    const hasActor = matchedActors.length > 0;
    const hasSwarm = matchedJobs.length > 0;
    const cls = hasActor && hasSwarm ? "FULLY_ARMED"
              : hasActor             ? "ACTOR_LINKED"
              : hasSwarm             ? "SWARM_ACTIVE"
              :                        "UNLINKED";
    return { ...dataset, _class: cls, _actors: matchedActors, _jobs: matchedJobs };
  });
  return { rows, actors, swarm };
}

export async function buildDiaswanScript() {
  const { rows, actors, swarm } = await fetchAll();
  const total   = rows.length;
  const armed   = rows.filter(r => r._class === "FULLY_ARMED").length;
  const actorL  = rows.filter(r => r._class === "ACTOR_LINKED").length;
  const swarmA  = rows.filter(r => r._class === "SWARM_ACTIVE").length;
  const unlinked = rows.filter(r => r._class === "UNLINKED").length;
  const pct = total ? Math.round((armed / total) * 100) : 0;
  return `Dataset intelligence automation nexus DIASWAN report, sir. Of ${total} datasets cross-referenced against ${actors.length} intel actor profiles and ${swarm.length} swarm jobs: ${armed} datasets (${pct}%) are fully armed — they have both active threat actor linkage and an automated swarm job running against them. ${actorL} are actor-linked without swarm coverage, ${swarmA} are swarm-active without a known threat actor profile, and ${unlinked} remain completely unlinked to any intelligence or automation context. Recommend immediate swarm deployment for actor-linked datasets and threat profiling for swarm-active datasets without actor context.`;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function DatasetIntelSwarmNexus() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState(null);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [brief, setBrief]         = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { rows: r } = await fetchAll();
      setRows(r);
    } catch (e) {
      setErr(String(e));
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
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:diaswan-toggle", h);
    return () => window.removeEventListener("jarvis:diaswan-toggle", h);
  }, []);

  const filtered = rows.filter(r => {
    if (tab !== "ALL" && r._class !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return [r.name, r.description, r.type, r.source].join(" ").toLowerCase().includes(s);
    }
    return true;
  });

  const total    = rows.length;
  const armed    = rows.filter(r => r._class === "FULLY_ARMED").length;
  const actorL   = rows.filter(r => r._class === "ACTOR_LINKED").length;
  const swarmA   = rows.filter(r => r._class === "SWARM_ACTIVE").length;
  const unlinked = rows.filter(r => r._class === "UNLINKED").length;
  const pct = total ? Math.round((armed / total) * 100) : 0;

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const script = await buildDiaswanScript();
      const base = apiBase();
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) },
        body: JSON.stringify({ message: script }),
      }).then(r => r.json()).catch(() => null);
      const text = res?.response || res?.message || res?.content || script;
      setBrief(text);
      try {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) },
          body: JSON.stringify({ text: text.slice(0, 400) }),
        });
      } catch {}
    } catch (e) {
      setBrief("Intelligence automation nexus assessment unavailable: " + String(e));
    } finally {
      setAssessing(false);
    }
  }

  const TABS = ["ALL", "FULLY_ARMED", "ACTOR_LINKED", "SWARM_ACTIVE", "UNLINKED"];
  const TAB_LABELS = {
    ALL: "ALL", FULLY_ARMED: "FULLY ARMED", ACTOR_LINKED: "ACTOR LINKED",
    SWARM_ACTIVE: "SWARM ACTIVE", UNLINKED: "UNLINKED",
  };

  const tile = (label, val, color) => (
    <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${color}33`, borderRadius: 8,
      padding: "8px 12px", textAlign: "center", minWidth: 70 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: FONT }}>{val}</div>
      <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{label}</div>
    </div>
  );

  return (
    <>
      {/* trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Dataset × IntelProfile × SwarmJob Intelligence Automation Nexus (DIASWAN)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: open ? CY : "rgba(6,11,22,0.88)",
          color: open ? "#04060A" : CY, border: `1px solid ${CY}55`,
          borderRadius: 6, padding: "4px 10px", fontSize: 10, fontFamily: FONT,
          cursor: "pointer", letterSpacing: 1, whiteSpace: "nowrap",
          boxShadow: open ? `0 0 14px ${CY}66` : "none",
        }}
      >
        ◈ DIASWAN
        {unlinked > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#04060A",
            borderRadius: 4, padding: "0 5px", fontSize: 9, fontWeight: 700,
          }}>{unlinked}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
          zIndex: Z_INDEX + 1, width: "min(840px,95vw)", maxHeight: "82vh",
          background: BG, border: `1px solid ${BORDER}`, borderRadius: 14,
          display: "flex", flexDirection: "column", fontFamily: FONT,
          boxShadow: `0 0 60px ${CY}22`,
        }}>
          {/* header */}
          <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>◈ DIASWAN</span>
              <span style={{ color: "#6E8AA0", fontSize: 11 }}>Dataset × IntelProfile × SwarmJob Intelligence Automation Nexus</span>
              <button onClick={() => setOpen(false)} style={{
                marginLeft: "auto", background: "none", border: "none", color: "#6E8AA0",
                cursor: "pointer", fontSize: 16,
              }}>✕</button>
            </div>

            {/* stat tiles */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              {tile("TOTAL",        total,    CY)}
              {tile("FULLY ARMED",  armed,    GR)}
              {tile("ACTOR LINKED", actorL,   OR)}
              {tile("SWARM ACTIVE", swarmA,   CY)}
              {tile("UNLINKED",     unlinked, AM)}
            </div>

            {/* armed coverage bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 10, color: "#6E8AA0", minWidth: 100 }}>ARMED COVERAGE</span>
              <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%",
                  background: `linear-gradient(90deg,${GR},${CY})`, borderRadius: 3, transition: "width 0.6s" }} />
              </div>
              <span style={{ fontSize: 11, color: GR, minWidth: 36 }}>{pct}%</span>
            </div>

            {/* filter tabs */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  fontSize: 9, padding: "3px 8px", borderRadius: 4, cursor: "pointer", fontFamily: FONT,
                  background: tab === t ? CLASS_COLOR[t] || CY : "rgba(255,255,255,0.04)",
                  color: tab === t ? "#04060A" : "#8FA8C0",
                  border: `1px solid ${tab === t ? CLASS_COLOR[t] || CY : "rgba(255,255,255,0.1)"}`,
                }}>
                  {TAB_LABELS[t]}
                </button>
              ))}
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="search datasets…"
                style={{
                  marginLeft: "auto", fontSize: 10, padding: "3px 8px", borderRadius: 4,
                  background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
                  color: "#DCEBF5", fontFamily: FONT, outline: "none", width: 140,
                }}
              />
            </div>
          </div>

          {/* body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "10px 18px 14px" }}>
            {loading && <div style={{ color: "#6E8AA0", fontSize: 11, padding: 12 }}>loading intelligence automation nexus data…</div>}
            {err     && <div style={{ color: RD, fontSize: 11, padding: 12 }}>{err}</div>}
            {!loading && !err && filtered.length === 0 && (
              <div style={{ color: "#6E8AA0", fontSize: 11, padding: 12 }}>no datasets match this filter</div>
            )}
            {filtered.map((dataset, i) => {
              const cc = CLASS_COLOR[dataset._class] || CY;
              const isExp = expanded === i;
              return (
                <div key={i} style={{
                  marginBottom: 6, border: `1px solid ${cc}22`, borderRadius: 8,
                  background: "rgba(255,255,255,0.02)",
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: cc, flexShrink: 0,
                      boxShadow: `0 0 6px ${cc}` }} />
                    <span style={{ fontSize: 12, color: "#DCEBF5", flex: 1 }}>
                      {dataset.name || dataset.id || `Dataset #${i + 1}`}
                    </span>
                    {dataset.type && (
                      <span style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{String(dataset.type).toUpperCase()}</span>
                    )}
                    {dataset.source && (
                      <span style={{ fontSize: 9, color: AM }}>{dataset.source}</span>
                    )}
                    <span style={{ fontSize: 9, color: cc, letterSpacing: 1, padding: "2px 6px",
                      border: `1px solid ${cc}44`, borderRadius: 4 }}>{dataset._class.replace(/_/g, " ")}</span>
                    <span style={{ fontSize: 10, color: "#6E8AA0" }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {isExp && (
                    <div style={{ padding: "0 12px 12px" }}>
                      {dataset.description && (
                        <div style={{ fontSize: 10, color: "#8FA8C0", marginBottom: 8 }}>{dataset.description}</div>
                      )}
                      {/* matched intel actor profiles */}
                      {dataset._actors.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 9, color: OR, letterSpacing: 1, marginBottom: 4 }}>▸ MATCHED INTEL ACTOR PROFILES</div>
                          {dataset._actors.map((a, j) => (
                            <div key={j} style={{ marginBottom: 4, padding: "5px 8px",
                              background: "rgba(249,115,22,0.07)", border: `1px solid ${OR}22`, borderRadius: 6 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                {a.role && (
                                  <span style={{ fontSize: 9, color: "#04060A", background: OR,
                                    padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>
                                    {String(a.role).toUpperCase()}
                                  </span>
                                )}
                                <span style={{ fontSize: 11, color: "#DCEBF5" }}>{a.name || "Actor"}</span>
                                {a.org && <span style={{ fontSize: 9, color: "#8FA8C0" }}>{a.org}</span>}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 9, color: "#6E8AA0" }}>relevance</span>
                                <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                                  <div style={{ width: `${Math.min(100, Math.round(a._rel * 100))}%`, height: "100%",
                                    background: OR, borderRadius: 2 }} />
                                </div>
                                <span style={{ fontSize: 9, color: OR }}>{Math.round(a._rel * 100)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* matched swarm jobs */}
                      {dataset._jobs.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: CY, letterSpacing: 1, marginBottom: 4 }}>▸ MATCHED SWARM JOBS</div>
                          {dataset._jobs.map((j, k) => (
                            <div key={k} style={{ marginBottom: 4, padding: "5px 8px",
                              background: "rgba(0,207,255,0.07)", border: `1px solid ${CY}22`, borderRadius: 6 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                {j.status && (
                                  <span style={{ fontSize: 9, color: "#04060A", background: CY,
                                    padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>
                                    {String(j.status).toUpperCase()}
                                  </span>
                                )}
                                <span style={{ fontSize: 11, color: "#DCEBF5" }}>{j.name || j.id || "Swarm Job"}</span>
                                {j.type && <span style={{ fontSize: 9, color: "#8FA8C0" }}>{j.type}</span>}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 9, color: "#6E8AA0" }}>relevance</span>
                                <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                                  <div style={{ width: `${Math.min(100, Math.round(j._rel * 100))}%`, height: "100%",
                                    background: CY, borderRadius: 2 }} />
                                </div>
                                <span style={{ fontSize: 9, color: CY }}>{Math.round(j._rel * 100)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {dataset._actors.length === 0 && dataset._jobs.length === 0 && (
                        <div style={{ fontSize: 10, color: AM, fontStyle: "italic" }}>
                          No intel actor or swarm job correlations — dataset is unlinked.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* footer */}
          <div style={{ padding: "10px 18px", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
            <button onClick={assess} disabled={assessing || loading} style={{
              background: assessing ? "rgba(0,207,255,0.1)" : CY, color: assessing ? CY : "#04060A",
              border: `1px solid ${CY}`, borderRadius: 6, padding: "6px 14px", fontSize: 11,
              cursor: assessing ? "not-allowed" : "pointer", fontFamily: FONT, letterSpacing: 1,
            }}>
              {assessing ? "assessing…" : "▶ ASSESS NEXUS"}
            </button>
            {brief && (
              <div style={{
                marginTop: 8, fontSize: 11, color: "#DCEBF5", lineHeight: 1.5,
                background: "rgba(0,207,255,0.06)", borderRadius: 6, padding: "8px 12px",
                border: `1px solid ${CY}22`,
              }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
