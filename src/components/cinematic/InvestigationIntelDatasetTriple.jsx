import { useState, useEffect, useCallback } from 'react';

const API = '';

const IIPD_RE = /\b(iipd|investigation[._-]?intel[._-]?dataset|investigation[._-]?intel[._-]?profile[._-]?dataset|case[._-]?intel[._-]?data|unsourced[._-]?case|investigation[._-]?sourcing|intel[._-]?backed[._-]?case|dataset[._-]?backed[._-]?case|investigation[._-]?data[._-]?profile|sourced[._-]?investigation|investigation[._-]?coverage[._-]?triple)\b/i;

export function isIipdQuery(t) {
  return IIPD_RE.test(t || '');
}

function normaliseInvestigations(raw) {
  if (!raw) return [];
  const arr = ['investigations', 'cases', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((inv, i) => ({
    id:      inv.id    || String(i),
    name:    inv.title || inv.name || inv.subject || `Investigation ${i + 1}`,
    kind:    inv.kind  || inv.type || inv.category || '',
    desc:    String(inv.description || inv.summary || inv.overview || inv.detail || '').slice(0, 200),
    subject: inv.subject || inv.target || '',
    tags:    Array.isArray(inv.tags) ? inv.tags.join(' ') : (inv.tags || ''),
  }));
}

function normaliseProfiles(raw) {
  if (!raw) return [];
  const arr = ['profiles', 'intel_profiles', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((p, i) => ({
    id:       p.id || String(i),
    name:     p.name || p.title || p.actor || `Profile ${i + 1}`,
    category: p.category || p.type || p.threat_type || p.classification || '',
    desc:     String(p.description || p.summary || p.overview || p.details || '').slice(0, 200),
    aliases:  Array.isArray(p.aliases) ? p.aliases.join(' ') : (p.aliases || p.aka || ''),
    tags:     Array.isArray(p.tags) ? p.tags.join(' ') : (p.tags || ''),
  }));
}

function normaliseDatasets(raw) {
  if (!raw) return [];
  const arr = ['datasets', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((d, i) => ({
    id:    d.id || String(i),
    name:  d.name || d.title || d.dataset_name || `Dataset ${i + 1}`,
    kind:  d.type || d.kind || d.category || d.format || '',
    rows:  d.row_count || d.rows || d.count || null,
    desc:  String(d.description || d.summary || d.source || '').slice(0, 200),
    tags:  Array.isArray(d.tags) ? d.tags.join(' ') : (d.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(invToks, other) {
  const otherToks = [
    ...tokens(other.name || other.title || ''),
    ...tokens(other.category || other.kind || other.type || ''),
    ...tokens(other.desc || other.description || other.summary || ''),
    ...tokens(other.aliases || ''),
    ...tokens(other.tags || ''),
    ...tokens(other.subject || ''),
  ].filter(Boolean);
  if (!invToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (invToks.has(t)) hits++;
  return hits / Math.max(invToks.size, otherToks.length);
}

function correlate(investigations, profiles, datasets) {
  return investigations.map(inv => {
    const toks = new Set([
      ...tokens(inv.name),
      ...tokens(inv.kind),
      ...tokens(inv.desc),
      ...tokens(inv.subject),
      ...tokens(inv.tags),
    ].filter(Boolean));

    const matchedProfiles = profiles
      .map(p => ({ ...p, _score: matchScore(toks, p) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedDatasets = datasets
      .map(d => ({ ...d, _score: matchScore(toks, d) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasProfile = matchedProfiles.length > 0;
    const hasDataset = matchedDatasets.length > 0;

    let coverage;
    if (hasProfile && hasDataset)  coverage = 'FULLY SOURCED';
    else if (hasProfile)           coverage = 'PROFILED';
    else if (hasDataset)           coverage = 'DATA-BACKED';
    else                           coverage = 'UNSOURCED';

    return { ...inv, _profiles: matchedProfiles, _datasets: matchedDatasets, _coverage: coverage };
  });
}

export async function buildIipdScript() {
  const [invR, pR, dR] = await Promise.allSettled([
    fetch(`${API}/v1/investigations`).then(r => r.json()),
    fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
    fetch(`${API}/v1/datasets`).then(r => r.json()),
  ]);
  const investigations = normaliseInvestigations(invR.status === 'fulfilled' ? invR.value : []);
  const profiles       = normaliseProfiles(pR.status === 'fulfilled' ? pR.value : []);
  const datasets       = normaliseDatasets(dR.status === 'fulfilled' ? dR.value : []);
  const enriched       = correlate(investigations, profiles, datasets);
  const fs   = enriched.filter(e => e._coverage === 'FULLY SOURCED').length;
  const pro  = enriched.filter(e => e._coverage === 'PROFILED').length;
  const db   = enriched.filter(e => e._coverage === 'DATA-BACKED').length;
  const uns  = enriched.filter(e => e._coverage === 'UNSOURCED').length;
  return (
    `Investigation × Intel Profile × Dataset Triple Coverage: ${investigations.length} investigations cross-referenced against ` +
    `${profiles.length} intel profiles and ${datasets.length} datasets. ` +
    `${fs} FULLY SOURCED (threat actor profile + dataset found — well-backed cases); ` +
    `${pro} PROFILED (intel profile found, no dataset backing); ` +
    `${db} DATA-BACKED (dataset found, no intel profile alignment); ` +
    `${uns} UNSOURCED (no intel profile or dataset — critical intelligence gap). ` +
    `Most exposed: ${enriched.filter(e => e._coverage === 'UNSOURCED').slice(0, 3).map(e => e.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const GN = '#22C55E';
const AM = '#F59E0B';
const CY = '#00CFFF';
const RD = '#EF4444';

const COVERAGE_COLOR = {
  'FULLY SOURCED': GN,
  'PROFILED':      AM,
  'DATA-BACKED':   CY,
  'UNSOURCED':     RD,
};

const chip = (label, color = CY) => (
  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: color + '22', color, border: `1px solid ${color}55`, marginLeft: 4, whiteSpace: 'nowrap' }}>
    {label}
  </span>
);

const ScoreBar = ({ score, color }) => (
  <div style={{ height: 3, width: '100%', background: '#1a1a2a', borderRadius: 2, marginTop: 2 }}>
    <div style={{ height: 3, width: `${Math.round(score * 100)}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
  </div>
);

const TABS = ['ALL', 'FULLY SOURCED', 'PROFILED', 'DATA-BACKED', 'UNSOURCED'];

export default function InvestigationIntelDatasetTriple() {
  const [open, setOpen]             = useState(false);
  const [items, setItems]           = useState([]);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]               = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [invR, pR, dR] = await Promise.allSettled([
        fetch(`${API}/v1/investigations`).then(r => r.json()),
        fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
        fetch(`${API}/v1/datasets`).then(r => r.json()),
      ]);
      const raw_inv = normaliseInvestigations(invR.status === 'fulfilled' ? invR.value : []);
      const raw_p   = normaliseProfiles(pR.status === 'fulfilled' ? pR.value : []);
      const raw_d   = normaliseDatasets(dR.status === 'fulfilled' ? dR.value : []);
      setItems(correlate(raw_inv, raw_p, raw_d));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:iipd-toggle', toggle);
    return () => window.removeEventListener('jarvis:iipd-toggle', toggle);
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
      const brief = await buildIipdScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Investigation intel-profile and dataset sourcing brief: ${brief}. Give a 2-sentence assessment of investigation intelligence and data coverage, highlighting critical sourcing gaps.` }),
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

  if (!open) {
    const unsCount = items.filter(e => e._coverage === 'UNSOURCED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investigation × Intel Profile × Dataset Triple Coverage (IIPD)"
        style={{
          position: 'fixed', left: 724960, bottom: 8, zIndex: 323,
          background: unsCount > 0 ? '#F59E0B22' : '#0a0a1a',
          border: `1px solid ${unsCount > 0 ? AM : CY + '44'}`,
          color: unsCount > 0 ? AM : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ IIPD{unsCount > 0 ? ` ⚠${unsCount}` : ''}
      </button>
    );
  }

  const fs  = items.filter(e => e._coverage === 'FULLY SOURCED').length;
  const pro = items.filter(e => e._coverage === 'PROFILED').length;
  const db  = items.filter(e => e._coverage === 'DATA-BACKED').length;
  const uns = items.filter(e => e._coverage === 'UNSOURCED').length;

  const visible = items.filter(e =>
    (tab === 'ALL' || e._coverage === tab) &&
    (!search || e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.kind.toLowerCase().includes(search.toLowerCase()) ||
      e.desc.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6001, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ INVESTIGATION × INTEL PROFILE × DATASET TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>IIPD</span>
        {uns > 0 && <span style={{ fontSize: 10, color: AM, background: '#F59E0B22', border: '1px solid #F59E0B55', borderRadius: 3, padding: '1px 5px' }}>⚠ {uns} UNSOURCED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['INVESTIGATIONS', items.length, CY],
          ['FULLY SOURCED',  fs,           GN],
          ['PROFILED',       pro,          AM],
          ['DATA-BACKED',    db,           CY],
          ['UNSOURCED',      uns,          RD],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {items.length > 0 && [
            [fs, GN], [pro, AM], [db, CY], [uns, RD],
          ].map(([v, c], i) => (
            v > 0 ? <div key={i} style={{ flex: v, background: c, transition: 'flex .4s' }} /> : null
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '2px 8px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
            background: tab === t ? (COVERAGE_COLOR[t] || CY) + '33' : '#0a0a1a',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#888',
          }}>{t}{t !== 'ALL' ? ` (${items.filter(e => e._coverage === t).length})` : ''}</button>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search investigations…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No investigations match filter.</div>}
        {visible.map(inv => {
          const color = COVERAGE_COLOR[inv._coverage] || CY;
          const isExp = expanded === inv.id;
          return (
            <div key={inv.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : inv.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.name}</span>
                {inv.kind && chip(inv.kind, '#888')}
                {chip(inv._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 600 }}>INTEL PROFILES ({inv._profiles.length})</div>
                    {inv._profiles.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No threat actor profile alignment</div>
                      : inv._profiles.map(p => (
                        <div key={p.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                            {p.category && chip(p.category, AM)}
                          </div>
                          <ScoreBar score={p._score} color={AM} />
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 600 }}>DATASETS ({inv._datasets.length})</div>
                    {inv._datasets.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No dataset coverage found</div>
                      : inv._datasets.map(d => (
                        <div key={d.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                            {d.kind && chip(d.kind, CY)}
                            {d.rows != null && <span style={{ fontSize: 8, color: '#555' }}>{d.rows.toLocaleString()} rows</span>}
                          </div>
                          <ScoreBar score={d._score} color={CY} />
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

      <div style={{ padding: '6px 12px', borderTop: '1px solid #00CFFF22', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button onClick={load} disabled={loading} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: '#0a0a1a', border: '1px solid #00CFFF44', color: CY, cursor: 'pointer' }}>
          {loading ? '…' : '↻ REFRESH'}
        </button>
        <button onClick={assess} disabled={assessing} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: assessing ? '#1a1a2a' : '#F59E0B22', border: `1px solid ${AM}55`, color: AM, cursor: 'pointer' }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <span style={{ fontSize: 9, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assessText}</span>
        )}
      </div>
    </div>
  );
}
