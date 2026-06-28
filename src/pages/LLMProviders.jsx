/**
 * LLMProviders — live health dashboard for all configured LLM backends.
 * Endpoints:
 *   GET /v1/jarvis/research/status → { backend, available, connection, autopilot, hint }
 *   GET /v1/jarvis/system/status   → { aip: { llm_backend }, subsystems_up, ... }
 * Polls every 15 s.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, Badge, DataState } from "@/components/PageKit";
import { apiGet, useAsync } from "@/lib/wave1";

const ACCENT = "#29E7FF";
const POLL_MS = 15000;

const KNOWN_PROVIDERS = [
  { id: "ollama",           label: "Ollama (local)",      color: "#7cff7c" },
  { id: "openai-compatible",label: "OpenAI-compatible",   color: "#b18cff" },
  { id: "openai",           label: "OpenAI",              color: "#10A37F" },
  { id: "anthropic",        label: "Anthropic",           color: "#D4843E" },
  { id: "kimi",             label: "Kimi / Moonshot",     color: "#3B82F6" },
  { id: "gpu",              label: "GPU / vLLM",          color: "#F59E0B" },
  { id: "qwen32b",          label: "Qwen32B / vLLM",      color: "#EF4444" },
];

function providerLabel(id) {
  return KNOWN_PROVIDERS.find((p) => p.id === id)?.label || id || "Unknown";
}

function providerColor(id) {
  return KNOWN_PROVIDERS.find((p) => p.id === id)?.color || "#94A3B8";
}

function StatusDot({ ok }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8, height: 8, borderRadius: "50%",
        background: ok ? "#22c55e" : "#EF4444",
        boxShadow: ok ? "0 0 6px #22c55e" : "0 0 6px #EF4444",
        flexShrink: 0,
      }}
    />
  );
}

function ProviderCard({ id, isActive, configured, model, url, localOnly, source }) {
  const color = providerColor(id);
  const label = providerLabel(id);
  const isLocal = localOnly || id === "ollama" || id === "gpu" || id === "qwen32b";

  return (
    <div
      style={{
        border: `1px solid ${isActive ? color + "88" : "rgba(255,255,255,0.07)"}`,
        borderRadius: 8,
        padding: "14px 16px",
        background: isActive ? `${color}0a` : "rgba(0,0,0,0.2)",
        position: "relative",
        transition: "border-color 0.2s, background 0.2s",
      }}
    >
      {isActive && (
        <span
          style={{
            position: "absolute", top: 10, right: 12,
            fontSize: 9, letterSpacing: 1, color, fontFamily: "monospace",
            fontWeight: 700, textTransform: "uppercase",
          }}
        >
          ACTIVE
        </span>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <StatusDot ok={configured} />
        <span style={{ color, fontSize: 13, fontWeight: 700, fontFamily: "monospace" }}>
          {label}
        </span>
        {isLocal && (
          <Badge color="#22c55e">LOCAL</Badge>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {model && (
          <div style={{ fontSize: 10, color: "#94A3B8" }}>
            <span style={{ color: "#64748B" }}>model </span>
            <span style={{ color: C.textB, fontFamily: "monospace" }}>{model}</span>
          </div>
        )}
        {url && (
          <div style={{ fontSize: 10, color: "#94A3B8", width: "100%", marginTop: 2 }}>
            <span style={{ color: "#64748B" }}>url </span>
            <span style={{ color: "#7dd3fc", fontFamily: "monospace", wordBreak: "break-all" }}>
              {url}
            </span>
          </div>
        )}
        {source && (
          <div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>
            config via <span style={{ color: "#94A3B8" }}>{source}</span>
          </div>
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        <Badge color={configured ? "#22c55e" : "#475569"}>
          {configured ? "CONFIGURED" : "NOT CONFIGURED"}
        </Badge>
      </div>
    </div>
  );
}

export default function LLMProviders() {
  const [research, setResearch] = useState(null);
  const [system, setSystem] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const async_ = useAsync();

  const load = useCallback(async () => {
    const [res, sys] = await Promise.all([
      async_.run(() => apiGet("/v1/jarvis/research/status")).catch(() => null),
      async_.run(() => apiGet("/v1/jarvis/system/status")).catch(() => null),
    ]);
    if (res) setResearch(res);
    if (sys) setSystem(sys);
    if (res || sys) setUpdatedAt(new Date());
  }, [async_]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const activeBackend = research?.backend || system?.aip?.llm_backend || null;
  const isAvailable = research?.available ?? false;
  const connection = research?.connection || {};
  const autopilot = research?.autopilot || {};

  // Build provider list: merge known providers with connection info
  const providers = KNOWN_PROVIDERS.map((p) => {
    const isActive = activeBackend === p.id ||
      (activeBackend === "ollama" && p.id === "ollama") ||
      (activeBackend === "openai-compatible" && p.id === "openai-compatible");

    const configured = isActive ||
      (p.id === "ollama" && Boolean(connection.ollama_host)) ||
      (p.id === "openai-compatible" && isActive);

    const model = p.id === "ollama"
      ? (connection.model || autopilot?.model || null)
      : null;

    const url = p.id === "ollama" ? connection.ollama_host : null;
    const source = p.id === "ollama" ? connection.source : null;

    return { ...p, isActive, configured, model, url, source };
  });

  const activeCount = providers.filter((p) => p.isActive).length;
  const configuredCount = providers.filter((p) => p.configured).length;

  return (
    <PageShell
      title="LLM PROVIDERS"
      subtitle={`BACKEND HEALTH · /v1/jarvis/research/status · ${POLL_MS / 1000}s POLL`}
      accent={ACCENT}
      actions={
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <StatusDot ok={isAvailable} />
          <span style={{ fontSize: 10, color: isAvailable ? "#22c55e" : "#EF4444",
            fontFamily: "monospace", letterSpacing: 1 }}>
            {isAvailable ? "LLM ONLINE" : "LLM OFFLINE"}
          </span>
          {activeBackend && (
            <Badge color={providerColor(activeBackend)}>{activeBackend}</Badge>
          )}
        </div>
      }
    >
      <DataState
        loading={async_.loading && !research && !system}
        error={async_.error}
        empty={false}
      >
        {/* Summary row */}
        <div style={{
          display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center",
        }}>
          <Badge color={isAvailable ? "#22c55e" : "#EF4444"}>
            {isAvailable ? "AVAILABLE" : "UNAVAILABLE"}
          </Badge>
          {activeBackend && (
            <Badge color={providerColor(activeBackend)}>
              ACTIVE: {providerLabel(activeBackend)}
            </Badge>
          )}
          <Badge color="#64748B">{configuredCount} configured</Badge>
          {updatedAt && (
            <span style={{ fontSize: 9, color: "#475569", marginLeft: "auto" }}>
              {updatedAt.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={load}
            style={{
              background: "none", border: `1px solid ${ACCENT}44`, borderRadius: 4,
              color: ACCENT, padding: "4px 9px", cursor: "pointer",
              fontSize: 10, letterSpacing: 1, fontFamily: "monospace",
            }}
          >
            ↺
          </button>
        </div>

        {/* Provider cards */}
        <PanelCard
          title="PROVIDERS"
          accent={ACCENT}
          right={<Badge color={ACCENT}>{providers.length} backends</Badge>}
        >
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12, padding: "4px 0",
          }}>
            {providers.map((p) => (
              <ProviderCard key={p.id} {...p} />
            ))}
          </div>
        </PanelCard>

        {/* Autopilot status */}
        {autopilot && Object.keys(autopilot).length > 0 && (
          <PanelCard
            title="AUTOPILOT"
            accent="#b18cff"
            style={{ marginTop: 14 }}
          >
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 8, padding: "4px 0",
            }}>
              {Object.entries(autopilot).map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    padding: "8px 10px",
                    background: "rgba(0,0,0,0.25)",
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div style={{ fontSize: 9, color: "#64748B", letterSpacing: 1,
                    textTransform: "uppercase", marginBottom: 4 }}>
                    {k.replace(/_/g, " ")}
                  </div>
                  <div style={{ fontSize: 12, color: C.textB, fontFamily: "monospace" }}>
                    {v === null || v === undefined ? "—"
                      : typeof v === "boolean" ? (v ? "YES" : "NO")
                      : String(v)}
                  </div>
                </div>
              ))}
            </div>
          </PanelCard>
        )}

        {/* Hint */}
        {research?.hint && (
          <div style={{
            marginTop: 14, padding: "10px 14px",
            background: "rgba(245,158,11,0.07)",
            border: "1px solid rgba(245,158,11,0.2)",
            borderRadius: 6, fontSize: 11, color: "#d97706",
            fontFamily: "monospace",
          }}>
            ⚠ {research.hint}
          </div>
        )}
      </DataState>
    </PageShell>
  );
}
