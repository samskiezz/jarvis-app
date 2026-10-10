import { useState, useEffect, useCallback } from 'react';

const API = '';

const SCENE_IDS = [
  '01_command_atrium',
  '02_neural_bridge',
  '03_threat_matrix',
  '04_quantum_core',
  '05_data_vault',
  '06_field_ops',
  '07_comms_hub',
  '08_analytics_grid',
  '09_strategic_ops',
  '10_deep_intel',
];

const SCIVTRI_RE = /\b(scene[._-]?contact[._-]?invest|scivtri|scene[._-]?invest[._-]?contact|mapped[._-]?scene|unmapped[._-]?scene|scene[._-]?contact[._-]?investment|scene[._-]?investment[._-]?contact|scene[._-]?staffed[._-]?funded|scene[._-]?resource[._-]?triple|scene[._-]?financial[._-]?staffing|scene[._-]?personnel[._-]?invest)\b/i;

export function isScivtriQuery(t) {
  return SCIVTRI_RE.test(t || '');
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function anchorTokens(scene) {
  const anchors = scene.anchors || scene.anchor_points || scene.data || [];
  const anchorText = Array.isArray(anchors)
    ? anchors.map(a => `${a.label || a.name || ''} ${a.description || a.value || ''}`).join(' ')
    : '';
  return new Set([
    ...tokens(scene.title || ''),
    ...tokens(scene.name || ''),
    ...tokens(scene.description || ''),
    ...tokens(scene.id || ''),
    ...tokens(anchorText),
  ].filter(Boolean));
}

function matchScore(sceneToks, item) {
  const itemToks = [
    ...tokens(item.name || item.title || item.label || ''),
    ...tokens(item.category || item.sector || item.type || item.role || item.kind || ''),
    ...tokens(item.description || item.desc || item.summary || item.company || item.org || ''),
    ...tokens(Array.isArray(item.tags) ? item.tags.join(' ') : (item.tags || '')),
    ...tokens(item.ticker || item.symbol || ''),
    ...tokens(item.email || ''),
  ].filter(Boolean);
  if (!sceneToks.size || !itemToks.length) return 0;
  let hits = 0;
  for (const t of itemToks) if (sceneToks.has(t)) hits++;
  return hits / Math.max(sceneToks.size, itemToks.length);
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = ['contacts', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:      c.id || String(i),
    name:    c.name || c.full_name || `Contact ${i + 1}`,
    role:    c.role || c.title || c.position || '',
    org:     c.company || c.org || c.organisation || c.organization || '',
    email:   c.email || '',
    desc:    String(c.description || c.summary || c.notes || '').slice(0, 200),
    tags:    Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function normaliseInvestments(raw) {
  if (!raw) return [];
  const arr = ['investments', 'items', 'results', 'data', 'entities', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((inv, i) => ({
    id:     inv.id || String(i),
    name:   inv.name || inv.title || inv.asset || `Investment ${i + 1}`,
    sector: inv.sector || inv.industry || inv.category || '',
    ticker: inv.ticker || inv.symbol || '',
    desc:   String(inv.description || inv.notes || inv.summary || '').slice(0, 200),
    tags:   Array.isArray(inv.tags) ? inv.tags.join(' ') : (inv.tags || ''),
  }));
}

function correlate(scenes, contacts, investments) {
  return scenes.map(scene => {
    const sToks = anchorTokens(scene);
    const sceneLabel = scene.title || scene.name || scene.id || '?';

    const matchedContacts = contacts
      .map(c => ({ ...c, _score: matchScore(sToks, c) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedInvestments = investments
      .map(inv => ({ ...inv, _score: matchScore(sToks, inv) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasContact    = matchedContacts.length > 0;
    const hasInvestment = matchedInvestments.length > 0;

    let coverage;
    if (hasContact && hasInvestment) coverage = 'FULLY POSITIONED';
    else if (hasContact)             coverage = 'STAFFED';
    else if (hasInvestment)          coverage = 'INVESTED';
    else                             coverage = 'UNMAPPED';

    return { ...scene, _label: sceneLabel, _contacts: matchedContacts, _investments: matchedInvestments, _coverage: coverage };
  });
}

export async function buildScivtriScript() {
  const sceneResults = await Promise.allSettled(
    SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.json()))
  );
  const scenes = sceneResults.map((r, i) => ({
    id: SCENE_IDS[i],
    ...(r.status === 'fulfilled' ? r.value : {}),
  }));
  const [cR, iR] = await Promise.allSettled([
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/entities/Investment`).then(r => r.json()),
  ]);
  const contacts     = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
  const investments  = normaliseInvestments(iR.status === 'fulfilled' ? iR.value : []);
  const enriched     = correlate(scenes, contacts, investments);
  const fp  = enriched.filter(s => s._coverage === 'FULLY POSITIONED').length;
  const st  = enriched.filter(s => s._coverage === 'STAFFED').length;
  const iv  = enriched.filter(s => s._coverage === 'INVESTED').length;
  const um  = enriched.filter(s => s._coverage === 'UNMAPPED').length;
  const unmappedNames = enriched.filter(s => s._coverage === 'UNMAPPED').slice(0, 3).map(s => s._label).join(', ') || 'none';
  return (
    `Scene × Contact × Investment Triple Coverage: ${scenes.length} scenes cross-referenced against ${contacts.length} contacts and ${investments.length} investments. ` +
    `${fp} scenes are FULLY POSITIONED (contact-aligned + investment-backed); ${st} are STAFFED (contact found, no investment); ` +
    `${iv} are INVESTED (investment found, no contact); ${um} are UNMAPPED (no human or financial backing — operational gap). ` +
    `Unmapped scenes: ${unmappedNames}.`
  );
}

const PANEL_W = 680;
const PANEL_H = 610;
const CY = '#00CFFF';
const TL = '#14B8A6';
const AM = '#F59E0B';
const RD = '#EF4444';
const GR = '#22C55E';

const COVERAGE_COLOR = {
  'FULLY POSITIONED': TL,
  'STAFFED':          CY,
  'INVESTED':         GR,
  'UNMAPPED':         RD,
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

const TABS = ['ALL', 'FULLY POSITIONED', 'STAFFED', 'INVESTED', 'UNMAPPED'];

export default function SceneContactInvestmentTriple() {
  const [open, setOpen]           = useState(false);
  const [scenes, setScenes]       = useState([]);
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
      const sceneResults = await Promise.allSettled(
        SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.json()))
      );
      const rawScenes = sceneResults.map((r, i) => ({
        id: SCENE_IDS[i],
        ...(r.status === 'fulfilled' ? r.value : {}),
      }));
      const [cR, iR] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/entities/Investment`).then(r => r.json()),
      ]);
      const rawContacts    = normaliseContacts(cR.status === 'fulfilled' ? cR.value : []);
      const rawInvestments = normaliseInvestments(iR.status === 'fulfilled' ? iR.value : []);
      setScenes(correlate(rawScenes, rawContacts, rawInvestments));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:scivtri-toggle', toggle);
    return () => window.removeEventListener('jarvis:scivtri-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessText('');
    try {
      const brief = await buildScivtriScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Scene × Contact × Investment triple coverage brief: ${brief}. Give a 2-sentence scene-resource coverage assessment.` }),
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
    const umCount = scenes.filter(s => s._coverage === 'UNMAPPED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Scene × Contact × Investment Triple Coverage (SCIVTRI)"
        style={{
          position: 'fixed', left: 746240, bottom: 8, zIndex: 361,
          background: umCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${umCount > 0 ? RD : TL + '44'}`,
          color: umCount > 0 ? RD : TL, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ SCIVTRI{umCount > 0 ? ` ⚠${umCount}` : ''}
      </button>
    );
  }

  const fp = scenes.filter(s => s._coverage === 'FULLY POSITIONED').length;
  const st = scenes.filter(s => s._coverage === 'STAFFED').length;
  const iv = scenes.filter(s => s._coverage === 'INVESTED').length;
  const um = scenes.filter(s => s._coverage === 'UNMAPPED').length;

  const visible = scenes.filter(s =>
    (tab === 'ALL' || s._coverage === tab) &&
    (!search || s._label.toLowerCase().includes(search.toLowerCase()) || s.id.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #14B8A633', borderRadius: 8,
      zIndex: 6000, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #14B8A618',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #14B8A622', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: TL, fontWeight: 700, fontSize: 11 }}>◈ SCENE × CONTACT × INVESTMENT TRIPLE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>SCIVTRI</span>
        {um > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {um} UNMAPPED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['SCENES',           scenes.length, TL],
          ['FULLY POSITIONED', fp, TL],
          ['STAFFED',          st, CY],
          ['INVESTED',         iv, GR],
          ['UNMAPPED',         um, RD],
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
          {scenes.length > 0 && [
            [fp, TL], [st, CY], [iv, GR], [um, RD]
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
            background: tab === t ? (COVERAGE_COLOR[t] || TL) + '33' : '#0a0a1a',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || TL) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || TL) : '#888',
          }}>{t}{t !== 'ALL' ? ` (${scenes.filter(s => s._coverage === t).length})` : ''}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search scenes…"
          style={{ width: '100%', background: '#08080e', border: '1px solid #14B8A633', borderRadius: 4, color: TL, fontSize: 10, padding: '4px 8px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>No scenes match filter.</div>}
        {visible.map(scene => {
          const color = COVERAGE_COLOR[scene._coverage] || TL;
          const isExp = expanded === scene.id;
          return (
            <div key={scene.id} style={{ marginBottom: 5, border: `1px solid ${color}33`, borderRadius: 5, background: '#06060e', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isExp ? null : scene.id)} style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scene._label}</span>
                <span style={{ fontSize: 9, color: '#666', flexShrink: 0 }}>{scene.id}</span>
                {chip(scene._coverage, color)}
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '8px', display: 'flex', gap: 8 }}>
                  {/* Left: Contacts */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 600 }}>CONTACTS ({scene._contacts.length})</div>
                    {scene._contacts.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No contact alignment</div>
                      : scene._contacts.map(c => (
                        <div key={c.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                            {c.role && chip(c.role, CY)}
                            {c.org && chip(c.org, AM)}
                          </div>
                          <ScoreBar score={c._score} color={CY} />
                        </div>
                      ))
                    }
                  </div>
                  {/* Divider */}
                  <div style={{ width: 1, background: '#1a1a2a', flexShrink: 0 }} />
                  {/* Right: Investments */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: TL, marginBottom: 4, fontWeight: 600 }}>INVESTMENTS ({scene._investments.length})</div>
                    {scene._investments.length === 0
                      ? <div style={{ fontSize: 9, color: '#555', fontStyle: 'italic' }}>No investment alignment</div>
                      : scene._investments.map(inv => (
                        <div key={inv.id} style={{ marginBottom: 5 }}>
                          <div style={{ fontSize: 9, color: '#ccc', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.name}</span>
                            {inv.sector && chip(inv.sector, TL)}
                            {inv.ticker && chip(inv.ticker, GR)}
                          </div>
                          <ScoreBar score={inv._score} color={TL} />
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
      <div style={{ padding: '6px 12px', borderTop: '1px solid #14B8A622', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button onClick={load} disabled={loading} style={{ fontSize: 9, padding: '3px 10px', borderRadius: 3, background: '#0a0a1a', border: '1px solid #14B8A644', color: TL, cursor: 'pointer' }}>
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
