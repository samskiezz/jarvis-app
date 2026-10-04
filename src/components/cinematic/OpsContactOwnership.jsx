/**
 * F85 — Ops Events × Contact Ownership (OPECON)
 *
 * Parallel-fetches /v1/ops/events (sev≥50) + /entities/Contact every 90 s.
 * Keyword-correlates each significant operational event against the contact
 * directory to surface:
 *   OWNED    — ≥1 contact keyword-matches this event (name/role/dept)
 *   ORPHANED — 0 contacts match (blind-spot event with no obvious owner)
 *
 * Stat tiles:  events / contacts / owned / orphaned
 * Filter tabs: ALL | OWNED | ORPHANED
 * Text search: across event title / description / source.
 * Expand row → matched contact cards with role + relevance score bar.
 * Amber badge on ORPHANED count.
 * ▶ ASSESS: 2-sentence ops-ownership brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ OPECON  at left:25800, bottom:8, zIndex:87.
 * Event:   jarvis:opecon-toggle
 * Voice:   "ops contact" / "event owner" / "opecon" /
 *          "orphaned events" / "who owns this event" /
 *          "ops ownership" / "event contact" /
 *          "unowned events" / "contact ops"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 25800;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise ────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseEvents(raw) {
  return normaliseArray(raw)
    .map((e, i) => ({
      id:     String(e.id ?? e.event_id ?? i),
      title:  e.title ?? e.name ?? e.summary ?? `Event ${i + 1}`,
      desc:   e.description ?? e.details ?? e.body ?? "",
      source: e.source ?? e.type ?? e.category ?? "",
      sev:    Number(e.severity ?? e.sev ?? e.score ?? 0),
      body:   [e.title, e.name, e.summary, e.description, e.details,
               e.source, e.type, e.category, e.tags]
                .filter(Boolean).join(" "),
    }))
    .filter(e => e.sev >= 50 || e.sev === 0); // include 0-sev when field absent
}

function normaliseContacts(raw) {
  return normaliseArray(raw).map((c, i) => ({
    id:   String(c.id ?? c.contact_id ?? i),
    name: c.name ?? c.full_name ?? c.display_name ?? `Contact ${i + 1}`,
    role: c.role ?? c.title ?? c.position ?? null,
    dept: c.department ?? c.dept ?? c.org ?? null,
    body: [c.name, c.full_name, c.role, c.title, c.position,
           c.department, c.tags, c.skills, c.notes]
            .filter(Boolean).join(" "),
  }));
}

// ─── keyword scoring ──────────────────────────────────────────────────────────

function buildKeywords(strings) {
  return strings
    .flatMap(s => String(s).toLowerCase().split(/[^a-z0-9]+/))
    .filter(t => t.length >= 3);
}

function scoreMatch(keywords, haystack) {
  const h = haystack.toLowerCase();
  let hits = 0;
  for (const kw of keywords) if (h.includes(kw)) hits++;
  return hits;
}

// ─── fetch ────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [evRes, ctRes] = await Promise.all([
    fetch(`${base}/v1/ops/events`, { headers: hdr }),
    fetch(`${base}/entities/Contact`, { headers: hdr }),
  ]);
  return {
    events:   normaliseEvents(evRes.ok   ? await evRes.json()  : []),
    contacts: normaliseContacts(ctRes.ok ? await ctRes.json()  : []),
  };
}

// ─── correlation ──────────────────────────────────────────────────────────────

function correlate(events, contacts) {
  return events.map(ev => {
    const evKw = buildKeywords([ev.title, ev.desc, ev.source]);
    const matched = contacts
      .map(c => ({ c, score: scoreMatch(evKw, c.body) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);
    const classification = matched.length >= 1 ? "OWNED" : "ORPHANED";
    return { ...ev, matched, classification };
  });
}

// ─── exported intent helpers ──────────────────────────────────────────────────

const OPECON_RE =
  /\b(opecon|ops[\s_-]?contact[s]?|event[\s_-]?owner[s]?|orphaned[\s_-]?event[s]?|unowned[\s_-]?event[s]?|who[\s_-]?owns?[\s_-]?(this[\s_-]?)?event[s]?|ops[\s_-]?ownership|event[\s_-]?contact[s]?|contact[\s_-]?ops)\b/i;

export function isOpeconQuery(q) { return OPECON_RE.test(q); }

export async function buildOpeconScript() {
  try {
    const { events, contacts } = await fetchAll();
    const rows     = correlate(events, contacts);
    const owned    = rows.filter(r => r.classification === "OWNED").length;
    const orphaned = rows.filter(r => r.classification === "ORPHANED").length;
    const prompt =
      `Ops event contact-ownership analysis: ${events.length} significant operational events ` +
      `cross-referenced against ${contacts.length} contacts. ` +
      `${owned} events have at least one owning contact matched, ` +
      `while ${orphaned} events are ORPHANED — no contact claims ownership. ` +
      `In 2 sentences, assess the ownership coverage gap and flag the severity of ` +
      `unmanned operational events.`;
    const base = apiBase();
    const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body:    JSON.stringify({ message: prompt }),
    });
    const data = await res.json();
    window.dispatchEvent(new CustomEvent("jarvis:opecon-toggle"));
    return (data.answer || "Ops contact ownership panel is now open, sir.").replace(/<<ACTION:[^>]*>>/g, "").trim();
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:opecon-toggle"));
    return "Ops contact ownership panel is standing by, sir.";
  }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function ClsBadge({ cls }) {
  const color = cls === "OWNED" ? GREEN : AMBER;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: "2px 6px",
      borderRadius: 4, border: `1px solid ${color}`,
      color, background: `${color}18`,
      flexShrink: 0, letterSpacing: "0.06em",
    }}>
      {cls}
    </span>
  );
}

function SevBadge({ sev }) {
  if (!sev) return null;
  const color = sev >= 80 ? "#FF3C3C" : sev >= 60 ? AMBER : MUTED;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: "2px 6px",
      borderRadius: 4, border: `1px solid ${color}44`,
      color, flexShrink: 0,
    }}>
      SEV {sev}
    </span>
  );
}

function RelevanceBar({ score, max }) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  return (
    <div style={{ marginTop: 4, height: 3, background: `${CY}18`, borderRadius: 2 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: CY, borderRadius: 2 }} />
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function OpsContactOwnership() {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows]       = useState([]);
  const [contacts, setContacts] = useState([]);
  const [filter, setFilter]   = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { events, contacts: cts } = await fetchAll();
      setRows(correlate(events, cts));
      setContacts(cts);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:opecon-toggle", toggle);
    return () => window.removeEventListener("jarvis:opecon-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  // stat tiles
  const owned    = rows.filter(r => r.classification === "OWNED").length;
  const orphaned = rows.filter(r => r.classification === "ORPHANED").length;
  const maxScore = Math.max(
    1,
    ...rows.flatMap(r => r.matched.map(m => m.score)),
  );

  // filtered
  const filtered = rows.filter(r => {
    if (filter !== "ALL" && r.classification !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!r.title.toLowerCase().includes(s) &&
          !r.desc.toLowerCase().includes(s) &&
          !r.source.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  async function handleAssess() {
    setAssessing(true);
    try {
      const script = await buildOpeconScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch {}
    setAssessing(false);
  }

  // ─── toggle button ─────────────────────────────────────────────────────────
  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 87,
          fontFamily: MONO, fontSize: 10, fontWeight: 700,
          background: open ? `${CY}22` : "rgba(10,20,35,0.75)",
          color: open ? CY : MUTED,
          border: `1px solid ${open ? CY : MUTED}55`,
          borderRadius: 6, padding: "3px 9px", cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ OPECON
        {orphaned > 0 && (
          <span style={{
            marginLeft: 5, background: AMBER, color: "#000",
            borderRadius: 8, padding: "0 5px", fontSize: 9, fontWeight: 800,
          }}>
            {orphaned}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 40, left: BTN_LEFT - 380,
          width: 440, maxHeight: "70vh",
          background: BG, borderRadius: 12,
          border: `1px solid ${CY}33`,
          boxShadow: `0 0 32px ${CY}18`,
          display: "flex", flexDirection: "column",
          fontFamily: MONO, zIndex: 88,
        }}>
          {/* header */}
          <div style={{
            padding: "12px 16px 8px",
            borderBottom: `1px solid ${CY}22`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: CY, flex: 1 }}>
                ◈ OPS EVENT CONTACT OWNERSHIP
              </span>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none", border: "none", color: MUTED,
                  cursor: "pointer", fontSize: 14, lineHeight: 1,
                }}
              >×</button>
            </div>

            {/* stat tiles */}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              {[
                { label: "EVENTS",   value: rows.length,      color: CY },
                { label: "CONTACTS", value: contacts.length,  color: CY },
                { label: "OWNED",    value: owned,            color: GREEN },
                { label: "ORPHANED", value: orphaned,         color: AMBER },
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  flex: 1, textAlign: "center",
                  background: "rgba(10,20,35,0.6)", borderRadius: 8,
                  padding: "6px 4px",
                  border: `1px solid ${color}22`,
                }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
                  <div style={{ fontSize: 8, color: MUTED, marginTop: 1 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* filter tabs */}
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {["ALL", "OWNED", "ORPHANED"].map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    fontSize: 9, fontWeight: 700, padding: "3px 10px",
                    borderRadius: 5, border: `1px solid ${filter === f ? CY : MUTED}44`,
                    background: filter === f ? `${CY}18` : "transparent",
                    color: filter === f ? CY : MUTED, cursor: "pointer",
                  }}
                >
                  {f}
                </button>
              ))}
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="search events…"
                style={{
                  flex: 1, fontSize: 9, background: "rgba(10,20,35,0.5)",
                  border: `1px solid ${CY}22`, borderRadius: 5,
                  color: "#DCEBF5", padding: "3px 8px", outline: "none",
                }}
              />
            </div>

            {/* assess */}
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{
                marginTop: 8, width: "100%", fontSize: 10, fontWeight: 700,
                padding: "5px 0", borderRadius: 6,
                background: assessing ? `${CY}11` : `${CY}22`,
                border: `1px solid ${CY}44`, color: CY, cursor: "pointer",
              }}
            >
              {assessing ? "assessing…" : "▶ ASSESS OWNERSHIP"}
            </button>
          </div>

          {/* rows */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 16px" }}>
            {filtered.length === 0 && (
              <div style={{
                textAlign: "center", color: MUTED, marginTop: 24, fontSize: 12,
              }}>
                {loading ? "loading events…" : "no events match current filter"}
              </div>
            )}
            {filtered.map(row => (
              <div key={row.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: "rgba(10,20,35,0.5)", borderRadius: 8,
                    border: `1px solid ${CY}22`, padding: "8px 12px",
                    cursor: "pointer",
                  }}
                >
                  <ClsBadge cls={row.classification} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#DCEBF5" }}>
                      {row.title}
                    </div>
                    {row.source && (
                      <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>
                        {row.source}
                      </div>
                    )}
                  </div>
                  {row.sev > 0 && <SevBadge sev={row.sev} />}
                  <span style={{ fontSize: 10, color: MUTED }}>
                    {row.matched.length} contact{row.matched.length !== 1 ? "s" : ""}
                  </span>
                  <span style={{ color: MUTED, fontSize: 12 }}>
                    {expanded === row.id ? "▲" : "▼"}
                  </span>
                </div>

                {expanded === row.id && (
                  <div style={{
                    background: "rgba(5,10,20,0.7)", borderRadius: "0 0 8px 8px",
                    border: `1px solid ${CY}18`, borderTop: "none",
                    padding: "10px 12px",
                  }}>
                    {row.matched.length === 0 ? (
                      <div style={{ fontSize: 11, color: MUTED }}>
                        No contacts keyword-match this event — it may be orphaned or
                        under an unrecognised owner name.
                      </div>
                    ) : (
                      row.matched.map(({ c, score }) => (
                        <div key={c.id} style={{
                          marginBottom: 8, padding: "6px 10px",
                          background: "rgba(10,20,35,0.5)", borderRadius: 6,
                          border: `1px solid ${CY}18`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{
                              fontSize: 11, fontWeight: 600, color: "#DCEBF5", flex: 1,
                            }}>
                              {c.name}
                            </span>
                            {c.role && (
                              <span style={{ fontSize: 9, color: MUTED }}>{c.role}</span>
                            )}
                            {c.dept && (
                              <span style={{ fontSize: 9, color: MUTED }}>{c.dept}</span>
                            )}
                            <span style={{ fontSize: 10, color: MUTED }}>×{score}</span>
                          </div>
                          <RelevanceBar score={score} max={maxScore} />
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
