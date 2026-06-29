/**
 * ServiceRegistry — live roster of all services that have announced themselves to
 * the JARVIS registry hub (via POST /v1/registry/announce + heartbeat).
 * Endpoint: GET /v1/registry/services → { count, alive, services: [{id,name,port,role,alive,status,metrics,...}] }
 * Features: ALIVE/DEAD/ALL filter, text search, stat tiles, 30 s poll, expandable metrics detail.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, Badge, DataState, StatTile, Grid } from "@/components/PageKit";
import { apiGet, useAsync } from "@/lib/wave1";

const ACCENT = "#38BDF8"; // sky blue — infra tier
const POLL_MS = 30_000;

const ALIVE_COLOR  = C.green  || "#4ADE80";
const DEAD_COLOR   = C.red    || "#EF4444";
const UNKN_COLOR   = "#475569";

function aliveColor(svc) {
  if (svc.alive === true)  return ALIVE_COLOR;
  if (svc.alive === false) return DEAD_COLOR;
  return UNKN_COLOR;
}
function aliveTier(svc) {
  if (svc.alive === true)  return "ALIVE";
  if (svc.alive === false) return "DEAD";
  return "UNKNOWN";
}

function fmtPort(port) {
  return port != null ? `:${port}` : "";
}

function relTs(ts) {
  if (!ts) return "";
  const ms = typeof ts === "number"
    ? ts * (String(ts).length < 13 ? 1000 : 1)
    : new Date(ts).getTime();
  const diff = Date.now() - ms;
  if (isNaN(diff) || diff < 0) return "now";
  if (diff < 60_000)   return `${Math.round(diff / 1_000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function svcId(svc) {
  return svc?.id || svc?.name || JSON.stringify(svc);
}

/* ─── Row component ──────────────────────────────────────────────────────── */
function SvcRow({ svc, expanded, onToggle }) {
  const tier = aliveTier(svc);
  const color = aliveColor(svc);
  const hasMetrics = svc.metrics && typeof svc.metrics === "object" && Object.keys(svc.metrics).length > 0;
  const hasDetail = svc.status || hasMetrics || svc.last_seen || svc.version;

  const rowStyle = {
    padding: "9px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    cursor: hasDetail ? "pointer" : "default",
    background: expanded ? "rgba(56,189,248,0.05)" : "transparent",
    transition: "background 0.15s",
  };

  return (
    <>
      <div style={rowStyle} onClick={hasDetail ? onToggle : undefined}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Alive dot */}
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: color, boxShadow: `0 0 6px ${color}99`, flexShrink: 0,
          }} />

          {/* Name / id */}
          <span style={{ color: C.textB, fontFamily: "monospace", fontSize: 13, flex: "1 1 160px" }}>
            {svc.name || svc.id}
            {svc.name && svc.id && svc.name !== svc.id && (
              <span style={{ color: "#475569", fontSize: 10, marginLeft: 6 }}>#{svc.id}</span>
            )}
          </span>

          {/* Port */}
          {svc.port != null && (
            <span style={{ color: ACCENT, fontFamily: "monospace", fontSize: 11, flexShrink: 0 }}>
              {fmtPort(svc.port)}
            </span>
          )}

          {/* Role badge */}
          {svc.role && (
            <Badge color={ACCENT}>{svc.role.toUpperCase()}</Badge>
          )}

          {/* Status text */}
          {svc.status && (
            <span style={{ color: "#94A3B8", fontFamily: "monospace", fontSize: 10, flexShrink: 0 }}>
              {svc.status}
            </span>
          )}

          {/* Alive badge */}
          <Badge color={color}>{tier}</Badge>

          {/* Last seen */}
          {svc.last_seen && (
            <span style={{ color: "#475569", fontSize: 10, flexShrink: 0 }}>
              {relTs(svc.last_seen)}
            </span>
          )}

          {/* Expand indicator */}
          {hasDetail && (
            <span style={{ color: "#475569", fontSize: 10, marginLeft: "auto", flexShrink: 0 }}>
              {expanded ? "▲" : "▼"}
            </span>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{
          padding: "8px 14px 12px 32px",
          background: "rgba(56,189,248,0.03)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          fontFamily: "monospace", fontSize: 11,
        }}>
          {svc.version && (
            <div style={{ color: "#64748B", marginBottom: 4 }}>
              version: <span style={{ color: C.textB }}>{svc.version}</span>
            </div>
          )}
          {svc.last_seen && (
            <div style={{ color: "#64748B", marginBottom: 4 }}>
              last_seen: <span style={{ color: C.textB }}>{String(svc.last_seen)}</span>
            </div>
          )}
          {hasMetrics && (
            <div style={{ marginTop: 6 }}>
              <div style={{ color: ACCENT, marginBottom: 4, letterSpacing: 1 }}>METRICS</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {Object.entries(svc.metrics).map(([k, v]) => (
                  <div key={k} style={{
                    background: "rgba(0,0,0,0.3)", borderRadius: 4, padding: "3px 8px",
                    border: `1px solid ${ACCENT}22`,
                  }}>
                    <span style={{ color: "#64748B" }}>{k}: </span>
                    <span style={{ color: C.textB }}>{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */
export default function ServiceRegistry() {
  const [svcs, setSvcs]         = useState([]);
  const [query, setQuery]       = useState("");
  const [filter, setFilter]     = useState("ALL"); // ALL | ALIVE | DEAD
  const [expanded, setExpanded] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const async_ = useAsync();

  const load = useCallback(() => {
    async_.run(async () => {
      const data = await apiGet("/v1/registry/services");
      const list = Array.isArray(data?.services) ? data.services
        : Array.isArray(data) ? data : [];
      setSvcs(list);
      setUpdatedAt(new Date());
    });
  }, [async_]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const counts = useMemo(() => ({
    total: svcs.length,
    alive: svcs.filter((s) => s.alive === true).length,
    dead:  svcs.filter((s) => s.alive === false).length,
  }), [svcs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return svcs.filter((s) => {
      if (filter === "ALIVE" && s.alive !== true)  return false;
      if (filter === "DEAD"  && s.alive !== false) return false;
      if (q) {
        const blob = `${s.id} ${s.name} ${s.role} ${s.status}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [svcs, query, filter]);

  const toggle = (id) => setExpanded((p) => (p === id ? null : id));

  const inputStyle = {
    flex: 1, minWidth: 180, maxWidth: 340,
    background: "rgba(0,0,0,0.4)", border: `1px solid ${ACCENT}33`,
    borderRadius: 4, padding: "6px 10px", color: C.textB,
    fontFamily: "monospace", fontSize: 12, outline: "none",
  };
  const selStyle = {
    background: "rgba(0,0,0,0.4)", border: `1px solid ${ACCENT}33`, borderRadius: 4,
    padding: "5px 8px", color: C.textB, fontFamily: "monospace", fontSize: 11, cursor: "pointer",
  };

  return (
    <PageShell
      title="SERVICE REGISTRY"
      subtitle={`NEXUS SERVICE ROSTER · /v1/registry/services · ${POLL_MS / 1000}s POLL`}
      accent={ACCENT}
      actions={
        <div style={{ display: "flex", gap: 6 }}>
          <Badge color={ALIVE_COLOR}>{counts.alive} ALIVE</Badge>
          {counts.dead > 0 && <Badge color={DEAD_COLOR}>{counts.dead} DEAD</Badge>}
        </div>
      }
    >
      {/* Stat tiles */}
      <Grid min={140} gap={10} style={{ marginBottom: 16 }}>
        <StatTile label="TOTAL SERVICES" value={counts.total} accent={ACCENT} />
        <StatTile label="ALIVE"  value={counts.alive} accent={ALIVE_COLOR} />
        <StatTile label="DEAD"   value={counts.dead}  accent={DEAD_COLOR} />
        <StatTile label="UNKNOWN" value={counts.total - counts.alive - counts.dead} accent={UNKN_COLOR} />
      </Grid>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="search"
          placeholder="Search id, name, role, status…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={inputStyle}
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={selStyle}>
          <option value="ALL">All</option>
          <option value="ALIVE">Alive</option>
          <option value="DEAD">Dead</option>
        </select>
        <button
          onClick={load}
          style={{
            background: "none", border: `1px solid ${ACCENT}44`, borderRadius: 4,
            color: ACCENT, padding: "5px 10px", cursor: "pointer",
            fontSize: 10, letterSpacing: 1, fontFamily: "monospace",
          }}
        >
          ↺
        </button>
        {updatedAt && (
          <span style={{ fontSize: 9, color: "#475569" }}>{updatedAt.toLocaleTimeString()}</span>
        )}
        {(query || filter !== "ALL") && (
          <span style={{ fontSize: 10, color: C.text }}>
            {filtered.length} / {svcs.length}
          </span>
        )}
      </div>

      <PanelCard
        title="REGISTERED SERVICES"
        accent={ACCENT}
        right={<Badge color={ACCENT}>{filtered.length} services</Badge>}
      >
        <DataState
          loading={async_.loading}
          error={async_.error}
          empty={!async_.loading && !async_.error && filtered.length === 0}
          emptyLabel="No services registered"
        >
          <div style={{ maxHeight: "calc(100vh - 340px)", overflowY: "auto" }}>
            {filtered.map((svc) => {
              const id = svcId(svc);
              return (
                <SvcRow
                  key={id}
                  svc={svc}
                  expanded={expanded === id}
                  onToggle={() => toggle(id)}
                />
              );
            })}
          </div>
        </DataState>
      </PanelCard>
    </PageShell>
  );
}
