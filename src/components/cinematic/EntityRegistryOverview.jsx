/**
 * EntityRegistryOverview — F39
 * Parallel-fetches all 6 entity types (Task, RiskSignal, IntelProfile, SwarmJob,
 * Investment, Contact) and renders a unified count-tiles dashboard.
 * "JARVIS, registry" | "entity counts" opens the panel and speaks the totals.
 * Additive only — mounted via App.jsx; intent exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const ENTITY_TYPES = [
  { name: "Task",           icon: "✓", color: "#7cff7c", label: "Tasks" },
  { name: "RiskSignal",     icon: "⚠", color: "#FF4D6D", label: "Risk Signals" },
  { name: "IntelProfile",   icon: "◈", color: "#29E7FF", label: "Intel Profiles" },
  { name: "SwarmJob",       icon: "⬡", color: "#FFD700", label: "Swarm Jobs" },
  { name: "Investment",     icon: "◆", color: "#b18cff", label: "Investments" },
  { name: "Contact",        icon: "◉", color: "#00E5A0", label: "Contacts" },
];

const ENTITY_RE = /\b(entity|entities|registry|object.count|type.count|entity.count|all.entities|entity.overview)\b/i;

async function fetchCount(entityName) {
  try {
    const r = await fetch(`${apiBase()}/entities/${entityName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ limit: 1 }),
    });
    const d = await r.json();
    if (typeof d?.total === "number") return d.total;
    if (typeof d?.count === "number") return d.count;
    const arr = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : Array.isArray(d?.items) ? d.items : Array.isArray(d?.results) ? d.results : null;
    if (arr) return arr.length;
    return null;
  } catch (_) {
    return null;
  }
}

export function isEntityRegistryQuery(text) {
  return ENTITY_RE.test(text || "");
}

export async function buildEntityRegistryScript() {
  const counts = await Promise.all(ENTITY_TYPES.map(({ name }) => fetchCount(name)));
  const lines = ENTITY_TYPES.map(({ label }, i) =>
    counts[i] != null ? `${counts[i]} ${label}` : `${label} unavailable`
  );
  const total = counts.reduce((s, c) => s + (c ?? 0), 0);
  return (
    `Entity registry overview: ${total} objects tracked across 6 types. ` +
    lines.join(", ") + ". All entity counts are live from the JARVIS data plane, sir."
  );
}

export default function EntityRegistryOverview() {
  const [open, setOpen]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState({});
  const [lastFetch, setLastFetch] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all(ENTITY_TYPES.map(({ name }) => fetchCount(name)));
    const map = {};
    ENTITY_TYPES.forEach(({ name }, i) => { map[name] = results[i]; });
    setCounts(map);
    setLastFetch(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && !lastFetch) refresh();
  }, [open, lastFetch, refresh]);

  // Auto-refresh every 60s when panel is open
  useEffect(() => {
    if (!open) return;
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [open, refresh]);

  // Listen for jarvis:registry-toggle event from JarvisBrain
  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:registry-toggle", onToggle);
    return () => window.removeEventListener("jarvis:registry-toggle", onToggle);
  }, []);

  const total = ENTITY_TYPES.reduce((s, { name }) => s + (counts[name] ?? 0), 0);
  const badge = ENTITY_TYPES.filter(({ name }) => counts[name] != null).length;

  return (
    <>
      {/* Bottom-strip toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Entity Registry Overview (F39)"
        style={{
          position: "fixed", bottom: 18, left: 2780, zIndex: 60,
          background: open ? `${CY}22` : "rgba(5,8,13,0.7)",
          border: `1px solid ${open ? CY : CY + "55"}`,
          color: open ? CY : `${CY}99`,
          borderRadius: 6, padding: "3px 9px", fontSize: 9, letterSpacing: 1.5,
          fontFamily: "'JetBrains Mono',monospace", cursor: "pointer",
          backdropFilter: "blur(6px)", whiteSpace: "nowrap",
        }}
      >
        ◫ REGISTRY{badge > 0 && <span style={{ marginLeft: 4, color: CY, fontWeight: "bold" }}>{badge}/6</span>}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 54, left: 2780,
          width: "min(480px, 90vw)",
          background: "rgba(8,14,22,0.95)",
          border: `1px solid ${CY}44`,
          borderRadius: 12,
          boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
          zIndex: 60,
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px 8px",
            borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ color: CY, fontSize: 11, fontWeight: "bold", letterSpacing: 2 }}>
              ◫ ENTITY REGISTRY
            </span>
            <span style={{
              marginLeft: "auto", fontSize: 9, color: "#6E8AA0",
              border: `1px solid ${CY}22`, borderRadius: 4, padding: "1px 6px",
            }}>
              {total} total
            </span>
            <button
              onClick={refresh}
              disabled={loading}
              style={{
                background: "transparent", border: `1px solid ${CY}33`, color: CY,
                borderRadius: 4, padding: "2px 8px", fontSize: 9, cursor: "pointer",
                letterSpacing: 1, opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? "…" : "↺"}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "transparent", border: "none", color: "#6E8AA0",
                fontSize: 12, cursor: "pointer", padding: "0 2px",
              }}
            >✕</button>
          </div>

          {/* Entity count tiles */}
          <div style={{ padding: "12px 14px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {ENTITY_TYPES.map(({ name, icon, color, label }) => {
              const count = counts[name];
              return (
                <div key={name} style={{
                  background: `${color}0d`,
                  border: `1px solid ${color}44`,
                  borderRadius: 8, padding: "10px 12px",
                  display: "flex", flexDirection: "column", gap: 4,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color, fontSize: 14 }}>{icon}</span>
                    <span style={{ color, fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase" }}>{label}</span>
                  </div>
                  <div style={{
                    fontSize: 22, fontWeight: "bold", color,
                    textShadow: `0 0 12px ${color}88`,
                    lineHeight: 1,
                  }}>
                    {loading && count == null ? "…" : count != null ? count.toLocaleString() : "—"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          {lastFetch && (
            <div style={{
              padding: "6px 14px 10px",
              fontSize: 9, color: "#6E8AA0",
              borderTop: `1px solid ${CY}11`,
            }}>
              updated {lastFetch.toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
    </>
  );
}
