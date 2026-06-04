/**
 * SearchHub — front end for the Wave-1 Search + Entity Resolution service.
 *
 * Left: a global search bar that hits /v1/search (with type + limit) and shows
 * typeahead suggestions from /v1/search/suggest as you type; results render as a
 * ranked list with type / score / snippet.
 * Right: an Entity Resolution panel — paste a record (JSON or a bare name) and
 * POST it to /v1/resolve, then review candidate matches with scores and a merge
 * button (best-effort: posts a resolve/merge action when the backend exposes it).
 *
 * Calls degrade gracefully: suggest failures are silent, search/resolve errors
 * surface inline.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, DataState, Badge } from "@/components/PageKit";
import { Btn, inputStyle } from "@/components/Wave1Kit";
import { apiGet, apiPost, qs, asList, labelOf, useAsync } from "@/lib/wave1";

const ACCENT = C.gold;

const scoreColor = (s) => (s >= 0.8 ? C.neon : s >= 0.5 ? C.gold : C.text);
const pctScore = (s) => (typeof s === "number" ? (s <= 1 ? Math.round(s * 100) : Math.round(s)) : null);

export default function SearchHub() {
  // Search state.
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [results, setResults] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const searchAsync = useAsync();
  const suggestTimer = useRef(null);

  // Resolve state.
  const [record, setRecord] = useState("");
  const [candidates, setCandidates] = useState([]);
  const resolveAsync = useAsync();
  const mergeAsync = useAsync();
  const [mergeMsg, setMergeMsg] = useState(null);

  const runSearch = useCallback(async (term) => {
    const query = (term ?? q).trim();
    setShowSuggest(false);
    if (!query) { setResults([]); return; }
    const body = await searchAsync.run(() =>
      apiGet(`/v1/search${qs({ q: query, type, limit: 25 })}`));
    setResults(body ? asList(body, "results", "hits") : []);
  }, [q, type, searchAsync]);

  // Debounced typeahead.
  useEffect(() => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    const term = q.trim();
    if (!term) { setSuggestions([]); return; }
    suggestTimer.current = setTimeout(async () => {
      try {
        const body = await apiGet(`/v1/search/suggest${qs({ q: term })}`);
        const list = asList(body, "suggestions", "results").map((s) =>
          typeof s === "string" ? s : (s.text || s.value || s.label || labelOf(s)));
        setSuggestions(list.slice(0, 8));
        setShowSuggest(list.length > 0);
      } catch { setSuggestions([]); }
    }, 180);
    return () => suggestTimer.current && clearTimeout(suggestTimer.current);
  }, [q]);

  const runResolve = async () => {
    setMergeMsg(null);
    setCandidates([]);
    const raw = record.trim();
    if (!raw) return;
    let rec;
    if (raw.startsWith("{") || raw.startsWith("[")) {
      try { rec = JSON.parse(raw); }
      catch { resolveAsync.setError(new Error("Record must be valid JSON or a plain name")); return; }
    } else {
      rec = { name: raw };
    }
    const body = await resolveAsync.run(() => apiPost("/v1/resolve", { record: rec }));
    if (body) setCandidates(asList(body, "candidates", "matches", "results"));
  };

  const merge = async (cand) => {
    setMergeMsg(null);
    const targetId = cand.id || cand.target || (cand.object && cand.object.id);
    let rec;
    const raw = record.trim();
    try { rec = raw.startsWith("{") ? JSON.parse(raw) : { name: raw }; } catch { rec = { name: raw }; }
    // Backend may expose merge under /resolve with an action; best-effort.
    const res = await mergeAsync.run(() =>
      apiPost("/v1/resolve", { record: rec, action: "merge", target: targetId }));
    setMergeMsg(res
      ? { err: false, text: `Merged into ${targetId || labelOf(cand)}` }
      : { err: true, text: "Merge not available on this backend" });
  };

  return (
    <PageShell
      title="SEARCH HUB"
      subtitle="WAVE-1 SEARCH · TYPEAHEAD · RANKED RESULTS · ENTITY RESOLUTION"
      accent={ACCENT}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        <StatTile label="Results" value={results.length} accent={ACCENT} />
        <StatTile label="Suggestions" value={suggestions.length} accent={C.blue} />
        <StatTile label="Candidates" value={candidates.length} accent={C.purple} />
        <StatTile label="Type Filter" value={type || "all"} accent={C.neon} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        {/* SEARCH */}
        <PanelCard title="GLOBAL SEARCH" accent={ACCENT}>
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input value={q} autoFocus
                onChange={(e) => { setQ(e.target.value); }}
                onFocus={() => suggestions.length && setShowSuggest(true)}
                onKeyDown={(e) => { if (e.key === "Enter") runSearch(); if (e.key === "Escape") setShowSuggest(false); }}
                placeholder="search everything…" style={inputStyle} />
              {showSuggest && suggestions.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 5,
                  marginTop: 2, background: "rgba(2,8,12,0.98)", border: `1px solid ${C.border}`,
                  borderRadius: 5, overflow: "hidden", boxShadow: "0 8px 24px -8px rgba(0,0,0,0.8)" }}>
                  {suggestions.map((s, i) => (
                    <button key={i} onMouseDown={() => { setQ(s); runSearch(s); }}
                      style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                        background: "transparent", border: "none", borderBottom: `1px solid ${C.borderB}`,
                        color: C.textB, fontFamily: "inherit", fontSize: 10, padding: "6px 10px" }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input value={type} onChange={(e) => setType(e.target.value)}
              placeholder="type" style={{ ...inputStyle, width: 90 }} />
            <Btn accent={ACCENT} onClick={() => runSearch()}>SEARCH</Btn>
          </div>

          <DataState loading={searchAsync.loading} error={searchAsync.error}
            empty={!searchAsync.loading && results.length === 0}
            emptyLabel={q ? "No results" : "Enter a query to search"}>
            <div style={{ maxHeight: 480, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {results.map((r, i) => {
                const score = r.score ?? r.rank ?? r.relevance;
                const pct = pctScore(score);
                return (
                  <div key={r.id || i} style={{ border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.25)",
                    borderRadius: 5, padding: "8px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.textB, flex: 1 }}>{labelOf(r)}</span>
                      {r.type && <Badge color={C.blue}>{r.type}</Badge>}
                      {pct !== null && <Badge color={scoreColor(score <= 1 ? score : score / 100)}>{pct}%</Badge>}
                    </div>
                    {(r.snippet || r.summary || r.description) && (
                      <div style={{ fontSize: 9, color: C.text, marginTop: 4, lineHeight: 1.5 }}>
                        {r.snippet || r.summary || r.description}
                      </div>
                    )}
                    {r.id && <div style={{ fontSize: 8, color: C.text, marginTop: 3 }}>{r.id}</div>}
                  </div>
                );
              })}
            </div>
          </DataState>
        </PanelCard>

        {/* RESOLVE */}
        <PanelCard title="ENTITY RESOLUTION" accent={C.purple}>
          <div style={{ fontSize: 9, color: C.text, marginBottom: 8, lineHeight: 1.5 }}>
            Paste a record as JSON or a plain name, then resolve against known entities.
          </div>
          <textarea value={record} onChange={(e) => setRecord(e.target.value)}
            placeholder={'{"name":"Acme Corp","country":"US"}  — or just  Acme Corp'}
            rows={4} style={{ ...inputStyle, resize: "vertical", marginBottom: 8 }} />
          <Btn accent={C.purple} onClick={runResolve} disabled={resolveAsync.loading}>
            {resolveAsync.loading ? "…" : "▶ RESOLVE"}
          </Btn>
          {resolveAsync.error && (
            <div style={{ fontSize: 9, color: C.red, marginTop: 8 }}>⚠ {String(resolveAsync.error.message || resolveAsync.error)}</div>
          )}

          {candidates.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 6 }}>
                CANDIDATE MATCHES ({candidates.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
                {candidates.map((cand, i) => {
                  const score = cand.score ?? cand.confidence ?? cand.similarity;
                  const pct = pctScore(score);
                  return (
                    <div key={cand.id || i} style={{ border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.25)",
                      borderRadius: 5, padding: "8px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.textB, flex: 1 }}>{labelOf(cand)}</span>
                        {pct !== null && <Badge color={scoreColor(score <= 1 ? score : score / 100)}>{pct}%</Badge>}
                        <Btn accent={C.neon} onClick={() => merge(cand)} disabled={mergeAsync.loading}
                          style={{ padding: "3px 8px", fontSize: 8 }}>MERGE</Btn>
                      </div>
                      {cand.id && <div style={{ fontSize: 8, color: C.text, marginTop: 3 }}>{cand.id}</div>}
                    </div>
                  );
                })}
              </div>
              {mergeMsg && (
                <div style={{ fontSize: 9, color: mergeMsg.err ? C.red : C.neon, marginTop: 8 }}>
                  {mergeMsg.err ? "⚠ " : "✓ "}{mergeMsg.text}
                </div>
              )}
            </div>
          )}
          {candidates.length === 0 && !resolveAsync.loading && record.trim() && resolveAsync.error === null && (
            <div style={{ fontSize: 9, color: C.text, marginTop: 10 }}>Run resolve to see candidates.</div>
          )}
        </PanelCard>
      </div>
    </PageShell>
  );
}
