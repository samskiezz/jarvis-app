/**
 * SciDomainConsole — shared, themed console for a curated slice of the 449-method
 * science engine (the APEX↔underworld bridge).
 *
 * Every "sensor" page (SensorGrid, SkyOrbital, RFSpectrum) renders one of these
 * with a different domain filter + accent + theme copy. It GETs
 * /functions/science/methods, keeps only the methods whose domain is in `domains`
 * (or whose key/alias/doc matches `extraMatch`), groups + lets the operator pick
 * one, then POSTs /functions/science/run and renders the returned dict (pretty
 * JSON + a bar chart for scalars + an SVG sparkline for numeric arrays). Loading,
 * error and "engine unavailable" states all degrade gracefully — identical wiring
 * to ScienceConsole so behaviour stays consistent across the app.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";
import { PageShell, PanelCard, StatTile, DataState, Badge } from "@/components/PageKit";

const inputStyle = {
  background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`, borderRadius: 4,
  color: C.textB, padding: "7px 9px", fontSize: 10, fontFamily: "inherit", outline: "none",
  width: "100%", boxSizing: "border-box",
};

const fmt = (v) =>
  typeof v === "number"
    ? (Math.abs(v) < 1e-3 && v !== 0) || Math.abs(v) >= 1e6
      ? v.toExponential(3)
      : Number(v.toPrecision(6)).toString()
    : String(v);

// Scalar numeric entries → trivial horizontal bar chart (matches ScienceConsole).
function numericPairs(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  return Object.entries(obj).filter(([, v]) => typeof v === "number" && Number.isFinite(v));
}

// Array-valued numeric entries → a small SVG sparkline each.
function numericArrays(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  return Object.entries(obj).filter(
    ([, v]) => Array.isArray(v) && v.length > 1 && v.every((x) => typeof x === "number" && Number.isFinite(x))
  );
}

function BarChart({ pairs, accent }) {
  const max = Math.max(...pairs.map(([, v]) => Math.abs(v)), 1e-12);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
      {pairs.map(([k, v]) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 8, color: C.text, width: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k}</span>
          <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, (Math.abs(v) / max) * 100)}%`, height: "100%", background: accent, transition: "width .3s" }} />
          </div>
          <span style={{ fontSize: 8, color: C.textB, width: 110, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(v)}</span>
        </div>
      ))}
    </div>
  );
}

// Inline SVG sparkline for a numeric series.
function Sparkline({ name, series, accent }) {
  const W = 280, H = 46, pad = 3;
  const min = Math.min(...series), max = Math.max(...series);
  const span = max - min || 1;
  const pts = series.map((v, i) => {
    const x = pad + (i / (series.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - min) / span) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: C.text }}>
        <span>{name}</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>n={series.length} · {fmt(min)} → {fmt(max)}</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ display: "block", marginTop: 3, background: "rgba(0,0,0,0.35)", border: `1px solid ${C.border}`, borderRadius: 4 }}>
        <polyline points={pts.join(" ")} fill="none" stroke={accent} strokeWidth="1.5"
          vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export default function SciDomainConsole({
  title,
  subtitle,
  accent = C.purple,
  domains = [],
  extraMatch = [],
  runLabel = "RUN",
  emptyHint = "Select a method to run it.",
}) {
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

  const domainSet = useMemo(() => new Set(domains), [domains]);

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

  // Curate to this console's domain slice (by domain, or matching key/alias).
  const scoped = useMemo(() => {
    const extra = extraMatch.map((s) => s.toLowerCase());
    return methods.filter((m) => {
      if (domainSet.has(m.domain)) return true;
      if (!extra.length) return false;
      const hay = `${m.key} ${(m.aliases || []).join(" ")} ${m.doc || ""}`.toLowerCase();
      return extra.some((t) => hay.includes(t));
    });
  }, [methods, domainSet, extraMatch]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((m) =>
      m.key.toLowerCase().includes(q) ||
      m.domain.toLowerCase().includes(q) ||
      (m.doc || "").toLowerCase().includes(q) ||
      (m.engine || "").toLowerCase().includes(q) ||
      (m.aliases || []).some((a) => a.toLowerCase().includes(q))
    );
  }, [scoped, query]);

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
        setRunError(new Error('Params must be valid JSON (e.g. {"seed": 1})'));
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
  const arrays = numericArrays(resultData);

  return (
    <PageShell
      title={title}
      subtitle={subtitle}
      accent={accent}
      actions={
        <button onClick={load}
          style={{ ...inputStyle, width: "auto", cursor: "pointer", color: accent, borderColor: accent + "55" }}>↻ REFRESH</button>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        <StatTile label="Channels" value={scoped.length} accent={accent} />
        <StatTile label="Domains" value={new Set(scoped.map((m) => m.domain)).size} accent={C.blue} />
        <StatTile label="Showing" value={filtered.length} accent={C.neon} />
        <StatTile label="Bridge" value={unavailable ? "OFFLINE" : (methods.length ? "ONLINE" : "—")}
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
        <PanelCard title="CHANNELS" accent={accent}
          right={<span style={{ fontSize: 8, color: C.text }}>{filtered.length} / {scoped.length}</span>}>
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="filter method / domain / docs…"
            style={{ ...inputStyle, marginBottom: 10 }} />
          <DataState loading={loading} error={error} empty={!unavailable && filtered.length === 0}
            emptyLabel={query ? "No methods match your search" : "No methods in this band"}>
            <div style={{ maxHeight: 540, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
              {grouped.map(([domain, items]) => (
                <div key={domain}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 9, letterSpacing: 1.5, color: accent, fontWeight: 700, textTransform: "uppercase" }}>{domain}</span>
                    <span style={{ flex: 1, height: 1, background: C.border }} />
                    <span style={{ fontSize: 8, color: C.text }}>{items.length}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {items.map((m) => {
                      const active = selected && selected.key === m.key && selected.engine === m.engine;
                      return (
                        <button key={`${m.domain}.${m.key}.${m.engine}`} onClick={() => select(m)}
                          title={m.doc}
                          style={{ textAlign: "left", cursor: "pointer", border: `1px solid ${active ? accent + "88" : C.border}`,
                            background: active ? accent + "1a" : "rgba(0,0,0,0.25)", borderRadius: 5, padding: "6px 9px",
                            color: C.textB, fontFamily: "inherit" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: active ? accent : C.textB, flex: 1 }}>{m.key}</span>
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

        <PanelCard title="RUN" accent={accent}>
          {!selected ? (
            <div style={{ padding: 20, fontSize: 10, color: C.text, letterSpacing: 1 }}>
              ← {emptyHint}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: accent }}>{selected.key}</div>
                <div style={{ fontSize: 8, color: C.text, marginTop: 2 }}>{selected.domain} · {selected.engine}</div>
                {selected.doc && <div style={{ fontSize: 9, color: C.textB, marginTop: 6, lineHeight: 1.5 }}>{selected.doc}</div>}
              </div>

              <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>PARAMS (optional JSON)</label>
              <textarea value={paramsText} onChange={(e) => setParamsText(e.target.value)}
                placeholder='{"seed": 1}'
                rows={3} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />

              <button onClick={run} disabled={running}
                style={{ ...inputStyle, width: "auto", cursor: running ? "wait" : "pointer", color: accent,
                  borderColor: accent + "66", background: accent + "1a", fontWeight: 700, letterSpacing: 1, alignSelf: "flex-start" }}>
                {running ? "…" : `▶ ${runLabel}`}
              </button>

              {runError && (
                <div style={{ fontSize: 10, color: C.red }}>⚠ {String(runError.message || runError)}</div>
              )}

              {result && (
                <div>
                  {result.summary && (
                    <div style={{ fontSize: 9, color: C.textB, marginBottom: 6 }}>{result.summary}</div>
                  )}
                  {arrays.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>SIGNAL</div>
                      {arrays.map(([k, v]) => <Sparkline key={k} name={k} series={v} accent={accent} />)}
                    </div>
                  )}
                  {pairs.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>NUMERIC RESULT</div>
                      <BarChart pairs={pairs} accent={accent} />
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
