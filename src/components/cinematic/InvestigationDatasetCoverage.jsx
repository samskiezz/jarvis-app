import { useState, useEffect, useCallback } from 'react';

const API = '';
const INVDATA_RE = /\b(inv[._-]?data(?:set)?|investigation[._-]?data(?:set)?|invdata|inv[._-]?dataset|case[._-]?data(?:set)?|data[._-]?backed?|unsourced[._-]?invest|investigation[._-]?data[._-]?gap|data[._-]?gap[._-]?invest|which[._-]?invest(?:igations?)?[._-]?have[._-]?data|investigation[._-]?data[._-]?coverage|case[._-]?dataset[._-]?coverage)\b/i;

export function isInvdataQuery(t) {
  return INVDATA_RE.test(t || '');
}

export async function buildInvdataScript() {
  const [invR, dsR] = await Promise.allSettled([
    fetch(`${API}/v1/investigations`).then(r => r.json()),
    fetch(`${API}/v1/datasets`).then(r => r.json()),
  ]);
  const investigations = normaliseInv(invR.status === 'fulfilled' ? invR.value : []);
  const datasets = normaliseDs(dsR.status === 'fulfilled' ? dsR.value : []);
  const enriched = correlate(investigations, datasets);
  const supported = enriched.filter(i => i._covered).length;
  const unsourced = enriched.length - supported;
  const topUnsourced = enriched.filter(i => !i._covered).slice(0, 4).map(i => i.title || i.name || i.id || '?').join(', ');
  return (
    `Investigation × Dataset Coverage: ${investigations.length} open investigations, ${datasets.length} datasets indexed. ` +
    `${supported} investigations have dataset backing; ${unsourced} are unsourced — no data coverage detected. ` +
    `Unsourced cases: ${topUnsourced || 'none'}.`
  );
}

