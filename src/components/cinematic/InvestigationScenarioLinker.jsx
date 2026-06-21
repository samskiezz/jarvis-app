/**
 * InvestigationScenarioLinker — F59.
 *
 * Parallel-fetches /v1/investigations + /v1/scenario/list.
 * Keyword-correlates each open investigation (title/description/subject)
 * against available scenarios (name/description/tags) to surface
 * which cases have actionable scenario coverage and which are uncovered.
 *
 * Stat tiles: cases / scenarios / covered / uncovered
 * Filter tabs: ALL / COVERED / UNCOVERED
 * Split panel: investigation list left, matched scenarios right.
 * Click ▶ ASSESS on any case → /v1/jarvis/agent/chat AI 2-sentence
 *   scenario-recommendation + TTS via jarvis:speak-dossier.
 * 90 s auto-refresh.
 *
 * Intent: "investigation scenario link" / "case scenario gap" /
 *         "inv scen link" / "invscenlink" / "which scenarios cover" /
 *         "case scenario match"
 *   → jarvis:inv-scen-link-toggle + TTS brief via buildInvScenLinkerScript()
 *
 * Toggle: ◈ INVSL at left:7876, bottom:8, zIndex 65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const RED    = "#FF3D5A";
const BTN_LEFT  = 7876;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseInvestigations(raw) {
  return normaliseArray(raw).map((inv) => ({
    id:          inv.id || inv.case_id || String(Math.random()),
    title:       inv.title || inv.name || inv.case_name || "Unnamed Case",
    description: inv.description || inv.summary || inv.details || "",
    status:      (inv.status || "open").toLowerCase(),
    priority:    inv.priority || inv.severity || "",
    subject:     inv.subject || inv.target || "",
  }));
}

function normaliseScenarios(raw) {
  return normaliseArray(raw).map((s) => ({
    id:          s.id || s.scenario_id || String(Math.random()),
    name:        s.name || s.title || s.scenario_name || "Unnamed Scenario",
    description: s.description || s.summary || s.details || "",
    status:      (s.status || "available").toLowerCase(),
    tags:        [...(s.tags || []), ...(s.keywords || [])].map(String),
    category:    s.category || s.type || "",
  }));
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function overlap(inv, scenario) {
  const invTokens = new Set([
    ...tokens(inv.title),
    ...tokens(inv.description),
    ...tokens(inv.subject),
  ]);
  const scenTokens = [
    ...tokens(scenario.name),
    ...tokens(scenario.description),
    ...scenario.tags.flatMap((t) => tokens(t)),
    ...tokens(scenario.category),
  ];
  return scenTokens.some((t) => invTokens.has(t));
}

// ─── exported voice intent helpers ───────────────────────────────────────────

export function isInvScenLinkerQuery(q = "") {
  return /inv\s*scen\s*(link|linker)|case\s*scenario\s*(gap|match|link|cover)|investigation\s*scenario\s*(link|linker|match|cover|gap)|invscenlink|which\s*scenarios?\s*cover/i.test(q);
}

export async function buildInvScenLinkerScript() {
  try {
    const [invRes, scenRes] = await Promise.all([
      fetch(`${apiBase()}/v1/investigations`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/scenario/list`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const invs  = normaliseInvestigations(invRes.ok  ? await invRes.json()  : []);
    const scens = normaliseScenarios(scenRes.ok ? await scenRes.json() : []);
    const open  = invs.filter((i) => i.status !== "closed" && i.status !== "resolved");
    const covered   = open.filter((inv) => scens.some((s) => overlap(inv, s)));
    const uncovered = open.filter((inv) => !scens.some((s) => overlap(inv, s)));
    return (
      `Investigation-scenario coverage: ${open.length} open cases, ${scens.length} scenarios available. ` +
      `${covered.length} cases have matching scenario coverage; ${uncovered.length} are uncovered gaps. ` +
      (uncovered.length > 0
        ? `Uncovered cases include: ${uncovered.slice(0, 3).map((i) => i.title).join(", ")}.`
        : "All open cases have at least one matching scenario, sir.")
    );
  } catch {
    return "Unable to retrieve investigation-scenario coverage at this time, sir.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function InvestigationScenarioLinker() {
  const [open, setOpen]         = useState(false);
  const [invs, setInvs]         = useState([]);
  const [scens, setScens]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [filter, setFilter]     = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, scenRes] = await Promise.all([
        fetch(`${apiBase()}/v1/investigations`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/v1/scenario/list`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      setInvs(normaliseInvestigations(invRes.ok  ? await invRes.json()  : []));
      setScens(normaliseScenarios(scenRes.ok ? await scenRes.json() : []));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen((v) => !v); if (!open) load(); };
    window.addEventListener("jarvis:inv-scen-link-toggle", onToggle);
    return () => window.removeEventListener("jarvis:inv-scen-link-toggle", onToggle);
  }, [open, load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const openInvs = invs.filter((i) => i.status !== "closed" && i.status !== "resolved");

  const withCoverage = openInvs.map((inv) => {
    const matched = scens.filter((s) => overlap(inv, s));
    return { ...inv, matched, covered: matched.length > 0 };
  });

  const covered   = withCoverage.filter((i) => i.covered).length;
  const uncovered = withCoverage.filter((i) => !i.covered).length;

  const visible =
    filter === "COVERED"   ? withCoverage.filter((i) => i.covered) :
    filter === "UNCOVERED" ? withCoverage.filter((i) => !i.covered) :
    withCoverage;

  async function assess(inv) {
    setAssessing(inv.id);
    try {
      const prompt =
        `In 2 sentences, recommend the best scenario response for this investigation: ` +
        `"${inv.title}". ` +
        (inv.matched.length > 0
          ? `Matched scenarios: ${inv.matched.map((s) => s.name).join(", ")}.`
          : "No matching scenarios found yet.");
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient data to assess this case, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {}
    setAssessing(null);
  }

  const TABS = ["ALL", "COVERED", "UNCOVERED"];
  const priorityColor = (p) =>
    p === "critical" ? RED : p === "high" ? AMBER : p === "medium" ? CY : "#4A6070";

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => { setOpen((v) => !v); if (!open) load(); }}
        title="Investigation-Scenario Linker"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 65,
          background: open ? CY : "rgba(5,8,13,0.75)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}55`, borderRadius: 6, padding: "3px 8px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: 1,
          cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: uncovered > 0 ? `0 0 10px ${AMBER}66` : "none",
        }}
      >
        ◈ INVSL{uncovered > 0 && !open ? ` +${uncovered}` : ""}
      </button>

      {/* panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 30, left: BTN_LEFT - 400, zIndex: 66,
          width: 680, maxHeight: "72vh",
          background: "rgba(5,8,13,0.94)", border: `1px solid ${CY}33`,
          borderRadius: 12, overflow: "hidden",
          backdropFilter: "blur(14px)", boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace", display: "flex", flexDirection: "column",
        }}>
          {/* header */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${CY}22`, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>◈ INVESTIGATION–SCENARIO LINKER</span>
            {loading && <span style={{ color: "#4A6070", fontSize: 9 }}>↻</span>}
            <button onClick={load} style={{ marginLeft: "auto", background: "none", border: `1px solid ${CY}33`, color: CY, borderRadius: 4, padding: "2px 7px", cursor: "pointer", fontSize: 9 }}>↻</button>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#4A6070", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${CY}11` }}>
            {[
              { label: "OPEN CASES", value: openInvs.length, c: CY },
              { label: "SCENARIOS", value: scens.length, c: "#A78BFA" },
              { label: "COVERED", value: covered, c: GREEN },
              { label: "UNCOVERED", value: uncovered, c: uncovered > 0 ? AMBER : "#4A6070" },
            ].map(({ label, value, c }) => (
              <div key={label} style={{ flex: 1, background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "5px 8px", textAlign: "center" }}>
                <div style={{ color: c, fontSize: 16, fontWeight: 700 }}>{value}</div>
                <div style={{ color: "#4A6070", fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${CY}11` }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1, padding: "5px 0", background: filter === t ? `${CY}18` : "none",
                border: "none", borderBottom: filter === t ? `2px solid ${CY}` : "2px solid transparent",
                color: filter === t ? CY : "#4A6070", cursor: "pointer", fontSize: 9, letterSpacing: 1,
              }}>{t}</button>
            ))}
          </div>

          {/* split body */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
            {/* left: investigation list */}
            <div style={{ flex: "0 0 300px", overflowY: "auto", borderRight: `1px solid ${CY}11` }}>
              {visible.length === 0 && (
                <div style={{ padding: 16, color: "#4A6070", fontSize: 11 }}>No cases to display.</div>
              )}
              {visible.map((inv) => (
                <div
                  key={inv.id}
                  onClick={() => setSelected(selected?.id === inv.id ? null : inv)}
                  style={{
                    padding: "8px 12px", cursor: "pointer", borderBottom: `1px solid ${CY}0A`,
                    background: selected?.id === inv.id ? `${CY}0F` : "transparent",
                    borderLeft: `2px solid ${inv.covered ? GREEN : AMBER}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 8, color: inv.covered ? GREEN : AMBER }}>
                      {inv.covered ? "●" : "○"}
                    </span>
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {inv.title}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {inv.status && (
                      <span style={{ fontSize: 8, color: "#4A6070", letterSpacing: 1 }}>{inv.status.toUpperCase()}</span>
                    )}
                    {inv.priority && (
                      <span style={{ fontSize: 8, color: priorityColor(inv.priority?.toLowerCase()), letterSpacing: 1 }}>
                        {inv.priority.toUpperCase()}
                      </span>
                    )}
                    <span style={{ fontSize: 8, color: inv.covered ? GREEN : AMBER, marginLeft: "auto" }}>
                      {inv.matched.length} scenario{inv.matched.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* right: matched scenarios + assess */}
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
              {!selected ? (
                <div style={{ color: "#4A6070", fontSize: 10, paddingTop: 24, textAlign: "center" }}>
                  Select an investigation to see matched scenarios
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: CY, fontSize: 10, fontWeight: 700, marginBottom: 2 }}>{selected.title}</div>
                    {selected.description && (
                      <div style={{ color: "#6E8AA0", fontSize: 9, lineHeight: 1.4, marginBottom: 6 }}>{selected.description}</div>
                    )}
                    <button
                      onClick={() => assess(selected)}
                      disabled={assessing === selected.id}
                      style={{
                        background: assessing === selected.id ? "#2a3a4a" : `${CY}22`,
                        border: `1px solid ${CY}55`, color: CY, borderRadius: 5,
                        padding: "4px 10px", cursor: assessing === selected.id ? "default" : "pointer",
                        fontSize: 9, letterSpacing: 1,
                      }}
                    >
                      {assessing === selected.id ? "◌ ASSESSING…" : "▶ ASSESS"}
                    </button>
                  </div>

                  {selected.matched.length === 0 ? (
                    <div style={{ color: AMBER, fontSize: 10, padding: "10px 0" }}>
                      No matching scenarios found for this case.
                    </div>
                  ) : (
                    selected.matched.map((s) => (
                      <div key={s.id} style={{
                        background: "rgba(255,255,255,0.03)", borderRadius: 6,
                        padding: "7px 10px", marginBottom: 6, borderLeft: `2px solid ${GREEN}`,
                      }}>
                        <div style={{ color: "#DCEBF5", fontSize: 10, marginBottom: 2 }}>{s.name}</div>
                        {s.description && (
                          <div style={{ color: "#4A6070", fontSize: 9, lineHeight: 1.4 }}>
                            {s.description.slice(0, 140)}{s.description.length > 140 ? "…" : ""}
                          </div>
                        )}
                        {s.status && (
                          <div style={{ color: "#4A6070", fontSize: 8, marginTop: 3, letterSpacing: 1 }}>
                            {s.status.toUpperCase()}{s.category ? ` · ${s.category}` : ""}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
