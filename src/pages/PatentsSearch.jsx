import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";

const ACCENT = C.gold;
const Patent = kimiClient.entities.Patent;

// Realistic seed records mirroring the backend patent schema
// (id/title/abstract/assignee/filing_date/status/classification).
const SAMPLES = [
  { id: "US3192570A", title: "Self-bearing roller skate", assignee: "Chicago Roller Skate Co.",
    filing_date: "1963-02-11", status: "EXPIRED", classification: "B62B",
    abstract: "A roller skate having ball-bearing wheels arranged so the skate can pivot freely about a vertical axis." },
  { id: "US4344146A", title: "Optical recording medium having a chalcogenide layer", assignee: "Eastman Kodak Co.",
    filing_date: "1980-05-08", status: "EXPIRED", classification: "G11B",
    abstract: "An optical recording medium comprising a substrate, a reflective layer, and a recording layer of a chalcogenide glass." },
  { id: "US4055768A", title: "Light-emitting diode display structure", assignee: "Hewlett-Packard",
    filing_date: "1976-09-07", status: "EXPIRED", classification: "H01L",
    abstract: "A multi-character LED display with a printed-circuit substrate and a translucent overlay focusing emitted light." },
  { id: "US3987387A", title: "Method of separating solid particles from a fluid stream", assignee: "Dow Chemical Co.",
    filing_date: "1974-06-19", status: "EXPIRED", classification: "B01D",
    abstract: "A centrifugal separator using a tangential inlet and a fluid-bed collection chamber for high-throughput separation." },
  { id: "US10892374B2", title: "Bifacial photovoltaic module with reflective backsheet", assignee: "Project Solar Group",
    filing_date: "2019-03-22", status: "ACTIVE", classification: "H02S",
    abstract: "A bifacial PV module incorporating a microstructured reflective backsheet to recapture rear-incident irradiance and raise yield." },
  { id: "US11456701B2", title: "Distributed energy storage arbitrage controller", assignee: "Hilts Group Australia",
    filing_date: "2020-11-04", status: "ACTIVE", classification: "H02J",
    abstract: "A controller that schedules charge/discharge of distributed batteries against real-time wholesale price signals." },
];

const statusColor = (s) => ({ ACTIVE: C.neon, PENDING: C.gold, EXPIRED: C.text }[s] || C.text);

const btn = (active) => ({
  background: active ? ACCENT + "22" : ACCENT + "11", border: `1px solid ${ACCENT}55`, color: ACCENT,
  fontFamily: "inherit", fontSize: 10, letterSpacing: 2, padding: "7px 14px", borderRadius: 5,
  cursor: "pointer", fontWeight: 700,
});

export default function PatentsSearch() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);

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

  const seed = useCallback(async () => {
    setSeeding(true);
    setError(null);
    try {
      for (const s of SAMPLES) await Patent.create(s);
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setSeeding(false);
    }
  }, [load]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.title, r.abstract, r.assignee, r.id, r.classification]
        .filter(Boolean).some((f) => String(f).toLowerCase().includes(q)));
  }, [rows, query]);

  const empty = !loading && !error && rows.length === 0;

  return (
    <PageShell
      title="PATENTS SEARCH"
      subtitle="FULL-TEXT SEARCH · TITLE · ABSTRACT · ASSIGNEE"
      accent={ACCENT}
      actions={
        <>
          <button onClick={seed} disabled={seeding} style={btn(false)}>
            {seeding ? "◌ SEEDING" : "+ SEED SAMPLES"}
          </button>
          <button onClick={load} disabled={loading} style={btn(false)}>
            {loading ? "◌ SYNC" : "↻ REFRESH"}
          </button>
        </>
      }
    >
      <Grid min={170} style={{ marginBottom: 14 }}>
        <StatTile label="Indexed Patents" value={rows.length} accent={ACCENT} />
        <StatTile label="Matching Query" value={results.length} accent={C.blue} sub={query ? `"${query}"` : "all"} />
        <StatTile label="Active" value={rows.filter((r) => r.status === "ACTIVE").length} accent={C.neon} />
        <StatTile label="Expired" value={rows.filter((r) => r.status === "EXPIRED").length} accent={C.text} />
      </Grid>

      <div style={{ marginBottom: 14 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search patents by title, abstract, assignee, classification…"
          style={{
            width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)",
            border: `1px solid ${ACCENT}44`, borderRadius: 6, color: C.textB, fontFamily: "inherit",
            fontSize: 12, padding: "10px 14px", letterSpacing: 1,
          }}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 380px" : "1fr", gap: 14, alignItems: "start" }}>
        <PanelCard title="RESULTS" accent={ACCENT} right={<Badge color={ACCENT}>{results.length}</Badge>}>
          <DataState
            loading={loading} error={error} empty={empty}
            emptyLabel="No patents indexed yet — use SEED SAMPLES to populate the corpus."
          >
            {results.length === 0 ? (
              <div style={{ color: C.text, fontSize: 10, padding: 8 }}>No patents match this query.</div>
            ) : (
              <Grid min={260} gap={10}>
                {results.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelected(r)}
                    style={{
                      textAlign: "left", background: selected?.id === r.id ? ACCENT + "14" : "rgba(0,0,0,0.3)",
                      border: `1px solid ${selected?.id === r.id ? ACCENT + "88" : C.border}`, borderRadius: 6,
                      padding: "10px 12px", cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>{r.id}</span>
                      <Badge color={statusColor(r.status)}>{r.status || "—"}</Badge>
                    </div>
                    <div style={{ fontSize: 12, color: C.textB, fontWeight: 700, marginTop: 6, lineHeight: 1.3 }}>{r.title}</div>
                    <div style={{ fontSize: 9, color: ACCENT, marginTop: 6 }}>{r.assignee || "Unknown assignee"}</div>
                    <div style={{ fontSize: 8, color: C.text, marginTop: 2 }}>
                      Filed {r.filing_date || "—"} · {r.classification || "—"}
                    </div>
                  </button>
                ))}
              </Grid>
            )}
          </DataState>
        </PanelCard>

        {selected && (
          <PanelCard
            title="PATENT DETAIL"
            accent={ACCENT}
            right={
              <button onClick={() => setSelected(null)} style={{ ...btn(false), padding: "3px 8px", fontSize: 8 }}>✕ CLOSE</button>
            }
          >
            <div style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>{selected.id}</div>
            <div style={{ fontSize: 14, color: C.textB, fontWeight: 700, marginTop: 6, lineHeight: 1.3 }}>{selected.title}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <Badge color={statusColor(selected.status)}>{selected.status || "—"}</Badge>
              <Badge color={C.blue}>{selected.classification || "—"}</Badge>
            </div>
            <dl style={{ margin: "12px 0 0", fontSize: 10 }}>
              {[
                ["Assignee", selected.assignee],
                ["Filing Date", selected.filing_date],
                ["Classification", selected.classification],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", gap: 8, padding: "4px 0", borderTop: `1px solid ${C.border}` }}>
                  <dt style={{ color: C.text, width: 110, flexShrink: 0 }}>{k}</dt>
                  <dd style={{ margin: 0, color: C.textB }}>{v || "—"}</dd>
                </div>
              ))}
            </dl>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 4 }}>ABSTRACT</div>
              <p style={{ margin: 0, fontSize: 10, color: C.textB, lineHeight: 1.6 }}>{selected.abstract || "No abstract on record."}</p>
            </div>
          </PanelCard>
        )}
      </div>
    </PageShell>
  );
}
