/**
 * OpsEventsIntelProfileNexus — F638
 * "JARVIS, oeip / ops intel / intel ops / threat ops /
 *  which intel profiles have ops events / profile in ops /
 *  actor ops events / profile ops correlation / intel in operations"
 * Cross-references /v1/ops/events against /entities/IntelProfile.
 * FLAGGED profiles (≥1 ops event keyword-matches) vs CLEAR (no ops signal).
 * Coverage % tile; ALL/FLAGGED/CLEAR filter tabs + search; click-to-expand matched events.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence threat-operations brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";
const ORG = "#FF6B35";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 105_380;
const Z_INDEX  = 181;

const OEIP_RE =
  /\boeip\b|\bops.?intel\b|\bintel.?ops\b|\bthreat.?ops\b|\bwhich.?intel.?profiles?.have.?ops\b|\bprofile.?in.?ops\b|\bactor.?ops.?events?\b|\bprofile.?ops.?corr\b|\bintel.?in.?operations?\b|\bops.?profile\b/i;

export function isOeipQuery(text) {
  return OEIP_RE.test(text || "");
}

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

function normaliseProfiles(data) {
  if (!data) return [];
  const raw =
    data.profiles || data.intel_profiles || data.items ||
    data.results || (Array.isArray(data) ? data : []);
  return raw.map((p, i) => ({
    id:         p.id          || `ip-${i}`,
    name:       p.name        || p.alias || p.title || `Profile ${i + 1}`,
    actor_type: p.actor_type  || p.type  || p.category || "UNKNOWN",
    threat:     (p.threat_level || p.threat || p.severity || "").toString().toUpperCase(),
    tags:       Array.isArray(p.tags) ? p.tags.join(" ") : (p.tags || ""),
    summary:    p.summary     || p.description || "",
  }));
}

function normaliseOpsEvents(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.events)
    ? data.events
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((e, i) => ({
    id:       e.id       || e.event_id || String(i),
    title:    e.title    || e.name     || e.summary  || `Event ${i + 1}`,
    severity: (e.severity || e.level   || "INFO").toString().toUpperCase(),
    source:   e.source   || e.service  || "",
    message:  e.message  || e.description || e.body || "",
  }));
}

function crossRef(profiles, events) {
  return profiles.map((prof) => {
    const haystack = `${prof.name} ${prof.actor_type} ${prof.tags} ${prof.summary}`;
    const matches = events
      .map((ev) => {
        const needle = `${ev.title} ${ev.source} ${ev.message}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...ev, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...prof, flagged: matches.length > 0, events: matches };
  });
}

export async function buildOeipScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [profRes, opsRes] = await Promise.all([
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
      fetch(`${base}/v1/ops/events`,         { headers: hdr }),
    ]);
    const [profData, opsData] = await Promise.all([profRes.json(), opsRes.json()]);
    const profiles = normaliseProfiles(profData);
    const events   = normaliseOpsEvents(opsData);
    const rows     = crossRef(profiles, events);
    const flagged = rows.filter((r) => r.flagged).length;
    const clear   = rows.length - flagged;
    const pct     = rows.length ? Math.round((flagged / rows.length) * 100) : 0;
    if (!rows.length) return "No intel profiles found in the system, sir.";
    const topFlagged = rows
      .filter((r) => r.flagged)
      .slice(0, 2)
      .map((r) => r.name)
      .join("; ");
    return (
      `${flagged} of ${rows.length} tracked intel profiles are correlating with active ops events (${pct}% threat-ops overlap). ` +
      (flagged > 0
        ? `Flagged actors include: ${topFlagged || "unknown"} — these subjects are appearing in live operational incident signals.`
        : `${clear} tracked profile${clear !== 1 ? "s" : ""} show no correlation with current ops events — operations are clear of tracked threat actors.`)
    );
  } catch {
    return "Unable to reach intel profiles or ops events endpoints, sir.";
  }
}

const SEV_COLOR = {
  CRITICAL: RED,
  HIGH:     ORG,
  MEDIUM:   AMB,
  WARNING:  AMB,
  INFO:     CY,
  LOW:      GRN,
};

const THREAT_COLOR = {
  CRITICAL: RED,
  HIGH:     ORG,
  MEDIUM:   AMB,
  LOW:      GRN,
  UNKNOWN:  DIM,
};

export default function OpsEventsIntelProfileNexus() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [profRes, opsRes] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
        fetch(`${base}/v1/ops/events`,         { headers: hdr }),
      ]);
      const [profData, opsData] = await Promise.all([profRes.json(), opsRes.json()]);
      const profiles = normaliseProfiles(profData);
      const events   = normaliseOpsEvents(opsData);
      setRows(crossRef(profiles, events));
    } catch {
      /* silently ignore fetch errors */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen((p) => !p); if (!rows.length) load(); };
    window.addEventListener("jarvis:oeip-toggle", handler);
    return () => window.removeEventListener("jarvis:oeip-toggle", handler);
  }, [load, rows.length]);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const flagged = rows.filter((r) => r.flagged).length;
  const clear   = rows.length - flagged;
  const pct     = rows.length ? Math.round((flagged / rows.length) * 100) : 0;

  const visible = rows
    .filter((r) => {
      if (filter === "FLAGGED") return r.flagged;
      if (filter === "CLEAR")   return !r.flagged;
      return true;
    })
    .filter((r) =>
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.actor_type.toLowerCase().includes(search.toLowerCase())
    );

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const summary = await buildOeipScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `JARVIS threat-operations brief: ${summary}` }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || summary;
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setBrief("Assessment unavailable — check backend connectivity, sir.");
    } finally {
      setAssessing(false);
    }
  };

  return (
    <>
      {/* HUD button */}
      <button
        onClick={() => { setOpen((p) => !p); if (!rows.length) load(); }}
        style={{
          position: "fixed",
          left:     BTN_LEFT,
          bottom:   8,
          zIndex:   Z_INDEX,
          background: flagged > 0 ? `${RED}22` : "rgba(0,0,0,0.55)",
          border:   `1px solid ${flagged > 0 ? RED : CY}55`,
          borderRadius: 5,
          color:    flagged > 0 ? RED : CY,
          padding:  "3px 8px",
          fontSize: 9,
          letterSpacing: 1,
          cursor:   "pointer",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ OEIP
        {flagged > 0 && (
          <span style={{ marginLeft: 5, background: RED, color: "#fff", borderRadius: 9, padding: "0 5px", fontSize: 8, fontWeight: 700 }}>
            {flagged}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            left: Math.min(BTN_LEFT, window.innerWidth - 360),
            bottom: 36,
            zIndex: Z_INDEX + 1,
            width: 340,
            maxHeight: 480,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            background: "rgba(6,12,22,0.97)",
            border: `1px solid ${CY}33`,
            borderRadius: 8,
            padding: 14,
            fontFamily: "monospace",
            backdropFilter: "blur(12px)",
          }}
        >
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>OPS EVENTS × INTEL PROFILES</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 12 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[
              { label: "PROFILES", value: rows.length, col: CY },
              { label: "FLAGGED",  value: flagged,     col: RED },
              { label: "CLEAR",    value: clear,       col: GRN },
              { label: "OVERLAP",  value: `${pct}%`,   col: pct >= 30 ? RED : pct >= 10 ? AMB : GRN },
            ].map((t) => (
              <div key={t.label} style={{ flex: 1, background: `${t.col}11`, border: `1px solid ${t.col}33`, borderRadius: 5, padding: "5px 4px", textAlign: "center" }}>
                <div style={{ color: t.col, fontSize: 12, fontWeight: 700 }}>{t.value}</div>
                <div style={{ color: DIM, fontSize: 7, letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search intel profiles…"
            style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${CY}33`, borderRadius: 4, color: "#DCEBF5", padding: "4px 8px", fontSize: 10, marginBottom: 6, outline: "none" }}
          />

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {["ALL", "FLAGGED", "CLEAR"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  flex: 1,
                  background: filter === f ? `${CY}22` : "transparent",
                  border: `1px solid ${filter === f ? CY : CY + "33"}`,
                  borderRadius: 4,
                  color: filter === f ? CY : DIM,
                  padding: "3px 0",
                  fontSize: 8,
                  cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* list */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {loading && <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 16 }}>Loading…</div>}
            {!loading && visible.length === 0 && (
              <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 16 }}>No profiles match filter.</div>
            )}
            {visible.map((prof) => (
              <div
                key={prof.id}
                onClick={() => setExpanded(expanded === prof.id ? null : prof.id)}
                style={{
                  background: prof.flagged ? `${RED}09` : "rgba(255,255,255,0.02)",
                  border: `1px solid ${prof.flagged ? RED + "33" : CY + "1A"}`,
                  borderRadius: 5,
                  padding: "6px 8px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    fontSize: 8,
                    border: `1px solid ${prof.flagged ? RED : GRN}44`,
                    borderRadius: 3,
                    padding: "1px 4px",
                    color: prof.flagged ? RED : GRN,
                    letterSpacing: 1,
                  }}>
                    {prof.flagged ? "FLAGGED" : "CLEAR"}
                  </span>
                  {prof.threat && (
                    <span style={{
                      fontSize: 8,
                      border: `1px solid ${(THREAT_COLOR[prof.threat] || DIM)}44`,
                      borderRadius: 3,
                      padding: "1px 4px",
                      color: THREAT_COLOR[prof.threat] || DIM,
                      letterSpacing: 1,
                    }}>
                      {prof.threat}
                    </span>
                  )}
                  <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{prof.name}</span>
                  {prof.flagged && (
                    <span style={{ color: DIM, fontSize: 9 }}>{prof.events.length} ev</span>
                  )}
                </div>
                {prof.actor_type && prof.actor_type !== "UNKNOWN" && (
                  <div style={{ color: DIM, fontSize: 9, marginLeft: 16 }}>{prof.actor_type.slice(0, 40)}</div>
                )}

                {expanded === prof.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${RED}22`, paddingTop: 6 }}>
                    {prof.flagged ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {prof.events.map((ev) => (
                          <div key={ev.id} style={{ background: "rgba(255,68,68,0.04)", border: `1px solid ${RED}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{
                                color: SEV_COLOR[ev.severity] || CY,
                                fontSize: 9,
                                border: `1px solid ${(SEV_COLOR[ev.severity] || CY)}44`,
                                borderRadius: 3,
                                padding: "1px 4px",
                              }}>
                                {ev.severity}
                              </span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{ev.title}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {ev.hits}</span>
                            </div>
                            {ev.source && (
                              <div style={{ color: DIM, fontSize: 8, marginTop: 2 }}>{ev.source}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No ops events matched this profile — not appearing in current operational signals.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${RED}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: `${RED}18`,
                border: `1px solid ${RED}55`,
                borderRadius: 5,
                color: RED,
                padding: "5px 12px",
                cursor: "pointer",
                fontSize: 10,
                letterSpacing: 1,
                width: "100%",
                opacity: assessing ? 0.6 : 1,
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5, borderLeft: `2px solid ${RED}`, paddingLeft: 8 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
