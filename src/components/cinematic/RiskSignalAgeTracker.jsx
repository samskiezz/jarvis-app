/**
 * RiskSignalAgeTracker — F55.
 * Polls /entities/RiskSignal → classifies each signal by age of created_at / updated_at:
 *   FRESH   — ≤ 1 day
 *   RECENT  — 2–7 days
 *   AGING   — 8–30 days
 *   STALE   — > 30 days
 * Stat tiles: TOTAL / FRESH / RECENT / AGING / STALE.
 * Severity × age matrix — critical + stale signals pulse red (blind spots).
 * Filter tabs + text search + severity filter. Age-sorted list.
 * ▶ ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts.
 * ◈ RSKAGE button left:940700 bottom:8 zIndex:638.
 * Voice: "risk age"/"stale risk"/"risk decay"/"rskage"/"risk freshness"/"aged signals"/"stale signals".
 * 90-s auto-refresh. Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const GR  = "#4ADE80";
const AM  = "#F59E0B";
const RD  = "#EF4444";
const PU  = "#A78BFA";
const BG  = "rgba(0,10,20,0.96)";
const MN  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT   = 940700;
const Z          = 638;

const RSKAGE_RE =
  /\brskage\b|risk\s+age|stale\s+risk|risk\s+decay|risk\s+freshness|aged\s+signal|stale\s+signal|old\s+risk|risk\s+staleness|outdated\s+risk/i;

export function isRskageQuery(text) {
  return RSKAGE_RE.test(text || "");
}

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function ageCategory(dateStr) {
  if (!dateStr) return "STALE";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "STALE";
  const daysSince = (Date.now() - d.getTime()) / 86_400_000;
  if (daysSince <= 1)  return "FRESH";
  if (daysSince <= 7)  return "RECENT";
  if (daysSince <= 30) return "AGING";
  return "STALE";
}

function ageLabel(dateStr) {
  if (!dateStr) return "unknown age";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "invalid date";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30)  return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

async function fetchSignals() {
  const r = await fetch(`${apiBase()}/entities/RiskSignal`, { headers: authHdr() });
  if (!r.ok) throw new Error(`/entities/RiskSignal ${r.status}`);
  const raw = await r.json();
  const arr = Array.isArray(raw) ? raw : (raw.items ?? raw.results ?? raw.data ?? []);
  return arr.map((s) => {
    const ts = s.updated_at || s.updatedAt || s.created_at || s.createdAt || s.date || null;
    const sev = (s.severity || s.level || s.priority || "unknown").toLowerCase();
    return {
      id:       s.id ?? s._id ?? Math.random().toString(36).slice(2),
      title:    s.title || s.name || s.signal || "(untitled)",
      severity: sev,
      ts,
      category: ageCategory(ts),
      ageLabel: ageLabel(ts),
    };
  });
}

export async function buildRskageScript() {
  try {
    const sigs = await fetchSignals();
    const fresh  = sigs.filter((s) => s.category === "FRESH").length;
    const recent = sigs.filter((s) => s.category === "RECENT").length;
    const aging  = sigs.filter((s) => s.category === "AGING").length;
    const stale  = sigs.filter((s) => s.category === "STALE").length;
    const staleCrit = sigs.filter(
      (s) => s.category === "STALE" && (s.severity === "critical" || s.severity === "high")
    ).length;
    const base = apiBase();
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...authHdr(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Risk signal age report: ${sigs.length} total signals — ${fresh} fresh (≤1 day), ${recent} recent (2-7 days), ${aging} aging (8-30 days), ${stale} stale (>30 days). ${staleCrit} stale critical/high severity signals represent unresolved blind spots. Give a two-sentence operational assessment of risk currency and which stale signals require immediate attention or escalation.`,
      }),
    });
    if (r.ok) {
      const d = await r.json();
      return d.response || d.answer || d.text ||
        `Risk signals: ${sigs.length} total — ${fresh} fresh, ${stale} stale. ${staleCrit} stale high-severity signals detected.`;
    }
  } catch { /* fall through */ }
  try {
    const sigs = await fetchSignals();
    const fresh = sigs.filter((s) => s.category === "FRESH").length;
    const stale = sigs.filter((s) => s.category === "STALE").length;
    const staleCrit = sigs.filter(
      (s) => s.category === "STALE" && (s.severity === "critical" || s.severity === "high")
    ).length;
    return `Risk signal age: ${sigs.length} signals. ${fresh} are current; ${stale} have gone stale including ${staleCrit} high-severity items. Review recommended.`;
  } catch {
    return "Risk signal age data unavailable.";
  }
}

