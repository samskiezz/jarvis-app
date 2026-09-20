/**
 * F63 – SwarmJob × Intel Profile × Investigation Alignment Nexus (SJIPNEX)
 * Cross-correlates /entities/SwarmJob × /entities/IntelProfile × /v1/investigations.
 * Classifies each swarm job:
 *   FULLY_ALIGNED – matched intel profile AND investigation
 *   PROFILE_ONLY  – matched intel profile, no investigation
 *   INV_ONLY      – matched investigation, no intel profile
 *   ORPHANED      – no match in either (blind spot — unsupported automation)
 * ORPHANED rows pulse red.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT   = 947580;
const Z          = 646;
const REFRESH_MS = 90_000;

const CY   = "#29E7FF";
const GR   = "#00c878";
const AM   = "#F5A623";
const RD   = "#FF3B3B";
const PU   = "#a855f7";
const DIM  = "#3a5060";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
function authHdr() { return { Authorization: `Bearer ${API_KEY}` }; }

const SJIPNEX_RE = /\b(sjipnex|swarm.{0,12}(intel|profile|investigation|alignment)|intel.{0,12}swarm|investigation.{0,12}swarm|orphan(ed)?.{0,12}swarm|swarm.{0,12}(cover|gap|back(ed|ing)?|support)|job.{0,12}alignment|unsupport(ed)?.{0,12}(job|swarm))\b/i;

export function isSjipnexQuery(text) { return SJIPNEX_RE.test(text || ""); }

export async function buildSjipnexScript() {
  try {
    const base = apiBase();
    const [swRes, ipRes, invRes] = await Promise.all([
      fetch(`${base}/entities/SwarmJob`,    { headers: authHdr() }),
      fetch(`${base}/entities/IntelProfile`, { headers: authHdr() }),
      fetch(`${base}/v1/investigations`,     { headers: authHdr() }),
    ]);
    const [jobs, profiles, investigations] = await Promise.all([
      swRes.ok  ? swRes.json()  : [],
      ipRes.ok  ? ipRes.json()  : [],
      invRes.ok ? invRes.json() : [],
    ]);
    const jobArr  = (Array.isArray(jobs)          ? jobs          : jobs?.data          ?? []).slice(0, 80);
    const ipArr   = (Array.isArray(profiles)       ? profiles       : profiles?.data      ?? []).slice(0, 200);
    const invArr  = (Array.isArray(investigations) ? investigations : investigations?.data ?? []).slice(0, 200);
    const classified = classifyJobs(jobArr, ipArr, invArr);
    const orphaned      = classified.filter(r => r.cls === "ORPHANED").length;
    const fullyAligned  = classified.filter(r => r.cls === "FULLY_ALIGNED").length;
    return `SJIPNEX nexus: ${jobArr.length} swarm jobs, ${ipArr.length} intel profiles, ${invArr.length} investigations. ` +
      `Alignment: FULLY_ALIGNED ${fullyAligned}, PROFILE_ONLY ${classified.filter(r => r.cls === "PROFILE_ONLY").length}, ` +
      `INV_ONLY ${classified.filter(r => r.cls === "INV_ONLY").length}, ORPHANED ${orphaned}. ` +
      (orphaned > 0
        ? `${orphaned} swarm job${orphaned !== 1 ? "s" : ""} have no intel profile or investigation backing — orphaned automation requiring review.`
        : "All swarm jobs have at least one intelligence anchor.");
  } catch (e) {
    return `SJIPNEX nexus unavailable: ${e.message}`;
  }
}

function tok(str) {
  return String(str || "").toLowerCase().split(/\W+/).filter(t => t.length > 2);
}
function overlap(a, b) {
  const setB = new Set(b);
  return a.some(t => setB.has(t));
}

function classifyJobs(jobs, profiles, investigations) {
  return jobs.map(job => {
    const jtoks = tok(
      (job.name || job.title || "") + " " +
      (job.type || "") + " " +
      (job.description || "") + " " +
      (job.target || "")
    );
    const matchedProfiles = profiles.filter(p =>
      overlap(jtoks, tok(
        (p.name || p.title || "") + " " +
        (p.role || "") + " " +
        (p.organisation || p.org || "") + " " +
        (p.description || "") + " " +
        (p.tags || []).join(" ")
      ))
    );
    const matchedInv = investigations.filter(inv =>
      overlap(jtoks, tok(
        (inv.title || inv.name || "") + " " +
        (inv.description || inv.summary || "") + " " +
        (inv.status || "") + " " +
        (inv.category || "")
      ))
    );
    const hasPr  = matchedProfiles.length > 0;
    const hasInv = matchedInv.length > 0;
    let cls;
    if (hasPr && hasInv)       cls = "FULLY_ALIGNED";
    else if (hasPr && !hasInv) cls = "PROFILE_ONLY";
    else if (!hasPr && hasInv) cls = "INV_ONLY";
    else                       cls = "ORPHANED";
    return { job, cls, matchedProfiles, matchedInv };
  });
}

const CLS_COLOR = {
  FULLY_ALIGNED: GR,
  PROFILE_ONLY:  AM,
  INV_ONLY:      CY,
  ORPHANED:      RD,
};
const CLS_LABEL = {
  FULLY_ALIGNED: "FULLY ALIGNED",
  PROFILE_ONLY:  "PROFILE ONLY",
  INV_ONLY:      "INV ONLY",
  ORPHANED:      "ORPHANED",
};
const TABS = ["ALL", "FULLY_ALIGNED", "PROFILE_ONLY", "INV_ONLY", "ORPHANED"];

export default function SwarmJobIntelInvestigationNexus() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [ipCount, setIpCount]     = useState(0);
  const [invCount, setInvCount]   = useState(0);
  const [loading, setLoading]     = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [swRes, ipRes, invRes] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`,    { headers: authHdr() }),
        fetch(`${base}/entities/IntelProfile`, { headers: authHdr() }),
        fetch(`${base}/v1/investigations`,     { headers: authHdr() }),
      ]);
      const [jobs, profiles, investigations] = await Promise.all([
        swRes.ok  ? swRes.json()  : [],
        ipRes.ok  ? ipRes.json()  : [],
        invRes.ok ? invRes.json() : [],
      ]);
      const jobArr  = (Array.isArray(jobs)          ? jobs          : jobs?.data          ?? []).slice(0, 80);
      const ipArr   = (Array.isArray(profiles)       ? profiles       : profiles?.data      ?? []).slice(0, 200);
      const invArr  = (Array.isArray(investigations) ? investigations : investigations?.data ?? []).slice(0, 200);
      setIpCount(ipArr.length);
      setInvCount(invArr.length);
      setRows(classifyJobs(jobArr, ipArr, invArr));
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) { load(); timerRef.current = setInterval(load, REFRESH_MS); }
    else { clearInterval(timerRef.current); }
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:sjipnex-toggle", handler);
    return () => window.removeEventListener("jarvis:sjipnex-toggle", handler);
  }, []);

  const orphaned = rows.filter(r => r.cls === "ORPHANED").length;
  const fully    = rows.filter(r => r.cls === "FULLY_ALIGNED").length;
  const visible  = rows
    .filter(r => tab === "ALL" || r.cls === tab)
    .filter(r => {
      if (!search) return true;
      const name = r.job.name || r.job.title || r.job.type || "";
      return name.toLowerCase().includes(search.toLowerCase());
    });

  async function assess() {
    setAssessing(true);
    try {
      const base   = apiBase();
      const script = await buildSjipnexScript();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      const d     = await r.json();
      const reply = (d.answer || d.response || script).slice(0, 500);
      const voice = (typeof getActiveVoice === "function" ? getActiveVoice() : null) || "ash";
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply, voice }),
      });
    } catch (_) {}
    setAssessing(false);
  }

  const btnPulse = orphaned > 0;

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z,
          background: open ? `rgba(41,231,255,0.18)` : `rgba(5,12,20,0.82)`,
          border: `1px solid ${open ? CY : DIM}`,
          borderRadius: 6,
          color: open ? CY : DIM,
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 1.5,
          padding: "4px 9px",
          cursor: "pointer",
          whiteSpace: "nowrap",
          animation: btnPulse && !open ? "sjipnex-pulse 2.4s ease-in-out infinite" : "none",
        }}
        title="SwarmJob × Intel Profile × Investigation Alignment Nexus"
      >
        ◈ SJIPNEX
      </button>

      <style>{`
        @keyframes sjipnex-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(255,59,59,0); border-color: #3a5060; }
          50%      { box-shadow: 0 0 0 5px rgba(255,59,59,0.28); border-color: ${RD}; }
        }
      `}</style>

      {open && (
        <div
          style={{
            position: "fixed", right: 16, top: 64, zIndex: Z + 100,
            width: "min(660px, 96vw)",
            maxHeight: "82vh",
            display: "flex", flexDirection: "column",
            background: "rgba(5,12,20,0.95)",
            backdropFilter: "blur(16px)",
            border: `1px solid rgba(41,231,255,0.18)`,
            borderTop: `2px solid ${CY}`,
            borderRadius: 10,
            boxShadow: `0 0 60px rgba(41,231,255,0.10), 0 20px 48px rgba(0,0,0,0.75)`,
            fontFamily: SANS,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px",
            borderBottom: `1px solid rgba(41,231,255,0.09)`,
          }}>
            <span style={{ color: CY, fontFamily: MONO, fontSize: 11, letterSpacing: 1.5 }}>◈ SJIPNEX</span>
            <span style={{ color: "#5a7a8a", fontFamily: MONO, fontSize: 10, flex: 1, letterSpacing: 1 }}>
              SWARMJOB × INTEL × INVESTIGATION NEXUS
            </span>
            {loading && <span style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>SYNC…</span>}
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14, lineHeight: 1 }}
            >×</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 14px 0" }}>
            {[
              { label: "JOBS",          val: rows.length, color: CY },
              { label: "INTEL PROFILES", val: ipCount,    color: AM },
              { label: "INVESTIGATIONS", val: invCount,   color: GR },
              { label: "FULLY ALIGNED", val: fully,       color: GR },
              { label: "ORPHANED",      val: orphaned,    color: RD },
            ].map(t => (
              <div key={t.label} style={{
                flex: 1, background: "rgba(255,255,255,0.03)",
                border: `1px solid rgba(41,231,255,0.08)`, borderRadius: 6,
                padding: "7px 6px", textAlign: "center",
              }}>
                <div style={{ color: t.color, fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>{t.val}</div>
                <div style={{ color: DIM, fontFamily: MONO, fontSize: 8, letterSpacing: 1.2, marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 6, padding: "10px 14px 0", flexWrap: "wrap", alignItems: "center" }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `rgba(41,231,255,0.12)` : "transparent",
                  border: `1px solid ${tab === t ? CY : DIM}`,
                  borderRadius: 5, color: tab === t ? CY : DIM,
                  fontFamily: MONO, fontSize: 9, letterSpacing: 1.2,
                  padding: "3px 8px", cursor: "pointer",
                }}
              >
                {t === "ALL" ? "ALL" : CLS_LABEL[t] || t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search jobs…"
              style={{
                marginLeft: "auto",
                background: "rgba(41,231,255,0.04)",
                border: `1px solid ${DIM}`,
                borderRadius: 5, color: "#a0c0cc",
                fontFamily: MONO, fontSize: 10, padding: "3px 8px",
                outline: "none", width: 140,
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px 0" }}>
            {visible.length === 0 && (
              <div style={{ color: DIM, fontFamily: MONO, fontSize: 11, textAlign: "center", padding: "24px 0" }}>
                {loading ? "Loading nexus…" : "No jobs match filter."}
              </div>
            )}
            {visible.map((r, i) => {
              const name  = r.job.name || r.job.title || r.job.type || `Job ${i + 1}`;
              const color = CLS_COLOR[r.cls];
              const isExp = expanded === i;
              return (
                <div key={i}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "7px 10px", marginBottom: 3, borderRadius: 6,
                      background: isExp ? "rgba(41,231,255,0.05)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${isExp ? `rgba(41,231,255,0.18)` : "rgba(41,231,255,0.05)"}`,
                      cursor: "pointer",
                      borderLeft: `3px solid ${r.cls === "ORPHANED" ? RD : color}`,
                      animation: r.cls === "ORPHANED" ? "sjipnex-pulse 2.4s ease-in-out infinite" : "none",
                    }}
                  >
                    <span style={{ color, fontFamily: MONO, fontSize: 9, letterSpacing: 1, flexShrink: 0, width: 100 }}>
                      {CLS_LABEL[r.cls]}
                    </span>
                    <span style={{ flex: 1, color: "#b0ccd5", fontSize: 12, fontFamily: SANS, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                    </span>
                    <span style={{ color: DIM, fontFamily: MONO, fontSize: 9, flexShrink: 0 }}>
                      {r.matchedProfiles.length}ip / {r.matchedInv.length}inv
                    </span>
                    <span style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{
                      marginBottom: 6, padding: "8px 10px",
                      background: "rgba(41,231,255,0.02)",
                      border: "1px solid rgba(41,231,255,0.08)",
                      borderRadius: 6, borderLeft: `3px solid ${CY}44`,
                    }}>
                      {/* Intel profiles */}
                      {r.matchedProfiles.length > 0 ? (
                        <>
                          <div style={{ color: AM, fontFamily: MONO, fontSize: 9, letterSpacing: 1.2, marginBottom: 5 }}>
                            INTEL PROFILES ({r.matchedProfiles.length})
                          </div>
                          {r.matchedProfiles.slice(0, 5).map((p, pi) => {
                            const pname = p.name || p.title || `Profile ${pi + 1}`;
                            const prole = p.role || p.confidence || "";
                            const w = Math.round(55 + Math.random() * 40);
                            return (
                              <div key={pi} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <div style={{ height: 4, width: `${w}%`, maxWidth: 180, background: AM, borderRadius: 2, opacity: 0.7 }} />
                                <span style={{ color: "#8aabb5", fontFamily: MONO, fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {pname}{prole ? ` · ${prole}` : ""}
                                </span>
                              </div>
                            );
                          })}
                          {r.matchedProfiles.length > 5 && (
                            <div style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>+{r.matchedProfiles.length - 5} more profiles</div>
                          )}
                        </>
                      ) : (
                        <div style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>No intel profile matches.</div>
                      )}

                      {/* Investigations */}
                      {r.matchedInv.length > 0 && (
                        <>
                          <div style={{ color: GR, fontFamily: MONO, fontSize: 9, letterSpacing: 1.2, marginTop: 8, marginBottom: 5 }}>
                            INVESTIGATIONS ({r.matchedInv.length})
                          </div>
                          {r.matchedInv.slice(0, 5).map((inv, ii) => {
                            const ititle = inv.title || inv.name || `Investigation ${ii + 1}`;
                            const w = Math.round(60 + Math.random() * 35);
                            return (
                              <div key={ii} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <div style={{ height: 4, width: `${w}%`, maxWidth: 180, background: GR, borderRadius: 2, opacity: 0.7 }} />
                                <span style={{ color: "#8aabb5", fontFamily: MONO, fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {ititle}
                                </span>
                              </div>
                            );
                          })}
                          {r.matchedInv.length > 5 && (
                            <div style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>+{r.matchedInv.length - 5} more investigations</div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "8px 14px",
            borderTop: `1px solid rgba(41,231,255,0.07)`,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ color: DIM, fontFamily: MONO, fontSize: 9, flex: 1 }}>
              {visible.length} of {rows.length} jobs · 90 s refresh
            </span>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? "rgba(41,231,255,0.06)" : "rgba(41,231,255,0.12)",
                border: `1px solid ${assessing ? DIM : CY}`,
                borderRadius: 5, color: assessing ? DIM : CY,
                fontFamily: MONO, fontSize: 10, letterSpacing: 1,
                padding: "4px 14px", cursor: assessing ? "not-allowed" : "pointer",
              }}
            >
              {assessing ? "ASSESSING…" : "▶ ASSESS"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
