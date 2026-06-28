/**
 * MemoryVaultDrawer — F167
 * JARVIS persistent key-value memory store browser + quick-save.
 * Real endpoints:
 *   GET  /v1/jarvis/memory?limit=30
 *     → { memories: [{ id, user_id, key, value, importance, updated_at, created_at }] }
 *   POST /v1/jarvis/memory
 *     body { key, value, importance }  → { ok, id, ... }
 *   GET  /v1/jarvis/persona
 *     → { personas: [{ id, name, ... }], active: string | null }
 * Mounted in Layout.jsx (additive only). Violet (#8B5CF6) accent. Right edge at 4%.
 */
import { useState, useEffect, useRef, useCallback } from "react";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/$/, "");
  }
  return "";
}

const ACC = "#8B5CF6";
const POLL_MS = 5 * 60 * 1000;

function relAge(ts) {
  if (!ts) return "—";
  const secs = Math.floor((Date.now() / 1000) - (typeof ts === "number" ? ts : new Date(ts).getTime() / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function importanceDot(imp) {
  const v = parseFloat(imp) || 0;
  const color = v >= 0.8 ? ACC : v >= 0.5 ? "#F59E0B" : "#475569";
  const label = v >= 0.8 ? "HIGH" : v >= 0.5 ? "MED" : "LOW";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: 9, letterSpacing: 1, color,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: color, display: "inline-block", flexShrink: 0,
      }} />
      {label}
    </span>
  );
}

