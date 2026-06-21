/**
 * F67 — Contact-Scenario Assignor
 *
 * Parallel-fetches /entities/Contact + /v1/scenario/list, then
 * keyword-correlates each contact (by name / role / department) against
 * scenario titles and descriptions to surface whether a person is ASSIGNED
 * (at least one scenario references them) or SOLO (no scenario match).
 *
 * Stat tiles: contacts / scenarios / assigned / solo.
 * Filter tabs: ALL | ASSIGNED | SOLO.
 * Expand any contact to see matched scenarios with relevance score.
 * ▶ ASSESS: sends a 2-sentence AI team-readiness brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ⊕ CTSCEN  at bottom:8 left:8708, zIndex 67.
 * Voice:   "contact scenario / who's in which scenario / scenario contacts / ctscen"
 * Event:   jarvis:ctscen-toggle
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 8708;
const POLL_MS  = 90_000;

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

const CTSCEN_RE =
  /\b(contact\s+scenario|scenario\s+contacts?|who(?:'s|\s+is)?\s+in\s+(?:which\s+)?scenario|team\s+scenario|person\s+scenario|ctscen)\b/i;

export function isCtscenQuery(q) { return CTSCEN_RE.test(q); }

export async function buildCtscenScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [cRes, sRes] = await Promise.all([
      fetch(`${base}/entities/Contact`,    { headers: hdr }),
      fetch(`${base}/v1/scenario/list`,    { headers: hdr }),
    ]);
    const cRaw = await cRes.json();
    const sRaw = await sRes.json();
    const contacts  = normaliseContacts(cRaw);
    const scenarios = normaliseScenarios(sRaw);

    const { assigned, solo } = correlate(contacts, scenarios);
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS contact-scenario coverage: ${contacts.length} contacts, ` +
          `${scenarios.length} scenarios, ${assigned} scenario-assigned, ${solo} unassigned. ` +
          `Give a 2-sentence team-readiness brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Contact-scenario assignment analysis complete, sir.").trim();
  } catch {
    return "Contact-scenario assignment analysis unavailable at this time, sir.";
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
    name:       c.name         || c.full_name  || c.display_name || `Contact ${i + 1}`,
    role:       c.role         || c.job_title  || c.title        || "",
    department: c.department   || c.dept       || c.team         || "",
    email:      c.email        || "",
  }));
}

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw)            ? raw
    : Array.isArray(raw?.data)              ? raw.data
    : Array.isArray(raw?.scenarios)         ? raw.scenarios
    : Array.isArray(raw?.items)             ? raw.items
    : Array.isArray(raw?.results)           ? raw.results
    : [];
  return arr.map((s, i) => ({
    id:     s.id          || String(i),
    title:  s.title       || s.name  || s.scenario_name  || `Scenario ${i + 1}`,
    desc:   (s.description || s.summary || s.tags || "").toString(),
    status: (s.status     || "").toLowerCase(),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@]+/)
    .filter((w) => w.length >= 3);
}

function relevance(contact, scenario) {
  const cw = keywords(`${contact.name} ${contact.role} ${contact.department}`);
  const sw = keywords(`${scenario.title} ${scenario.desc}`);
  return cw.filter((w) => sw.some((s) => s.includes(w) || w.includes(s))).length;
}

function correlate(contacts, scenarios) {
  let assigned = 0, solo = 0;
  for (const c of contacts) {
    const matched = scenarios.some((s) => relevance(c, s) > 0);
    matched ? assigned++ : solo++;
  }
  return { assigned, solo };
}

function buildCorrelated(contacts, scenarios) {
  return contacts.map((c) => {
    const matched = scenarios
      .map((s) => ({ ...s, score: relevance(c, s) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...c, scenarios: matched, assigned: matched.length > 0 };
  });
}

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "ASSIGNED", "SOLO"];

export default function ContactScenarioAssignor() {
  const [open,      setOpen]      = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
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
        fetch(`${base}/entities/Contact`,  { headers: hdr }),
        fetch(`${base}/v1/scenario/list`,  { headers: hdr }),
      ]);
      const cRaw = await cRes.json();
      const sRaw = await sRes.json();
      setContacts(normaliseContacts(cRaw));
      setScenarios(normaliseScenarios(sRaw));
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
    window.addEventListener("jarvis:ctscen-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ctscen-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isCtscenQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated = buildCorrelated(contacts, scenarios);
  const assigned   = correlated.filter((c) => c.assigned).length;
  const solo       = correlated.filter((c) => !c.assigned).length;

  const visible = correlated.filter((c) => {
    if (filter === "ASSIGNED") return c.assigned;
    if (filter === "SOLO")     return !c.assigned;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildCtscenScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Contact-Scenario Assignor (⊕ CTSCEN)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 67,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ⊕ CTSCEN{solo > 0 && (
          <span style={{
            marginLeft: 4, background: "#FF8800", color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{solo}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 66,
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
              CONTACT–SCENARIO ASSIGNOR
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
              { label: "SCENARIOS", val: scenarios.length, color: C.blue    },
              { label: "ASSIGNED",  val: assigned,         color: "#4ADE80" },
              { label: "SOLO",      val: solo,             color: "#FF8800" },
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
          <div style={{ display: "flex", gap: 4, padding: "0 12px 6px" }}>
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
                    borderLeft: `3px solid ${c.assigned ? "#4ADE80" : "#FF8800"}`,
                  }}
                >
                  <span style={{ color: c.assigned ? "#4ADE80" : "#FF8800", fontSize: 10, width: 10 }}>
                    {c.assigned ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                  </span>
                  {c.role && (
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${C.blue}22`, color: C.blue,
                      border: `1px solid ${C.blue}44`,
                      maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {c.role}
                    </span>
                  )}
                  <span style={{ color: c.assigned ? "#4ADE80" : "#FF8800", fontSize: "9px", minWidth: 40, textAlign: "right" }}>
                    {c.assigned ? `${c.scenarios.length} SCN` : "SOLO"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === c.id ? "▴" : "▾"}</span>
                </div>

                {expanded === c.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {c.assigned ? c.scenarios.map((scn) => (
                      <div key={scn.id} style={{
                        display: "flex", justifyContent: "space-between",
                        padding: "2px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        <span style={{ color: S.textHi, fontSize: "9px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {scn.title}
                        </span>
                        <span style={{ color: C.blue, fontSize: "9px", marginLeft: 6, whiteSpace: "nowrap" }}>
                          rel:{scn.score}
                          {scn.status ? ` · ${scn.status}` : ""}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No matching scenarios found for this contact.
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
            /entities/Contact · /v1/scenario/list · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
