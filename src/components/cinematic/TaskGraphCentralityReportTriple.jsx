import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const TGCREP_RE = /\b(tgcrep|task\s+graph\s+centrality\s+report|task\s+centrality\s+report|task\s+node\s+report|untracked\s+task|covered\s+task|task\s+report\s+centrality|task\s+graph\s+report|centrality\s+report\s+task|node\s+backed\s+task|task\s+coverage\s+triple)\b/i;
const THRESHOLD = 0.07;

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const fToks = tok(fieldText);
  const fSet = new Set(fToks);
  const hits = toks.filter(t => fSet.has(t)).length;
  return hits / toks.length;
}

function normaliseTasks(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.tasks) ? raw.tasks
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((t, i) => ({
    id: t.id || t._id || `task-${i}`,
    label: t.name || t.title || t.mission || `Task ${i + 1}`,
    priority: t.priority || t.urgency || '',
    status: t.status || t.state || '',
    category: t.category || t.type || '',
    description: t.description || t.summary || '',
    tags: Array.isArray(t.tags) ? t.tags.join(' ') : String(t.tags || ''),
    _searchText: [t.name, t.title, t.mission, t.description, t.summary, t.category, t.type, t.priority, t.tags].filter(Boolean).join(' '),
  }));
}

function normaliseCentrality(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.nodes) ? raw.nodes
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((n, i) => ({
    id: n.id || n._id || `node-${i}`,
    label: n.label || n.name || n.title || `Node ${i + 1}`,
    type: n.type || n.kind || n.category || '',
    score: n.centrality_score || n.score || n.weight || 0,
    description: n.description || n.summary || '',
    tags: Array.isArray(n.tags) ? n.tags.join(' ') : String(n.tags || ''),
    _searchText: [n.label, n.name, n.title, n.type, n.kind, n.category, n.description, n.summary, n.tags].filter(Boolean).join(' '),
  }));
}

function normaliseReports(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.reports) ? raw.reports
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((r, i) => ({
    id: r.id || r._id || `rep-${i}`,
    label: r.name || r.title || r.report_name || `Report ${i + 1}`,
    type: r.type || r.kind || r.category || '',
    description: r.description || r.summary || '',
    tags: Array.isArray(r.tags) ? r.tags.join(' ') : String(r.tags || ''),
    _searchText: [r.name, r.title, r.report_name, r.type, r.kind, r.category, r.description, r.summary, r.tags].filter(Boolean).join(' '),
  }));
}

function correlate(tasks, nodes, reports) {
  return tasks.map(task => {
    const tToks = tok(task._searchText);
    const matchedNodes = nodes
      .map(n => ({ ...n, score: matchScore(tToks, n._searchText) }))
      .filter(n => n.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const matchedReports = reports
      .map(r => ({ ...r, score: matchScore(tToks, r._searchText) }))
      .filter(r => r.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const hasNode = matchedNodes.length > 0;
    const hasReport = matchedReports.length > 0;
    let coverage;
    if (hasNode && hasReport) coverage = 'FULLY_COVERED';
    else if (hasNode) coverage = 'NODE_LINKED';
    else if (hasReport) coverage = 'REPORT_BACKED';
    else coverage = 'UNTRACKED';
    return { ...task, matchedNodes, matchedReports, coverage };
  });
}

export function isTgcrepQuery(t) {
  return TGCREP_RE.test(t || '');
}

export async function buildTgcrepScript() {
  try {
    const [tRes, nRes, rRes] = await Promise.all([
      fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : []),
    ]);
    const tasks = normaliseTasks(tRes);
    const nodes = normaliseCentrality(nRes);
    const reports = normaliseReports(rRes);
    const correlated = correlate(tasks, nodes, reports);
    const fully = correlated.filter(t => t.coverage === 'FULLY_COVERED').length;
    const nodeLinked = correlated.filter(t => t.coverage === 'NODE_LINKED').length;
    const reportBacked = correlated.filter(t => t.coverage === 'REPORT_BACKED').length;
    const untracked = correlated.filter(t => t.coverage === 'UNTRACKED').length;
    return `TGCREP analysis: ${tasks.length} tasks cross-referenced against ${nodes.length} high-influence graph centrality nodes and ${reports.length} intelligence reports. ${fully} tasks are FULLY COVERED with both graph centrality context and documentary backing. ${untracked} tasks are UNTRACKED — no centrality node or report coverage — these represent operational documentation and network intelligence gaps requiring immediate prioritisation.`;
  } catch {
    return 'TGCREP data unavailable — check /entities/Task, /v1/graph/centrality, and /v1/reports endpoints.';
  }
}

const CY = '#00CFFF';
const GN = '#00FF9F';
const AM = '#FFB300';
const RD = '#FF4444';

const FILTER_TABS = ['ALL', 'FULLY COVERED', 'NODE LINKED', 'REPORT BACKED', 'UNTRACKED'];
const COV_MAP = { 'FULLY COVERED': 'FULLY_COVERED', 'NODE LINKED': 'NODE_LINKED', 'REPORT BACKED': 'REPORT_BACKED', 'UNTRACKED': 'UNTRACKED' };

function ScoreBar({ score, color }) {
  return (
    <div style={{ height: 3, background: '#1A2535', borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: 3, width: `${Math.min(100, Math.round(score * 100))}%`, background: color, borderRadius: 2, transition: 'width 0.3s' }} />
    </div>
  );
}

function Badge({ label, color }) {
  if (!label) return null;
  return (
    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: `${color}22`, color, border: `1px solid ${color}55`, letterSpacing: 1, marginLeft: 4 }}>
      {String(label).toUpperCase().slice(0, 12)}
    </span>
  );
}

