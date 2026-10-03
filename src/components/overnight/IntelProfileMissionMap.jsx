/**
 * IntelProfileMissionMap — F40 (overnight backlog)
 *
 * Parallel-fetches /entities/IntelProfile + /v1/investigations every 90 s.
 * Keyword-correlates each intel profile against open investigations to
 * classify as ACTIVE (matched investigation) / MONITORED (partial match) /
 * PASSIVE (no match).
 *
 * Toggle:  ◈ IPMM  at left:882880 bottom:8 zIndex:585
 * Event:   jarvis:ipmm-toggle
 * Voice:   "intel profile map / intel mission / ipmm / profile map / intel dossier"
 * Refresh: 90 s while open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const ACC   = "#A78BFA";   /* violet accent */
const DIM   = "#0B1420";
const POLL  = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

/* ── exported helpers for JarvisBrain ───────────────────────────────────────── */

export function isIpmmQuery(q) {
  return /\b(intel[\s_-]*profile[\s_-]*map|intel[\s_-]*mission|ipmm|profile[\s_-]*map|intel[\s_-]*dossier|intel[\s_-]*profiles?[\s_-]*map|show[\s_-]*intel[\s_-]*profiles?)\b/i.test(
    q || ""
  );
}

export async function buildIpmmScript() {
  try {
    const [pr, ir] = await Promise.all([
      fetch(`${apiBase()}/entities/IntelProfile`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/investigations`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const profiles       = norm(pr.ok ? await pr.json() : [], "intel_profiles");
    const investigations = norm(ir.ok ? await ir.json() : [], "investigations");
    window.dispatchEvent(new CustomEvent("jarvis:ipmm-toggle"));
    if (!profiles.length)
      return "No intel profiles on record, sir. Intel profile mission map is open.";
    const active = profiles.filter((p) => classify(p, investigations) === "ACTIVE").length;
    return (
      `Intel profile mission map online, sir. ${profiles.length} profile${profiles.length !== 1 ? "s" : ""} tracked ` +
      `against ${investigations.length} investigation${investigations.length !== 1 ? "s" : ""}. ` +
      `${active} profile${active !== 1 ? "s" : ""} actively linked to open cases. Panel is open.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:ipmm-toggle"));
    return "Intel profile mission map open, sir.";
  }
}

/* ── helpers ────────────────────────────────────────────────────────────────── */

function norm(raw, hint) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of [hint, "data", "items", "results", "records"]) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    for (const v of Object.values(raw)) {
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

function keywords(obj) {
  return JSON.stringify(obj).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3);
}

function classify(profile, investigations) {
  const pk = keywords(profile);
  let best = 0;
  for (const inv of investigations) {
    const ik = keywords(inv);
    const common = pk.filter((w) => ik.includes(w)).length;
    if (common > best) best = common;
  }
  if (best >= 3) return "ACTIVE";
  if (best >= 1) return "MONITORED";
  return "PASSIVE";
}

function matchedInvestigations(profile, investigations) {
  const pk = keywords(profile);
  return investigations
    .map((inv) => {
      const ik = keywords(inv);
      const score = pk.filter((w) => ik.includes(w)).length;
      return { inv, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

const CLASS_COLOR = {
  ACTIVE:    "#EF4444",
  MONITORED: "#F59E0B",
  PASSIVE:   "#4E6070",
};

/* ── ASSESS helper ──────────────────────────────────────────────────────────── */

async function assessProfile(profile, onSpeak) {
  const prompt =
    `Summarise this intel profile and its mission relevance in exactly 2 sentences for a senior operator. ` +
    `Profile: ${JSON.stringify(profile).slice(0, 600)}`;
  try {
    const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ message: prompt }),
    });
    const j = r.ok ? await r.json() : null;
    const text = j?.response ?? j?.reply ?? j?.message ?? j?.content ?? null;
    if (text) onSpeak(text);
    return text ?? "No assessment available.";
  } catch {
    return "Assessment unavailable.";
  }
}

async function tts(text) {
  try {
    const r = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ text: text.slice(0, 500), voice: "onyx" }),
    });
    if (!r.ok) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.play();
    audio.onended = () => URL.revokeObjectURL(url);
  } catch { /* TTS unavailable */ }
}

/* ── component ──────────────────────────────────────────────────────────────── */

