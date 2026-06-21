/**
 * EntityQuickSearch — F08
 * Floating search panel: queries /v1/graph/subgraph + /entities/IntelProfile.
 * Triggered by "JARVIS, search/find/who is <term>" via jarvis:entity-search event
 * (dispatched by JarvisBrain) or by Ctrl/Cmd+Shift+E keyboard shortcut.
 * Clicking a result dispatches jarvis:speak-dossier so JARVIS reads a one-line dossier.
 * Additive only — mounted in App.jsx; intent helpers imported into JarvisBrain.jsx.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { IntelProfile } from "@/api/entities";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const PUR = "#9B59FF";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SEARCH_RE =
  /\b(?:search(?:\s+for)?|find|look\s*up|who\s+is|what\s+is|tell\s+me\s+about|dossier\s+on|profile\s+of|info\s+on|intel\s+on)\s+(.+)/i;

export function isEntitySearchQuery(text) {
  return SEARCH_RE.test(text || "");
}

export function extractEntitySearchTerm(text) {
  const m = (text || "").match(SEARCH_RE);
  return m ? m[1].trim() : null;
}

async function fetchGraphNodes(term) {
  try {
    const r = await fetch(`${apiBase()}/v1/graph/subgraph`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) return [];
    const data = await r.json();
    const nodes = [
      ...(Array.isArray(data?.nodes) ? data.nodes : []),
      ...(Array.isArray(data?.vertices) ? data.vertices : []),
    ];
    const q = (term || "").toLowerCase().trim();
    if (!q) return nodes.slice(0, 10);
    return nodes.filter(n => {
      const label = (n.label || n.name || String(n.id) || "").toLowerCase();
      const type = (n.type || n.entity_type || "").toLowerCase();
      return label.includes(q) || type.includes(q);
    }).slice(0, 8);
  } catch (_) {
    return [];
  }
}

async function fetchIntelProfiles(term) {
  try {
    const res = await IntelProfile.list({});
    const items = Array.isArray(res)
      ? res
      : Array.isArray(res?.items)
      ? res.items
      : [];
    const q = (term || "").toLowerCase().trim();
    if (!q) return items.slice(0, 10);
    return items.filter(p => {
      const name = (p.name || p.title || String(p.id) || "").toLowerCase();
      const type = (p.type || p.category || "").toLowerCase();
      const summary = (p.summary || p.description || "").toLowerCase();
      return name.includes(q) || type.includes(q) || summary.includes(q);
    }).slice(0, 8);
  } catch (_) {
    return [];
  }
}

export async function buildEntityDossierScript(term) {
  if (!term || !term.trim()) return "Please specify an entity to search for, sir.";

  const [nodes, profiles] = await Promise.all([
    fetchGraphNodes(term),
    fetchIntelProfiles(term),
  ]);

  if (!nodes.length && !profiles.length) {
    return `No entity matching "${term}" was found in the knowledge graph, sir.`;
  }

  if (nodes.length > 0) {
    const n = nodes[0];
    const label = n.label || n.name || String(n.id) || "Unknown";
    const type = n.type || n.entity_type || "entity";
    const props = n.properties || n.metadata || {};
    let line = `${label}, classified as ${type}`;
    const keyProp = Object.entries(props).find(
      ([k, v]) =>
        typeof v === "string" && v.length > 2 && v.length < 70 && !k.startsWith("_")
    );
    if (keyProp) line += `. ${keyProp[0].replace(/_/g, " ")}: ${keyProp[1]}`;
    const extra =
      nodes.length > 1
        ? ` ${nodes.length - 1} additional match${nodes.length > 2 ? "es" : ""} found.`
        : "";
    return `Entity dossier, sir. ${line}.${extra}`;
  }

  const p = profiles[0];
  const name = p.name || p.title || String(p.id) || "Unknown";
  const type = p.type || p.category || "intel profile";
  const raw = p.summary || p.description || "";
  const summary = raw.length > 90 ? `${raw.slice(0, 87)}…` : raw;
  return `Intel profile, sir. ${name}, ${type}${summary ? `. ${summary}` : ""}.`;
}

// ── Result card ───────────────────────────────────────────────────────────────

function ResultCard({ item, kind, onClick }) {
  const label = item.label || item.name || item.title || String(item.id) || "Unknown";
  const type = item.type || item.entity_type || item.category || kind;
  const sub =
    item.summary ||
    item.description ||
    (item.properties || item.metadata || {}).description ||
    "";
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        background: "rgba(41,231,255,0.04)",
        border: `1px solid ${CY}22`,
        borderRadius: 8,
        padding: "8px 12px",
        cursor: "pointer",
        marginBottom: 5,
        color: "inherit",
        fontFamily: "inherit",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = `${CY}66`)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = `${CY}22`)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 9,
            color: PUR,
            fontWeight: 700,
            letterSpacing: 1,
            background: `${PUR}22`,
            borderRadius: 4,
            padding: "1px 6px",
            flexShrink: 0,
          }}
        >
          {kind === "graph" ? "GRAPH" : "INTEL"}
        </span>
        <span style={{ color: "#DCEBF5", fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span style={{ color: "#4a6070", fontSize: 10, marginLeft: "auto", flexShrink: 0 }}>
          {type}
        </span>
      </div>
      {sub && (
        <div style={{ color: "#566878", fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
          {sub.length > 80 ? `${sub.slice(0, 77)}…` : sub}
        </div>
      )}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EntityQuickSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [graphNodes, setGraphNodes] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const inputRef = useRef(null);
  const debounceT = useRef(null);

  const runSearch = useCallback(async (term) => {
    if (!term || term.trim().length < 2) {
      setGraphNodes([]);
      setProfiles([]);
      return;
    }
    setLoading(true);
    const [nodes, profs] = await Promise.all([
      fetchGraphNodes(term),
      fetchIntelProfiles(term),
    ]);
    setGraphNodes(nodes);
    setProfiles(profs);
    setLoading(false);
  }, []);

  function handleChange(e) {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceT.current);
    debounceT.current = setTimeout(() => runSearch(val), 350);
  }

  function speakEntity(item, kind) {
    const label = item.label || item.name || item.title || String(item.id) || "Unknown";
    const type = item.type || item.entity_type || item.category || kind;
    const raw =
      item.summary ||
      item.description ||
      (item.properties || item.metadata || {}).description ||
      "";
    const sub = raw.length > 90 ? `${raw.slice(0, 87)}…` : raw;
    const dossier = `Entity dossier, sir. ${label}, classified as ${type}${sub ? `. ${sub}` : ""}.`;
    window.dispatchEvent(
      new CustomEvent("jarvis:speak-dossier", { detail: { text: dossier } })
    );
  }

  // Open when JarvisBrain dispatches jarvis:entity-search
  useEffect(() => {
    const onSearch = (e) => {
      const term = e?.detail?.term || "";
      setQuery(term);
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 60);
      if (term.trim().length >= 2) runSearch(term);
    };
    window.addEventListener("jarvis:entity-search", onSearch);
    return () => window.removeEventListener("jarvis:entity-search", onSearch);
  }, [runSearch]);

  // Ctrl/Cmd+Shift+E to toggle
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setOpen(v => !v);
        setTimeout(() => inputRef.current?.focus(), 60);
      }
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const total = graphNodes.length + profiles.length;

  return (
    <div
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        zIndex: 80,
        transform: "translate(-50%, -50%)",
        width: "min(540px, 92vw)",
        background: "rgba(5,9,16,0.97)",
        border: `1px solid ${CY}44`,
        borderRadius: 14,
        padding: 16,
        backdropFilter: "blur(16px)",
        boxShadow: `0 0 80px ${CY}18, 0 4px 40px rgba(0,0,0,0.6)`,
        fontFamily: "'JetBrains Mono',monospace",
        color: "#DCEBF5",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ color: CY, fontSize: 11, fontWeight: 700, letterSpacing: 3 }}>
          ◈ ENTITY SEARCH
        </span>
        {loading && (
          <span style={{ fontSize: 9, color: "#4a6070", letterSpacing: 1 }}>SCANNING…</span>
        )}
        {!loading && total > 0 && (
          <span style={{ fontSize: 9, color: "#4a6070", letterSpacing: 1 }}>
            {total} RESULT{total !== 1 ? "S" : ""}
          </span>
        )}
        <button
          onClick={() => setOpen(false)}
          style={{
            marginLeft: "auto",
            background: "none",
            border: "none",
            color: "#566878",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            padding: "0 2px",
          }}
        >
          ×
        </button>
      </div>

      {/* Search input */}
      <input
        ref={inputRef}
        value={query}
        onChange={handleChange}
        placeholder="Search graph nodes, intel profiles…"
        autoFocus
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: "rgba(41,231,255,0.06)",
          border: `1px solid ${CY}44`,
          borderRadius: 8,
          padding: "10px 14px",
          color: "#DCEBF5",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 13,
          outline: "none",
          marginBottom: 12,
        }}
        onKeyDown={e => e.key === "Escape" && setOpen(false)}
      />

      {/* Results */}
      <div style={{ maxHeight: "min(320px, 42vh)", overflowY: "auto" }}>
        {graphNodes.map((n, i) => (
          <ResultCard
            key={`g-${n.id ?? i}`}
            item={n}
            kind="graph"
            onClick={() => speakEntity(n, "graph")}
          />
        ))}
        {profiles.map((p, i) => (
          <ResultCard
            key={`p-${p.id ?? i}`}
            item={p}
            kind="intel"
            onClick={() => speakEntity(p, "intel")}
          />
        ))}
        {!loading && query.trim().length >= 2 && total === 0 && (
          <div
            style={{
              color: "#4a6070",
              fontSize: 12,
              textAlign: "center",
              padding: "20px 0",
            }}
          >
            No entities found for &ldquo;{query}&rdquo;
          </div>
        )}
        {query.trim().length < 2 && (
          <div
            style={{
              color: "#3a5060",
              fontSize: 11,
              textAlign: "center",
              padding: "14px 0",
            }}
          >
            Type at least 2 characters · click a result to hear the dossier
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 10,
          fontSize: 9,
          color: "#2d4050",
          letterSpacing: 1,
          textAlign: "right",
        }}
      >
        /v1/graph/subgraph · /entities/IntelProfile · Esc to close
      </div>
    </div>
  );
}
