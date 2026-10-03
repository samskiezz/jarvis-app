import { useState, useEffect, useCallback } from 'react';

const API = '';

const IDRTRI_RE = /\b(idrtri|invest\w*[._\s-]?dataset[._\s-]?report|report[._\s-]?backed[._\s-]?invest\w*|dataset[._\s-]?backed[._\s-]?invest\w*|uncorroborated[._\s-]?invest\w*|evidenced[._\s-]?invest\w*|invest\w*[._\s-]?evidence[._\s-]?gap)\b/i;

export function isIdrtriQuery(t) { return IDRTRI_RE.test(t || ''); }

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function normaliseInvestigations(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)
    ? raw
    : raw.investigations || raw.items || raw.results || raw.data || [];
  return arr.map(i => ({
    id: i.id || i._id || String(Math.random()),
    title: i.title || i.name || i.label || '',
    status: i.status || '',
    tags: Array.isArray(i.tags) ? i.tags : [],
    description: i.description || i.summary || '',
  }));
}

function normaliseDatasets(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)
    ? raw
    : raw.datasets || raw.items || raw.results || raw.data || [];
  return arr.map(d => ({
    id: d.id || d._id || String(Math.random()),
    name: d.name || d.title || d.label || '',
    tags: Array.isArray(d.tags) ? d.tags : [],
    description: d.description || d.summary || '',
  }));
}

function normaliseReports(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)
    ? raw
    : raw.reports || raw.items || raw.results || raw.data || [];
  return arr.map(r => ({
    id: r.id || r._id || String(Math.random()),
    title: r.title || r.name || r.label || '',
    tags: Array.isArray(r.tags) ? r.tags : [],
    description: r.description || r.summary || '',
  }));
}

function matchScore(invTokens, fields) {
  if (!invTokens.length) return 0;
  const pool = tok(fields.join(' '));
  if (!pool.length) return 0;
  const hits = invTokens.filter(t => pool.includes(t)).length;
  return hits / Math.max(invTokens.length, pool.length);
}

const SCORE_THRESHOLD = 0.12;

function correlate(investigations, datasets, reports) {
  return investigations.map(inv => {
    const invToks = tok([inv.title, inv.description, ...inv.tags].join(' '));

    const bestDs = datasets.reduce((best, ds) => {
      const s = matchScore(invToks, [ds.name, ds.description, ...ds.tags]);
      return s > best.score ? { score: s, item: ds } : best;
    }, { score: 0, item: null });

    const bestRp = reports.reduce((best, rp) => {
      const s = matchScore(invToks, [rp.title, rp.description, ...rp.tags]);
      return s > best.score ? { score: s, item: rp } : best;
    }, { score: 0, item: null });

    const hasDs = bestDs.score >= SCORE_THRESHOLD;
    const hasRp = bestRp.score >= SCORE_THRESHOLD;

    let coverage, color;
    if (hasDs && hasRp) {
      coverage = 'FULLY EVIDENCED';
      color = '#22c55e';
    } else if (hasRp) {
      coverage = 'REPORT-BACKED';
      color = '#00d4ff';
    } else if (hasDs) {
      coverage = 'DATA-BACKED';
      color = '#f59e0b';
    } else {
      coverage = 'UNCORROBORATED';
      color = '#ef4444';
    }

    return {
      inv,
      coverage,
      color,
      dataset: hasDs ? bestDs.item : null,
      report: hasRp ? bestRp.item : null,
      dsScore: bestDs.score,
      rpScore: bestRp.score,
    };
  });
}

export async function buildIdrtriScript() {
  try {
    const [invR, dsR, rpR] = await Promise.allSettled([
      fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : null),
    ]);
    const investigations = normaliseInvestigations(invR.status === 'fulfilled' ? invR.value : null);
    const datasets = normaliseDatasets(dsR.status === 'fulfilled' ? dsR.value : null);
    const reports = normaliseReports(rpR.status === 'fulfilled' ? rpR.value : null);
    const rows = correlate(investigations, datasets, reports);
    const counts = { 'FULLY EVIDENCED': 0, 'REPORT-BACKED': 0, 'DATA-BACKED': 0, 'UNCORROBORATED': 0 };
    rows.forEach(r => { counts[r.coverage] = (counts[r.coverage] || 0) + 1; });
    const lines = [
      `Investigation × Dataset × Report Triple Coverage (IDRTRI)`,
      `${investigations.length} investigations | ${datasets.length} datasets | ${reports.length} reports`,
      `FULLY EVIDENCED: ${counts['FULLY EVIDENCED']} | REPORT-BACKED: ${counts['REPORT-BACKED']} | DATA-BACKED: ${counts['DATA-BACKED']} | UNCORROBORATED: ${counts['UNCORROBORATED']}`,
    ];
    const uncorr = rows.filter(r => r.coverage === 'UNCORROBORATED').slice(0, 5);
    if (uncorr.length) {
      lines.push(`Top uncorroborated: ${uncorr.map(r => r.inv.title || r.inv.id).join(', ')}`);
    }
    return lines.join('\n');
  } catch {
    return 'IDRTRI: data unavailable';
  }
}

