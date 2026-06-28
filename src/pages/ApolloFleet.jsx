/**
 * ApolloFleet — live fleet status table for Apollo deploy targets.
 * Endpoint: GET /v1/jarvis/apollo/fleet → { nodes: [{id,name,status,host,last_seen,...}] }
 * Features: status badges, last-seen, per-node detail expansion, status + text filter, 30s poll.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, Badge, DataState, StatTile, Grid } from "@/components/PageKit";
import { apiGet, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.green || "#7CFF7C";
const POLL_MS = 30000;

const STATUS_COLOR = {
  online:   C.green  || "#7CFF7C",
  active:   C.green  || "#7CFF7C",
  healthy:  C.green  || "#7CFF7C",
  running:  C.green  || "#7CFF7C",
  degraded: C.gold   || "#F59E0B",
  warning:  C.gold   || "#F59E0B",
  partial:  C.gold   || "#F59E0B",
  offline:  C.red    || "#EF4444",
  down:     C.red    || "#EF4444",
  error:    C.red    || "#EF4444",
  failed:   C.red    || "#EF4444",
  unknown:  "#475569",
};

function statusColor(status) {
  const s = (status || "unknown").toLowerCase();
  return STATUS_COLOR[s] || STATUS_COLOR.unknown;
}

function statusTier(status) {
  const s = (status || "").toLowerCase();
  if (/online|active|healthy|running/.test(s)) return "ONLINE";
  if (/degraded|warning|partial/.test(s)) return "DEGRADED";
  if (/offline|down|error|failed/.test(s)) return "OFFLINE";
  return "UNKNOWN";
}

function fmtTs(ts) {
  if (!ts) return "—";
  const d = new Date(typeof ts === "number"
    ? ts * (String(ts).length < 13 ? 1000 : 1)
    : ts);
  return isNaN(d.getTime()) ? String(ts) : d.toLocaleString();
}

function relTs(ts) {
  if (!ts) return "";
  const ms = typeof ts === "number"
    ? ts * (String(ts).length < 13 ? 1000 : 1)
    : new Date(ts).getTime();
  const diff = Date.now() - ms;
  if (diff < 0) return "now";
  if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
}

function nodeId(node) {
  return node?.id ?? node?.name ?? node?.host ?? JSON.stringify(node).slice(0, 16);
}

function NodeRow({ node, expanded, onToggle }) {
  const color = statusColor(node?.status);
  const tier = statusTier(node?.status);

  return (
    <div style={{
      borderBottom: "1px solid rgba(255,255,255,0.05)",
      borderLeft: `3px solid ${color}`,
      marginBottom: 2,
      background: expanded ? "rgba(255,255,255,0.025)" : "transparent",
      transition: "background 0.15s",
    }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", textAlign: "left", background: "none", border: "none",
          cursor: "pointer", padding: "8px 12px",
          display: "grid",
          gridTemplateColumns: "70px 1fr auto auto auto",
          gap: 10, alignItems: "center", color: C.textB,
        }}
      >
        {/* Status badge */}
        <span style={{
          fontSize: 8, color, letterSpacing: 1, fontWeight: 700,
          padding: "2px 5px", borderRadius: 3,
          background: color + "1a", border: `1px solid ${color}44`,
          textAlign: "center",
        }}>
          {tier}
        </span>

        {/* Name + host */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{
              fontFamily: "monospace", fontSize: 12, color, fontWeight: 700,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220,
            }}>
              {node?.name || node?.id || "(unnamed)"}
            </span>
            {node?.host && node.host !== node?.name && (
              <span style={{ fontSize: 10, color: C.text, whiteSpace: "nowrap" }}>
                {node.host}
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: C.text, marginTop: 2 }}>
            {node?.version && (
              <span style={{ color: "#94A3B8", marginRight: 8 }}>v{node.version}</span>
            )}
            {node?.region && (
              <span style={{ color: ACCENT, marginRight: 8 }}>{node.region}</span>
            )}
            {node?.role && (
              <span style={{ color: "#64748B" }}>{node.role}</span>
            )}
          </div>
        </div>

        {/* Last seen relative */}
        <span style={{ fontSize: 9, color: "#475569", whiteSpace: "nowrap" }}>
          {relTs(node?.last_seen || node?.lastSeen || node?.updated_at)}
        </span>

        {/* Absolute ts */}
        <span style={{ fontSize: 9, color: "#334155", whiteSpace: "nowrap" }}>
          {fmtTs(node?.last_seen || node?.lastSeen || node?.updated_at)}
        </span>

        {/* Expand toggle */}
        <span style={{ fontSize: 9, color: expanded ? ACCENT : "#475569", minWidth: 10 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: "4px 12px 10px 30px" }}>
          <pre style={{
            margin: 0, padding: "8px 10px", fontSize: 10, lineHeight: 1.6,
            background: "rgba(0,0,0,0.35)", borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.07)",
            color: C.textB, overflowX: "auto", whiteSpace: "pre-wrap",
            wordBreak: "break-all", maxHeight: 220, overflowY: "auto",
          }}>
            {JSON.stringify(node, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function ApolloFleet() {
  const [nodes, setNodes] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [expanded, setExpanded] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const async_ = useAsync();

  const load = useCallback(async () => {
    const body = await async_.run(() => apiGet("/v1/jarvis/apollo/fleet"));
    if (body) {
      setNodes(asList(body, "nodes", "fleet", "targets", "deployments"));
      setUpdatedAt(new Date());
    }
  }, [async_]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const counts = useMemo(() => ({
    total:    nodes.length,
    online:   nodes.filter((n) => statusTier(n?.status) === "ONLINE").length,
    degraded: nodes.filter((n) => statusTier(n?.status) === "DEGRADED").length,
    offline:  nodes.filter((n) => statusTier(n?.status) === "OFFLINE").length,
  }), [nodes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return nodes.filter((n) => {
      if (statusFilter !== "ALL" && statusTier(n?.status) !== statusFilter) return false;
      if (q) {
        const blob = `${n?.name} ${n?.id} ${n?.host} ${n?.status} ${n?.region} ${n?.role} ${n?.version}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [nodes, query, statusFilter]);

  const toggle = (id) => setExpanded((p) => (p === id ? null : id));

  const selectStyle = {
    background: "rgba(0,0,0,0.4)", border: `1px solid ${ACCENT}33`, borderRadius: 4,
    padding: "5px 8px", color: C.textB, fontFamily: "monospace", fontSize: 11, cursor: "pointer",
  };

  return (
    <PageShell
      title="APOLLO FLEET"
      subtitle={`DEPLOY TARGET STATUS · /v1/jarvis/apollo/fleet · ${POLL_MS / 1000}s POLL`}
      accent={ACCENT}
      actions={
        <div style={{ display: "flex", gap: 6 }}>
          <Badge color={STATUS_COLOR.online}>{counts.online} ONLINE</Badge>
          {counts.degraded > 0 && (
            <Badge color={STATUS_COLOR.degraded}>{counts.degraded} DEGRADED</Badge>
          )}
          {counts.offline > 0 && (
            <Badge color={STATUS_COLOR.offline}>{counts.offline} OFFLINE</Badge>
          )}
        </div>
      }
    >
      {/* Stat tiles */}
      <Grid min={140} gap={10} style={{ marginBottom: 16 }}>
        <StatTile label="TOTAL NODES" value={counts.total} accent={ACCENT} />
        <StatTile label="ONLINE" value={counts.online} accent={STATUS_COLOR.online} />
        <StatTile label="DEGRADED" value={counts.degraded} accent={STATUS_COLOR.degraded} />
        <StatTile label="OFFLINE" value={counts.offline} accent={STATUS_COLOR.offline} />
      </Grid>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="search"
          placeholder="Search name, host, region, role…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1, minWidth: 180, maxWidth: 360,
            background: "rgba(0,0,0,0.4)", border: `1px solid ${ACCENT}33`,
            borderRadius: 4, padding: "6px 10px", color: C.textB,
            fontFamily: "monospace", fontSize: 12, outline: "none",
          }}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="ALL">All status</option>
          <option value="ONLINE">ONLINE</option>
          <option value="DEGRADED">DEGRADED</option>
          <option value="OFFLINE">OFFLINE</option>
          <option value="UNKNOWN">UNKNOWN</option>
        </select>
        <button
          onClick={load}
          style={{
            background: "none", border: `1px solid ${ACCENT}44`, borderRadius: 4,
            color: ACCENT, padding: "5px 10px", cursor: "pointer", fontSize: 10,
            letterSpacing: 1, fontFamily: "monospace",
          }}
        >
          ↺
        </button>
        {updatedAt && (
          <span style={{ fontSize: 9, color: "#475569" }}>
            {updatedAt.toLocaleTimeString()}
          </span>
        )}
        {(query || statusFilter !== "ALL") && (
          <span style={{ fontSize: 10, color: C.text }}>
            {filtered.length} / {nodes.length}
          </span>
        )}
      </div>

      <PanelCard
        title="FLEET NODES"
        accent={ACCENT}
        right={<Badge color={ACCENT}>{filtered.length} nodes</Badge>}
      >
        <DataState
          loading={async_.loading}
          error={async_.error}
          empty={!async_.loading && !async_.error && filtered.length === 0}
          emptyLabel="No fleet nodes found"
        >
          <div style={{ maxHeight: "calc(100vh - 340px)", overflowY: "auto" }}>
            {filtered.map((node) => {
              const id = nodeId(node);
              return (
                <NodeRow
                  key={id}
                  node={node}
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
