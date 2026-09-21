/**
 * IntelProfileConfidence — F36.
 * Sources from /entities/IntelProfile (confirmed endpoint).
 * Groups intel profiles by confidence tier (high / medium / low / unknown)
 * and renders confidence-scored bars, stat tiles, and a recency list of
 * the most-recently updated profiles.
 * Distinct from EntityQuickSearch (F08), which searches across entity types;
 * this is a persistent confidence-monitoring panel for the IntelProfile corpus.
 * "intel confidence" / "profile confidence" / "ipcnf" opens panel.
 * Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const GR   = "#00E5A0";
const AM   = "#F5A623";
const RD   = "#FF4C4C";
const PU   = "#A78BFA";
const DIM  = "#3A4A55";
const MONO = "'JetBrains Mono','Courier New',monospace";
const SANS = "'Inter',system-ui,sans-serif";

const POLL_MS  = 90_000;
const MAX_SHOW = 60;
const API_KEY  = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const IPCNF_RE = /\bintel\s*(confidence|profile\s*confidence|profile\s*score)\b|\bprofile\s*confidence\b|\bipcnf\b|\bconfidence\s*(tier|score|level|rating|map|dashboard)\b|\bwho\s*(has\s*high\s*confidence|is\s*high\s*confidence)\b/i;
export function isIpcnfQuery(t) { return IPCNF_RE.test(t || ""); }

function normArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["items", "results", "data", "profiles", "records", "list", "entities"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function getConfidence(p) {
  const raw = p.confidence ?? p.confidence_score ?? p.score ?? p.confidence_level ?? null;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const n = parseFloat(raw);
    if (!isNaN(n)) return n <= 1 ? n : n / 100;
  }
  const label = (p.confidence_tier || p.tier || p.level || "").toLowerCase();
  if (label === "high") return 0.85;
  if (label === "medium" || label === "med") return 0.55;
  if (label === "low") return 0.25;
  return null;
}

function tierOf(c) {
  if (c === null) return "unknown";
  if (c >= 0.75) return "high";
  if (c >= 0.45) return "medium";
  return "low";
}

const TIER_META = {
  high:    { col: GR,  label: "HIGH" },
  medium:  { col: AM,  label: "MEDIUM" },
  low:     { col: RD,  label: "LOW" },
  unknown: { col: DIM, label: "UNKNOWN" },
};

function getUpdatedAt(p) {
  const v = p.updated_at || p.created_at || p.last_seen || p.timestamp || p.modified;
  if (!v) return 0;
  try { return new Date(v).getTime(); } catch { return 0; }
}

function getName(p) {
  return p.name || p.full_name || p.alias || p.identifier || p.id || "Unknown";
}

export async function buildIpcnfScript() {
  try {
    const r = await fetch(`${apiBase()}/entities/IntelProfile`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) throw new Error("no data");
    const data     = await r.json();
    const profiles = normArray(data);
    if (!profiles.length) return "Intel Profile Confidence: no profiles found.";
    let high = 0, medium = 0, low = 0, unknown = 0;
    for (const p of profiles) {
      const t = tierOf(getConfidence(p));
      if (t === "high") high++;
      else if (t === "medium") medium++;
      else if (t === "low") low++;
      else unknown++;
    }
    const pct = (n) => Math.round((n / profiles.length) * 100);
    return `Intel Profile Confidence: ${profiles.length} total profiles. Confidence breakdown — high: ${high} (${pct(high)}%), medium: ${medium} (${pct(medium)}%), low: ${low} (${pct(low)}%), unknown: ${unknown} (${pct(unknown)}%). ${high < profiles.length * 0.3 ? "Majority of profiles are below high confidence — consider updating intelligence." : "Intelligence corpus is well-grounded."}`;
  } catch {
    return "Intel Profile Confidence: unable to reach /entities/IntelProfile.";
  }
}

export default function IntelProfileConfidence() {
  const [open, setOpen]         = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState("");
  const [filter, setFilter]     = useState("all");
  const [search, setSearch]     = useState("");
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`${apiBase()}/entities/IntelProfile`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const raw  = normArray(data).sort((a, b) => getUpdatedAt(b) - getUpdatedAt(a));
      setProfiles(raw);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:ipcnf-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ipcnf-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true); setBrief("");
    try {
      const script = await buildIpcnfScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const txt = d.response || d.message || d.text || script;
      setBrief(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const counts = { high: 0, medium: 0, low: 0, unknown: 0 };
  for (const p of profiles) counts[tierOf(getConfidence(p))]++;

  const filtered = profiles
    .filter(p => filter === "all" || tierOf(getConfidence(p)) === filter)
    .filter(p => {
      if (!search) return true;
      const q = search.toLowerCase();
      return getName(p).toLowerCase().includes(q)
        || (p.type || p.category || p.role || "").toLowerCase().includes(q)
        || (p.tags || []).join(" ").toLowerCase().includes(q);
    })
    .slice(0, MAX_SHOW);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: 6400, bottom: 8, zIndex: 87,
          background: "rgba(20,30,38,0.92)", border: `1px solid ${PU}44`,
          borderRadius: 6, color: PU, fontFamily: MONO, fontSize: 10,
          padding: "4px 8px", cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ◎ IPCNF
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 44, left: "50%", transform: "translateX(-50%)",
      width: 720, maxHeight: "72vh", background: "rgba(10,18,24,0.97)",
      border: `1px solid ${PU}55`, borderRadius: 12, zIndex: 8700,
      display: "flex", flexDirection: "column", overflow: "hidden",
      boxShadow: `0 0 32px ${PU}22`,
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px 8px", borderBottom: `1px solid ${DIM}`,
        fontFamily: MONO, fontSize: 11, color: PU, flexShrink: 0,
      }}>
        <span>◎ INTEL PROFILE CONFIDENCE</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: assessing ? DIM : `${PU}22`,
              border: `1px solid ${PU}44`, borderRadius: 4,
              color: PU, fontFamily: MONO, fontSize: 10, padding: "3px 9px", cursor: "pointer",
            }}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "none", border: "none", color: "#888",
              fontFamily: MONO, fontSize: 13, cursor: "pointer", lineHeight: 1,
            }}
          >✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{
        display: "flex", gap: 10, padding: "8px 16px",
        borderBottom: `1px solid ${DIM}`, flexShrink: 0,
      }}>
        {[
          { label: "TOTAL",   value: profiles.length, col: PU },
          { label: "HIGH",    value: counts.high,     col: GR },
          { label: "MEDIUM",  value: counts.medium,   col: AM },
          { label: "LOW",     value: counts.low,      col: RD },
          { label: "UNKNOWN", value: counts.unknown,  col: "#666" },
        ].map(({ label, value, col }) => (
          <div key={label} style={{
            flex: 1, textAlign: "center", padding: "6px 4px",
            background: `${col}11`, border: `1px solid ${col}33`, borderRadius: 6,
          }}>
            <div style={{ fontFamily: MONO, fontSize: 16, color: col, fontWeight: 700 }}>
              {loading ? "…" : value}
            </div>
            <div style={{ fontFamily: SANS, fontSize: 9, color: "#888", marginTop: 2 }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Confidence distribution bar */}
      {profiles.length > 0 && (
        <div style={{
          display: "flex", height: 12, margin: "8px 16px 4px",
          borderRadius: 6, overflow: "hidden", flexShrink: 0,
        }}>
          {["high", "medium", "low", "unknown"].map(tier => {
            const pct = profiles.length ? (counts[tier] / profiles.length) * 100 : 0;
            return pct > 0 ? (
              <div
                key={tier}
                title={`${TIER_META[tier].label}: ${counts[tier]}`}
                style={{ width: `${pct}%`, background: TIER_META[tier].col, opacity: 0.8 }}
              />
            ) : null;
          })}
        </div>
      )}

      {/* Filter + search */}
      <div style={{
        display: "flex", gap: 6, padding: "6px 16px 4px",
        borderBottom: `1px solid ${DIM}`, flexShrink: 0, alignItems: "center",
      }}>
        {["all", "high", "medium", "low", "unknown"].map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? `${(TIER_META[t] || { col: PU }).col}22` : "none",
              border: `1px solid ${filter === t ? (TIER_META[t] || { col: PU }).col : DIM}`,
              borderRadius: 4,
              color: filter === t ? (TIER_META[t] || { col: PU }).col : "#888",
              fontFamily: MONO, fontSize: 9, padding: "2px 7px", cursor: "pointer",
            }}
          >
            {t.toUpperCase()}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search name…"
          style={{
            marginLeft: "auto", background: "rgba(255,255,255,0.04)",
            border: `1px solid ${DIM}`, borderRadius: 4,
            color: "#ccc", fontFamily: MONO, fontSize: 10,
            padding: "2px 8px", outline: "none", width: 140,
          }}
        />
      </div>

      {/* Profile list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 16px" }}>
        {err && (
          <div style={{ color: RD, fontFamily: MONO, fontSize: 11, padding: "8px 0" }}>
            {err}
          </div>
        )}
        {!err && !loading && filtered.length === 0 && (
          <div style={{ color: "#555", fontFamily: MONO, fontSize: 11, padding: "8px 0" }}>
            No profiles.
          </div>
        )}
        {filtered.map((p, i) => {
          const conf  = getConfidence(p);
          const tier  = tierOf(conf);
          const meta  = TIER_META[tier];
          const pct   = conf !== null ? Math.round(conf * 100) : null;
          const name  = getName(p);
          const role  = p.type || p.role || p.category || p.entity_type || "";
          const ts    = getUpdatedAt(p);
          const label = ts ? new Date(ts).toLocaleDateString() : "";
          return (
            <div key={i} style={{
              display: "flex", gap: 10, alignItems: "center",
              padding: "7px 0",
              borderBottom: i < filtered.length - 1 ? `1px solid ${DIM}44` : "none",
            }}>
              {/* Confidence bar */}
              <div style={{ width: 64, flexShrink: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontFamily: MONO, fontSize: 8, color: meta.col }}>
                    {meta.label}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 8, color: "#666" }}>
                    {pct !== null ? `${pct}%` : "?"}
                  </span>
                </div>
                <div style={{ height: 4, background: DIM, borderRadius: 2 }}>
                  <div style={{
                    height: "100%", borderRadius: 2,
                    width: `${pct ?? 0}%`,
                    background: meta.col, opacity: 0.85,
                  }} />
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: SANS, fontSize: 12, color: "#ddd",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {name}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                  {role && <span style={{ fontFamily: MONO, fontSize: 9, color: "#666" }}>{role}</span>}
                  {label && <span style={{ fontFamily: MONO, fontSize: 9, color: "#555" }}>{label}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Brief output */}
      {brief && (
        <div style={{
          padding: "8px 16px", borderTop: `1px solid ${DIM}`,
          fontFamily: SANS, fontSize: 11, color: GR, flexShrink: 0,
        }}>
          {brief}
        </div>
      )}
    </div>
  );
}