const CY = '#00d4ff';
const AM = '#f59e0b';
const GR = '#22c55e';
const RD = '#ef4444';
const DIM = 'rgba(0,0,0,0.82)';
const BORDER = 'rgba(0,212,255,0.18)';

export default function InvestigationDatasetReportTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({ 'FULLY EVIDENCED': 0, 'REPORT-BACKED': 0, 'DATA-BACKED': 0, 'UNCORROBORATED': 0 });
  const [totals, setTotals] = useState({ inv: 0, ds: 0, rp: 0 });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [assessed, setAssessed] = useState('');
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [invR, dsR, rpR] = await Promise.allSettled([
        fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/datasets`).then(r => r.ok ? r.json() : null),
        fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : null),
      ]);
      const investigations = normaliseInvestigations(invR.status === 'fulfilled' ? invR.value : null);
      const datasets = normaliseDatasets(dsR.status === 'fulfilled' ? dsR.value : null);
      const reports = normaliseReports(rpR.status === 'fulfilled' ? rpR.value : null);
      const correlated = correlate(investigations, datasets, reports);
      setRows(correlated);
      setTotals({ inv: investigations.length, ds: datasets.length, rp: reports.length });
      const c = { 'FULLY EVIDENCED': 0, 'REPORT-BACKED': 0, 'DATA-BACKED': 0, 'UNCORROBORATED': 0 };
      correlated.forEach(r => { c[r.coverage] = (c[r.coverage] || 0) + 1; });
      setCounts(c);
    } catch (e) {
      setErr(e.message || 'fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:idrtri-toggle', handler);
    return () => window.removeEventListener('jarvis:idrtri-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessed('');
    try {
      const script = await buildIdrtriScript();
      const resp = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Analyse this investigation evidence coverage report and identify the highest-priority uncorroborated investigations:\n\n${script}` }),
      });
      const data = await resp.json();
      const text = data.response || data.message || data.content || JSON.stringify(data);
      setAssessed(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessed(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, []);

  const visible = filter === 'ALL' ? rows : rows.filter(r => r.coverage === filter);
  const pct = totals.inv > 0 ? Math.round((counts['FULLY EVIDENCED'] / totals.inv) * 100) : 0;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 751840,
          bottom: 8,
          zIndex: 371,
          background: 'rgba(0,0,0,0.85)',
          border: `1px solid ${CY}`,
          color: CY,
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9,
          padding: '3px 7px',
          cursor: 'pointer',
          letterSpacing: 1,
          borderRadius: 2,
        }}
      >
        ◈ IDRTRI
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      right: 16,
      top: 16,
      width: 760,
      maxHeight: 680,
      background: DIM,
      border: `1px solid ${BORDER}`,
      borderRadius: 6,
      zIndex: 9900,
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: 10,
      color: CY,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ IDRTRI</span>
        <span style={{ color: 'rgba(0,212,255,0.5)', flex: 1 }}>Investigation × Dataset × Report Triple Coverage</span>
        <span style={{ color: 'rgba(0,212,255,0.5)', fontSize: 9 }}>
          {totals.inv}inv / {totals.ds}ds / {totals.rp}rp
        </span>
        <button
          onClick={assess}
          disabled={assessing}
          style={{ background: 'none', border: `1px solid ${AM}`, color: AM, fontFamily: 'inherit', fontSize: 9, padding: '2px 6px', cursor: 'pointer', borderRadius: 2 }}
        >
          {assessing ? '…' : 'ASSESS'}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', color: CY, fontFamily: 'inherit', fontSize: 13, cursor: 'pointer', padding: '0 4px' }}
        >
          ×
        </button>
      </div>

      {/* Coverage summary bar */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 12px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { key: 'ALL', label: `ALL (${totals.inv})`, color: CY },
          { key: 'FULLY EVIDENCED', label: `FULLY EVIDENCED (${counts['FULLY EVIDENCED']})`, color: GR },
          { key: 'REPORT-BACKED', label: `REPORT-BACKED (${counts['REPORT-BACKED']})`, color: CY },
          { key: 'DATA-BACKED', label: `DATA-BACKED (${counts['DATA-BACKED']})`, color: AM },
          { key: 'UNCORROBORATED', label: `UNCORROBORATED (${counts['UNCORROBORATED']})`, color: RD },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              background: filter === f.key ? `${f.color}22` : 'none',
              border: `1px solid ${filter === f.key ? f.color : 'rgba(0,212,255,0.2)'}`,
              color: f.color,
              fontFamily: 'inherit',
              fontSize: 9,
              padding: '2px 6px',
              cursor: 'pointer',
              borderRadius: 2,
              letterSpacing: 1,
            }}
          >
            {f.label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', color: GR, fontSize: 9, alignSelf: 'center' }}>
          {pct}% evidenced
        </span>
      </div>

      {/* Loading / error */}
      {loading && (
        <div style={{ padding: '10px 12px', color: 'rgba(0,212,255,0.5)', flexShrink: 0 }}>
          ◌ loading…
        </div>
      )}
      {err && (
        <div style={{ padding: '6px 12px', color: RD, flexShrink: 0 }}>
          ✕ {err}
        </div>
      )}

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {visible.length === 0 && !loading && (
          <div style={{ padding: '16px 12px', color: 'rgba(0,212,255,0.3)' }}>
            {totals.inv === 0 ? 'No investigations found.' : 'No items match filter.'}
          </div>
        )}
        {visible.map((row, i) => (
          <div
            key={row.inv.id + i}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 140px',
              gap: 6,
              padding: '5px 12px',
              borderBottom: 'rgba(0,212,255,0.06) solid 1px',
            }}
          >
            <div>
              <div style={{ color: row.color, fontWeight: 600, fontSize: 10, marginBottom: 2 }}>
                {row.inv.title || row.inv.id}
                {row.inv.status ? <span style={{ color: 'rgba(0,212,255,0.4)', marginLeft: 6, fontSize: 9 }}>[{row.inv.status}]</span> : null}
              </div>
              <div style={{ color: 'rgba(0,212,255,0.45)', fontSize: 9, lineHeight: 1.4 }}>
                {row.dataset && <span style={{ color: AM, marginRight: 8 }}>DS: {row.dataset.name}</span>}
                {row.report && <span style={{ color: CY }}>RP: {row.report.title}</span>}
                {!row.dataset && !row.report && <span style={{ color: 'rgba(255,255,255,0.2)' }}>no evidence linkage</span>}
              </div>
            </div>
            <div style={{ textAlign: 'right', paddingTop: 2 }}>
              <span style={{
                display: 'inline-block',
                background: `${row.color}1a`,
                border: `1px solid ${row.color}44`,
                color: row.color,
                borderRadius: 2,
                padding: '1px 5px',
                fontSize: 8,
                letterSpacing: 1,
              }}>
                {row.coverage}
              </span>
              <div style={{ color: 'rgba(0,212,255,0.3)', fontSize: 8, marginTop: 2 }}>
                ds:{(row.dsScore * 100).toFixed(0)}% rp:{(row.rpScore * 100).toFixed(0)}%
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Assessment output */}
      {assessed && (
        <div style={{
          borderTop: `1px solid ${BORDER}`,
          padding: '8px 12px',
          color: 'rgba(0,212,255,0.7)',
          fontSize: 9,
          maxHeight: 120,
          overflowY: 'auto',
          flexShrink: 0,
          whiteSpace: 'pre-wrap',
        }}>
          {assessed}
        </div>
      )}

      {/* Footer */}
      <div style={{ borderTop: `1px solid ${BORDER}`, padding: '4px 12px', display: 'flex', gap: 12, flexShrink: 0 }}>
        <span style={{ color: 'rgba(0,212,255,0.3)', fontSize: 8 }}>/v1/investigations × /v1/datasets × /v1/reports</span>
        <span style={{ color: 'rgba(0,212,255,0.3)', fontSize: 8, marginLeft: 'auto' }}>auto-refresh 90s</span>
      </div>
    </div>
  );
}
