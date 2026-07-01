/**
 * F64 — Contact × IntelProfile Network Linker
 *
 * Parallel-fetches /entities/Contact + /entities/IntelProfile, then
 * keyword-correlates each contact (name / role / org / department / notes)
 * against every intel profile (name / description / type / threat_level /
 * aliases) to surface LINKED contacts (those who appear in active intel
 * profiles) vs UNLINKED.
 *
 * Stat tiles: contacts / profiles / linked / unlinked.
 * Filter tabs: ALL | LINKED | UNLINKED.
 * Text search over name / role / org.
 * Expand any contact → matched intel profiles with threat level + type badge + score.
 * ▶ ASSESS: /v1/jarvis/agent/chat 2-sentence contact-intel brief + TTS.
 *
 * Toggle:  ◈ CINTL  at bottom:8 left:13820, zIndex 69.
 * Voice:   "contact intel / contact profiles / contact threat link /
 *           which contacts are flagged / who is in an intel profile / cintl"
 * Event:   jarvis:cintl-toggle
 * Refresh: 5 min auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 13820;
const POLL_MS  = 300_000; // 5 min

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ──────────────────────────────────────────────────

const CINTL_RE =
  /\b(contact\s+intel(?:ligence)?|contact\s+profile?s?|contact\s+threat\s+link|which\s+contacts?\s+are\s+flagged|who\s+is\s+in\s+(an?\s+)?intel\s+profile|contacts?\s+in\s+intel|cintl)\b/i;

export function isCtintlQuery(q) { return CINTL_RE.test(q); }

export async function buildCtintlScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [cRes, iRes] = await Promise.all([
      fetch(`${base}/entities/Contact`,      { headers: hdr }),
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
    ]);
    const cRaw = await cRes.json();
    const iRaw = await iRes.json();
    const contacts = normaliseContacts(cRaw);
    const profiles = normaliseProfiles(iRaw);

    const linked = contacts.filter((c) =>
      profiles.some((p) => relevance(c, p) > 0)
    ).length;
    const unlinked = contacts.length - linked;

    const topProfile = profiles.find((p) => p.threat === "critical") ||
                       profiles.find((p) => p.threat === "high") ||
                       profiles[0];

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS contact-intelligence correlation: ${contacts.length} contacts, ` +
          `${profiles.length} active intel profiles, ${linked} contacts appear in intel profiles, ` +
          `${unlinked} contacts have no intelligence file. ` +
          `${topProfile ? `Highest-threat profile: "${topProfile.name}" (${topProfile.threat}). ` : ""}` +
          `Give a 2-sentence contact-intelligence network brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Contact-intelligence correlation complete, sir.").trim();
  } catch {
    return "Contact-intel network linker unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseContacts(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.data)                ? raw.data
    : Array.isArray(raw?.contacts)            ? raw.contacts
    : Array.isArray(raw?.items)               ? raw.items
    : Array.isArray(raw?.results)             ? raw.results
    : [];
  return arr.map((c, i) => ({
    id:         c.id           || String(i),
    name:       c.name         || c.full_name || `Contact ${i + 1}`,
    role:       c.role         || c.title     || c.position   || "",
    org:        c.organisation || c.org       || c.company    || c.employer || "",
    department: c.department   || c.dept      || "",
    email:      c.email        || "",
    tags:       Array.isArray(c.tags) ? c.tags.join(" ") : (c.tags || ""),
    notes:      (c.notes       || c.bio       || c.description || "").toString().slice(0, 200),
  }));
}

const THREAT_ORDER = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };

function normaliseProfiles(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.data)                ? raw.data
    : Array.isArray(raw?.profiles)            ? raw.profiles
    : Array.isArray(raw?.items)               ? raw.items
    : Array.isArray(raw?.results)             ? raw.results
    : [];
  return arr
    .map((p, i) => ({
      id:          p.id          || String(i),
      name:        p.name        || p.subject || p.title || `Profile ${i + 1}`,
      type:        p.type        || p.profile_type || p.category || "",
      threat:      (p.threat_level || p.threat || p.severity || "unknown").toLowerCase(),
      description: (p.description || p.summary  || p.details  || "").toString().slice(0, 300),
      aliases:     Array.isArray(p.aliases) ? p.aliases.join(" ") : (p.aliases || ""),
      organisation: p.organisation || p.org || p.affiliation || "",
    }))
    .sort((a, b) => (THREAT_ORDER[a.threat] ?? 9) - (THREAT_ORDER[b.threat] ?? 9));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(contact, profile) {
  const cw = keywords(
    `${contact.name} ${contact.org} ${contact.department} ${contact.notes} ${contact.tags}`
  );
  const pw = keywords(
    `${profile.name} ${profile.description} ${profile.aliases} ${profile.organisation}`
  );
  return cw.filter((w) => pw.some((r) => r.includes(w) || w.includes(r))).length;
}

function buildCorrelated(contacts, profiles) {
  return contacts.map((c) => {
    const matched = profiles
      .map((p) => ({ ...p, score: relevance(c, p) }))
      .filter((p) => p.score > 0)
      .sort((a, b) => (THREAT_ORDER[a.threat] ?? 9) - (THREAT_ORDER[b.threat] ?? 9) || b.score - a.score);
    return { ...c, profiles: matched, linked: matched.length > 0 };
  });
}

function threatColor(t) {
  if (t === "critical") return "#FF3333";
  if (t === "high")     return "#FF8800";
  if (t === "medium")   return "#FFD700";
  if (t === "low")      return "#4ADE80";
  return "#6B7280";
}

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "LINKED", "UNLINKED"];

export default function ContactIntelLinker() {
  const [open,      setOpen]      = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [profiles,  setProfiles]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [cRes, iRes] = await Promise.all([
        fetch(`${base}/entities/Contact`,      { headers: hdr }),
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
      ]);
      const cRaw = await cRes.json();
      const iRaw = await iRes.json();
      setContacts(normaliseContacts(cRaw));
      setProfiles(normaliseProfiles(iRaw));
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
    window.addEventListener("jarvis:cintl-toggle", onToggle);
    return () => window.removeEventListener("jarvis:cintl-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isCtintlQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated = buildCorrelated(contacts, profiles);
  const linked   = correlated.filter((c) => c.linked).length;
  const unlinked = correlated.filter((c) => !c.linked).length;

  const q = search.toLowerCase();
  const visible = correlated.filter((c) => {
    if (filter === "LINKED")   return c.linked;
    if (filter === "UNLINKED") return !c.linked;
    return true;
  }).filter((c) =>
    !q ||
    c.name.toLowerCase().includes(q) ||
    c.role.toLowerCase().includes(q) ||
    c.org.toLowerCase().includes(q)
  );

  async function assess() {
    setAssessing(true);
    const text = await buildCtintlScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Contact–Intel Profile Linker (◈ CINTL)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ CINTL{linked > 0 && (
          <span style={{
            marginLeft: 4, background: "#FF8800", color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{linked}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: Math.max(8, BTN_LEFT - 260),
          width: 340,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${C.neon}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "68vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: C.neon, letterSpacing: 2, fontWeight: 700 }}>
              CONTACT–INTEL LINKER
            </span>
            <button
              onClick={assess}
              disabled={assessing || contacts.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || contacts.length === 0) ? 0.4 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 12px",
          }}>
            {[
              { label: "CONTACTS",  val: contacts.length,  color: C.neon    },
              { label: "PROFILES",  val: profiles.length,  color: C.blue    },
              { label: "LINKED",    val: linked,           color: "#FF8800" },
              { label: "UNLINKED",  val: unlinked,         color: "#4ADE80" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 6,
                padding: "5px 4px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: S.fs.lg, fontWeight: 700 }}>{val}</div>
                <div style={{ color: S.text, fontSize: "8px", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 12px 4px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1, background: filter === t ? `${C.neon}22` : "transparent",
                border: `1px solid ${filter === t ? C.neon : S.border}`,
                color: filter === t ? C.neon : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 12px 6px" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search name / role / org…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,0,0,0.3)", border: `1px solid ${S.border}`,
                borderRadius: S.radius, color: S.textHi,
                fontFamily: S.mono, fontSize: "9px", padding: "3px 7px",
                outline: "none",
              }}
            />
          </div>

          {/* Contact list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && contacts.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No contacts match.</div>
            ) : visible.map((c) => (
              <div key={c.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${c.linked ? "#FF8800" : "#4ADE80"}`,
                  }}
                >
                  <span style={{ color: c.linked ? "#FF8800" : "#4ADE80", fontSize: 10, width: 10 }}>
                    {c.linked ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                  </span>
                  {c.role && (
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${C.blue}22`, color: C.blue,
                      border: `1px solid ${C.blue}44`,
                      maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {c.role}
                    </span>
                  )}
                  <span style={{ color: c.linked ? "#FF8800" : "#4ADE80", fontSize: "9px", minWidth: 50, textAlign: "right" }}>
                    {c.linked ? `${c.profiles.length} PRFL` : "CLEAN"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === c.id ? "▴" : "▾"}</span>
                </div>

                {expanded === c.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {c.org && (
                      <div style={{ color: S.text, fontSize: "8px", marginBottom: 4 }}>
                        org: <span style={{ color: S.textHi }}>{c.org}</span>
                        {c.department && <span style={{ color: S.text }}> / {c.department}</span>}
                      </div>
                    )}
                    {c.linked ? c.profiles.map((p) => (
                      <div key={p.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "3px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        <span style={{
                          fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                          background: `${threatColor(p.threat)}22`, color: threatColor(p.threat),
                          border: `1px solid ${threatColor(p.threat)}55`,
                          whiteSpace: "nowrap", textTransform: "uppercase",
                        }}>
                          {p.threat}
                        </span>
                        <span style={{ color: S.textHi, fontSize: "9px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.name}
                        </span>
                        {p.type && (
                          <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap" }}>
                            {p.type}
                          </span>
                        )}
                        <span style={{ color: C.blue, fontSize: "9px", marginLeft: 2, whiteSpace: "nowrap" }}>
                          rel:{p.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No intel profiles linked to this contact.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "8px", letterSpacing: 0.5,
          }}>
            /entities/Contact · /entities/IntelProfile · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
