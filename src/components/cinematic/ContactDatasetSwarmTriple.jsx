import { useState, useEffect, useCallback } from 'react';

const API = '';

const CDSWTRI_RE = /\b(contact[._-]?dataset[._-]?swarm|cdswtri|invisible[._-]?contacts?|contact[._-]?coverage[._-]?triple|contact[._-]?data[._-]?swarm|contact[._-]?swarm[._-]?data|swarm[._-]?dataset[._-]?contact)\b/i;

export function isCdswtriQuery(t) {
  return CDSWTRI_RE.test(t || '');
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function contactTokens(c) {
  return new Set([
    ...tokens(c.name || c.full_name || c.label || ''),
    ...tokens(c.email || ''),
    ...tokens(c.company || c.org || c.organisation || c.organization || ''),
    ...tokens(c.title || c.role || c.position || ''),
    ...tokens(c.description || c.desc || c.notes || c.bio || ''),
    ...tokens(Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || '')),
  ].filter(Boolean));
}

function datasetScore(cToks, ds) {
  const dsToks = [
    ...tokens(ds.name || ds.title || ds.label || ''),
    ...tokens(ds.description || ds.summary || ''),
    ...tokens(ds.type || ds.kind || ds.category || ''),
    ...tokens(Array.isArray(ds.tags) ? ds.tags.join(' ') : (ds.tags || '')),
  ].filter(Boolean);
  if (!cToks.size || !dsToks.length) return 0;
  let hits = 0;
  for (const t of dsToks) if (cToks.has(t)) hits++;
  return hits / Math.max(cToks.size, dsToks.length);
}

