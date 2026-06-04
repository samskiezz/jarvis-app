/**
 * TechTree — the live science capability tree.
 *
 * Was a static 8-node graph; now renders the REAL method registry exposed by
 * the underworld science engine via /functions/science/methods
 * ({key, domain, doc, engine, aliases}). Domains are the branches; each method
 * is a leaf you can select to read its description and (optionally) run it with
 * a field+value through /functions/science/run. This is the actual ~489-method
 * capability surface, not a mock. Apex/science accent: purple.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle, JsonView } from "@/components/Wave1Kit";
import { apiGet, apiPost, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.purple;

export default function TechTree() {
  const [methods, setMethods] = useState([]);
  const [unavailable, setUnavailable] = useState(false);
  const [domain, setDomain] = useState(null);
  const [selected, setSelected] = useState(null);
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const [runResult, setRunResult] = useState(null);
  const listAsync = useAsync();
  const runAsync = useAsync();

  const load = useCallback(async () => {
    const body = await listAsync.run(() => apiGet("/functions/science/methods"));
    if (body && body.status === "unavailable") { setUnavailable(true); setMethods([]); return; }
    const list = asList(body);
    setMethods(list);
    setUnavailable(false);
    if (list.length && !domain) setDomain(list[0].domain);
  }, [listAsync, domain]);

  useEffect(() => { load(); }, []);

  const byDomain = useMemo(() => {
    const m = {};
    for (const x of methods) (m[x.domain] = m[x.domain] || []).push(x);
    return m;
  }, [methods]);
  const domains = useMemo(() => Object.keys(byDomain).sort(), [byDomain]);
  const domainMethods = domain ? (byDomain[domain] || []) : [];

  const run = async () => {
    if (!selected) return;
    const f = field.trim() || selected.key;
    let v = value.trim();
    let parsed = v;
    if (v && (v.startsWith("{") || v.startsWith("[") || /^-?\d/.test(v))) { try { parsed = JSON.parse(v); } catch { /* keep string */ } }
    const body = await runAsync.run(() => apiPost("/functions/science/run", { field: f, value: parsed }));
    setRunResult(body);
  };

  return (
    <PageShell title="TECH TREE" subtitle="live science method registry · domains · runnable capabilities" accent={ACCENT}
      actions={<Badge color={ACCENT}>{methods.length} METHODS · {domains.length} DOMAINS</Badge>}>
      {unavailable ? (
        <PanelCard title="SCIENCE ENGINE" accent={C.red}>
          <div style={{ fontSize: 11, color: C.textB, padding: 10, lineHeight: 1.7 }}>
            The underworld science registry isn't importable in this environment, so the live method
            tree is unavailable. This is the honest state — no mock tree is shown. The bridge auto-populates
            once the engine is co-located/registered.
          </div>
        </PanelCard>
      ) : (
        <>
          <Grid min={150} style={{ marginBottom: 14 }}>
            <StatTile label="domains" value={domains.length} accent={ACCENT} />
            <StatTile label="methods" value={methods.length} accent={C.neon} />
            <StatTile label="in domain" value={domainMethods.length} accent={C.gold} sub={domain || "—"} />
          </Grid>

          <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 1fr", gap: 12 }}>
            <PanelCard title="DOMAINS" accent={ACCENT}>
              <DataState loading={listAsync.loading} error={listAsync.error} empty={!domains.length} emptyLabel="No methods">
                <div style={{ maxHeight: 460, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                  {domains.map((d) => (
                    <button key={d} onClick={() => { setDomain(d); setSelected(null); }}
                      style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit", fontSize: 10,
                        padding: "6px 8px", borderRadius: 4, border: "none",
                        background: d === domain ? `${ACCENT}22` : "transparent",
                        color: d === domain ? ACCENT : C.text, display: "flex", justifyContent: "space-between" }}>
                      <span>{d}</span><span style={{ opacity: 0.7 }}>{byDomain[d].length}</span>
                    </button>
                  ))}
                </div>
              </DataState>
            </PanelCard>

            <PanelCard title={`METHODS · ${domain || ""}`} accent={C.neon}>
              <div style={{ maxHeight: 460, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                {domainMethods.map((m) => (
                  <button key={m.key} onClick={() => { setSelected(m); setField(m.key); setRunResult(null); }}
                    style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit", fontSize: 10,
                      padding: "7px 9px", borderRadius: 4, border: `1px solid ${selected?.key === m.key ? ACCENT : C.border}`,
                      background: selected?.key === m.key ? `${ACCENT}14` : "rgba(0,0,0,0.2)", color: C.textB }}>
                    <div style={{ fontWeight: 700, color: selected?.key === m.key ? ACCENT : C.textB }}>{m.key}</div>
                    <div style={{ fontSize: 8, color: C.text, marginTop: 2 }}>{m.doc}</div>
                  </button>
                ))}
              </div>
            </PanelCard>

            <PanelCard title="CAPABILITY" accent={C.gold}>
              {selected ? (
                <div style={{ fontSize: 10, color: C.textB, lineHeight: 1.7 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: ACCENT }}>{selected.key}</div>
                  <div style={{ marginTop: 4 }}><Badge color={ACCENT}>{selected.domain}</Badge> <Badge color={C.gold}>{selected.engine}</Badge></div>
                  <div style={{ marginTop: 8, color: C.text }}>{selected.doc}</div>
                  {selected.aliases?.length > 1 && (
                    <div style={{ marginTop: 6, fontSize: 8, color: C.text }}>aliases: {selected.aliases.join(", ")}</div>
                  )}
                  <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                    <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 4 }}>RUN (field / value)</div>
                    <input value={field} onChange={(e) => setField(e.target.value)} placeholder="field"
                      style={{ ...inputStyle, width: "100%", marginBottom: 5 }} />
                    <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="value (number / JSON / text)"
                      style={{ ...inputStyle, width: "100%", marginBottom: 6 }} />
                    <Btn accent={C.gold} onClick={run}>EXECUTE</Btn>
                    <DataState loading={runAsync.loading} error={runAsync.error} empty={!runResult} emptyLabel="">
                      <div style={{ marginTop: 8 }}><JsonView data={runResult} /></div>
                    </DataState>
                  </div>
                </div>
              ) : <div style={{ color: C.text, fontSize: 10, padding: 10 }}>Select a method to inspect / run it</div>}
            </PanelCard>
          </div>
        </>
      )}
    </PageShell>
  );
}