function normaliseInv(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['investigations', 'items', 'results', 'data', 'cases']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseDs(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['datasets', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(inv, ds) {
  const invToks = new Set([
    ...tokens(inv.title),
    ...tokens(inv.name),
    ...tokens(inv.description),
    ...tokens(inv.subject),
    ...tokens(inv.kind),
    ...tokens(inv.type),
  ].filter(Boolean));
  const dsToks = [
    ...tokens(ds.name),
    ...tokens(ds.title),
    ...tokens(ds.description),
    ...tokens(ds.type),
    ...tokens(ds.category),
    ...tokens(ds.source),
  ].filter(Boolean);
  if (!invToks.size || !dsToks.length) return 0;
  let hits = 0;
  for (const t of dsToks) if (invToks.has(t)) hits++;
  return hits / Math.max(invToks.size, dsToks.length);
}

function correlate(investigations, datasets) {
  return investigations.map(inv => {
    const scored = datasets
      .map(ds => ({ ds, score: matchScore(inv, ds) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...inv, _covered: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const PU = '#A78BFA';

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4, border: `1px solid ${color}44`,
    background: `${color}14`, color, fontSize: 10, letterSpacing: 1, marginRight: 4,
  }}>{label}</span>
);

const scorebar = (score, color = CY) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
    <div style={{ width: 60, height: 4, background: '#1a2535', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
    <span style={{ color: '#6E8AA0', fontSize: 10 }}>{(score * 100).toFixed(0)}%</span>
  </div>
);

export default function InvestigationDatasetCoverage() {
  const [open, setOpen] = useState(false);
  const [investigations, setInvestigations] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invR, dsR] = await Promise.allSettled([
        fetch(`${API}/v1/investigations`).then(r => r.json()),
        fetch(`${API}/v1/datasets`).then(r => r.json()),
      ]);
      setInvestigations(normaliseInv(invR.status === 'fulfilled' ? invR.value : []));
      setDatasets(normaliseDs(dsR.status === 'fulfilled' ? dsR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:invdata-toggle', onToggle);
    return () => window.removeEventListener('jarvis:invdata-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(investigations, datasets);
  const supported = enriched.filter(i => i._covered);
  const unsourced = enriched.filter(i => !i._covered);
  const badgeCount = unsourced.length;
  const badgeColor = badgeCount > 0 ? AM : GR;

  const filtered = enriched
    .filter(i => tab === 'ALL' || (tab === 'SUPPORTED' ? i._covered : !i._covered))
    .filter(i => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        String(i.title || '').toLowerCase().includes(s) ||
        String(i.name || '').toLowerCase().includes(s) ||
        String(i.description || '').toLowerCase().includes(s) ||
        String(i.subject || '').toLowerCase().includes(s)
      );
    });

  async function assess() {
    setAssessing(true);
    setBrief('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message: `You have ${investigations.length} open investigations and ${datasets.length} datasets. ` +
            `${supported.length} investigations have dataset backing; ${unsourced.length} have no data coverage — these are intelligence gaps. ` +
            `Unsourced: ${unsourced.slice(0, 4).map(i => i.title || i.name || i.id || '?').join(', ') || 'none'}. ` +
            `Give a 2-sentence investigation data readiness brief highlighting the most critical unsourced case and recommended data acquisition priority.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const label = i => i.title || i.name || i.id || '?';

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Investigation × Dataset Coverage (INVDATA)"
        style={{
          position: 'fixed', left: 71880, bottom: 8, zIndex: 138,
          width: 66, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ INVDATA
        {badgeCount > 0 && (
          <span style={{
            background: badgeColor, color: '#04060A', borderRadius: 3, padding: '0 4px',
            fontSize: 8, fontWeight: 700, minWidth: 14, textAlign: 'center',
          }}>{badgeCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: PANEL_W, height: PANEL_H, zIndex: 9200,
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${AM}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${AM}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${AM}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: AM, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${AM}` }}>
              ◈ INVESTIGATION × DATASET COVERAGE
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: '#6E8AA0', fontSize: 10 }}>loading…</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  padding: '2px 8px', borderRadius: 3, border: `1px solid ${AM}55`,
                  background: 'transparent', color: AM, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                }}
              >{assessing ? 'assessing…' : '▶ ASSESS'}</button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0,
                }}
              >✕</button>
            </span>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'INVESTIGATIONS', val: investigations.length, col: CY },
              { label: 'DATASETS', val: datasets.length, col: PU },
              { label: 'SUPPORTED', val: supported.length, col: GR },
              { label: 'UNSOURCED', val: unsourced.length, col: AM },
            ].map(({ label: l, val, col }) => (
              <div key={l} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '6px 8px', textAlign: 'center',
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, alignItems: 'center' }}>
            {['ALL', 'SUPPORTED', 'UNSOURCED'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? AM : '#2a3a4a'}`,
                  background: tab === t ? `${AM}22` : 'transparent',
                  color: tab === t ? AM : '#6E8AA0',
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search investigations…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                borderRadius: 4, color: '#DCEBF5', padding: '2px 8px', fontSize: 10, outline: 'none',
                fontFamily: "'JetBrains Mono',monospace", width: 160,
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading…' : 'No investigations found.'}
              </div>
            ) : filtered.map((inv, i) => {
              const isExp = expanded === i;
              const statusColor = inv._covered ? GR : AM;
              return (
                <div
                  key={inv.id || i}
                  style={{ borderBottom: `1px solid ${AM}11`, paddingBottom: 6, marginBottom: 6 }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: statusColor,
                      boxShadow: `0 0 6px ${statusColor}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{label(inv)}</span>
                    {inv.kind && chip(inv.kind, PU)}
                    {inv.type && chip(inv.type, '#6E8AA0')}
                    {chip(inv._covered ? 'SUPPORTED' : 'UNSOURCED', statusColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {inv._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED DATASETS
                          </div>
                          {inv._matches.map(({ ds, score }, j) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                {ds.name || ds.title || ds.id || '?'}
                              </span>
                              {ds.type && chip(ds.type, CY)}
                              {ds.row_count != null && chip(`${ds.row_count} rows`, PU)}
                              {scorebar(score, AM)}
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ color: AM, fontSize: 10 }}>No datasets matched this investigation — data gap.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Brief block */}
          {brief && (
            <div style={{
              padding: '8px 14px', borderTop: `1px solid ${AM}22`,
              color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
              background: 'rgba(245,158,11,0.03)',
            }}>
              <span style={{ color: AM, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
