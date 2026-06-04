/**
 * ScienceConsoles — the dedicated capability consoles (P14 #91-104). Surfaces
 * the underworld science engine's ~489 methods grouped into the named domains
 * the platform was asked for: Sonar/Submarine, Meteorites/Asteroids, Buoys/
 * Ocean, ppm/Air-quality, Flight/Aerospace, Frequency/RF/Spectrum, Neuron/
 * Neural, Seismic, Satellites, Clusters, Epidemic-network, Quantum, Materials,
 * Trajectory. Pick a console → see its live methods + runnable examples → run
 * one and see the real engine result. Backed by /v1/sci/* (domains, methods,
 * examples, run). Honest when the engine isn't importable (counts 0 / note).
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle, JsonView } from "@/components/Wave1Kit";
import { apiGet, apiPost, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.purple;

export default function ScienceConsoles() {
  const [domains, setDomains] = useState([]);
  const [sel, setSel] = useState(null);
  const [methods, setMethods] = useState([]);
  const [examples, setExamples] = useState([]);
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const [result, setResult] = useState(null);
  const domAsync = useAsync(); const methAsync = useAsync(); const runAsync = useAsync();

  const load = useCallback(async () => {
    const b = await domAsync.run(() => apiGet("/v1/sci/domains"));
    setDomains(asList(b, "domains", "items"));
  }, [domAsync]);
  useEffect(() => { load(); }, [load]);

  const open = useCallback(async (d) => {
    setSel(d); setResult(null);
    const [m, ex] = await Promise.all([
      methAsync.run(() => apiGet(`/v1/sci/domains/${encodeURIComponent(d.id)}/methods`)),
      apiGet(`/v1/sci/domains/${encodeURIComponent(d.id)}/examples`).catch(() => null),
    ]);
    setMethods(asList(m, "methods", "items"));
    const exs = asList(ex, "examples", "items");
    setExamples(exs);
    if (exs[0]) { setField(exs[0].field || ""); setValue(typeof exs[0].value === "object" ? JSON.stringify(exs[0].value) : String(exs[0].value ?? "")); }
  }, [methAsync]);

  const run = async () => {
    if (!sel) return;
    let v = value.trim(); let parsed = v;
    if (v && (v.startsWith("{") || v.startsWith("[") || /^-?\d/.test(v))) { try { parsed = JSON.parse(v); } catch { /* keep string */ } }
    const b = await runAsync.run(() => apiPost(`/v1/sci/domains/${encodeURIComponent(sel.id)}/run`, { field: field.trim(), value: parsed }));
    setResult(b);
  };

  const totalMethods = domains.reduce((s, d) => s + (d.count || d.method_count || 0), 0);
  const engineUp = totalMethods > 0;

  return (
    <PageShell title="SCIENCE CONSOLES" subtitle="sonar · meteorites · buoys · air · flight · RF · neural · seismic · satellites · clusters · epidemic · quantum · materials · trajectory" accent={ACCENT}
      actions={<Badge color={engineUp ? C.neon : C.red}>{engineUp ? `${totalMethods} LIVE METHODS` : "ENGINE OFFLINE"}</Badge>}>
      {!sel ? (
        <DataState loading={domAsync.loading} error={domAsync.error} empty={!domains.length}
          emptyLabel="Science domains unavailable — the underworld engine isn't importable here (honest state).">
          <Grid min={200}>
            {domains.map((d) => {
              const n = d.count ?? d.method_count ?? 0;
              return (
                <button key={d.id} onClick={() => open(d)}
                  style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit", padding: "16px 16px",
                    borderRadius: 8, border: `1px solid ${C.border}`, background: `${ACCENT}0a`, color: C.textB }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{d.icon || "🔬"}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: ACCENT }}>{d.label}</div>
                  <div style={{ fontSize: 9, color: C.text, margin: "5px 0 8px", lineHeight: 1.5 }}>{d.blurb || d.description}</div>
                  <Badge color={n > 0 ? C.neon : C.text}>{n} methods</Badge>
                </button>
              );
            })}
          </Grid>
        </DataState>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Btn accent={C.text} onClick={() => setSel(null)}>← ALL CONSOLES</Btn>
            <span style={{ fontSize: 22 }}>{sel.icon || "🔬"}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: ACCENT }}>{sel.label}</span>
            <Badge color={ACCENT}>{methods.length} methods</Badge>
          </div>
          <Grid min={140} style={{ marginBottom: 14 }}>
            <StatTile label="methods" value={methods.length} accent={ACCENT} />
            <StatTile label="examples" value={examples.length} accent={C.gold} />
            <StatTile label="domain" value={sel.id} accent={C.neon} />
          </Grid>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <PanelCard title="METHODS" accent={ACCENT}>
              <DataState loading={methAsync.loading} empty={!methods.length}
                emptyLabel="No live methods matched (engine offline or no match) — honest empty.">
                <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                  {methods.map((m, i) => (
                    <button key={i} onClick={() => setField(m.key)} style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                      fontSize: 10, padding: "6px 9px", borderRadius: 4, border: `1px solid ${field === m.key ? ACCENT : C.border}`,
                      background: field === m.key ? `${ACCENT}14` : "rgba(0,0,0,0.2)", color: C.textB }}>
                      <span style={{ fontWeight: 700 }}>{m.key}</span>
                      <div style={{ fontSize: 8, color: C.text }}>{m.doc}</div>
                    </button>
                  ))}
                </div>
              </DataState>
            </PanelCard>
            <PanelCard title="RUN" accent={C.neon}>
              {examples.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 4 }}>EXAMPLES</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {examples.map((ex, i) => (
                      <button key={i} onClick={() => { setField(ex.field || ""); setValue(typeof ex.value === "object" ? JSON.stringify(ex.value) : String(ex.value ?? "")); }}
                        style={{ cursor: "pointer", fontFamily: "inherit", fontSize: 8, padding: "3px 7px", borderRadius: 3,
                          border: `1px solid ${C.border}`, background: "transparent", color: C.gold }}>{ex.field}</button>
                    ))}
                  </div>
                </div>
              )}
              <input value={field} onChange={(e) => setField(e.target.value)} placeholder="field / method key" style={{ ...inputStyle, width: "100%", marginBottom: 6 }} />
              <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="value (number / JSON / text)" style={{ ...inputStyle, width: "100%", marginBottom: 8 }} />
              <Btn accent={C.neon} onClick={run}>EXECUTE</Btn>
              <DataState loading={runAsync.loading} error={runAsync.error} empty={!result} emptyLabel="Run a method to see the real engine result">
                {result && (
                  <div style={{ marginTop: 8 }}>
                    <Badge color={result.status === "ok" ? C.neon : result.status === "unavailable" ? C.gold : C.red}>{result.status || "?"}</Badge>
                    <div style={{ marginTop: 6 }}><JsonView data={result} max={500} /></div>
                  </div>
                )}
              </DataState>
            </PanelCard>
          </div>
        </>
      )}
    </PageShell>
  );
}
