/**
 * F763 — Ops Alert × Task × RiskSignal Triple Nexus (OALTRIAX)
 * Endpoints: /v1/ops/alerts × /entities/Task × /entities/RiskSignal
 * Classification: FULLY_ACTIONABLE | TASK_ONLY | RISK_ONLY | DARK
 */
import { useEffect, useState, useRef } from "react";

const BTN_LEFT = 925_520;
const POLL_MS = 90_000;

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  import.meta.env?.VITE_API_KEY ||
  "";

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

const OALTRIAX_RE =
  /\b(oaltriax|ops\s*alert\s*task\s*risk|alert\s*task\s*coverage|actionable\s*alerts?|dark\s*alerts?|unactionable\s*alerts?|ops\s*action\s*coverage)\b/i;

export function isOaltriaxQuery(t) {
  return OALTRIAX_RE.test(t || "");
}

// ── Normalisers ───────────────────────────────────────────────────────────────

function normaliseAlert(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.alert_id || raw._id || String(Math.random()),
    title: raw.title || raw.name || raw.message || raw.description || "Untitled Alert",
    severity: raw.severity || raw.level || raw.priority || "unknown",
    status: raw.status || raw.state || "open",
    source: raw.source || raw.origin || raw.system || "",
    created: raw.created_at || raw.created || raw.timestamp || raw.time || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    extra: raw,
  };
}

function normaliseTask(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.task_id || raw._id || String(Math.random()),
    title: raw.title || raw.name || raw.summary || "Untitled Task",
    status: raw.status || raw.state || "open",
    priority: raw.priority || raw.severity || "normal",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    related: raw.related_alerts || raw.alert_ids || raw.refs || [],
    extra: raw,
  };
}

function normaliseRisk(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.risk_id || raw._id || String(Math.random()),
    title: raw.title || raw.name || raw.signal || "Untitled Risk",
    severity: raw.severity || raw.level || "medium",
    category: raw.category || raw.type || raw.class || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    related: raw.related_alerts || raw.alert_ids || raw.refs || [],
    extra: raw,
  };
}

// ── Keyword extraction ────────────────────────────────────────────────────────

function keywords(obj) {
  const txt = JSON.stringify(obj || "").toLowerCase();
  return txt.match(/[a-z]{4,}/g) || [];
}

function scoreMatch(aKw, bKw) {
  const setB = new Set(bKw);
  return aKw.filter((w) => w.length > 3 && setB.has(w)).length;
}

// ── Nexus builder ─────────────────────────────────────────────────────────────

const CLASS_META = {
  FULLY_ACTIONABLE: {
    label: "FULLY ACTIONABLE",
    color: "#00ff88",
    desc: "Alert matched to both a Task and a RiskSignal",
  },
  TASK_ONLY: {
    label: "TASK ONLY",
    color: "#00cfff",
    desc: "Alert matched to a Task but no RiskSignal",
  },
  RISK_ONLY: {
    label: "RISK ONLY",
    color: "#ffaa00",
    desc: "Alert matched to a RiskSignal but no Task",
  },
  DARK: {
    label: "DARK",
    color: "#666",
    desc: "Alert with no matching Task or RiskSignal",
  },
};

function buildNexus(alerts, tasks, risks) {
  return alerts.map((alert) => {
    const aKw = keywords(alert);
    let bestTask = null;
    let bestTaskScore = 0;
    for (const t of tasks) {
      const s = scoreMatch(aKw, keywords(t));
      if (s > bestTaskScore) {
        bestTaskScore = s;
        bestTask = t;
      }
    }
    let bestRisk = null;
    let bestRiskScore = 0;
    for (const r of risks) {
      const s = scoreMatch(aKw, keywords(r));
      if (s > bestRiskScore) {
        bestRiskScore = s;
        bestRisk = r;
      }
    }
    const hasTask = bestTask && bestTaskScore > 0;
    const hasRisk = bestRisk && bestRiskScore > 0;
    const cls = hasTask && hasRisk
      ? "FULLY_ACTIONABLE"
      : hasTask
      ? "TASK_ONLY"
      : hasRisk
      ? "RISK_ONLY"
      : "DARK";
    return {
      alert,
      task: hasTask ? bestTask : null,
      taskScore: bestTaskScore,
      risk: hasRisk ? bestRisk : null,
      riskScore: bestRiskScore,
      cls,
    };
  });
}

// ── Fetch all three endpoints ─────────────────────────────────────────────────

