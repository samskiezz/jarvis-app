/**
 * ObjectSets — front end for the Wave-8 ontology extension service
 * (Foundry P2 #19/#23/#24/#26): object SETS (saved filters resolved live),
 * BULK actions over a set, and ontology EXPORT/IMPORT. Backed by
 * /v1/ontology-ext/{sets, bulk-action, export, import}.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle, JsonView, Tabs } from "@/components/Wave1Kit";
import { apiGet, apiPost, asList, useAsync, download } from "@/lib/wave1";

const ACCENT = C.gold;

export default function ObjectSets() {
  const [tab, setTab] = useState("sets");
  const [sets, setSets] = useState([]);
  const [name, setName] = useState("");
  const [query, setQuery] = useState('{ "type": "person" }');
  const [resolved, setResolved] = useState([]);
  const [sel, setSel] = useState(null);
  const [action, setAction] = useState("flag");
  const [payload, setPayload] = useState('{ "flag": "review" }');
  const [bulkResult, setBulkResult] = useState(null);
  const [exported, setExported] = useState(null);
  const listAsync = useAsync(); const resolveAsync = useAsync(); const bulkAsync = useAsync(); const ioAsync = useAsync();

  const load = useCallback(async () => { const b = await listAsync.run(() => apiGet("/v1/ontology-ext/sets")); setSets(asList(b, "items", "sets")); }, [listAsync]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    let q; try { q = JSON.parse(query); } catch { return; }
    if (!name.trim()) return;
    await apiPost("/v1/ontology-ext/sets", { name: name.trim(), query: q }); setName(""); load();
  };
  const resolve = async (s) => { setSel(s); const b = await resolveAsync.run(() => apiGet(`/v1/ontology-ext/sets/${encodeURIComponent(s.id)}/resolve`)); setResolved(asList(b, "results", "items", "objects")); };
  const bulk = async () => {
    if (!sel) return; let p; try { p = JSON.parse(payload); } catch { return; }
    const b = await bulkAsync.run(() => apiPost("/v1/ontology-ext/bulk-action", { set_id: sel.id, action, payload: p })); setBulkResult(b);
  };
  const doExport = async () => { const b = await ioAsync.run(() => apiGet("/v1/ontology-ext/export")); setExported(b); if (b) download("ontology-export.json", JSON.stringify(b, null, 2), "application/json"); };

  return (
    <PageShell title="OBJECT SETS" subtitle="saved object sets · bulk actions · ontology export/import" accent={ACCENT}>
      <Tabs tabs={[{ id: "sets", label: "SETS + BULK" }, { id: "io", label: "EXPORT/IMPORT" }]} active={tab} onChange={setTab} accent={ACCENT} />

      {tab === "sets" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 12 }}>
          <PanelCard title="SETS" accent={ACCENT}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="set name" style={{ ...inputStyle, flex: 1 }} />
              <Btn accent={ACCENT} onClick={create}>+ CREATE</Btn>
            </div>
            <textarea value={query} onChange={(e) => setQuery(e.target.value)} rows={2}
              style={{ ...inputStyle, width: "100%", fontFamily: "monospace", marginBottom: 8 }} />
            <DataState loading={listAsync.loading} empty={!sets.length} emptyLabel="No sets — create a saved filter.">
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {sets.map((s, i) => (
                  <button key={i} onClick={() => resolve(s)} style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                    fontSize: 10, padding: "7px 9px", borderRadius: 4, border: `1px solid ${sel?.id === s.id ? ACCENT : C.border}`,
                    background: sel?.id === s.id ? `${ACCENT}14` : "rgba(0,0,0,0.2)", color: C.textB }}>
                    <span style={{ fontWeight: 700 }}>{s.name}</span>
                    <div style={{ fontSize: 8, color: C.text }}>{JSON.stringify(s.query)}</div>
                  </button>
                ))}
              </div>
            </DataState>
          </PanelCard>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <PanelCard title={`RESOLVED ${sel ? `· ${sel.name}` : ""}`} accent={C.neon} right={<Badge color={C.neon}>{resolved.length}</Badge>}>
              <DataState loading={resolveAsync.loading} empty={!sel} emptyLabel="Select a set to resolve it live">
                <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                  {resolved.map((o, i) => (
                    <div key={i} style={{ fontSize: 10, padding: "3px 7px", borderBottom: `1px solid ${C.border}`, color: C.textB }}>
                      {o.label || o.id} {o.type && <Badge color={C.gold}>{o.type}</Badge>}
                    </div>
                  ))}
                </div>
              </DataState>
            </PanelCard>
            <PanelCard title="BULK ACTION" accent={C.gold}>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="action" style={{ ...inputStyle, width: 120 }} />
                <input value={payload} onChange={(e) => setPayload(e.target.value)} placeholder="payload JSON" style={{ ...inputStyle, flex: 1, fontFamily: "monospace" }} />
                <Btn accent={C.gold} onClick={bulk}>APPLY</Btn>
              </div>
              <DataState loading={bulkAsync.loading} error={bulkAsync.error} empty={!bulkResult} emptyLabel="Apply a governed action across the whole set">
                <JsonView data={bulkResult} max={300} />
              </DataState>
            </PanelCard>
          </div>
        </div>
      )}

      {tab === "io" && (
        <PanelCard title="EXPORT / IMPORT ONTOLOGY" accent={ACCENT}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <Btn accent={ACCENT} onClick={doExport}>EXPORT + DOWNLOAD</Btn>
          </div>
          <Grid min={120} style={{ marginBottom: 8 }}>
            <StatTile label="types" value={exported ? asList(exported.types).length : "—"} accent={ACCENT} />
            <StatTile label="objects" value={exported ? asList(exported.objects).length : "—"} accent={C.neon} />
            <StatTile label="links" value={exported ? asList(exported.links).length : "—"} accent={C.gold} />
          </Grid>
          <DataState loading={ioAsync.loading} empty={!exported} emptyLabel="Export the live ontology (types + objects + links) as JSON">
            <JsonView data={exported} max={400} />
          </DataState>
        </PanelCard>
      )}
    </PageShell>
  );
}
