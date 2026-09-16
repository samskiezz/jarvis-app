import { useState, useEffect, useCallback } from 'react';

const API = '';

const GNCTRI_RE = /\b(gnctri|graph[._-]?node[._-]?contact[._-]?task|node[._-]?contact[._-]?task|managed[._-]?nodes?|unmanaged[._-]?nodes?|node[._-]?staffing|node[._-]?task[._-]?contact|graph[._-]?staffing|graph[._-]?node[._-]?management|high[._-]?influence[._-]?staffing|network[._-]?staffing)\b/i;

export function isGnctriQuery(t) {
  return GNCTRI_RE.test(t || '');
}

function normaliseNodes(raw) {
  if (!raw) return [];
  const arr = ['nodes', 'items', 'results', 'data', 'records', 'top_nodes', 'centrality'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((n, i) => ({
    id:       n.id || String(i),
    name:     n.label || n.name || n.id || `Node ${i + 1}`,
    type:     n.type || n.kind || n.category || '',
    score:    typeof n.score === 'number' ? n.score : (typeof n.centrality === 'number' ? n.centrality : 0),
    desc:     String(n.description || n.summary || n.notes || '').slice(0, 200),
    tags:     Array.isArray(n.tags) ? n.tags.join(' ') : (n.tags || ''),
  }));
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = ['contacts', 'items', 'results', 'data', 'records', 'people'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:      c.id || String(i),
    name:    c.name || c.full_name || c.display_name || `Contact ${i + 1}`,
    company: c.company || c.organisation || c.org || '',
    title:   c.title || c.role || c.position || '',
    desc:    String(c.description || c.bio || c.notes || c.summary || '').slice(0, 200),
    tags:    Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function normaliseTasks(raw) {
  if (!raw) return [];
  const arr = ['tasks', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((t, i) => ({
    id:       t.id || String(i),
    name:     t.title || t.name || t.subject || `Task ${i + 1}`,
    status:   t.status || t.state || '',
    priority: t.priority || t.urgency || '',
    desc:     String(t.description || t.notes || t.details || '').slice(0, 200),
    tags:     Array.isArray(t.tags) ? t.tags.join(' ') : (t.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(nodeToks, other) {
  const otherToks = [
    ...tokens(other.name || ''),
    ...tokens(other.company || other.title || other.status || other.priority || ''),
    ...tokens(other.desc || other.description || other.summary || ''),
    ...tokens(other.tags || ''),
  ].filter(Boolean);
  if (!nodeToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (nodeToks.has(t)) hits++;
  return hits / Math.max(nodeToks.size, otherToks.length);
}

function correlate(nodes, contacts, tasks) {
  return nodes.map(node => {
    const toks = new Set([
      ...tokens(node.name),
      ...tokens(node.type),
      ...tokens(node.desc),
      ...tokens(node.tags),
    ].filter(Boolean));

    const matchedContacts = contacts
      .map(c => ({ ...c, _score: matchScore(toks, c) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedTasks = tasks
      .map(t => ({ ...t, _score: matchScore(toks, t) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasContact = matchedContacts.length > 0;
    const hasTask    = matchedTasks.length > 0;

    let coverage;
    if (hasContact && hasTask) coverage = 'FULLY MANAGED';
    else if (hasContact)       coverage = 'STAFFED';
    else if (hasTask)          coverage = 'TASKED';
    else                       coverage = 'UNMANAGED';

    return { ...node, _contacts: matchedContacts, _tasks: matchedTasks, _coverage: coverage };
  });
}

export async function buildGnctriScript() {
  const [nR, cR, tR] = await Promise.allSettled([
    fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/entities/Task`).then(r => r.json()),
  ]);
  const nodes    = normaliseNodes(nR.status    === 'fulfilled' ? nR.value : []);
  const contacts = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
  const tasks    = normaliseTasks(tR.status    === 'fulfilled' ? tR.value : []);
  const enriched = correlate(nodes, contacts, tasks);
  const fm  = enriched.filter(e => e._coverage === 'FULLY MANAGED').length;
  const st  = enriched.filter(e => e._coverage === 'STAFFED').length;
  const tk  = enriched.filter(e => e._coverage === 'TASKED').length;
  const um  = enriched.filter(e => e._coverage === 'UNMANAGED').length;
  return (
    `Graph Node × Contact × Task Triple Coverage: ${nodes.length} top-influence nodes cross-referenced against ` +
    `${contacts.length} contacts and ${tasks.length} tasks. ` +
    `${fm} FULLY MANAGED (contact + task backing); ` +
    `${st} STAFFED (contact aligned, no task coverage); ` +
    `${tk} TASKED (task assigned, no contact owner); ` +
    `${um} UNMANAGED (neither — high-influence node with no human or operational backing). ` +
    `Most critical unmanaged nodes: ${enriched.filter(e => e._coverage === 'UNMANAGED').slice(0, 3).map(e => e.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const VI = '#A78BFA';

const COVERAGE_COLOR = {
  'FULLY MANAGED': GR,
  'STAFFED':       CY,
  'TASKED':        AM,
  'UNMANAGED':     '#555',
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

const TABS = ['ALL', 'FULLY MANAGED', 'STAFFED', 'TASKED', 'UNMANAGED'];

export default function GraphNodeContactTaskTriple() {
  const [open, setOpen]             = useState(false);
  const [nodes, setNodes]           = useState([]);
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
      const [nR, cR, tR] = await Promise.allSettled([
        fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/entities/Task`).then(r => r.json()),
      ]);
      const raw_n = normaliseNodes(nR.status    === 'fulfilled' ? nR.value : []);
      const raw_c = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
      const raw_t = normaliseTasks(tR.status    === 'fulfilled' ? tR.value : []);
      setNodes(correlate(raw_n, raw_c, raw_t));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:gnctri-toggle', toggle);
    return () => window.removeEventListener('jarvis:gnctri-toggle', toggle);
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
      const brief = await buildGnctriScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Graph node management coverage brief: ${brief}. Give a 2-sentence assessment of network management and operational task gaps.` }),
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
    const umCount = nodes.filter(n => n._coverage === 'UNMANAGED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Node × Contact × Task Triple Coverage (GNCTRI)"
        style={{
          position: 'fixed', left: 735040, bottom: 8, zIndex: 341,
          background: umCount > 0 ? '#A78BFA22' : '#0a0a1a',
          border: `1px solid ${umCount > 0 ? VI : CY + '44'}`,
          color: umCount > 0 ? VI : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ GNCTRI{umCount > 0 ? ` ⚠${umCount}` : ''}
      </button>
    );
  }

  const fm  = nodes.filter(n => n._coverage === 'FULLY MANAGED').length;
  const st  = nodes.filter(n => n._coverage === 'STAFFED').length;
  const tk  = nodes.filter(n => n._coverage === 'TASKED').length;
  const um  = nodes.filter(n => n._coverage === 'UNMANAGED').length;

  const visible = nodes.filter(n =>
    (tab === 'ALL' || n._coverage === tab) &&
    (!search || n.name.toLowerCase().includes(search.toLowerCase()) ||
      n.type.toLowerCase().includes(search.toLowerCase()) ||
      n.desc.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6001, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ GRAPH NODE × CONTACT × TASK TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>GNCTRI</span>
        {um > 0 && <span style={{ fontSize: 10, color: VI, background: '#A78BFA22', border: '1px solid #A78BFA55', borderRadius: 3, padding: '1px 5px' }}>⚠ {um} UNMANAGED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['NODES',          nodes.length, CY],
          ['FULLY MANAGED',  fm,           GR],
          ['STAFFED',        st,           CY],
          ['TASKED',         tk,           AM],
          ['UNMANAGED',      um,           '#555'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {nodes.length > 0 && [
            [fm, GR], [st, CY], [tk, AM], [um, '#444']
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
          }}>{t}{t !== 'ALL' ? ` (${nodes.filter(n => n._coverage === t).length})` : ''}</button>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search nodes…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: AM, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No nodes match filter.</div>}
        {visible.map(node => {
          const color = COVERAGE_COLOR[node._coverage] || CY;
          const isExp = expanded === node.id;
          return (
            <div key={node.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : node.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
                {node.type && chip(node.type, '#888')}
                {node.score > 0 && chip(`inf:${node.score.toFixed(2)}`, '#888')}
                {chip(node._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 600 }}>CONTACTS ({node._contacts.length})</div>
                    {node._contacts.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No contact alignment</div>
                      : node._contacts.map(c => (
                        <div key={c.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                            {c.title   && chip(c.title,   '#888')}
                            {c.company && chip(c.company, '#888')}
                          </div>
                          <ScoreBar score={c._score} color={CY} />
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: GR, marginBottom: 4, fontWeight: 600 }}>TASKS ({node._tasks.length})</div>
                    {node._tasks.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No task alignment</div>
                      : node._tasks.map(t => (
                        <div key={t.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                            {t.status   && chip(t.status,   '#888')}
                            {t.priority && chip(t.priority, t.priority?.toLowerCase?.().includes('high') || t.priority?.toLowerCase?.().includes('critical') ? '#EF4444' : AM)}
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
        <button onClick={assess} disabled={assessing} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: assessing ? '#1a1a2a' : '#A78BFA22', border: `1px solid ${VI}55`, color: VI, cursor: 'pointer' }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <span style={{ fontSize: 9, color: '#aaa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assessText}</span>
        )}
      </div>
    </div>
  );
}
