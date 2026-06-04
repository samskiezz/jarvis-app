/**
 * SecondBrain — the living, AI-first knowledge vault (our real-store answer to
 * the markdown-only "obsidian-second-brain" repos). One surface over the
 * /v1/brain API:
 *   • NOTES    — wiki notes with [[wikilinks]] + backlinks, capture, daily, catalog
 *   • RESEARCH — key-less web research dossier + ingest (self-rewriting notes) +
 *                reconcile contradictions + synthesize cross-note patterns
 *   • PEOPLE   — tiered CRM (stub→moderate→full) with cited observations
 *   • HEALTH   — vault audit (orphans/stale/gaps/contradictions) + heal
 *   • THINK    — challenge / panel / connect / emerge (retrieval-grounded)
 *
 * Backed by the real ontology graph + vector index, so every note also feeds
 * search and link analysis — which the markdown vaults can't do.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle, JsonView, Tabs } from "@/components/Wave1Kit";
import { apiGet, apiPost, qs, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.purple;

function Notes() {
  const [notes, setNotes] = useState([]);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [sel, setSel] = useState(null);
  const [backs, setBacks] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [title, setTitle] = useState(""); const [body, setBody] = useState("");
  const listAsync = useAsync(); const saveAsync = useAsync();

  const load = useCallback(async () => {
    const b = await listAsync.run(() => apiGet(`/v1/brain/notes${qs({ q, kind, limit: 100 })}`));
    setNotes(asList(b, "notes", "items"));
    const cat = await apiGet("/v1/brain/catalog").catch(() => null); if (cat) setCatalog(cat);
  }, [listAsync, q, kind]);
  useEffect(() => { load(); }, [load]);

  const open = async (n) => { setSel(n); const b = await apiGet(`/v1/brain/notes/${encodeURIComponent(n.title || n.id)}/backlinks`).catch(() => null); setBacks(asList(b, "notes", "backlinks", "items")); };
  const save = async () => { if (!title.trim()) return; await saveAsync.run(() => apiPost("/v1/brain/notes", { kind: kind || "concept", title: title.trim(), body_md: body })); setTitle(""); setBody(""); load(); };
  const capture = async () => { if (!body.trim()) return; await apiPost("/v1/brain/capture", { text: body }); setBody(""); load(); };

  const counts = catalog?.counts || {};
  return (
    <>
      <Grid min={120} style={{ marginBottom: 12 }}>
        <StatTile label="notes" value={notes.length} accent={ACCENT} />
        {Object.entries(counts).slice(0, 5).map(([k, v]) => <StatTile key={k} label={k} value={v} accent={C.gold} />)}
        <StatTile label="orphans" value={asList(catalog, "orphans").length} accent={C.red} />
      </Grid>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 12 }}>
        <PanelCard title="VAULT" accent={ACCENT} right={<span style={{ display: "flex", gap: 5 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search" style={{ ...inputStyle, width: 110 }} onKeyDown={(e) => e.key === "Enter" && load()} />
        </span>}>
          <div style={{ display: "flex", gap: 5, marginBottom: 8, flexWrap: "wrap" }}>
            {["", "concept", "entity", "project", "daily", "synthesis", "decision", "task"].map((k) => (
              <button key={k || "all"} onClick={() => setKind(k)} style={{ cursor: "pointer", fontFamily: "inherit", fontSize: 8,
                padding: "3px 7px", borderRadius: 3, border: `1px solid ${kind === k ? ACCENT : C.border}`,
                background: kind === k ? `${ACCENT}1a` : "transparent", color: kind === k ? ACCENT : C.text }}>{k || "all"}</button>
            ))}
          </div>
          <DataState loading={listAsync.loading} empty={!notes.length} emptyLabel="No notes — create or capture below.">
            <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
              {notes.map((n, i) => (
                <button key={i} onClick={() => open(n)} style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit", fontSize: 10,
                  padding: "6px 9px", borderRadius: 4, border: `1px solid ${sel?.id === n.id ? ACCENT : C.border}`,
                  background: sel?.id === n.id ? `${ACCENT}14` : "rgba(0,0,0,0.2)", color: C.textB }}>
                  <span style={{ fontWeight: 700 }}>{n.title}</span> <Badge color={C.gold}>{n.kind}</Badge>
                </button>
              ))}
            </div>
          </DataState>
          <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="note title" style={{ ...inputStyle, width: "100%", marginBottom: 5 }} />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="body — use [[wikilinks]]" style={{ ...inputStyle, width: "100%", fontFamily: "monospace", resize: "vertical" }} />
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <Btn accent={ACCENT} onClick={save}>SAVE NOTE</Btn>
              <Btn accent={C.gold} onClick={capture}>QUICK CAPTURE</Btn>
            </div>
          </div>
        </PanelCard>
        <PanelCard title={sel ? sel.title : "NOTE"} accent={C.neon}>
          {sel ? (
            <div style={{ fontSize: 10, color: C.textB }}>
              <div style={{ marginBottom: 6 }}><Badge color={C.gold}>{sel.kind}</Badge> {sel.confidence != null && <Badge color={C.neon}>conf {sel.confidence}</Badge>}</div>
              <pre style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, maxHeight: 220, overflow: "auto", color: C.textB }}>{sel.body_md || sel.body}</pre>
              <div style={{ fontSize: 8, color: C.text, marginTop: 6 }}>
                created {sel.created_ts ? new Date(sel.created_ts).toLocaleString() : "—"} · learned {sel.learned_ts ? new Date(sel.learned_ts).toLocaleString() : "—"}
              </div>
              <div style={{ marginTop: 8, fontSize: 8, color: C.text, letterSpacing: 1 }}>BACKLINKS ({backs.length})</div>
              {backs.map((b, i) => <div key={i} style={{ fontSize: 10, color: C.neon }}>← {b.title}</div>)}
            </div>
          ) : <div style={{ color: C.text, fontSize: 10, padding: 10 }}>Select a note</div>}
        </PanelCard>
      </div>
    </>
  );
}

function Research() {
  const [topic, setTopic] = useState(""); const [dossier, setDossier] = useState(null);
  const [src, setSrc] = useState(""); const [ingestRes, setIngestRes] = useState(null);
  const [recTitle, setRecTitle] = useState(""); const [recRes, setRecRes] = useState(null);
  const rAsync = useAsync(); const iAsync = useAsync(); const cAsync = useAsync(); const sAsync = useAsync();
  const research = async () => { const b = await rAsync.run(() => apiPost("/v1/brain/research", { topic })); setDossier(b); };
  const ingest = async () => { const b = await iAsync.run(() => apiPost("/v1/brain/ingest", { source: src })); setIngestRes(b); };
  const reconcile = async () => { const b = await cAsync.run(() => apiPost("/v1/brain/reconcile", { title: recTitle })); setRecRes(b); };
  const synthesize = async () => { const b = await sAsync.run(() => apiPost("/v1/brain/synthesize", { topic })); setRecRes(b); };
  const findings = dossier ? asList(dossier, "findings") : [];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <PanelCard title="KEY-LESS WEB RESEARCH" accent={ACCENT} right={<Badge color={C.gold}>wikipedia · HN · arXiv · crossref · DDG</Badge>}>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="research topic" style={{ ...inputStyle, flex: 1 }} />
          <Btn accent={ACCENT} onClick={research}>RESEARCH</Btn>
          <Btn accent={C.gold} onClick={synthesize}>SYNTHESIZE</Btn>
        </div>
        <DataState loading={rAsync.loading} error={rAsync.error} empty={!dossier} emptyLabel="Research a topic — aggregates free public sources (honest-empty offline)">
          <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {findings.map((f, i) => (
              <div key={i} style={{ fontSize: 10, padding: "5px 7px", borderLeft: `2px solid ${ACCENT}`, background: `${ACCENT}0a` }}>
                <Badge color={C.gold}>{f.source}</Badge> <span style={{ color: C.textB }}>{f.title}</span>
                <div style={{ fontSize: 8, color: C.text }}>{f.snippet}</div>
              </div>
            ))}
            {!findings.length && <div style={{ fontSize: 9, color: C.text }}>{dossier?.note || "no findings (sources unreachable)"}</div>}
          </div>
        </DataState>
      </PanelCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <PanelCard title="INGEST (self-rewriting notes)" accent={C.neon}>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={src} onChange={(e) => setSrc(e.target.value)} placeholder="URL or pasted text" style={{ ...inputStyle, flex: 1 }} />
            <Btn accent={C.neon} onClick={ingest}>INGEST</Btn>
          </div>
          <DataState loading={iAsync.loading} empty={!ingestRes} emptyLabel="Ingest a source → it rewrites the relevant notes (two-output rule)">
            <div style={{ marginTop: 8, fontSize: 10, color: C.textB }}>
              <Badge color={C.neon}>created {asList(ingestRes, "created").length}</Badge> <Badge color={C.gold}>updated {asList(ingestRes, "updated").length}</Badge>
              <div style={{ marginTop: 6 }}><JsonView data={ingestRes} max={250} /></div>
            </div>
          </DataState>
        </PanelCard>
        <PanelCard title="RECONCILE (bi-temporal)" accent={C.gold}>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={recTitle} onChange={(e) => setRecTitle(e.target.value)} placeholder="note title to reconcile" style={{ ...inputStyle, flex: 1 }} />
            <Btn accent={C.gold} onClick={reconcile}>RECONCILE</Btn>
          </div>
          <DataState loading={cAsync.loading || sAsync.loading} empty={!recRes} emptyLabel="Reconcile a note's contradictions across time">
            <div style={{ marginTop: 8 }}><JsonView data={recRes} max={300} /></div>
          </DataState>
        </PanelCard>
      </div>
    </div>
  );
}

function People() {
  const [people, setPeople] = useState([]); const [sel, setSel] = useState(null);
  const [name, setName] = useState(""); const [ctx, setCtx] = useState("");
  const aAsync = useAsync();
  const load = useCallback(async () => { const b = await aAsync.run(() => apiGet("/v1/brain/people")); setPeople(asList(b, "people", "items")); }, [aAsync]);
  useEffect(() => { load(); }, [load]);
  const open = async (p) => { const b = await apiGet(`/v1/brain/people/${encodeURIComponent(p.person || p.name)}`).catch(() => null); setSel(b || p); };
  const mention = async () => { if (!name.trim()) return; await apiPost("/v1/brain/mention", { person: name.trim(), context: ctx }); setCtx(""); load(); };
  const tierColor = (t) => (t === "full" ? C.neon : t === "moderate" ? C.gold : C.text);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 12 }}>
      <PanelCard title="PEOPLE CRM" accent={ACCENT}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="person" style={inputStyle} />
          <input value={ctx} onChange={(e) => setCtx(e.target.value)} placeholder="observation / context" style={inputStyle} />
          <Btn accent={ACCENT} onClick={mention}>+ MENTION</Btn>
        </div>
        <DataState loading={aAsync.loading} empty={!people.length} emptyLabel="No people — add a mention (tiers up at 3 and 8 mentions).">
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {people.map((p, i) => (
              <button key={i} onClick={() => open(p)} style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit", fontSize: 10,
                padding: "6px 9px", borderRadius: 4, border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.2)", color: C.textB,
                display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700 }}>{p.person || p.name}</span>
                <span><Badge color={tierColor(p.tier)}>{p.tier}</Badge> <span style={{ color: C.text }}>{p.mention_count ?? p.mentions ?? 0}</span></span>
              </button>
            ))}
          </div>
        </DataState>
      </PanelCard>
      <PanelCard title={sel ? `PROFILE · ${sel.person || sel.name}` : "PROFILE"} accent={C.neon}>
        {sel ? <JsonView data={sel} max={500} /> : <div style={{ color: C.text, fontSize: 10, padding: 10 }}>Select a person</div>}
      </PanelCard>
    </div>
  );
}

function Health() {
  const [h, setH] = useState(null); const a = useAsync();
  useEffect(() => { (async () => { const b = await a.run(() => apiGet("/v1/brain/health")); setH(b); })(); }, []);
  const counts = h?.counts || {};
  return (
    <PanelCard title="VAULT HEALTH" accent={ACCENT} right={h?.score != null && <Badge color={h.score > 0.7 ? C.neon : C.gold}>score {Number(h.score).toFixed(2)}</Badge>}>
      <DataState loading={a.loading} empty={!h} emptyLabel="No health data">
        <Grid min={120} style={{ marginBottom: 10 }}>
          {Object.entries(counts).map(([k, v]) => <StatTile key={k} label={k} value={v} accent={k.includes("orphan") || k.includes("stale") || k.includes("contra") ? C.red : ACCENT} />)}
        </Grid>
        {["orphans", "stale", "gaps", "contradictions"].map((key) => {
          const arr = asList(h, key); if (!arr.length) return null;
          return (
            <div key={key} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 8, color: C.red, letterSpacing: 1 }}>{key.toUpperCase()} ({arr.length})</div>
              <div style={{ fontSize: 9, color: C.text }}>{arr.slice(0, 12).map((x) => (typeof x === "string" ? x : x.title || x.id)).join(" · ")}</div>
            </div>
          );
        })}
      </DataState>
    </PanelCard>
  );
}

function Think() {
  const [mode, setMode] = useState("challenge"); const [input, setInput] = useState(""); const [b, setB] = useState(""); const [res, setRes] = useState(null);
  const a = useAsync();
  const run = async () => {
    const body = mode === "connect" ? { a: input, b } : mode === "emerge" ? { days: 30 } : mode === "panel" ? { decision: input } : { idea: input };
    const r = await a.run(() => apiPost(`/v1/brain/think/${mode}`, body)); setRes(r);
  };
  return (
    <PanelCard title="THINKING TOOLS (retrieval-grounded)" accent={ACCENT}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {["challenge", "panel", "connect", "emerge"].map((m) => (
          <Btn key={m} accent={mode === m ? ACCENT : C.text} style={mode === m ? {} : { opacity: 0.6 }} onClick={() => { setMode(m); setRes(null); }}>{m.toUpperCase()}</Btn>
        ))}
      </div>
      {mode !== "emerge" && <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={mode === "connect" ? "topic A" : mode === "panel" ? "decision" : "idea"} style={{ ...inputStyle, width: "100%", marginBottom: 6 }} />}
      {mode === "connect" && <input value={b} onChange={(e) => setB(e.target.value)} placeholder="topic B" style={{ ...inputStyle, width: "100%", marginBottom: 6 }} />}
      <Btn accent={ACCENT} onClick={run}>RUN</Btn>
      <DataState loading={a.loading} error={a.error} empty={!res} emptyLabel="The vault reasons over your own notes (cited, never fabricated).">
        <div style={{ marginTop: 8 }}><JsonView data={res} max={500} /></div>
      </DataState>
    </PanelCard>
  );
}

export default function SecondBrain() {
  const [tab, setTab] = useState("notes");
  return (
    <PageShell title="SECOND BRAIN" subtitle="living knowledge vault · graph + vector backed · beats markdown-only obsidian vaults" accent={ACCENT}
      actions={<Tabs tabs={[{ id: "notes", label: "NOTES" }, { id: "research", label: "RESEARCH" }, { id: "people", label: "PEOPLE" }, { id: "health", label: "HEALTH" }, { id: "think", label: "THINK" }]} active={tab} onChange={setTab} accent={ACCENT} />}>
      {tab === "notes" && <Notes />}
      {tab === "research" && <Research />}
      {tab === "people" && <People />}
      {tab === "health" && <Health />}
      {tab === "think" && <Think />}
    </PageShell>
  );
}
