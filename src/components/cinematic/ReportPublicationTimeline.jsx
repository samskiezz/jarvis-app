/**
 * ReportPublicationTimeline — F35.
 * Sources from /v1/reports (confirmed endpoint).
 * Groups reports by publication date (day buckets) and renders a sparkline
 * of daily volume over the last 30 days. Distinct from ReportCategoryBreakdown
 * (which shows distribution by category, not time).
 * "report timeline" / "publication rate" / "rptl" opens panel.
 * Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const PU   = "#A78BFA";
const AM   = "#F5A623";
const DIM  = "#3A4A55";
const MONO = "'JetBrains Mono','Courier New',monospace";
const SANS = "'Inter',system-ui,sans-serif";

const POLL_MS = 120_000;
const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const RPTL_RE = /\breport\s*(timeline|publication|publish|over\s*time|trend|history|when|date)\b|\bpublication\s*(rate|trend|timeline)\b|\brptl\b|\bwhen\s*(were|was)\s*report/i;
export function isRptlQuery(t) { return RPTL_RE.test(t || ""); }

function normArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["items", "results", "data", "reports", "records", "list"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function getDateStr(r) {
  const d = r.created_at || r.published_at || r.date || r.timestamp || r.created;
  if (!d) return null;
  try { return new Date(d).toISOString().slice(0, 10); } catch { return null; }
}

function buildBuckets(reports, days = 30) {
  const now   = new Date();
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    buckets.push({ date: d.toISOString().slice(0, 10), count: 0 });
  }
  const map = {};
  for (const b of buckets) map[b.date] = b;
  for (const r of reports) {
    const ds = getDateStr(r);
    if (ds && map[ds]) map[ds].count += 1;
  }
  return buckets;
}

function countThisWeek(reports) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  return reports.filter(r => {
    const d = getDateStr(r);
    return d && new Date(d) >= cutoff;
  }).length;
}

function countThisMonth(reports) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  return reports.filter(r => {
    const d = getDateStr(r);
    return d && new Date(d) >= cutoff;
  }).length;
}

function latestDate(reports) {
  const dates = reports.map(r => getDateStr(r)).filter(Boolean).sort();
  return dates[dates.length - 1] || null;
}

export async function buildRptlScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/reports`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) throw new Error("no data");
    const data = await r.json();
    const reports = normArray(data);
    if (!reports.length) return "Report Publication Timeline: no reports found.";
    const week   = countThisWeek(reports);
    const month  = countThisMonth(reports);
    const latest = latestDate(reports);
    const buckets = buildBuckets(reports);
    const maxDay  = Math.max(...buckets.map(b => b.count), 1);
    const avgDay  = (month / 30).toFixed(1);
    const trend   = buckets.slice(-7).reduce((s, b) => s + b.count, 0) >
                    buckets.slice(-14, -7).reduce((s, b) => s + b.count, 0)
                    ? "accelerating" : "steady or declining";
    return `Report Publication Timeline: ${reports.length} total reports. This week: ${week}. Past 30 days: ${month}. Average ${avgDay}/day. Peak day: ${maxDay} reports. Latest publication: ${latest || "unknown"}. Publication rate is ${trend}.`;
  } catch {
    return "Report Publication Timeline: unable to reach /v1/reports.";
  }
}

export default function ReportPublicationTimeline() {
  const [open, setOpen]         = useState(false);
  const [buckets, setBuckets]   = useState([]);
  const [total, setTotal]       = useState(0);
  const [week, setWeek]         = useState(0);
  const [month, setMonth]       = useState(0);
  const [latest, setLatest]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState("");
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`${apiBase()}/v1/reports`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const reports = normArray(data);
      setTotal(reports.length);
      setWeek(countThisWeek(reports));
      setMonth(countThisMonth(reports));
      setLatest(latestDate(reports));
      setBuckets(buildBuckets(reports));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Listen for toggle event from JarvisBrain
  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:rptl-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rptl-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const script = await buildRptlScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.text || d.content || d.answer || "No response.";
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setBrief("Unable to reach agent.");
    } finally {
      setAssessing(false);
    }
  }

  // Sparkline rendering
  const W = 296, H = 56, PAD = 4;
  const maxCount = Math.max(...buckets.map(b => b.count), 1);
  const sparkPoints = buckets.map((b, i) => {
    const x = PAD + (i / (buckets.length - 1 || 1)) * (W - PAD * 2);
    const y = H - PAD - (b.count / maxCount) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Report Publication Timeline (F35)"
        style={{
          position: "fixed", bottom: 8, left: 5540, zIndex: 85,
          background: open ? "rgba(167,139,250,0.15)" : "rgba(5,12,20,0.75)",
          border: `1px solid ${open ? PU : "rgba(167,139,250,0.2)"}`,
          color: PU, fontFamily: MONO, fontSize: 10, letterSpacing: 1.2,
          padding: "4px 8px", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(6px)",
        }}
      >
        ◷ RPTL{total > 0 && <span style={{ marginLeft: 5, opacity: 0.7 }}>{total}</span>}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 42, left: 5460, zIndex: 9500,
          width: 340, maxHeight: 480,
          background: "rgba(5,10,18,0.93)", backdropFilter: "blur(20px)",
          border: `1px solid rgba(167,139,250,0.18)`,
          borderTop: `2px solid ${PU}`,
          borderRadius: 12,
          boxShadow: "0 0 50px rgba(167,139,250,0.10), 0 20px 50px rgba(0,0,0,0.7)",
          display: "flex", flexDirection: "column",
          fontFamily: SANS,
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px 8px",
            borderBottom: "1px solid rgba(167,139,250,0.1)",
          }}>
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: PU }}>
              REPORT TIMELINE
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={assess}
                disabled={assessing || loading}
                style={{
                  background: "none", border: `1px solid ${CY}44`, color: CY,
                  fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: "2px 7px",
                  borderRadius: 4, cursor: "pointer",
                }}
              >
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none", border: "none", color: DIM,
                  fontFamily: MONO, fontSize: 14, cursor: "pointer", lineHeight: 1,
                }}
              >×</button>
            </div>
          </div>

          {/* Stats row */}
          {total > 0 && (
            <div style={{
              display: "flex", gap: 0, padding: "7px 14px",
              borderBottom: "1px solid rgba(167,139,250,0.07)",
            }}>
              <Stat label="TOTAL"    val={total}                    color={PU} />
              <Stat label="7 DAYS"   val={week}                     color={CY} />
              <Stat label="30 DAYS"  val={month}                    color={AM} />
              <Stat label="LATEST"   val={latest ? latest.slice(5) : "—"} color="#6E8AA0" />
            </div>
          )}

          {/* Body */}
          <div style={{ overflowY: "auto", padding: "10px 14px 12px", flex: 1 }}>
            {loading && (
              <div style={{ color: DIM, fontFamily: MONO, fontSize: 10, padding: 12, textAlign: "center" }}>
                ◌ LOADING…
              </div>
            )}
            {err && !loading && (
              <div style={{ color: "#f87171", fontFamily: MONO, fontSize: 10, padding: 12 }}>
                ✕ {err}
              </div>
            )}

            {!loading && !err && buckets.length > 0 && (
              <>
                {/* Sparkline */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: DIM, letterSpacing: 1.5, marginBottom: 4 }}>
                    DAILY VOLUME · LAST 30 DAYS
                  </div>
                  <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
                    {/* Grid line at half */}
                    <line
                      x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2}
                      stroke={`${PU}22`} strokeWidth={1} strokeDasharray="3,3"
                    />
                    {/* Area fill */}
                    <polyline
                      points={sparkPoints}
                      fill="none"
                      stroke={PU}
                      strokeWidth={1.5}
                      strokeLinejoin="round"
                    />
                    {/* Dots on peaks */}
                    {buckets.map((b, i) => {
                      if (b.count === 0) return null;
                      const x = PAD + (i / (buckets.length - 1 || 1)) * (W - PAD * 2);
                      const y = H - PAD - (b.count / maxCount) * (H - PAD * 2);
                      return (
                        <circle
                          key={i} cx={x} cy={y} r={b.count === maxCount ? 3 : 1.5}
                          fill={b.count === maxCount ? AM : PU}
                          style={{ opacity: 0.85 }}
                        />
                      );
                    })}
                  </svg>
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    fontFamily: MONO, fontSize: 8, color: DIM, marginTop: 2,
                  }}>
                    <span>{buckets[0]?.date.slice(5)}</span>
                    <span>peak {maxCount}/day</span>
                    <span>{buckets[buckets.length - 1]?.date.slice(5)}</span>
                  </div>
                </div>

                {/* Per-day table (last 7 days with non-zero) */}
                <div style={{ fontFamily: MONO, fontSize: 9, color: DIM, letterSpacing: 1.5, marginBottom: 6 }}>
                  RECENT ACTIVITY
                </div>
                {buckets.slice(-14).filter(b => b.count > 0).reverse().map(b => (
                  <div key={b.date} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "4px 0", borderBottom: "1px solid rgba(167,139,250,0.06)",
                  }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: "#8AAABF" }}>{b.date}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{
                        width: 60, height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden",
                      }}>
                        <div style={{
                          width: `${Math.round((b.count / maxCount) * 100)}%`,
                          height: "100%", background: PU, borderRadius: 2,
                        }} />
                      </div>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: PU, minWidth: 20, textAlign: "right" }}>
                        {b.count}
                      </span>
                    </div>
                  </div>
                ))}
                {buckets.slice(-14).filter(b => b.count > 0).length === 0 && (
                  <div style={{ fontFamily: MONO, fontSize: 10, color: DIM, padding: "6px 0" }}>
                    No reports in the last 14 days.
                  </div>
                )}
              </>
            )}

            {!loading && !err && buckets.length === 0 && (
              <div style={{ color: DIM, fontFamily: MONO, fontSize: 10, padding: 12, textAlign: "center" }}>
                No reports found.
              </div>
            )}

            {brief && (
              <div style={{
                marginTop: 10, padding: "8px 10px",
                background: "rgba(41,231,255,0.05)",
                border: "1px solid rgba(41,231,255,0.12)", borderRadius: 7,
                fontFamily: SANS, fontSize: 11, color: "#A0C8DC", lineHeight: 1.55,
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

function Stat({ label, val, color }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color }}>{val}</div>
      <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 1.5, color: DIM, marginTop: 1 }}>{label}</div>
    </div>
  );
}
