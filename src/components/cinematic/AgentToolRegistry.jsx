/**
 * AgentToolRegistry — F236
 * Full panel listing every tool JARVIS can invoke, sourced from
 * GET /v1/jarvis/agent/tools (real backend endpoint).
 *
 * Features:
 *   • Polls every 60 s; badge shows live tool count.
 *   • Category filter tabs (ALL + derived categories).
 *   • Text search on name + description.
 *   • Click ▶ QUERY → /v1/jarvis/agent/chat asks Jarvis to describe/use the tool.
 *   • Voice triggers: "tool registry / agent tools / what tools / jarvis capabilities / available tools"
 *
 * Additive-only; mounted in App.jsx.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AM  = "#F59E0B";
const GN  = "#22C55E";
const DIM = "#3A4A55";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const TOOL_RE =
  /\b(tool\s*reg|agent\s*tool|jarvis\s*tool|what\s*tools|available\s*tool|capabilities|tool\s*cat|tool\s*list|tool\s*set|atr\b)/i;

export function isToolRegistryQuery(t) {
  return TOOL_RE.test(t || "");
}

export async function buildToolRegistryScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/jarvis/agent/tools`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const tools = Array.isArray(d?.tools) ? d.tools : [];
    if (!tools.length) return "Tool catalogue returned no entries at this time, sir.";
    const cats = [...new Set(tools.map(t => t.category || "general"))].slice(0, 4).join(", ");
    return `JARVIS tool registry: ${tools.length} tool${tools.length !== 1 ? "s" : ""} available. ` +
      `Categories include: ${cats}. ` +
      `Top tools: ${tools.slice(0, 3).map(t => t.name).join(", ")}.`;
  } catch {
    return "Unable to retrieve tool catalogue at this time, sir.";
  }
}

async function fetchTools() {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/tools`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d?.tools) ? d.tools : [];
}

async function queryTool(toolName, toolDesc) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message: `Describe the JARVIS tool named "${toolName}" and give one concrete example of how it would be used. Tool description: ${toolDesc || "n/a"}.`,
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "No response from agent.";
}

export default function AgentToolRegistry() {
  const [open,      setOpen]      = useState(false);
  const [tools,     setTools]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [query,     setQuery]     = useState("");
  const [catFilter, setCatFilter] = useState("ALL");
  const [querying,  setQuerying]  = useState(null);
  const [dossier,   setDossier]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setTools(await fetchTools()); } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && !tools.length) load();
  }, [open, tools.length, load]);

  useEffect(() => {
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (TOOL_RE.test(q)) {
        setOpen(true);
        if (!tools.length) load();
        window.dispatchEvent(new CustomEvent("jarvis:atr-toggle"));
      }
    };
    window.addEventListener("jarvis:ask", onAsk);
    window.addEventListener("jarvis:atr-toggle", () => setOpen(v => !v));
    return () => {
      window.removeEventListener("jarvis:ask", onAsk);
      window.removeEventListener("jarvis:atr-toggle", () => setOpen(v => !v));
    };
  }, [tools.length, load]);

  const categories = ["ALL", ...new Set(tools.map(t => (t.category || "general").toLowerCase()))];

  const filtered = tools.filter(t => {
    const cat = (t.category || "general").toLowerCase();
    const matchCat = catFilter === "ALL" || cat === catFilter;
    const q = query.trim().toLowerCase();
    const matchQ = !q || (t.name || "").toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  async function handleQuery(tool) {
    if (querying) return;
    setQuerying(tool.name);
    setDossier(null);
    try {
      const answer = await queryTool(tool.name, tool.description);
      setDossier({ tool: tool.name, text: answer });
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      setDossier({ tool: tool.name, text: "Agent unavailable." });
    }
    setQuerying(null);
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { setOpen(v => !v); if (!open && !tools.length) load(); }}
        title="Agent Tool Registry"
        style={{
          position: "fixed", bottom: 8, left: 105600, zIndex: 116,
          background: "rgba(5,10,18,0.82)", border: `1px solid ${CY}55`,
          color: CY, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, padding: "3px 8px",
          borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ◈ ATR
        {tools.length > 0 && (
          <span style={{
            marginLeft: 5, background: GN, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 8,
          }}>
            {tools.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", top: 60, right: 18, zIndex: 120,
          width: "min(560px, 94vw)", maxHeight: "80vh",
          background: "rgba(5,10,18,0.96)",
          border: `1px solid ${CY}44`, borderRadius: 14,
          display: "flex", flexDirection: "column",
          boxShadow: `0 0 60px ${CY}14, 0 24px 48px rgba(0,0,0,0.8)`,
          fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* Header */}
          <div style={{
            padding: "12px 16px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
              ◈ AGENT TOOL REGISTRY
            </span>
            {tools.length > 0 && (
              <span style={{ fontSize: 10, color: GN, marginLeft: 4 }}>
                {tools.length} tools
              </span>
            )}
            {loading && (
              <span style={{ fontSize: 9, color: DIM, marginLeft: "auto" }}>loading…</span>
            )}
            <button
              onClick={() => setOpen(false)}
              style={{
                marginLeft: "auto", background: "none", border: "none",
                color: DIM, cursor: "pointer", fontSize: 14, lineHeight: 1,
              }}
            >✕</button>
          </div>

          {/* Search */}
          <div style={{ padding: "8px 16px", borderBottom: `1px solid ${CY}11` }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search tools…"
              style={{
                width: "100%", background: "rgba(41,231,255,0.06)",
                border: `1px solid ${CY}22`, borderRadius: 6,
                padding: "5px 10px", color: "#DCEBF5",
                fontFamily: "inherit", fontSize: 11, outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Category tabs */}
          {categories.length > 1 && (
            <div style={{
              display: "flex", gap: 4, padding: "6px 16px",
              borderBottom: `1px solid ${CY}11`,
              overflowX: "auto", flexShrink: 0,
            }}>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCatFilter(cat)}
                  style={{
                    background: catFilter === cat ? CY : "transparent",
                    color: catFilter === cat ? "#04060A" : DIM,
                    border: `1px solid ${catFilter === cat ? CY : DIM}`,
                    borderRadius: 4, padding: "2px 8px",
                    fontSize: 9, letterSpacing: 1,
                    cursor: "pointer", whiteSpace: "nowrap",
                    fontFamily: "inherit",
                  }}
                >
                  {cat.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {/* Tool list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {!tools.length && !loading && (
              <div style={{ padding: "24px 16px", color: DIM, fontSize: 11, textAlign: "center" }}>
                No tools loaded — backend offline or endpoint unavailable.
              </div>
            )}
            {filtered.map((tool, i) => {
              const cat   = (tool.category || "general").toLowerCase();
              const isQ   = querying === tool.name;
              const isDos = dossier?.tool === tool.name;
              return (
                <div
                  key={tool.name || i}
                  style={{
                    padding: "10px 16px",
                    borderBottom: `1px solid ${CY}0A`,
                    background: isDos ? `${CY}06` : "transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{
                      fontSize: 9, letterSpacing: 1, color: AM,
                      border: `1px solid ${AM}44`, borderRadius: 3,
                      padding: "1px 5px", flexShrink: 0, marginTop: 1,
                    }}>
                      {cat}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "#DCEBF5", fontSize: 12, fontWeight: 700, marginBottom: 2 }}>
                        {tool.name || "unnamed"}
                      </div>
                      {tool.description && (
                        <div style={{ color: "#5A7A8A", fontSize: 10, lineHeight: 1.5 }}>
                          {tool.description}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleQuery(tool)}
                      disabled={!!querying}
                      style={{
                        background: isQ ? `${CY}22` : "transparent",
                        border: `1px solid ${CY}33`, borderRadius: 4,
                        color: CY, fontSize: 9, padding: "2px 7px",
                        cursor: querying ? "default" : "pointer",
                        fontFamily: "inherit", whiteSpace: "nowrap",
                        opacity: querying && !isQ ? 0.4 : 1,
                        flexShrink: 0,
                      }}
                    >
                      {isQ ? "…" : "▶ QUERY"}
                    </button>
                  </div>

                  {isDos && dossier.text && (
                    <div style={{
                      marginTop: 8, padding: "8px 10px",
                      background: `${CY}08`, border: `1px solid ${CY}22`,
                      borderRadius: 6, color: "#9BBCCC", fontSize: 10,
                      lineHeight: 1.6,
                    }}>
                      {dossier.text}
                    </div>
                  )}
                </div>
              );
            })}

            {filtered.length === 0 && tools.length > 0 && (
              <div style={{ padding: "20px 16px", color: DIM, fontSize: 11, textAlign: "center" }}>
                No tools match filter.
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "6px 16px", borderTop: `1px solid ${CY}11`,
            color: DIM, fontSize: 9, letterSpacing: 1,
            display: "flex", justifyContent: "space-between",
          }}>
            <span>GET /v1/jarvis/agent/tools · 60 s poll</span>
            <span>{filtered.length}/{tools.length} tools</span>
          </div>
        </div>
      )}
    </>
  );
}
