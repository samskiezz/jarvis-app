/**
 * AIModelCatalogue — dedicated full-page browser of every AI model registered
 * in the JARVIS AIP plane.
 * Endpoint: GET /v1/jarvis/ai/models
 *   → { models: [{ name, risk, cost, capabilities, context_window, description, ... }] }
 * Features: text search, risk filter, stat tiles, cost bars, capability chips,
 *   context-window display, expandable raw detail, 5-min poll.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, Badge, DataState, StatTile, Grid } from "@/components/PageKit";
import { apiGet, asList, useAsync } from "@/lib/wave1";

const ACCENT   = "#f59e0b"; // amber — AIP model tier
const POLL_MS  = 300_000;   // 5 min; models rarely change

const RISK_COLOR = {
  LOW:    C.green  || "#4ADE80",
  MEDIUM: C.gold   || "#FCD34D",
  HIGH:   C.red    || "#EF4444",
};
const RISK_ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function riskTier(r) {
  const k = String(r || "").toUpperCase();
  return RISK_ORDER[k] !== undefined ? k : "UNKNOWN";
}
function riskColor(r) {
  return RISK_COLOR[riskTier(r)] || "#475569";
}

function fmtCtx(v) {
  if (v == null) return null;
  const n = typeof v === "string" ? parseInt(v, 10) : v;
  if (isNaN(n)) return String(v);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function CostBar({ cost }) {
  // cost is expected 0–1 float or 0–100 integer; normalise to 0–1
  const pct = typeof cost === "number"
    ? Math.min(1, cost > 1 ? cost / 100 : cost)
    : 0;
  const color = pct < 0.33 ? (C.green || "#4ADE80") : pct < 0.66 ? (C.gold || "#FCD34D") : (C.red || "#EF4444");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 80 }}>
      <div style={{
        flex: 1, height: 5, background: "rgba(255,255,255,0.08)",
        borderRadius: 3, overflow: "hidden",
      }}>
        <div style={{
          width: `${pct * 100}%`, height: "100%",
          background: color, borderRadius: 3,
          transition: "width 0.4s ease",
        }} />
      </div>
      <span style={{ fontSize: 9, color: "#64748B", fontFamily: "monospace", minWidth: 26 }}>
        {pct > 0 ? `${Math.round(pct * 100)}%` : "—"}
      </span>
    </div>
  );
}

function CapChips({ caps }) {
  const list = Array.isArray(caps) ? caps : typeof caps === "string" ? [caps] : [];
  if (!list.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
      {list.map((c) => (
        <span key={c} style={{
          fontSize: 9, padding: "2px 6px", borderRadius: 3,
          background: `${ACCENT}22`, color: ACCENT,
          fontFamily: "monospace", letterSpacing: 0.5,
        }}>
          {String(c).toUpperCase()}
        </span>
      ))}
    </div>
  );
}

function modelKey(m) {
  return m?.name || m?.id || JSON.stringify(m);
}

/* ─── Row ────────────────────────────────────────────────────────────────── */
function ModelRow({ model, expanded, onToggle }) {
  const tier  = riskTier(model.risk);
  const color = riskColor(model.risk);
  const ctx   = fmtCtx(model.context_window);
  const caps  = model.capabilities || model.caps || [];
  const cost  = model.cost ?? model.cost_score ?? model.cost_relative ?? null;
  const hasDetail = model.description || model.version || cost != null || Object.keys(model).length > 3;

  return (
    <>
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          cursor: hasDetail ? "pointer" : "default",
          background: expanded ? `${ACCENT}0d` : "transparent",
          transition: "background 0.15s",
        }}
        onClick={hasDetail ? onToggle : undefined}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Risk dot */}
          <span style={{
            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
            background: color, boxShadow: `0 0 6px ${color}99`,
          }} />

          {/* Name */}
          <span style={{
            color: C.textB, fontFamily: "monospace", fontSize: 13,
            flex: "1 1 180px", wordBreak: "break-all",
          }}>
            {model.name || model.id || "—"}
          </span>

          {/* Context window */}
          {ctx && (
            <span style={{ color: ACCENT, fontFamily: "monospace", fontSize: 10, flexShrink: 0 }}>
              {ctx} ctx
            </span>
          )}

          {/* Cost bar */}
          {cost != null && (
            <div style={{ flexShrink: 0, width: 100 }}>
              <CostBar cost={cost} />
            </div>
          )}

          {/* Risk badge */}
          <Badge color={color}>{tier}</Badge>

          {/* Expand */}
          {hasDetail && (
            <span style={{ color: "#475569", fontSize: 10, marginLeft: "auto", flexShrink: 0 }}>
              {expanded ? "▲" : "▼"}
            </span>
          )}
        </div>

        {/* Capability chips (always visible) */}
        {caps.length > 0 && <CapChips caps={caps} />}
      </div>

      {expanded && (
        <div style={{
          padding: "8px 14px 12px 32px",
          background: `${ACCENT}08`,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          fontFamily: "monospace", fontSize: 11,
        }}>
          {model.description && (
            <div style={{ color: "#94A3B8", marginBottom: 6, lineHeight: 1.5 }}>
              {model.description}
            </div>
          )}
          {model.version && (
            <div style={{ color: "#64748B", marginBottom: 4 }}>
              version: <span style={{ color: C.textB }}>{model.version}</span>
            </div>
          )}
          <div style={{
            marginTop: 6, background: "rgba(0,0,0,0.3)", borderRadius: 4,
            padding: "6px 8px", maxHeight: 160, overflowY: "auto",
            border: `1px solid ${ACCENT}22`,
          }}>
            <pre style={{ margin: 0, color: "#64748B", fontSize: 10, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(model, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */
export default function AIModelCatalogue() {
  const [models, setModels]   = useState([]);
  const [query, setQuery]     = useState("");
  const [riskFlt, setRiskFlt] = useState("ALL");
  const [expanded, setExpanded] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const async_ = useAsync();

  const load = useCallback(() => {
    async_.run(async () => {
      const data = await apiGet("/v1/jarvis/ai/models");
      const list = asList(data, "models", "data");
      setModels(list);
      setUpdatedAt(new Date());
    });
  }, [async_]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const counts = useMemo(() => ({
    total:  models.length,
    low:    models.filter((m) => riskTier(m.risk) === "LOW").length,
    medium: models.filter((m) => riskTier(m.risk) === "MEDIUM").length,
    high:   models.filter((m) => riskTier(m.risk) === "HIGH").length,
  }), [models]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((m) => {
      if (riskFlt !== "ALL" && riskTier(m.risk) !== riskFlt) return false;
      if (q) {
        const blob = [m.name, m.id, m.description, m.version, m.risk,
          ...(m.capabilities || [])].join(" ").toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [models, query, riskFlt]);

  const toggle = (key) => setExpanded((p) => (p === key ? null : key));

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
      title="AI MODEL CATALOGUE"
      subtitle={`AIP · /v1/jarvis/ai/models · ${POLL_MS / 60_000}min POLL`}
      accent={ACCENT}
      actions={
        <div style={{ display: "flex", gap: 6 }}>
          <Badge color={RISKC("LOW")}>{counts.low} LOW</Badge>
          {counts.medium > 0 && <Badge color={RISKC("MEDIUM")}>{counts.medium} MED</Badge>}
          {counts.high   > 0 && <Badge color={RISKC("HIGH")}>{counts.high} HIGH</Badge>}
        </div>
      }
    >
      <Grid min={140} gap={10} style={{ marginBottom: 16 }}>
        <StatTile label="TOTAL MODELS" value={counts.total}  accent={ACCENT} />
        <StatTile label="LOW RISK"     value={counts.low}    accent={RISKC("LOW")} />
        <StatTile label="MEDIUM RISK"  value={counts.medium} accent={RISKC("MEDIUM")} />
        <StatTile label="HIGH RISK"    value={counts.high}   accent={RISKC("HIGH")} />
      </Grid>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="search"
          placeholder="Search name, capability, description…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={inputStyle}
        />
        <select value={riskFlt} onChange={(e) => setRiskFlt(e.target.value)} style={selStyle}>
          <option value="ALL">All risk</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
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
        {(query || riskFlt !== "ALL") && (
          <span style={{ fontSize: 10, color: C.text }}>
            {filtered.length} / {models.length}
          </span>
        )}
      </div>

      <PanelCard
        title="REGISTERED MODELS"
        accent={ACCENT}
        right={<Badge color={ACCENT}>{filtered.length} models</Badge>}
      >
        <DataState
          loading={async_.loading}
          error={async_.error}
          empty={!async_.loading && !async_.error && filtered.length === 0}
          emptyLabel="No models registered"
        >
          <div style={{ maxHeight: "calc(100vh - 340px)", overflowY: "auto" }}>
            {filtered.map((m) => {
              const key = modelKey(m);
              return (
                <ModelRow
                  key={key}
                  model={m}
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

// Hoisted helper used in JSX above — must be defined before first call-site.
function RISKC(tier) { return RISK_COLOR[tier] || "#475569"; }
