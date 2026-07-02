/**
 * F97 — Contact × Risk Signal Exposure Linker
 *
 * Parallel-fetches /entities/Contact + /entities/RiskSignal, then
 * keyword-correlates each contact (name/role/department/notes/tags)
 * against active risk signals (title/description/type/tags) to surface
 * AT-RISK contacts (at least one signal match) vs CLEAR contacts
 * (no risk-signal exposure found).
 *
 * Stat tiles: contacts / signals / at-risk / clear.
 * Filter tabs: ALL | AT-RISK | CLEAR + text search.
 * Expand any contact → matched signals with severity badge + relevance score.
 * Red badge on AT-RISK count when any matched signal is CRITICAL.
 * ▶ ASSESS: /v1/jarvis/agent/chat 2-sentence contact-risk brief
 *   + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ CTRSK  at bottom:8 left:27280, zIndex 69.
 * Event:   jarvis:ctrsk-toggle
 * Voice:   "contact risk / at-risk contacts / contact exposure /
 *           which contacts are at risk / ctrsk"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 27280;
const POLL_MS  = 90_000;

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

// ── exported intent helpers ──────────────────────────────────────────────────

const CTRSK_RE =
  /\b(contact\s+risk|at[\s-]risk\s+contacts?|contact\s+exposure|which\s+contacts?\s+(are\s+)?at\s+risk|ctrsk)\b/i;

export function isCtrskQuery(q) { return CTRSK_RE.test(q); }

export async function buildCtrskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [cRes, sRes] = await Promise.all([
      fetch(`${base}/entities/Contact`,    { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
    ]);
    const cRaw = await cRes.json();
    const sRaw = await sRes.json();
    const contacts = normaliseContacts(cRaw);
    const signals  = normaliseSignals(sRaw);

    const atRisk = contacts.filter((c) =>
      signals.some((s) => relevance(c, s) > 0)
    ).length;
    const clear = contacts.length - atRisk;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS contact risk exposure status: ${contacts.length} contacts on file, ` +
          `${signals.length} active risk signals, ${atRisk} contacts have keyword exposure ` +
          `to at least one active risk signal, ${clear} contacts appear clear. ` +
          `Give a 2-sentence contact-risk exposure brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Contact risk exposure assessment complete, sir.").trim();
  } catch {
    return "Contact risk exposure analysis unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseContacts(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.contacts)         ? raw.contacts
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : [];
  return arr.map((c, i) => ({
    id:         c.id           || String(i),
    name:       c.name         || c.full_name    || `Contact ${i + 1}`,
    role:       c.role         || c.job_title    || c.position || "",
    department: c.department   || c.dept         || c.team     || "",
    email:      c.email        || "",
    notes:      (c.notes       || c.bio          || c.summary  || "").toString().slice(0, 200),
    tags:       Array.isArray(c.tags) ? c.tags.join(" ") : (c.tags || c.tag || ""),
  }));
}

function normaliseSignals(raw) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.signals)         ? raw.signals
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.results)         ? raw.results
    : [];
  return arr.map((s, i) => ({
    id:          s.id           || String(i),
    title:       s.title        || s.name        || `Signal ${i + 1}`,
    description: (s.description || s.details     || s.summary || "").toString().slice(0, 200),
    type:        s.type         || s.signal_type  || s.category || "",
    severity:    (s.severity    || s.level        || "").toUpperCase(),
    tags:        Array.isArray(s.tags) ? s.tags.join(" ") : (s.tags || s.tag || ""),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]]+/)
    .filter((w) => w.length >= 3);
}

function relevance(contact, signal) {
  const cw = keywords(
    `${contact.name} ${contact.role} ${contact.department} ${contact.notes} ${contact.tags}`
  );
  const sw = keywords(`${signal.title} ${signal.description} ${signal.type} ${signal.tags}`);
  return cw.filter((w) => sw.some((s) => s.includes(w) || w.includes(s))).length;
}

function buildCorrelated(contacts, signals) {
  return contacts.map((con) => {
    const matched = signals
      .map((s) => ({ ...s, score: relevance(con, s) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    const atRisk = matched.length > 0;
    const hasCritical = matched.some((s) => s.severity === "CRITICAL");
    return { ...con, signals: matched, atRisk, hasCritical };
  });
}

const SEVERITY_COLOR = {
  CRITICAL: "#FF4444",
  HIGH:     "#FF8800",
  MEDIUM:   "#F0B429",
  LOW:      "#4ADE80",
};

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "AT-RISK", "CLEAR"];

export default function ContactRiskExposure() {
  const [open,      setOpen]      = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [signals,   setSignals]   = useState([]);
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
      const [cRes, sRes] = await Promise.all([
        fetch(`${base}/entities/Contact`,    { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
      ]);
      const cRaw = await cRes.json();
      const sRaw = await sRes.json();
      setContacts(normaliseContacts(cRaw));
      setSignals(normaliseSignals(sRaw));
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
    window.addEventListener("jarvis:ctrsk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ctrsk-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isCtrskQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated  = buildCorrelated(contacts, signals);
  const atRiskCount = correlated.filter((c) =>  c.atRisk).length;
  const clearCount  = correlated.filter((c) => !c.atRisk).length;
  const criticalBadge = correlated.some((c) => c.hasCritical);

  const sq = search.toLowerCase();
  const visible = correlated.filter((con) => {
    if (filter === "AT-RISK" && !con.atRisk) return false;
    if (filter === "CLEAR"   &&  con.atRisk) return false;
    if (sq && !`${con.name} ${con.role} ${con.department}`.toLowerCase().includes(sq)) return false;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildCtrskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Contact–Risk Exposure Linker (◈ CTRSK)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? "rgba(255,68,68,0.15)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? "#FF4444" : S.border}`,
          borderRadius: S.radius, color: open ? "#FF4444" : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? "0 0 8px #FF444444" : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ CTRSK{atRiskCount > 0 && (
          <span style={{
            marginLeft: 4,
            background: criticalBadge ? "#FF4444" : "#FF8800",
            color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{atRiskCount}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: Math.max(8, BTN_LEFT - 260),
          width: 340,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: "2px solid #FF4444",
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
            <span style={{ color: "#FF4444", letterSpacing: 2, fontWeight: 700 }}>
              CONTACT–RISK EXPOSURE
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
              { label: "CONTACTS", val: contacts.length,  color: C.blue    },
              { label: "SIGNALS",  val: signals.length,   color: C.neon    },
              { label: "AT-RISK",  val: atRiskCount,      color: "#FF4444" },
              { label: "CLEAR",    val: clearCount,       color: "#4ADE80" },
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
                flex: 1, background: filter === t ? "rgba(255,68,68,0.18)" : "transparent",
                border: `1px solid ${filter === t ? "#FF4444" : S.border}`,
                color: filter === t ? "#FF4444" : S.text,
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
              placeholder="Search contacts…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,0,0,0.3)", border: `1px solid ${S.border}`,
                borderRadius: S.radius, color: S.textHi,
                fontFamily: S.mono, fontSize: S.fs.xxs, padding: "4px 8px",
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
            ) : visible.map((con) => (
              <div key={con.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === con.id ? null : con.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${con.atRisk ? (con.hasCritical ? "#FF4444" : "#FF8800") : "#4ADE80"}`,
                  }}
                >
                  <span style={{
                    color: con.atRisk ? (con.hasCritical ? "#FF4444" : "#FF8800") : "#4ADE80",
                    fontSize: 10, width: 10,
                  }}>
                    {con.atRisk ? "●" : "○"}
                  </span>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div style={{ color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {con.name}
                    </div>
                    {con.role && (
                      <div style={{ color: S.text, fontSize: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {con.role}{con.department ? ` · ${con.department}` : ""}
                      </div>
                    )}
                  </div>
                  <span style={{
                    color: con.atRisk ? (con.hasCritical ? "#FF4444" : "#FF8800") : "#4ADE80",
                    fontSize: "9px", minWidth: 50, textAlign: "right",
                  }}>
                    {con.atRisk ? `${con.signals.length} SIG` : "CLEAR"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === con.id ? "▴" : "▾"}</span>
                </div>

                {expanded === con.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {con.atRisk ? con.signals.map((sig) => {
                      const sevColor = SEVERITY_COLOR[sig.severity] || S.text;
                      return (
                        <div key={sig.id} style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "2px 0", borderBottom: `1px solid ${S.border}33`,
                        }}>
                          <span style={{ flex: 1, color: S.textHi, fontSize: "9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {sig.title}
                          </span>
                          {sig.severity && (
                            <span style={{
                              fontSize: "8px", padding: "0 4px", borderRadius: 3,
                              background: `${sevColor}22`, color: sevColor,
                              border: `1px solid ${sevColor}44`,
                              whiteSpace: "nowrap",
                            }}>
                              {sig.severity}
                            </span>
                          )}
                          <span style={{ color: C.blue, fontSize: "9px", whiteSpace: "nowrap" }}>
                            rel:{sig.score}
                          </span>
                        </div>
                      );
                    }) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No active risk signals correlate with this contact — exposure clear.
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
            /entities/Contact · /entities/RiskSignal · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
