import { useState, useEffect, useCallback } from 'react';

const API = '';

const KRSTQ_RE = /\b(krstq|knowledge[._-]?report[._-]?scenario[._-]?task|knowledge[._-]?utilis?ation|knowledge[._-]?utiliz?ation|archival[._-]?knowledge|fully[._-]?operationali[sz]ed[._-]?knowledge|operationali[sz]ed[._-]?knowledge|knowledge[._-]?quad|knowledge[._-]?report[._-]?task|knowledge[._-]?scenario[._-]?report)\b/i;

export function isKrstqQuery(t) {
  return KRSTQ_RE.test(t || '');
}

function normaliseArticles(raw) {
  if (!raw) return [];
  const arr = ['articles', 'items', 'results', 'data', 'records', 'knowledge'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((a, i) => ({
    id:       a.id || String(i),
    name:     a.title || a.name || a.label || `Article ${i + 1}`,
    category: a.category || a.type || a.kind || '',
    summary:  String(a.summary || a.description || a.content || a.body || '').slice(0, 200),
    tags:     Array.isArray(a.tags) ? a.tags.join(' ') : (a.tags || ''),
  }));
}

function normaliseReports(raw) {
  if (!raw) return [];
  const arr = ['reports', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((r, i) => ({
    id:       r.id || String(i),
    name:     r.title || r.name || r.label || `Report ${i + 1}`,
    type:     r.type || r.kind || r.category || '',
    date:     r.date || r.created_at || r.published_at || '',
    summary:  String(r.summary || r.description || r.abstract || '').slice(0, 200),
    tags:     Array.isArray(r.tags) ? r.tags.join(' ') : (r.tags || ''),
  }));
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  const arr = ['scenarios', 'items', 'results', 'data', 'records', 'plans'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:       s.id || String(i),
    name:     s.name || s.title || s.label || `Scenario ${i + 1}`,
    status:   s.status || s.state || '',
    category: s.category || s.type || s.kind || '',
    desc:     String(s.description || s.summary || s.detail || '').slice(0, 200),
    tags:     Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function normaliseTasks(raw) {
  if (!raw) return [];
  const arr = ['tasks', 'items', 'results', 'data', 'records', 'missions'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((t, i) => ({
    id:       t.id || String(i),
    name:     t.title || t.name || t.label || `Task ${i + 1}`,
    status:   t.status || t.state || '',
    priority: t.priority || t.urgency || '',
    desc:     String(t.description || t.summary || t.detail || '').slice(0, 200),
    tags:     Array.isArray(t.tags) ? t.tags.join(' ') : (t.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(artToks, other) {
  const otherToks = [
    ...tokens(other.name || ''),
    ...tokens(other.type || other.kind || other.category || ''),
    ...tokens(other.status || ''),
    ...tokens(other.summary || other.desc || other.description || ''),
    ...tokens(other.tags || ''),
  ].filter(Boolean);
  if (!artToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (artToks.has(t)) hits++;
  return hits / Math.max(artToks.size, otherToks.length);
}

function correlate(articles, reports, scenarios, tasks) {
  return articles.map(art => {
    const toks = new Set([
      ...tokens(art.name),
      ...tokens(art.category),
      ...tokens(art.summary),
      ...tokens(art.tags),
    ].filter(Boolean));

    const matchedReports = reports
      .map(r => ({ ...r, _score: matchScore(toks, r) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedScenarios = scenarios
      .map(s => ({ ...s, _score: matchScore(toks, s) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedTasks = tasks
      .map(t => ({ ...t, _score: matchScore(toks, t) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const sourceCount = [matchedReports.length > 0, matchedScenarios.length > 0, matchedTasks.length > 0].filter(Boolean).length;

    let coverage;
    if (sourceCount === 3)      coverage = 'FULLY OPERATIONALISED';
    else if (sourceCount === 2) coverage = 'RESOURCED';
    else if (sourceCount === 1) coverage = 'MINIMAL';
    else                        coverage = 'ARCHIVAL';

    return { ...art, _reports: matchedReports, _scenarios: matchedScenarios, _tasks: matchedTasks, _coverage: coverage };
  });
}

export async function buildKrstqScript() {
  const [artR, rptR, scnR, tskR] = await Promise.allSettled([
    fetch(`${API}/knowledge/`).then(r => r.json()),
    fetch(`${API}/v1/reports`).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`).then(r => r.json()),
    fetch(`${API}/entities/Task`).then(r => r.json()),
  ]);
  const articles  = normaliseArticles(artR.status === 'fulfilled' ? artR.value : []);
  const reports   = normaliseReports(rptR.status === 'fulfilled' ? rptR.value : []);
  const scenarios = normaliseScenarios(scnR.status === 'fulfilled' ? scnR.value : []);
  const tasks     = normaliseTasks(tskR.status === 'fulfilled' ? tskR.value : []);
  const enriched  = correlate(articles, reports, scenarios, tasks);
  const fo  = enriched.filter(e => e._coverage === 'FULLY OPERATIONALISED').length;
  const rs  = enriched.filter(e => e._coverage === 'RESOURCED').length;
  const mn  = enriched.filter(e => e._coverage === 'MINIMAL').length;
  const ar  = enriched.filter(e => e._coverage === 'ARCHIVAL').length;
  return (
    `Knowledge × Report × Scenario × Task Quad Coverage: ${articles.length} KB articles cross-referenced against ` +
    `${reports.length} reports, ${scenarios.length} scenarios, and ${tasks.length} tasks. ` +
    `${fo} FULLY OPERATIONALISED (report + scenario + task coverage); ` +
    `${rs} RESOURCED (two backing sources); ` +
    `${mn} MINIMAL (one backing source); ` +
    `${ar} ARCHIVAL (no report, scenario, or task — knowledge sitting idle). ` +
    `Top archival articles: ${enriched.filter(e => e._coverage === 'ARCHIVAL').slice(0, 3).map(e => e.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 720;
const PANEL_H = 640;
const AM = '#F59E0B';
const CY = '#00CFFF';
const GR = '#22C55E';
const PU = '#A855F7';
const TL = '#14B8A6';

const COVERAGE_COLOR = {
  'FULLY OPERATIONALISED': GR,
  'RESOURCED':             TL,
  'MINIMAL':               AM,
  'ARCHIVAL':              '#555',
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

const TABS = ['ALL', 'FULLY OPERATIONALISED', 'RESOURCED', 'MINIMAL', 'ARCHIVAL'];

export default function KnowledgeReportScenarioTaskQuad() {
  const [open, setOpen]             = useState(false);
  const [articles, setArticles]     = useState([]);
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
      const [artR, rptR, scnR, tskR] = await Promise.allSettled([
        fetch(`${API}/knowledge/`).then(r => r.json()),
        fetch(`${API}/v1/reports`).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`).then(r => r.json()),
        fetch(`${API}/entities/Task`).then(r => r.json()),
      ]);
      const raw_a = normaliseArticles(artR.status === 'fulfilled' ? artR.value : []);
      const raw_r = normaliseReports(rptR.status === 'fulfilled' ? rptR.value : []);
      const raw_s = normaliseScenarios(scnR.status === 'fulfilled' ? scnR.value : []);
      const raw_t = normaliseTasks(tskR.status === 'fulfilled' ? tskR.value : []);
      setArticles(correlate(raw_a, raw_r, raw_s, raw_t));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:krstq-toggle', toggle);
    return () => window.removeEventListener('jarvis:krstq-toggle', toggle);
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
      const brief = await buildKrstqScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Knowledge utilisation quad coverage brief: ${brief}. Give a 2-sentence assessment of how well knowledge is being operationalised across reports, scenarios, and tasks.` }),
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
    const archivalCount = articles.filter(a => a._coverage === 'ARCHIVAL').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Knowledge × Report × Scenario × Task Quad Coverage (KRSTQ)"
        style={{
          position: 'fixed', left: 738400, bottom: 8, zIndex: 347,
          background: archivalCount > 0 ? '#F59E0B22' : '#0a0a1a',
          border: `1px solid ${archivalCount > 0 ? AM : CY + '44'}`,
          color: archivalCount > 0 ? AM : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ KRSTQ{archivalCount > 0 ? ` ⚠${archivalCount}` : ''}
      </button>
    );
  }

  const fo  = articles.filter(a => a._coverage === 'FULLY OPERATIONALISED').length;
  const rs  = articles.filter(a => a._coverage === 'RESOURCED').length;
  const mn  = articles.filter(a => a._coverage === 'MINIMAL').length;
  const ar  = articles.filter(a => a._coverage === 'ARCHIVAL').length;

  const visible = articles.filter(a =>
    (tab === 'ALL' || a._coverage === tab) &&
    (!search || a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.category.toLowerCase().includes(search.toLowerCase()) ||
      a.summary.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6001, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ KNOWLEDGE × REPORT × SCENARIO × TASK QUAD</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>KRSTQ</span>
        {ar > 0 && <span style={{ fontSize: 10, color: AM, background: '#F59E0B22', border: '1px solid #F59E0B55', borderRadius: 3, padding: '1px 5px' }}>⚠ {ar} ARCHIVAL</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['KB ARTICLES',           articles.length, CY],
          ['FULLY OPERATIONALISED', fo,              GR],
          ['RESOURCED',             rs,              TL],
          ['MINIMAL',               mn,              AM],
          ['ARCHIVAL',              ar,              '#555'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {articles.length > 0 && [
            [fo, GR], [rs, TL], [mn, AM], [ar, '#444']
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
          }}>{t}{t !== 'ALL' ? ` (${articles.filter(a => a._coverage === t).length})` : ''}</button>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search knowledge articles…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: AM, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No articles match filter.</div>}
        {visible.map(art => {
          const color = COVERAGE_COLOR[art._coverage] || CY;
          const isExp = expanded === art.id;
          return (
            <div key={art.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : art.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{art.name}</span>
                {art.category && chip(art.category, '#888')}
                {chip(art._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 600 }}>REPORTS ({art._reports.length})</div>
                    {art._reports.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No report alignment</div>
                      : art._reports.map(r => (
                        <div key={r.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                            {r.type && chip(r.type, '#888')}
                          </div>
                          <ScoreBar score={r._score} color={AM} />
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: PU, marginBottom: 4, fontWeight: 600 }}>SCENARIOS ({art._scenarios.length})</div>
                    {art._scenarios.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No scenario alignment</div>
                      : art._scenarios.map(s => (
                        <div key={s.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                            {s.status && chip(s.status, s.status?.toLowerCase?.().includes('active') ? GR : '#888')}
                            {s.category && chip(s.category, '#888')}
                          </div>
                          <ScoreBar score={s._score} color={PU} />
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: GR, marginBottom: 4, fontWeight: 600 }}>TASKS ({art._tasks.length})</div>
                    {art._tasks.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No task alignment</div>
                      : art._tasks.map(t => (
                        <div key={t.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                            {t.priority && chip(t.priority, t.priority?.toLowerCase?.().includes('high') || t.priority?.toLowerCase?.().includes('crit') ? '#EF4444' : '#888')}
                            {t.status && chip(t.status, t.status?.toLowerCase?.().includes('done') || t.status?.toLowerCase?.().includes('complet') ? GR : '#888')}
                          </div>
                          <ScoreBar score={t._score} color={GR} />
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
