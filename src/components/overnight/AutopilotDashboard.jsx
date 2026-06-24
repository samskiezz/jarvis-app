/**
 * AutopilotDashboard — F71
 * JARVIS Autonomous Autopilot status panel.
 * Real endpoints:
 *   GET /assurance/autopilot/status    → { ok, phase?, cycle?, error?, ... }
 *   GET /assurance/autopilot/proposals → { proposals: [{ name, size, mtime }], count }
 *   GET /assurance/autopilot/roadmap   → { next: { next: [...] }, backlog: [...] }
 * Left-edge slide-in at 37% vertical. Sky-blue (#0EA5E9) accent. 2-min poll.
 */
import { useState, useEffect, useRef } from "react";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/$/, "");
  }
  return "";
}

const ACC = "#0EA5E9";
const POLL_MS = 2 * 60 * 1000;

const TABS = ["STATUS", "PROPOSALS", "ROADMAP"];

function relAge(ts) {
  if (!ts) return null;
  const val = typeof ts === "number" && ts > 1e12 ? ts : ts * 1000;
  const s = Math.floor((Date.now() - val) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Badge({ label, color, bg }) {
  return (
    <span
      style={{
        fontSize: 9, letterSpacing: 1, padding: "1px 5px",
        border: `1px solid ${color}55`, borderRadius: 4,
        color, background: bg || `${color}15`, flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

function StatusTab({ status, error }) {
  if (error) {
    return (
      <div style={{ color: "#EF4444", fontSize: 10, padding: "12px 14px" }}>
        ⚠ {error}
      </div>
    );
  }
  if (!status) {
    return (
      <div style={{ color: "#475569", fontSize: 10, textAlign: "center", padding: 20 }}>
        LOADING…
      </div>
    );
  }

  const isOk = status.ok === true;
  const hasError = status.error && status.error !== "no status yet";
  const awaiting = !isOk && !hasError;

  const rows = Object.entries(status).filter(
    ([k]) => !["ok", "error"].includes(k)
  );

  return (
    <div style={{ padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div
          style={{
            width: 8, height: 8, borderRadius: "50%",
            background: awaiting ? "#64748B" : isOk ? "#22C55E" : "#EF4444",
            flexShrink: 0,
          }}
        />
        {awaiting ? (
          <Badge label="AWAITING FIRST RUN" color="#64748B" />
        ) : isOk ? (
          <Badge label="ONLINE" color="#22C55E" />
        ) : (
          <Badge label="ERROR" color="#EF4444" />
        )}
      </div>

      {hasError && (
        <div style={{ color: "#EF444488", fontSize: 10, marginBottom: 8, lineHeight: 1.4 }}>
          {status.error}
        </div>
      )}

      {rows.length > 0 && (
        <div
          style={{
            background: "#0F172A",
            border: "1px solid #1E293B",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          {rows.map(([k, v]) => (
            <div
              key={k}
              style={{
                display: "flex", justifyContent: "space-between",
                padding: "5px 10px", borderBottom: "1px solid #1E293B",
                fontSize: 10,
              }}
            >
              <span style={{ color: "#64748B", letterSpacing: 0.5 }}>{k}</span>
              <span
                style={{
                  color: "#CBD5E1", maxWidth: 160, overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProposalsTab({ proposals, error }) {
  if (error) {
    return (
      <div style={{ color: "#EF4444", fontSize: 10, padding: "12px 14px" }}>
        ⚠ {error}
      </div>
    );
  }
  if (!proposals) {
    return (
      <div style={{ color: "#475569", fontSize: 10, textAlign: "center", padding: 20 }}>
        LOADING…
      </div>
    );
  }
  if (proposals.length === 0) {
    return (
      <div style={{ color: "#475569", fontSize: 10, textAlign: "center", padding: 20 }}>
        NO PENDING PROPOSALS
      </div>
    );
  }
  return (
    <div>
      {proposals.map((p) => (
        <div
          key={p.name}
          style={{
            padding: "8px 14px",
            borderBottom: "1px solid #1E293B",
          }}
        >
          <div style={{ color: "#E2E8F0", fontSize: 11, marginBottom: 3 }}>
            {p.name.replace(/\.md$/, "")}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ color: "#475569", fontSize: 9 }}>
              {Math.round((p.size || 0) / 1024 * 10) / 10} KB
            </span>
            {p.mtime && (
              <span style={{ color: "#334155", fontSize: 9 }}>
                {relAge(p.mtime)}
              </span>
            )}
            <Badge label="PROPOSAL" color={ACC} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RoadmapTab({ roadmap, error }) {
  if (error) {
    return (
      <div style={{ color: "#EF4444", fontSize: 10, padding: "12px 14px" }}>
        ⚠ {error}
      </div>
    );
  }
  if (!roadmap) {
    return (
      <div style={{ color: "#475569", fontSize: 10, textAlign: "center", padding: 20 }}>
        LOADING…
      </div>
    );
  }

  const nextItems = Array.isArray(roadmap.next?.next)
    ? roadmap.next.next
    : [];
  const backlog = Array.isArray(roadmap.backlog) ? roadmap.backlog : [];
  const empty = nextItems.length === 0 && backlog.length === 0;

  if (empty) {
    return (
      <div style={{ color: "#475569", fontSize: 10, textAlign: "center", padding: 20 }}>
        NO ROADMAP ENTRIES
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 0" }}>
      {nextItems.length > 0 && (
        <>
          <div
            style={{
              padding: "4px 14px", color: ACC, fontSize: 9,
              letterSpacing: 1, borderBottom: "1px solid #1E293B",
            }}
          >
            NEXT ACTIONS
          </div>
          {nextItems.map((item, i) => (
            <div
              key={i}
              style={{
                padding: "7px 14px", borderBottom: "1px solid #1E293B",
                color: "#CBD5E1", fontSize: 10,
              }}
            >
              <span style={{ color: "#475569", marginRight: 6 }}>{i + 1}.</span>
              {typeof item === "string"
                ? item
                : item.action || item.description || item.name || JSON.stringify(item)}
            </div>
          ))}
        </>
      )}
      {backlog.length > 0 && (
        <>
          <div
            style={{
              padding: "6px 14px", color: "#64748B", fontSize: 9,
              letterSpacing: 1, borderBottom: "1px solid #1E293B",
            }}
          >
            BACKLOG ({backlog.length})
          </div>
          {backlog.slice(0, 12).map((item, i) => (
            <div
              key={i}
              style={{
                padding: "6px 14px", borderBottom: "1px solid #1E293B",
                color: "#64748B", fontSize: 10,
              }}
            >
              {typeof item === "string"
                ? item
                : item.action || item.description || item.name || JSON.stringify(item)}
            </div>
          ))}
          {backlog.length > 12 && (
            <div style={{ color: "#334155", fontSize: 9, padding: "4px 14px" }}>
              +{backlog.length - 12} more items
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AutopilotDashboard() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("STATUS");

  const [status, setStatus] = useState(null);
  const [proposals, setProposals] = useState(null);
  const [roadmap, setRoadmap] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);

  const timerRef = useRef(null);

  async function fetchAll() {
    setLoading(true);
    const errs = {};
    const hdrs = { Authorization: `Bearer ${API_KEY}` };
    const base = apiBase();

    await Promise.all([
      fetch(`${base}/assurance/autopilot/status`, { headers: hdrs })
        .then((r) => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
        .then(setStatus)
        .catch((e) => { errs.status = String(e); }),

      fetch(`${base}/assurance/autopilot/proposals`, { headers: hdrs })
        .then((r) => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
        .then((d) => setProposals(d.proposals || []))
        .catch((e) => { errs.proposals = String(e); }),

      fetch(`${base}/assurance/autopilot/roadmap`, { headers: hdrs })
        .then((r) => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
        .then(setRoadmap)
        .catch((e) => { errs.roadmap = String(e); }),
    ]);

    setErrors(errs);
    setLastFetch(Date.now());
    setLoading(false);
  }

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const proposalCount = proposals ? proposals.length : 0;

  return (
    <>
      {/* Tab */}
      <div
        onClick={() => setOpen((o) => !o)}
        title="Autopilot Dashboard"
        style={{
          position: "fixed",
          left: open ? 340 : 0,
          top: "37%",
          zIndex: 200,
          cursor: "pointer",
          background: "#0F172A",
          border: `1px solid ${ACC}44`,
          borderLeft: "none",
          borderRadius: "0 6px 6px 0",
          padding: "8px 6px",
          writingMode: "vertical-rl",
          fontSize: 10,
          letterSpacing: 1,
          color: ACC,
          userSelect: "none",
          transition: "left 0.25s",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
        }}
      >
        {proposalCount > 0 && (
          <span
            style={{
              fontSize: 8, background: ACC, color: "#0F172A",
              borderRadius: "50%", width: 14, height: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, writingMode: "horizontal-tb",
            }}
          >
            {proposalCount}
          </span>
        )}
        <span>AUTO ◀</span>
      </div>

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -340,
          top: "5%",
          width: 340,
          height: "90%",
          zIndex: 199,
          background: "rgba(15,23,42,0.97)",
          border: `1px solid ${ACC}33`,
          borderLeft: "none",
          borderRadius: "0 12px 12px 0",
          display: "flex",
          flexDirection: "column",
          transition: "left 0.25s",
          fontFamily: "monospace",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "10px 14px 8px",
            borderBottom: `1px solid ${ACC}22`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ color: ACC, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
                ⚙ AUTOPILOT
              </div>
              <div style={{ color: "#64748B", fontSize: 9, marginTop: 2 }}>
                {loading && !lastFetch ? "loading…" : lastFetch ? `updated ${relAge(lastFetch)}` : ""}
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none", border: "none", color: "#475569",
                cursor: "pointer", fontSize: 14, lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          {/* Sub-tabs */}
          <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                style={{
                  flex: 1, padding: "3px 0", fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${activeTab === t ? ACC : "#334155"}`,
                  borderRadius: 4, cursor: "pointer",
                  background: activeTab === t ? `${ACC}22` : "transparent",
                  color: activeTab === t ? ACC : "#64748B",
                }}
              >
                {t}
                {t === "PROPOSALS" && proposalCount > 0 && (
                  <span
                    style={{
                      marginLeft: 4, fontSize: 8, background: ACC,
                      color: "#0F172A", borderRadius: 8, padding: "0 3px",
                    }}
                  >
                    {proposalCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {activeTab === "STATUS" && (
            <StatusTab status={status} error={errors.status} />
          )}
          {activeTab === "PROPOSALS" && (
            <ProposalsTab proposals={proposals} error={errors.proposals} />
          )}
          {activeTab === "ROADMAP" && (
            <RoadmapTab roadmap={roadmap} error={errors.roadmap} />
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 14px",
            borderTop: `1px solid ${ACC}22`,
            fontSize: 9,
            color: "#334155",
            flexShrink: 0,
          }}
        >
          ⚙ /assurance/autopilot/* · poll 2 min
        </div>
      </div>
    </>
  );
}
