/**
 * SearchPlus — front end for the Wave-8 saved-searches / facets / graph-search
 * service (P4 #33/#35/#37). Faceted filtering over the ontology, saving a search
 * + checking for NEW matches since last run (alerting primitive), and finding
 * paths between two objects. Backed by /v1/search-plus/*.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle, JsonView, Tabs } from "@/components/Wave1Kit";
import { apiGet, apiPost, qs, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.neon;

export default function SearchPlus() {
  const [tab, setTab] = useState("facets");
  const [facets, setFacets] = useState(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [results, setResults] = useState([]);
  const [saved, setSaved] = useState([]);
  const [saveName, setSaveName] = useState("");
  const [newMatches, setNewMatches] = useState(null);
  const [a, setA] = useState(""); const [b, setB] = useState(""); const [paths, setPaths] = useState(null);
  const fAsync = useAsync(); const sAsync = useAsync(); const savedAsync = useAsync(); const pAsync = useAsync();

  const loadFacets = useCallback(async () => { const r = await fAsync.run(() => apiGet("/v1/search-plus/facets")); setFacets(r); }, [fAsync]);
  const loadSaved = useCallback(async () => { const r = await savedAsync.run(() => apiGet("/v1/search-plus/saved")); setSaved(asList(r, "items", "searches")); }, [savedAsync]);
  useEffect(() => { loadFacets(); loadSaved(); }, [loadFacets, loadSaved]);

  const search = async () => { const r = await sAsync.run(() => apiPost("/v1/search-plus/faceted", { type: typeFilter || undefined })); setResults(asList(r, "results")); };
  const save = async () => { if (!saveName.trim()) return; await apiPost("/v1/search-plus/saved", { name: saveName.trim(), spec: { type: typeFilter || undefined } }); setSaveName(""); loadSaved(); };
  const checkNew = async (id) => { const r = await apiGet(`/v1/search-plus/saved/${encodeURIComponent(id)}/new`).catch(() => null); setNewMatches({ id, new: asList(r, "new", "new_ids", "ids") }); };
  const findPaths = async () => { const r = await pAsync.run(() => apiGet(`/v1/search-plus/paths${qs({ a, b, max_depth: 4 })}`)); setPaths(r); };

  const typeEntries = facets ? Object.entries((facets.facets?.type) || facets.type || {}) : [];
  const markEntries = facets ? Object.entries((facets.facets?.mark) || facets.mark || {}) : [];

  return (
    <PageShell title="SEARCH+" subtitle="faceted filters · saved searches + new-match alerts · search-in-graph" accent={ACCENT}>
      <Tabs tabs={[{ id: "facets", label: "FACETS" }, { id: "saved", label: "SAVED" }, { id: "graph", label: "PATHS" }]} active={tab} onChange={setTab} accent={ACCENT} />

      {tab === "facets" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 12 }}>
          <PanelCard title="FACETS" accent={ACCENT}>
            <DataState loading={fAsync.loading} empty={!facets} emptyLabel="No facets">
              <div style={{ fontSize: 9, color: C.text, marginBottom: 4 }}>BY TYPE</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                {typeEntries.map(([t, n]) => (
                  <button key={t} onClick={() => { setTypeFilter(t); }} style={{ cursor: "pointer", fontFamily: "inherit",
                    border: `1px solid ${typeFilter === t ? ACCENT : C.border}`, background: typeFilter === t ? `${ACCENT}1a` : "transparent",
                    color: typeFilter === t ? ACCENT : C.text, borderRadius: 3, fontSize: 9, padding: "3px 7px" }}>{t} ({n})</button>
                ))}
              </div>
              <div style={{ fontSize: 9, color: C.text, marginBottom: 4 }}>BY MARK</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {markEntries.map(([m, n]) => <Badge key={m} color={C.gold}>{m}: {n}</Badge>)}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                <Btn accent={ACCENT} onClick={search}>SEARCH</Btn>
                <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="save as…" style={{ ...inputStyle, flex: 1 }} />
                <Btn accent={C.gold} onClick={save}>SAVE</Btn>
              </div>
            </DataState>
          </PanelCard>
          <PanelCard title={`RESULTS ${typeFilter ? `· ${typeFilter}` : ""}`} accent={C.neon} right={<Badge color={C.neon}>{results.length}</Badge>}>
            <DataState loading={sAsync.loading} empty={!results.length} emptyLabel="Pick a facet and SEARCH">
              <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 380, overflowY: "auto" }}>
                {results.map((r, i) => (
                  <div key={i} style={{ fontSize: 10, padding: "5px 8px", borderBottom: `1px solid ${C.border}`, color: C.textB }}>
                    {r.label || r.id} {r.type && <Badge color={C.gold}>{r.type}</Badge>} {r.mark && <Badge color={C.red}>{r.mark}</Badge>}
                  </div>
                ))}
              </div>
            </DataState>
          </PanelCard>
        </div>
      )}

      {tab === "saved" && (
        <PanelCard title="SAVED SEARCHES" accent={ACCENT} right={<Btn accent={ACCENT} onClick={loadSaved}>↻</Btn>}>
          <DataState loading={savedAsync.loading} empty={!saved.length} emptyLabel="No saved searches — save one from the FACETS tab.">
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {saved.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, padding: "7px 9px", border: `1px solid ${C.border}`, borderRadius: 4 }}>
                  <span style={{ flex: 1, color: C.textB, fontWeight: 700 }}>{s.name}</span>
                  <Btn accent={C.gold} onClick={() => checkNew(s.id)}>CHECK NEW</Btn>
                  {newMatches?.id === s.id && <Badge color={newMatches.new.length ? C.neon : C.text}>{newMatches.new.length} new</Badge>}
                </div>
              ))}
            </div>
          </DataState>
        </PanelCard>
      )}

      {tab === "graph" && (
        <PanelCard title="SEARCH-IN-GRAPH · PATHS" accent={ACCENT}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <input value={a} onChange={(e) => setA(e.target.value)} placeholder="from object id" style={{ ...inputStyle, flex: 1 }} />
            <input value={b} onChange={(e) => setB(e.target.value)} placeholder="to object id" style={{ ...inputStyle, flex: 1 }} />
            <Btn accent={ACCENT} onClick={findPaths}>FIND PATHS</Btn>
          </div>
          <DataState loading={pAsync.loading} error={pAsync.error} empty={!paths} emptyLabel="Enter two linked object ids">
            <Grid min={120} style={{ marginBottom: 8 }}>
              <StatTile label="paths found" value={asList(paths, "paths").length} accent={ACCENT} />
            </Grid>
            <JsonView data={paths} max={500} />
          </DataState>
        </PanelCard>
      )}
    </PageShell>
  );
}
