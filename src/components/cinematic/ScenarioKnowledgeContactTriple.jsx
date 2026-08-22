import { useState, useEffect, useCallback } from 'react';

const API = '';

const SKCTRI_RE = /\b(skctri|scenario[._-]?knowledge[._-]?contact|knowledge[._-]?contact[._-]?scenario|scenario[._-]?contact[._-]?knowledge|fully[._-]?briefed[._-]?scenario|unresourced[._-]?scenario|briefed[._-]?scenario|staffed[._-]?scenario|scenario[._-]?personnel[._-]?knowledge|scenario[._-]?resource[._-]?triple)\b/i;

export function isSkctriQuery(t) {
  return SKCTRI_RE.test(t || '');
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  const arr = ['scenarios', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:       s.id || String(i),
    name:     s.name || s.title || s.label || `Scenario ${i + 1}`,
    status:   s.status || s.state || '',
    category: s.category || s.type || s.kind || '',
    desc:     String(s.description || s.objective || s.summary || '').slice(0, 200),
    tags:     Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function normaliseArticles(raw) {
  if (!raw) return [];
  const arr = ['articles', 'knowledge', 'items', 'results', 'data', 'records', 'documents'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((a, i) => ({
    id:       a.id || String(i),
    name:     a.title || a.name || a.subject || `Article ${i + 1}`,
    category: a.category || a.type || a.kind || '',
    desc:     String(a.summary || a.content || a.description || a.body || '').slice(0, 200),
    tags:     Array.isArray(a.tags) ? a.tags.join(' ') : (a.tags || ''),
  }));
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = ['contacts', 'items', 'results', 'data', 'records', 'people'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:    c.id || String(i),
    name:  c.name || c.full_name || c.fullName || `Contact ${i + 1}`,
    title: c.title || c.role || c.position || '',
    org:   c.company || c.organisation || c.organization || c.org || '',
    desc:  String(c.description || c.bio || c.notes || '').slice(0, 200),
    tags:  Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(scenToks, other) {
  const otherToks = [
    ...tokens(other.name     || ''),
    ...tokens(other.category || other.type || other.kind || ''),
    ...tokens(other.title    || other.role || other.org || ''),
    ...tokens(other.desc     || other.description || other.summary || ''),
    ...tokens(other.tags     || ''),
  ].filter(Boolean);
  if (!scenToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (scenToks.has(t)) hits++;
  return hits / Math.max(scenToks.size, otherToks.length);
}

function correlate(scenarios, articles, contacts) {
  return scenarios.map(scen => {
    const toks = new Set([
      ...tokens(scen.name),
      ...tokens(scen.category),
      ...tokens(scen.desc),
      ...tokens(scen.tags),
    ].filter(Boolean));

    const matchedArticles = articles
      .map(a => ({ ...a, _score: matchScore(toks, a) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedContacts = contacts
      .map(c => ({ ...c, _score: matchScore(toks, c) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasArticle  = matchedArticles.length > 0;
    const hasContact  = matchedContacts.length > 0;

    let coverage;
    if (hasArticle && hasContact) coverage = 'FULLY BRIEFED';
    else if (hasArticle)          coverage = 'BRIEFED';
    else if (hasContact)          coverage = 'STAFFED';
    else                          coverage = 'UNRESOURCED';

    return { ...scen, _articles: matchedArticles, _contacts: matchedContacts, _coverage: coverage };
  });
}

export async function buildSkctriScript() {
  const [sR, aR, cR] = await Promise.allSettled([
    fetch(`${API}/v1/scenario/list`).then(r => r.json()),
    fetch(`${API}/knowledge/`).then(r => r.json()),
    fetch(`${API}/entities/Contact`).then(r => r.json()),
  ]);
  const scenarios = normaliseScenarios(sR.status === 'fulfilled' ? sR.value : []);
  const articles  = normaliseArticles(aR.status  === 'fulfilled' ? aR.value : []);
  const contacts  = normaliseContacts(cR.status  === 'fulfilled' ? cR.value : []);
  const enriched  = correlate(scenarios, articles, contacts);
  const fb  = enriched.filter(e => e._coverage === 'FULLY BRIEFED').length;
  const br  = enriched.filter(e => e._coverage === 'BRIEFED').length;
  const st  = enriched.filter(e => e._coverage === 'STAFFED').length;
  const ur  = enriched.filter(e => e._coverage === 'UNRESOURCED').length;
  return (
    `Scenario × Knowledge × Contact Triple Coverage: ${scenarios.length} scenarios cross-referenced against ` +
    `${articles.length} KB articles and ${contacts.length} contacts. ` +
    `${fb} FULLY BRIEFED (knowledge-backed + contact-assigned); ` +
    `${br} BRIEFED (KB article found, no contact owner); ` +
    `${st} STAFFED (contact found, no knowledge backing); ` +
    `${ur} UNRESOURCED (neither — scenario without knowledge or personnel). ` +
    `Top unresourced scenarios: ${enriched.filter(e => e._coverage === 'UNRESOURCED').slice(0, 3).map(e => e.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const PU = '#A855F7';

const COVERAGE_COLOR = {
  'FULLY BRIEFED': GR,
  'BRIEFED':       CY,
  'STAFFED':       PU,
  'UNRESOURCED':   '#555',
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

const TABS = ['ALL', 'FULLY BRIEFED', 'BRIEFED', 'STAFFED', 'UNRESOURCED'];

export default function ScenarioKnowledgeContactTriple() {
  const [open, setOpen]             = useState(false);
  const [scenarios, setScenarios]   = useState([]);
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
      const [sR, aR, cR] = await Promise.allSettled([
        fetch(`${API}/v1/scenario/list`).then(r => r.json()),
        fetch(`${API}/knowledge/`).then(r => r.json()),
        fetch(`${API}/entities/Contact`).then(r => r.json()),
      ]);
      const raw_s = normaliseScenarios(sR.status === 'fulfilled' ? sR.value : []);
      const raw_a = normaliseArticles(aR.status  === 'fulfilled' ? aR.value : []);
      const raw_c = normaliseContacts(cR.status  === 'fulfilled' ? cR.value : []);
      setScenarios(correlate(raw_s, raw_a, raw_c));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:skctri-toggle', toggle);
    return () => window.removeEventListener('jarvis:skctri-toggle', toggle);
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
      const brief = await buildSkctriScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Scenario × Knowledge × Contact triple coverage brief: ${brief}. Give a 2-sentence assessment of which scenarios are fully briefed with both knowledge and personnel versus unresourced with neither.` }),
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
    const unresourced = scenarios.filter(s => s._coverage === 'UNRESOURCED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Scenario × Knowledge × Contact Triple Coverage (SKCTRI)"
        style={{
          position: 'fixed', left: 737280, bottom: 8, zIndex: 345,
          background: unresourced > 0 ? '#F59E0B22' : '#0a0a1a',
          border: `1px solid ${unresourced > 0 ? AM : CY + '44'}`,
          color: unresourced > 0 ? AM : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ SKCTRI{unresourced > 0 ? ` ⚠${unresourced}` : ''}
      </button>
    );
  }

  const fb = scenarios.filter(s => s._coverage === 'FULLY BRIEFED').length;
  const br = scenarios.filter(s => s._coverage === 'BRIEFED').length;
  const st = scenarios.filter(s => s._coverage === 'STAFFED').length;
  const ur = scenarios.filter(s => s._coverage === 'UNRESOURCED').length;

  const visible = scenarios.filter(s =>
    (tab === 'ALL' || s._coverage === tab) &&
    (!search || s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase()) ||
      s.desc.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6001, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ SCENARIO × KNOWLEDGE × CONTACT TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>SKCTRI</span>
        {ur > 0 && <span style={{ fontSize: 10, color: AM, background: '#F59E0B22', border: '1px solid #F59E0B55', borderRadius: 3, padding: '1px 5px' }}>⚠ {ur} UNRESOURCED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['SCENARIOS',      scenarios.length, CY],
          ['FULLY BRIEFED',  fb,               GR],
          ['BRIEFED',        br,               CY],
          ['STAFFED',        st,               PU],
          ['UNRESOURCED',    ur,               '#555'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {scenarios.length > 0 && [
            [fb, GR], [br, CY], [st, PU], [ur, '#444']
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
          }}>{t}{t !== 'ALL' ? ` (${scenarios.filter(s => s._coverage === t).length})` : ''}</button>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search scenarios…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: AM, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No scenarios match filter.</div>}
        {visible.map(scen => {
          const color = COVERAGE_COLOR[scen._coverage] || CY;
          const isExp = expanded === scen.id;
          return (
            <div key={scen.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : scen.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scen.name}</span>
                {scen.category && chip(scen.category, '#888')}
                {scen.status && chip(scen.status, '#555')}
                {chip(scen._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 600 }}>KB ARTICLES ({scen._articles.length})</div>
                    {scen._articles.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No knowledge backing</div>
                      : scen._articles.map(a => (
                        <div key={a.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                            {a.category && chip(a.category, '#888')}
                          </div>
                          <ScoreBar score={a._score} color={CY} />
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: PU, marginBottom: 4, fontWeight: 600 }}>CONTACTS ({scen._contacts.length})</div>
                    {scen._contacts.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No contact assigned</div>
                      : scen._contacts.map(c => (
                        <div key={c.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                            {c.title && chip(c.title, '#888')}
                            {c.org && chip(c.org, '#555')}
                          </div>
                          <ScoreBar score={c._score} color={PU} />
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