export default function TaskGraphCentralityReportTriple() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, nRes, rRes] = await Promise.all([
        fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/graph/centrality`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : []),
      ]);
      const tasks = normaliseTasks(tRes);
      const nodes = normaliseCentrality(nRes);
      const reports = normaliseReports(rRes);
      setData(correlate(tasks, nodes, reports));
    } catch { setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => { if (!o) load(); return !o; });
    window.addEventListener('jarvis:tgcrep-toggle', toggle);
    return () => window.removeEventListener('jarvis:tgcrep-toggle', toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = data.filter(t => {
    if (filter !== 'ALL' && t.coverage !== COV_MAP[filter]) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.label.toLowerCase().includes(q) && !t._searchText.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts = {
    fully: data.filter(t => t.coverage === 'FULLY_COVERED').length,
    nodeLinked: data.filter(t => t.coverage === 'NODE_LINKED').length,
    reportBacked: data.filter(t => t.coverage === 'REPORT_BACKED').length,
    untracked: data.filter(t => t.coverage === 'UNTRACKED').length,
  };

  const totalNodes = [...new Set(data.flatMap(t => t.matchedNodes.map(n => n.id)))].length;
  const totalReports = [...new Set(data.flatMap(t => t.matchedReports.map(r => r.id)))].length;

  const assess = async () => {
    setAssessing(true); setAssessText('');
    try {
      const script = await buildTgcrepScript();
      setAssessText(script);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
    } catch { setAssessText('Assessment unavailable.'); }
    setAssessing(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Task × Graph Centrality × Report Triple Coverage"
        style={{
          position: 'fixed', left: 826320, bottom: 8, zIndex: 504,
          background: 'rgba(5,8,13,0.82)', border: `1px solid ${AM}55`,
          color: AM, fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          letterSpacing: 1.5, padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
          backdropFilter: 'blur(6px)', whiteSpace: 'nowrap',
        }}>
        ◈ TGCREP
        {counts.untracked > 0 && (
          <span style={{ marginLeft: 5, background: AM, color: '#04060A', borderRadius: 3, padding: '0 4px', fontSize: 8, fontWeight: 700 }}>
            {counts.untracked}
          </span>
        )}
      </button>
    );
  }

  const covColor = c => c === 'FULLY_COVERED' ? GN : c === 'NODE_LINKED' ? CY : c === 'REPORT_BACKED' ? AM : '#555';

  return (
    <div style={{
      position: 'fixed', top: 60, right: 16, zIndex: 504, width: 'min(780px,95vw)',
      maxHeight: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column',
      background: 'rgba(5,10,18,0.97)', border: `1px solid ${AM}44`,
      borderRadius: 10, fontFamily: "'JetBrains Mono',monospace", overflow: 'hidden',
      boxShadow: `0 0 60px ${AM}22`,
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${AM}33`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ color: AM, fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ TGCREP</span>
        <span style={{ color: '#6E8AA0', fontSize: 10, flex: 1 }}>Task × Graph Centrality × Report Triple Coverage</span>
        {loading && <span style={{ color: AM, fontSize: 9, animation: 'tgcpulse 1s infinite' }}>◌ LOADING</span>}
        <button onClick={assess} disabled={assessing} style={{ background: `${AM}22`, border: `1px solid ${AM}55`, color: AM, fontSize: 9, padding: '2px 7px', borderRadius: 3, cursor: 'pointer', letterSpacing: 1 }}>
          {assessing ? '…' : 'ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#6E8AA0', fontSize: 14, cursor: 'pointer', padding: '0 4px' }}>✕</button>
      </div>

      {assessText && (
        <div style={{ padding: '8px 14px', background: `${AM}11`, borderBottom: `1px solid ${AM}22`, fontSize: 10, color: '#DCEBF5', lineHeight: 1.5 }}>
          {assessText}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: `1px solid ${AM}22`, flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'TASKS', val: data.length, color: '#6E8AA0' },
          { label: 'NODES', val: totalNodes, color: CY },
          { label: 'REPORTS', val: totalReports, color: AM },
          { label: 'FULLY CVR', val: counts.fully, color: GN },
          { label: 'NODE LNK', val: counts.nodeLinked, color: CY },
          { label: 'RPT BACK', val: counts.reportBacked, color: AM },
          { label: 'UNTRACKED', val: counts.untracked, color: '#555' },
        ].map(s => (
          <div key={s.label} style={{ background: `${s.color}11`, border: `1px solid ${s.color}33`, borderRadius: 4, padding: '4px 8px', textAlign: 'center', minWidth: 60 }}>
            <div style={{ color: s.color, fontSize: 14, fontWeight: 700 }}>{s.val}</div>
            <div style={{ color: '#6E8AA0', fontSize: 8, letterSpacing: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {data.length > 0 && (
        <div style={{ margin: '6px 14px', height: 5, borderRadius: 3, overflow: 'hidden', display: 'flex', flexShrink: 0 }}>
          {[
            { n: counts.fully, c: GN },
            { n: counts.nodeLinked, c: CY },
            { n: counts.reportBacked, c: AM },
            { n: counts.untracked, c: '#333' },
          ].map((seg, i) => (
            <div key={i} style={{ flex: seg.n, background: seg.c, minWidth: seg.n ? 2 : 0, transition: 'flex 0.4s' }} />
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: `1px solid ${AM}22`, flexShrink: 0, flexWrap: 'wrap' }}>
        {FILTER_TABS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? `${AM}33` : 'transparent',
            border: `1px solid ${filter === f ? AM : '#2A3A50'}`,
            color: filter === f ? AM : '#6E8AA0', fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="search tasks…"
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.04)', border: `1px solid #2A3A50`, color: '#DCEBF5', fontSize: 9, padding: '2px 8px', borderRadius: 3, outline: 'none', width: 130 }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px' }}>
        {visible.length === 0 && (
          <div style={{ color: '#6E8AA0', fontSize: 10, textAlign: 'center', padding: 24 }}>
            {loading ? 'Loading…' : 'No tasks match filter.'}
          </div>
        )}
        {visible.map(task => {
          const isExp = expanded === task.id;
          const cc = covColor(task.coverage);
          return (
            <div key={task.id} style={{ marginBottom: 4, borderRadius: 5, border: `1px solid ${cc}33`, background: `${cc}07`, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(isExp ? null : task.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: cc, flexShrink: 0 }} />
                <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.label}</span>
                {task.priority && <Badge label={task.priority} color={AM} />}
                <span style={{ fontSize: 8, color: cc, letterSpacing: 1, marginLeft: 4 }}>{task.coverage.replace('_', ' ')}</span>
                <span style={{ color: '#6E8AA0', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${cc}22` }}>
                  {task.description && (
                    <div style={{ color: '#6E8AA0', fontSize: 9, marginBottom: 8, lineHeight: 1.4 }}>{task.description}</div>
                  )}
                  <div style={{ display: 'flex', gap: 10 }}>
                    {/* Left: centrality nodes */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>CENTRALITY NODES ({task.matchedNodes.length})</div>
                      {task.matchedNodes.length === 0
                        ? <div style={{ color: '#444', fontSize: 9 }}>no graph node match</div>
                        : task.matchedNodes.slice(0, 5).map(n => (
                          <div key={n.id} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ color: '#DCEBF5', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.label}</span>
                              {n.type && <Badge label={n.type} color={CY} />}
                            </div>
                            <ScoreBar score={n.score} color={CY} />
                          </div>
                        ))}
                    </div>
                    {/* Right: reports */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: AM, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>REPORTS ({task.matchedReports.length})</div>
                      {task.matchedReports.length === 0
                        ? <div style={{ color: '#444', fontSize: 9 }}>no report match</div>
                        : task.matchedReports.slice(0, 5).map(r => (
                          <div key={r.id} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ color: '#DCEBF5', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                              {r.type && <Badge label={r.type} color={AM} />}
                            </div>
                            <ScoreBar score={r.score} color={AM} />
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <style>{`@keyframes tgcpulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}
