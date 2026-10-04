/**
 * KnowledgeFreshnessTracker — F54.
 * Polls /knowledge/ → classifies each article by age of updated_at / created_at:
 *   FRESH   — updated ≤ 7 days ago
 *   AGING   — 8–30 days
 *   STALE   — 31–90 days
 *   EXPIRED — > 90 days
 * Stat tiles: TOTAL / FRESH / AGING / STALE / EXPIRED.
 * Filter tabs + text search. Age-sorted list with staleness badge.
 * ▶ ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts.
 * ◈ KFRESH button left:939840 bottom:8 zIndex:637.
 * Voice: "knowledge freshness"/"stale knowledge"/"knowledge age"/"kfresh"/"expired knowledge".
 * 120-s auto-refresh. Additive only — mounted via App.jsx.
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
const REFRESH_MS = 120_000;
const BTN_LEFT   = 939840;
const Z          = 637;

const KFRESH_RE =
  /\bkfresh\b|knowledge\s+fresh|stale\s+knowledge|knowledge\s+age|expired\s+knowledge|knowledge\s+decay|knowledge\s+staleness|outdated\s+knowledge|fresh\s+knowledge/i;

export function isKfreshQuery(text) {
  return KFRESH_RE.test(text || "");
}

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function ageCategory(dateStr) {
  if (!dateStr) return "EXPIRED";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "EXPIRED";
  const daysSince = (Date.now() - d.getTime()) / 86_400_000;
  if (daysSince <= 7)  return "FRESH";
  if (daysSince <= 30) return "AGING";
  if (daysSince <= 90) return "STALE";
  return "EXPIRED";
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

async function fetchArticles() {
  const r = await fetch(`${apiBase()}/knowledge/`, { headers: authHdr() });
  if (!r.ok) throw new Error(`knowledge/ ${r.status}`);
  const raw = await r.json();
  const arr = Array.isArray(raw) ? raw : (raw.items ?? raw.results ?? raw.data ?? []);
  return arr.map((a) => {
    const ts = a.updated_at || a.updatedAt || a.created_at || a.createdAt || a.date || null;
    return {
      id:       a.id ?? a._id ?? Math.random().toString(36).slice(2),
      title:    a.title || a.name || "(untitled)",
      kind:     a.kind || a.category || a.type || "article",
      ts,
      category: ageCategory(ts),
      ageLabel: ageLabel(ts),
    };
  });
}

export async function buildKfreshScript() {
  try {
    const arts = await fetchArticles();
    const fresh   = arts.filter((a) => a.category === "FRESH").length;
    const aging   = arts.filter((a) => a.category === "AGING").length;
    const stale   = arts.filter((a) => a.category === "STALE").length;
    const expired = arts.filter((a) => a.category === "EXPIRED").length;
    const pct = arts.length ? Math.round((fresh / arts.length) * 100) : 0;
    const base = apiBase();
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...authHdr(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Knowledge freshness report: ${arts.length} articles total — ${fresh} fresh (≤7 days), ${aging} aging (8-30 days), ${stale} stale (31-90 days), ${expired} expired (>90 days). Freshness rate: ${pct}%. Give a two-sentence operational assessment of knowledge maintenance and which decay tier requires immediate attention.`,
      }),
    });
    if (r.ok) {
      const d = await r.json();
      return d.response || d.answer || d.text ||
        `Knowledge base: ${arts.length} articles — ${fresh} fresh, ${stale} stale, ${expired} expired.`;
    }
  } catch { /* fall through */ }
  try {
    const arts = await fetchArticles();
    const fresh   = arts.filter((a) => a.category === "FRESH").length;
    const expired = arts.filter((a) => a.category === "EXPIRED").length;
    return `Knowledge freshness: ${arts.length} articles. ${fresh} are current; ${expired} have expired. Maintenance recommended.`;
  } catch {
    return "Knowledge freshness data unavailable.";
  }
}

const CAT_COLOR = { FRESH: GR, AGING: CY, STALE: AM, EXPIRED: RD };
const TABS      = ["ALL", "FRESH", "AGING", "STALE", "EXPIRED"];

