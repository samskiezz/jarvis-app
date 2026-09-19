/**
 * IntelProfileInvestigationNexus — F496
 * "JARVIS, intel profile investigations / threat actor cases /
 *  who is being investigated / tracked subjects with cases /
 *  subject investigation / profile cases / ipinv"
 * Cross-references /entities/IntelProfile + /v1/investigations.
 * Keyword-matches investigation titles/subjects against profile names/aliases/tags.
 * LINKED vs UNLINKED profiles; click-to-expand matched investigations; ▶ ASSESS → agent/chat + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const RED = "#FF4466";
const AMB = "#FFD700";
const ORG = "#FF8C42";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 90_000;

const IPINV_RE =
  /\bintel.?profile.?invest\w*\b|\bthreat.?actor.?case\b|\bwho.?is.?being.?invest\w*\b|\btracked.?subject.?with.?case\b|\bsubject.?invest\w*\b|\bprofile.?case\b|\bipinv\b|\bprofile.?invest\w*\b|\bintel.?case\b|\bsubject.?case\b/i;

export function isIpinvQuery(text) {
  return IPINV_RE.test(text || "");
}

function normaliseProfiles(data) {
  if (!data) return [];
  const raw =
    data.profiles || data.intel_profiles || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((p, i) => ({
    id:       p.id || `ip-${i}`,
    name:     (p.name || p.subject || p.alias || p.title || `Subject ${i + 1}`).trim(),
    threat:   (p.threat_level || p.threat || p.risk_level || "UNKNOWN").toUpperCase(),
    role:     p.role || p.type || p.category || null,
    summary:  p.summary || p.description || p.notes || null,
    aliases:  (p.aliases || p.known_aliases || []).map(a => String(a).toLowerCase()),
    tags: [
      ...(p.tags || []),
      ...(p.labels || []),
      p.affiliation, p.nationality, p.sector, p.category,
    ].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function normaliseInvestigations(data) {
  if (!data) return [];
  const raw =
    data.investigations || data.cases || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((inv, i) => ({
    id:      inv.id || `inv-${i}`,
    name:    (inv.title || inv.name || inv.subject || `Case ${i + 1}`).trim(),
    status:  (inv.status || inv.state || "OPEN").toUpperCase(),
    lead:    inv.lead || inv.assigned_to || inv.owner || null,
    summary: inv.summary || inv.description || null,
    tags: [
      ...(inv.tags || []),
      ...(inv.labels || []),
      inv.subject, inv.category, inv.lead,
    ].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function buildNexus(profiles, investigations) {
  return profiles.map(p => {
    const pName = p.name.toLowerCase();
    const pAliases = p.aliases;
    const matched = investigations.filter(inv => {
      const iName    = inv.name.toLowerCase();
      const iSummary = (inv.summary || "").toLowerCase();
      const nameHit  =
        iName.includes(pName) || pName.includes(iName) ||
        iSummary.includes(pName) ||
        pAliases.some(a => iName.includes(a) || iSummary.includes(a));
      const tagHit   = p.tags.some(pt =>
        inv.tags.some(it => it && pt && (it.includes(pt) || pt.includes(it)))
      );
      return nameHit || tagHit;
    });
    return { profile: p, investigations: matched, linked: matched.length > 0 };
  });
}

export async function buildIpinvScript() {
  let profileData = null, invData = null;
  try {
    const [pr, ir] = await Promise.all([
      fetch(`${apiBase()}/entities/IntelProfile`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/investigations`,      { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    if (pr.ok) profileData = await pr.json();
    if (ir.ok) invData     = await ir.json();
  } catch (_) {}

  if (!profileData && !invData)
    return "Unable to retrieve intel profile investigation nexus data at this time, sir.";

  const profiles       = normaliseProfiles(profileData);
  const investigations = normaliseInvestigations(invData);
  const nexus          = buildNexus(profiles, investigations);
  const linked         = nexus.filter(r => r.linked);
  const unlinked       = nexus.filter(r => !r.linked);
  const pct            = nexus.length ? Math.round((linked.length / nexus.length) * 100) : 0;

  if (!nexus.length)
    return `Intel Profile Investigation Nexus: ${profiles.length} profiles and ${investigations.length} investigations scanned. No cross-reference data available, sir.`;

  const top = linked.slice(0, 2).map(r =>
    `${r.profile.name} (${r.investigations.length} case${r.investigations.length !== 1 ? "s" : ""})`
  ).join("; ");

  return [
    `Intel Profile Investigation Nexus: ${linked.length} of ${nexus.length} tracked profiles have active investigation links (${pct}%).`,
    unlinked.length
      ? `${unlinked.length} subject${unlinked.length !== 1 ? "s" : ""} not yet formally investigated.`
      : "All tracked subjects have linked cases.",
    top ? `Key subjects: ${top}.` : null,
  ].filter(Boolean).join(" ");
}

const THREAT_COLOR = {
  CRITICAL: RED, HIGH: ORG, MEDIUM: AMB, LOW: GRN, UNKNOWN: DIM,
};
function threatColor(level) {
  return THREAT_COLOR[level] || DIM;
}

const INV_STATUS_COLOR = {
  OPEN: GRN, ACTIVE: CY, ESCALATED: RED, CLOSED: DIM, RESOLVED: DIM,
};
function invStatusColor(status) {
  return INV_STATUS_COLOR[status] || DIM;
}

export default function IntelProfileInvestigationNexus() {
  const [open,      setOpen]      = useState(false);
  const [nexus,     setNexus]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [lastTs,    setLastTs]    = useState(null);
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, ir] = await Promise.all([
        fetch(`${apiBase()}/entities/IntelProfile`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/v1/investigations`,      { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const profileData = pr.ok ? await pr.json() : null;
      const invData     = ir.ok ? await ir.json() : null;
      const profiles    = normaliseProfiles(profileData);
      const invs        = normaliseInvestigations(invData);
      setNexus(buildNexus(profiles, invs));
      setLastTs(Date.now());
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen(o => { if (!o) load(); return !o; });
    };
    window.addEventListener("jarvis:ipinv-toggle", toggle);
    return () => window.removeEventListener("jarvis:ipinv-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async (row) => {
    setAssessing(row.profile.id);
    try {
      const caseNames = row.investigations
        .map(i => `${i.name} [${i.status}]`)
        .join("; ");
      const prompt = `Briefly assess the investigation coverage for intel profile "${row.profile.name}" (threat: ${row.profile.threat}). Linked cases: ${caseNames || "none"}. Two sentences max.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      if (r.ok) {
        const d   = await r.json();
        const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
        if (txt) {
          await fetch(`${apiBase()}/v1/voice/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
            body: JSON.stringify({ text: txt, voice: "onyx" }),
          });
        }
      }
    } catch (_) {}
    finally { setAssessing(null); }
  }, []);

  const linked   = nexus.filter(r => r.linked);
  const unlinked = nexus.filter(r => !r.linked);
  const pct      = nexus.length ? Math.round((linked.length / nexus.length) * 100) : 0;

  const visible = nexus.filter(row => {
    if (filter === "LINKED"   && !row.linked) return false;
    if (filter === "UNLINKED" &&  row.linked) return false;
    if (search && !row.profile.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => { setOpen(o => { if (!o) load(); return !o; }); }}
        style={{
          position: "fixed", left: 22960, bottom: 8, zIndex: 85,
          background: open ? CY : "rgba(0,20,40,0.92)",
          color: open ? "#000" : CY,
          border: `1px solid ${unlinked.length > 0 ? AMB : CY}`,
          borderRadius: 4, padding: "3px 8px",
          fontSize: 10, fontFamily: "monospace", letterSpacing: 1,
          cursor: "pointer", whiteSpace: "nowrap",
        }}
        title="Intel Profile × Investigation Nexus (IPINV)"
      >
        ◈ IPINV{unlinked.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMB, color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{unlinked.length}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 85,
          width: 500, maxHeight: "72vh",
          background: "rgba(0,12,28,0.97)",
          border: `1px solid ${CY}`,
          borderRadius: 8, overflow: "hidden",
          display: "flex", flexDirection: "column",
          boxShadow: `0 0 24px ${CY}44`,
          fontFamily: "monospace",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${CY}33`,
            background: "rgba(41,231,255,0.06)",
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
              ◈ INTEL PROFILE × INVESTIGATION NEXUS
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {loading && <span style={{ color: DIM, fontSize: 9 }}>SCANNING…</span>}
              {lastTs && !loading && (
                <span style={{ color: DIM, fontSize: 9 }}>
                  {new Date(lastTs).toLocaleTimeString()}
                </span>
              )}
              <button
                onClick={load}
                style={{ background: "none", border: `1px solid ${CY}44`, color: CY,
                         borderRadius: 3, padding: "1px 6px", fontSize: 9, cursor: "pointer" }}
              >↺</button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: DIM,
                         fontSize: 13, cursor: "pointer", lineHeight: 1 }}
              >✕</button>
            </div>
          </div>

          {/* Stats bar */}
          <div style={{
            display: "flex", gap: 16, padding: "6px 12px",
            borderBottom: `1px solid ${CY}22`,
          }}>
            {[
              ["PROFILES",   nexus.length,      CY],
              ["LINKED",     linked.length,     GRN],
              ["UNLINKED",   unlinked.length,   unlinked.length > 0 ? AMB : DIM],
              ["COVERAGE",   `${pct}%`,         pct >= 80 ? GRN : pct >= 50 ? AMB : RED],
            ].map(([label, val, col]) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ color: col, fontSize: 14, fontWeight: "bold" }}>{val}</div>
                <div style={{ color: DIM, fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Search + filter tabs */}
          <div style={{ padding: "6px 12px", borderBottom: `1px solid ${CY}22` }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search profiles…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}44`,
                borderRadius: 4, padding: "4px 8px", color: "#d0e8ff", fontSize: 10,
                fontFamily: "monospace", outline: "none", marginBottom: 6,
              }}
            />
            <div style={{ display: "flex", gap: 4 }}>
              {["ALL", "LINKED", "UNLINKED"].map(t => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  style={{
                    background: filter === t ? (t === "UNLINKED" ? AMB : CY) : "rgba(41,231,255,0.08)",
                    color: filter === t ? "#000" : (t === "UNLINKED" ? AMB : CY),
                    border: `1px solid ${t === "UNLINKED" ? AMB + "88" : CY + "55"}`,
                    borderRadius: 3, padding: "1px 6px", fontSize: 8, cursor: "pointer", letterSpacing: 1,
                  }}
                >{t}</button>
              ))}
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, padding: 16, textAlign: "center" }}>
                No profiles match this filter.
              </div>
            )}
            {visible.map(row => {
              const isExp  = expanded === row.profile.id;
              const tCol   = threatColor(row.profile.threat);
              return (
                <div
                  key={row.profile.id}
                  style={{ borderBottom: `1px solid ${CY}18`, padding: "8px 12px", cursor: "pointer" }}
                  onClick={() => setExpanded(isExp ? null : row.profile.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        background: tCol + "22", color: tCol,
                        border: `1px solid ${tCol}55`,
                        borderRadius: 3, padding: "1px 5px", fontSize: 8, letterSpacing: 1,
                      }}>{row.profile.threat}</span>
                      <span style={{
                        background: row.linked ? GRN + "22" : AMB + "22",
                        color: row.linked ? GRN : AMB,
                        border: `1px solid ${row.linked ? GRN : AMB}55`,
                        borderRadius: 3, padding: "1px 5px", fontSize: 8, letterSpacing: 1,
                      }}>
                        {row.linked
                          ? `${row.investigations.length} CASE${row.investigations.length !== 1 ? "S" : ""}`
                          : "UNLINKED"}
                      </span>
                      <span style={{ color: "#e0f0ff", fontSize: 11 }}>{row.profile.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {row.linked && (
                        <button
                          onClick={e => { e.stopPropagation(); assess(row); }}
                          disabled={assessing === row.profile.id}
                          style={{
                            background: "none", border: `1px solid ${CY}55`, color: CY,
                            borderRadius: 3, padding: "1px 5px", fontSize: 8, cursor: "pointer",
                            opacity: assessing === row.profile.id ? 0.5 : 1,
                          }}
                        >
                          {assessing === row.profile.id ? "…" : "▶ ASSESS"}
                        </button>
                      )}
                      <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {row.profile.role && !isExp && (
                    <div style={{ color: DIM, fontSize: 9, marginTop: 3, lineHeight: 1.4 }}>
                      {row.profile.role}
                    </div>
                  )}

                  {isExp && (
                    <div style={{ marginTop: 6, paddingLeft: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {row.profile.role && (
                        <div style={{ color: DIM, fontSize: 9 }}>
                          Role: <span style={{ color: AMB }}>{row.profile.role}</span>
                        </div>
                      )}
                      {row.profile.summary && (
                        <div style={{ color: "#9ab8d0", fontSize: 9, lineHeight: 1.4, marginBottom: 4 }}>
                          {row.profile.summary.slice(0, 160)}{row.profile.summary.length > 160 ? "…" : ""}
                        </div>
                      )}
                      {row.investigations.length === 0 && (
                        <div style={{ color: AMB, fontSize: 9 }}>
                          No investigations currently linked to this profile.
                        </div>
                      )}
                      {row.investigations.map(inv => {
                        const iCol = invStatusColor(inv.status);
                        return (
                          <div key={inv.id} style={{
                            background: "rgba(41,231,255,0.04)",
                            border: `1px solid ${iCol}33`,
                            borderRadius: 4, padding: "5px 8px",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{
                                background: iCol + "22", color: iCol,
                                border: `1px solid ${iCol}55`,
                                borderRadius: 3, padding: "0 4px", fontSize: 7, letterSpacing: 1,
                              }}>{inv.status}</span>
                              <span style={{ color: "#c0d8f0", fontSize: 10 }}>{inv.name}</span>
                            </div>
                            {inv.lead && (
                              <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>
                                Lead: <span style={{ color: CY }}>{inv.lead}</span>
                              </div>
                            )}
                            {inv.summary && (
                              <div style={{ color: DIM, fontSize: 9, marginTop: 2, lineHeight: 1.4 }}>
                                {inv.summary.slice(0, 140)}{inv.summary.length > 140 ? "…" : ""}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "5px 12px", borderTop: `1px solid ${CY}22`,
            color: DIM, fontSize: 8, letterSpacing: 1,
          }}>
            AUTO-REFRESH {POLL_MS / 1000}s · /entities/IntelProfile + /v1/investigations
          </div>
        </div>
      )}
    </>
  );
}
