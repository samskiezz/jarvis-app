/**
 * TaxonomyBrowser — JARVIS world taxonomy: 30 topics × 10 niches = 300 cells + 20 families.
 * Endpoints:
 *   GET /v1/jarvis/taxonomy/summary  → { topics, niches, cells, families, object_types }
 *   GET /v1/jarvis/taxonomy/cells    → { cells: [{id,topic,niche,label,...}] }
 *   GET /v1/jarvis/taxonomy/families → { families: [...], count }
 * Features: stat tiles, topic-grouped cell grid, text + topic filter, families list.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, Badge, DataState, StatTile, Grid } from "@/components/PageKit";
import { apiGet, asList, useAsync } from "@/lib/wave1";

const ACCENT = "#7C3AED"; // violet — taxonomy = classification
const POLL_MS = 120000;   // 2-min poll; taxonomy is stable data

function CellRow({ cell }) {
  const topic = cell?.topic || cell?.domain || "—";
  const niche = cell?.niche || cell?.subdomain || "—";
  const label = cell?.label || cell?.name || cell?.id || "unnamed";

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr 2fr",
      gap: 8,
      padding: "5px 10px",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      alignItems: "center",
    }}>
      <span style={{ fontSize: 10, color: ACCENT, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {topic}
      </span>
      <span style={{ fontSize: 10, color: "#94A3B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {niche}
      </span>
      <span style={{ fontSize: 11, color: C.textB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
    </div>
  );
}

export default function TaxonomyBrowser() {
  const [summary, setSummary] = useState(null);
  const [cells, setCells] = useState([]);
  const [families, setFamilies] = useState([]);
  const [query, setQuery] = useState("");
  const [topicFilter, setTopicFilter] = useState("ALL");
  const [updatedAt, setUpdatedAt] = useState(null);
  const sumAsync = useAsync();
  const cellAsync = useAsync();
  const famAsync = useAsync();

  const load = useCallback(async () => {
    const [s, c, f] = await Promise.all([
      sumAsync.run(() => apiGet("/v1/jarvis/taxonomy/summary")),
      cellAsync.run(() => apiGet("/v1/jarvis/taxonomy/cells")),
      famAsync.run(() => apiGet("/v1/jarvis/taxonomy/families")),
    ]);
    if (s) setSummary(s);
    if (c) setCells(asList(c, "cells"));
    if (f) setFamilies(asList(f, "families"));
    setUpdatedAt(new Date());
  }, [sumAsync, cellAsync, famAsync]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const topics = useMemo(() => {
    const set = new Set(cells.map((c) => c?.topic || c?.domain).filter(Boolean));
    return ["ALL", ...Array.from(set).sort()];
  }, [cells]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cells.filter((cell) => {
      if (topicFilter !== "ALL") {
        const t = cell?.topic || cell?.domain || "";
        if (t !== topicFilter) return false;
      }
      if (q) {
        const blob = `${cell?.topic} ${cell?.niche} ${cell?.label} ${cell?.name} ${cell?.id}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [cells, query, topicFilter]);

  const inputStyle = {
    background: "rgba(0,0,0,0.4)",
    border: `1px solid ${ACCENT}44`,
    borderRadius: 4,
    padding: "6px 10px",
    color: C.textB,
    fontFamily: "monospace",
    fontSize: 12,
    outline: "none",
  };

  return (
    <PageShell
      title="TAXONOMY BROWSER"
      subtitle={`WORLD KNOWLEDGE TAXONOMY · /v1/jarvis/taxonomy · ${POLL_MS / 1000}s POLL`}
      accent={ACCENT}
      actions={
        <div style={{ display: "flex", gap: 6 }}>
          <Badge color={ACCENT}>{summary?.topics ?? 30} TOPICS</Badge>
          <Badge color="#64748B">{summary?.cells ?? cells.length} CELLS</Badge>
        </div>
      }
    >
      {/* Stat tiles */}
      <Grid min={130} gap={10} style={{ marginBottom: 16 }}>
        <StatTile label="TOPICS" value={summary?.topics ?? 30} accent={ACCENT} />
        <StatTile label="NICHES" value={summary?.niches ?? 10} accent="#8B5CF6" />
        <StatTile label="CELLS" value={summary?.cells ?? cells.length} accent="#A78BFA" />
        <StatTile label="FAMILIES" value={summary?.families ?? families.length} accent="#7C3AED" />
        {summary?.object_types != null && (
          <StatTile label="OBJ TYPES" value={summary.object_types} accent="#6D28D9" />
        )}
      </Grid>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="search"
          placeholder="Search topic, niche, label…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 180, maxWidth: 320 }}
        />
        <select
          value={topicFilter}
          onChange={(e) => setTopicFilter(e.target.value)}
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          {topics.map((t) => (
            <option key={t} value={t}>{t === "ALL" ? "All topics" : t}</option>
          ))}
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
        {(query || topicFilter !== "ALL") && (
          <span style={{ fontSize: 10, color: C.text }}>{filtered.length} / {cells.length}</span>
        )}
      </div>

      {/* Cells table */}
      <PanelCard
        title="TAXONOMY CELLS"
        accent={ACCENT}
        right={<Badge color={ACCENT}>{filtered.length} cells</Badge>}
        style={{ marginBottom: 16 }}
      >
        {/* Header */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 8,
          padding: "4px 10px 6px", borderBottom: `1px solid ${ACCENT}33`,
        }}>
          {["TOPIC", "NICHE", "LABEL"].map((h) => (
            <span key={h} style={{ fontSize: 9, color: ACCENT, letterSpacing: 2, fontFamily: "monospace" }}>{h}</span>
          ))}
        </div>
        <DataState
          loading={cellAsync.loading}
          error={cellAsync.error}
          empty={!cellAsync.loading && !cellAsync.error && filtered.length === 0}
          emptyLabel="No cells match the current filter"
        >
          <div style={{ maxHeight: "calc(100vh - 420px)", overflowY: "auto" }}>
            {filtered.map((cell, i) => (
              <CellRow key={cell?.id ?? i} cell={cell} />
            ))}
          </div>
        </DataState>
      </PanelCard>

      {/* Acquisition families */}
      {(families.length > 0 || famAsync.loading) && (
        <PanelCard title="ACQUISITION FAMILIES" accent={ACCENT}>
          <DataState
            loading={famAsync.loading}
            error={famAsync.error}
            empty={!famAsync.loading && !famAsync.error && families.length === 0}
            emptyLabel="No families returned"
          >
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 6, padding: "8px 4px",
            }}>
              {families.map((f, i) => (
                <div
                  key={i}
                  style={{
                    padding: "6px 10px",
                    border: `1px solid ${ACCENT}33`,
                    borderRadius: 4,
                    fontSize: 11, color: C.textB,
                    background: "rgba(124,58,237,0.06)",
                  }}
                >
                  <span style={{ color: ACCENT, fontFamily: "monospace", marginRight: 6, fontSize: 10 }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {typeof f === "string" ? f : f?.name || f?.label || JSON.stringify(f)}
                </div>
              ))}
            </div>
          </DataState>
        </PanelCard>
      )}
    </PageShell>
  );
}
