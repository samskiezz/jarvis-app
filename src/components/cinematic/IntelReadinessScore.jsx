/**
 * IntelReadinessScore — F99 (KIRSCORE).
 *
 * Pulls /knowledge/ × /v1/investigations × /v1/scenario/list and synthesises
 * a single 0–100 "Intelligence Readiness Score" from three components:
 *
 *   KB FRESHNESS   — % of knowledge articles updated within the last 30 days
 *   INV COVERAGE   — % of open investigations that have at least one keyword-
 *                    matched knowledge article
 *   SCEN COVERAGE  — % of scenarios that have at least one keyword-matched
 *                    knowledge article
 *
 * Overall score = mean of the three components.
 * Colour: green ≥ 75 / amber 40–74 / red < 40.
 *
 * Layout:
 *   • 120 px SVG gauge ring (arc from 220° to –40°, driven by score)
 *   • 4 stat tiles: TOTAL KB / OPEN INV / SCENARIOS / SCORE
 *   • 3 component bars showing each sub-score and its driver count
 *   • ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence readiness brief + TTS
 *
 * Toggle:  ◈ KIRSCORE at left:977680, bottom:8, zIndex:123
 * Mounted: App.jsx
 * Wired:   JarvisBrain.jsx via isKirscoreQuery / buildKirscoreScript
 *
 * Voice: "kirscore" / "intelligence readiness" / "readiness score" /
 *        "intel readiness" / "knowledge readiness" / "readiness index"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const GREEN = "#00c878";
const AMBER = "#FFB347";
const RED   = "#FF3D5A";
const DIM   = "#1a2a38";

const BTN_LEFT   = 977680;
const REFRESH_MS = 120_000;
const STALE_DAYS = 30;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function normalise(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function ageMs(record) {
  const ts = record.updated_at || record.created_at || record.published_at || "";
  if (!ts) return Infinity;
  return Date.now() - new Date(ts).getTime();
}

function keywords(str) {
  if (!str) return [];
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 3);
}

function hasKbBacking(item, articles) {
  const title = item.title || item.name || item.description || "";
  const itemKw = keywords(title);
  if (itemKw.length === 0) return false;
  return articles.some(a => {
    const aKw = keywords(a.title || a.subject || a.name || "");
    return itemKw.some(k => aKw.includes(k));
  });
}

function scoreColor(s) {
  if (s >= 75) return GREEN;
  if (s >= 40) return AMBER;
  return RED;
}

// ── SVG gauge ring ────────────────────────────────────────────────────────────
function GaugeRing({ score, size = 120 }) {
  const r    = (size / 2) - 12;
  const cx   = size / 2;
  const cy   = size / 2;
  const col  = scoreColor(score);
  // arc from 220° clockwise to 320° total sweep (covers 320° of a circle).
  const startDeg = 220;
  const totalArc = 280;
  const pct    = Math.min(Math.max(score, 0), 100) / 100;
  const arcDeg = pct * totalArc;

  function polar(deg) {
    const rad = (deg - 90) * (Math.PI / 180);
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function arcPath(fromDeg, toDeg) {
    const s  = polar(fromDeg);
    const e  = polar(toDeg);
    const la = (toDeg - fromDeg) > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${la} 1 ${e.x} ${e.y}`;
  }

  const endDeg = startDeg + arcDeg;

  return (
    <svg width={size} height={size} style={{ display: "block", margin: "0 auto" }}>
      {/* track */}
      <path d={arcPath(startDeg, startDeg + totalArc)} fill="none" stroke={DIM} strokeWidth={10} />
      {/* filled arc */}
      {score > 0 && (
        <path
          d={arcPath(startDeg, endDeg)}
          fill="none"
          stroke={col}
          strokeWidth={10}
          strokeLinecap="round"
          style={{ transition: "all 0.7s ease" }}
        />
      )}
      {/* score text */}
      <text x={cx} y={cy - 4} textAnchor="middle" fill={col}
        style={{ fontSize: 28, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>
        {score}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#6E8AA0"
        style={{ fontSize: 9, letterSpacing: 2, fontFamily: "'JetBrains Mono',monospace" }}>
        / 100
      </text>
    </svg>
  );
}