export default function IntelProfileMissionMap() {
  const [open, setOpen]               = useState(false);
  const [profiles, setProfiles]       = useState([]);
  const [investigations, setInvests]  = useState([]);
  const [loading, setLoading]         = useState(false);
  const [err, setErr]                 = useState(null);
  const [search, setSearch]           = useState("");
  const [filter, setFilter]           = useState("ALL");
  const [expanded, setExpanded]       = useState(null);
  const [assessing, setAssessing]     = useState(null);
  const [assessText, setAssessText]   = useState({});
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setErr(null);
    try {
      const [pr, ir] = await Promise.all([
        fetch(`${apiBase()}/entities/IntelProfile`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${apiBase()}/v1/investigations`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      setProfiles(norm(pr.ok ? await pr.json() : [], "intel_profiles"));
      setInvests(norm(ir.ok ? await ir.json() : [], "investigations"));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:ipmm-toggle", toggle);
    return () => window.removeEventListener("jarvis:ipmm-toggle", toggle);
  }, []);

  const handleAssess = async (profile) => {
    const key = profile.id ?? profile.profile_id ?? JSON.stringify(profile).slice(0, 40);
    setAssessing(key);
    const text = await assessProfile(profile, tts);
    setAssessText((prev) => ({ ...prev, [String(key)]: text }));
    setAssessing(null);
  };

  const classified = profiles.map((p) => ({
    profile:  p,
    status:   classify(p, investigations),
    matches:  matchedInvestigations(p, investigations),
  }));

  const filtered = classified.filter(({ profile, status }) => {
    if (filter !== "ALL" && status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!JSON.stringify(profile).toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts = {
    ACTIVE:    classified.filter((c) => c.status === "ACTIVE").length,
    MONITORED: classified.filter((c) => c.status === "MONITORED").length,
    PASSIVE:   classified.filter((c) => c.status === "PASSIVE").length,
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Intel Profile Mission Map"
        style={{
          position: "fixed", bottom: 8, right: 260, zIndex: 585,
          fontFamily: "monospace", fontSize: 10, letterSpacing: 1,
          background: `${DIM}CC`, border: `1px solid ${ACC}44`,
          color: ACC, borderRadius: 4, padding: "3px 7px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        ◈ IPMM
        {counts.ACTIVE > 0 && (
          <span style={{
            background: "#EF4444", color: "#fff", borderRadius: "50%",
            fontSize: 8, padding: "1px 4px", minWidth: 14, textAlign: "center",
          }}>
            {counts.ACTIVE}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 50, right: 24, zIndex: 585,
      width: 500, maxHeight: "72vh",
      background: `${DIM}F2`, border: `1px solid ${ACC}33`,
      borderRadius: 10, display: "flex", flexDirection: "column",
      fontFamily: "monospace", fontSize: 12, color: "#C0D0E0",
      boxShadow: `0 0 32px ${ACC}18`,
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: `1px solid ${ACC}22`,
      }}>
        <span style={{ color: ACC, letterSpacing: 2, fontSize: 11, fontWeight: 700 }}>
          ◈ INTEL PROFILE MISSION MAP
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <span style={{ fontSize: 9, color: "#4E6070" }}>SYNCING…</span>}
          <button onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: "#4E6070", cursor: "pointer", fontSize: 16 }}>
            ×
          </button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${ACC}18` }}>
        {[["ACTIVE", "#EF4444"], ["MONITORED", "#F59E0B"], ["PASSIVE", "#4E6070"]].map(([label, c]) => (
          <div key={label} style={{
            flex: 1, textAlign: "center",
            background: `${c}11`, border: `1px solid ${c}33`, borderRadius: 6, padding: "4px 0",
          }}>
            <div style={{ color: c, fontSize: 14, fontWeight: 700 }}>{counts[label]}</div>
            <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
        <div style={{
          flex: 1, textAlign: "center",
          background: `${ACC}11`, border: `1px solid ${ACC}33`, borderRadius: 6, padding: "4px 0",
        }}>
          <div style={{ color: ACC, fontSize: 14, fontWeight: 700 }}>{investigations.length}</div>
          <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1 }}>INV</div>
        </div>
      </div>

      {/* filter tabs + search */}
      <div style={{
        display: "flex", gap: 6, padding: "6px 14px",
        borderBottom: `1px solid ${ACC}18`, alignItems: "center",
      }}>
        {["ALL", "ACTIVE", "MONITORED", "PASSIVE"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            fontFamily: "monospace", fontSize: 9, letterSpacing: 1,
            background: filter === f ? `${ACC}22` : "none",
            border: `1px solid ${filter === f ? ACC : "#1E2E40"}`,
            color: filter === f ? ACC : "#4E6070",
            borderRadius: 4, padding: "2px 6px", cursor: "pointer",
          }}>{f}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: "auto", background: "#0D1826", border: `1px solid ${ACC}33`,
            borderRadius: 4, color: "#C0D0E0", fontFamily: "monospace",
            fontSize: 10, padding: "2px 8px", outline: "none", width: 100,
          }}
        />
      </div>

      {/* profile list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {err && (
          <div style={{ color: "#EF4444", fontSize: 10, padding: 8 }}>Error: {err}</div>
        )}
        {!err && filtered.length === 0 && !loading && (
          <div style={{ color: "#4E6070", fontSize: 10, padding: 8 }}>
            No profiles match the current filter.
          </div>
        )}
        {filtered.map(({ profile, status, matches }, i) => {
          const key = profile.id ?? profile.profile_id ?? i;
          const sKey = String(key);
          const name = profile.name ?? profile.title ?? profile.alias ?? profile.entity_name ?? `Profile ${i + 1}`;
          const type = profile.type ?? profile.category ?? profile.role ?? null;
          const statusColor = CLASS_COLOR[status];
          const isExp = expanded === key;
          return (
            <div key={key} style={{
              marginBottom: 6,
              borderLeft: `3px solid ${statusColor}66`,
              background: isExp ? `${statusColor}08` : "transparent",
              borderRadius: "0 6px 6px 0", padding: "6px 8px",
              cursor: "pointer",
            }}
              onClick={() => setExpanded(isExp ? null : key)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: statusColor, flexShrink: 0,
                  boxShadow: status === "ACTIVE" ? `0 0 6px ${statusColor}` : "none",
                }} />
                <span style={{ flex: 1, color: "#D0E0F0", fontSize: 11 }}>{name}</span>
                {type && <span style={{ color: "#4E6070", fontSize: 9 }}>{type}</span>}
                <span style={{
                  fontFamily: "monospace", fontSize: 9, color: statusColor,
                  border: `1px solid ${statusColor}55`, borderRadius: 3,
                  padding: "1px 5px", letterSpacing: 1, flexShrink: 0,
                }}>
                  {status}
                </span>
                {matches.length > 0 && (
                  <span style={{ color: "#4E6070", fontSize: 9 }}>
                    {matches.length} inv
                  </span>
                )}
              </div>

              {isExp && (
                <div style={{ marginTop: 8, paddingLeft: 14 }}>
                  {matches.length > 0 ? (
                    <>
                      <div style={{ color: "#7090A0", fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>
                        MATCHED INVESTIGATIONS
                      </div>
                      {matches.map(({ inv, score }) => {
                        const iTitle = inv.title ?? inv.name ?? inv.case_id ?? JSON.stringify(inv).slice(0, 50);
                        return (
                          <div key={iTitle} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            fontSize: 10, color: "#8090A0", marginBottom: 3,
                            padding: "2px 6px", background: "#0D1826", borderRadius: 4,
                          }}>
                            <span>{iTitle}</span>
                            <span style={{ color: ACC, fontSize: 9 }}>score {score}</span>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <div style={{ color: "#3E5060", fontSize: 10, marginBottom: 4 }}>
                      No matched investigations.
                    </div>
                  )}

                  {/* ASSESS */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAssess(profile); }}
                    disabled={assessing === sKey}
                    style={{
                      fontFamily: "monospace", fontSize: 9, letterSpacing: 1,
                      background: `${ACC}18`, border: `1px solid ${ACC}44`,
                      color: ACC, borderRadius: 4, padding: "3px 8px",
                      cursor: assessing === sKey ? "wait" : "pointer", marginTop: 6,
                    }}
                  >
                    {assessing === sKey ? "ASSESSING…" : "▶ ASSESS"}
                  </button>

                  {assessText[sKey] && (
                    <div style={{
                      marginTop: 6, padding: "6px 8px",
                      background: `${ACC}0A`, border: `1px solid ${ACC}22`,
                      borderRadius: 4, color: "#A0C0D0", fontSize: 10, lineHeight: 1.5,
                    }}>
                      {assessText[sKey]}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        padding: "6px 14px", borderTop: `1px solid ${ACC}18`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: "#2E4060", fontSize: 9, letterSpacing: 1 }}>
          {filtered.length}/{profiles.length} PROFILES · AUTO-REFRESH 90s
        </span>
        <button onClick={fetchData} style={{
          fontFamily: "monospace", fontSize: 9, letterSpacing: 1,
          background: "none", border: `1px solid ${ACC}33`,
          color: ACC, borderRadius: 3, padding: "2px 7px", cursor: "pointer",
        }}>
          ↻ SYNC
        </button>
      </div>
    </div>
  );
}