function swarmScore(cToks, job) {
  const jToks = [
    ...tokens(job.name || job.title || job.label || ''),
    ...tokens(job.type || job.kind || job.category || ''),
    ...tokens(job.description || job.desc || job.summary || ''),
    ...tokens(job.target || job.objective || ''),
    ...tokens(Array.isArray(job.tags) ? job.tags.join(' ') : (job.tags || '')),
  ].filter(Boolean);
  if (!cToks.size || !jToks.length) return 0;
  let hits = 0;
  for (const t of jToks) if (cToks.has(t)) hits++;
  return hits / Math.max(cToks.size, jToks.length);
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = ['contacts', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:      c.id || String(i),
    name:    c.name || c.full_name || c.label || `Contact ${i + 1}`,
    email:   c.email || '',
    company: c.company || c.org || c.organisation || c.organization || '',
    title:   c.title || c.role || c.position || '',
    desc:    String(c.description || c.desc || c.notes || '').slice(0, 180),
    tags:    Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function normaliseDatasets(raw) {
  if (!raw) return [];
  const arr = ['datasets', 'items', 'results', 'data'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((d, i) => ({
    id:   d.id || String(i),
    name: d.name || d.title || d.label || `Dataset ${i + 1}`,
    kind: d.type || d.kind || d.category || '',
    rows: d.rows || d.row_count || d.count || null,
    desc: String(d.description || d.summary || '').slice(0, 150),
    tags: Array.isArray(d.tags) ? d.tags.join(' ') : (d.tags || ''),
  }));
}

function normaliseJobs(raw) {
  if (!raw) return [];
  const arr = ['jobs', 'swarm_jobs', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((j, i) => ({
    id:     j.id || String(i),
    name:   j.name || j.title || j.label || `SwarmJob ${i + 1}`,
    type:   j.type || j.kind || j.job_type || '',
    status: j.status || j.state || '',
    desc:   String(j.description || j.desc || j.summary || '').slice(0, 150),
    tags:   Array.isArray(j.tags) ? j.tags.join(' ') : (j.tags || ''),
  }));
}

function correlate(contacts, datasets, jobs) {
  return contacts.map(c => {
    const cToks = contactTokens(c);

    const matchedDs = datasets
      .map(d => ({ ...d, _score: datasetScore(cToks, d) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedJobs = jobs
      .map(j => ({ ...j, _score: swarmScore(cToks, j) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasDs   = matchedDs.length > 0;
    const hasSwarm = matchedJobs.length > 0;

    let coverage;
    if (hasDs && hasSwarm) coverage = 'FULLY COVERED';
    else if (hasDs)        coverage = 'DOCUMENTED';
    else if (hasSwarm)     coverage = 'HUNTED';
    else                   coverage = 'INVISIBLE';

    return { ...c, _datasets: matchedDs, _jobs: matchedJobs, _coverage: coverage };
  });
}

export async function buildCdswtriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [cR, dR, jR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/datasets`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.json()),
  ]);
  const contacts  = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
  const datasets  = normaliseDatasets(dR.status === 'fulfilled' ? dR.value : []);
  const jobs      = normaliseJobs(jR.status === 'fulfilled' ? jR.value : []);
  const enriched  = correlate(contacts, datasets, jobs);
  const fc   = enriched.filter(c => c._coverage === 'FULLY COVERED').length;
  const doc  = enriched.filter(c => c._coverage === 'DOCUMENTED').length;
  const hunt = enriched.filter(c => c._coverage === 'HUNTED').length;
  const inv  = enriched.filter(c => c._coverage === 'INVISIBLE').length;
  const invNames = enriched.filter(c => c._coverage === 'INVISIBLE').slice(0, 3).map(c => c.name).join(', ') || 'none';
  return (
    `Contact × Dataset × SwarmJob Triple Coverage: ${contacts.length} contacts cross-referenced against ${datasets.length} datasets and ${jobs.length} swarm jobs. ` +
    `${fc} contacts are FULLY COVERED (dataset-documented + swarm-monitored); ${doc} are DOCUMENTED (dataset only); ` +
    `${hunt} are HUNTED (swarm job only, no dataset backing); ${inv} are INVISIBLE (no data or swarm coverage — surveillance gap). ` +
    `Invisible contacts: ${invNames}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 620;
const CY  = '#00CFFF';
const AM  = '#F59E0B';
const RD  = '#EF4444';
const GR  = '#22C55E';
const LM  = '#84CC16';

const COVERAGE_COLOR = {
  'FULLY COVERED': GR,
  'DOCUMENTED':    CY,
  'HUNTED':        LM,
  'INVISIBLE':     RD,
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

const TABS = ['ALL', 'FULLY COVERED', 'DOCUMENTED', 'HUNTED', 'INVISIBLE'];

export default function ContactDatasetSwarmTriple() {
  const [open, setOpen]             = useState(false);
  const [contacts, setContacts]     = useState([]);
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
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const hdr = { Authorization: `Bearer ${key}` };
      const [cR, dR, jR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/datasets`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.json()),
      ]);
      const rawContacts = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
      const rawDatasets = normaliseDatasets(dR.status === 'fulfilled' ? dR.value : []);
      const rawJobs     = normaliseJobs(jR.status === 'fulfilled' ? jR.value : []);
      setContacts(correlate(rawContacts, rawDatasets, rawJobs));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:cdswtri-toggle', toggle);
    return () => window.removeEventListener('jarvis:cdswtri-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildCdswtriScript();
      setAssessText(script);
      const key  = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const hdr  = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
      const chat = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ message: script }),
      }).then(r => r.json()).catch(() => null);
      const reply = chat?.response || chat?.message || chat?.reply || script;
      setAssessText(reply);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: reply } }));
    } catch (e) {
      setAssessText(String(e));
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) return null;

  const fc   = contacts.filter(c => c._coverage === 'FULLY COVERED').length;
  const doc  = contacts.filter(c => c._coverage === 'DOCUMENTED').length;
  const hunt = contacts.filter(c => c._coverage === 'HUNTED').length;
  const inv  = contacts.filter(c => c._coverage === 'INVISIBLE').length;

  const visible = contacts.filter(c => {
    if (tab !== 'ALL' && c._coverage !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (c.name + c.email + c.company + c.title + c.desc).toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div style={{
      position: 'fixed', left: 747360 % 1800, top: 60, width: PANEL_W, height: PANEL_H,
      background: 'rgba(0,0,0,0.93)', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 363, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      backdropFilter: 'blur(12px)', boxShadow: '0 0 40px #00CFFF11',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11, letterSpacing: 1 }}>◈ CDSWTRI</span>
        <span style={{ color: '#666', fontSize: 9 }}>Contact × Dataset × SwarmJob Triple Coverage</span>
        <div style={{ flex: 1 }} />
        {loading && <span style={{ fontSize: 9, color: CY }}>loading…</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 12 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 12px', flexShrink: 0 }}>
        {[
          { label: 'CONTACTS',      val: contacts.length, color: '#888' },
          { label: 'FULLY COVERED', val: fc,   color: GR },
          { label: 'DOCUMENTED',    val: doc,  color: CY },
          { label: 'HUNTED',        val: hunt, color: LM },
          { label: 'INVISIBLE',     val: inv,  color: RD },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ flex: 1, background: color + '11', border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, color, fontWeight: 700 }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {contacts.length > 0 && (
        <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
          <div style={{ height: 4, borderRadius: 2, background: '#1a1a2a', display: 'flex', overflow: 'hidden' }}>
            {[['FULLY COVERED', GR], ['DOCUMENTED', CY], ['HUNTED', LM], ['INVISIBLE', RD]].map(([state, color]) => {
              const pct = (contacts.filter(c => c._coverage === state).length / contacts.length) * 100;
              return pct > 0 ? <div key={state} style={{ width: `${pct}%`, background: color }} /> : null;
            })}
          </div>
        </div>
      )}

      {/* Tabs + Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 4, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              fontSize: 8, padding: '2px 7px', borderRadius: 3, cursor: 'pointer',
              background: tab === t ? (COVERAGE_COLOR[t] || CY) + '22' : 'transparent',
              border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#333'}`,
              color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#666',
            }}>{t}</button>
          ))}
        </div>
        <input
          placeholder="Search contacts…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', background: '#0a0a1a', border: '1px solid #1a1a2a', borderRadius: 3, padding: '3px 8px', color: '#ccc', fontSize: 9, boxSizing: 'border-box' }}
        />
      </div>

      {err && <div style={{ padding: '4px 12px', color: RD, fontSize: 9, flexShrink: 0 }}>{err}</div>}

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 6px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#444', fontSize: 10, textAlign: 'center', paddingTop: 24 }}>No contacts match current filter.</div>
        )}
        {visible.map(c => {
          const color = COVERAGE_COLOR[c._coverage];
          const isExp = expanded === c.id;
          return (
            <div key={c.id} style={{ marginBottom: 5, borderRadius: 4, border: `1px solid ${color}22`, background: color + '08', overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(isExp ? null : c.id)}
                style={{ padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span style={{ fontSize: 9, color, fontWeight: 700, minWidth: 88 }}>{c._coverage}</span>
                <span style={{ fontSize: 10, color: '#ddd', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                {c.company && chip(c.company, '#888')}
                {c.title && chip(c.title, '#666')}
                <span style={{ fontSize: 9, color: '#444' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 8px', borderTop: `1px solid ${color}22`, display: 'flex', gap: 8 }}>
                  {/* Left: Datasets */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 600 }}>DATASETS ({c._datasets.length})</div>
                    {c._datasets.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No dataset alignment</div>
                      : c._datasets.map(d => (
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
                  {/* Divider */}
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  {/* Right: SwarmJobs */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: LM, marginBottom: 4, fontWeight: 600 }}>SWARM JOBS ({c._jobs.length})</div>
                    {c._jobs.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No swarm job alignment</div>
                      : c._jobs.map(j => (
                        <div key={j.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</span>
                            {j.type && chip(j.type, LM)}
                            {j.status && chip(j.status, '#888')}
                          </div>
                          <ScoreBar score={j._score} color={LM} />
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