// ── tile ──────────────────────────────────────────────────────────────────────
function tile(label, value, color) {
  return (
    <div style={{
      flex: "1 1 90px", background: "rgba(255,255,255,0.04)",
      border: `1px solid ${color}33`, borderRadius: 8,
      padding: "8px 10px", textAlign: "center",
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color, letterSpacing: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 2, marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ── component bar ─────────────────────────────────────────────────────────────
function ComponentBar({ label, score, detail, color }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 10, color, letterSpacing: 1 }}>{label}</span>
        <span style={{ fontSize: 10, color, fontWeight: 700 }}>{score}%</span>
      </div>
      <div style={{ background: DIM, borderRadius: 3, height: 10, position: "relative" }}>
        <div style={{
          width: `${score}%`, height: "100%", borderRadius: 3,
          background: color, opacity: 0.8, transition: "width 0.6s",
        }} />
      </div>
      {detail && (
        <div style={{ fontSize: 9, color: "#6E8AA0", marginTop: 3 }}>{detail}</div>
      )}
    </div>
  );
}

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isKirscoreQuery(q) {
  const t = q.toLowerCase();
  return (
    t.includes("kirscore") ||
    t.includes("intelligence readiness") ||
    t.includes("readiness score") ||
    t.includes("intel readiness") ||
    t.includes("knowledge readiness") ||
    t.includes("readiness index")
  );
}

export async function buildKirscoreScript() {
  try {
    const [kbRaw, invRaw, scRaw] = await Promise.all([
      fetch(`${apiBase()}/knowledge/`, { headers: authHdr() }).then(r => r.json()),
      fetch(`${apiBase()}/v1/investigations`, { headers: authHdr() }).then(r => r.json()),
      fetch(`${apiBase()}/v1/scenario/list`, { headers: authHdr() }).then(r => r.json()),
    ]);
    const articles = normalise(kbRaw);
    const invs     = normalise(invRaw).filter(i => (i.status || "").toLowerCase() === "open");
    const scens    = normalise(scRaw);
    const staleMs  = STALE_DAYS * 86_400_000;
    const freshKb  = articles.filter(a => ageMs(a) <= staleMs).length;
    const kbPct    = articles.length > 0 ? Math.round((freshKb / articles.length) * 100) : 0;
    const invBacked= invs.filter(i => hasKbBacking(i, articles)).length;
    const invPct   = invs.length > 0 ? Math.round((invBacked / invs.length) * 100) : 100;
    const scBacked = scens.filter(s => hasKbBacking(s, articles)).length;
    const scPct    = scens.length > 0 ? Math.round((scBacked / scens.length) * 100) : 100;
    const overall  = Math.round((kbPct + invPct + scPct) / 3);
    return (
      `Intelligence Readiness Score: ${overall}/100. ` +
      `KB freshness: ${kbPct}% (${freshKb}/${articles.length} articles updated within ${STALE_DAYS} days). ` +
      `Investigation KB coverage: ${invPct}% (${invBacked}/${invs.length} open investigations backed). ` +
      `Scenario KB coverage: ${scPct}% (${scBacked}/${scens.length} scenarios backed). ` +
      (overall < 40
        ? "Intelligence readiness is critical — immediate KB refresh and coverage action required."
        : overall < 75
        ? "Intelligence readiness is moderate — targeted improvements recommended."
        : "Intelligence readiness is healthy.")
    );
  } catch {
    return "Could not calculate intelligence readiness score.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function IntelReadinessScore() {
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [data,    setData]    = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [kbRaw, invRaw, scRaw] = await Promise.all([
        fetch(`${apiBase()}/knowledge/`, { headers: authHdr() }).then(r => r.json()),
        fetch(`${apiBase()}/v1/investigations`, { headers: authHdr() }).then(r => r.json()),
        fetch(`${apiBase()}/v1/scenario/list`, { headers: authHdr() }).then(r => r.json()),
      ]);
      const articles = normalise(kbRaw);
      const allInvs  = normalise(invRaw);
      const invs     = allInvs.filter(i => (i.status || "").toLowerCase() === "open");
      const scens    = normalise(scRaw);
      const staleMs  = STALE_DAYS * 86_400_000;
      const freshKb  = articles.filter(a => ageMs(a) <= staleMs).length;
      const kbPct    = articles.length > 0 ? Math.round((freshKb / articles.length) * 100) : 0;
      const invBacked= invs.filter(i => hasKbBacking(i, articles)).length;
      const invPct   = invs.length > 0 ? Math.round((invBacked / invs.length) * 100) : 100;
      const scBacked = scens.filter(s => hasKbBacking(s, articles)).length;
      const scPct    = scens.length > 0 ? Math.round((scBacked / scens.length) * 100) : 100;
      const overall  = Math.round((kbPct + invPct + scPct) / 3);
      setData({
        articles: articles.length,
        openInvs: invs.length,
        scenarios: scens.length,
        kbPct, freshKb,
        invPct, invBacked,
        scPct, scBacked,
        overall,
      });
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:kirscore-toggle", onToggle);
    return () => window.removeEventListener("jarvis:kirscore-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const score = data?.overall ?? 0;
  const col   = scoreColor(score);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Intelligence Readiness Score (KIRSCORE)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 123,
          background: "rgba(5,8,13,0.75)", border: `1px solid ${CY}55`,
          color: CY, padding: "4px 10px", borderRadius: 6, fontSize: 11,
          fontFamily: "'JetBrains Mono',monospace", cursor: "pointer",
          letterSpacing: 1.5, backdropFilter: "blur(4px)",
        }}>
        ◈ KIRSCORE
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 80, left: "50%", transform: "translateX(-50%)",
      width: "min(560px, 92vw)", zIndex: 900,
      background: "rgba(5,10,18,0.95)", border: `1px solid ${col}44`,
      borderRadius: 14, padding: "18px 20px", backdropFilter: "blur(12px)",
      boxShadow: `0 0 60px ${col}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <span style={{ color: col, fontWeight: 700, fontSize: 13, letterSpacing: 3 }}>
          ◈ INTELLIGENCE READINESS SCORE
        </span>
        <span style={{ marginLeft: 8, fontSize: 9, color: "#6E8AA0", letterSpacing: 2 }}>KIRSCORE</span>
        {loading && <span style={{ marginLeft: "auto", fontSize: 9, color: CY }}>LOADING…</span>}
        <button onClick={() => setOpen(false)} style={{
          marginLeft: loading ? 8 : "auto", background: "none", border: "none",
          color: "#6E8AA0", cursor: "pointer", fontSize: 16, padding: "0 4px",
        }}>✕</button>
      </div>

      {/* gauge + stat tiles */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <div style={{ flexShrink: 0 }}>
          <GaugeRing score={score} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          {tile("TOTAL KB",  data?.articles  ?? "—", CY)}
          {tile("OPEN INV",  data?.openInvs  ?? "—", AMBER)}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          {tile("SCENARIOS", data?.scenarios ?? "—", GREEN)}
          {tile("SCORE",     data ? `${score}` : "—", col)}
        </div>
      </div>

      {/* component bars */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 2, marginBottom: 10 }}>
          READINESS COMPONENTS
        </div>
        <ComponentBar
          label="KB FRESHNESS"
          score={data?.kbPct ?? 0}
          detail={data ? `${data.freshKb} of ${data.articles} articles updated within ${STALE_DAYS}d` : ""}
          color={scoreColor(data?.kbPct ?? 0)}
        />
        <ComponentBar
          label="INVESTIGATION COVERAGE"
          score={data?.invPct ?? 0}
          detail={data ? `${data.invBacked} of ${data.openInvs} open investigations KB-backed` : ""}
          color={scoreColor(data?.invPct ?? 0)}
        />
        <ComponentBar
          label="SCENARIO COVERAGE"
          score={data?.scPct ?? 0}
          detail={data ? `${data.scBacked} of ${data.scenarios} scenarios KB-backed` : ""}
          color={scoreColor(data?.scPct ?? 0)}
        />
      </div>

      {/* assess */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={async () => {
          const script = await buildKirscoreScript();
          window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { text: script } }));
        }} style={{
          background: col, color: "#000", border: "none", borderRadius: 6,
          padding: "6px 16px", cursor: "pointer", fontSize: 11, fontWeight: 700,
          letterSpacing: 1.5, fontFamily: "'JetBrains Mono',monospace",
        }}>▶ ASSESS</button>
      </div>
    </div>
  );
}