function KeyBadge({ label }) {
  return (
    <span style={{
      fontSize: 9, letterSpacing: 1, padding: "1px 5px",
      border: `1px solid ${ACC}55`, borderRadius: 4,
      color: ACC, background: `${ACC}11`, flexShrink: 0,
      maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

export default function MemoryVaultDrawer() {
  const [open, setOpen] = useState(false);
  const [memories, setMemories] = useState([]);
  const [personas, setPersonas] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveOk, setSaveOk] = useState(false);
  const [showPersonas, setShowPersonas] = useState(false);

  // Quick-save form state
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [newImp, setNewImp] = useState("0.5");

  const personasFetchedRef = useRef(false);
  const timerRef = useRef(null);

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/memory?limit=30`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setMemories(Array.isArray(d.memories) ? d.memories : []);
    } catch (e) {
      setError(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPersonas = useCallback(async () => {
    if (personasFetchedRef.current) return;
    personasFetchedRef.current = true;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/persona`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setPersonas({ list: Array.isArray(d.personas) ? d.personas : [], active: d.active || null });
    } catch {
      setPersonas({ list: [], active: null });
    }
  }, []);

  useEffect(() => {
    if (!open) {
      clearInterval(timerRef.current);
      return;
    }
    fetchMemories();
    fetchPersonas();
    timerRef.current = setInterval(fetchMemories, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchMemories, fetchPersonas]);

  const handleSave = useCallback(async (e) => {
    e.preventDefault();
    if (!newKey.trim() || !newVal.trim()) return;
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/memory`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key: newKey.trim(), value: newVal.trim(), importance: parseFloat(newImp) }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSaveOk(true);
      setNewKey("");
      setNewVal("");
      setNewImp("0.5");
      await fetchMemories();
      setTimeout(() => setSaveOk(false), 2000);
    } catch (e) {
      setSaveError(e.message || "save error");
    } finally {
      setSaving(false);
    }
  }, [newKey, newVal, newImp, fetchMemories]);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Memory Vault (F167)"
        style={{
          position: "fixed", right: 0, top: "4%",
          zIndex: 110, writingMode: "vertical-rl",
          padding: "8px 5px", cursor: "pointer",
          background: open ? ACC : "rgba(8,10,16,0.85)",
          border: `1px solid ${ACC}`,
          borderRight: "none",
          borderRadius: "6px 0 0 6px",
          color: open ? "#fff" : ACC,
          fontSize: 10, letterSpacing: 2, fontFamily: "'JetBrains Mono',monospace",
        }}
      >
        {open ? "◈" : "◇"} MEM
      </button>

      {/* Drawer */}
      {open && (
        <div
          style={{
            position: "fixed", right: 0, top: 0, height: "100vh",
            width: "min(340px, 90vw)", zIndex: 109,
            background: "rgba(8,10,20,0.97)",
            border: `1px solid ${ACC}44`,
            borderRight: "none",
            boxShadow: `-12px 0 40px rgba(139,92,246,0.15)`,
            display: "flex", flexDirection: "column",
            fontFamily: "'JetBrains Mono',monospace",
            overflowY: "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            padding: "12px 14px 10px",
            borderBottom: `1px solid ${ACC}33`,
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ color: ACC, fontSize: 13, letterSpacing: 2 }}>◈ MEMORY VAULT</span>
              <span style={{
                fontSize: 9, letterSpacing: 1, padding: "1px 5px",
                border: `1px solid ${ACC}44`, borderRadius: 4, color: "#475569",
              }}>
                {memories.length} STORED
              </span>
              <button
                onClick={fetchMemories}
                title="Refresh"
                style={{
                  marginLeft: "auto", background: "none", border: "none",
                  color: ACC, cursor: "pointer", fontSize: 12, padding: "2px 4px",
                }}
              >
                ↻
              </button>
            </div>

            {/* Quick-save form */}
            <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="memory key…"
                maxLength={200}
                style={inputStyle}
              />
              <textarea
                value={newVal}
                onChange={(e) => setNewVal(e.target.value)}
                placeholder="value…"
                rows={2}
                maxLength={1000}
                style={{ ...inputStyle, resize: "none", lineHeight: 1.4 }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label style={{ fontSize: 9, color: "#475569", letterSpacing: 1 }}>IMPORTANCE</label>
                <select
                  value={newImp}
                  onChange={(e) => setNewImp(e.target.value)}
                  style={{ ...inputStyle, flex: 1, padding: "4px 6px" }}
                >
                  <option value="0.9">0.9 — HIGH</option>
                  <option value="0.7">0.7 — MEDIUM-HIGH</option>
                  <option value="0.5">0.5 — MEDIUM</option>
                  <option value="0.3">0.3 — LOW</option>
                  <option value="0.1">0.1 — MINIMAL</option>
                </select>
                <button
                  type="submit"
                  disabled={saving || !newKey.trim() || !newVal.trim()}
                  style={{
                    background: ACC, border: "none", borderRadius: 4,
                    color: "#fff", fontSize: 10, letterSpacing: 1,
                    padding: "4px 10px", cursor: "pointer",
                    opacity: (saving || !newKey.trim() || !newVal.trim()) ? 0.4 : 1,
                  }}
                >
                  {saving ? "…" : "SAVE"}
                </button>
              </div>
              {saveOk && (
                <div style={{ fontSize: 10, color: "#4ADE80", letterSpacing: 1 }}>✓ memory saved</div>
              )}
              {saveError && (
                <div style={{ fontSize: 10, color: "#F87171", letterSpacing: 1 }}>⚠ {saveError}</div>
              )}
            </form>
          </div>

          {/* Memory list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
            {loading && memories.length === 0 && (
              <div style={{ padding: "24px 14px", color: "#475569", fontSize: 11, textAlign: "center", letterSpacing: 1 }}>
                loading…
              </div>
            )}
            {error && (
              <div style={{ padding: "12px 14px", color: "#F87171", fontSize: 10, letterSpacing: 1 }}>
                ⚠ {error}
              </div>
            )}
            {!loading && !error && memories.length === 0 && (
              <div style={{ padding: "24px 14px", color: "#334155", fontSize: 11, textAlign: "center", letterSpacing: 1 }}>
                NO MEMORIES STORED
              </div>
            )}
            {memories.map((mem, i) => {
              const ts = mem.updated_at || mem.created_at;
              const val = String(mem.value || "").slice(0, 120);
              return (
                <div
                  key={mem.id || i}
                  style={{
                    padding: "8px 14px",
                    borderBottom: `1px solid ${ACC}11`,
                    display: "flex", flexDirection: "column", gap: 4,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <KeyBadge label={mem.key || "—"} />
                    {importanceDot(mem.importance)}
                    <span style={{ marginLeft: "auto", fontSize: 9, color: "#334155", letterSpacing: 1, flexShrink: 0 }}>
                      {relAge(ts)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#94A3B8", lineHeight: 1.4, wordBreak: "break-word" }}>
                    {val}{String(mem.value || "").length > 120 ? "…" : ""}
                  </div>
                </div>
              );
            })}

            {/* Personas section */}
            {personas !== null && (
              <div style={{
                borderTop: `1px solid ${ACC}22`, marginTop: 4,
              }}>
                <button
                  onClick={() => setShowPersonas((v) => !v)}
                  style={{
                    width: "100%", background: "none", border: "none",
                    padding: "8px 14px", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                    color: "#475569", fontSize: 10, letterSpacing: 1,
                    fontFamily: "'JetBrains Mono',monospace",
                  }}
                >
                  <span style={{ color: ACC }}>{showPersonas ? "▾" : "▸"}</span>
                  PERSONAS
                  <span style={{
                    fontSize: 9, padding: "0 4px",
                    border: `1px solid ${ACC}44`, borderRadius: 3, color: ACC,
                  }}>
                    {personas.list.length}
                  </span>
                  {personas.active && (
                    <span style={{ marginLeft: "auto", fontSize: 9, color: "#4ADE80", letterSpacing: 1 }}>
                      ACTIVE: {personas.active}
                    </span>
                  )}
                </button>
                {showPersonas && (
                  <div style={{ padding: "0 14px 10px" }}>
                    {personas.list.length === 0 ? (
                      <div style={{ fontSize: 10, color: "#334155", letterSpacing: 1 }}>no personas</div>
                    ) : (
                      personas.list.map((p, i) => {
                        const pid = typeof p === "string" ? p : (p.id || p.name || String(i));
                        const isActive = personas.active === pid;
                        return (
                          <div key={pid} style={{
                            fontSize: 10, color: isActive ? "#4ADE80" : "#64748B",
                            letterSpacing: 1, padding: "3px 0",
                            display: "flex", alignItems: "center", gap: 6,
                          }}>
                            <span style={{
                              width: 5, height: 5, borderRadius: "50%",
                              background: isActive ? "#4ADE80" : "#334155",
                              display: "inline-block", flexShrink: 0,
                            }} />
                            {pid}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "6px 14px", borderTop: `1px solid ${ACC}22`,
            flexShrink: 0, fontSize: 9, color: "#334155", letterSpacing: 1,
            display: "flex", gap: 10,
          }}>
            <span>GET /v1/jarvis/memory · POST /v1/jarvis/memory</span>
            <span style={{ marginLeft: "auto" }}>5 min poll</span>
          </div>
        </div>
      )}
    </>
  );
}

const inputStyle = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(139,92,246,0.08)",
  border: "1px solid rgba(139,92,246,0.3)", borderRadius: 5,
  color: "#CBD5E1", fontSize: 11, letterSpacing: 0.5,
  padding: "5px 8px", outline: "none",
  fontFamily: "'JetBrains Mono',monospace",
};