async function fetchAll() {
  const base = apiBase();
  const hdr = { Authorization: `Bearer ${API_KEY}` };

  const [aRaw, tRaw, rRaw] = await Promise.all([
    fetch(`${base}/v1/ops/alerts?limit=200`, { headers: hdr }).then((r) =>
      r.ok ? r.json() : []
    ),
    fetch(`${base}/entities/Task`, { headers: hdr }).then((r) =>
      r.ok ? r.json() : []
    ),
    fetch(`${base}/entities/RiskSignal`, { headers: hdr }).then((r) =>
      r.ok ? r.json() : []
    ),
  ]);

  const alerts = (Array.isArray(aRaw) ? aRaw : aRaw?.data ?? aRaw?.alerts ?? []).map(
    normaliseAlert
  ).filter(Boolean);
  const tasks = (Array.isArray(tRaw) ? tRaw : tRaw?.data ?? tRaw?.tasks ?? []).map(
    normaliseTask
  ).filter(Boolean);
  const risks = (Array.isArray(rRaw) ? rRaw : rRaw?.data ?? rRaw?.risks ?? []).map(
    normaliseRisk
  ).filter(Boolean);

  return { alerts, tasks, risks };
}

export async function buildOaltriaxScript() {
  try {
    const { alerts, tasks, risks } = await fetchAll();
    const rows = buildNexus(alerts, tasks, risks);
    const counts = {
      FULLY_ACTIONABLE: rows.filter((r) => r.cls === "FULLY_ACTIONABLE").length,
      TASK_ONLY: rows.filter((r) => r.cls === "TASK_ONLY").length,
      RISK_ONLY: rows.filter((r) => r.cls === "RISK_ONLY").length,
      DARK: rows.filter((r) => r.cls === "DARK").length,
    };
    return (
      `Ops Alert Task Risk Nexus: ${alerts.length} alerts cross-referenced against ` +
      `${tasks.length} tasks and ${risks.length} risk signals. ` +
      `Fully actionable: ${counts.FULLY_ACTIONABLE}. ` +
      `Task only: ${counts.TASK_ONLY}. ` +
      `Risk only: ${counts.RISK_ONLY}. ` +
      `Dark (unmatched): ${counts.DARK}.`
    );
  } catch (e) {
    return `Ops Alert Task Risk Nexus unavailable: ${e.message}`;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OpsAlertTaskRiskTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({
    FULLY_ACTIONABLE: 0,
    TASK_ONLY: 0,
    RISK_ONLY: 0,
    DARK: 0,
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const intervalRef = useRef(null);

  useEffect(() => {
    function handler(e) {
      setOpen((v) => (e.detail?.force !== undefined ? e.detail.force : !v));
    }
    window.addEventListener("jarvis:oaltriax-toggle", handler);
    return () => window.removeEventListener("jarvis:oaltriax-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) {
      clearInterval(intervalRef.current);
      return;
    }
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const { alerts, tasks, risks } = await fetchAll();
        const nexus = buildNexus(alerts, tasks, risks);
        setRows(nexus);
        setCounts({
          FULLY_ACTIONABLE: nexus.filter((r) => r.cls === "FULLY_ACTIONABLE").length,
          TASK_ONLY: nexus.filter((r) => r.cls === "TASK_ONLY").length,
          RISK_ONLY: nexus.filter((r) => r.cls === "RISK_ONLY").length,
          DARK: nexus.filter((r) => r.cls === "DARK").length,
        });
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
    intervalRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(intervalRef.current);
  }, [open]);

  const visible = rows.filter((r) => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.alert.title.toLowerCase().includes(q) ||
        (r.task?.title || "").toLowerCase().includes(q) ||
        (r.risk?.title || "").toLowerCase().includes(q) ||
        r.alert.severity.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalBadge = counts.FULLY_ACTIONABLE + counts.TASK_ONLY + counts.RISK_ONLY + counts.DARK;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 620,
          fontFamily: "monospace",
          fontSize: 10,
          padding: "2px 7px",
          background: open ? "#1a0a00" : "#0a0a0a",
          color: open ? "#ff8800" : "#555",
          border: `1px solid ${open ? "#ff8800" : "#333"}`,
          borderRadius: 3,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
        title="Ops Alert × Task × RiskSignal Nexus"
      >
        OALTRIAX{totalBadge > 0 ? ` [${totalBadge}]` : ""}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 36,
            left: BTN_LEFT - 200,
            width: 860,
            maxHeight: 560,
            zIndex: 620,
            background: "#0a0500",
            border: "1px solid #ff8800",
            borderRadius: 6,
            fontFamily: "monospace",
            fontSize: 11,
            color: "#ccc",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 0 24px #ff880044",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "6px 12px",
              borderBottom: "1px solid #ff880044",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span style={{ color: "#ff8800", fontWeight: "bold", fontSize: 12 }}>
              OALTRIAX
            </span>
            <span style={{ color: "#555", fontSize: 10 }}>
              Ops Alert × Task × RiskSignal
            </span>
            {loading && (
              <span style={{ color: "#ff8800", marginLeft: "auto", fontSize: 10 }}>
                LOADING…
              </span>
            )}
            {err && (
              <span style={{ color: "#f55", marginLeft: "auto", fontSize: 10 }}>
                ERR: {err}
              </span>
            )}
            <button
              onClick={() => setOpen(false)}
              style={{
                marginLeft: "auto",
                background: "none",
                border: "none",
                color: "#666",
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "6px 12px",
              flexShrink: 0,
              borderBottom: "1px solid #ff880022",
            }}
          >
            {Object.entries(CLASS_META).map(([k, meta]) => (
              <div
                key={k}
                onClick={() => setFilter(filter === k ? "ALL" : k)}
                style={{
                  flex: 1,
                  background: filter === k ? "#1a0800" : "#111",
                  border: `1px solid ${filter === k ? meta.color : "#333"}`,
                  borderRadius: 4,
                  padding: "4px 6px",
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                <div style={{ color: meta.color, fontSize: 16, fontWeight: "bold" }}>
                  {counts[k]}
                </div>
                <div style={{ color: "#666", fontSize: 9 }}>{meta.label}</div>
              </div>
            ))}
          </div>

          {/* Search + filter */}
          <div
            style={{
              padding: "4px 12px",
              flexShrink: 0,
              display: "flex",
              gap: 8,
              alignItems: "center",
              borderBottom: "1px solid #ff880022",
            }}
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search alerts / tasks / risks…"
              style={{
                flex: 1,
                background: "#111",
                border: "1px solid #333",
                borderRadius: 3,
                color: "#ccc",
                fontFamily: "monospace",
                fontSize: 10,
                padding: "2px 6px",
              }}
            />
            <span style={{ color: "#555", fontSize: 10 }}>
              {visible.length}/{rows.length}
            </span>
          </div>

          {/* Rows */}
          <div style={{ overflow: "auto", flex: 1 }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: 16, color: "#444", textAlign: "center" }}>
                {err ? "Error loading data." : "No alerts match."}
              </div>
            )}
            {visible.map((row, i) => {
              const meta = CLASS_META[row.cls];
              return (
                <div
                  key={row.alert.id + i}
                  style={{
                    padding: "5px 12px",
                    borderBottom: "1px solid #1a1000",
                    display: "grid",
                    gridTemplateColumns: "90px 1fr 1fr 1fr",
                    gap: 6,
                    alignItems: "start",
                  }}
                >
                  <div>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "1px 4px",
                        borderRadius: 2,
                        background: "#1a1000",
                        border: `1px solid ${meta.color}`,
                        color: meta.color,
                        fontSize: 9,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {meta.label}
                    </span>
                    <div
                      style={{ color: "#555", fontSize: 9, marginTop: 2 }}
                    >
                      {row.alert.severity}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "#ff9940", fontSize: 10, fontWeight: "bold" }}>
                      {row.alert.title}
                    </div>
                    <div style={{ color: "#555", fontSize: 9 }}>
                      {row.alert.source || row.alert.status}
                    </div>
                  </div>
                  <div>
                    {row.task ? (
                      <>
                        <div style={{ color: "#00cfff", fontSize: 10 }}>
                          {row.task.title}
                        </div>
                        <div style={{ color: "#555", fontSize: 9 }}>
                          task · score {row.taskScore}
                        </div>
                      </>
                    ) : (
                      <div style={{ color: "#333", fontSize: 10 }}>—</div>
                    )}
                  </div>
                  <div>
                    {row.risk ? (
                      <>
                        <div style={{ color: "#ffaa00", fontSize: 10 }}>
                          {row.risk.title}
                        </div>
                        <div style={{ color: "#555", fontSize: 9 }}>
                          risk · score {row.riskScore}
                        </div>
                      </>
                    ) : (
                      <div style={{ color: "#333", fontSize: 10 }}>—</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "3px 12px",
              borderTop: "1px solid #ff880022",
              color: "#444",
              fontSize: 9,
              flexShrink: 0,
            }}
          >
            /v1/ops/alerts × /entities/Task × /entities/RiskSignal · poll {POLL_MS / 1000}s
          </div>
        </div>
      )}
    </>
  );
}
