/**
 * RemindersScenarioNexus — F606
 * "JARVIS, reminders scenario / scenario reminders / remscn / scenario-backed reminders /
 *  unplanned reminders / reminder scenario coverage / reminders with scenarios"
 * Cross-references /reminders/list against /v1/scenario/list.
 * SCENARIO-BACKED reminders (≥1 scenario keyword-matches) vs UNPLANNED (no scenario backing).
 * Coverage % tile; ALL/SCENARIO-BACKED/UNPLANNED filter tabs + search; click-to-expand matched scenarios.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 90_000;

const REMSCN_RE =
  /\bremscn\b|\breminders?.scen\w*\b|\bscen\w*.reminders?\b|\bscenario.?backed.?reminders?\b|\bunplanned.?reminders?\b|\breminder.?scenario.?coverage\b|\breminders?.with.?scen\w*\b|\breminder.?playbook\b|\bscenario.?reminder.?coverage\b/i;

export function isRemscnQuery(text) {
  return REMSCN_RE.test(text || "");
}

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(keywords(a));
  return keywords(b).filter((w) => sa.has(w)).length;
}

function normaliseReminders(data) {
  if (!data) return [];
  const raw =
    data.reminders || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:      r.id || `rem-${i}`,
    content: r.content || r.text || r.title || r.note || `Reminder ${i + 1}`,
    kind:    (r.kind || r.type || "reminder").toLowerCase(),
    status:  (r.status || "pending").toLowerCase(),
    tags:    r.tags || [],
  }));
}

function normaliseScenarios(data) {
  if (!data) return [];
  const arr = Array.isArray(data)              ? data
    : Array.isArray(data?.scenarios)           ? data.scenarios
    : Array.isArray(data?.items)               ? data.items
    : Array.isArray(data?.results)             ? data.results
    : [];
  return arr.map((s, i) => ({
    id:          s.id          || `scn-${i}`,
    name:        s.name        || s.title      || `Scenario ${i + 1}`,
    description: (s.description || s.objective || s.summary || "").toString().slice(0, 150),
    status:      (s.status     || "pending").toString().toLowerCase(),
    kind:        (s.kind       || s.type       || "scenario").toString().toLowerCase(),
  }));
}

function crossRef(reminders, scenarios) {
  return reminders.map((rem) => {
    const haystack = `${rem.content} ${(rem.tags || []).join(" ")}`;
    const matches = scenarios
      .map((scn) => {
        const hits = overlap(haystack, `${scn.name} ${scn.description}`);
        return hits > 0 ? { ...scn, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 5);
    return { ...rem, scenarios: matches, linked: matches.length > 0 };
  });
}

export async function buildRemscnScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [remRes, scnRes] = await Promise.all([
      fetch(`${base}/reminders/list`,   { headers: hdr }),
      fetch(`${base}/v1/scenario/list`, { headers: hdr }),
    ]);
    const [remData, scnData] = await Promise.all([remRes.json(), scnRes.json()]);
    const reminders = normaliseReminders(remData);
    const scenarios = normaliseScenarios(scnData);
    const rows      = crossRef(reminders, scenarios);
    const linked    = rows.filter((r) => r.linked).length;
    const unplanned = rows.length - linked;
    const pct       = rows.length ? Math.round((linked / rows.length) * 100) : 0;
    if (!rows.length) return "No reminders found in the system, sir.";
    const topUnplanned = rows
      .filter((r) => !r.linked)
      .slice(0, 2)
      .map((r) => r.content.slice(0, 40))
      .join("; ");
    return (
      `${linked} of ${rows.length} reminders are backed by a known scenario (${pct}% coverage). ` +
      (unplanned > 0
        ? `${unplanned} reminder${unplanned !== 1 ? "s" : ""} have no matching scenario — unplanned notes: ${topUnplanned || "unknown"}.`
        : "All reminders are backed by at least one operational scenario.")
    );
  } catch {
    return "Unable to reach reminders or scenario endpoints, sir.";
  }
}

const BTN_LEFT = 86_460;

export default function RemindersScenarioNexus() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [remRes, scnRes] = await Promise.all([
        fetch(`${base}/reminders/list`,   { headers: hdr }),
        fetch(`${base}/v1/scenario/list`, { headers: hdr }),
      ]);
      const [remData, scnData] = await Promise.all([remRes.json(), scnRes.json()]);
      setRows(crossRef(normaliseReminders(remData), normaliseScenarios(scnData)));
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = (e) => {
      if (e?.detail?.toggle === "remscn" || e?.type === "jarvis:remscn-toggle") setOpen((v) => !v);
    };
    window.addEventListener("jarvis:remscn-toggle", h);
    window.addEventListener("jarvis:ask", (e) => {
      if (isRemscnQuery(e?.detail?.query)) setOpen(true);
    });
    return () => window.removeEventListener("jarvis:remscn-toggle", h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const linked    = rows.filter((r) => r.linked);
  const unplanned = rows.filter((r) => !r.linked);

  const visible = rows.filter((r) => {
    if (tab === "SCENARIO-BACKED" && !r.linked)  return false;
    if (tab === "UNPLANNED"       && r.linked)   return false;
    if (search) {
      const s = search.toLowerCase();
      return r.content.toLowerCase().includes(s) ||
        r.scenarios.some((scn) => scn.name.toLowerCase().includes(s));
    }
    return true;
  });

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const ctx  = await buildRemscnScript();
      const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({ message: `Reminders × Scenario status: ${ctx}. Give a 2-sentence operational planning assessment.` }),
      });
      const d = await res.json();
      const txt = d.response || d.message || d.content || "";
      setBrief(txt);
      if (txt) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
      }
    } catch {
      setBrief("Unable to reach agent endpoint.");
    } finally {
      setAssessing(false);
    }
  }, [assessing, rows]);

  const pct = rows.length ? Math.round((linked.length / rows.length) * 100) : 0;
  const MONO = "'JetBrains Mono',monospace";
  const SANS = "'Inter',system-ui,sans-serif";

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Reminders × Scenario Nexus (REMSCN)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 159,
          background: open ? `${CY}22` : "rgba(5,12,20,0.75)",
          border: `1px solid ${open ? CY : `${CY}33`}`,
          color: CY, fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", borderRadius: 5, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(6px)",
        }}
      >
        {unplanned.length > 0 && (
          <span style={{
            display: "inline-block", background: AMB, color: "#000",
            borderRadius: 6, fontSize: 8, padding: "0 4px", marginRight: 4,
          }}>{unplanned.length}</span>
        )}
        ◈ REMSCN
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 38, left: BTN_LEFT - 340, zIndex: 159,
          width: 360, maxHeight: 480,
          background: "rgba(4,10,18,0.95)", backdropFilter: "blur(16px)",
          border: `1px solid ${CY}33`, borderTop: `2px solid ${CY}`,
          borderRadius: 10, display: "flex", flexDirection: "column",
          fontFamily: SANS, overflow: "hidden",
          boxShadow: "0 0 40px rgba(41,231,255,0.08)",
        }}>

          {/* Header */}
          <div style={{
            padding: "8px 12px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: CY, letterSpacing: 1.5 }}>
              REMINDERS × SCENARIOS
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14, lineHeight: 1 }}
            >×</button>
          </div>

          {/* Stats */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6,
            padding: "8px 12px", borderBottom: `1px solid ${CY}11`,
          }}>
            {[
              ["TOTAL",    rows.length,      CY],
              ["BACKED",   linked.length,    GRN],
              ["UNPLANNED",unplanned.length, AMB],
            ].map(([label, val, color]) => (
              <div key={label} style={{
                background: `${color}0D`, border: `1px solid ${color}33`,
                borderRadius: 6, padding: "5px 8px", textAlign: "center",
              }}>
                <div style={{ fontFamily: MONO, fontSize: 14, color, fontWeight: 700 }}>{val}</div>
                <div style={{ fontFamily: MONO, fontSize: 8, color: DIM, letterSpacing: 1, marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          <div style={{ padding: "4px 12px 6px", borderBottom: `1px solid ${CY}11` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: DIM }}>SCENARIO COVERAGE</span>
              <span style={{ fontFamily: MONO, fontSize: 9, color: pct >= 70 ? GRN : pct >= 40 ? AMB : CY }}>{pct}%</span>
            </div>
            <div style={{ height: 3, background: `${CY}22`, borderRadius: 2 }}>
              <div style={{
                height: "100%", borderRadius: 2, transition: "width 0.4s",
                width: `${pct}%`,
                background: pct >= 70 ? GRN : pct >= 40 ? AMB : CY,
              }} />
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "6px 10px", borderBottom: `1px solid ${CY}11` }}>
            {["ALL", "SCENARIO-BACKED", "UNPLANNED"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                fontFamily: MONO, fontSize: 8, letterSpacing: 0.8,
                background: tab === t ? `${CY}22` : "transparent",
                border: `1px solid ${tab === t ? CY : `${CY}22`}`,
                color: tab === t ? CY : DIM, borderRadius: 4,
                padding: "2px 6px", cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "5px 10px", borderBottom: `1px solid ${CY}11` }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter reminders or scenarios…"
              style={{
                width: "100%", background: `${CY}0A`, border: `1px solid ${CY}22`,
                borderRadius: 5, color: "#C0DCE8", fontFamily: MONO, fontSize: 9,
                padding: "3px 8px", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
            {loading && rows.length === 0 && (
              <div style={{ color: DIM, fontFamily: MONO, fontSize: 10, textAlign: "center", padding: 20 }}>
                Loading…
              </div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ color: DIM, fontFamily: MONO, fontSize: 10, textAlign: "center", padding: 20 }}>
                No reminders match this filter.
              </div>
            )}
            {visible.map((rem) => (
              <div
                key={rem.id}
                style={{
                  borderRadius: 6, padding: "6px 8px", marginBottom: 4,
                  background: expanded === rem.id ? `${CY}0A` : `${CY}05`,
                  border: `1px solid ${rem.linked ? `${GRN}33` : `${AMB}22`}`,
                  cursor: "pointer",
                }}
                onClick={() => setExpanded(expanded === rem.id ? null : rem.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    fontFamily: MONO, fontSize: 8, letterSpacing: 0.8,
                    color: rem.linked ? GRN : AMB,
                    background: rem.linked ? `${GRN}1A` : `${AMB}1A`,
                    border: `1px solid ${rem.linked ? `${GRN}44` : `${AMB}44`}`,
                    borderRadius: 4, padding: "1px 5px", flexShrink: 0,
                  }}>
                    {rem.linked ? "BACKED" : "UNPLANNED"}
                  </span>
                  <span style={{
                    flex: 1, color: "#C0DCE8", fontSize: 10,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {rem.content}
                  </span>
                  {rem.linked && (
                    <span style={{ fontFamily: MONO, fontSize: 8, color: GRN, flexShrink: 0 }}>
                      {rem.scenarios.length} scn
                    </span>
                  )}
                </div>

                {expanded === rem.id && (
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${CY}15` }}>
                    {rem.scenarios.length > 0 ? rem.scenarios.map((scn) => (
                      <div key={scn.id} style={{
                        marginBottom: 4, padding: "4px 6px",
                        background: `${GRN}0A`, borderRadius: 4,
                        border: `1px solid ${GRN}22`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{
                            fontFamily: MONO, fontSize: 8,
                            color: CY, background: `${CY}1A`,
                            border: `1px solid ${CY}33`, borderRadius: 4, padding: "1px 4px",
                          }}>{scn.kind}</span>
                          <span style={{ color: GRN, fontSize: 10, flex: 1 }}>{scn.name}</span>
                          <span style={{ fontFamily: MONO, fontSize: 8, color: DIM }}>{scn.hits} hit{scn.hits !== 1 ? "s" : ""}</span>
                        </div>
                        {scn.description && (
                          <div style={{ color: DIM, fontSize: 9, lineHeight: 1.4 }}>{scn.description}</div>
                        )}
                      </div>
                    )) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No scenarios matched this reminder — note has no planning context.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Assess */}
          <div style={{ padding: "8px 10px", borderTop: `1px solid ${CY}22` }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: `${CY}18`, border: `1px solid ${CY}55`,
                borderRadius: 5, color: CY, padding: "5px 12px",
                cursor: "pointer", fontSize: 10, letterSpacing: 1,
                width: "100%", opacity: assessing ? 0.6 : 1,
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{
                marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5,
                borderLeft: `2px solid ${CY}`, paddingLeft: 8,
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
