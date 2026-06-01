import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";

const ACCENT = C.gold;
const Patent = kimiClient.entities.Patent;

// A realistic batch the "ingest sample batch" action streams into the corpus.
const BATCH = [
  { title: "Self-bearing roller skate", assignee: "Chicago Roller Skate Co.", classification: "B62B",
    abstract: "A roller skate having ball-bearing wheels arranged so the skate can pivot freely about a vertical axis." },
  { title: "Optical recording medium having a chalcogenide layer", assignee: "Eastman Kodak Co.", classification: "G11B",
    abstract: "An optical recording medium comprising a substrate, a reflective layer, and a recording layer of a chalcogenide glass." },
  { title: "Light-emitting diode display structure", assignee: "Hewlett-Packard", classification: "H01L",
    abstract: "A multi-character LED display with a printed-circuit substrate and a translucent overlay focusing emitted light." },
  { title: "Distributed energy storage arbitrage controller", assignee: "Hilts Group Australia", classification: "H02J",
    abstract: "A controller that schedules charge/discharge of distributed batteries against real-time wholesale price signals." },
  { title: "Bifacial photovoltaic module with reflective backsheet", assignee: "Project Solar Group", classification: "H02S",
    abstract: "A bifacial PV module incorporating a microstructured reflective backsheet to recapture rear-incident irradiance." },
];

const blankForm = { title: "", abstract: "", assignee: "", classification: "" };

const input = {
  background: "rgba(0,0,0,0.4)", border: `1px solid ${ACCENT}33`, borderRadius: 5, color: C.textB,
  fontFamily: "inherit", fontSize: 10, padding: "6px 8px", boxSizing: "border-box", width: "100%",
};

const btn = {
  background: ACCENT + "11", border: `1px solid ${ACCENT}55`, color: ACCENT, fontFamily: "inherit",
  fontSize: 10, letterSpacing: 2, padding: "7px 14px", borderRadius: 5, cursor: "pointer", fontWeight: 700,
};

const newId = () => `PAT-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1e4)}`;

