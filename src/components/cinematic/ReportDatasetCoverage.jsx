import { useState, useEffect, useCallback } from 'react';

const API = '';
const RPTDS_RE = /\b(report[._-]?dataset|dataset[._-]?report|rptds|backed[._-]?report|unsourced[._-]?report|data[._-]?backed[._-]?report|report[._-]?data[._-]?gap|report[._-]?data[._-]?coverage|datasource[._-]?report)\b/i;

export function isRptdsQuery(t) {
  return RPTDS_RE.test(t || '');
}

export async function buildRptdsScript() {
  const [rpR, dsR] = await Promise.allSettled([
    fetch(`${API}/v1/reports`).then(r => r.json()),
    fetch(`${API}/v1/datasets`).then(r => r.json()),
  ]);
  const reports = normaliseReports(rpR.status === 'fulfilled' ? rpR.value : []);
  const datasets = normaliseDatasets(dsR.status === 'fulfilled' ? dsR.value : []);
  const enriched = correlate(reports, datasets);
  const backed = enriched.filter(r => r._linked).length;
  const unsourced = enriched.length - backed;
  return (
    `Report × Dataset Coverage: ${reports.length} intelligence reports, ${datasets.length} datasets indexed. ` +
    `${backed} reports have dataset backing; ${unsourced} are UNSOURCED (intelligence gap). ` +
    `Top unsourced: ${enriched.filter(r => !r._linked).slice(0, 3).map(r => r.title || r.name || r.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseReports(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['reports', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseDatasets(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['datasets', 'items', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(report, dataset) {
  const rpToks = new Set([
    ...tokens(report.title),
    ...tokens(report.name),
    ...tokens(report.summary),
    ...tokens(report.type),
    ...tokens(report.tags),
    ...tokens(report.category),
  ].filter(Boolean));
  const dsToks = [
    ...tokens(dataset.name),
    ...tokens(dataset.title),
    ...tokens(dataset.description),
    ...tokens(dataset.kind),
    ...tokens(dataset.type),
    ...tokens(dataset.tags),
  ].filter(Boolean);
  if (!rpToks.size || !dsToks.length) return 0;
  let hits = 0;
  for (const t of dsToks) if (rpToks.has(t)) hits++;
  return hits / Math.max(rpToks.size, dsToks.length);
}

function correlate(reports, datasets) {
  return reports.map(report => {
    const scored = datasets
      .map(ds => ({ ds, score: matchScore(report, ds) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...report, _linked: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const VI = '#A78BFA';

const KIND_COLORS = {
  csv: CY,
  json: VI,
  sql: AM,
  parquet: GR,
  api: '#FB923C',
};

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

export default function ReportDatasetCoverage() {
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState([]);
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
      const [rpR, dsR] = await Promise.allSettled([
        fetch(`${API}/v1/reports`).then(r => r.json()),
        fetch(`${API}/v1/datasets`).then(r => r.json()),
      ]);
      setReports(normaliseReports(rpR.status === 'fulfilled' ? rpR.value : []));
      setDatasets(normaliseDatasets(dsR.status === 'fulfilled' ? dsR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:rptds-toggle', onToggle);
    return () => window.removeEventListener('jarvis:rptds-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(reports, datasets);
  const backed = enriched.filter(r => r._linked);
  const unsourced = enriched.filter(r => !r._linked);
  const badgeCount = unsourced.length;
  const badgeColor = badgeCount > 0 ? AM : GR;

  const filtered = enriched
    .filter(r => tab === 'ALL' || (tab === 'BACKED' ? r._linked : !r._linked))
    .filter(r => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(r.title || '').toLowerCase().includes(q) ||
        String(r.name || '').toLowerCase().includes(q) ||
        String(r.summary || '').toLowerCase().includes(q) ||
        String(r.type || '').toLowerCase().includes(q)
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
          message: `You have ${reports.length} intelligence reports and ${datasets.length} datasets. ${backed.length} reports are BACKED by dataset support; ${unsourced.length} are UNSOURCED with no dataset coverage. Top unsourced reports: ${unsourced.slice(0, 3).map(r => r.title || r.name || '?').join(', ') || 'none'}. Give a 2-sentence report-data readiness brief highlighting the intelligence gap from unsourced reports and which data sources are most urgently needed.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const label = r => r.title || r.name || r.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Report × Dataset Coverage (RPTDS)"
        style={{
          position: 'fixed', left: 681280, bottom: 8, zIndex: 245,
          width: 54, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ RPTDS
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
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${CY}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${CY}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${CY}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${CY}` }}>
              ◈ REPORT × DATASET COVERAGE
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: '#6E8AA0', fontSize: 10 }}>loading…</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  padding: '2px 8px', borderRadius: 3, border: `1px solid ${CY}55`,
                  background: 'transparent', color: CY, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
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

          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'REPORTS', val: reports.length, col: CY },
              { label: 'DATASETS', val: datasets.length, col: VI },
              { label: 'BACKED', val: backed.length, col: GR },
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

          <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, alignItems: 'center' }}>
            {['ALL', 'BACKED', 'UNSOURCED'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? CY : '#2a3a4a'}`,
                  background: tab === t ? `${CY}22` : 'transparent',
                  color: tab === t ? CY : '#6E8AA0',
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search reports…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                borderRadius: 4, color: '#DCEBF5', padding: '2px 8px', fontSize: 10, outline: 'none',
                fontFamily: "'JetBrains Mono',monospace", width: 160,
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading…' : 'No reports found.'}
              </div>
            ) : filtered.map((report, i) => {
              const isBacked = report._linked;
              const statusColor = isBacked ? GR : AM;
              const isExp = expanded === i;
              return (
                <div
                  key={report.id || i}
                  style={{ borderBottom: `1px solid ${CY}11`, paddingBottom: 6, marginBottom: 6 }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: statusColor,
                      boxShadow: `0 0 6px ${statusColor}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{label(report)}</span>
                    {report.type && chip(report.type, VI)}
                    {chip(isBacked ? 'BACKED' : 'UNSOURCED', statusColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {report._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHING DATASETS
                          </div>
                          {report._matches.map(({ ds, score }, j) => {
                            const kindColor = KIND_COLORS[String(ds.kind || ds.type || '').toLowerCase()] || CY;
                            const rows = ds.row_count || ds.rows || ds.count;
                            return (
                              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                {(ds.kind || ds.type) && chip(String(ds.kind || ds.type).toUpperCase(), kindColor)}
                                <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                  {ds.name || ds.title || ds.id || '?'}
                                </span>
                                {rows != null && (
                                  <span style={{ color: '#6E8AA0', fontSize: 9, marginRight: 4 }}>
                                    {Number(rows).toLocaleString()} rows
                                  </span>
                                )}
                                {scorebar(score, GR)}
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div style={{ color: AM, fontSize: 10 }}>No datasets matched this report — intelligence gap.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {brief && (
            <div style={{
              padding: '8px 14px', borderTop: `1px solid ${CY}22`,
              color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
              background: 'rgba(0,207,255,0.03)',
            }}>
              <span style={{ color: CY, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
