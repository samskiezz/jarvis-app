/**
 * F196 Investigation × Ops Event Frequency Matrix
 *
 * Parallel-fetches /v1/investigations + /v1/ops/events, keyword-correlates each
 * investigation against ops events by matching title/description tokens, then
 * surfaces ACTIVE (≥1 correlated event) vs QUIET (0) investigations ranked by
 * event frequency. ▶ ASSESS per case → /v1/jarvis/agent/chat 2-sentence
 * tactical note + TTS via jarvis:speak-dossier. jarvis:invopsfreq-toggle.
 *
 * Exports: isInvOpsFreqQuery, buildInvOpsFreqScript (voice wiring for JarvisBrain)
 */

import { useState, useEffect, useRef, useCallback } from "react";

const CY = "#29E7FF";
const MG = "#FF2D78";
const AM = "#FFB347";
const API_KEY =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL)
    return import.meta.env.VITE_API_BASE_URL.replace(/\/$/, "");
  return "http://localhost:8000";
}

async function headers() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
}

function tokenize(str = "") {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3);
}

function correlate(inv, events) {
  const invTokens = new Set([
    ...tokenize(inv.title || ""),
    ...tokenize(inv.description || ""),
    ...tokenize(inv.name || ""),
  ]);
  return events.filter((ev) => {
    const evTokens = tokenize(
      (ev.message || "") + " " + (ev.service || "") + " " + (ev.source || "") + " " + (ev.type || "")
    );
    return evTokens.some((t) => invTokens.has(t));
  });
}

// ── Voice intent detector ────────────────────────────────────────────────────
const INV_OPS_RE =
  /\b(investigation\s+ops|case\s+event|ops\s+per\s+case|event\s+frequency|case\s+frequency|invopsfreq|ops\s+activity\s+per\s+(case|inv)|investigation\s+events?|case\s+ops\s+corr|case\s+chatter)\b/i;

export function isInvOpsFreqQuery(q) {
  return INV_OPS_RE.test(q || "");
}

export async function buildInvOpsFreqScript() {
  try {
    const h = await headers();
    const [invRes, opsRes] = await Promise.all([
      fetch(`${apiBase()}/v1/investigations`, { headers: h }),
      fetch(`${apiBase()}/v1/ops/events`, { headers: h }),
    ]);
    const investigations = invRes.ok ? await invRes.json() : [];
    const events = opsRes.ok ? await opsRes.json() : [];
    const evArr = Array.isArray(events) ? events : events.events || [];
    const invArr = Array.isArray(investigations) ? investigations : investigations.investigations || investigations.items || [];

    const enriched = invArr.map((inv) => ({
      ...inv,
      _evCount: correlate(inv, evArr).length,
    }));
    const active = enriched.filter((i) => i._evCount > 0);
    const quiet = enriched.filter((i) => i._evCount === 0);
    const topCase = active.sort((a, b) => b._evCount - a._evCount)[0];

    const summary =
      `${active.length} of ${invArr.length} investigations have correlated ops events. ` +
      (topCase
        ? `Highest activity: "${topCase.title || topCase.name || "Unknown"}" with ${topCase._evCount} event${topCase._evCount !== 1 ? "s" : ""}. `
        : "") +
      `${quiet.length} investigation${quiet.length !== 1 ? "s" : ""} show no recent operational chatter.`;

    const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        message: `Investigations: ${invArr.length} total, ${active.length} have correlated ops events, ${quiet.length} are quiet. Top active: "${topCase?.title || topCase?.name || "none"}". Summarise in 2 sentences what this operational picture means.`,
      }),
    });
    if (r.ok) {
      const data = await r.json();
      const ai = data.response || data.message || data.answer || "";
      if (ai) return summary + " " + ai;
    }
    return summary;
  } catch {
    return "Investigation ops frequency data unavailable. Check backend connectivity.";
  }
}

