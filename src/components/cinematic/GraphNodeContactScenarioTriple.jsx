import { useState, useEffect, useCallback } from 'react';

const API = '';

const GNCSTP_RE = /\b(graph[._-]?node[._-]?contact[._-]?scenario|gncstp|dark[._-]?node[._-]?strat|node[._-]?contact[._-]?plan|strategic[._-]?node[._-]?cover|network[._-]?staff|node[._-]?strategy|node[._-]?mapping|unmapped[._-]?node|strategic[._-]?network[._-]?gap)\b/i;

export function isGncstpQuery(t) {
  return GNCSTP_RE.test(t || '');
}

function normaliseNodes(raw) {
  if (!raw) return [];
  const arr = ['nodes', 'centrality', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.slice(0, 40).map((n, i) => ({
    id:          n.id || n.node_id || String(i),
    name:        n.label || n.name || n.node || `Node ${i + 1}`,
    type:        n.type || n.node_type || n.category || '',
    influence:   typeof n.score === 'number' ? n.score : (typeof n.centrality === 'number' ? n.centrality : 0),
    description: String(n.description || n.summary || '').slice(0, 200),
    tags:        Array.isArray(n.tags) ? n.tags.join(' ') : (n.tags || ''),
  }));
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = ['contacts', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:    c.id || String(i),
    name:  c.name || c.full_name || `Contact ${i + 1}`,
    org:   c.org || c.company || c.organisation || c.organization || '',
    role:  c.role || c.title || c.position || '',
    desc:  String(c.description || c.notes || c.bio || '').slice(0, 200),
    tags:  Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  const arr = ['scenarios', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:       s.id || String(i),
    name:     s.name || s.title || s.scenario || `Scenario ${i + 1}`,
    status:   s.status || s.state || '',
    category: s.category || s.type || '',
    desc:     String(s.description || s.summary || s.objective || '').slice(0, 200),
    tags:     Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(nodeToks, other) {
  const otherToks = [
    ...tokens(other.name || other.label || other.title),
    ...tokens(other.org || other.category || other.sector || other.kind || ''),
    ...tokens(other.role || other.type || ''),
    ...tokens(other.desc || other.description || other.summary || other.objective || ''),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!nodeToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (nodeToks.has(t)) hits++;
  return hits / Math.max(nodeToks.size, otherToks.length);
}

function correlate(nodes, contacts, scenarios) {
  return nodes.map(node => {
    const nToks = new Set([
      ...tokens(node.name),
      ...tokens(node.type),
      ...tokens(node.description),
      ...tokens(node.tags),
    ].filter(Boolean));

    const matchedContacts = contacts
      .map(c => ({ ...c, _score: matchScore(nToks, c) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedScenarios = scenarios
      .map(s => ({ ...s, _score: matchScore(nToks, s) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasContact  = matchedContacts.length > 0;
    const hasScenario = matchedScenarios.length > 0;

    let coverage;
    if (hasContact && hasScenario) coverage = 'FULLY MAPPED';
    else if (hasContact)           coverage = 'CONTACT-ONLY';
    else if (hasScenario)          coverage = 'PLANNED-ONLY';
    else                           coverage = 'DARK';

    return { ...node, _contacts: matchedContacts, _scenarios: matchedScenarios, _coverage: coverage };
  });
}

export async function buildGncstpScript() {
  const [nR, cR, sR] = await Promise.allSettled([
    fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`).then(r => r.json()),
  ]);
  const nodes     = normaliseNodes(nR.status === 'fulfilled' ? nR.value : []);
  const contacts  = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
  const scenarios = normaliseScenarios(sR.status === 'fulfilled' ? sR.value : []);
  const enriched  = correlate(nodes, contacts, scenarios);
  const fm   = enriched.filter(n => n._coverage === 'FULLY MAPPED').length;
  const co   = enriched.filter(n => n._coverage === 'CONTACT-ONLY').length;
  const po   = enriched.filter(n => n._coverage === 'PLANNED-ONLY').length;
  const dark = enriched.filter(n => n._coverage === 'DARK').length;
  return (
    `Graph Node × Contact × Scenario Triple Coverage: ${nodes.length} top-influence nodes cross-referenced against ${contacts.length} contacts and ${scenarios.length} scenarios. ` +
    `${fm} FULLY MAPPED (contact-represented + scenario-planned); ${co} CONTACT-ONLY (people found, no plan); ` +
    `${po} PLANNED-ONLY (scenario found, no contact owner); ${dark} DARK (no people or scenario — strategic gap). ` +
    `Dark nodes: ${enriched.filter(n => n._coverage === 'DARK').slice(0, 3).map(n => n.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const CY = '#00CFFF';
const GR = '#22C55E';
const AM = '#F59E0B';
const RD = '#EF4444';
const TE = '#14B8A6';

const COVERAGE_COLOR = {
  'FULLY MAPPED':   GR,
  'CONTACT-ONLY':   CY,
  'PLANNED-ONLY':   AM,
  'DARK':           RD,
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

const TABS = ['ALL', 'FULLY MAPPED', 'CONTACT-ONLY', 'PLANNED-ONLY', 'DARK'];

export default function GraphNodeContactScenarioTriple() {
  const [open, setOpen]       = useState(false);
  const [nodes, setNodes]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState('ALL');
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [nR, cR, sR] = await Promise.allSettled([
        fetch(`${API}/v1/graph/centrality`).then(r => r.json()),
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`).then(r => r.json()),
      ]);
      const raw_n = normaliseNodes(nR.status === 'fulfilled' ? nR.value : []);
      const raw_c = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
      const raw_s = normaliseScenarios(sR.status === 'fulfilled' ? sR.value : []);
      setNodes(correlate(raw_n, raw_c, raw_s));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:gncstp-toggle', toggle);
    return () => window.removeEventListener('jarvis:gncstp-toggle', toggle);
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
      const brief = await buildGncstpScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Graph node × contact × scenario triple coverage brief: ${brief}. Give a 2-sentence network-strategic coverage assessment.` }),
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
    const darkCount = nodes.filter(n => n._coverage === 'DARK').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Node × Contact × Scenario Triple Coverage (GNCSTP)"
        style={{
          position: 'fixed', left: 719360, bottom: 8, zIndex: 313,
          background: darkCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${darkCount > 0 ? RD : CY + '44'}`,
          color: darkCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ GNCSTP{darkCount > 0 ? ` ⚠${darkCount}` : ''}
      </button>
    );
  }

  const fm   = nodes.filter(n => n._coverage === 'FULLY MAPPED').length;
  const co   = nodes.filter(n => n._coverage === 'CONTACT-ONLY').length;
  const po   = nodes.filter(n => n._coverage === 'PLANNED-ONLY').length;
  const dark = nodes.filter(n => n._coverage === 'DARK').length;

  const visible = nodes.filter(node =>
    (tab === 'ALL' || node._coverage === tab) &&
    (!search || node.name.toLowerCase().includes(search.toLowerCase()) || node.type.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6000, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ GRAPH NODE × CONTACT × SCENARIO TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>GNCSTP</span>
        {dark > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {dark} DARK</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['NODES',         nodes.length, CY],
          ['FULLY MAPPED',  fm,  GR],
          ['CONTACT-ONLY',  co,  TE],
          ['PLANNED-ONLY',  po,  AM],
          ['DARK',          dark, RD],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {nodes.length > 0 && [
            [fm, GR], [co, TE], [po, AM], [dark, RD]
          ].map(([v, c], i) => (
            v > 0 ? <div key={i} style={{ flex: v, background: c, transition: 'flex .4s' }} /> : null
          ))}
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
          }}>{t}{t !== 'ALL' ? ` (${nodes.filter(n => n._coverage === t).length})` : ''}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search graph nodes…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No graph nodes match filter.</div>}
        {visible.map(node => {
          const color = COVERAGE_COLOR[node._coverage] || CY;
          const isExp = expanded === node.id;
          return (
            <div key={node.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : node.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
                {node.type && <span style={{ fontSize: 9, color: '#666', flexShrink: 0 }}>{node.type}</span>}
                {node.influence > 0 && chip(`inf ${node.influence.toFixed ? node.influence.toFixed(2) : node.influence}`, TE)}
                {chip(node._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  {/* Left: Contacts */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 600 }}>CONTACTS ({node._contacts.length})</div>
                    {node._contacts.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No contact alignment</div>
                      : node._contacts.map(c => (
                        <div key={c.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                            {c.role && chip(c.role, CY)}
                            {c.org && chip(c.org, TE)}
                          </div>
                          <ScoreBar score={c._score} color={CY} />
                        </div>
                      ))
                    }
                  </div>
                  {/* Divider */}
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  {/* Right: Scenarios */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 600 }}>SCENARIOS ({node._scenarios.length})</div>
                    {node._scenarios.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No scenario alignment</div>
                      : node._scenarios.map(s => (
                        <div key={s.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                            {s.status && chip(s.status, AM)}
                            {s.category && chip(s.category, GR)}
                          </div>
                          <ScoreBar score={s._score} color={AM} />
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
