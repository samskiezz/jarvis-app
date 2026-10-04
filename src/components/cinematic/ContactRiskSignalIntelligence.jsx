/**
 * F57 — Contact × Risk Signal Intelligence (CRSI)
 *
 * Parallel-fetches /entities/Contact and /entities/RiskSignal every 90 s.
 * Keyword-correlates each contact (name, role, org, tags) against the full
 * text of every active risk signal (name, source, description) to answer:
 * "Which contacts appear in the active threat landscape?"
 *
 * AT_RISK  — contact keywords match at least one active risk signal
 * CLEAR    — no signal overlap found
 *
 * Stat tiles: contacts / signals / at-risk / clear
 * Amber badge on at-risk count.
 * Filter tabs: ALL / AT_RISK / CLEAR + text search.
 * Expand contact row → matched risk signals with relevance score + severity bar.
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ CRSI  at left:1260 bottom:18, zIndex:68.
 * Event:   jarvis:crsi-toggle
 * Voice:   "contact risk / crsi / at risk contacts / contact signals /
 *           contact threat / who is at risk / contact intelligence"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const PURP  = "#A78BFA";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 1260;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const SEV_COLORS = { CRITICAL: RED, HIGH: AMBER, MEDIUM: "#F59E0B", LOW: CY, INFO: MUTED };

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseContacts(raw) {
  return normaliseArray(raw).map((c, i) => ({
    id:   String(c.id ?? i),
    name: c.name ?? c.full_name ?? c.display_name ?? `Contact ${i + 1}`,
    role: c.role ?? c.position ?? c.title ?? "",
    org:  c.org ?? c.organisation ?? c.organization ?? c.company ?? "",
    tags: Array.isArray(c.tags) ? c.tags : [],
  }));
}

function normaliseSignals(raw) {
  return normaliseArray(raw).map((s, i) => ({
    id:       String(s.id ?? s.signal_id ?? i),
    name:     s.name ?? s.title ?? s.signal_name ?? `Signal ${i + 1}`,
    severity: (s.severity ?? s.level ?? s.priority ?? "INFO").toUpperCase(),
    source:   s.source ?? s.origin ?? "",
    desc:     s.description ?? s.details ?? s.body ?? "",
  }));
}

function tokenise(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);
}

function correlate(contact, signals) {
  const contactTokens = new Set([
    ...tokenise(contact.name),
    ...tokenise(contact.role),
    ...tokenise(contact.org),
    ...contact.tags.flatMap(t => tokenise(t)),
  ]);
  const matches = [];
  for (const sig of signals) {
    const sigTokens = tokenise(`${sig.name} ${sig.source} ${sig.desc}`);
    const hits = sigTokens.filter(t => contactTokens.has(t)).length;
    if (hits > 0) {
      matches.push({ ...sig, score: hits });
    }
  }
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

// ─── fetch ───────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [cRes, sRes] = await Promise.all([
    fetch(`${base}/entities/Contact`,    { headers: hdr }),
    fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
  ]);
  const contacts = normaliseContacts(await cRes.json());
  const signals  = normaliseSignals(await sRes.json());
  const enriched = contacts.map(c => {
    const matches = correlate(c, signals);
    return {
      ...c,
      matches,
      status: matches.length > 0 ? "AT_RISK" : "CLEAR",
    };
  });
  return { contacts: enriched, signals };
}

// ─── exported intent helpers (JarvisBrain) ───────────────────────────────────

export function isCrsiQuery(q) {
  return /contact.?risk|crsi|at.?risk.?contact|contact.?signal|contact.?threat|who.?is.?at.?risk|contact.?intel/i.test(q);
}

export async function buildCrsiScript() {
  try {
    const { contacts, signals } = await fetchAll();
    const atRisk  = contacts.filter(c => c.status === "AT_RISK");
    const critical = signals.filter(s => s.severity === "CRITICAL").length;
    const topContact = atRisk[0];

    const prompt = `JARVIS contact risk intelligence report: ${contacts.length} total contacts checked against ${signals.length} active risk signals (${critical} critical). ${atRisk.length} contacts classified AT_RISK — potentially appearing in the threat landscape.${topContact ? ` Highest-risk contact: ${topContact.name}${topContact.org ? ` (${topContact.org})` : ""} with ${topContact.matches.length} signal correlation(s).` : ""} Summarise the contact-risk exposure in exactly 2 sentences and recommend priority action.`;

    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const base = apiBase();
    const aiRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body:    JSON.stringify({ message: prompt }),
    });
    const aiData = await aiRes.json();
    return aiData.response ?? aiData.reply ?? aiData.message ??
      `${atRisk.length}/${contacts.length} contacts flagged AT_RISK across ${signals.length} active risk signals.`;
  } catch {
    return "Contact risk signal intelligence data unavailable.";
  }
}

// ─── Stat Tile ────────────────────────────────────────────────────────────────

function StatTile({ label, value, accent, pulse }) {
  return (
    <div style={{
      flex: 1, textAlign: "center", padding: "8px 4px",
      background: `rgba(${accent === RED ? "255,59,107" : accent === AMBER ? "245,166,35" : "41,231,255"},0.04)`,
      border: `1px solid ${accent ?? CY}22`, borderRadius: 4, position: "relative",
    }}>
      {pulse && (
        <div style={{
          position: "absolute", inset: -1, borderRadius: 4,
          border: `1px solid ${AMBER}`,
          animation: "crsi-pulse 1.4s ease-in-out infinite",
          pointerEvents: "none",
        }} />
      )}
      <div style={{ fontSize: 16, fontWeight: 700, color: accent ?? CY, fontFamily: MONO }}>
        {value ?? "—"}
      </div>
      <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

// ─── Contact Row ──────────────────────────────────────────────────────────────

function ContactRow({ contact }) {
  const [expanded, setExpanded] = useState(false);
  const maxScore = Math.max(1, ...contact.matches.map(m => m.score));

  return (
    <div style={{
      borderRadius: 3, marginBottom: 3,
      border: `1px solid ${contact.status === "AT_RISK" ? AMBER : MUTED}22`,
      background: contact.status === "AT_RISK"
        ? "rgba(245,166,35,0.03)"
        : "rgba(41,231,255,0.02)",
    }}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "5px 8px", cursor: "pointer",
        }}
      >
        {/* status badge */}
        <span style={{
          fontSize: 7, fontWeight: 700, letterSpacing: 1,
          color: contact.status === "AT_RISK" ? AMBER : GREEN,
          border: `1px solid ${contact.status === "AT_RISK" ? AMBER : GREEN}66`,
          padding: "1px 5px", borderRadius: 2,
          whiteSpace: "nowrap", width: 56, textAlign: "center",
        }}>
          {contact.status === "AT_RISK" ? "AT RISK" : "CLEAR"}
        </span>

        {/* name */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 9, color: CY, fontWeight: 600,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {contact.name}
          </div>
          {(contact.role || contact.org) && (
            <div style={{ fontSize: 7, color: MUTED, marginTop: 1 }}>
              {[contact.role, contact.org].filter(Boolean).join(" · ").slice(0, 40)}
            </div>
          )}
        </div>

        {/* match count */}
        {contact.matches.length > 0 && (
          <span style={{ fontSize: 8, color: AMBER, fontWeight: 700, flexShrink: 0 }}>
            {contact.matches.length} signal{contact.matches.length !== 1 ? "s" : ""}
          </span>
        )}
        <span style={{ fontSize: 8, color: MUTED }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {/* expanded: matched signals */}
      {expanded && (
        <div style={{ padding: "0 8px 8px 8px" }}>
          {contact.matches.length === 0 ? (
            <div style={{ fontSize: 8, color: GREEN, padding: "4px 0" }}>
              No active risk signal correlations found.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
              <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, marginBottom: 2 }}>
                CORRELATED RISK SIGNALS
              </div>
              {contact.matches.slice(0, 6).map(m => {
                const barPct = Math.round((m.score / maxScore) * 100);
                return (
                  <div key={m.id} style={{
                    background: "rgba(41,231,255,0.03)",
                    border: `1px solid ${SEV_COLORS[m.severity] ?? MUTED}22`,
                    borderRadius: 3, padding: "4px 8px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{
                        fontSize: 7, fontWeight: 700,
                        color: SEV_COLORS[m.severity] ?? MUTED,
                        border: `1px solid ${SEV_COLORS[m.severity] ?? MUTED}66`,
                        padding: "1px 4px", borderRadius: 2,
                        width: 50, textAlign: "center", flexShrink: 0,
                      }}>
                        {m.severity.slice(0, 4)}
                      </span>
                      <span style={{
                        fontSize: 8, color: CY, flex: 1, minWidth: 0,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {m.name}
                      </span>
                      <span style={{ fontSize: 7, color: AMBER, fontWeight: 700, flexShrink: 0 }}>
                        {m.score}pt
                      </span>
                    </div>
                    <div style={{ height: 3, background: `${SEV_COLORS[m.severity] ?? MUTED}11`, borderRadius: 2 }}>
                      <div style={{
                        width: `${barPct}%`, height: "100%",
                        background: SEV_COLORS[m.severity] ?? MUTED, borderRadius: 2,
                      }} />
                    </div>
                  </div>
                );
              })}
              {contact.matches.length > 6 && (
                <div style={{ fontSize: 7, color: MUTED, textAlign: "center" }}>
                  +{contact.matches.length - 6} more signal{contact.matches.length - 6 !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const TABS = ["ALL", "AT_RISK", "CLEAR"];

export default function ContactRiskSignalIntelligence() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [error,     setError]     = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await fetchAll();
      setData(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:crsi-toggle", h);
    return () => window.removeEventListener("jarvis:crsi-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildCrsiScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const contacts = data?.contacts ?? [];
  const signals  = data?.signals  ?? [];
  const atRisk   = contacts.filter(c => c.status === "AT_RISK");

  const visible = contacts
    .filter(c => tab === "ALL" || c.status === tab)
    .filter(c => {
      if (!search) return true;
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q)
        || c.role.toLowerCase().includes(q)
        || c.org.toLowerCase().includes(q);
    });

  if (!open) {
    return (
      <>
        <style>{`@keyframes crsi-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
        <button
          onClick={() => setOpen(true)}
          title="Contact × Risk Signal Intelligence (CRSI)"
          style={{
            position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
            background: "rgba(4,7,14,0.82)", border: `1px solid ${CY}55`,
            color: CY, fontFamily: MONO, fontSize: 9, fontWeight: 700,
            padding: "4px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
          }}
        >
          ◈ CRSI
          {atRisk.length > 0 && (
            <span style={{
              marginLeft: 5, background: AMBER, color: "#000",
              borderRadius: 8, padding: "0 4px", fontSize: 8, fontWeight: 700,
              animation: "crsi-pulse 1.4s ease-in-out infinite",
            }}>
              {atRisk.length}
            </span>
          )}
        </button>
      </>
    );
  }

  return (
    <>
      <style>{`@keyframes crsi-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      {/* toggle button (active) */}
      <button
        onClick={() => setOpen(false)}
        title="Close CRSI"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 69,
          background: CY, border: "none",
          color: "#000", fontFamily: MONO, fontSize: 9, fontWeight: 700,
          padding: "4px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
        }}
      >
        ◈ CRSI ▲
      </button>

      {/* panel */}
      <div style={{
        position: "fixed", left: 10, bottom: 55, zIndex: 68,
        width: 460, maxHeight: "74vh",
        background: BG, border: `1px solid ${CY}44`,
        borderRadius: 6, fontFamily: MONO,
        display: "flex", flexDirection: "column",
        boxShadow: `0 0 30px ${CY}22`,
      }}>
        {/* header */}
        <div style={{
          padding: "8px 12px", borderBottom: `1px solid ${CY}33`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 700, color: CY, letterSpacing: 2 }}>
              ◈ CONTACT RISK INTELLIGENCE
            </span>
            {loading && (
              <span style={{ fontSize: 7, color: MUTED, marginLeft: 8 }}>polling…</span>
            )}
          </div>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: assessing ? "rgba(41,231,255,0.1)" : "rgba(41,231,255,0.15)",
              border: `1px solid ${CY}66`, color: CY,
              fontFamily: MONO, fontSize: 8, padding: "3px 8px",
              borderRadius: 3, cursor: assessing ? "wait" : "pointer",
            }}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
          <StatTile label="CONTACTS" value={contacts.length}  accent={CY} />
          <StatTile label="SIGNALS"  value={signals.length}   accent={PURP} />
          <StatTile label="AT RISK"  value={atRisk.length}    accent={AMBER}
            pulse={atRisk.length > 0} />
          <StatTile label="CLEAR"    value={contacts.length - atRisk.length} accent={GREEN} />
        </div>

        {/* error */}
        {error && (
          <div style={{ padding: "4px 12px", fontSize: 8, color: RED }}>{error}</div>
        )}

        {/* filter tabs + search */}
        <div style={{
          display: "flex", gap: 4, padding: "0 12px 8px",
          alignItems: "center",
        }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? CY : "transparent",
                border: `1px solid ${tab === t ? CY : MUTED}44`,
                color: tab === t ? "#000" : MUTED,
                fontFamily: MONO, fontSize: 7, fontWeight: 700,
                padding: "2px 6px", borderRadius: 2, cursor: "pointer",
                letterSpacing: 1,
              }}
            >
              {t === "AT_RISK" ? "AT RISK" : t}
            </button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search contacts…"
            style={{
              flex: 1, background: "rgba(41,231,255,0.05)",
              border: `1px solid ${CY}33`, borderRadius: 2,
              color: CY, fontFamily: MONO, fontSize: 8,
              padding: "2px 6px", outline: "none",
            }}
          />
        </div>

        {/* list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
          {visible.length === 0 && !loading ? (
            <div style={{ fontSize: 8, color: MUTED, padding: "12px 0", textAlign: "center" }}>
              {contacts.length === 0 ? "No contacts loaded." : "No contacts match filter."}
            </div>
          ) : (
            visible.map(c => <ContactRow key={c.id} contact={c} />)
          )}
        </div>
      </div>
    </>
  );
}
