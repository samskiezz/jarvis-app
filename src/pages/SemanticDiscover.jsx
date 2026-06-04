/**
 * SemanticDiscover — front end for the Wave-7 semantic search + RAG service
 * (Palantir pillars P4 #34, P9 #62/#67/#68). Three real tools over a local,
 * dependency-free vector index (hashing TF-IDF) of the ontology:
 *   • SEMANTIC SEARCH — cosine top-k over indexed objects (/v1/semantic/search).
 *   • RAG CONTEXT     — retrieved, cited grounding context (/v1/semantic/rag).
 *   • NL QUERY        — transparent natural-language→ontology-filter heuristic
 *                       (/v1/semantic/nl), honestly labeled as a heuristic.
 * A REINDEX button rebuilds the vector index from the live ontology.
 */
import { useState, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle, JsonView, Tabs } from "@/components/Wave1Kit";
import { apiGet, apiPost, qs, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.neon;
const scoreColor = (s) => (s >= 0.6 ? C.neon : s >= 0.3 ? C.gold : C.text);

export default function SemanticDiscover() {
  const [tab, setTab] = useState("search");
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [rag, setRag] = useState(null);
  const [nl, setNl] = useState(null);
  const [reindexMsg, setReindexMsg] = useState(null);
  const searchAsync = useAsync();
  const ragAsync = useAsync();
  const nlAsync = useAsync();
  const reindexAsync = useAsync();

  const run = useCallback(async () => {
    const query = q.trim();
    if (!query) return;
    if (tab === "search") {
      const body = await searchAsync.run(() => apiGet(`/v1/semantic/search${qs({ q: query, k: 12 })}`));
      setResults(asList(body, "results", "hits"));
    } else if (tab === "rag") {
      const body = await ragAsync.run(() => apiPost("/v1/semantic/rag", { query, k: 6 }));
      setRag(body);
    } else {
      const body = await nlAsync.run(() => apiPost("/v1/semantic/nl", { query }));
      setNl(body);
    }
  }, [q, tab, searchAsync, ragAsync, nlAsync]);

  const reindex = async () => {
    setReindexMsg(null);
    const body = await reindexAsync.run(() => apiPost("/v1/semantic/reindex", {}));
    setReindexMsg(body ? `indexed ${body.count ?? body.indexed ?? "?"} objects` : "reindex failed");
  };

  const sources = rag ? asList(rag, "sources", "results") : [];

  return (
    <PageShell title="SEMANTIC DISCOVER" subtitle="vector search · RAG grounding · NL→query — local hashing-TF-IDF index" accent={ACCENT}
      actions={<span style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {reindexMsg && <Badge color={C.gold}>{reindexMsg}</Badge>}
        <Btn accent={C.gold} onClick={reindex}>{reindexAsync.loading ? "…" : "↻ REINDEX"}</Btn>
      </span>}>
      <Tabs tabs={[{ id: "search", label: "SEMANTIC SEARCH" }, { id: "rag", label: "RAG CONTEXT" }, { id: "nl", label: "NL QUERY" }]}
        active={tab} onChange={setTab} accent={ACCENT} />

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder={tab === "nl" ? "e.g. show people of type client near Sydney" : "natural-language query…"}
          style={{ ...inputStyle, flex: 1 }} />
        <Btn accent={ACCENT} onClick={run}>RUN</Btn>
      </div>

      {tab === "search" && (
        <PanelCard title="RANKED MATCHES" accent={ACCENT} right={<Badge color={ACCENT}>{results.length}</Badge>}>
          <DataState loading={searchAsync.loading} error={searchAsync.error} empty={!results.length}
            emptyLabel="No matches — try REINDEX first if the ontology was just populated.">
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {results.map((r, i) => {
                const sc = typeof r.score === "number" ? r.score : 0;
                return (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 10,
                    padding: "7px 9px", border: `1px solid ${C.border}`, borderRadius: 4 }}>
                    <span style={{ color: scoreColor(sc), fontWeight: 700, width: 44 }}>{(sc).toFixed(3)}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: C.textB }}>{r.meta?.label || r.id}</div>
                      <div style={{ fontSize: 8, color: C.text }}>{r.text?.slice(0, 120)}</div>
                    </div>
                    {r.kind && <Badge color={C.gold}>{r.kind}</Badge>}
                  </div>
                );
              })}
            </div>
          </DataState>
        </PanelCard>
      )}

      {tab === "rag" && (
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <PanelCard title="GROUNDING CONTEXT" accent={ACCENT}>
            <DataState loading={ragAsync.loading} error={ragAsync.error} empty={!rag} emptyLabel="Ask a question to assemble cited context">
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 10, color: C.textB, lineHeight: 1.6, maxHeight: 420, overflow: "auto" }}>
                {rag?.context || rag?.grounding || JSON.stringify(rag, null, 1)}
              </pre>
            </DataState>
          </PanelCard>
          <PanelCard title="SOURCES" accent={C.gold} right={<Badge color={C.gold}>{sources.length}</Badge>}>
            <DataState empty={!sources.length} emptyLabel="—">
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {sources.map((s, i) => (
                  <div key={i} style={{ fontSize: 9, padding: "5px 7px", borderLeft: `2px solid ${C.gold}`, background: `${C.gold}0a` }}>
                    <div style={{ color: C.textB }}>{s.meta?.label || s.id}</div>
                    <div style={{ color: C.text }}>score {typeof s.score === "number" ? s.score.toFixed(3) : "—"}</div>
                  </div>
                ))}
              </div>
            </DataState>
          </PanelCard>
        </div>
      )}

      {tab === "nl" && (
        <PanelCard title="INTERPRETED QUERY + RESULTS" accent={ACCENT}
          right={<Badge color={C.gold}>heuristic parser</Badge>}>
          <DataState loading={nlAsync.loading} error={nlAsync.error} empty={!nl} emptyLabel="Type a natural-language request">
            {nl && (
              <>
                <div style={{ fontSize: 9, color: C.text, marginBottom: 4 }}>INTERPRETED AS</div>
                <JsonView data={nl.interpreted || nl.filter || {}} />
                <Grid min={120} style={{ marginTop: 10 }}>
                  <StatTile label="results" value={asList(nl, "results").length} accent={ACCENT} />
                </Grid>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                  {asList(nl, "results").slice(0, 30).map((r, i) => (
                    <div key={i} style={{ fontSize: 10, padding: "4px 7px", borderBottom: `1px solid ${C.border}`, color: C.textB }}>
                      {r.label || r.name || r.id} {r.type && <Badge color={C.gold}>{r.type}</Badge>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </DataState>
        </PanelCard>
      )}
    </PageShell>
  );
}
