/**
 * WorldEndpoints — browsable table of world endpoints.
 * Endpoint: GET /v1/jarvis/world/endpoints?limit=100
 * Features: type filter, status badges, copy-URL action, 60s poll.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, Badge, DataState, StatTile, Grid } from "@/components/PageKit";
import { apiGet, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.blue || "#29E7FF";
const POLL_MS = 60000;

const TYPE_COLORS = {
  rest:      C.blue   || "#29E7FF",
  http:      C.blue   || "#29E7FF",
  https:     C.neon   || "#00c878",
  websocket: C.gold   || "#e8a800",
  ws:        C.gold   || "#e8a800",
  wss:       C.gold   || "#e8a800",
  grpc:      "#b18cff",
  internal:  "#94A3B8",
  external:  C.neon   || "#00c878",
};

function typeColor(type) {
  return TYPE_COLORS[(type || "").toLowerCase()] || "#94A3B8";
}

function statusColor(status) {
  const s = (status || "").toLowerCase();
  if (/active|up|online|healthy|ok/.test(s)) return C.neon || "#00c878";
  if (/degraded|slow|partial/.test(s)) return C.gold || "#e8a800";
  if (/down|error|inactive|offline|fail/.test(s)) return C.red || "#e8203c";
  return "#475569";
}

function endpointUrl(ep) {
  return ep?.url || ep?.endpoint || ep?.address || ep?.host || "";
}

function endpointType(ep) {
  const raw = ep?.type || ep?.kind || ep?.protocol || "";
  return raw.toUpperCase() || "—";
}

function endpointName(ep) {
  return ep?.name || ep?.id || ep?.label || endpointUrl(ep).slice(0, 40) || "(unnamed)";
}

function endpointStatus(ep) {
  return ep?.status || ep?.state || ep?.health || "unknown";
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const onClick = () => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };
  return (
    <button
      onClick={onClick}
      title={text ? `Copy: ${text}` : "Nothing to copy"}
      style={{
        background: "none", border: `1px solid ${copied ? C.neon : ACCENT}44`,
        borderRadius: 3, padding: "2px 7px", cursor: "pointer",
        color: copied ? C.neon : ACCENT, fontSize: 9, letterSpacing: 1,
        fontFamily: "monospace", transition: "color 0.2s, border-color 0.2s",
        flexShrink: 0,
      }}
    >
      {copied ? "✓ COPIED" : "COPY"}
    </button>
  );
}

function EndpointRow({ ep, expanded, onToggle }) {
  const url = endpointUrl(ep);
  const type = endpointType(ep);
  const name = endpointName(ep);
  const status = endpointStatus(ep);
  const sc = statusColor(status);
  const tc = typeColor(ep?.type || ep?.kind || ep?.protocol || "");

  return (
    <div style={{
      borderBottom: "1px solid rgba(255,255,255,0.05)",
      borderLeft: `3px solid ${tc}`,
      marginBottom: 2,
      background: expanded ? "rgba(255,255,255,0.025)" : "transparent",
      transition: "background 0.15s",
    }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "60px 1fr auto auto auto auto",
          gap: 8, alignItems: "center",
          padding: "8px 12px", cursor: "pointer",
          color: C.textB,
        }}
      >
        {/* Type badge */}
        <span
          style={{
            fontSize: 8, color: tc, letterSpacing: 1, fontWeight: 700,
            padding: "2px 5px", borderRadius: 3, textAlign: "center",
            background: tc + "1a", border: `1px solid ${tc}44`,
          }}
        >
          {type.slice(0, 7)}
        </span>

        {/* Name + URL */}
        <button
          onClick={onToggle}
          style={{
            background: "none", border: "none", textAlign: "left",
            cursor: "pointer", minWidth: 0, padding: 0,
          }}
        >
          <div style={{
            fontFamily: "monospace", fontSize: 12, color: ACCENT,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {name}
          </div>
          {url && url !== name && (
            <div style={{
              fontSize: 10, color: "#475569", marginTop: 2,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {url}
            </div>
          )}
        </button>

        {/* Status badge */}
        <span style={{
          fontSize: 9, color: sc, letterSpacing: 1, fontWeight: 700,
          padding: "2px 6px", borderRadius: 3,
          background: sc + "1a", border: `1px solid ${sc}44`,
          whiteSpace: "nowrap",
        }}>
          {(status || "UNKNOWN").toUpperCase().slice(0, 10)}
        </span>

        {/* Copy URL */}
        <CopyBtn text={url} />

        {/* Expand toggle */}
        <span
          onClick={onToggle}
          style={{ fontSize: 9, color: expanded ? ACCENT : "#475569", cursor: "pointer", minWidth: 10 }}
        >
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: "4px 12px 10px 30px" }}>
          <pre style={{
            margin: 0, padding: "8px 10px", fontSize: 10, lineHeight: 1.6,
            background: "rgba(0,0,0,0.35)", borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.07)",
            color: C.textB, overflowX: "auto", whiteSpace: "pre-wrap",
            wordBreak: "break-all", maxHeight: 200, overflowY: "auto",
          }}>
            {JSON.stringify(ep, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function WorldEndpoints() {
  const [endpoints, setEndpoints] = useState([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [expanded, setExpanded] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const async_ = useAsync();

  const load = useCallback(async () => {
    const body = await async_.run(() => apiGet("/v1/jarvis/world/endpoints?limit=100"));
    if (body) {
      setEndpoints(asList(body, "endpoints", "items", "results", "data", "world_endpoints"));
      setUpdatedAt(new Date());
    }
  }, [async_]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const allTypes = useMemo(() => {
    const seen = new Set();
    endpoints.forEach((ep) => {
      const t = (ep?.type || ep?.kind || ep?.protocol || "").toUpperCase();
      if (t) seen.add(t);
    });
    return ["ALL", ...Array.from(seen).sort()];
  }, [endpoints]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return endpoints.filter((ep) => {
      const type = (ep?.type || ep?.kind || ep?.protocol || "").toUpperCase();
      if (typeFilter !== "ALL" && type !== typeFilter) return false;
      if (q) {
        const blob = `${endpointName(ep)} ${endpointUrl(ep)} ${type} ${endpointStatus(ep)}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [endpoints, query, typeFilter]);

  const counts = useMemo(() => {
    const active = endpoints.filter((ep) => {
      const s = (endpointStatus(ep) || "").toLowerCase();
      return /active|up|online|healthy|ok/.test(s);
    }).length;
    return { total: endpoints.length, active, other: endpoints.length - active };
  }, [endpoints]);

  const toggle = (idx) => setExpanded((p) => (p === idx ? null : idx));

  const selectStyle = {
    background: "rgba(0,0,0,0.4)", border: `1px solid ${ACCENT}33`, borderRadius: 4,
    padding: "5px 8px", color: C.textB, fontFamily: "monospace", fontSize: 11, cursor: "pointer",
  };

  return (
    <PageShell
      title="WORLD ENDPOINTS"
      subtitle={`ENDPOINT CATALOGUE · /v1/jarvis/world/endpoints · ${POLL_MS / 1000}s POLL`}
      accent={ACCENT}
      actions={
        <div style={{ display: "flex", gap: 6 }}>
          <Badge color={ACCENT}>{counts.total} TOTAL</Badge>
          {counts.active > 0 && (
            <Badge color={C.neon || "#00c878"}>{counts.active} ACTIVE</Badge>
          )}
        </div>
      }
    >
      <Grid min={140} gap={10} style={{ marginBottom: 16 }}>
        <StatTile label="TOTAL" value={counts.total} accent={ACCENT} />
        <StatTile label="ACTIVE" value={counts.active} accent={C.neon || "#00c878"} />
        <StatTile label="OTHER" value={counts.other} accent="#475569" />
        <StatTile label="TYPES" value={allTypes.length - 1} accent={C.gold || "#e8a800"} />
      </Grid>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="search"
          placeholder="Search name, URL, type, status…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1, minWidth: 180, maxWidth: 360,
            background: "rgba(0,0,0,0.4)", border: `1px solid ${ACCENT}33`,
            borderRadius: 4, padding: "6px 10px", color: C.textB,
            fontFamily: "monospace", fontSize: 12, outline: "none",
          }}
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selectStyle}>
          {allTypes.map((t) => <option key={t} value={t}>{t === "ALL" ? "All types" : t}</option>)}
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
        {(query || typeFilter !== "ALL") && (
          <span style={{ fontSize: 10, color: C.text }}>{filtered.length} / {counts.total}</span>
        )}
      </div>

      <PanelCard
        title="ENDPOINTS"
        accent={ACCENT}
        right={<Badge color={ACCENT}>{filtered.length} endpoints</Badge>}
      >
        <DataState
          loading={async_.loading}
          error={async_.error}
          empty={!async_.loading && !async_.error && filtered.length === 0}
          emptyLabel="No world endpoints found"
        >
          <div style={{ maxHeight: "calc(100vh - 340px)", overflowY: "auto" }}>
            {filtered.map((ep, i) => (
              <EndpointRow
                key={i}
                ep={ep}
                expanded={expanded === i}
                onToggle={() => toggle(i)}
              />
            ))}
          </div>
        </DataState>
      </PanelCard>
    </PageShell>
  );
}
