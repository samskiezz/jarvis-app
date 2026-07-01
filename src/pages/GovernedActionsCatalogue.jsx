/**
 * GovernedActionsCatalogue — full-page browser of all governed actions.
 * Endpoint: GET /v1/jarvis/actions → { actions: [{id,name,tier,risk,description,category,...}] }
 * Features: risk heat-map header, tier + risk + text filter, stat tiles, expandable detail.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { apiGet, asList, useAsync } from "@/lib/wave1";

const ACCENT = "#a78bfa";
const POLL_MS = 300000; // 5 min — catalogue changes rarely

const RISK_META = {
  LOW:    { color: "#22c55e", label: "LOW" },
  MEDIUM: { color: "#f59e0b", label: "MED" },
  HIGH:   { color: "#ef4444", label: "HIGH" },
};

const TIER_COLORS = ["#64748b", "#3b82f6", "#a78bfa", "#f59e0b", "#ef4444"];

function riskColor(r) {
  return RISK_META[String(r || "").toUpperCase()]?.color || "#64748b";
}

function tierColor(t) {
  const n = parseInt(t, 10);
  return isNaN(n) ? "#64748b" : TIER_COLORS[Math.min(n, TIER_COLORS.length - 1)];
}

function normaliseRisk(r) {
  const s = String(r || "").toUpperCase();
  if (s === "MED" || s === "MEDIUM") return "MEDIUM";
  if (s === "HIGH") return "HIGH";
  if (s === "LOW") return "LOW";
  return "UNKNOWN";
}

function RiskBar({ risk }) {
  const levels = ["LOW", "MEDIUM", "HIGH"];
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
      {levels.map((l) => {
        const active = normaliseRisk(risk) === l;
        return (
          <span
            key={l}
            style={{
              width: 20, height: 6, borderRadius: 2,
              background: active ? riskColor(l) : "rgba(255,255,255,0.08)",
              boxShadow: active ? `0 0 6px ${riskColor(l)}88` : "none",
              transition: "background 0.15s",
            }}
          />
        );
      })}
    </div>
  );
}

function ActionRow({ action, expanded, onToggle }) {
  const risk = normaliseRisk(action?.risk);
  const rc = riskColor(risk);
  const tier = action?.tier ?? action?.permission_tier ?? "?";
  const tc = tierColor(tier);

  return (
    <div
      style={{
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        borderLeft: `3px solid ${rc}`,
        marginBottom: 2,
        background: expanded ? "rgba(255,255,255,0.025)" : "transparent",
        transition: "background 0.15s",
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: "100%", textAlign: "left", background: "none", border: "none",
          cursor: "pointer", padding: "9px 12px",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto auto auto",
          gap: 10, alignItems: "center", color: C.textB,
        }}
      >
        {/* Tier badge */}
        <span
          style={{
            minWidth: 22, height: 22, borderRadius: 4,
            background: `${tc}22`, border: `1px solid ${tc}44`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 700, color: tc, fontFamily: "monospace",
          }}
        >
          T{tier}
        </span>

        {/* Name + description */}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "monospace", fontSize: 12, color: ACCENT, fontWeight: 700,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {action?.name || action?.id || "(unnamed)"}
          </div>
          {action?.description && (
            <div style={{ fontSize: 10, color: C.text, marginTop: 2,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {action.description}
            </div>
          )}
        </div>

        {/* Category */}
        {action?.category && (
          <Badge color="#475569" style={{ whiteSpace: "nowrap" }}>
            {action.category}
          </Badge>
        )}

        {/* Risk bar */}
        <RiskBar risk={risk} />

        {/* Expand toggle */}
        <span style={{ fontSize: 9, color: expanded ? ACCENT : "#475569" }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: "4px 12px 12px 44px" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            {action?.id && <Badge color="#334155">id: {action.id}</Badge>}
            <Badge color={rc}>risk: {risk}</Badge>
            <Badge color={tc}>tier: {tier}</Badge>
            {action?.reversible != null && (
              <Badge color={action.reversible ? "#22c55e" : "#ef4444"}>
                {action.reversible ? "reversible" : "irreversible"}
              </Badge>
            )}
            {action?.requires_approval != null && (
              <Badge color={action.requires_approval ? "#f59e0b" : "#475569"}>
                {action.requires_approval ? "approval required" : "auto-approved"}
              </Badge>
            )}
          </div>
          {action?.params && Object.keys(action.params).length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: "#475569", letterSpacing: 1, marginBottom: 4 }}>
                PARAMETERS
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.keys(action.params).map((k) => (
                  <Badge key={k} color="#334155">{k}</Badge>
                ))}
              </div>
            </div>
          )}
          <pre style={{
            margin: 0, padding: "8px 10px", fontSize: 10, lineHeight: 1.6,
            background: "rgba(0,0,0,0.35)", borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.07)",
            color: C.textB, overflowX: "auto", whiteSpace: "pre-wrap",
            wordBreak: "break-all", maxHeight: 200, overflowY: "auto",
          }}>
            {JSON.stringify(action, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function GovernedActionsCatalogue() {
  const [actions, setActions] = useState([]);
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState("ALL");
  const [riskFilter, setRiskFilter] = useState("ALL");
  const [expanded, setExpanded] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const async_ = useAsync();

  const load = useCallback(async () => {
    const body = await async_.run(() => apiGet("/v1/jarvis/actions"));
    if (body) {
      setActions(asList(body, "actions"));
      setUpdatedAt(new Date());
    }
  }, [async_]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const tiers = useMemo(() => {
    const vals = new Set(
      actions.map((a) => String(a?.tier ?? a?.permission_tier ?? "")).filter(Boolean)
    );
    return ["ALL", ...Array.from(vals).sort()];
  }, [actions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return actions.filter((a) => {
      if (tierFilter !== "ALL") {
        const t = String(a?.tier ?? a?.permission_tier ?? "");
        if (t !== tierFilter) return false;
      }
      if (riskFilter !== "ALL" && normaliseRisk(a?.risk) !== riskFilter) return false;
      if (q) {
        const blob = `${a?.name} ${a?.description} ${a?.category} ${a?.id}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [actions, query, tierFilter, riskFilter]);

  const counts = useMemo(() => ({
    total: actions.length,
    low: actions.filter((a) => normaliseRisk(a?.risk) === "LOW").length,
    med: actions.filter((a) => normaliseRisk(a?.risk) === "MEDIUM").length,
    high: actions.filter((a) => normaliseRisk(a?.risk) === "HIGH").length,
  }), [actions]);

  const toggle = (id) => setExpanded((p) => (p === id ? null : id));

  const selectStyle = {
    background: "rgba(0,0,0,0.4)", border: `1px solid ${ACCENT}33`, borderRadius: 4,
    padding: "5px 8px", color: C.textB, fontFamily: "monospace", fontSize: 11, cursor: "pointer",
  };

  return (
    <PageShell
      title="GOVERNED ACTIONS"
      subtitle={`ACTIONS CATALOGUE · /v1/jarvis/actions · 5-MIN POLL`}
      accent={ACCENT}
      actions={
        <div style={{ display: "flex", gap: 6 }}>
          <Badge color={RISK_META.LOW.color}>{counts.low} LOW</Badge>
          <Badge color={RISK_META.MEDIUM.color}>{counts.med} MED</Badge>
          <Badge color={RISK_META.HIGH.color}>{counts.high} HIGH</Badge>
        </div>
      }
    >
      {/* Stat tiles */}
      <Grid cols={4} style={{ marginBottom: 18 }}>
        <StatTile label="TOTAL ACTIONS" value={counts.total} accent={ACCENT} />
        <StatTile label="LOW RISK" value={counts.low} accent={RISK_META.LOW.color} />
        <StatTile label="MEDIUM RISK" value={counts.med} accent={RISK_META.MEDIUM.color} />
        <StatTile label="HIGH RISK" value={counts.high} accent={RISK_META.HIGH.color} />
      </Grid>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="search"
          placeholder="Search name, description, category…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1, minWidth: 200, maxWidth: 380,
            background: "rgba(0,0,0,0.4)", border: `1px solid ${ACCENT}33`,
            borderRadius: 4, padding: "6px 10px", color: C.textB,
            fontFamily: "monospace", fontSize: 12, outline: "none",
          }}
        />
        <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} style={selectStyle}>
          {tiers.map((t) => (
            <option key={t} value={t}>{t === "ALL" ? "All tiers" : `Tier ${t}`}</option>
          ))}
        </select>
        <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} style={selectStyle}>
          <option value="ALL">All risk</option>
          <option value="LOW">LOW</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="HIGH">HIGH</option>
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
        {(query || tierFilter !== "ALL" || riskFilter !== "ALL") && (
          <span style={{ fontSize: 10, color: C.text }}>
            {filtered.length} / {actions.length}
          </span>
        )}
      </div>

      <PanelCard
        title="ACTION CATALOGUE"
        accent={ACCENT}
        right={<Badge color={ACCENT}>{filtered.length} actions</Badge>}
      >
        <DataState
          loading={async_.loading}
          error={async_.error}
          empty={!async_.loading && !async_.error && filtered.length === 0}
        >
          <div style={{ maxHeight: "calc(100vh - 340px)", overflowY: "auto" }}>
            {filtered.map((action) => {
              const key = action?.id ?? action?.name ?? JSON.stringify(action);
              return (
                <ActionRow
                  key={key}
                  action={action}
                  expanded={expanded === key}
                  onToggle={() => toggle(key)}
                />
              );
            })}
          </div>
        </DataState>
      </PanelCard>
    </PageShell>
  );
}