const AGE_COLOR = { FRESH: GR, RECENT: CY, AGING: AM, STALE: RD };
const SEV_COLOR = { critical: RD, high: AM, medium: CY, low: GR, unknown: PU };
const TABS = ["ALL", "FRESH", "RECENT", "AGING", "STALE"];

export default function RiskSignalAgeTracker() {
  const [open,      setOpen]      = useState(false);
  const [signals,   setSignals]   = useState([]);
  const [tab,       setTab]       = useState("ALL");
  const [sevFilter, setSevFilter] = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const data = await fetchSignals();
      data.sort((a, b) => {
        const order = { STALE: 0, AGING: 1, RECENT: 2, FRESH: 3 };
        const sevOrder = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };
        const ageDiff = (order[a.category] ?? 4) - (order[b.category] ?? 4);
        if (ageDiff !== 0) return ageDiff;
        return (sevOrder[a.severity] ?? 4) - (sevOrder[b.severity] ?? 4);
      });
      setSignals(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen((o) => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:rskage-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rskage-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true); setAssessText("");
    try {
      const script = await buildRskageScript();
      setAssessText(script);
      const voice = getActiveVoice?.() || "ash";
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: script, voice }),
      });
    } catch { setAssessText("Assessment unavailable."); }
    setAssessing(false);
  }

  const fresh  = signals.filter((s) => s.category === "FRESH").length;
  const recent = signals.filter((s) => s.category === "RECENT").length;
  const aging  = signals.filter((s) => s.category === "AGING").length;
  const stale  = signals.filter((s) => s.category === "STALE").length;
  const staleCrit = signals.filter(
    (s) => s.category === "STALE" && (s.severity === "critical" || s.severity === "high")
  ).length;

  const sevOptions = ["ALL", ...Array.from(new Set(signals.map((s) => s.severity)))
    .filter(Boolean).sort()];

  const visible = signals.filter((s) => {
    if (tab !== "ALL" && s.category !== tab) return false;
    if (sevFilter !== "ALL" && s.severity !== sevFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.title.toLowerCase().includes(q) || s.severity.toLowerCase().includes(q);
    }
    return true;
  });

  const tile = (label, val, col, pulse) => (
    <div key={label} style={{ textAlign: "center", minWidth: 72 }}>
      <div style={{
        fontSize: 20, fontWeight: 700, color: col, letterSpacing: 1,
        animation: pulse && val > 0 ? "rskpulse 1.4s ease-in-out infinite" : "none",
      }}>{val}</div>
      <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );

  const ageBadge = (cat) => (
    <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4,
      background: `${AGE_COLOR[cat]}22`, color: AGE_COLOR[cat],
      border: `1px solid ${AGE_COLOR[cat]}55`, letterSpacing: 1, fontWeight: 700 }}>
      {cat}
    </span>
  );

  const sevBadge = (sev) => (
    <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3,
      background: `${SEV_COLOR[sev] || PU}18`, color: SEV_COLOR[sev] || PU,
      border: `1px solid ${SEV_COLOR[sev] || PU}44`, letterSpacing: 1 }}>
      {sev}
    </span>
  );

  if (!open) return (
    <button
      onClick={() => { setOpen(true); load(); }}
      title="Risk Signal Age & Decay Tracker"
      style={{
        position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z,
        padding: "3px 9px", borderRadius: 5, cursor: "pointer",
        background: "rgba(0,10,20,0.7)", border: `1px solid ${RD}55`,
        color: RD, fontFamily: MN, fontSize: 10, letterSpacing: 1,
        boxShadow: `0 0 8px ${RD}33`,
        animation: staleCrit > 0 ? "rskpulse 2s ease-in-out infinite" : "none",
      }}>
      ◈ RSKAGE
    </button>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: Z, display: "flex",
      alignItems: "center", justifyContent: "center",
      background: "rgba(0,5,12,0.82)", backdropFilter: "blur(6px)",
    }}>
      <div style={{
        width: "min(800px,96vw)", maxHeight: "88vh", display: "flex", flexDirection: "column",
        background: BG, border: `1px solid ${RD}44`, borderRadius: 16, overflow: "hidden",
        boxShadow: `0 0 60px ${RD}18`, fontFamily: MN,
      }}>
        {/* header */}
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${RD}22`,
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ color: RD, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>
            ◈ RISK SIGNAL AGE
          </span>
          {staleCrit > 0 && (
            <span style={{ fontSize: 10, color: RD, letterSpacing: 1,
              animation: "rskpulse 1.4s ease-in-out infinite" }}>
              ⚠ {staleCrit} STALE HIGH-SEV
            </span>
          )}
          {loading && <span style={{ color: "#6E8AA0", fontSize: 10 }}>refreshing…</span>}
          {err    && <span style={{ color: RD, fontSize: 10 }}>⚠ {err}</span>}
          <button onClick={assess} disabled={assessing}
            style={{ marginLeft: "auto", padding: "3px 10px", borderRadius: 5, cursor: "pointer",
              background: assessing ? "#2a1a1a" : `${RD}22`, border: `1px solid ${RD}55`,
              color: RD, fontFamily: MN, fontSize: 10 }}>
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button onClick={() => setOpen(false)}
            style={{ padding: "3px 8px", borderRadius: 5, cursor: "pointer",
              background: "transparent", border: `1px solid #334`,
              color: "#6E8AA0", fontFamily: MN, fontSize: 11 }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 24, padding: "12px 18px",
          borderBottom: `1px solid ${RD}18`, flexWrap: "wrap" }}>
          {tile("TOTAL",      signals.length, CY,  false)}
          {tile("FRESH",      fresh,          GR,  false)}
          {tile("RECENT",     recent,         CY,  false)}
          {tile("AGING",      aging,          AM,  false)}
          {tile("STALE",      stale,          RD,  true)}
          {staleCrit > 0 && tile("STALE CRIT", staleCrit, RD, true)}
        </div>

        {/* assess output */}
        {assessText && (
          <div style={{ margin: "8px 18px", padding: "8px 12px", borderRadius: 8,
            background: `${RD}11`, border: `1px solid ${RD}33`,
            color: "#DCEBF5", fontSize: 12, lineHeight: 1.5 }}>
            {assessText}
          </div>
        )}

        {/* filter tabs + severity + search */}
        <div style={{ display: "flex", gap: 6, padding: "8px 18px",
          borderBottom: `1px solid ${RD}18`, flexWrap: "wrap", alignItems: "center" }}>
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: "2px 10px", borderRadius: 4, cursor: "pointer",
                background: tab === t ? `${AGE_COLOR[t] || RD}22` : "transparent",
                border: `1px solid ${tab === t ? (AGE_COLOR[t] || RD) : "#334"}`,
                color: tab === t ? (AGE_COLOR[t] || RD) : "#6E8AA0",
                fontFamily: MN, fontSize: 10 }}>
              {t}
            </button>
          ))}
          <div style={{ width: 1, height: 16, background: "#334", margin: "0 4px" }} />
          {sevOptions.map((s) => (
            <button key={s} onClick={() => setSevFilter(s)}
              style={{ padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                background: sevFilter === s ? `${SEV_COLOR[s] || PU}22` : "transparent",
                border: `1px solid ${sevFilter === s ? (SEV_COLOR[s] || PU) : "#334"}`,
                color: sevFilter === s ? (SEV_COLOR[s] || PU) : "#6E8AA0",
                fontFamily: MN, fontSize: 9 }}>
              {s}
            </button>
          ))}
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="search title / severity…"
            style={{ marginLeft: "auto", padding: "3px 10px", borderRadius: 5,
              background: "rgba(0,20,40,0.8)", border: `1px solid ${RD}33`,
              color: "#DCEBF5", fontFamily: MN, fontSize: 11, width: 190,
              outline: "none" }} />
        </div>

        {/* signal list */}
        <div style={{ overflowY: "auto", flex: 1, padding: "8px 18px" }}>
          {visible.length === 0 && !loading && (
            <div style={{ color: "#6E8AA0", fontSize: 12, padding: "24px 0", textAlign: "center" }}>
              {err ? "Load failed." : "No signals match."}
            </div>
          )}
          {visible.map((s) => {
            const isBlindSpot = s.category === "STALE" &&
              (s.severity === "critical" || s.severity === "high");
            return (
              <div key={s.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "7px 0", borderBottom: `1px solid ${RD}11`,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: AGE_COLOR[s.category],
                  boxShadow: isBlindSpot ? `0 0 10px ${RD}` : "none",
                  animation: isBlindSpot ? "rskpulse 1.2s ease-in-out infinite" : "none",
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: isBlindSpot ? "#FFCCCC" : "#DCEBF5",
                    fontSize: 12, fontWeight: isBlindSpot ? 700 : 600,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {s.title}
                  </div>
                  <div style={{ fontSize: 10, color: "#6E8AA0", marginTop: 2 }}>
                    {s.ageLabel}
                    {isBlindSpot && (
                      <span style={{ marginLeft: 8, color: RD, fontWeight: 700 }}>
                        ⚠ BLIND SPOT
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {sevBadge(s.severity)}
                  {ageBadge(s.category)}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "6px 18px", borderTop: `1px solid ${RD}18`,
          fontSize: 10, color: "#4A5568", letterSpacing: 1 }}>
          {visible.length} of {signals.length} · auto-refresh 90 s · /entities/RiskSignal
        </div>
      </div>
      <style>{`@keyframes rskpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.5)}}`}</style>
    </div>
  );
}
