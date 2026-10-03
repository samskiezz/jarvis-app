import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SJDKN_RE = /\b(sjdkn|swarm[_\s-]?dataset[_\s-]?knowl\w*|swarm[_\s-]?data[_\s-]?kb|swarm[_\s-]?knowl\w*[_\s-]?coverage|swarm[_\s-]?provisioned|blind[_\s-]?swarm[_\s-]?job|swarm[_\s-]?job[_\s-]?provision|provisioned[_\s-]?swarm)\b/i;

export function isSjdknQuery(t) { return SJDKN_RE.test(t || ''); }

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

function normJobs(raw) {
  return normaliseArray(raw).map(j => ({
    id: j.id || j._id || String(Math.random()),
    label: j.name || j.title || j.job_type || j.type || 'Unnamed Job',
    description: String(j.description || j.summary || j.detail || ''),
    jobType: j.job_type || j.type || j.kind || '',
    tags: Array.isArray(j.tags) ? j.tags : [],
  }));
}

function normDatasets(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.datasets ?? raw?.items ?? raw?.data ?? []);
  return arr.map(d => ({
    id: d.id || d._id || String(Math.random()),
    title: d.name || d.title || d.dataset_name || 'Unnamed Dataset',
    kind: d.kind || d.type || d.format || '',
    rowCount: d.row_count || d.rows || d.count || null,
    tags: Array.isArray(d.tags) ? d.tags : [],
    description: String(d.description || d.summary || ''),
  }));
}

function normKb(raw) {
  return normaliseArray(raw).map(a => ({
    id: a.id || a._id || String(Math.random()),
    title: a.title || a.name || a.heading || 'Untitled Article',
    content: String(a.content || a.body || a.text || a.summary || '').slice(0, 400),
    category: a.category || a.type || '',
    tags: Array.isArray(a.tags) ? a.tags : [],
  }));
}

function matchScore(jobToks, fields) {
  if (!jobToks.length) return 0;
  const pool = tok(fields.join(' '));
  if (!pool.length) return 0;
  const hits = jobToks.filter(t => pool.includes(t)).length;
  return hits / Math.max(jobToks.length, pool.length);
}

const THRESHOLD = 0.1;

function correlate(jobs, datasets, articles) {
  return jobs.map(job => {
    const jobToks = tok([job.label, job.description, job.jobType, ...job.tags].join(' '));

    const bestDs = datasets.reduce((best, d) => {
      const s = matchScore(jobToks, [d.title, d.description, d.kind, ...d.tags]);
      return s > best.score ? { score: s, item: d } : best;
    }, { score: 0, item: null });

    const bestKb = articles.reduce((best, a) => {
      const s = matchScore(jobToks, [a.title, a.content, a.category, ...a.tags]);
      return s > best.score ? { score: s, item: a } : best;
    }, { score: 0, item: null });

    const hasDs = bestDs.score >= THRESHOLD;
    const hasKb = bestKb.score >= THRESHOLD;

    let state;
    if (hasDs && hasKb) state = 'FULLY PROVISIONED';
    else if (hasDs) state = 'DATA-BACKED';
    else if (hasKb) state = 'KB-DOCUMENTED';
    else state = 'BLIND';

    return { ...job, state, ds: hasDs ? bestDs : null, kb: hasKb ? bestKb : null };
  });
}