// ── Panel component ──────────────────────────────────────────────────────────
export default function InvestigationOpsFrequency() {
  const [visible, setVisible] = useState(false);
  const [investigations, setInvestigations] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessments, setAssessments] = useState({});
  const [assessing, setAssessing] = useState({});
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const h = await headers();
      const [invRes, opsRes] = await Promise.all([
        fetch(`${apiBase()}/v1/investigations`, { headers: h }),
        fetch(`${apiBase()}/v1/ops/events`, { headers: h }),
      ]);
      const invRaw = invRes.ok ? await invRes.json() : [];
      const opsRaw = opsRes.ok ? await opsRes.json() : [];
      const invArr = Array.isArray(invRaw) ? invRaw : invRaw.investigations || invRaw.items || [];
      const evArr = Array.isArray(opsRaw) ? opsRaw : opsRaw.events || [];
      setInvestigations(invArr);
      setEvents(evArr);
    } catch {
      /* network down — keep stale data */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:invopsfreq-toggle", toggle);
    return () => window.removeEventListener("jarvis:invopsfreq-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    fetchData();
    timerRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(timerRef.current);
  }, [visible, fetchData]);

  const enriched = investigations.map((inv) => {
    const correlated = correlate(inv, events);
    return { ...inv, _evCount: correlated.length, _events: correlated };
  });

  const totalActive = enriched.filter((i) => i._evCount > 0).length;
  const totalQuiet = enriched.filter((i) => i._evCount === 0).length;
  const totalEvents = events.length;

  const sorted = [...enriched].sort((a, b) => b._evCount - a._evCount);

  const filtered = sorted.filter((inv) => {
    const matchTab =
      tab === "ALL" ||
      (tab === "ACTIVE" && inv._evCount > 0) ||
      (tab === "QUIET" && inv._evCount === 0);
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (inv.title || inv.name || "").toLowerCase().includes(q) ||
      (inv.description || "").toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  async function assess(inv) {
    const id = inv.id || inv.title || inv.name || Math.random();
    setAssessing((prev) => ({ ...prev, [id]: true }));
    try {
      const h = await headers();
      const topEvents = (inv._events || [])
        .slice(0, 3)
        .map((e) => `${e.severity || "INFO"} – ${e.message || e.type || "event"}`)
        .join("; ");
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          message: `Investigation "${inv.title || inv.name}" has ${inv._evCount} correlated ops events. Top events: ${topEvents || "none"}. Provide a 2-sentence tactical assessment.`,
        }),
      });
      if (r.ok) {
        const data = await r.json();
        const text = data.response || data.message || data.answer || "";
        setAssessments((prev) => ({ ...prev, [id]: text }));
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text } })
        );
      }
    } catch {
      setAssessments((prev) => ({ ...prev, [id]: "Assessment unavailable." }));
    } finally {
      setAssessing((prev) => ({ ...prev, [id]: false }));
    }
  }

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        title="Investigation × Ops Event Frequency (Ctrl+Shift+Q)"
        style={{
          position: "fixed",
          left: 30240,
          bottom: 8,
          zIndex: 110,
          background: "rgba(41,231,255,0.10)",
          border: `1px solid ${CY}44`,
          color: CY,
          fontFamily: "monospace",
          fontSize: 10,
          padding: "3px 7px",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: 1,
        }}
      >
        ◈ INVFREQ
        {totalActive > 0 && (
          <span
            style={{
              marginLeft: 4,
              background: MG,
              color: "#fff",
              borderRadius: 8,
              padding: "0 5px",
              fontSize: 9,
            }}
          >
            {totalActive}
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      {/* keyboard shortcut */}
      <KeyHandler onClose={() => setVisible(false)} />

      <div
        style={{
          position: "fixed",
          top: 60,
          left: "50%",
          transform: "translateX(-50%)",
          width: 720,
          maxHeight: "80vh",
          overflowY: "auto",
          background: "rgba(8,18,32,0.97)",
          border: `1px solid ${CY}55`,
          borderRadius: 10,
          zIndex: 3000,
          fontFamily: "monospace",
          color: CY,
          boxShadow: `0 0 40px ${CY}22`,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 16px",
            borderBottom: `1px solid ${CY}33`,
          }}
        >
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
              INVESTIGATION × OPS EVENT FREQUENCY
            </span>
            {loading && (
              <span style={{ marginLeft: 10, fontSize: 10, color: AM }}>
                ● refreshing
              </span>
            )}
          </div>
          <button
            onClick={() => setVisible(false)}
            style={{
              background: "none",
              border: "none",
              color: CY,
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            ✕
          </button>
        </div>

        {/* Stat tiles */}
        <div
          style={{
            display: "flex",
            gap: 12,
            padding: "10px 16px",
            borderBottom: `1px solid ${CY}22`,
          }}
        >
          {[
            { label: "CASES", value: investigations.length, color: CY },
            { label: "ACTIVE", value: totalActive, color: MG },
            { label: "QUIET", value: totalQuiet, color: "#888" },
            { label: "OPS EVENTS", value: totalEvents, color: AM },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              style={{
                flex: 1,
                background: `${color}11`,
                border: `1px solid ${color}33`,
                borderRadius: 6,
                padding: "6px 10px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
              <div style={{ fontSize: 9, color: "#888", letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "8px 16px",
            alignItems: "center",
            borderBottom: `1px solid ${CY}22`,
          }}
        >
          {["ALL", "ACTIVE", "QUIET"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? `${CY}22` : "transparent",
                border: `1px solid ${tab === t ? CY : CY + "44"}`,
                color: tab === t ? CY : "#888",
                fontFamily: "monospace",
                fontSize: 10,
                padding: "3px 10px",
                borderRadius: 4,
                cursor: "pointer",
                letterSpacing: 1,
              }}
            >
              {t}
            </button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search cases…"
            style={{
              marginLeft: "auto",
              background: "rgba(41,231,255,0.06)",
              border: `1px solid ${CY}33`,
              color: CY,
              fontFamily: "monospace",
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 4,
              width: 180,
              outline: "none",
            }}
          />
        </div>

        {/* Case list */}
        <div style={{ padding: "8px 16px 16px" }}>
          {filtered.length === 0 && (
            <div style={{ color: "#555", fontSize: 12, padding: "20px 0", textAlign: "center" }}>
              {loading ? "Loading investigations…" : "No investigations found."}
            </div>
          )}
          {filtered.map((inv) => {
            const id = inv.id || inv.title || inv.name || "?";
            const isExpanded = expanded === id;
            const hasEvents = inv._evCount > 0;
            const barPct = investigations.length
              ? Math.round((inv._evCount / Math.max(1, ...enriched.map((i) => i._evCount))) * 100)
              : 0;

            return (
              <div
                key={id}
                style={{
                  marginBottom: 6,
                  border: `1px solid ${hasEvents ? CY + "44" : "#333"}`,
                  borderRadius: 6,
                  overflow: "hidden",
                }}
              >
                {/* Row header */}
                <div
                  onClick={() => setExpanded(isExpanded ? null : id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 10px",
                    cursor: "pointer",
                    background: hasEvents ? `${CY}08` : "transparent",
                  }}
                >
                  {/* Frequency bar */}
                  <div style={{ width: 80, position: "relative", height: 6, background: "#111", borderRadius: 3 }}>
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        height: "100%",
                        width: `${barPct}%`,
                        background: hasEvents ? MG : "#333",
                        borderRadius: 3,
                        transition: "width 0.4s",
                      }}
                    />
                  </div>

                  <span
                    style={{
                      fontSize: 11,
                      color: hasEvents ? CY : "#666",
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {inv.title || inv.name || id}
                  </span>

                  <span
                    style={{
                      fontSize: 10,
                      color: hasEvents ? MG : "#555",
                      minWidth: 60,
                      textAlign: "right",
                    }}
                  >
                    {hasEvents ? `${inv._evCount} event${inv._evCount !== 1 ? "s" : ""}` : "quiet"}
                  </span>

                  <span
                    style={{
                      fontSize: 9,
                      color: "#666",
                      background: hasEvents ? `${MG}22` : "#222",
                      borderRadius: 3,
                      padding: "1px 5px",
                      border: `1px solid ${hasEvents ? MG + "44" : "#444"}`,
                    }}
                  >
                    {hasEvents ? "ACTIVE" : "QUIET"}
                  </span>
                </div>

                {/* Expanded view */}
                {isExpanded && (
                  <div
                    style={{
                      padding: "8px 10px 10px",
                      borderTop: `1px solid ${CY}22`,
                      background: "rgba(0,0,0,0.3)",
                    }}
                  >
                    {inv.description && (
                      <div style={{ fontSize: 10, color: "#aaa", marginBottom: 8 }}>
                        {inv.description}
                      </div>
                    )}

                    {inv._events.length > 0 ? (
                      <>
                        <div style={{ fontSize: 9, color: "#666", letterSpacing: 1, marginBottom: 4 }}>
                          CORRELATED OPS EVENTS
                        </div>
                        {inv._events.slice(0, 5).map((ev, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                              marginBottom: 3,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 9,
                                padding: "1px 5px",
                                borderRadius: 3,
                                background:
                                  ev.severity === "CRITICAL"
                                    ? `${MG}33`
                                    : ev.severity === "HIGH"
                                    ? `${AM}33`
                                    : "#222",
                                color:
                                  ev.severity === "CRITICAL"
                                    ? MG
                                    : ev.severity === "HIGH"
                                    ? AM
                                    : "#888",
                                border: `1px solid ${
                                  ev.severity === "CRITICAL"
                                    ? MG + "55"
                                    : ev.severity === "HIGH"
                                    ? AM + "55"
                                    : "#444"
                                }`,
                              }}
                            >
                              {ev.severity || "INFO"}
                            </span>
                            <span style={{ fontSize: 10, color: "#ccc", flex: 1 }}>
                              {ev.message || ev.type || ev.source || "event"}
                            </span>
                            {ev.service && (
                              <span style={{ fontSize: 9, color: "#666" }}>{ev.service}</span>
                            )}
                          </div>
                        ))}
                        {inv._events.length > 5 && (
                          <div style={{ fontSize: 9, color: "#555", marginTop: 2 }}>
                            +{inv._events.length - 5} more events
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: 10, color: "#555" }}>
                        No correlated ops events found.
                      </div>
                    )}

                    {/* ASSESS button */}
                    <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <button
                        onClick={() => assess(inv)}
                        disabled={!!assessing[id]}
                        style={{
                          background: `${CY}15`,
                          border: `1px solid ${CY}44`,
                          color: CY,
                          fontFamily: "monospace",
                          fontSize: 10,
                          padding: "3px 10px",
                          borderRadius: 4,
                          cursor: assessing[id] ? "wait" : "pointer",
                          letterSpacing: 1,
                        }}
                      >
                        {assessing[id] ? "▶ …" : "▶ ASSESS"}
                      </button>
                      {assessments[id] && (
                        <div style={{ fontSize: 10, color: "#ccc", flex: 1 }}>
                          {assessments[id]}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function KeyHandler({ onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
      if (e.ctrlKey && e.shiftKey && e.key === "Q") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return null;
}
