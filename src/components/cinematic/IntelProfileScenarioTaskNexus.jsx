/**
 * IntelProfileScenarioTaskNexus — F46 (overnight 2026-09-13)
 * Sources: /entities/IntelProfile + /v1/scenario/list + /entities/Task
 * Keyword-correlates each intel profile against active scenarios AND tasks:
 *   FULLY_COVERED  (profile has both a matching scenario + task)
 *   SCENARIO_ONLY  (matched a scenario but no task)
 *   TASK_ONLY      (matched a task but no scenario)
 *   UNADDRESSED    (no scenario or task matches)
 * Stat tiles: intel profiles / scenarios / tasks / unaddressed count.
 * Filter tabs: ALL / FULLY_COVERED / SCENARIO_ONLY / TASK_ONLY / UNADDRESSED.
 * Text search on profile name/subject.
 * Expand row → matched scenarios + matched tasks with relevance bars.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence coverage brief + TTS.
 * ◈ IPSTINEX button (left:932960 bottom:8 zIndex:629).
 * Voice triggers: "intel scenario task" / "ipstinex" / "unaddressed intel" /
 *                 "profile coverage" / "intel task coverage" / "intel profile scenario".
 * Toggle: jarvis:ipstinex-toggle event.
 * 90-s auto-refresh.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA040";
const RED = "#FF4D6D";
const PRP = "#A855F7";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const IPSTINEX_RE =
  /\bintel.scenario.task|ipstinex\b|unaddressed.intel|profile.cover|intel.task.cover|intel.profile.scenario|unaddressed.profile|profile.scenario.task|intel.triple\b/i;

// ── fetch helpers ─────────────────────────────────────────────────────────────

async function fetchIntelProfiles() {
  const r = await fetch(`${apiBase()}/entities/IntelProfile`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.profiles) ? d.profiles
    : Array.isArray(d?.data)     ? d.data
    : Array.isArray(d?.results)  ? d.results
    : [];
}

async function fetchScenarios() {
  const r = await fetch(`${apiBase()}/v1/scenario/list`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.scenarios) ? d.scenarios
    : Array.isArray(d?.data)      ? d.data
    : Array.isArray(d?.results)   ? d.results
    : [];
}

async function fetchTasks() {
  const r = await fetch(`${apiBase()}/entities/Task`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.tasks)   ? d.tasks
    : Array.isArray(d?.data)    ? d.data
    : Array.isArray(d?.results) ? d.results
    : [];
}

// ── keyword matching ──────────────────────────────────────────────────────────

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function scoreMatch(profileTokens, targetText) {
  const tgtTokens = tokenize(targetText);
  const hits = profileTokens.filter((t) => tgtTokens.includes(t));
  return hits.length;
}

function classify(profile, scenarios, tasks) {
  const subject = `${profile.name || ""} ${profile.subject || ""} ${profile.title || ""} ${profile.description || ""}`;
  const pToks = tokenize(subject);
  if (pToks.length === 0) return { tier: "UNADDRESSED", matchedScenarios: [], matchedTasks: [] };

  const matchedScenarios = scenarios
    .map((s) => {
      const text = `${s.name || s.title || s.id || ""} ${s.description || ""} ${s.kind || ""}`;
      const hits = scoreMatch(pToks, text);
      return hits > 0 ? { ...s, hits } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 5);

  const matchedTasks = tasks
    .map((t) => {
      const text = `${t.title || t.name || ""} ${t.description || ""} ${t.status || ""}`;
      const hits = scoreMatch(pToks, text);
      return hits > 0 ? { ...t, hits } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 5);

  const hasScenario = matchedScenarios.length > 0;
  const hasTask = matchedTasks.length > 0;
  const tier =
    hasScenario && hasTask ? "FULLY_COVERED"
    : hasScenario          ? "SCENARIO_ONLY"
    : hasTask              ? "TASK_ONLY"
    :                        "UNADDRESSED";

  return { tier, matchedScenarios, matchedTasks };
}

// ── exported intents ──────────────────────────────────────────────────────────

export function isIpstinexQuery(q) {
  return IPSTINEX_RE.test(q);
}

export async function buildIpstinexScript() {
  try {
    const [profiles, scenarios, tasks] = await Promise.all([
      fetchIntelProfiles(),
      fetchScenarios(),
      fetchTasks(),
    ]);
    const rows = profiles.map((p) => ({ ...p, ...classify(p, scenarios, tasks) }));
    const unaddressed = rows.filter((r) => r.tier === "UNADDRESSED").length;
    const fully = rows.filter((r) => r.tier === "FULLY_COVERED").length;
    return `Intel Profile × Scenario × Task Nexus: ${profiles.length} profiles assessed, ${fully} fully covered (scenario + task), ${unaddressed} unaddressed with no response plan or active task. Coverage across ${scenarios.length} scenarios and ${tasks.length} tasks.`;
  } catch {
    return "Intel Profile × Scenario × Task Nexus: data unavailable.";
  }
}

// ── styles ────────────────────────────────────────────────────────────────────

const S = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 9100, backdropFilter: "blur(6px)",
  },
  panel: {
    width: "min(960px,96vw)", maxHeight: "84vh", overflowY: "auto",
    background: "rgba(5,14,28,0.97)", border: `1px solid ${CY}33`,
    borderRadius: 12, padding: "28px 32px", color: "#e8f4f8",
    fontFamily: "monospace",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    marginBottom: 20,
  },
  title: { fontSize: 16, fontWeight: 700, color: CY, letterSpacing: 2 },
  closeBtn: {
    background: "none", border: `1px solid ${CY}44`, color: CY,
    padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13,
  },
  tiles: { display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" },
  tile: {
    flex: "1 1 140px", background: "rgba(255,255,255,0.04)",
    border: `1px solid ${CY}22`, borderRadius: 8, padding: "12px 16px",
    textAlign: "center",
  },
  tileVal: { fontSize: 28, fontWeight: 700 },
  tileLbl: { fontSize: 10, opacity: 0.55, marginTop: 2, letterSpacing: 1 },
  tabs: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  tab: (active) => ({
    background: active ? `${CY}22` : "rgba(255,255,255,0.04)",
    border: `1px solid ${active ? CY : CY + "22"}`,
    color: active ? CY : "#8ab",
    padding: "5px 14px", borderRadius: 6, cursor: "pointer",
    fontSize: 11, fontFamily: "monospace", letterSpacing: 1,
  }),
  search: {
    width: "100%", background: "rgba(255,255,255,0.06)",
    border: `1px solid ${CY}33`, color: "#e8f4f8", padding: "7px 12px",
    borderRadius: 6, fontSize: 13, marginBottom: 14, fontFamily: "monospace",
    boxSizing: "border-box",
  },
  row: (tier) => ({
    background: "rgba(255,255,255,0.03)",
    border: `1px solid ${
      tier === "UNADDRESSED"  ? RED + "44"
      : tier === "FULLY_COVERED" ? GRN + "33"
      : tier === "SCENARIO_ONLY" ? AMB + "33"
      : PRP + "33"
    }`,
    borderRadius: 8, padding: "10px 14px", marginBottom: 8, cursor: "pointer",
  }),
  rowHead: { display: "flex", alignItems: "center", gap: 10 },
  badge: (tier) => ({
    fontSize: 9, padding: "2px 8px", borderRadius: 4, fontWeight: 700,
    letterSpacing: 1,
    background:
      tier === "FULLY_COVERED" ? GRN + "30"
      : tier === "SCENARIO_ONLY" ? AMB + "30"
      : tier === "TASK_ONLY"     ? PRP + "30"
      :                            RED + "30",
    color:
      tier === "FULLY_COVERED" ? GRN
      : tier === "SCENARIO_ONLY" ? AMB
      : tier === "TASK_ONLY"     ? PRP
      :                            RED,
    border: `1px solid ${
      tier === "FULLY_COVERED" ? GRN
      : tier === "SCENARIO_ONLY" ? AMB
      : tier === "TASK_ONLY"     ? PRP
      :                            RED}44`,
    animation: tier === "UNADDRESSED" ? "pulse 1.4s ease-in-out infinite" : "none",
  }),
  bar: (pct, col) => ({
    height: 4, width: `${Math.min(100, pct * 10)}%`,
    background: col, borderRadius: 2, marginTop: 3, transition: "width 0.4s",
  }),
  assessBtn: {
    marginTop: 20, background: `${CY}18`, border: `1px solid ${CY}55`,
    color: CY, padding: "8px 20px", borderRadius: 8, cursor: "pointer",
    fontSize: 12, fontFamily: "monospace", letterSpacing: 1,
  },
  footer: { marginTop: 12, fontSize: 10, opacity: 0.35, textAlign: "center" },
};

const TIER_ORDER = ["UNADDRESSED", "FULLY_COVERED", "SCENARIO_ONLY", "TASK_ONLY"];
const TABS = ["ALL", "FULLY_COVERED", "SCENARIO_ONLY", "TASK_ONLY", "UNADDRESSED"];

// ── component ─────────────────────────────────────────────────────────────────

export default function IntelProfileScenarioTaskNexus() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpand] = useState(null);
  const [assessing, setAss]   = useState(false);
  const [counts, setCounts]   = useState({ profiles: 0, scenarios: 0, tasks: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profiles, scenarios, tasks] = await Promise.all([
        fetchIntelProfiles(),
        fetchScenarios(),
        fetchTasks(),
      ]);
      setCounts({ profiles: profiles.length, scenarios: scenarios.length, tasks: tasks.length });
      const classified = profiles
        .map((p) => ({ ...p, ...classify(p, scenarios, tasks) }))
        .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
      setRows(classified);
    } catch (e) {
      setError(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  // open/close via event
  useEffect(() => {
    const toggle = () => { setOpen((v) => !v); };
    window.addEventListener("jarvis:ipstinex-toggle", toggle);
    return () => window.removeEventListener("jarvis:ipstinex-toggle", toggle);
  }, []);

  // auto-refresh
  useEffect(() => {
    if (!open) return;
    load();
    const t = setInterval(load, 90_000);
    return () => clearInterval(t);
  }, [open, load]);

  const unaddressed = rows.filter((r) => r.tier === "UNADDRESSED").length;
  const fully       = rows.filter((r) => r.tier === "FULLY_COVERED").length;

  const visible = rows.filter((r) => {
    if (tab !== "ALL" && r.tier !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      const txt = `${r.name || ""} ${r.subject || ""} ${r.title || ""}`.toLowerCase();
      if (!txt.includes(q)) return false;
    }
    return true;
  });

  async function assess() {
    setAss(true);
    try {
      const script = await buildIpstinexScript();
      const agentRes = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Summarise intel profile scenario+task coverage in 2 sentences: ${script}` }),
      });
      const ag = await agentRes.json();
      const txt = ag?.response || ag?.message || ag?.content || script;
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: txt }),
      });
    } catch { /* non-fatal */ } finally {
      setAss(false);
    }
  }

  if (!open) return (
    <>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.45}}`}</style>
      <button
        onClick={() => setOpen(true)}
        title="Intel Profile × Scenario × Task Nexus (IPSTINEX)"
        style={{
          position: "fixed", left: 932960, bottom: 8, zIndex: 629,
          background: "rgba(5,14,28,0.85)", border: `1px solid ${PRP}66`,
          color: PRP, padding: "4px 10px", borderRadius: 6,
          fontSize: 10, cursor: "pointer", fontFamily: "monospace",
          letterSpacing: 1,
        }}
      >
        {unaddressed > 0 && (
          <span style={{
            background: RED, color: "#fff", borderRadius: "50%",
            fontSize: 9, padding: "1px 5px", marginRight: 5,
            animation: "pulse 1.4s ease-in-out infinite",
          }}>
            {unaddressed}
          </span>
        )}
        ◈ IPSTINEX
      </button>
    </>
  );

  return (
    <>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.45}}`}</style>
      <div style={S.overlay} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
        <div style={S.panel}>
          <div style={S.header}>
            <span style={S.title}>◈ INTEL PROFILE × SCENARIO × TASK NEXUS</span>
            <button style={S.closeBtn} onClick={() => setOpen(false)}>CLOSE</button>
          </div>

          <div style={S.tiles}>
            <div style={S.tile}>
              <div style={{ ...S.tileVal, color: CY }}>{counts.profiles}</div>
              <div style={S.tileLbl}>INTEL PROFILES</div>
            </div>
            <div style={S.tile}>
              <div style={{ ...S.tileVal, color: GRN }}>{fully}</div>
              <div style={S.tileLbl}>FULLY COVERED</div>
            </div>
            <div style={S.tile}>
              <div style={{ ...S.tileVal, color: AMB }}>{counts.scenarios}</div>
              <div style={S.tileLbl}>SCENARIOS</div>
            </div>
            <div style={S.tile}>
              <div style={{ ...S.tileVal, color: PRP }}>{counts.tasks}</div>
              <div style={S.tileLbl}>TASKS</div>
            </div>
            <div style={S.tile}>
              <div style={{
                ...S.tileVal,
                color: unaddressed > 0 ? RED : GRN,
                animation: unaddressed > 0 ? "pulse 1.4s ease-in-out infinite" : "none",
              }}>
                {unaddressed}
              </div>
              <div style={S.tileLbl}>UNADDRESSED</div>
            </div>
          </div>

          <div style={S.tabs}>
            {TABS.map((t) => (
              <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>
                {t.replace("_", " ")}
              </button>
            ))}
          </div>

          <input
            style={S.search}
            placeholder="Search profiles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {loading && <div style={{ color: CY, fontSize: 12, marginBottom: 12 }}>Loading…</div>}
          {error   && <div style={{ color: RED, fontSize: 12, marginBottom: 12 }}>Error: {error}</div>}

          {visible.map((r, i) => {
            const name = r.name || r.subject || r.title || r.id || `Profile #${i + 1}`;
            const isExp = expanded === i;
            return (
              <div key={i} style={S.row(r.tier)} onClick={() => setExpand(isExp ? null : i)}>
                <div style={S.rowHead}>
                  <span style={{ flex: 1, fontSize: 13 }}>{name}</span>
                  <span style={S.badge(r.tier)}>{r.tier.replace("_", " ")}</span>
                  <span style={{ fontSize: 10, opacity: 0.45 }}>
                    {r.matchedScenarios.length}S · {r.matchedTasks.length}T
                  </span>
                  <span style={{ fontSize: 11, color: CY }}>
                    {isExp ? "▲" : "▼"}
                  </span>
                </div>

                {r.confidence && (
                  <div style={{ fontSize: 10, opacity: 0.5, marginTop: 4 }}>
                    confidence: {r.confidence} · threat: {r.threat_level || "—"}
                  </div>
                )}

                {isExp && (
                  <div style={{ marginTop: 12 }}>
                    {r.matchedScenarios.length > 0 && (
                      <>
                        <div style={{ fontSize: 10, color: AMB, marginBottom: 6, letterSpacing: 1 }}>
                          MATCHED SCENARIOS ({r.matchedScenarios.length})
                        </div>
                        {r.matchedScenarios.map((s, j) => (
                          <div key={j} style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 12, display: "flex", justifyContent: "space-between" }}>
                              <span>{s.name || s.title || s.id || `Scenario ${j + 1}`}</span>
                              <span style={{ fontSize: 10, color: AMB }}>{s.hits} hits</span>
                            </div>
                            <div style={S.bar(s.hits, AMB)} />
                          </div>
                        ))}
                      </>
                    )}
                    {r.matchedTasks.length > 0 && (
                      <>
                        <div style={{ fontSize: 10, color: PRP, marginBottom: 6, marginTop: 10, letterSpacing: 1 }}>
                          MATCHED TASKS ({r.matchedTasks.length})
                        </div>
                        {r.matchedTasks.map((t, j) => (
                          <div key={j} style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 12, display: "flex", justifyContent: "space-between" }}>
                              <span>{t.title || t.name || `Task ${j + 1}`}</span>
                              <span style={{ fontSize: 10, color: PRP }}>{t.hits} hits</span>
                            </div>
                            <div style={S.bar(t.hits, PRP)} />
                          </div>
                        ))}
                      </>
                    )}
                    {r.matchedScenarios.length === 0 && r.matchedTasks.length === 0 && (
                      <div style={{ fontSize: 11, color: RED, opacity: 0.7 }}>
                        No scenario or task coverage found for this profile.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {visible.length === 0 && !loading && (
            <div style={{ fontSize: 12, opacity: 0.45, textAlign: "center", padding: 20 }}>
              No profiles match.
            </div>
          )}

          <button
            style={S.assessBtn}
            onClick={assess}
            disabled={assessing}
          >
            {assessing ? "ASSESSING…" : "▶ ASSESS"}
          </button>

          <div style={S.footer}>
            Auto-refresh every 90s · /entities/IntelProfile + /v1/scenario/list + /entities/Task
          </div>
        </div>
      </div>
    </>
  );
}
