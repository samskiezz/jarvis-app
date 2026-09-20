/**
 * OpsEventIntelCorrelation — F66
 * /v1/ops/events × /entities/IntelProfile → keyword-correlates significant ops events
 * against active intel threat profiles; TRACKED (has a matching intel profile) vs.
 * UNTRACKED (blind spot — no backing threat actor profile).
 * Voice: "ops intel"/"event intel"/"opeic"/"tracked events"/"blind ops"/"event threat match".
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const GRN = "#4ADE80";
const AMB = "#FFBB33";
const RED = "#FF4455";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const OPEIC_RE =
  /\bops\s*intel\b|\bevent\s*intel\b|\bopeic\b|\btracked\s*events?\b|\bblind\s*ops\b|\bevent\s*threat\s*match\b|\buntracked\s*events?\b|\bops\s*threat\b|\bintel\s*ops\b|\bops\s*event\s*intel\b/i;

export function isOpeicQuery(text) {
  return OPEIC_RE.test(text || "");
}

async function fetchOpsEvents() {
  const r = await fetch(`${apiBase()}/v1/ops/events`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)         ? d
    : Array.isArray(d?.data)      ? d.data
    : Array.isArray(d?.results)   ? d.results
    : Array.isArray(d?.events)    ? d.events
    : Array.isArray(d?.items)     ? d.items
    : [];
}

async function fetchIntelProfiles() {
  const r = await fetch(`${apiBase()}/entities/IntelProfile`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)              ? d
    : Array.isArray(d?.data)           ? d.data
    : Array.isArray(d?.results)        ? d.results
    : Array.isArray(d?.intel_profiles) ? d.intel_profiles
    : Array.isArray(d?.profiles)       ? d.profiles
    : Array.isArray(d?.items)          ? d.items
    : [];
}

function eventKeywords(ev) {
  return [
    ev?.title, ev?.name, ev?.description, ev?.summary,
    ev?.event_type, ev?.type, ev?.category, ev?.source,
    ev?.tags?.join?.(" "), ev?.details,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function profileKeywords(profile) {
  return [
    profile?.name, profile?.title, profile?.alias,
    profile?.description, profile?.summary,
    profile?.threat_type, profile?.category, profile?.origin,
    profile?.tags?.join?.(" "), profile?.indicators?.join?.(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function correlate(ev, profiles) {
  const evKw    = eventKeywords(ev);
  const tokens  = evKw.split(/\W+/).filter((t) => t.length > 3);
  const matched = profiles.filter((p) => {
    const pKw     = profileKeywords(p);
    const pTokens = pKw.split(/\W+/).filter((t) => t.length > 3);
    return tokens.some((t) => pKw.includes(t)) || pTokens.some((t) => evKw.includes(t));
  });
  const status = matched.length > 0 ? "TRACKED" : "UNTRACKED";
  return { matched, status };
}

function eventLabel(ev) {
  return ev?.title || ev?.name || ev?.event_type || "Unnamed Event";
}

function profileLabel(p) {
  return p?.name || p?.title || p?.alias || "Unknown Profile";
}

export async function buildOpeicScript() {
  const [events, profiles] = await Promise.all([fetchOpsEvents(), fetchIntelProfiles()]);
  if (!events.length) return "Ops event intel correlation data is unavailable, sir.";
  const rows      = events.map((ev) => ({ ev, ...correlate(ev, profiles) }));
  const tracked   = rows.filter((r) => r.status === "TRACKED");
  const untracked = rows.filter((r) => r.status === "UNTRACKED");
  const blindNames = untracked.slice(0, 3).map((r) => eventLabel(r.ev)).join(", ");
  return (
    `Ops Event Intel Correlation: ${events.length} ops events assessed against ${profiles.length} intel threat profiles. ` +
    `${tracked.length} TRACKED, ${untracked.length} UNTRACKED. ` +
    (untracked.length
      ? `Blind-spot events with no intel backing: ${blindNames}.`
      : "All significant ops events have matching intel threat profiles, sir.")
  );
}

export default function OpsEventIntelCorrelation() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [filter, setFilter]       = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [loading, setLoading]     = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [events, profiles] = await Promise.all([fetchOpsEvents(), fetchIntelProfiles()]);
      const built = events.map((ev) => ({ ev, ...correlate(ev, profiles) }));
      setRows(built);
    } catch {
      // keep stale
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen((v) => { if (!v) refresh(); return !v; });
    window.addEventListener("jarvis:opeic-toggle", toggle);
    return () => window.removeEventListener("jarvis:opeic-toggle", toggle);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(refresh, 90_000);
    return () => clearInterval(id);
  }, [open, refresh]);

  const tracked   = rows.filter((r) => r.status === "TRACKED");
  const untracked = rows.filter((r) => r.status === "UNTRACKED");

  const visible = rows.filter((r) => {
    if (filter === "TRACKED"   && r.status !== "TRACKED")   return false;
    if (filter === "UNTRACKED" && r.status !== "UNTRACKED") return false;
    if (search) {
      const label = eventLabel(r.ev).toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  async function assess(row) {
    const label = eventLabel(row.ev);
    setAssessing(label);
    const profNames = row.matched.map((p) => profileLabel(p)).join(", ") || "none";
    const prompt =
      `Ops event "${label}" is ${row.status} against intel threat profiles. ` +
      (row.matched.length
        ? `Matching threat profiles: ${profNames}.`
        : "No intel threat profiles currently document this ops event.") +
      " Provide a 2-sentence threat correlation brief and recommended intelligence action.";
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const brief = d?.response || d?.message || d?.content || "Assessment complete.";
      const voice = getActiveVoice?.() ?? "ash";
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: brief, voice }),
      });
    } catch {
      // ignore TTS errors
    }
    setAssessing(null);
  }

  if (!open) {
    const untrackedCount = untracked.length;
    return (
      <button
        onClick={() => { setOpen(true); refresh(); }}
        title="Ops Events × Intel Profiles (F66)"
        style={{
          position: "fixed", left: 17960, bottom: 8, zIndex: 74,
          background: "rgba(5,8,13,0.72)", border: `1px solid ${untrackedCount > 0 ? AMB : CY}55`,
          borderRadius: 6, padding: "3px 9px", cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 11, color: untrackedCount > 0 ? AMB : CY,
          letterSpacing: 1, backdropFilter: "blur(6px)",
        }}
      >
        ◈ OPEIC{untrackedCount > 0 && <sup style={{ color: AMB, marginLeft: 2 }}>{untrackedCount}</sup>}
      </button>
    );
  }

  const statusColor = (s) => s === "TRACKED" ? GRN : RED;

  return (
    <div style={{
      position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh",
      background: "rgba(2,5,10,0.88)", zIndex: 9100, display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'JetBrains Mono',monospace",
    }}>
      <div style={{
        width: "min(820px,94vw)", maxHeight: "88vh", overflowY: "auto",
        background: "rgba(8,14,22,0.96)", border: `1px solid ${CY}44`,
        borderRadius: 14, padding: "20px 22px",
        boxShadow: `0 0 60px ${CY}18`,
      }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ color: CY, fontSize: 13, letterSpacing: 3, textShadow: `0 0 12px ${CY}` }}>
            ◈ OPS EVENTS × INTEL THREAT CORRELATION
          </span>
          {loading && <span style={{ color: CY, fontSize: 10, marginLeft: "auto" }}>refreshing…</span>}
          <button onClick={() => setOpen(false)}
            style={{ marginLeft: loading ? 0 : "auto", background: "none", border: "none",
              cursor: "pointer", color: "#6E8AA0", fontSize: 16 }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          {[
            { label: "EVENTS",    val: rows.length,       col: CY  },
            { label: "TRACKED",   val: tracked.length,    col: GRN },
            { label: "UNTRACKED", val: untracked.length,  col: RED },
          ].map(({ label, val, col }) => (
            <div key={label} style={{
              flex: "1 1 120px", background: "rgba(41,231,255,0.05)",
              border: `1px solid ${col}33`, borderRadius: 8, padding: "8px 12px", textAlign: "center",
            }}>
              <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{val}</div>
              <div style={{ color: "#6E8AA0", fontSize: 10, letterSpacing: 1, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* filter + search */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {["ALL", "TRACKED", "UNTRACKED"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                background: filter === f ? `${CY}22` : "none",
                border: `1px solid ${filter === f ? CY : "#6E8AA0"}55`,
                borderRadius: 5, padding: "3px 10px", cursor: "pointer",
                color: filter === f ? CY : "#6E8AA0", fontSize: 11,
              }}>{f}</button>
          ))}
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="search events…"
            style={{
              marginLeft: "auto", background: "rgba(41,231,255,0.06)",
              border: `1px solid ${CY}33`, borderRadius: 5,
              padding: "3px 10px", color: CY, fontSize: 11,
              outline: "none", width: 160,
            }}
          />
        </div>

        {/* rows */}
        {visible.length === 0 && (
          <div style={{ color: "#6E8AA0", fontSize: 12, textAlign: "center", padding: 20 }}>
            {loading ? "Loading…" : "No events match current filter."}
          </div>
        )}
        {visible.map((row, i) => {
          const label = eventLabel(row.ev);
          const isExp = expanded === i;
          const col   = statusColor(row.status);
          const busy  = assessing === label;
          return (
            <div key={i} style={{
              border: `1px solid ${col}33`, borderRadius: 8, marginBottom: 8,
              background: "rgba(8,14,22,0.6)",
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : i)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer" }}
              >
                <span style={{ color: col, fontSize: 10, letterSpacing: 1, minWidth: 90 }}>{row.status}</span>
                <span style={{ color: "#DCEBF5", fontSize: 12, flex: 1 }}>{label}</span>
                {row.ev?.severity !== undefined && (
                  <span style={{ color: "#6E8AA0", fontSize: 10 }}>sev:{row.ev.severity}</span>
                )}
                <span style={{ color: "#6E8AA0", fontSize: 10 }}>
                  {row.matched.length} profile{row.matched.length !== 1 ? "s" : ""}
                </span>
                <span style={{ color: CY, fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "0 12px 12px" }}>
                  {row.ev?.description && (
                    <div style={{ color: "#6E8AA0", fontSize: 11, marginBottom: 8, fontStyle: "italic" }}>
                      {row.ev.description.slice(0, 180)}{row.ev.description.length > 180 ? "…" : ""}
                    </div>
                  )}
                  {row.matched.length === 0 ? (
                    <div style={{ color: RED, fontSize: 11, marginBottom: 8 }}>
                      No matching intel profiles — this ops event is a BLIND SPOT.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      {row.matched.map((p, j) => (
                        <div key={j} style={{
                          background: "rgba(74,222,128,0.07)", border: `1px solid ${GRN}33`,
                          borderRadius: 6, padding: "5px 10px", fontSize: 11,
                        }}>
                          <div style={{ color: GRN }}>{profileLabel(p)}</div>
                          {(p.threat_type || p.category) && (
                            <div style={{ color: "#6E8AA0", fontSize: 10, marginTop: 1 }}>
                              {p.threat_type || p.category}
                            </div>
                          )}
                          {(p.summary || p.description) && (
                            <div style={{ color: "#6E8AA0", marginTop: 2, maxWidth: 260 }}>
                              {(p.summary || p.description).slice(0, 80)}
                              {(p.summary || p.description).length > 80 ? "…" : ""}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => assess(row)}
                    disabled={busy}
                    style={{
                      background: busy ? "rgba(41,231,255,0.05)" : `${CY}18`,
                      border: `1px solid ${CY}44`, borderRadius: 5,
                      padding: "4px 12px", cursor: busy ? "wait" : "pointer",
                      color: CY, fontSize: 11,
                    }}
                  >
                    {busy ? "assessing…" : "▶ ASSESS"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