export async function buildSjdknScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [jR, dR, kR] = await Promise.allSettled([
    fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/datasets`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.ok ? r.json() : null),
  ]);
  const jobs = normJobs(jR.status === 'fulfilled' ? jR.value : []);
  const datasets = normDatasets(dR.status === 'fulfilled' ? dR.value : []);
  const articles = normKb(kR.status === 'fulfilled' && kR.value ? kR.value : []);
  const rows = correlate(jobs, datasets, articles);
  const fp = rows.filter(r => r.state === 'FULLY PROVISIONED').length;
  const db = rows.filter(r => r.state === 'DATA-BACKED').length;
  const kb = rows.filter(r => r.state === 'KB-DOCUMENTED').length;
  const bl = rows.filter(r => r.state === 'BLIND').length;
  return `SJDKN SwarmJob × Dataset × Knowledge: ${jobs.length} swarm jobs cross-referenced against ${datasets.length} datasets and ${articles.length} KB articles. ` +
    `FULLY PROVISIONED: ${fp} (dataset backing + KB documented). ` +
    `DATA-BACKED: ${db} (dataset found, no KB article). ` +
    `KB-DOCUMENTED: ${kb} (KB article found, no dataset). ` +
    `BLIND: ${bl} (no data or knowledge backing — operational gap).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 88, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY PROVISIONED': '#22d3ee',
  'DATA-BACKED': '#34d399',
  'KB-DOCUMENTED': '#a78bfa',
  'BLIND': '#f59e0b',
};
const STATE_ORDER = ['FULLY PROVISIONED', 'DATA-BACKED', 'KB-DOCUMENTED', 'BLIND'];

export default function SwarmJobDatasetKnowledgeTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [articles, setArticles] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const hdr = { Authorization: `Bearer ${key}` };
    try {
      const [jR, dR, kR] = await Promise.allSettled([
        fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/datasets`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/knowledge/`, { headers: hdr }).then(r => r.ok ? r.json() : null),
      ]);
      const jobs = normJobs(jR.status === 'fulfilled' ? jR.value : []);
      const ds = normDatasets(dR.status === 'fulfilled' ? dR.value : []);
      const kb = normKb(kR.status === 'fulfilled' && kR.value ? kR.value : []);
      setDatasets(ds);
      setArticles(kb);
      setRows(correlate(jobs, ds, kb));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (_) {}
    setLoading(false);
  }, []);

  const toggle = useCallback(() => setOpen(o => !o), []);

  useEffect(() => {
    window.addEventListener('jarvis:sjdkn-toggle', toggle);
    return () => window.removeEventListener('jarvis:sjdkn-toggle', toggle);
  }, [toggle]);

  useEffect(() => {
    if (open) {
      load();
      intervalRef.current = setInterval(load, 90_000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
    const fp = rows.filter(r => r.state === 'FULLY PROVISIONED').length;
    const bl = rows.filter(r => r.state === 'BLIND').length;
    const summary = `SJDKN: ${rows.length} swarm jobs. FULLY PROVISIONED: ${fp}. DATA-BACKED: ${rows.filter(r => r.state === 'DATA-BACKED').length}. KB-DOCUMENTED: ${rows.filter(r => r.state === 'KB-DOCUMENTED').length}. BLIND (gap): ${bl}. ${datasets.length} datasets, ${articles.length} KB articles indexed.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: `Assess this SJDKN swarm job dataset and knowledge provisioning state. Identify the two highest-priority blind swarm jobs that need data or knowledge backing: ${summary}` }),
      });
      const d = await r.json();
      const text = d.response ?? d.message ?? summary;
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (_) {}
    setAssessing(false);
  }, [rows, datasets, articles]);

  const stateCounts = STATE_ORDER.reduce((acc, s) => ({ ...acc, [s]: rows.filter(r => r.state === s).length }), {});
  const visible = rows.filter(r =>
    (filter === 'ALL' || r.state === filter) &&
    (!search || r.label.toLowerCase().includes(search.toLowerCase()))
  );
  const blindCount = stateCounts['BLIND'] ?? 0;

  const PANEL = {
    position: 'fixed', right: 16, top: 16, zIndex: 9986, width: 700, maxHeight: 620,
    background: 'rgba(4,7,12,0.97)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono',monospace",
    color: '#e2e8f0', boxShadow: '0 0 60px rgba(245,158,11,0.06)', overflow: 'hidden',
  };

  if (!open) {
    return (
      <button onClick={toggle} title="SJDKN SwarmJob × Dataset × Knowledge Triple Coverage" style={{
        position: 'fixed', left: 760240, bottom: 8, zIndex: 386,
        background: 'rgba(4,7,12,0.82)', border: '1px solid rgba(255,255,255,0.15)',
        color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
        letterSpacing: 1, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        ◈ SJDKN
        {blindCount > 0 && (
          <span style={{ background: '#f59e0b', color: '#000', borderRadius: 3, fontSize: 8, padding: '1px 4px', fontWeight: 700 }}>
            {blindCount}
          </span>
        )}
      </button>
    );
  }

  const total = rows.length;
  const covered = stateCounts['FULLY PROVISIONED'] ?? 0;
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;

  return (
    <div style={PANEL}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ SJDKN</span>
        <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>SwarmJob × Dataset × Knowledge Triple Coverage</span>
        {loading && <span style={{ color: '#64748b', fontSize: 9 }}>updating…</span>}
        {lastUpdated && <span style={{ color: '#475569', fontSize: 9 }}>{lastUpdated}</span>}
        <button onClick={toggle} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        {STATE_ORDER.map(s => (
          <div key={s} style={TILE}>
            <div style={{ ...LABEL, color: STATE_COLOR[s] }}>{s}</div>
            <div style={{ ...VAL, color: STATE_COLOR[s] }}>{stateCounts[s] ?? 0}</div>
          </div>
        ))}
        <div style={TILE}>
          <div style={LABEL}>TOTAL</div>
          <div style={VAL}>{total}</div>
        </div>
        <div style={TILE}>
          <div style={LABEL}>DATASETS</div>
          <div style={{ ...VAL, fontSize: 16 }}>{datasets.length}</div>
        </div>
        <div style={TILE}>
          <div style={LABEL}>KB ARTICLES</div>
          <div style={{ ...VAL, fontSize: 16 }}>{articles.length}</div>
        </div>
      </div>

      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginBottom: 4 }}>
          <span>FULLY PROVISIONED COVERAGE</span>
          <span>{pct}% · {datasets.length} datasets · {articles.length} KB articles</span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#22d3ee', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        {['ALL', ...STATE_ORDER].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#f59e0b') : 'rgba(255,255,255,0.05)',
            border: 'none', borderRadius: 3, color: filter === f ? '#000' : '#94a3b8',
            fontSize: 8, padding: '2px 7px', cursor: 'pointer', letterSpacing: 0.5, fontFamily: 'inherit',
          }}>{f}</button>
        ))}
      </div>

      <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search swarm jobs…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e2e8f0', fontFamily: 'inherit', fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
        {visible.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 10, textAlign: 'center', padding: 20 }}>no swarm jobs match</div>
        ) : visible.map((job, i) => (
          <div key={job.id ?? i} style={{
            padding: '7px 10px', marginBottom: 5, borderRadius: 5,
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${STATE_COLOR[job.state]}22`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: job.ds || job.kb ? 4 : 0 }}>
              <span style={{ fontSize: 8, color: STATE_COLOR[job.state], minWidth: 130, letterSpacing: 0.5, flexShrink: 0 }}>{job.state}</span>
              <span style={{ fontSize: 10, color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {job.label || '—'}
              </span>
              {job.jobType && <span style={{ fontSize: 8, color: '#64748b', background: 'rgba(255,255,255,0.06)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>{job.jobType}</span>}
            </div>
            {(job.ds || job.kb) && (
              <div style={{ paddingLeft: 138, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {job.ds && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 8, color: '#34d399', minWidth: 16 }}>DS</span>
                    <span style={{ fontSize: 9, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.ds.item?.title}</span>
                    <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, flexShrink: 0 }}>
                      <div style={{ height: '100%', width: `${Math.round(job.ds.score * 100)}%`, background: '#34d399', borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 7, color: '#475569', minWidth: 24 }}>{Math.round(job.ds.score * 100)}%</span>
                  </div>
                )}
                {job.kb && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 8, color: '#a78bfa', minWidth: 16 }}>KB</span>
                    <span style={{ fontSize: 9, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.kb.item?.title}</span>
                    <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, flexShrink: 0 }}>
                      <div style={{ height: '100%', width: `${Math.round(job.kb.score * 100)}%`, background: '#a78bfa', borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 7, color: '#475569', minWidth: 24 }}>{Math.round(job.kb.score * 100)}%</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 }}>
        <button onClick={load} disabled={loading} style={{
          flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 4, color: '#94a3b8', fontSize: 9, padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
        }}>⟳ REFRESH</button>
        <button onClick={assess} disabled={assessing} style={{
          flex: 1, background: assessing ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.12)',
          border: '1px solid rgba(245,158,11,0.3)', borderRadius: 4,
          color: '#f59e0b', fontSize: 9, padding: '5px 0', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1,
        }}>{assessing ? '…ASSESSING' : '⬡ ASSESS'}</button>
      </div>

      <div style={{ padding: '4px 14px', borderTop: '1px solid rgba(255,255,255,0.04)', fontSize: 8, color: 'rgba(0,212,255,0.25)', textAlign: 'right' }}>
        /entities/SwarmJob × /v1/datasets × /knowledge/
      </div>
    </div>
  );
}