export default function PatentIngest() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(blankForm);
  // Append-only session log of ingest events (most recent first).
  const [log, setLog] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await Patent.list();
      setRows(Array.isArray(res) ? res : []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pushLog = useCallback((entry) => {
    setLog((prev) => [{ at: new Date().toISOString(), ...entry }, ...prev].slice(0, 60));
  }, []);

  const ingest = useCallback(async (payload) => {
    const record = {
      id: newId(),
      title: payload.title.trim(),
      abstract: payload.abstract?.trim() || "",
      assignee: payload.assignee?.trim() || "Unassigned",
      classification: payload.classification?.trim() || "—",
      status: "PENDING",
      filing_date: new Date().toISOString().slice(0, 10),
    };
    const created = await Patent.create(record);
    pushLog({ id: created?.id || record.id, title: record.title, assignee: record.assignee, ok: true });
    return created;
  }, [pushLog]);

  const submit = useCallback(async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await ingest(form);
      setForm(blankForm);
      await load();
    } catch (err) {
      setError(err);
      pushLog({ id: "—", title: form.title, assignee: form.assignee, ok: false });
    } finally {
      setBusy(false);
    }
  }, [form, ingest, load, pushLog]);

  const ingestBatch = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      for (const item of BATCH) await ingest(item);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }, [ingest, load]);

  const ingestedThisSession = useMemo(() => log.filter((l) => l.ok).length, [log]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <PageShell
      title="PATENT INGEST"
      subtitle="INGESTION CONSOLE · STREAM RECORDS INTO THE PATENT CORPUS"
      accent={ACCENT}
      actions={
        <>
          <button onClick={ingestBatch} disabled={busy} style={btn}>{busy ? "◌ INGESTING" : "⇊ INGEST SAMPLE BATCH"}</button>
          <button onClick={load} disabled={loading} style={btn}>{loading ? "◌ SYNC" : "↻ REFRESH"}</button>
        </>
      }
    >
      <Grid min={170} style={{ marginBottom: 14 }}>
        <StatTile label="Total In Corpus" value={loading ? "…" : rows.length} accent={ACCENT} sub="Patent entities" />
        <StatTile label="Ingested (session)" value={ingestedThisSession} accent={C.neon} sub="this console" />
        <StatTile label="Pending Review" value={rows.filter((r) => r.status === "PENDING").length} accent={C.blue} />
        <StatTile label="Log Events" value={log.length} accent={C.purple} sub="append-only" />
      </Grid>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,1fr) minmax(280px,1fr)", gap: 14, alignItems: "start" }}>
        <PanelCard title="INGEST A PATENT" accent={ACCENT}>
          <form onSubmit={submit}>
            <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>TITLE *
              <input style={input} value={form.title} onChange={set("title")} required placeholder="Patent title" /></label>
            <div style={{ height: 10 }} />
            <Grid min={150} gap={10}>
              <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>ASSIGNEE
                <input style={input} value={form.assignee} onChange={set("assignee")} placeholder="Org / individual" /></label>
              <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>CLASSIFICATION (CPC)
                <input style={input} value={form.classification} onChange={set("classification")} placeholder="e.g. H02S" /></label>
            </Grid>
            <label style={{ fontSize: 8, color: C.text, letterSpacing: 1, display: "block", marginTop: 10 }}>ABSTRACT
              <textarea style={{ ...input, minHeight: 72, resize: "vertical" }} value={form.abstract} onChange={set("abstract")} placeholder="Technical abstract…" /></label>
            <button type="submit" disabled={busy || !form.title.trim()} style={{ ...btn, marginTop: 10 }}>
              {busy ? "◌ INGESTING" : "⇲ INGEST RECORD"}
            </button>
          </form>
          {error && <div style={{ marginTop: 10, color: C.red, fontSize: 9 }}>⚠ {String(error.message || error)}</div>}
        </PanelCard>

        <PanelCard title="INGESTION LOG" accent={C.neon} right={<Badge color={C.neon}>{log.length}</Badge>}>
          {log.length === 0 ? (
            <div style={{ color: C.text, fontSize: 10, padding: 8 }}>
              No ingest events yet this session. Submit a record or run the sample batch.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 6, maxHeight: 360, overflowY: "auto" }}>
              {log.map((l, i) => (
                <div key={i} style={{
                  display: "flex", gap: 8, alignItems: "center", padding: "6px 8px",
                  background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 5,
                }}>
                  <span style={{ fontSize: 8, color: l.ok ? C.neon : C.red }}>{l.ok ? "●" : "✕"}</span>
                  <span style={{ fontSize: 8, color: C.text, whiteSpace: "nowrap" }}>{l.at.slice(11, 19)}</span>
                  <span style={{ fontSize: 9, color: C.textB, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.title}</span>
                  <span style={{ fontSize: 8, color: ACCENT, whiteSpace: "nowrap" }}>{l.id}</span>
                </div>
              ))}
            </div>
          )}
        </PanelCard>
      </div>

      <div style={{ marginTop: 14 }}>
        <PanelCard title="RECENT IN CORPUS" accent={ACCENT}>
          <DataState loading={loading} error={null} empty={!loading && rows.length === 0} emptyLabel="Corpus empty — ingest a record above.">
            <div style={{ display: "grid", gap: 6, maxHeight: 240, overflowY: "auto" }}>
              {rows.slice(-12).reverse().map((r) => (
                <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 9, padding: "4px 6px", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: ACCENT, whiteSpace: "nowrap" }}>{r.id}</span>
                  <span style={{ color: C.textB, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
                  <span style={{ color: C.text }}>{r.assignee || "—"}</span>
                  <Badge color={C.blue}>{r.classification || "—"}</Badge>
                </div>
              ))}
            </div>
          </DataState>
        </PanelCard>
      </div>
    </PageShell>
  );
}