export default function KnowledgeFreshnessTracker() {
  const [open,    setOpen]    = useState(false);
  const [arts,    setArts]    = useState([]);
  const [tab,     setTab]     = useState("ALL");
  const [search,  setSearch]  = useState("");
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const data = await fetchArticles();
      data.sort((a, b) => {
        const order = { EXPIRED: 0, STALE: 1, AGING: 2, FRESH: 3 };
        return (order[a.category] ?? 4) - (order[b.category] ?? 4);
      });
      setArts(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen((o) => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:kfresh-toggle", onToggle);
    return () => window.removeEventListener("jarvis:kfresh-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true); setAssessText("");
    try {
      const script = await buildKfreshScript();
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

  const fresh   = arts.filter((a) => a.category === "FRESH").length;
  const aging   = arts.filter((a) => a.category === "AGING").length;
  const stale   = arts.filter((a) => a.category === "STALE").length;
  const expired = arts.filter((a) => a.category === "EXPIRED").length;

  const visible = arts.filter((a) => {
    if (tab !== "ALL" && a.category !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return a.title.toLowerCase().includes(q) || a.kind.toLowerCase().includes(q);
    }
    return true;
  });

  const tile = (label, val, col) => (
    <div key={label} style={{ textAlign: "center", minWidth: 72 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: col, letterSpacing: 1 }}>{val}</div>
      <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );

  const catBadge = (cat) => (
    <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4,
      background: `${CAT_COLOR[cat]}22`, color: CAT_COLOR[cat],
      border: `1px solid ${CAT_COLOR[cat]}55`, letterSpacing: 1, fontWeight: 700 }}>
      {cat}
    </span>
  );

  if (!open) return (
    <button
      onClick={() => { setOpen(true); load(); }}
      title="Knowledge Freshness Tracker"
      style={{
        position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z,
        padding: "3px 9px", borderRadius: 5, cursor: "pointer",
        background: "rgba(0,10,20,0.7)", border: `1px solid ${GR}55`,
        color: GR, fontFamily: MN, fontSize: 10, letterSpacing: 1,
        boxShadow: `0 0 8px ${GR}33`,
      }}>
      ◈ KFRESH
    </button>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: Z, display: "flex",
      alignItems: "center", justifyContent: "center",
      background: "rgba(0,5,12,0.82)", backdropFilter: "blur(6px)",
    }}>
      <div style={{
        width: "min(780px,96vw)", maxHeight: "88vh", display: "flex", flexDirection: "column",
        background: BG, border: `1px solid ${GR}44`, borderRadius: 16, overflow: "hidden",
        boxShadow: `0 0 60px ${GR}18`, fontFamily: MN,
      }}>
        {/* header */}
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${GR}22`,
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ color: GR, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>
            ◈ KNOWLEDGE FRESHNESS
          </span>
          {loading && <span style={{ color: "#6E8AA0", fontSize: 10 }}>refreshing…</span>}
          {err    && <span style={{ color: RD, fontSize: 10 }}>⚠ {err}</span>}
          <button onClick={assess} disabled={assessing}
            style={{ marginLeft: "auto", padding: "3px 10px", borderRadius: 5, cursor: "pointer",
              background: assessing ? "#1a2a1a" : `${GR}22`, border: `1px solid ${GR}55`,
              color: GR, fontFamily: MN, fontSize: 10 }}>
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button onClick={() => setOpen(false)}
            style={{ padding: "3px 8px", borderRadius: 5, cursor: "pointer",
              background: "transparent", border: `1px solid #334`,
              color: "#6E8AA0", fontFamily: MN, fontSize: 11 }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 24, padding: "12px 18px",
          borderBottom: `1px solid ${GR}18`, flexWrap: "wrap" }}>
          {tile("TOTAL",   arts.length, CY)}
          {tile("FRESH",   fresh,   GR)}
          {tile("AGING",   aging,   CY)}
          {tile("STALE",   stale,   AM)}
          {tile("EXPIRED", expired, RD)}
        </div>

        {/* assess output */}
        {assessText && (
          <div style={{ margin: "8px 18px", padding: "8px 12px", borderRadius: 8,
            background: `${GR}11`, border: `1px solid ${GR}33`,
            color: "#DCEBF5", fontSize: 12, lineHeight: 1.5 }}>
            {assessText}
          </div>
        )}

        {/* filter tabs + search */}
        <div style={{ display: "flex", gap: 6, padding: "8px 18px",
          borderBottom: `1px solid ${GR}18`, flexWrap: "wrap", alignItems: "center" }}>
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: "2px 10px", borderRadius: 4, cursor: "pointer",
                background: tab === t ? `${CAT_COLOR[t] || GR}22` : "transparent",
                border: `1px solid ${tab === t ? (CAT_COLOR[t] || GR) : "#334"}`,
                color: tab === t ? (CAT_COLOR[t] || GR) : "#6E8AA0",
                fontFamily: MN, fontSize: 10 }}>
              {t}
            </button>
          ))}
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="search title / kind…"
            style={{ marginLeft: "auto", padding: "3px 10px", borderRadius: 5,
              background: "rgba(0,20,40,0.8)", border: `1px solid ${GR}33`,
              color: "#DCEBF5", fontFamily: MN, fontSize: 11, width: 180,
              outline: "none" }} />
        </div>

        {/* article list */}
        <div style={{ overflowY: "auto", flex: 1, padding: "8px 18px" }}>
          {visible.length === 0 && !loading && (
            <div style={{ color: "#6E8AA0", fontSize: 12, padding: "24px 0", textAlign: "center" }}>
              {err ? "Load failed." : "No articles match."}
            </div>
          )}
          {visible.map((a) => (
            <div key={a.id} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "7px 0", borderBottom: `1px solid ${GR}11`,
            }}>
              {/* staleness pulse for expired */}
              <span style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: CAT_COLOR[a.category],
                boxShadow: a.category === "EXPIRED" ? `0 0 8px ${RD}` : "none",
                animation: a.category === "EXPIRED"
                  ? "kfpulse 1.4s ease-in-out infinite" : "none",
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#DCEBF5", fontSize: 12, fontWeight: 600,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {a.title}
                </div>
                <div style={{ fontSize: 10, color: "#6E8AA0", marginTop: 2 }}>
                  {a.kind} · {a.ageLabel}
                </div>
              </div>
              {catBadge(a.category)}
            </div>
          ))}
        </div>

        <div style={{ padding: "6px 18px", borderTop: `1px solid ${GR}18`,
          fontSize: 10, color: "#4A5568", letterSpacing: 1 }}>
          {visible.length} of {arts.length} · auto-refresh 120 s · /knowledge/
        </div>
      </div>
      <style>{`@keyframes kfpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.5)}}`}</style>
    </div>
  );
}
