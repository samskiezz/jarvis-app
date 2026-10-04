import { useState, useEffect, useCallback } from 'react';

const API = '';

const SCITRI_RE = /\b(scitri|scenario[._-]?contact[._-]?invest|scenario[._-]?investment[._-]?contact|scenario[._-]?staffed[._-]?funded|staffed[._-]?funded[._-]?scenario|scenario[._-]?resource[._-]?triple|fully[._-]?resourced[._-]?scenario|unsupported[._-]?scenario[._-]?invest|scenario[._-]?invest[._-]?contact|contact[._-]?invest[._-]?scenario)\b/i;

export function isScitriQuery(t) {
  return SCITRI_RE.test(t || '');
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
    category: s.category || s.type || s.kind || '',
    status:   s.status || s.state || '',
    desc:     String(s.description || s.summary || s.objective || '').slice(0, 200),
    tags:     Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
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

function normaliseInvestments(raw) {
  if (!raw) return [];
  const arr = ['investments', 'items', 'results', 'data', 'records', 'portfolio'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((inv, i) => ({
    id:     inv.id || String(i),
    name:   inv.name || inv.title || inv.asset || `Investment ${i + 1}`,
    sector: inv.sector || inv.category || inv.type || '',
    ticker: inv.ticker || inv.symbol || '',
    desc:   String(inv.description || inv.notes || inv.summary || '').slice(0, 200),
    tags:   Array.isArray(inv.tags) ? inv.tags.join(' ') : (inv.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(scenToks, other) {
  const otherToks = [
    ...tokens(other.name),
    ...tokens(other.category || other.sector || other.type || other.title || other.org || ''),
    ...tokens(other.ticker || other.status || ''),
    ...tokens(other.desc),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!scenToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (scenToks.has(t)) hits++;
  return hits / Math.max(scenToks.size, otherToks.length);
}

function correlate(scenarios, contacts, investments) {
  return scenarios.map(sc => {
    const toks = new Set([
      ...tokens(sc.name),
      ...tokens(sc.category),
      ...tokens(sc.desc),
      ...tokens(sc.tags),
    ].filter(Boolean));

    const matchedContacts = contacts
      .map(c => ({ ...c, _score: matchScore(toks, c) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedInvestments = investments
      .map(inv => ({ ...inv, _score: matchScore(toks, inv) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasContact    = matchedContacts.length > 0;
    const hasInvestment = matchedInvestments.length > 0;

    let coverage;
    if (hasContact && hasInvestment) coverage = 'FULLY RESOURCED';
    else if (hasContact)             coverage = 'STAFFED';
    else if (hasInvestment)          coverage = 'INVESTED';
    else                             coverage = 'UNSUPPORTED';

    return { ...sc, _contacts: matchedContacts, _investments: matchedInvestments, _coverage: coverage };
  });
}

export async function buildScitriScript() {
  const [sR, cR, iR] = await Promise.allSettled([
    fetch(`${API}/v1/scenario/list`).then(r => r.json()),
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/entities/Investment`).then(r => r.json()),
  ]);
  const scenarios   = normaliseScenarios(sR.status   === 'fulfilled' ? sR.value : []);
  const contacts    = normaliseContacts(cR.status     === 'fulfilled' ? cR.value : []);
  const investments = normaliseInvestments(iR.status  === 'fulfilled' ? iR.value : []);
  const enriched    = correlate(scenarios, contacts, investments);
  const fr = enriched.filter(e => e._coverage === 'FULLY RESOURCED').length;
  const st = enriched.filter(e => e._coverage === 'STAFFED').length;
  const iv = enriched.filter(e => e._coverage === 'INVESTED').length;
  const un = enriched.filter(e => e._coverage === 'UNSUPPORTED').length;
  return (
    `Scenario × Contact × Investment Triple Coverage: ${scenarios.length} scenarios cross-referenced against ` +
    `${contacts.length} contacts and ${investments.length} investments. ` +
    `${fr} FULLY RESOURCED (contact + investment backing); ` +
    `${st} STAFFED (contact found, no investment alignment); ` +
    `${iv} INVESTED (investment found, no contact owner); ` +
    `${un} UNSUPPORTED (no contact or investment coverage — scenario resource gap). ` +
    `Top unsupported: ${enriched.filter(e => e._coverage === 'UNSUPPORTED').slice(0, 3).map(e => e.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 700;
const PANEL_H = 620;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const LI = '#84CC16';
const PU = '#A855F7';

const COVERAGE_COLOR = {
  'FULLY RESOURCED': GR,
  'STAFFED':         CY,
  'INVESTED':        LI,
  'UNSUPPORTED':     '#555',
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

const TABS = ['ALL', 'FULLY RESOURCED', 'STAFFED', 'INVESTED', 'UNSUPPORTED'];

export default function ScenarioContactInvestTriple() {
  const [open, setOpen]           = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]             = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [sR, cR, iR] = await Promise.allSettled([
        fetch(`${API}/v1/scenario/list`).then(r => r.json()),
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/entities/Investment`).then(r => r.json()),
      ]);
      const raw_s = normaliseScenarios(sR.status   === 'fulfilled' ? sR.value : []);
      const raw_c = normaliseContacts(cR.status     === 'fulfilled' ? cR.value : []);
      const raw_i = normaliseInvestments(iR.status  === 'fulfilled' ? iR.value : []);
      setScenarios(correlate(raw_s, raw_c, raw_i));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:scitri-toggle', toggle);
    return () => window.removeEventListener('jarvis:scitri-toggle', toggle);
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
      const brief = await buildScitriScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Scenario × Contact × Investment triple coverage: ${brief}. Give a 2-sentence assessment of which scenarios are fully resourced with contact and investment backing versus unsupported with neither.` }),
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
    const unsupported = scenarios.filter(s => s._coverage === 'UNSUPPORTED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Scenario × Contact × Investment Triple Coverage (SCITRI)"
        style={{
          position: 'fixed', left: 741760, bottom: 8, zIndex: 353,
          background: unsupported > 0 ? '#F59E0B22' : '#0a0a1a',
          border: `1px solid ${unsupported > 0 ? AM : CY + '44'}`,
          color: unsupported > 0 ? AM : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ SCITRI{unsupported > 0 ? ` ⚠${unsupported}` : ''}
      </button>
    );
  }

  const fr = scenarios.filter(s => s._coverage === 'FULLY RESOURCED').length;
  const st = scenarios.filter(s => s._coverage === 'STAFFED').length;
  const iv = scenarios.filter(s => s._coverage === 'INVESTED').length;
  const un = scenarios.filter(s => s._coverage === 'UNSUPPORTED').length;

  const visible = scenarios.filter(sc =>
    (tab === 'ALL' || sc._coverage === tab) &&
    (!search || sc.name.toLowerCase().includes(search.toLowerCase()) ||
      sc.category.toLowerCase().includes(search.toLowerCase()) ||
      sc.desc.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6001, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ SCENARIO × CONTACT × INVESTMENT TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>SCITRI</span>
        {un > 0 && <span style={{ fontSize: 10, color: AM, background: '#F59E0B22', border: '1px solid #F59E0B55', borderRadius: 3, padding: '1px 5px' }}>⚠ {un} UNSUPPORTED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['SCENARIOS',       scenarios.length, CY],
          ['FULLY RESOURCED', fr,               GR],
          ['STAFFED',         st,               CY],
          ['INVESTED',        iv,               LI],
          ['UNSUPPORTED',     un,               '#555'],
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
            [fr, GR], [st, CY], [iv, LI], [un, '#444']
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
        {visible.map(sc => {
          const color = COVERAGE_COLOR[sc._coverage] || CY;
          const isExp = expanded === sc.id;
          return (
            <div key={sc.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : sc.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sc.name}</span>
                {sc.category && chip(sc.category, '#888')}
                {sc.status && chip(sc.status, PU)}
                {chip(sc._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 600 }}>CONTACTS ({sc._contacts.length})</div>
                    {sc._contacts.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No contact assigned</div>
                      : sc._contacts.map(c => (
                        <div key={c.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                            {c.title && chip(c.title, '#888')}
                            {c.org && chip(c.org, CY + '88')}
                          </div>
                          <ScoreBar score={c._score} color={CY} />
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: LI, marginBottom: 4, fontWeight: 600 }}>INVESTMENTS ({sc._investments.length})</div>
                    {sc._investments.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No investment alignment</div>
                      : sc._investments.map(inv => (
                        <div key={inv.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.name}</span>
                            {inv.sector && chip(inv.sector, '#888')}
                            {inv.ticker && chip(inv.ticker, LI)}
                          </div>
                          <ScoreBar score={inv._score} color={LI} />
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
