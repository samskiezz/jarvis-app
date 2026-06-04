/**
 * ScienceConsole — surfaces the underworld 489-method science registry.
 *
 * GETs /functions/science/methods (the keyword->callable registry, grouped by
 * domain), lets the operator search + select one, then POSTs
 * /functions/science/run to execute it and renders the returned dict (pretty
 * JSON + a trivial inline bar chart for any numeric data). Degrades gracefully
 * when the science engine isn't importable in the backend process.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";
import { PageShell, PanelCard, StatTile, DataState, Badge } from "@/components/PageKit";

const ACCENT = C.purple;

const inputStyle = {
  background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`, borderRadius: 4,
  color: C.textB, padding: "7px 9px", fontSize: 10, fontFamily: "inherit", outline: "none",
  width: "100%", boxSizing: "border-box",
};

// Pull numeric scalars out of a result for a trivial inline bar chart.
function numericPairs(obj) {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj).filter(
    ([, v]) => typeof v === "number" && Number.isFinite(v)
  );
}

function MiniChart({ pairs }) {
  const max = Math.max(...pairs.map(([, v]) => Math.abs(v)), 1e-12);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
      {pairs.map(([k, v]) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 8, color: C.text, width: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k}</span>
          <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, (Math.abs(v) / max) * 100)}%`, height: "100%", background: ACCENT, transition: "width .3s" }} />
          </div>
          <span style={{ fontSize: 8, color: C.textB, width: 110, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {typeof v === "number" ? (Math.abs(v) < 1e-3 || Math.abs(v) >= 1e6 ? v.toExponential(3) : v.toPrecision(6)) : String(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ScienceConsole() {
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unavailable, setUnavailable] = useState(null);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [paramsText, setParamsText] = useState("");
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(null);
    try {
      const body = await kimiClient.request("/functions/science/methods");
      if (Array.isArray(body)) {
        setMethods(body);
      } else if (body && body.status === "unavailable") {
        setMethods([]);
        setUnavailable(body.reason || "science engine not importable");
      } else if (body && body.status === "error") {
        setError(new Error(body.error || "registry error"));
      } else {
        setMethods([]);
      }
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return methods;
    return methods.filter((m) =>
      m.key.toLowerCase().includes(q) ||
      m.domain.toLowerCase().includes(q) ||
      (m.doc || "").toLowerCase().includes(q) ||
      (m.engine || "").toLowerCase().includes(q) ||
      (m.aliases || []).some((a) => a.toLowerCase().includes(q))
    );
  }, [methods, query]);

  const grouped = useMemo(() => {
    const by = {};
    for (const m of filtered) (by[m.domain] = by[m.domain] || []).push(m);
    return Object.entries(by).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const select = (m) => {
    setSelected(m);
    setResult(null);
    setRunError(null);
    setParamsText("");
  };

  const run = async () => {
    if (!selected) return;
    setRunning(true);
    setRunError(null);
    setResult(null);
    let params = null;
    const raw = paramsText.trim();
    if (raw) {
      try {
        params = JSON.parse(raw);
      } catch {
        setRunError(new Error("Params must be valid JSON (e.g. {\"seed\": 1})"));
        setRunning(false);
        return;
      }
    }
    try {
      const body = await kimiClient.request("/functions/science/run", {
        method: "POST",
        body: JSON.stringify({ field: selected.key, params }),
      });
      setResult(body);
      if (body && body.status === "error") setRunError(new Error(body.error || "run error"));
    } catch (e) {
      setRunError(e);
    } finally {
      setRunning(false);
    }
  };

  const resultData = result && (result.data || (result.status === "ok" ? result : null));
  const pairs = numericPairs(resultData);

  return (
    <PageShell
      title="SCIENCE CONSOLE"
      subtitle="UNDERWORLD METHOD REGISTRY — SONAR · METEOR · PPM · BUOYS · FLIGHT · RF · NEURONS · SEISMIC · QUANTUM · MATERIALS"
      accent={ACCENT}
      actions={
        <button onClick={load}
          style={{ ...inputStyle, width: "auto", cursor: "pointer", color: ACCENT, borderColor: ACCENT + "55" }}>↻ REFRESH</button>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        <StatTile label="Methods" value={methods.length} accent={ACCENT} />
        <StatTile label="Domains" value={new Set(methods.map((m) => m.domain)).size} accent={C.blue} />
        <StatTile label="Showing" value={filtered.length} accent={C.neon} />
        <StatTile label="Engine" value={unavailable ? "OFFLINE" : (methods.length ? "ONLINE" : "—")}
          accent={unavailable ? C.red : C.neon} />
      </div>

      {unavailable && (
        <div style={{ marginBottom: 14, padding: "10px 12px", border: `1px solid ${C.red}44`,
          background: C.redD, borderRadius: 5, fontSize: 10, color: C.textB }}>
          ⚠ SCIENCE ENGINE UNAVAILABLE — {unavailable}. The APEX backend is up but the underworld
          registry isn't importable in this process.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        <PanelCard title="METHOD REGISTRY" accent={ACCENT}
          right={<span style={{ fontSize: 8, color: C.text }}>{filtered.length} / {methods.length}</span>}>
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="search field / domain / docs…  (e.g. sonar, seismic, rf)"
            style={{ ...inputStyle, marginBottom: 10 }} />
          <DataState loading={loading} error={error} empty={!unavailable && filtered.length === 0}
            emptyLabel={query ? "No methods match your search" : "No methods registered"}>
            <div style={{ maxHeight: 540, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
              {grouped.map(([domain, items]) => (
                <div key={domain}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 9, letterSpacing: 1.5, color: ACCENT, fontWeight: 700, textTransform: "uppercase" }}>{domain}</span>
                    <span style={{ flex: 1, height: 1, background: C.border }} />
                    <span style={{ fontSize: 8, color: C.text }}>{items.length}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {items.map((m) => {
                      const active = selected && selected.key === m.key && selected.engine === m.engine;
                      return (
                        <button key={`${m.domain}.${m.key}.${m.engine}`} onClick={() => select(m)}
                          title={m.doc}
                          style={{ textAlign: "left", cursor: "pointer", border: `1px solid ${active ? ACCENT + "88" : C.border}`,
                            background: active ? ACCENT + "1a" : "rgba(0,0,0,0.25)", borderRadius: 5, padding: "6px 9px",
                            color: C.textB, fontFamily: "inherit" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: active ? ACCENT : C.textB, flex: 1 }}>{m.key}</span>
                            <Badge color={C.blue}>{m.engine}</Badge>
                          </div>
                          {m.doc && <div style={{ fontSize: 8, color: C.text, marginTop: 3, lineHeight: 1.4 }}>{m.doc}</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </DataState>
        </PanelCard>

        <PanelCard title="RUN METHOD" accent={ACCENT}>
          {!selected ? (
            <div style={{ padding: 20, fontSize: 10, color: C.text, letterSpacing: 1 }}>
              ← Select a method to run it.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT }}>{selected.key}</div>
                <div style={{ fontSize: 8, color: C.text, marginTop: 2 }}>
                  {selected.domain} · {selected.engine}
                </div>
                {selected.doc && <div style={{ fontSize: 9, color: C.textB, marginTop: 6, lineHeight: 1.5 }}>{selected.doc}</div>}
              </div>

              <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>PARAMS (optional JSON)</label>
              <textarea value={paramsText} onChange={(e) => setParamsText(e.target.value)}
                placeholder='{"seed": 1}'
                rows={3} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />

              <button onClick={run} disabled={running}
                style={{ ...inputStyle, width: "auto", cursor: running ? "wait" : "pointer", color: ACCENT,
                  borderColor: ACCENT + "66", background: ACCENT + "1a", fontWeight: 700, letterSpacing: 1, alignSelf: "flex-start" }}>
                {running ? "…" : "▶ RUN"}
              </button>

              {runError && (
                <div style={{ fontSize: 10, color: C.red }}>⚠ {String(runError.message || runError)}</div>
              )}

              {result && (
                <div>
                  {result.summary && (
                    <div style={{ fontSize: 9, color: C.textB, marginBottom: 6 }}>{result.summary}</div>
                  )}
                  {pairs.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>NUMERIC RESULT</div>
                      <MiniChart pairs={pairs} />
                    </div>
                  )}
                  <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 4 }}>RAW</div>
                  <pre style={{ margin: 0, maxHeight: 300, overflow: "auto", fontSize: 9, lineHeight: 1.5,
                    color: C.textB, background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`,
                    borderRadius: 5, padding: 10, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </PanelCard>
      </div>
    </PageShell>
  );
}
