import { useState, useEffect, useCallback } from 'react';

const API = '';

const KCSTP_RE = /\b(kcstp|knowledge[._-]?contact[._-]?scenario|contact[._-]?scenario[._-]?knowledge|scenario[._-]?contact[._-]?knowledge|deployed[._-]?kb|deployed[._-]?knowledge|archival[._-]?kb|staffed[._-]?kb|scripted[._-]?kb|knowledge[._-]?deployment[._-]?triple|knowledge[._-]?operational[._-]?triple)\b/i;

export function isKcstpQuery(t) {
  return KCSTP_RE.test(t || '');
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
    name:  c.name || c.full_name || c.display_name || `Contact ${i + 1}`,
    org:   c.company || c.organisation || c.organization || c.employer || '',
    role:  c.title || c.role || c.position || '',
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
    name:     s.name || s.title || s.label || `Scenario ${i + 1}`,
    status:   s.status || s.state || '',
    category: s.category || s.type || s.kind || '',
    desc:     String(s.description || s.summary || s.objective || '').slice(0, 200),
    tags:     Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(artToks, other) {
  const otherToks = [
    ...tokens(other.name     || ''),
    ...tokens(other.org      || ''),
    ...tokens(other.role     || ''),
    ...tokens(other.status   || ''),
    ...tokens(other.category || other.type || other.kind || other.domain || ''),
    ...tokens(other.desc     || other.description || other.summary || ''),
    ...tokens(other.tags     || ''),
  ].filter(Boolean);
  if (!artToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (artToks.has(t)) hits++;
  return hits / Math.max(artToks.size, otherToks.length);
}

function correlate(articles, contacts, scenarios) {
  return articles.map(art => {
    const toks = new Set([
      ...tokens(art.name),
      ...tokens(art.category),
      ...tokens(art.desc),
      ...tokens(art.tags),
    ].filter(Boolean));

    const matchedContacts = contacts
      .map(c => ({ ...c, _score: matchScore(toks, c) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedScenarios = scenarios
      .map(s => ({ ...s, _score: matchScore(toks, s) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasContact  = matchedContacts.length > 0;
    const hasScenario = matchedScenarios.length > 0;

    let coverage;
    if (hasContact && hasScenario) coverage = 'FULLY DEPLOYED';
    else if (hasContact)           coverage = 'STAFFED';
    else if (hasScenario)          coverage = 'SCRIPTED';
    else                           coverage = 'ARCHIVAL';

    return { ...art, _contacts: matchedContacts, _scenarios: matchedScenarios, _coverage: coverage };
  });
}

export async function buildKcstpScript() {
  const [aR, cR, sR] = await Promise.allSettled([
    fetch(`${API}/knowledge/`).then(r => r.json()),
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`).then(r => r.json()),
  ]);
  const articles  = normaliseArticles(aR.status  === 'fulfilled' ? aR.value : []);
  const contacts  = normaliseContacts(cR.status  === 'fulfilled' ? cR.value : []);
  const scenarios = normaliseScenarios(sR.status === 'fulfilled' ? sR.value : []);
  const enriched  = correlate(articles, contacts, scenarios);
  const fd   = enriched.filter(e => e._coverage === 'FULLY DEPLOYED').length;
  const stf  = enriched.filter(e => e._coverage === 'STAFFED').length;
  const scr  = enriched.filter(e => e._coverage === 'SCRIPTED').length;
  const arc  = enriched.filter(e => e._coverage === 'ARCHIVAL').length;
  return (
    `Knowledge × Contact × Scenario Triple Coverage: ${articles.length} KB articles cross-referenced against ` +
    `${contacts.length} contacts and ${scenarios.length} scenarios. ` +
    `${fd} FULLY DEPLOYED (contact-aligned + scenario-planned — knowledge is operationally active); ` +
    `${stf} STAFFED (contact found, no scenario plan); ` +
    `${scr} SCRIPTED (scenario found, no contact owner); ` +
    `${arc} ARCHIVAL (neither — knowledge not operationally activated). ` +
    `Critical archival articles: ${enriched.filter(e => e._coverage === 'ARCHIVAL').slice(0, 3).map(e => e.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const PU = '#A78BFA';

const COVERAGE_COLOR = {
  'FULLY DEPLOYED': GR,
  'STAFFED':        CY,
  'SCRIPTED':       PU,
  'ARCHIVAL':       '#555',
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

const TABS = ['ALL', 'FULLY DEPLOYED', 'STAFFED', 'SCRIPTED', 'ARCHIVAL'];

export default function KnowledgeContactScenarioTriple() {
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
      const [aR, cR, sR] = await Promise.allSettled([
        fetch(`${API}/knowledge/`).then(r => r.json()),
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`).then(r => r.json()),
      ]);
      const raw_a = normaliseArticles(aR.status  === 'fulfilled' ? aR.value : []);
      const raw_c = normaliseContacts(cR.status  === 'fulfilled' ? cR.value : []);
      const raw_s = normaliseScenarios(sR.status === 'fulfilled' ? sR.value : []);
      setArticles(correlate(raw_a, raw_c, raw_s));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:kcstp-toggle', toggle);
    return () => window.removeEventListener('jarvis:kcstp-toggle', toggle);
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
      const brief = await buildKcstpScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Knowledge × Contact × Scenario triple coverage brief: ${brief}. Give a 2-sentence assessment of which knowledge domains are fully operationally deployed versus sitting as archival with no people or plans behind them.` }),
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
    const arcCount = articles.filter(a => a._coverage === 'ARCHIVAL').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Knowledge × Contact × Scenario Triple Coverage (KCSTP)"
        style={{
          position: 'fixed', left: 736160, bottom: 8, zIndex: 343,
          background: arcCount > 0 ? '#F59E0B22' : '#0a0a1a',
          border: `1px solid ${arcCount > 0 ? AM : CY + '44'}`,
          color: arcCount > 0 ? AM : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ KCSTP{arcCount > 0 ? ` ⚠${arcCount}` : ''}
      </button>
    );
  }

  const fd  = articles.filter(a => a._coverage === 'FULLY DEPLOYED').length;
  const stf = articles.filter(a => a._coverage === 'STAFFED').length;
  const scr = articles.filter(a => a._coverage === 'SCRIPTED').length;
  const arc = articles.filter(a => a._coverage === 'ARCHIVAL').length;

  const visible = articles.filter(a =>
    (tab === 'ALL' || a._coverage === tab) &&
    (!search || a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.category.toLowerCase().includes(search.toLowerCase()) ||
      a.desc.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6001, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ KNOWLEDGE × CONTACT × SCENARIO TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>KCSTP</span>
        {arc > 0 && <span style={{ fontSize: 10, color: AM, background: '#F59E0B22', border: '1px solid #F59E0B55', borderRadius: 3, padding: '1px 5px' }}>⚠ {arc} ARCHIVAL</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['KB ARTICLES',     articles.length, CY],
          ['FULLY DEPLOYED',  fd,              GR],
          ['STAFFED',         stf,             CY],
          ['SCRIPTED',        scr,             PU],
          ['ARCHIVAL',        arc,             '#555'],
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
            [fd, GR], [stf, CY], [scr, PU], [arc, '#444']
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
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search KB articles…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: AM, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No KB articles match filter.</div>}
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
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 600 }}>CONTACTS ({art._contacts.length})</div>
                    {art._contacts.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No contact alignment</div>
                      : art._contacts.map(c => (
                        <div key={c.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                            {c.role && chip(c.role, '#888')}
                            {c.org  && chip(c.org,  '#555')}
                          </div>
                          <ScoreBar score={c._score} color={CY} />
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
                            {s.status   && chip(s.status,   '#888')}
                            {s.category && chip(s.category, '#555')}
                          </div>
                          <ScoreBar score={s._score} color={PU} />
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
