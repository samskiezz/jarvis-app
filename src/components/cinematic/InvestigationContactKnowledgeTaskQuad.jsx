import { useState, useEffect, useCallback } from 'react';

const API = '';

const ICKTQ_RE = /\b(icktq|investigation[._-]?contact[._-]?knowledge[._-]?task|investigation[._-]?quad|case[._-]?quad|fully[._-]?managed[._-]?investigation|unsupported[._-]?investigation|investigation[._-]?resource[._-]?quad|investigation[._-]?readiness[._-]?matrix|case[._-]?readiness[._-]?matrix|investigation[._-]?four[._-]?way|case[._-]?four[._-]?way)\b/i;

export function isIcktqQuery(t) {
  return ICKTQ_RE.test(t || '');
}

function normaliseInvestigations(raw) {
  if (!raw) return [];
  const arr = ['investigations', 'cases', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((inv, i) => ({
    id:   inv.id || String(i),
    name: inv.title || inv.name || inv.subject || `Investigation ${i + 1}`,
    kind: inv.kind || inv.type || inv.status || '',
    desc: String(inv.description || inv.summary || inv.objective || '').slice(0, 200),
    tags: Array.isArray(inv.tags) ? inv.tags.join(' ') : (inv.tags || ''),
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

function normaliseTasks(raw) {
  if (!raw) return [];
  const arr = ['tasks', 'items', 'results', 'data', 'records', 'missions'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((t, i) => ({
    id:       t.id || String(i),
    name:     t.title || t.name || t.task || `Task ${i + 1}`,
    status:   t.status || t.state || '',
    priority: t.priority || t.urgency || '',
    desc:     String(t.description || t.objective || t.summary || '').slice(0, 200),
    tags:     Array.isArray(t.tags) ? t.tags.join(' ') : (t.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(invToks, other) {
  const otherToks = [
    ...tokens(other.name     || ''),
    ...tokens(other.category || other.type || other.kind || ''),
    ...tokens(other.title    || other.role || other.org || other.status || other.priority || ''),
    ...tokens(other.desc     || other.description || other.summary || ''),
    ...tokens(other.tags     || ''),
  ].filter(Boolean);
  if (!invToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (invToks.has(t)) hits++;
  return hits / Math.max(invToks.size, otherToks.length);
}

function correlate(investigations, contacts, articles, tasks) {
  return investigations.map(inv => {
    const toks = new Set([
      ...tokens(inv.name),
      ...tokens(inv.kind),
      ...tokens(inv.desc),
      ...tokens(inv.tags),
    ].filter(Boolean));

    const matchedContacts = contacts
      .map(c => ({ ...c, _score: matchScore(toks, c) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 3);

    const matchedArticles = articles
      .map(a => ({ ...a, _score: matchScore(toks, a) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 3);

    const matchedTasks = tasks
      .map(t => ({ ...t, _score: matchScore(toks, t) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 3);

    const src = [matchedContacts.length > 0, matchedArticles.length > 0, matchedTasks.length > 0].filter(Boolean).length;

    let coverage;
    if (src === 3)      coverage = 'FULLY MANAGED';
    else if (src === 2) coverage = 'RESOURCED';
    else if (src === 1) coverage = 'SPARSE';
    else                coverage = 'UNSUPPORTED';

    return { ...inv, _contacts: matchedContacts, _articles: matchedArticles, _tasks: matchedTasks, _coverage: coverage, _src: src };
  });
}

export async function buildIcktqScript() {
  const [iR, cR, aR, tR] = await Promise.allSettled([
    fetch(`${API}/v1/investigations`).then(r => r.json()),
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/knowledge/`).then(r => r.json()),
    fetch(`${API}/entities/Task`).then(r => r.json()),
  ]);
  const investigations = normaliseInvestigations(iR.status === 'fulfilled' ? iR.value : []);
  const contacts       = normaliseContacts(cR.status       === 'fulfilled' ? cR.value : []);
  const articles       = normaliseArticles(aR.status       === 'fulfilled' ? aR.value : []);
  const tasks          = normaliseTasks(tR.status          === 'fulfilled' ? tR.value : []);
  const enriched       = correlate(investigations, contacts, articles, tasks);
  const fm  = enriched.filter(e => e._coverage === 'FULLY MANAGED').length;
  const re  = enriched.filter(e => e._coverage === 'RESOURCED').length;
  const sp  = enriched.filter(e => e._coverage === 'SPARSE').length;
  const un  = enriched.filter(e => e._coverage === 'UNSUPPORTED').length;
  return (
    `Investigation × Contact × Knowledge × Task Quad Coverage: ${investigations.length} investigations cross-referenced against ` +
    `${contacts.length} contacts, ${articles.length} KB articles, and ${tasks.length} tasks. ` +
    `${fm} FULLY MANAGED (contact + KB + task backing); ` +
    `${re} RESOURCED (2 of 3 sources); ` +
    `${sp} SPARSE (1 of 3 sources); ` +
    `${un} UNSUPPORTED (no contact, knowledge, or task coverage — investigation accountability gap). ` +
    `Top unsupported cases: ${enriched.filter(e => e._coverage === 'UNSUPPORTED').slice(0, 3).map(e => e.name).join(', ') || 'none'}.`
  );
}

const PANEL_W = 720;
const PANEL_H = 640;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const PU = '#A855F7';
const TE = '#14B8A6';

const COVERAGE_COLOR = {
  'FULLY MANAGED': GR,
  'RESOURCED':     CY,
  'SPARSE':        AM,
  'UNSUPPORTED':   '#555',
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

const TABS = ['ALL', 'FULLY MANAGED', 'RESOURCED', 'SPARSE', 'UNSUPPORTED'];

export default function InvestigationContactKnowledgeTaskQuad() {
  const [open, setOpen]               = useState(false);
  const [investigations, setInvestigations] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [tab, setTab]                 = useState('ALL');
  const [search, setSearch]           = useState('');
  const [expanded, setExpanded]       = useState(null);
  const [assessing, setAssessing]     = useState(false);
  const [assessText, setAssessText]   = useState('');
  const [err, setErr]                 = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [iR, cR, aR, tR] = await Promise.allSettled([
        fetch(`${API}/v1/investigations`).then(r => r.json()),
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/knowledge/`).then(r => r.json()),
        fetch(`${API}/entities/Task`).then(r => r.json()),
      ]);
      const raw_i = normaliseInvestigations(iR.status === 'fulfilled' ? iR.value : []);
      const raw_c = normaliseContacts(cR.status       === 'fulfilled' ? cR.value : []);
      const raw_a = normaliseArticles(aR.status       === 'fulfilled' ? aR.value : []);
      const raw_t = normaliseTasks(tR.status          === 'fulfilled' ? tR.value : []);
      setInvestigations(correlate(raw_i, raw_c, raw_a, raw_t));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:icktq-toggle', toggle);
    return () => window.removeEventListener('jarvis:icktq-toggle', toggle);
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
      const brief = await buildIcktqScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Investigation × Contact × Knowledge × Task quad coverage brief: ${brief}. Give a 2-sentence assessment of which investigations are fully managed with contact, knowledge, and task backing versus unsupported with none of these.` }),
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
    const unsupported = investigations.filter(s => s._coverage === 'UNSUPPORTED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investigation × Contact × Knowledge × Task Quad Coverage (ICKTQ)"
        style={{
          position: 'fixed', left: 737840, bottom: 8, zIndex: 346,
          background: unsupported > 0 ? '#F59E0B22' : '#0a0a1a',
          border: `1px solid ${unsupported > 0 ? AM : CY + '44'}`,
          color: unsupported > 0 ? AM : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ ICKTQ{unsupported > 0 ? ` ⚠${unsupported}` : ''}
      </button>
    );
  }

  const fm = investigations.filter(s => s._coverage === 'FULLY MANAGED').length;
  const re = investigations.filter(s => s._coverage === 'RESOURCED').length;
  const sp = investigations.filter(s => s._coverage === 'SPARSE').length;
  const un = investigations.filter(s => s._coverage === 'UNSUPPORTED').length;

  const visible = investigations.filter(inv =>
    (tab === 'ALL' || inv._coverage === tab) &&
    (!search || inv.name.toLowerCase().includes(search.toLowerCase()) ||
      inv.kind.toLowerCase().includes(search.toLowerCase()) ||
      inv.desc.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6001, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00CFFF22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>◈ INVESTIGATION × CONTACT × KNOWLEDGE × TASK QUAD</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>ICKTQ</span>
        {un > 0 && <span style={{ fontSize: 10, color: AM, background: '#F59E0B22', border: '1px solid #F59E0B55', borderRadius: 3, padding: '1px 5px' }}>⚠ {un} UNSUPPORTED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['INVESTIGATIONS', investigations.length, CY],
          ['FULLY MANAGED',  fm,                   GR],
          ['RESOURCED',      re,                   CY],
          ['SPARSE',         sp,                   AM],
          ['UNSUPPORTED',    un,                   '#555'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: '1 1 80px', minWidth: 70, background: '#08080e', border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {investigations.length > 0 && [
            [fm, GR], [re, CY], [sp, AM], [un, '#444']
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
          }}>{t}{t !== 'ALL' ? ` (${investigations.filter(s => s._coverage === t).length})` : ''}</button>
        ))}
      </div>

      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search investigations…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #00CFFF33', borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: AM, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No investigations match filter.</div>}
        {visible.map(inv => {
          const color = COVERAGE_COLOR[inv._coverage] || CY;
          const isExp = expanded === inv.id;
          return (
            <div key={inv.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : inv.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.name}</span>
                {inv.kind && chip(inv.kind, '#888')}
                {chip(inv._coverage, color)}
                <span style={{ fontSize: 9, color: '#555', flexShrink: 0 }}>{inv._src}/3</span>
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: TE, marginBottom: 4, fontWeight: 600 }}>CONTACTS ({inv._contacts.length})</div>
                    {inv._contacts.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No contact assigned</div>
                      : inv._contacts.map(c => (
                        <div key={c.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                            {c.title && chip(c.title, '#888')}
                          </div>
                          <ScoreBar score={c._score} color={TE} />
                        </div>
                      ))
                    }
                  </div>
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 600 }}>KB ARTICLES ({inv._articles.length})</div>
                    {inv._articles.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No knowledge backing</div>
                      : inv._articles.map(a => (
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
                    <div style={{ fontSize: 9, color: GR, marginBottom: 4, fontWeight: 600 }}>TASKS ({inv._tasks.length})</div>
                    {inv._tasks.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No task assigned</div>
                      : inv._tasks.map(t => (
                        <div key={t.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                            {t.status && chip(t.status, '#888')}
                            {t.priority && chip(t.priority, PU)}
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
