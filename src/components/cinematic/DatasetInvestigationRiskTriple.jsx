import { useState, useEffect, useCallback } from 'react';

const API = '';

const DIRSIG_RE = /\b(dataset[._-]?investigation[._-]?risk|dirsig|data[._-]?blindspot|uncovered[._-]?dataset|dataset[._-]?risk[._-]?investigation|data[._-]?risk[._-]?investigation|blindspot[._-]?data|data[._-]?gap[._-]?risk)\b/i;

export function isDirsigQuery(t) {
  return DIRSIG_RE.test(t || '');
}

function normaliseDatasets(raw) {
  if (!raw) return [];
  const arr = ['datasets', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((d, i) => ({
    id:          d.id || String(i),
    name:        d.name || d.title || d.dataset || d.label || `Dataset ${i + 1}`,
    description: String(d.description || d.summary || d.schema || '').slice(0, 300),
    type:        d.type || d.kind || d.format || '',
    domain:      d.domain || d.category || d.source || '',
    tags:        Array.isArray(d.tags) ? d.tags.join(' ') : (d.tags || ''),
    rows:        d.rows || d.row_count || d.count || '',
  }));
}

function normaliseInvestigations(raw) {
  if (!raw) return [];
  const arr = ['investigations', 'cases', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((inv, i) => ({
    id:     inv.id || String(i),
    name:   inv.name || inv.title || inv.subject || inv.case || `Investigation ${i + 1}`,
    kind:   inv.kind || inv.type || inv.category || '',
    status: inv.status || inv.state || '',
    desc:   String(inv.description || inv.summary || inv.objective || '').slice(0, 200),
    tags:   Array.isArray(inv.tags) ? inv.tags.join(' ') : (inv.tags || ''),
  }));
}

function normaliseRisks(raw) {
  if (!raw) return [];
  const arr = ['risks', 'signals', 'risk_signals', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((r, i) => ({
    id:       r.id || String(i),
    name:     r.name || r.title || r.signal || r.label || `Risk ${i + 1}`,
    severity: r.severity || r.level || r.priority || '',
    desc:     String(r.description || r.summary || r.detail || '').slice(0, 200),
    tags:     Array.isArray(r.tags) ? r.tags.join(' ') : (r.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(dsToks, other) {
  const otherToks = [
    ...tokens(other.name || other.label || other.title),
    ...tokens(other.kind || other.type || ''),
    ...tokens(other.domain || other.category || other.source || other.sector || ''),
    ...tokens(other.desc || other.description || other.summary || ''),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!dsToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (dsToks.has(t)) hits++;
  return hits / Math.max(dsToks.size, otherToks.length);
}

function correlate(datasets, investigations, risks) {
  return datasets.map(ds => {
    const dsToks = new Set([
      ...tokens(ds.name),
      ...tokens(ds.description),
      ...tokens(ds.type),
      ...tokens(ds.domain),
      ...tokens(ds.tags),
    ].filter(Boolean));

    const matchedInvs = investigations
      .map(inv => ({ ...inv, _score: matchScore(dsToks, inv) }))
      .filter(inv => inv._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);

    const matchedRisks = risks
      .map(r => ({ ...r, _score: matchScore(dsToks, r) }))
      .filter(r => r._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);

    const hasInv  = matchedInvs.length > 0;
    const hasRisk = matchedRisks.length > 0;

    let coverage;
    if (hasInv && hasRisk)   coverage = 'FULLY ARMED';
    else if (hasInv)         coverage = 'INVESTIGATED';
    else if (hasRisk)        coverage = 'RISK-FLAGGED';
    else                     coverage = 'UNCOVERED';

    return { ...ds, _invs: matchedInvs, _risks: matchedRisks, _coverage: coverage };
  });
}

export async function buildDirsigScript() {
  try {
    const [dsR, invR, rskR] = await Promise.allSettled([
      fetch(`${API}/v1/datasets`).then(r => r.json()),
      fetch(`${API}/v1/investigations`).then(r => r.json()),
      fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
    ]);
    const ds  = normaliseDatasets(dsR.status === 'fulfilled' ? dsR.value : []);
    const inv = normaliseInvestigations(invR.status === 'fulfilled' ? invR.value : []);
    const rsk = normaliseRisks(rskR.status === 'fulfilled' ? rskR.value : []);
    const corr = correlate(ds, inv, rsk);
    const fa  = corr.filter(d => d._coverage === 'FULLY ARMED').length;
    const ii  = corr.filter(d => d._coverage === 'INVESTIGATED').length;
    const rf  = corr.filter(d => d._coverage === 'RISK-FLAGGED').length;
    const unc = corr.filter(d => d._coverage === 'UNCOVERED').length;
    return `DIRSIG: ${ds.length} datasets × ${inv.length} investigations × ${rsk.length} risk signals. Fully armed: ${fa}. Investigated-only: ${ii}. Risk-flagged-only: ${rf}. Uncovered blindspots: ${unc}.`;
  } catch {
    return 'DIRSIG: dataset coverage unavailable.';
  }
}

const CY = '#00CFFF';
const AM = '#FFAA00';
const RD = '#FF3B3B';
const GR = '#00FF88';
const PU = '#AA44FF';
const TE = '#00FFCC';

const COVERAGE_COLOR = {
  'FULLY ARMED':  GR,
  'INVESTIGATED': CY,
  'RISK-FLAGGED': AM,
  'UNCOVERED':    RD,
};

const TABS = ['ALL', 'FULLY ARMED', 'INVESTIGATED', 'RISK-FLAGGED', 'UNCOVERED'];

function chip(label, color) {
  return (
    <span key={label} style={{
      fontSize: 8, padding: '1px 5px', borderRadius: 2,
      background: (color || CY) + '22', color: color || CY,
      border: `1px solid ${color || CY}44`, marginRight: 2, marginTop: 2, display: 'inline-block',
    }}>
      {label}
    </span>
  );
}

function ScoreBar({ score, color }) {
  return (
    <div style={{ height: 3, borderRadius: 2, background: '#1a1a2a', margin: '3px 0' }}>
      <div style={{ height: '100%', width: `${Math.round(score * 100)}%`, background: color || CY, borderRadius: 2 }} />
    </div>
  );
}

export default function DatasetInvestigationRiskTriple() {
  const [open, setOpen]         = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]           = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [dsR, invR, rskR] = await Promise.allSettled([
        fetch(`${API}/v1/datasets`).then(r => r.json()),
        fetch(`${API}/v1/investigations`).then(r => r.json()),
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
      ]);
      const ds  = normaliseDatasets(dsR.status === 'fulfilled' ? dsR.value : []);
      const inv = normaliseInvestigations(invR.status === 'fulfilled' ? invR.value : []);
      const rsk = normaliseRisks(rskR.status === 'fulfilled' ? rskR.value : []);
      setDatasets(correlate(ds, inv, rsk));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:dirsig-toggle', toggle);
    return () => window.removeEventListener('jarvis:dirsig-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessText('');
    try {
      const brief = await buildDirsigScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Dataset × Investigation × RiskSignal coverage brief: ${brief}. Give a 2-sentence data blindspot assessment.`,
        }),
      });
      const d = await r.json();
      const msg = d.response || d.message || d.content || brief;
      setAssessText(msg);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: msg } }));
    } catch (e) {
      setAssessText(String(e));
    } finally {
      setAssessing(false);
    }
  }, []);

  const visible = datasets.filter(ds => {
    if (tab !== 'ALL' && ds._coverage !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return ds.name.toLowerCase().includes(s) || ds.description.toLowerCase().includes(s) || ds.domain.toLowerCase().includes(s);
    }
    return true;
  });

  const fa  = datasets.filter(d => d._coverage === 'FULLY ARMED').length;
  const ii  = datasets.filter(d => d._coverage === 'INVESTIGATED').length;
  const rf  = datasets.filter(d => d._coverage === 'RISK-FLAGGED').length;
  const unc = datasets.filter(d => d._coverage === 'UNCOVERED').length;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 718240, bottom: 8, zIndex: 311,
          background: unc > 0 ? RD + '22' : '#0a0a1a',
          border: `1px solid ${unc > 0 ? RD : '#333'}`,
          borderRadius: 4, color: unc > 0 ? RD : '#666',
          fontSize: 9, padding: '3px 7px', cursor: 'pointer', fontFamily: 'monospace',
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        ◈ DIRSIG{unc > 0 ? ` (${unc})` : ''}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 40, right: 12,
      width: 420, maxHeight: '78vh',
      zIndex: 6000, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      background: '#05050d', border: `1px solid ${CY}44`, borderRadius: 8,
      boxShadow: `0 0 40px ${CY}18`,
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px', borderBottom: `1px solid ${CY}33`,
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <span style={{ color: CY, fontSize: 11, fontWeight: 700, flex: 1 }}>◈ DATASET × INVESTIGATION × RISK TRIPLE</span>
        {unc > 0 && (
          <span style={{ background: RD + '33', border: `1px solid ${RD}`, borderRadius: 3, color: RD, fontSize: 9, padding: '1px 5px' }}>
            {unc} UNCOVERED
          </span>
        )}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['DATASETS',     datasets.length, CY],
          ['FULLY ARMED',  fa,              GR],
          ['INVESTIGATED', ii,              CY],
          ['RISK-FLAGGED', rf,              AM],
          ['UNCOVERED',    unc,             RD],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 70px', minWidth: 60, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {datasets.length > 0 && [[fa, GR], [ii, CY], [rf, AM], [unc, RD]].map(([v, c], i) =>
            v > 0 ? <div key={i} style={{ flex: v, background: c, transition: 'flex .4s' }} /> : null
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '2px 8px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
            background: tab === t ? (COVERAGE_COLOR[t] || CY) + '33' : '#0a0a1a',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#888',
          }}>
            {t}{t !== 'ALL' ? ` (${datasets.filter(d => d._coverage === t).length})` : ''}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search datasets…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No datasets match filter.</div>
        )}
        {visible.map(ds => {
          const color = COVERAGE_COLOR[ds._coverage] || CY;
          const isExp = expanded === ds.id;
          return (
            <div key={ds.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : ds.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ds.name}</span>
                {ds.domain && <span style={{ fontSize: 9, color: '#666', flexShrink: 0 }}>{ds.domain}</span>}
                {ds.rows && chip(`${ds.rows} rows`, TE)}
                {chip(ds._coverage, color)}
                <span style={{ color: '#444', fontSize: 10, flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 8px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 700 }}>INVESTIGATIONS ({ds._invs.length})</div>
                    {ds._invs.length === 0
                      ? <div style={{ fontSize: 9, color: '#555' }}>No investigation coverage</div>
                      : ds._invs.map((inv, i) => (
                        <div key={i} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc' }}>{inv.name}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                            {inv.kind   && chip(inv.kind,   CY)}
                            {inv.status && chip(inv.status, GR)}
                          </div>
                          <ScoreBar score={inv._score} color={CY} />
                        </div>
                      ))
                    }
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 700 }}>RISK SIGNALS ({ds._risks.length})</div>
                    {ds._risks.length === 0
                      ? <div style={{ fontSize: 9, color: '#555' }}>No risk coverage</div>
                      : ds._risks.map((r, i) => (
                        <div key={i} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc' }}>{r.name}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                            {r.severity && chip(r.severity, r.severity === 'CRITICAL' || r.severity === 'HIGH' ? RD : AM)}
                          </div>
                          <ScoreBar score={r._score} color={AM} />
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button onClick={assess} disabled={assessing || loading} style={{
          padding: '4px 12px', fontSize: 10, background: assessing ? '#1a1a2a' : '#0a0a1a',
          border: `1px solid ${CY}44`, borderRadius: 4, color: CY, cursor: 'pointer',
        }}>
          {assessing ? 'ASSESSING…' : '▶ ASSESS'}
        </button>
        <button onClick={load} disabled={loading} style={{ padding: '4px 8px', fontSize: 10, background: '#0a0a1a', border: '1px solid #333', borderRadius: 4, color: '#888', cursor: 'pointer' }}>↺</button>
        {assessText && <span style={{ fontSize: 9, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assessText}</span>}
        <span style={{ fontSize: 9, color: '#444', flexShrink: 0 }}>{datasets.length} datasets · 90s</span>
      </div>
    </div>
  );
}
