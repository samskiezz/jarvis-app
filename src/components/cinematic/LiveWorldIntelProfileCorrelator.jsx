/**
 * LiveWorldIntelProfileCorrelator — F561
 * "JARVIS, live world intel / lwintel / world intel profile / active threats / real world threat actor"
 * Cross-references /functions/getLiveIntel + /entities/IntelProfile.
 * Finds WORLD-FLAGGED intel profiles (≥1 live event keyword-matches) vs DORMANT.
 * Coverage % tile; ALL/WORLD-FLAGGED/DORMANT filter tabs + search; click-to-expand event detail.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4466";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 57_360;
const Z_INDEX  = 125;

const LWINTEL_RE =
  /\blwintel\b|\blive.?world.?intel\b|\bworld.?intel.?profile\b|\bactive.?threat.?actor\b|\breal.?world.?threat\b|\bworld.?flagged.?profile\b|\blive.?threat.?actor\b|\bworld.?actor\b|\blive.?intel.?profile\b|\bthreat.?actor.?signal\b|\bworld.?profile\b/i;

export function isLwintelQuery(text) {
  return LWINTEL_RE.test(text || "");
}

// ─── helpers ─────────────────────────────────────────────────────────────────

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

function normaliseLiveEvents(data) {
  if (!data) return [];
  const all = [];

  const quakes = Array.isArray(data.earthquakes) ? data.earthquakes : [];
  quakes.forEach((q, i) => {
    all.push({
      id: q.id || `quake-${i}`,
      kind: "SEISMIC",
      name: q.place || q.name || `Magnitude ${q.magnitude} quake`,
      description: `Mag ${q.magnitude ?? "?"} at ${q.place || "unknown location"}. ${q.type || ""}`,
      tags: ["seismic", "earthquake", "geologic", "disaster", q.place || ""].join(" "),
    });
  });

  const coins = Array.isArray(data.crypto) ? data.crypto
    : Array.isArray(data.coins) ? data.coins : [];
  coins.forEach((c, i) => {
    const sym = c.symbol || c.coin || c.currency || `COIN${i}`;
    const chg = c.change_pct ?? c.change ?? c.pct_change ?? null;
    all.push({
      id: `crypto-${sym}`,
      kind: "CRYPTO",
      name: `${sym}${chg !== null ? ` ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : ""}`,
      description: `Cryptocurrency ${sym}: price ${c.price ?? "?"} USD.${chg !== null ? ` Change: ${chg.toFixed(2)}%` : ""}`,
      tags: `crypto ${sym} ${sym.toLowerCase()} digital asset market finance`.trim(),
    });
  });

  const fx = Array.isArray(data.fx) ? data.fx
    : Array.isArray(data.currencies) ? data.currencies : [];
  fx.forEach((f, i) => {
    const pair = f.pair || f.symbol || f.currency_pair || `FX${i}`;
    const rate = f.rate ?? f.price ?? null;
    all.push({
      id: `fx-${pair}`,
      kind: "FX",
      name: `${pair}${rate !== null ? ` @ ${rate}` : ""}`,
      description: `FX pair ${pair}. Rate: ${rate ?? "?"}.`,
      tags: `currency forex fx ${pair} ${pair.toLowerCase()} monetary exchange finance`.trim(),
    });
  });

  return all;
}

function normaliseProfiles(raw) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.profiles)        ? raw.profiles
    : Array.isArray(raw?.intel_profiles)  ? raw.intel_profiles
    : Array.isArray(raw?.results)         ? raw.results
    : [];
  return arr.map((p, i) => ({
    id:          p.id          || String(i),
    name:        p.name        || p.subject || p.title || p.label || `Intel Profile ${i + 1}`,
    threat:      (p.threat_level || p.threat || p.severity || "UNKNOWN").toString().toUpperCase(),
    category:    (p.category   || p.type    || p.actor_type || "UNKNOWN").toString().toUpperCase(),
    nationality: p.nationality || p.country || p.origin || "",
    description: (p.description || p.summary || p.notes || p.detail || "").toString().slice(0, 300),
    aliases:     Array.isArray(p.aliases) ? p.aliases.join(" ") : (p.aliases || ""),
    tags:        Array.isArray(p.tags)    ? p.tags.join(" ")    : (p.tags    || ""),
  }));
}

function crossRef(profiles, events) {
  return profiles.map((profile) => {
    const haystack = `${profile.name} ${profile.description} ${profile.aliases} ${profile.tags} ${profile.category} ${profile.nationality}`;
    const matches = events
      .map((ev) => ({
        ev,
        hits: overlap(haystack, `${ev.name} ${ev.description} ${ev.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...profile,
      flagged: matches.length > 0,
      matches: matches.map(({ ev, hits }) => ({ ...ev, hits })),
    };
  });
}

// ─── buildLwintelScript (for JarvisBrain) ────────────────────────────────────

export async function buildLwintelScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [liveRes, profRes] = await Promise.all([
      fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
      fetch(`${base}/entities/IntelProfile`,  { headers: hdr }),
    ]);
    const liveData = liveRes.ok ? await liveRes.json() : {};
    const profData = profRes.ok ? await profRes.json() : {};

    const events   = normaliseLiveEvents(liveData);
    const profiles = normaliseProfiles(profData);
    const crossed  = crossRef(profiles, events);

    const total   = crossed.length;
    const flagged = crossed.filter((p) => p.flagged).length;
    const dormant = total - flagged;
    const coverage = total > 0 ? Math.round((flagged / total) * 100) : 0;
    const topFlagged = crossed
      .filter((p) => p.flagged)
      .slice(0, 2)
      .map((p) => p.name)
      .join(", ");

    const brief =
      `${coverage}% of ${total} tracked intel profiles correlate with live world events. ` +
      `${flagged} WORLD-FLAGGED, ${dormant} DORMANT.` +
      (topFlagged ? ` Active profiles: ${topFlagged}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Live World × Intel Profile Correlation: ${brief} Provide a 2-sentence threat-actor assessment.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Live World × Intel Profile Correlator unavailable: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

const KIND_COLOR = { SEISMIC: "#FF6B35", CRYPTO: GRN, FX: CY };

const THREAT_COLOR = {
  CRITICAL: RED, HIGH: "#FF8800", MEDIUM: AMB, LOW: GRN, UNKNOWN: DIM,
};

export default function LiveWorldIntelProfileCorrelator() {
  const [open, setOpen]         = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [events, setEvents]     = useState([]);
  const [crossed, setCrossed]   = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [query, setQuery]       = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssess]  = useState(false);
  const [brief, setBrief]       = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [liveRes, profRes] = await Promise.all([
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
        fetch(`${base}/entities/IntelProfile`,  { headers: hdr }),
      ]);
      const liveData = liveRes.ok ? await liveRes.json() : {};
      const profData = profRes.ok ? await profRes.json() : {};

      const evs   = normaliseLiveEvents(liveData);
      const profs = normaliseProfiles(profData);
      setEvents(evs);
      setProfiles(profs);
      setCrossed(crossRef(profs, evs));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => {
      if (!v) load();
      return !v;
    });
    window.addEventListener("jarvis:lwintel-toggle", onToggle);
    return () => window.removeEventListener("jarvis:lwintel-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssess(true);
    setBrief("");
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const total   = crossed.length;
      const flagged = crossed.filter((p) => p.flagged).length;
      const dormant = total - flagged;
      const coverage = total > 0 ? Math.round((flagged / total) * 100) : 0;
      const prompt = `Live World × Intel Profiles: ${coverage}% world-correlation (${flagged}/${total} flagged, ${dormant} dormant). Provide a 2-sentence threat-actor operational assessment.`;
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const d = res.ok ? await res.json() : {};
      const text = d.response || d.message || d.reply || "Assessment complete.";
      setBrief(text);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "onyx" }),
      });
    } catch (e) {
      setBrief(`Assessment error: ${e.message}`);
    } finally {
      setAssess(false);
    }
  }, [crossed]);

  const visible = crossed.filter((p) => {
    if (tab === "WORLD-FLAGGED" && !p.flagged) return false;
    if (tab === "DORMANT"       &&  p.flagged) return false;
    if (query) {
      const q = query.toLowerCase();
      if (
        !p.name.toLowerCase().includes(q) &&
        !p.description.toLowerCase().includes(q) &&
        !p.category.toLowerCase().includes(q) &&
        !p.threat.toLowerCase().includes(q) &&
        !p.nationality.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const total   = crossed.length;
  const nFlag   = crossed.filter((p) => p.flagged).length;
  const nDorm   = total - nFlag;
  const coverage = total > 0 ? Math.round((nFlag / total) * 100) : 0;

  const btnStyle = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: Z_INDEX,
    background: "rgba(0,0,0,0.85)",
    border: `1px solid ${CY}`,
    color: CY,
    fontFamily: "monospace",
    fontSize: 10,
    padding: "2px 7px",
    cursor: "pointer",
    borderRadius: 3,
    userSelect: "none",
    display: "flex",
    alignItems: "center",
    gap: 4,
  };

  const panelStyle = {
    position: "fixed",
    right: 18,
    bottom: 54,
    width: 460,
    maxHeight: "78vh",
    overflowY: "auto",
    background: "rgba(0,6,18,0.97)",
    border: `1px solid ${CY}44`,
    borderRadius: 8,
    padding: 16,
    zIndex: 9999,
    fontFamily: "monospace",
    color: CY,
    boxSizing: "border-box",
  };

  return (
    <>
      <button
        style={btnStyle}
        onClick={() => { setOpen((v) => { if (!v) load(); return !v; }); }}
        title="Live World × Intel Profile Correlator"
      >
        ◈ LWINTEL
        {nFlag > 0 && (
          <span style={{ background: RED, color: "#fff", borderRadius: 8, padding: "0 4px", fontSize: 9 }}>
            {nFlag}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>LIVE WORLD × INTEL PROFILES</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={load}
                style={{ background: "none", border: `1px solid ${CY}55`, color: CY, cursor: "pointer", padding: "2px 8px", borderRadius: 3, fontSize: 10 }}
                title="Refresh"
              >
                ↺
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[
              { label: "CORRELATION",   value: `${coverage}%`, color: coverage > 40 ? RED : coverage > 20 ? AMB : GRN },
              { label: "WORLD-FLAGGED", value: nFlag,          color: RED },
              { label: "DORMANT",       value: nDorm,          color: DIM },
              { label: "LIVE EVENTS",   value: events.length,  color: CY },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  flex: 1, background: "rgba(41,231,255,0.05)", border: `1px solid ${color}33`,
                  borderRadius: 4, padding: "6px 8px", textAlign: "center",
                }}
              >
                <div style={{ fontSize: 16, fontWeight: "bold", color }}>{value}</div>
                <div style={{ fontSize: 8, color: DIM, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Assess */}
          <div style={{ marginBottom: 10 }}>
            <button
              onClick={assess}
              disabled={assessing || crossed.length === 0}
              style={{
                background: assessing ? "rgba(41,231,255,0.1)" : "rgba(41,231,255,0.15)",
                border: `1px solid ${CY}88`,
                color: CY, cursor: assessing ? "wait" : "pointer",
                padding: "4px 14px", borderRadius: 3, fontSize: 10, fontFamily: "monospace",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, fontSize: 10, color: "#cde", lineHeight: 1.5, padding: "6px 8px", background: "rgba(41,231,255,0.05)", borderRadius: 3 }}>
                {brief}
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {["ALL", "WORLD-FLAGGED", "DORMANT"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "none",
                  border: `1px solid ${tab === t ? CY : CY + "33"}`,
                  color: tab === t ? CY : DIM,
                  cursor: "pointer", padding: "2px 10px", borderRadius: 3,
                  fontSize: 10, fontFamily: "monospace",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search intel profiles…"
            style={{
              width: "100%", background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}33`,
              color: CY, padding: "4px 8px", borderRadius: 3, fontSize: 10,
              marginBottom: 8, boxSizing: "border-box", fontFamily: "monospace",
            }}
          />

          {/* Intel profile rows */}
          {loading ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>No intel profiles match.</div>
          ) : (
            visible.map((profile) => (
              <div key={profile.id}>
                <div
                  onClick={() => setExpanded(expanded === profile.id ? null : profile.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 6px", marginBottom: 3, cursor: "pointer",
                    borderRadius: 3, background: "rgba(41,231,255,0.04)",
                    border: `1px solid ${profile.flagged ? RED + "55" : DIM + "22"}`,
                  }}
                >
                  <span style={{
                    fontSize: 8, padding: "1px 4px", borderRadius: 2,
                    background: `${THREAT_COLOR[profile.threat] || DIM}22`,
                    color: THREAT_COLOR[profile.threat] || DIM,
                    minWidth: 44, textAlign: "center",
                  }}>
                    {profile.threat.slice(0, 8)}
                  </span>
                  <span style={{ flex: 1, fontSize: 10, color: profile.flagged ? RED : DIM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {profile.name}
                  </span>
                  {profile.nationality && (
                    <span style={{ fontSize: 8, color: DIM }}>{profile.nationality.slice(0, 6)}</span>
                  )}
                  {profile.flagged ? (
                    <span style={{ fontSize: 8, color: RED }}>⚑ {profile.matches.length} ev</span>
                  ) : (
                    <span style={{ fontSize: 8, color: DIM }}>DORMANT</span>
                  )}
                </div>

                {/* Expanded matched events */}
                {expanded === profile.id && profile.flagged && (
                  <div style={{ marginLeft: 12, marginBottom: 6 }}>
                    {profile.description && (
                      <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>{profile.description.slice(0, 120)}</div>
                    )}
                    {profile.matches.map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          padding: "3px 6px", marginBottom: 2, borderRadius: 2,
                          background: "rgba(255,68,102,0.05)", border: `1px solid ${KIND_COLOR[ev.kind] || DIM}33`,
                          fontSize: 9,
                        }}
                      >
                        <span style={{ color: KIND_COLOR[ev.kind] || DIM, marginRight: 4 }}>[{ev.kind}]</span>
                        <span style={{ color: RED }}>{ev.name}</span>
                        <span style={{ color: DIM, marginLeft: 6 }}>hits:{ev.hits}</span>
                      </div>
                    ))}
                  </div>
                )}

                {expanded === profile.id && !profile.flagged && (
                  <div style={{ marginLeft: 12, marginBottom: 6, fontSize: 9, color: DIM }}>
                    No live world events correlate with this intel profile.
                    {profile.description && <div style={{ marginTop: 2 }}>{profile.description.slice(0, 120)}</div>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
