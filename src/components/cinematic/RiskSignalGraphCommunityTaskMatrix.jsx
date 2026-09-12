import { useState, useEffect, useCallback } from 'react';

const API = '';

const RGCTORM_RE = /\b(rgctorm|risk[._-]?graph[._-]?community[._-]?task|network[._-]?risk[._-]?response|community[._-]?risk[._-]?task|risk[._-]?response[._-]?matrix|unaddressed[._-]?risk[._-]?response|risk[._-]?network[._-]?task|risk[._-]?community[._-]?task|community[._-]?risk[._-]?response)\b/i;

export function isRgctormQuery(t) {
  return RGCTORM_RE.test(t || '');
}

function normaliseSignals(raw) {
  if (!raw) return [];
  const arr = ['signals', 'items', 'results', 'data', 'records', 'risks'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:       s.id || String(i),
    name:     s.title || s.name || s.signal || s.label || `Signal ${i + 1}`,
    severity: s.severity || s.level || s.priority || '',
    category: s.category || s.type || s.kind || s.sector || '',
    desc:     String(s.description || s.summary || s.detail || s.source || '').slice(0, 200),
    tags:     Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function normaliseCommunities(raw) {
  if (!raw) return [];
  const arr = ['communities', 'clusters', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:      c.id || String(i),
    name:    c.label || c.name || c.title || `Community ${i + 1}`,
    type:    c.type || c.kind || c.category || '',
    members: Array.isArray(c.members) ? c.members.join(' ') : (String(c.members || c.member_labels || '')),
    summary: String(c.summary || c.description || c.detail || '').slice(0, 200),
    tags:    Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
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

function matchScore(sigToks, other) {
  const otherToks = [
    ...tokens(other.name || ''),
    ...tokens(other.type || other.kind || other.category || ''),
    ...tokens(other.status || ''),
    ...tokens(other.summary || other.desc || other.description || ''),
    ...tokens(other.tags || ''),
    ...tokens(other.members || ''),
  ].filter(Boolean);
  if (!sigToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (sigToks.has(t)) hits++;
  return hits / Math.max(sigToks.size, otherToks.length);
}

function correlate(signals, communities, tasks) {
  return signals.map(sig => {
    const toks = new Set([
      ...tokens(sig.name),
      ...tokens(sig.category),
      ...tokens(sig.desc),
      ...tokens(sig.tags),
    ].filter(Boolean));

    const matchedComms = communities
      .map(c => ({ ...c, _score: matchScore(toks, c) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedTasks = tasks
      .map(t => ({ ...t, _score: matchScore(toks, t) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasCommunity = matchedComms.length > 0;
    const hasTask = matchedTasks.length > 0;

    let coverage;
    if (hasCommunity && hasTask)       coverage = 'FULLY RESPONDED';
    else if (hasCommunity && !hasTask) coverage = 'COMMUNITY-LINKED';
    else if (!hasCommunity && hasTask) coverage = 'TASK-DRIVEN';
    else                               coverage = 'UNADDRESSED';

    return { ...sig, _communities: matchedComms, _tasks: matchedTasks, _coverage: coverage };
  });
}

export async function buildRgctormScript() {
  const [sigR, comR, tskR] = await Promise.allSettled([
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
    fetch(`${API}/v1/graph/communities`).then(r => r.json()),
    fetch(`${API}/entities/Task`).then(r => r.json()),
  ]);
  const signals     = normaliseSignals(sigR.status === 'fulfilled' ? sigR.value : []);
  const communities = normaliseCommunities(comR.status === 'fulfilled' ? comR.value : []);
  const tasks       = normaliseTasks(tskR.status === 'fulfilled' ? tskR.value : []);
  const enriched    = correlate(signals, communities, tasks);
  const fr = enriched.filter(e => e._coverage === 'FULLY RESPONDED').length;
  const cl = enriched.filter(e => e._coverage === 'COMMUNITY-LINKED').length;
  const td = enriched.filter(e => e._coverage === 'TASK-DRIVEN').length;
  const ua = enriched.filter(e => e._coverage === 'UNADDRESSED').length;
  return (
    `Risk Signal × Graph Community × Task Operational Response Matrix: ${signals.length} active risk signals cross-referenced against ` +
    `${communities.length} network communities and ${tasks.length} tasks. ` +
    `${fr} FULLY RESPONDED (community context + task response); ` +
    `${cl} COMMUNITY-LINKED (network context found, no task response); ` +
    `${td} TASK-DRIVEN (task assigned, no community attribution); ` +
    `${ua} UNADDRESSED (no network context or task coverage — active risk with no response). ` +
    `Top unaddressed: ${enriched.filter(e => e._coverage === 'UNADDRESSED').slice(0, 3).map(e => e.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 720;
const PANEL_H = 640;
const RD = '#EF4444';
const AM = '#F59E0B';
const GR = '#22C55E';
const CY = '#00CFFF';
const TL = '#14B8A6';

const COVERAGE_COLOR = {
  'FULLY RESPONDED':  GR,
  'COMMUNITY-LINKED': AM,
  'TASK-DRIVEN':      CY,
  'UNADDRESSED':      RD,
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

const TABS = ['ALL', 'FULLY RESPONDED', 'COMMUNITY-LINKED', 'TASK-DRIVEN', 'UNADDRESSED'];

export default function RiskSignalGraphCommunityTaskMatrix() {
  const [open, setOpen]             = useState(false);
  const [signals, setSignals]       = useState([]);
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
      const [sigR, comR, tskR] = await Promise.allSettled([
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
        fetch(`${API}/v1/graph/communities`).then(r => r.json()),
        fetch(`${API}/entities/Task`).then(r => r.json()),
      ]);
      const raw_s = normaliseSignals(sigR.status === 'fulfilled' ? sigR.value : []);
      const raw_c = normaliseCommunities(comR.status === 'fulfilled' ? comR.value : []);
      const raw_t = normaliseTasks(tskR.status === 'fulfilled' ? tskR.value : []);
      setSignals(correlate(raw_s, raw_c, raw_t));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:rgctorm-toggle', toggle);
    return () => window.removeEventListener('jarvis:rgctorm-toggle', toggle);
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
      const brief = await buildRgctormScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Risk signal network response coverage: ${brief}. Give a 2-sentence assessment of the risk response posture and which unaddressed signals are highest priority.` }),
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
    const unaddressedCount = signals.filter(s => s._coverage === 'UNADDRESSED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Risk Signal × Graph Community × Task Operational Response Matrix (RGCTORM)"
        style={{
          position: 'fixed', left: 738960, bottom: 8, zIndex: 348,
          background: unaddressedCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${unaddressedCount > 0 ? RD : CY + '44'}`,
          color: unaddressedCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ RGCTORM{unaddressedCount > 0 ? ` ⚠${unaddressedCount}` : ''}
      </button>
    );
  }

  const fr = signals.filter(s => s._coverage === 'FULLY RESPONDED').length;
  const cl = signals.filter(s => s._coverage === 'COMMUNITY-LINKED').length;
  const td = signals.filter(s => s._coverage === 'TASK-DRIVEN').length;
  const ua = signals.filter(s => s._coverage === 'UNADDRESSED').length;

  const visible = signals.filter(s =>
    (tab === 'ALL' || s._coverage === tab) &&
    (!search || s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase()) ||
      s.desc.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #EF444433', borderRadius: 8,
      zIndex: 6001, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #EF444418',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #EF444422', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: RD, fontWeight: 700, fontSize: 11 }}>◈ RISK SIGNAL × GRAPH COMMUNITY × TASK MATRIX</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>RGCTORM</span>
        {ua > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {ua} UNADDRESSED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['RISK SIGNALS',     signals.length, CY],
          ['FULLY RESPONDED',  fr,             GR],
          ['COMMUNITY-LINKED', cl,             AM],
          ['TASK-DRIVEN',      td,             TL],
          ['UNADDRESSED',      ua,             RD],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {signals.length > 0 && [
            [fr, GR], [cl, AM], [td, TL], [ua, RD]
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
          }}>{t}{t !== 'ALL' ? ` (${signals.filter(s => s._coverage === t).length})` : ''}</button>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search risk signals…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #EF444433', borderRadius: 4, color: RD, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: AM, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No signals match filter.</div>}
        {visible.map(sig => {
          const color = COVERAGE_COLOR[sig._coverage] || CY;
          const isExp = expanded === sig.id;
          return (
            <div key={sig.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : sig.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sig.name}</span>
                {sig.severity && chip(sig.severity, sig.severity?.toLowerCase?.().includes('crit') || sig.severity?.toLowerCase?.().includes('high') ? RD : AM)}
                {sig.category && chip(sig.category, '#888')}
                {chip(sig._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 600 }}>NETWORK COMMUNITIES ({sig._communities.length})</div>
                    {sig._communities.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No community attribution</div>
                      : sig._communities.map(c => (
                        <div key={c.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                            {c.type && chip(c.type, '#888')}
                          </div>
                          <ScoreBar score={c._score} color={AM} />
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: GR, marginBottom: 4, fontWeight: 600 }}>TASK RESPONSES ({sig._tasks.length})</div>
                    {sig._tasks.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No task response</div>
                      : sig._tasks.map(t => (
                        <div key={t.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                            {t.priority && chip(t.priority, t.priority?.toLowerCase?.().includes('high') || t.priority?.toLowerCase?.().includes('crit') ? RD : '#888')}
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

      <div style={{ padding: '6px 12px', borderTop: '1px solid #EF444422', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button onClick={load} disabled={loading} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: '#0a0a1a', border: '1px solid #EF444444', color: RD, cursor: 'pointer' }}>
          {loading ? '…' : '↻ REFRESH'}
        </button>
        <button onClick={assess} disabled={assessing} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: assessing ? '#1a1a2a' : '#EF444422', border: `1px solid ${RD}55`, color: RD, cursor: 'pointer' }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <span style={{ fontSize: 9, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assessText}</span>
        )}
      </div>
    </div>
  );
}
