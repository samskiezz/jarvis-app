/**
 * AuditTimeline — chronological timeline of agent audit events.
 * Endpoint: GET /v1/jarvis/audit?limit=200 → { items: [{id,ts,actor,action,resource,detail,hash}] }
 * Features: severity colour-coding, actor filter, text search, expandable detail.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, Badge, DataState } from "@/components/PageKit";
import { apiGet, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.gold || "#F59E0B";
const POLL_MS = 30000;

function severity(action) {
  const a = (action || "").toLowerCase();
  if (/delete|purge|error|fail|deny|unauthori|forbidden|breach/.test(a)) return "HIGH";
  if (/create|write|patch|update|rotate|lock|execute|run|approve/.test(a)) return "MED";
  return "LOW";
}

const SEV_COLOR = { HIGH: C.red || "#EF4444", MED: C.gold || "#F59E0B", LOW: C.blue || "#29E7FF" };

function fmtTs(ts) {
  if (ts == null) return "—";
  const d = new Date(Number(ts) * (String(ts).length < 13 ? 1000 : 1));
  return isNaN(d.getTime()) ? String(ts) : d.toLocaleString();
}

function relTs(ts) {
  if (ts == null) return "";
  const ms = Number(ts) * (String(ts).length < 13 ? 1000 : 1);
  const diff = Date.now() - ms;
  if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
}

function parseDetail(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch { return { raw }; }
}

function EventRow({ entry, expanded, onToggle }) {
  const sev = severity(entry?.action);
  const sevColor = SEV_COLOR[sev];
  const detail = parseDetail(entry?.detail);

  return (
    <div
      style={{
        borderBottom: `1px solid rgba(255,255,255,0.05)`,
        borderLeft: `3px solid ${sevColor}`,
        marginBottom: 2,
        background: expanded ? "rgba(255,255,255,0.025)" : "transparent",
        transition: "background 0.15s",
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: "100%", textAlign: "left", background: "none", border: "none",
          cursor: "pointer", padding: "8px 12px",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto auto",
          gap: 10, alignItems: "center", color: C.textB,
        }}
      >
        <span style={{ fontSize: 9, color: sevColor, letterSpacing: 1, fontWeight: 700, minWidth: 28 }}>
          {sev}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "monospace", fontSize: 12, color: sevColor, fontWeight: 700 }}>
              {entry?.action || "(unknown)"}
            </span>
            {entry?.resource && (
              <span style={{ fontSize: 10, color: C.text, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
                → {entry.resource}
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: C.text, marginTop: 2 }}>
            <span style={{ color: ACCENT }}>{entry?.actor || "—"}</span>
            {entry?.ts && (
              <span style={{ marginLeft: 8, color: "#64748B" }}>{fmtTs(entry.ts)}</span>
            )}
          </div>
        </div>
        <span style={{ fontSize: 9, color: "#475569", whiteSpace: "nowrap" }}>
          {relTs(entry?.ts)}
        </span>
        <span style={{ fontSize: 9, color: expanded ? ACCENT : "#475569" }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: "4px 12px 10px 28px" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <Badge color="#475569">id: {entry?.id}</Badge>
            {entry?.hash && (
              <Badge color="#334155">
                #{String(entry.hash).slice(0, 12)}…
              </Badge>
            )}
          </div>
          {detail && (
            <pre style={{
              margin: 0, padding: "8px 10px", fontSize: 10, lineHeight: 1.6,
              background: "rgba(0,0,0,0.35)", borderRadius: 4,
              border: `1px solid rgba(255,255,255,0.07)`,
              color: C.textB, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
              maxHeight: 200, overflowY: "auto",
            }}>
              {JSON.stringify(detail, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default function AuditTimeline() {
  const [entries, setEntries] = useState([]);
  const [query, setQuery] = useState("");
  const [actorFilter, setActorFilter] = useState("ALL");
  const [sevFilter, setSevFilter] = useState("ALL");
  const [expanded, setExpanded] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const async_ = useAsync();

  const load = useCallback(async () => {
    const body = await async_.run(() => apiGet("/v1/jarvis/audit?limit=200"));
    if (body) {
      setEntries(asList(body, "entries", "items"));
      setUpdatedAt(new Date());
    }
  }, [async_]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const actors = useMemo(() => {
    const set = new Set(entries.map((e) => e?.actor).filter(Boolean));
    return ["ALL", ...Array.from(set).sort()];
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (actorFilter !== "ALL" && e?.actor !== actorFilter) return false;
      if (sevFilter !== "ALL" && severity(e?.action) !== sevFilter) return false;
      if (q) {
        const blob = `${e?.action} ${e?.actor} ${e?.resource} ${e?.detail}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [entries, query, actorFilter, sevFilter]);

  const counts = useMemo(() => ({
    HIGH: entries.filter((e) => severity(e?.action) === "HIGH").length,
    MED: entries.filter((e) => severity(e?.action) === "MED").length,
    LOW: entries.filter((e) => severity(e?.action) === "LOW").length,
  }), [entries]);

  const toggle = (id) => setExpanded((p) => (p === id ? null : id));

  const selectStyle = {
    background: "rgba(0,0,0,0.4)", border: `1px solid ${ACCENT}33`, borderRadius: 4,
    padding: "5px 8px", color: C.textB, fontFamily: "monospace", fontSize: 11, cursor: "pointer",
  };

  return (
    <PageShell
      title="AUDIT TIMELINE"
      subtitle={`AGENT EVENTS · /v1/jarvis/audit · ${POLL_MS / 1000}s POLL`}
      accent={ACCENT}
      actions={
        <div style={{ display: "flex", gap: 6 }}>
          <Badge color={SEV_COLOR.HIGH}>{counts.HIGH} HIGH</Badge>
          <Badge color={SEV_COLOR.MED}>{counts.MED} MED</Badge>
          <Badge color={SEV_COLOR.LOW}>{counts.LOW} LOW</Badge>
        </div>
      }
    >
      {/* Filter bar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="search"
          placeholder="Search action, actor, resource…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1, minWidth: 180, maxWidth: 360,
            background: "rgba(0,0,0,0.4)", border: `1px solid ${ACCENT}33`,
            borderRadius: 4, padding: "6px 10px", color: C.textB,
            fontFamily: "monospace", fontSize: 12, outline: "none",
          }}
        />
        <select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} style={selectStyle}>
          {actors.map((a) => <option key={a} value={a}>{a === "ALL" ? "All actors" : a}</option>)}
        </select>
        <select value={sevFilter} onChange={(e) => setSevFilter(e.target.value)} style={selectStyle}>
          <option value="ALL">All severity</option>
          <option value="HIGH">HIGH</option>
          <option value="MED">MED</option>
          <option value="LOW">LOW</option>
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
        {(query || actorFilter !== "ALL" || sevFilter !== "ALL") && (
          <span style={{ fontSize: 10, color: C.text }}>
            {filtered.length} / {entries.length}
          </span>
        )}
      </div>

      <PanelCard
        title="AUDIT EVENTS"
        accent={ACCENT}
        right={<Badge color={ACCENT}>{filtered.length} events</Badge>}
      >
        <DataState
          loading={async_.loading}
          error={async_.error}
          empty={!async_.loading && !async_.error && filtered.length === 0}
        >
          <div style={{ maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
            {filtered.map((entry) => (
              <EventRow
                key={entry?.id ?? entry?.hash}
                entry={entry}
                expanded={expanded === (entry?.id ?? entry?.hash)}
                onToggle={() => toggle(entry?.id ?? entry?.hash)}
              />
            ))}
          </div>
        </DataState>
      </PanelCard>
    </PageShell>
  );
}
