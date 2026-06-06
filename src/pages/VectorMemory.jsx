/**
 * VectorMemory — Foundry vector / RAG memory. A permission-aware retrieval box:
 * the operator types a query, we POST it to /v1/jarvis/ai/retrieve and render the
 * returned hits (with redaction + citation surfaced). The AIP/research backend
 * badge comes from /v1/jarvis/research/status.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { apiGet, apiPost, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.neon;

const typeColor = (t) => C.type?.[String(t || "").toLowerCase()] || C.blue || C.neon;

export default function VectorMemory() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState([]);
  const [backend, setBackend] = useState(null);
  const [searched, setSearched] = useState(false);
  const retAsync = useAsync();

  const loadBackend = useCallback(async () => {
    const b = await apiGet("/v1/jarvis/research/status").catch(() => null);
    setBackend(b);
  }, []);
  useEffect(() => { loadBackend(); }, [loadBackend]);

  const search = useCallback(async (e) => {
    if (e) e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearched(true);
    const b = await retAsync.run(() =>
      apiPost("/v1/jarvis/ai/retrieve", { subject_id: "operator", query: q, k: 8 })
    );
    setHits(asList(b, "hits"));
  }, [query, retAsync]);

  return (
    <PageShell title="Vector Memory" subtitle="Foundry · permission-aware retrieval" accent={ACCENT}
      actions={<Badge color={backend?.available ? (C.green || C.neon) : C.red}>
        AIP: {backend?.backend || "offline"}
      </Badge>}>

      <PanelCard title="Retrieve" accent={ACCENT}>
        <form onSubmit={search} style={{ display: "flex", gap: 8 }}>
          <input
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            placeholder="Ask the vector memory…"
            style={{ flex: 1, fontSize: 12, padding: "9px 12px", borderRadius: 6,
              background: "rgba(0,0,0,0.35)", color: C.textB,
              border: `1px solid ${C.border}`, outline: "none",
              fontFamily: "'JetBrains Mono','SF Mono',Courier New,monospace" }}
          />
          <button type="submit" disabled={retAsync.loading || !query.trim()}
            style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: 700, padding: "9px 18px",
              borderRadius: 6, cursor: retAsync.loading || !query.trim() ? "default" : "pointer",
              opacity: retAsync.loading || !query.trim() ? 0.5 : 1,
              background: ACCENT + "1a", color: ACCENT, border: `1px solid ${ACCENT}44` }}>
            {retAsync.loading ? "…" : "RETRIEVE"}
          </button>
        </form>
        <div style={{ marginTop: 10 }}>
          <Grid min={150} gap={10}>
            <StatTile label="Hits" value={hits.length} accent={ACCENT} />
            <StatTile label="Redacted"
              value={hits.filter((h) => h?.redacted).length} accent={C.red} />
            <StatTile label="k" value={8} accent={C.blue || C.neon} />
          </Grid>
        </div>
      </PanelCard>

      <PanelCard title="Results" accent={ACCENT}
        right={<Badge color={ACCENT}>{hits.length} hits</Badge>}>
        <DataState loading={retAsync.loading} error={retAsync.error} empty={searched && !hits.length}
          emptyLabel={searched ? "No matches" : "Run a query to retrieve memories"}>
          {!searched ? (
            <div style={{ padding: 24, color: C.text, fontSize: 10, letterSpacing: 1 }}>
              Run a query to retrieve memories
            </div>
          ) : (
            <Grid min={280} gap={12}>
              {hits.map((h, i) => (
                <div key={h?.id ?? i} className="apex-tile"
                  style={{ borderRadius: 7, padding: 12, border: `1px solid ${C.border}`,
                    background: "rgba(4,10,18,0.6)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <Badge color={typeColor(h?.type)}>{String(h?.type || "node").toUpperCase()}</Badge>
                    {h?.redacted && <Badge color={C.red}>REDACTED</Badge>}
                    <span style={{ fontSize: 8, color: C.text, marginLeft: "auto",
                      fontVariantNumeric: "tabular-nums" }}>{h?.id ?? "—"}</span>
                  </div>
                  <pre style={{ margin: 0, fontSize: 11, color: C.textB, whiteSpace: "pre-wrap",
                    wordBreak: "break-word", maxHeight: 160, overflow: "auto",
                    fontFamily: "'JetBrains Mono','SF Mono',Courier New,monospace" }}>
                    {h?.redacted ? "▓▓▓ redacted ▓▓▓" : JSON.stringify(h?.props ?? {}, null, 2)}
                  </pre>
                  {h?.citation && (
                    <div style={{ marginTop: 8 }}>
                      <a href={h.citation} target="_blank" rel="noreferrer"
                        style={{ fontSize: 9, color: C.neon, letterSpacing: 0.5, wordBreak: "break-all" }}>
                        ↗ {h.citation}
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </Grid>
          )}
        </DataState>
      </PanelCard>
    </PageShell>
  );
}
