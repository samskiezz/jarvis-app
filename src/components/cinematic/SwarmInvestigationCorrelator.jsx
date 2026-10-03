/**
 * SwarmInvestigationCorrelator — F76 (SJIC)
 *
 * Parallel-fetches /entities/SwarmJob + /v1/investigations every 90 s.
 * Keyword-correlates each investigation against swarm jobs by title/description/objective/tags.
 * Classification: TASKED (≥1 correlated swarm job) vs UNSUPPORTED (0).
 * Amber badge on unsupported count.
 *
 * Voice intents: "swarm investigation/investigation swarm/sjic/unsupported investigations/
 *                swarm support/which investigations have swarm/swarm task coverage/
 *                investigation coverage/swarm intel coverage/swarm mission coverage"
 * Strip button: ◈ SJIC  left:2040 bottom:18 zIndex:68
 * Custom event: jarvis:sjic-toggle
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const RED = "#FF4D6D";
const PRP = "#B485FF";
const POLL = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const hdrs = { Authorization: `Bearer ${API_KEY}` };

const SJIC_RE =
  /\b(swarm.invest|invest.*swarm|sjic|unsupported.invest|swarm.support|swarm.task.cover|invest.*cover|swarm.intel.cover|swarm.mission|which.invest.*swarm|investigation.swarm|swarm.coverage.invest)\b/i;

export function isSjicQuery(t) { return SJIC_RE.test(t || ""); }

function tokenize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function relevance(inv, job) {
  const a = tokenize([inv.title, inv.description, inv.summary].join(" "));
  const b = tokenize([job.name, job.description, job.objective, (job.tags || []).join(" ")].join(" "));
  const set = new Set(b);
  const hits = a.filter(w => set.has(w)).length;
  return hits / Math.max(a.length, 1);
}

async function fetchAll() {
  const [jr, ir] = await Promise.all([
    fetch(`${apiBase()}/entities/SwarmJob`, { headers: hdrs }),
    fetch(`${apiBase()}/v1/investigations`, { headers: hdrs }),
  ]);
  const jd = jr.ok ? await jr.json() : {};
  const id_ = ir.ok ? await ir.json() : {};
  const jobs = (Array.isArray(jd) ? jd : jd?.data || jd?.items || jd?.results || []).map(j => ({
    id: j.id || j._id || String(Math.random()),
    name: j.name || j.title || "Unnamed job",
    status: j.status || j.state || "",
    description: j.description || "",
    objective: j.objective || "",
    tags: j.tags || [],
  }));
  const invs = (Array.isArray(id_) ? id_ : id_?.data || id_?.items || id_?.results || []).map(i => ({
    id: i.id || i._id || String(Math.random()),
    title: i.title || i.name || "Unnamed investigation",
    description: i.description || i.summary || "",
    summary: i.summary || "",
    status: i.status || "",
  }));
  return { jobs, invs };
}

export async function buildSjicScript() {
  try {
    const { jobs, invs } = await fetchAll();
    if (!invs.length) return "No investigations available for swarm correlation, sir.";
    const unsupported = invs.filter(inv =>
      !jobs.some(j => relevance(inv, j) > 0.03)
    );
    return (
      `Swarm Investigation Correlator: ${invs.length} investigations, ${jobs.length} swarm jobs. ` +
      `${invs.length - unsupported.length} TASKED, ${unsupported.length} UNSUPPORTED. ` +
      (unsupported.length
        ? `Unsupported investigations: ${unsupported.slice(0, 3).map(i => i.title).join(", ")}.`
        : "All investigations have swarm support, sir.")
    );
  } catch {
    return "Unable to retrieve swarm investigation correlation data at this time, sir.";
  }
}

function statusColor(s) {
  const sl = (s || "").toLowerCase();
  if (sl === "running" || sl === "active") return GRN;
  if (sl === "failed" || sl === "error") return RED;
  if (sl === "pending" || sl === "queued") return AMB;
  return "#566878";
}

export default function SwarmInvestigationCorrelator() {
  const [open, setOpen]     = useState(false);
  const [jobs, setJobs]     = useState([]);
  const [invs, setInvs]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState(null);
  const [tab, setTab]       = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const d = await fetchAll();
      setJobs(d.jobs); setInvs(d.invs);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const t = () => setOpen(v => !v);
    window.addEventListener("jarvis:sjic-toggle", t);
    return () => window.removeEventListener("jarvis:sjic-toggle", t);
  }, []);

  const correlated = invs.map(inv => {
    const matches = jobs
      .map(j => ({ ...j, score: relevance(inv, j) }))
      .filter(j => j.score > 0.03)
      .sort((a, b) => b.score - a.score);
    return { ...inv, matches, tasked: matches.length > 0 };
  });

  const unsupportedCount = correlated.filter(i => !i.tasked).length;

  const visible = correlated.filter(inv => {
    if (tab === "TASKED"    && !inv.tasked) return false;
    if (tab === "UNSUPPORTED" && inv.tasked)  return false;
    if (search) {
      const hay = (inv.title + " " + inv.description).toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const toggle = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }));

  return (
    <>
      {/* Strip toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        title="SwarmJob × Investigation Correlator (F76)"
        style={{
          position: "fixed", bottom: 18, left: 2040, zIndex: 68,
          background: open ? PRP : "rgba(5,8,13,0.75)",
          border: `1px solid ${PRP}88`, borderRadius: 6, padding: "3px 8px",
          color: open ? "#04060A" : PRP, fontSize: 10, letterSpacing: 1,
          cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          boxShadow: open ? `0 0 14px ${PRP}` : "none", whiteSpace: "nowrap",
        }}>
        ◈ SJIC
        {unsupportedCount > 0 && (
          <span style={{
            marginLeft: 4, background: AMB, color: "#04060A",
            borderRadius: 8, padding: "1px 5px", fontSize: 9,
          }}>{unsupportedCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 46, left: 1940, zIndex: 69,
          width: 500, maxHeight: "74vh", overflow: "hidden",
          background: "rgba(8,12,22,0.94)", border: `1px solid ${PRP}55`,
          borderRadius: 14, display: "flex", flexDirection: "column",
          backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${PRP}22`,
          fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* Header */}
          <div style={{
            padding: "12px 16px 10px", borderBottom: `1px solid ${PRP}33`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ color: PRP, fontWeight: 700, letterSpacing: 2, fontSize: 11,
              textShadow: `0 0 10px ${PRP}` }}>◈ SWARM × INVESTIGATION CORRELATOR</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {loading && <span style={{ color: AMB, fontSize: 9, animation: "sjicpulse 1s infinite" }}>syncing…</span>}
              <button onClick={load} style={{
                background: "none", border: `1px solid ${PRP}55`, borderRadius: 4,
                color: PRP, fontSize: 10, cursor: "pointer", padding: "2px 6px",
              }}>↺</button>
              <button onClick={() => setOpen(false)} style={{
                background: "none", border: "none", color: "#6E8AA0",
                fontSize: 14, cursor: "pointer", lineHeight: 1,
              }}>✕</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "flex", gap: 0, borderBottom: `1px solid ${PRP}22`,
          }}>
            {[
              ["INVS",         invs.length,                        CY],
              ["JOBS",         jobs.length,                        PRP],
              ["TASKED",       correlated.filter(i => i.tasked).length,  GRN],
              ["UNSUPPORTED",  unsupportedCount,                   AMB],
            ].map(([lbl, val, col]) => (
              <div key={lbl} style={{
                flex: 1, padding: "7px 4px", textAlign: "center",
                borderRight: `1px solid ${PRP}18`,
              }}>
                <div style={{ color: col, fontSize: 15, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "#6E8AA0", fontSize: 8, letterSpacing: 1 }}>{lbl}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ padding: "6px 14px", borderBottom: `1px solid ${PRP}18`,
            display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {["ALL", "TASKED", "UNSUPPORTED"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                fontSize: 8, padding: "2px 8px", borderRadius: 4,
                border: `1px solid ${tab === t ? PRP : "#2a3a4a"}`,
                background: tab === t ? `${PRP}22` : "transparent",
                color: tab === t ? PRP : "#566878",
                cursor: "pointer", fontFamily: "inherit", letterSpacing: 1,
              }}>{t}</button>
            ))}
            <input
              type="text" placeholder="search…" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                flex: 1, minWidth: 80, background: `${PRP}0A`, border: `1px solid ${PRP}33`,
                borderRadius: 4, color: "#DCEBF5", fontSize: 9,
                padding: "3px 7px", fontFamily: "inherit", outline: "none",
              }}
            />
          </div>

          {/* Body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px 14px" }}>
            {err && <div style={{ color: RED, fontSize: 11, padding: 8 }}>⚠ {err}</div>}
            {!loading && !err && visible.length === 0 && (
              <div style={{ color: "#6E8AA0", fontSize: 11, padding: 10 }}>No results.</div>
            )}

            {visible.map(inv => {
              const col = inv.tasked ? GRN : AMB;
              const isExp = expanded[inv.id];
              return (
                <div key={inv.id} style={{
                  marginBottom: 10,
                  background: `${col}08`,
                  border: `1px solid ${col}33`,
                  borderRadius: 8, padding: "10px 12px",
                }}>
                  <div
                    onClick={() => toggle(inv.id)}
                    style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <span style={{
                      fontSize: 8, color: col, border: `1px solid ${col}55`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1, flexShrink: 0,
                    }}>{inv.tasked ? "TASKED" : "UNSUPPORTED"}</span>
                    <span style={{ flex: 1, color: "#DCEBF5", fontSize: 11, fontWeight: 600,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {inv.title}
                    </span>
                    <span style={{ color: col, fontSize: 10, flexShrink: 0 }}>
                      {inv.matches.length} job{inv.matches.length !== 1 ? "s" : ""}
                    </span>
                    <span style={{ color: "#566878", fontSize: 10, flexShrink: 0 }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 8 }}>
                      {inv.matches.length === 0 ? (
                        <div style={{ color: "#566878", fontSize: 10, fontStyle: "italic" }}>
                          No correlated swarm jobs.
                        </div>
                      ) : inv.matches.map(j => (
                        <div key={j.id} style={{
                          marginTop: 6, padding: "7px 10px",
                          background: `${PRP}0A`, border: `1px solid ${PRP}22`,
                          borderRadius: 6,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <span style={{
                              fontSize: 8, color: statusColor(j.status),
                              border: `1px solid ${statusColor(j.status)}55`,
                              borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                            }}>{(j.status || "UNKNOWN").toUpperCase()}</span>
                            <span style={{ flex: 1, color: "#DCEBF5", fontSize: 10, fontWeight: 600,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {j.name}
                            </span>
                            <span style={{ color: GRN, fontSize: 9, flexShrink: 0 }}>
                              {(j.score * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div style={{ height: 3, background: "#1A2530", borderRadius: 2 }}>
                            <div style={{
                              height: 3, borderRadius: 2,
                              width: `${Math.min(100, j.score * 100)}%`,
                              background: GRN, boxShadow: `0 0 6px ${GRN}`,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "5px 14px", borderTop: `1px solid ${PRP}18`,
            display: "flex", justifyContent: "space-between", fontSize: 8, color: "#566878",
          }}>
            <span>Source: /entities/SwarmJob + /v1/investigations</span>
            <span style={{ color: loading ? AMB : GRN }}>
              {loading ? "◌ syncing" : `${correlated.length} invs · ${jobs.length} jobs`}
            </span>
          </div>
        </div>
      )}
      <style>{`@keyframes sjicpulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </>
  );
}
