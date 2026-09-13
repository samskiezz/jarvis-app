/**
 * LiveIntelContactAlerter — F221.
 *
 * Parallel-fetches /functions/getLiveIntel (quakes, crypto, FX)
 * and /entities/Contact (the personnel directory).
 *
 * Derives discrete live events and keyword-correlates each against
 * contacts (name / role / department / tags / notes / email) to
 * surface:
 *   RELEVANT — contact expertise matches the live event
 *   GENERAL  — no clear keyword overlap
 *
 * Stat tiles: events / contacts / relevant / general
 * Filter tabs: ALL | RELEVANT | GENERAL + text search
 * Expand event → matched contacts with role badge + score bar.
 * ▶ ALERT per event → /v1/jarvis/agent/chat 2-sentence outreach
 *   recommendation + TTS via jarvis:speak-dossier.
 * 5-min auto-refresh.
 *
 * Intent: "live intel contact" / "contact alert" / "who to contact" /
 *         "alert contacts" / "lictx" / "contact expertise" /
 *         "who knows about" / "relevant contacts" / "intel contact match"
 *   → jarvis:lictx-toggle + TTS brief via buildLictxScript()
 *
 * Toggle: ◈ LICTX at left:35820, bottom:8, zIndex:75.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getLiveIntel } from "@/api/backendFunctions";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF4466";
const PUR   = "#A78BFA";

const BTN_LEFT   = 35820;
const REFRESH_MS = 300_000; // 5 min

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── intent exports ───────────────────────────────────────────────────────────

const LICTX_RE =
  /\b(live.?intel.?contact|contact.?alert|who.?to.?contact|alert.?contacts?|lictx|contact.?expertise|who.?knows.?about|relevant.?contacts?|intel.?contact.?match|which.?contacts.?cover|contact.?intel.?match)\b/i;

export function isLictxQuery(t) { return LICTX_RE.test(t || ""); }

export async function buildLictxScript() {
  try {
    const [intelRaw, ctRaw] = await Promise.all([
      getLiveIntel(),
      fetch(`${apiBase()}/entities/Contact`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.ok ? r.json() : []),
    ]);
    const events   = extractLiveEvents(intelRaw);
    const contacts = normaliseContacts(ctRaw);
    const correlated = correlate(events, contacts);
    const relevant  = correlated.filter((e) => e.matched.length > 0).length;
    const top = correlated
      .filter((e) => e.matched.length > 0)
      .sort((a, b) => b.matched.length - a.matched.length)
      .slice(0, 2)
      .map((e) => `${e.label} (${e.matched[0]?.name})`)
      .join("; ");
    return (
      `Live-intel contact alerter: ${events.length} live events, ` +
      `${contacts.length} contacts — ${relevant} events have relevant contacts. ` +
      (top ? `Top matches: ${top}. ` : "") +
      "Opening panel now, sir."
    );
  } catch {
    return "Live intel contact alerter is online. Opening now, sir.";
  }
}

// ─── normalisers ─────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseContacts(raw) {
  return normaliseArray(raw).map((c) => ({
    id:    c.id || c._id || String(Math.random()),
    name:  c.name || c.full_name || c.display_name || "Unknown",
    role:  c.role || c.title || c.position || "",
    dept:  c.department || c.dept || c.team || "",
    tags:  Array.isArray(c.tags) ? c.tags.join(" ") : (c.tags || ""),
    notes: c.notes || c.bio || c.description || "",
    email: c.email || "",
    org:   c.organisation || c.organization || c.company || c.org || "",
  }));
}

function extractLiveEvents(data) {
  const events = [];

  const quakes = Array.isArray(data?.earthquakes) ? data.earthquakes
    : Array.isArray(data?.seismic) ? data.seismic : [];
  for (const q of quakes) {
    const place = q.place || q.location || q.region || "";
    const mag   = q.magnitude || q.mag || 0;
    const id    = q.id || `quake-${place}-${mag}`;
    events.push({
      id,
      label: `M${mag} — ${place || "Unknown location"}`,
      kind:  "QUAKE",
      severity: mag >= 6 ? "critical" : mag >= 5 ? "high" : mag >= 4 ? "medium" : "low",
      keywords: [
        "earthquake", "seismic", "geology", "disaster", "emergency", "crisis",
        "infrastructure", "resilience", "risk",
        ...place.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2),
      ],
      meta: `magnitude ${mag}`,
    });
  }

  const markets = Array.isArray(data?.markets) ? data.markets : [];
  for (const m of markets) {
    const sym    = m.symbol || m.ticker || m.name || "";
    const disp   = m.display || m.name || sym;
    const chg    = m.change_pct ?? m.changePercent ?? m.pct_change ?? null;
    const atype  = m.asset_type === "FX" || m.type === "FX" ? "FX" : "CRYPTO";
    if (!sym) continue;
    events.push({
      id:       `${atype}-${sym}`,
      label:    `${disp} (${sym})`,
      kind:     atype,
      severity: chg != null && Math.abs(chg) >= 5 ? "high" : "medium",
      keywords: [
        sym.toLowerCase(), disp.toLowerCase(), atype.toLowerCase(),
        "market", "trading", "finance", "investment", "portfolio",
        "crypto", "currency", "forex", "economics", "financial",
        ...disp.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2),
      ],
      meta: chg != null ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : "—",
    });
  }

  return events;
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function contactScore(event, contact) {
  const haystack = `${contact.name} ${contact.role} ${contact.dept} ${contact.tags} ${contact.notes} ${contact.org}`.toLowerCase();
  return event.keywords.reduce((acc, kw) => acc + (haystack.includes(kw) ? 1 : 0), 0)
    + tokens(event.label).reduce((acc, w) => acc + (haystack.includes(w) ? 1 : 0), 0);
}

function correlate(events, contacts) {
  return events.map((ev) => {
    const matched = contacts
      .map((c) => ({ ...c, _score: contactScore(ev, c) }))
      .filter((c) => c._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...ev, matched };
  });
}

// ─── severity colours ─────────────────────────────────────────────────────────

function sevColor(s) {
  if (s === "critical") return RED;
  if (s === "high")     return AMBER;
  if (s === "medium")   return CY;
  return GREEN;
}

function kindBadge(kind) {
  if (kind === "QUAKE")  return { label: "QUAKE",  bg: `${RED}22`,   color: RED };
  if (kind === "CRYPTO") return { label: "CRYPTO", bg: `${PUR}22`,   color: PUR };
  return                        { label: "FX",     bg: `${AMBER}22`, color: AMBER };
}

// ─── component ────────────────────────────────────────────────────────────────

export default function LiveIntelContactAlerter() {
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [rows,     setRows]     = useState([]);   // correlated events
  const [contacts, setContacts] = useState([]);
  const [tab,      setTab]      = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing,setAssessing]= useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [intelRaw, ctRaw] = await Promise.all([
        getLiveIntel(),
        fetch(`${apiBase()}/entities/Contact`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.ok ? r.json() : []),
      ]);
      const evs  = extractLiveEvents(intelRaw);
      const cts  = normaliseContacts(ctRaw);
      setContacts(cts);
      setRows(correlate(evs, cts));
    } catch {
      // leave previous data on network error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen((o) => !o); };
    window.addEventListener("jarvis:lictx-toggle", onToggle);
    return () => window.removeEventListener("jarvis:lictx-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess(ev) {
    setAssessing(ev.id);
    const ctx = ev.matched.length
      ? `Live event: ${ev.label} (${ev.kind}, ${ev.meta}). Relevant contacts: ${ev.matched.map((c) => `${c.name} (${c.role || c.dept || "contact"})`).join(", ")}.`
      : `Live event: ${ev.label} (${ev.kind}, ${ev.meta}). No contacts with direct expertise found.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Who in this network should be alerted and why? ${ctx} Reply in 2 sentences.` }),
      });
      const d = await r.json();
      const text = (d.answer || "").trim() || "I recommend alerting the most relevant contacts immediately, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "I could not reach the reasoning core. Please review the matched contacts manually, sir." },
      }));
    } finally {
      setAssessing(null);
    }
  }

  // ── derived ──────────────────────────────────────────────────────────────────

  const relevant = rows.filter((e) => e.matched.length > 0).length;
  const general  = rows.length - relevant;

  const filtered = rows.filter((e) => {
    if (tab === "RELEVANT" && e.matched.length === 0) return false;
    if (tab === "GENERAL"  && e.matched.length > 0)  return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        e.label.toLowerCase().includes(s) ||
        e.kind.toLowerCase().includes(s) ||
        e.matched.some((c) => c.name.toLowerCase().includes(s) || c.role.toLowerCase().includes(s))
      );
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Live Intel × Contact Expertise Alerter"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 75,
          background: "rgba(5,10,18,0.82)", border: `1px solid ${CY}55`,
          color: CY, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10, letterSpacing: 1, padding: "4px 10px",
          borderRadius: 6, cursor: "pointer", backdropFilter: "blur(6px)",
        }}
      >
        {relevant > 0 && (
          <span style={{
            display: "inline-block", width: 7, height: 7, borderRadius: "50%",
            background: AMBER, marginRight: 5, verticalAlign: "middle",
          }} />
        )}
        ◈ LICTX
      </button>
    );
  }

  // ── panel ────────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: "fixed", top: 60, right: 18, width: "min(560px,96vw)",
      maxHeight: "82vh", zIndex: 9500,
      background: "rgba(4,8,16,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 14, overflow: "hidden",
      boxShadow: `0 0 60px ${CY}18, 0 24px 48px rgba(0,0,0,0.9)`,
      fontFamily: "'JetBrains Mono',monospace", display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px", borderBottom: `1px solid ${CY}2A`,
        display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
      }}>
        <span style={{ color: CY, fontSize: 16 }}>◈</span>
        <span style={{ color: CY, fontSize: 12, letterSpacing: 2, flex: 1 }}>
          LIVE INTEL × CONTACT ALERTER
        </span>
        {loading && <span style={{ color: `${CY}88`, fontSize: 10 }}>refreshing…</span>}
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "#4E6070", cursor: "pointer", fontSize: 16 }}
        >
          ✕
        </button>
      </div>

      {/* Stat tiles */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4,1fr)",
        gap: 8, padding: "10px 14px", borderBottom: `1px solid ${CY}1A`, flexShrink: 0,
      }}>
        {[
          { label: "EVENTS",    value: rows.length,    color: CY },
          { label: "CONTACTS",  value: contacts.length, color: CY },
          { label: "RELEVANT",  value: relevant,         color: AMBER },
          { label: "GENERAL",   value: general,          color: "#4E6070" },
        ].map((t) => (
          <div key={t.label} style={{
            background: "rgba(255,255,255,0.03)", borderRadius: 8,
            padding: "8px 10px", textAlign: "center",
          }}>
            <div style={{ color: t.color, fontSize: 20, fontWeight: 700 }}>{t.value}</div>
            <div style={{ color: "#3A5060", fontSize: 9, letterSpacing: 1 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{
        display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${CY}1A`,
        flexShrink: 0, flexWrap: "wrap", alignItems: "center",
      }}>
        {["ALL", "RELEVANT", "GENERAL"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${CY}18` : "transparent",
              border: `1px solid ${tab === t ? CY : `${CY}33`}`,
              color: tab === t ? CY : "#4E6070",
              borderRadius: 5, padding: "3px 10px",
              fontSize: 10, letterSpacing: 1, cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search events or contacts…"
          style={{
            flex: 1, minWidth: 140, background: "rgba(255,255,255,0.04)",
            border: `1px solid ${CY}33`, borderRadius: 5,
            padding: "3px 10px", color: "#DCEBF5", fontSize: 11,
            fontFamily: "inherit", outline: "none",
          }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
        {filtered.length === 0 && (
          <div style={{ padding: "24px", textAlign: "center", color: "#2E4050", fontSize: 12 }}>
            {loading ? "Loading live intel…" : "No events match the current filter."}
          </div>
        )}
        {filtered.map((ev) => {
          const badge = kindBadge(ev.kind);
          const isExp = expanded === ev.id;
          return (
            <div key={ev.id}>
              {/* Row */}
              <div
                onClick={() => setExpanded(isExp ? null : ev.id)}
                style={{
                  padding: "9px 14px", cursor: "pointer",
                  borderLeft: `2px solid ${ev.matched.length > 0 ? AMBER : `${CY}22`}`,
                  borderBottom: `1px solid ${CY}12`,
                  display: "flex", alignItems: "center", gap: 10,
                  background: isExp ? `${CY}08` : "transparent",
                }}
              >
                <span style={{
                  fontSize: 9, padding: "2px 6px", borderRadius: 4,
                  background: badge.bg, color: badge.color, letterSpacing: 1, flexShrink: 0,
                }}>
                  {badge.label}
                </span>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: sevColor(ev.severity), flexShrink: 0,
                  boxShadow: ev.severity === "critical" ? `0 0 8px ${RED}` : "none",
                }} />
                <span style={{ color: "#AECCD8", fontSize: 12, flex: 1, minWidth: 0 }}>
                  {ev.label}
                </span>
                <span style={{ color: `${CY}88`, fontSize: 10, flexShrink: 0 }}>
                  {ev.meta}
                </span>
                <span style={{
                  fontSize: 10, padding: "1px 8px", borderRadius: 4, flexShrink: 0,
                  background: ev.matched.length > 0 ? `${AMBER}18` : "transparent",
                  color: ev.matched.length > 0 ? AMBER : "#2E4050",
                  border: `1px solid ${ev.matched.length > 0 ? AMBER : "#2E4050"}`,
                }}>
                  {ev.matched.length > 0 ? `${ev.matched.length} contact${ev.matched.length !== 1 ? "s" : ""}` : "general"}
                </span>
              </div>

              {/* Expanded: matched contacts */}
              {isExp && (
                <div style={{
                  background: "rgba(0,0,0,0.3)", borderBottom: `1px solid ${CY}18`,
                  padding: "10px 16px",
                }}>
                  {ev.matched.length === 0 ? (
                    <div style={{ color: "#2E4050", fontSize: 11, marginBottom: 8 }}>
                      No contacts with direct keyword overlap for this event.
                    </div>
                  ) : (
                    ev.matched.map((c) => (
                      <div key={c.id} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "5px 0", borderBottom: `1px solid ${CY}0A`,
                      }}>
                        <span style={{ color: "#AECCD8", fontSize: 12, flex: 1 }}>{c.name}</span>
                        {(c.role || c.dept) && (
                          <span style={{
                            fontSize: 9, padding: "1px 6px", borderRadius: 4,
                            background: `${CY}15`, color: CY, letterSpacing: 1,
                          }}>
                            {c.role || c.dept}
                          </span>
                        )}
                        <div style={{
                          width: 60, height: 4, borderRadius: 2,
                          background: `${CY}22`, overflow: "hidden",
                        }}>
                          <div style={{
                            height: "100%", borderRadius: 2, background: AMBER,
                            width: `${Math.min(100, c._score * 20)}%`,
                          }} />
                        </div>
                      </div>
                    ))
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); assess(ev); }}
                    disabled={assessing === ev.id}
                    style={{
                      marginTop: 10, padding: "5px 14px",
                      background: assessing === ev.id ? `${CY}22` : `${AMBER}22`,
                      border: `1px solid ${assessing === ev.id ? CY : AMBER}`,
                      color: assessing === ev.id ? CY : AMBER,
                      borderRadius: 5, fontSize: 10, letterSpacing: 1,
                      cursor: assessing === ev.id ? "wait" : "pointer", fontFamily: "inherit",
                    }}
                  >
                    {assessing === ev.id ? "ASSESSING…" : "▶ ALERT BRIEF"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: "6px 14px", borderTop: `1px solid ${CY}1A`,
        display: "flex", gap: 14, color: "#2E4050", fontSize: 9, letterSpacing: 1, flexShrink: 0,
      }}>
        <span>{rows.length} events</span>
        <span>{contacts.length} contacts</span>
        <span style={{ marginLeft: "auto" }}>auto-refresh 5 min</span>
      </div>
    </div>
  );
}
