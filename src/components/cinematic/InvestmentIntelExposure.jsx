/**
 * F194 — Investment × Intel Profile Exposure (INVINTEL)
 *
 * Parallel-fetches /entities/Investment + /entities/IntelProfile, then
 * keyword-correlates each investment (name/sector/notes/tags) against
 * tracked threat actors (name/category/description/aliases/tags) to surface:
 *   EXPOSED — at least one intel profile keyword-matches the investment
 *              (potential threat actor / sector association detected)
 *   CLEAR   — no intel profile alignment detected for this investment
 *
 * Stat tiles: investments / intel profiles / exposed / clear
 * Filter tabs: ALL | EXPOSED | CLEAR
 * Expand any investment → matched intel profiles with category badge + relevance score.
 * Red badge on EXPOSED count.
 * ▶ ASSESS: 2-sentence investment threat exposure brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ INVINTEL  at bottom:8 left:70200, zIndex:135.
 * Event:   jarvis:invintel-toggle
 * Voice:   "investment intel / intel investment / invintel /
 *           investment threat actor / portfolio threat exposure /
 *           which investments have threat actors / exposed investments /
 *           investment profile exposure / threat actor investment"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 70200;
const POLL_MS  = 90_000;
const RED      = "#EF4444";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ───────────────────────────────────────────────────

const INVINTEL_RE =
  /\b(investment\s+intel(ligence)?|intel(ligence)?\s+investment|invintel|investment\s+threat\s+actor|portfolio\s+threat\s+(exposure|actor)|which\s+investments?\s+(have|lack)\s+(threat|intel)|exposed\s+investment|investment\s+profile\s+exposure|threat\s+actor\s+investment|actor\s+portfolio)\b/i;

export function isInvintelQuery(q) { return INVINTEL_RE.test(q); }

export async function buildInvintelScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [invRes, intelRes] = await Promise.all([
      fetch(`${base}/entities/Investment`,   { headers: hdr }),
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
    ]);
    const investments = normaliseInvestments(await invRes.json());
    const profiles    = normaliseProfiles(await intelRes.json());

    const exposed = investments.filter((inv) => profiles.some((p) => relevance(inv, p) > 0)).length;
    const clear   = investments.length - exposed;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS investment × intel profile exposure: ${investments.length} portfolio investments, ` +
          `${profiles.length} tracked threat actor profiles, ${exposed} investments show keyword ` +
          `alignment with known threat actors or adversarial intel profiles — potential exposure signal; ` +
          `${clear} investments have no detected threat actor alignment — clear at this time. ` +
          `Give a 2-sentence investment threat exposure brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Investment threat actor exposure analysis complete, sir.").trim();
  } catch {
    return "Investment intel profile exposure check unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseInvestments(raw) {
  const arr = Array.isArray(raw)                ? raw
    : Array.isArray(raw?.investments)          ? raw.investments
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.results)              ? raw.results
    : Array.isArray(raw?.items)                ? raw.items
    : [];
  return arr.map((inv, i) => ({
    id:      inv.id      || inv.investment_id || String(i),
    name:    inv.name    || inv.title         || inv.ticker || inv.symbol || `Investment ${i + 1}`,
    sector:  inv.sector  || inv.industry      || inv.category || inv.type || "",
    notes:   (inv.notes  || inv.description   || inv.summary  || inv.details || "").toString().slice(0, 300),
    tags:    Array.isArray(inv.tags) ? inv.tags.join(" ") : (inv.tags || ""),
    value:   inv.value   || inv.amount        || inv.balance  || null,
  }));
}

function normaliseProfiles(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.profiles)           ? raw.profiles
    : Array.isArray(raw?.intel_profiles)     ? raw.intel_profiles
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.results)            ? raw.results
    : Array.isArray(raw?.items)              ? raw.items
    : [];
  return arr.map((p, i) => ({
    id:          p.id          || p.profile_id  || String(i),
    name:        p.name        || p.title        || p.actor   || `Profile ${i + 1}`,
    category:    p.category    || p.type         || p.threat_type || p.classification || "",
    description: (p.description || p.summary    || p.overview || p.details || "").toString().slice(0, 300),
    aliases:     Array.isArray(p.aliases) ? p.aliases.join(" ") : (p.aliases || p.aka || ""),
    tags:        Array.isArray(p.tags) ? p.tags.join(" ") : (p.tags || ""),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(investment, profile) {
  const iw = keywords(`${investment.name} ${investment.sector} ${investment.notes} ${investment.tags}`.slice(0, 400));
  const pw = keywords(`${profile.name} ${profile.category} ${profile.description} ${profile.aliases} ${profile.tags}`.slice(0, 400));
  return iw.filter((w) => pw.some((a) => a.includes(w) || w.includes(a))).length;
}

function buildLinked(investments, profiles) {
  return investments.map((inv) => {
    const matched = profiles
      .map((p) => ({ ...p, score: relevance(inv, p) }))
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...inv, profiles: matched, exposed: matched.length > 0 };
  });
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "EXPOSED", "CLEAR"];

export default function InvestmentIntelExposure() {
  const [open,        setOpen]        = useState(false);
  const [investments, setInvestments] = useState([]);
  const [profiles,    setProfiles]    = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [filter,      setFilter]      = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const [lastFetch,   setLastFetch]   = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [invRes, intelRes] = await Promise.all([
        fetch(`${base}/entities/Investment`,   { headers: hdr }),
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
      ]);
      setInvestments(normaliseInvestments(await invRes.json()));
      setProfiles(normaliseProfiles(await intelRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:invintel-toggle", onToggle);
    return () => window.removeEventListener("jarvis:invintel-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "");
      if (isInvintelQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked  = buildLinked(investments, profiles);
  const exposed = linked.filter((inv) => inv.exposed).length;
  const clear   = linked.filter((inv) => !inv.exposed).length;

  const visible = linked
    .filter((inv) => {
      if (filter === "EXPOSED") return inv.exposed;
      if (filter === "CLEAR")   return !inv.exposed;
      return true;
    })
    .filter((inv) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        inv.name.toLowerCase().includes(q) ||
        inv.sector.toLowerCase().includes(q) ||
        inv.notes.toLowerCase().includes(q)
      );
    });

  async function assess() {
    setAssessing(true);
    const text = await buildInvintelScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Investment × Intel Profile Exposure (◈ INVINTEL)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 135,
          background: open ? `${RED}22` : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? RED : S.border}`,
          borderRadius: S.radius, color: open ? RED : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${RED}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ INVINTEL{exposed > 0 && (
          <span style={{
            marginLeft: 4,
            background: RED,
            color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{exposed}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 135,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 360,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${RED}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "70vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: RED, letterSpacing: 2, fontWeight: 700, fontSize: S.fs.xxs }}>
              INVESTMENT — INTEL PROFILE EXPOSURE
            </span>
            <button
              onClick={assess}
              disabled={assessing || investments.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || investments.length === 0) ? 0.4 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            {[
              { label: "INVESTMENTS", value: investments.length, color: S.textLo },
              { label: "PROFILES",    value: profiles.length,    color: S.textLo },
              { label: "EXPOSED",     value: exposed,            color: RED      },
              { label: "CLEAR",       value: clear,              color: "#4ADE80" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.04)", borderRadius: 4,
                padding: "4px 6px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: 15, fontWeight: 700 }}>{value}</div>
                <div style={{ color: S.textLo, fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "6px 12px",
            borderBottom: `1px solid ${S.border}`,
          }}>
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                style={{
                  background: filter === t ? `${RED}22` : "transparent",
                  border: `1px solid ${filter === t ? RED : S.border}`,
                  color: filter === t ? RED : S.textLo,
                  borderRadius: 4, padding: "2px 8px",
                  fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="filter…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.06)",
                border: `1px solid ${S.border}`, borderRadius: 4,
                color: S.textHi, fontFamily: S.mono, fontSize: S.fs.xxs,
                padding: "2px 6px", width: 80, outline: "none",
              }}
            />
          </div>

          {/* Investment list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 12px" }}>
            {loading && investments.length === 0 && (
              <div style={{ color: S.textLo, textAlign: "center", padding: 16 }}>Loading…</div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ color: S.textLo, textAlign: "center", padding: 16 }}>No investments match.</div>
            )}
            {visible.map((inv) => (
              <div key={inv.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
                  style={{
                    background: "rgba(255,255,255,0.04)", borderRadius: 4,
                    padding: "6px 8px", cursor: "pointer",
                    border: `1px solid ${inv.exposed ? `${RED}44` : S.border}`,
                    display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      color: inv.exposed ? RED : S.textHi,
                      fontWeight: 600, fontSize: S.fs.xxs,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {inv.name}
                    </div>
                    {inv.sector && (
                      <div style={{ color: S.textLo, fontSize: 9, marginTop: 2 }}>{inv.sector}</div>
                    )}
                    {inv.value != null && (
                      <div style={{ color: S.textLo, fontSize: 9 }}>
                        {typeof inv.value === "number" ? `$${inv.value.toLocaleString()}` : inv.value}
                      </div>
                    )}
                  </div>
                  <span style={{
                    fontSize: 9, borderRadius: 3, padding: "1px 5px", flexShrink: 0,
                    background: inv.exposed ? `${RED}22` : "rgba(74,222,128,0.10)",
                    color: inv.exposed ? RED : "#4ADE80",
                    border: `1px solid ${inv.exposed ? `${RED}44` : "#4ADE8044"}`,
                  }}>
                    {inv.exposed ? "EXPOSED" : "CLEAR"}
                  </span>
                </div>

                {/* Expanded: matched intel profiles */}
                {expanded === inv.id && inv.profiles.length > 0 && (
                  <div style={{
                    marginTop: 2, marginLeft: 8,
                    borderLeft: `2px solid ${RED}44`, paddingLeft: 8,
                  }}>
                    {inv.profiles.slice(0, 5).map((p) => (
                      <div key={p.id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "3px 0", borderBottom: `1px solid ${S.border}11`,
                      }}>
                        <span style={{
                          color: S.textHi, fontSize: S.fs.xxs,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          maxWidth: "65%",
                        }}>
                          {p.name}
                        </span>
                        <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                          {p.category && (
                            <span style={{
                              fontSize: 8, borderRadius: 3, padding: "1px 4px",
                              background: `${RED}18`,
                              color: RED,
                              border: `1px solid ${RED}44`,
                            }}>
                              {String(p.category).toUpperCase().slice(0, 12)}
                            </span>
                          )}
                          <span style={{
                            fontSize: 8, color: S.textLo,
                            background: "rgba(255,255,255,0.06)",
                            borderRadius: 3, padding: "1px 4px",
                          }}>
                            rel:{p.score}
                          </span>
                        </div>
                      </div>
                    ))}
                    {inv.profiles.length > 5 && (
                      <div style={{ color: S.textLo, fontSize: 9, padding: "2px 0" }}>
                        +{inv.profiles.length - 5} more intel profiles
                      </div>
                    )}
                  </div>
                )}
                {expanded === inv.id && inv.profiles.length === 0 && (
                  <div style={{
                    marginTop: 2, marginLeft: 8,
                    borderLeft: `2px solid #4ADE8044`, paddingLeft: 8,
                    color: S.textLo, fontSize: 9, padding: "4px 0 4px 8px",
                  }}>
                    No intel profiles align with this investment.
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.textLo, fontSize: 8, letterSpacing: 1, display: "flex",
            justifyContent: "space-between", alignItems: "center",
          }}>
            <span>INVINTEL · 90s AUTO-REFRESH</span>
            <span>{lastFetch ? lastFetch.toLocaleTimeString() : "—"}</span>
          </div>
        </div>
      )}
    </>
  );
}
