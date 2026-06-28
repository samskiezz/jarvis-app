/**
 * ToolRegistry — browse and search the live agent tool catalogue.
 * Endpoint: GET /v1/jarvis/agent/tools → { tools: [{name, description, parameters}] }
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, Badge, DataState } from "@/components/PageKit";
import { apiGet } from "@/lib/wave1";

const ACCENT = C.purple;
const POLL_MS = 30000;

function ParamRow({ name, schema }) {
  const type = schema?.type || (Array.isArray(schema?.enum) ? "enum" : "any");
  const desc = schema?.description || "";
  const required = schema?._required;
  return (
    <tr style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
      <td style={{ padding: "4px 8px", fontFamily: "monospace", fontSize: 11, color: C.neon }}>
        {name}
        {required && (
          <span style={{ marginLeft: 4, fontSize: 9, color: C.red }}>*</span>
        )}
      </td>
      <td style={{ padding: "4px 8px", fontSize: 10, color: C.blue }}>{type}</td>
      <td style={{ padding: "4px 8px", fontSize: 10, color: C.textB, maxWidth: 320,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {desc || "—"}
      </td>
    </tr>
  );
}

function ToolRow({ tool, expanded, onToggle }) {
  const params = useMemo(() => {
    const props = tool?.parameters?.properties || {};
    const required = new Set(tool?.parameters?.required || []);
    return Object.entries(props).map(([k, v]) => [k, { ...v, _required: required.has(k) }]);
  }, [tool]);

  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", textAlign: "left", background: "none", border: "none",
          cursor: "pointer", padding: "10px 13px", display: "flex",
          alignItems: "flex-start", gap: 10, color: C.textB,
        }}
      >
        <span style={{
          marginTop: 2, fontSize: 9, color: expanded ? ACCENT : C.text,
          transition: "color 0.15s", flexShrink: 0,
        }}>
          {expanded ? "▼" : "▶"}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{
              fontFamily: "monospace", fontSize: 12, color: expanded ? ACCENT : C.neon,
              fontWeight: 700, letterSpacing: 0.5,
            }}>
              {tool?.name || "(unnamed)"}
            </span>
            {params.length > 0 && (
              <Badge color={C.blue}>{params.length} param{params.length !== 1 ? "s" : ""}</Badge>
            )}
          </div>
          {tool?.description && (
            <div style={{ fontSize: 11, color: C.text, marginTop: 3, lineHeight: 1.5 }}>
              {tool.description}
            </div>
          )}
        </div>
      </button>

      {expanded && params.length > 0 && (
        <div style={{ padding: "0 13px 10px 32px" }}>
          <div style={{
            background: "rgba(0,0,0,0.25)", borderRadius: 4,
            border: `1px solid ${C.border}`, overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(168,85,247,0.06)" }}>
                  <th style={{ padding: "5px 8px", fontSize: 9, color: C.text,
                    letterSpacing: 1.5, textAlign: "left", fontWeight: 700 }}>PARAM</th>
                  <th style={{ padding: "5px 8px", fontSize: 9, color: C.text,
                    letterSpacing: 1.5, textAlign: "left", fontWeight: 700 }}>TYPE</th>
                  <th style={{ padding: "5px 8px", fontSize: 9, color: C.text,
                    letterSpacing: 1.5, textAlign: "left", fontWeight: 700 }}>DESCRIPTION</th>
                </tr>
              </thead>
              <tbody>
                {params.map(([name, schema]) => (
                  <ParamRow key={name} name={name} schema={schema} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ToolRegistry() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await apiGet("/v1/jarvis/agent/tools");
      setTools(Array.isArray(res?.tools) ? res.tools : []);
      setError(null);
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e?.message || "Failed to load tool catalogue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter((t) =>
      (t?.name || "").toLowerCase().includes(q) ||
      (t?.description || "").toLowerCase().includes(q)
    );
  }, [tools, query]);

  const toggle = (name) => setExpanded((prev) => (prev === name ? null : name));

  return (
    <PageShell
      title="TOOL REGISTRY"
      subtitle={`AGENT TOOLS · /v1/jarvis/agent/tools · ${POLL_MS / 1000}s POLL`}
      accent={ACCENT}
      actions={
        <Badge color={loading ? C.gold : error ? C.red : ACCENT}>
          {loading ? "LOADING" : error ? "ERROR" : `${tools.length} TOOLS`}
        </Badge>
      }
    >
      <div style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "center" }}>
        <input
          type="search"
          placeholder="Search tools…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1, maxWidth: 400,
            background: "rgba(0,0,0,0.4)", border: `1px solid ${ACCENT}33`,
            borderRadius: 4, padding: "6px 10px", color: C.textB,
            fontFamily: "monospace", fontSize: 12, outline: "none",
          }}
        />
        {query && (
          <span style={{ fontSize: 10, color: C.text }}>
            {filtered.length} / {tools.length}
          </span>
        )}
        <button
          onClick={load}
          style={{
            background: "none", border: `1px solid ${ACCENT}44`, borderRadius: 4,
            color: ACCENT, padding: "5px 10px", cursor: "pointer", fontSize: 10,
            letterSpacing: 1, fontFamily: "monospace",
          }}
        >
          ↺ REFRESH
        </button>
        {updatedAt && (
          <span style={{ fontSize: 9, color: C.text }}>
            {updatedAt.toLocaleTimeString()}
          </span>
        )}
      </div>

      <PanelCard
        title="LIVE TOOLS"
        accent={ACCENT}
        right={
          <Badge color={C.text}>
            {filtered.length} {filtered.length === 1 ? "tool" : "tools"}
          </Badge>
        }
      >
        <DataState loading={loading} error={error} empty={!loading && !error && filtered.length === 0}>
          <div style={{ maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
            {filtered.map((tool) => (
              <ToolRow
                key={tool?.name}
                tool={tool}
                expanded={expanded === tool?.name}
                onToggle={() => toggle(tool?.name)}
              />
            ))}
          </div>
        </DataState>
      </PanelCard>
    </PageShell>
  );
}
