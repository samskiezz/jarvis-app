/**
 * F110 — Skill × Risk Signal Coverage Advisor
 *
 * Parallel-fetches /v1/aip/skill + /entities/RiskSignal, then
 * keyword-correlates each risk signal against the skill catalog to surface
 * COVERED (at least one skill addresses it) vs DARK (no skill coverage —
 * capability gap).
 *
 * Stat tiles:  signals / skills / covered / dark
 * Filter tabs: ALL | COVERED | DARK
 * Expand any signal → matched skills with category + relevance score.
 * Red badge on CRITICAL/HIGH dark signals.
 * ▶ ASSESS: 2-sentence capability-gap brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SKLRSK  at bottom:8 left:31240, zIndex 69.
 * Voice:   "skill risk / risk skills / capability gap /
 *           which risks have skills / sklrsk"
 * Event:   jarvis:sklrsk-toggle
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 31240;
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

const SKLRSK_RE =
  /\b(skill\s+risk|risk\s+skills?|capability\s+gap|which\s+risks?\s+(have|match)\s+skills?|skills?\s+cover(age|ing)?\s+risk|dark\s+risks?|uncovered\s+risk|sklrsk)\b/i;

export function isSklrskQuery(q) { return SKLRSK_RE.test(q); }

export async function buildSklrskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [sRes, rRes] = await Promise.all([
      fetch(`${base}/v1/aip/skill`,         { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,  { headers: hdr }),
    ]);
    const skills  = normaliseSkills(await sRes.json());
    const signals = normaliseSignals(await rRes.json());

    const covered = signals.filter((sig) => skills.some((sk) => relevance(sig, sk) > 0)).length;
    const dark    = signals.length - covered;
    const critHigh = signals.filter(
      (sig) =>
        ["CRITICAL", "HIGH"].includes((sig.severity || "").toUpperCase()) &&
        !skills.some((sk) => relevance(sig, sk) > 0),
    ).length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS skill–risk coverage analysis: ${signals.length} active risk signals assessed ` +
          `against ${skills.length} skills; ${covered} risks have at least one backing skill ` +
          `(capability covered), ${dark} risks have no skill coverage (capability dark)` +
          (critHigh > 0 ? `, including ${critHigh} CRITICAL or HIGH severity dark risks` : "") +
          `. Give a 2-sentence capability-gap assessment — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Skill–risk coverage analysis complete, sir.").trim();
  } catch {
    return "Skill–risk coverage analysis unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseSkills(raw) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.data)           ? raw.data
    : Array.isArray(raw?.items)          ? raw.items
    : Array.isArray(raw?.results)        ? raw.results
    : Array.isArray(raw?.skills)         ? raw.skills
    : [];
  return arr.map((sk, i) => ({
    id:          sk.id          || String(i),
    name:        sk.name        || sk.title      || `Skill ${i + 1}`,
    description: (sk.description || sk.summary   || "").toString().slice(0, 300),
    category:    sk.category    || sk.domain     || sk.type || "",
  }));
}

function normaliseSignals(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.data)                ? raw.data
    : Array.isArray(raw?.items)               ? raw.items
    : Array.isArray(raw?.results)             ? raw.results
    : Array.isArray(raw?.risk_signals)        ? raw.risk_signals
    : [];
  return arr.map((s, i) => ({
    id:          s.id          || String(i),
    title:       s.title       || s.name        || `Signal ${i + 1}`,
    description: (s.description || s.summary    || "").toString().slice(0, 300),
    severity:    s.severity    || s.level       || s.threat_level || "UNKNOWN",
    type:        s.type        || s.category    || s.signal_type  || "",
    tags:        Array.isArray(s.tags) ? s.tags.join(" ") : (s.tags || ""),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]]+/)
    .filter((w) => w.length >= 3);
}

function relevance(signal, skill) {
  const sw = keywords(`${signal.title} ${signal.description} ${signal.type} ${signal.tags}`);
  const kw = keywords(`${skill.name} ${skill.description} ${skill.category}`);
  return sw.filter((w) => kw.some((kv) => kv.includes(w) || w.includes(kv))).length;
}

function buildCorrelated(signals, skills) {
  return signals.map((sig) => {
    const matched = skills
      .map((sk) => ({ ...sk, score: relevance(sig, sk) }))
      .filter((sk) => sk.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...sig, skills: matched, covered: matched.length > 0 };
  });
}

function severityColor(sev) {
  const u = (sev || "").toUpperCase();
  if (u === "CRITICAL") return "#FF3030";
  if (u === "HIGH")     return "#FF7A30";
  if (u === "MEDIUM")   return "#FFD700";
  if (u === "LOW")      return "#4ADE80";
  return S.textMuted;
}

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "COVERED", "DARK"];
const RED  = "#FF3030";
const AMBER = "#FFB347";

export default function SkillRiskCoverage() {
  const [open,      setOpen]      = useState(false);
  const [skills,    setSkills]    = useState([]);
  const [signals,   setSignals]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [query,     setQuery]     = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [sRes, rRes] = await Promise.all([
        fetch(`${base}/v1/aip/skill`,        { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
      ]);
      setSkills(normaliseSkills(await sRes.json()));
      setSignals(normaliseSignals(await rRes.json()));
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
    window.addEventListener("jarvis:sklrsk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:sklrsk-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isSklrskQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated = buildCorrelated(signals, skills);
  const covered    = correlated.filter((s) => s.covered).length;
  const dark       = correlated.filter((s) => !s.covered).length;
  const critDark   = correlated.filter(
    (s) => !s.covered && ["CRITICAL", "HIGH"].includes((s.severity || "").toUpperCase()),
  ).length;

  const visible = correlated.filter((sig) => {
    if (filter === "COVERED") return sig.covered;
    if (filter === "DARK")    return !sig.covered;
    const q = query.toLowerCase();
    return !q || sig.title.toLowerCase().includes(q) || sig.description.toLowerCase().includes(q);
  });

  async function assess() {
    setAssessing(true);
    const text = await buildSklrskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Skill × Risk Signal Coverage (◈ SKLRSK)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? `${RED}22` : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? RED : S.border}`,
          borderRadius: S.radius, color: open ? RED : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${RED}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ SKLRSK{critDark > 0 && (
          <span style={{
            marginLeft: 4, background: RED, color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{critDark}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: Math.max(8, BTN_LEFT - 260),
          width: 340,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${RED}`,
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
            <span style={{ color: RED, letterSpacing: 2, fontWeight: 700 }}>
              SKILL–RISK COVERAGE
            </span>
            <button
              onClick={assess}
              disabled={assessing || signals.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || signals.length === 0) ? 0.4 : 1,
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
              { label: "SIGNALS", val: signals.length, color: C.blue    },
              { label: "SKILLS",  val: skills.length,  color: C.neon    },
              { label: "COVERED", val: covered,         color: "#4ADE80" },
              { label: "DARK",    val: dark,            color: RED       },
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
          <div style={{
            display: "flex", gap: 4, padding: "0 12px 8px",
            borderBottom: `1px solid ${S.border}`,
          }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                background: filter === t ? `${RED}22` : "transparent",
                border: `1px solid ${filter === t ? RED : S.border}`,
                color: filter === t ? RED : S.textMuted,
                borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search (ALL tab only) */}
          {filter === "ALL" && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search risk signals…"
              style={{
                margin: "6px 12px 2px",
                background: "rgba(0,0,0,0.4)", border: `1px solid ${S.border}`,
                borderRadius: S.radius, color: S.textHi,
                fontFamily: S.mono, fontSize: S.fs.xxs,
                padding: "4px 8px", outline: "none",
              }}
            />
          )}

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 12px 10px" }}>
            {loading && signals.length === 0 && (
              <div style={{ color: S.textMuted, padding: "12px 0" }}>◌ loading…</div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ color: S.textMuted, padding: "12px 0" }}>no signals in this filter</div>
            )}
            {visible.map((sig) => (
              <div key={sig.id} style={{
                borderBottom: `1px solid ${S.border}`, paddingBottom: 6, marginBottom: 6,
              }}>
                <div
                  style={{
                    display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                    gap: 6, cursor: "pointer",
                  }}
                  onClick={() => setExpanded(expanded === sig.id ? null : sig.id)}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 5, marginBottom: 2,
                    }}>
                      <span style={{
                        color: sig.covered ? "#4ADE80" : RED,
                        fontWeight: 600, fontSize: "9px",
                      }}>
                        {sig.covered ? "● COVERED" : "○ DARK"}
                      </span>
                      <span style={{
                        color: severityColor(sig.severity),
                        fontSize: "8px", letterSpacing: 1, fontWeight: 700,
                      }}>
                        {(sig.severity || "").toUpperCase()}
                      </span>
                      <span style={{ color: S.textHi, fontWeight: 500, fontSize: S.fs.xxs }}>
                        {sig.title.slice(0, 28)}{sig.title.length > 28 ? "…" : ""}
                      </span>
                    </div>
                    {sig.type && (
                      <div style={{ color: S.textMuted, fontSize: "9px" }}>
                        {sig.type}
                      </div>
                    )}
                  </div>
                  <span style={{ color: S.textMuted, fontSize: "9px", flexShrink: 0 }}>
                    {sig.skills.length > 0
                      ? `${sig.skills.length} skill${sig.skills.length > 1 ? "s" : ""}`
                      : "—"}
                  </span>
                </div>

                {expanded === sig.id && sig.skills.length > 0 && (
                  <div style={{ marginTop: 6, paddingLeft: 8 }}>
                    {sig.skills.slice(0, 4).map((sk) => (
                      <div key={sk.id} style={{
                        padding: "4px 0", borderTop: `1px solid ${S.border}`,
                      }}>
                        <div style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                        }}>
                          <span style={{ color: C.blue, fontSize: "9px" }}>
                            {sk.name.slice(0, 28)}{sk.name.length > 28 ? "…" : ""}
                          </span>
                          <span style={{
                            color: S.textMuted, fontSize: "9px",
                            background: `${RED}22`,
                            borderRadius: 4, padding: "0 4px", flexShrink: 0,
                          }}>
                            {sk.score}
                          </span>
                        </div>
                        {sk.category && (
                          <div style={{
                            color: S.textMuted, fontSize: "8px", marginTop: 1,
                            fontStyle: "italic",
                          }}>
                            {sk.category}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {expanded === sig.id && sig.skills.length === 0 && (
                  <div style={{
                    marginTop: 6, paddingLeft: 8,
                    color: RED, fontSize: "9px",
                  }}>
                    ⚠ no skills found covering this risk signal
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
