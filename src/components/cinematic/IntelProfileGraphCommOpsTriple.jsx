import { useState, useEffect, useCallback } from 'react';

const API = '';

const IGCOE_RE = /\b(igcoe|intel[._-]?community[._-]?ops?|threat[._-]?community[._-]?ops?|profile[._-]?community[._-]?ops?|intel[._-]?ops?[._-]?community|intel[._-]?profile[._-]?ops?[._-]?community|threat[._-]?actor[._-]?community[._-]?ops?|community[._-]?intel[._-]?ops?|profile[._-]?ops?[._-]?community)\b/i;

export function isIgcoeQuery(t) {
  return IGCOE_RE.test(t || '');
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function profileToks(p) {
  return new Set([
    ...tokens(p.name || p.label || ''),
    ...tokens(p.description || p.summary || p.bio || ''),
    ...tokens(p.category || p.type || p.kind || ''),
    ...tokens(p.nationality || p.origin || p.country || ''),
    ...tokens(Array.isArray(p.aliases) ? p.aliases.join(' ') : (p.aliases || '')),
    ...tokens(Array.isArray(p.tags) ? p.tags.join(' ') : (p.tags || '')),
  ].filter(Boolean));
}

function commScore(pToks, comm) {
  const cToks = [
    ...tokens(comm.label || comm.name || comm.id || ''),
    ...tokens(comm.description || comm.summary || ''),
    ...tokens(comm.type || comm.category || ''),
    ...tokens(Array.isArray(comm.members) ? comm.members.join(' ') : ''),
    ...tokens(Array.isArray(comm.tags) ? comm.tags.join(' ') : (comm.tags || '')),
  ].filter(Boolean);
  if (!pToks.size || !cToks.length) return 0;
  let hits = 0;
  for (const t of cToks) if (pToks.has(t)) hits++;
  return hits / Math.max(pToks.size, cToks.length);
}

function opsScore(pToks, ev) {
  const evToks = [
    ...tokens(ev.name || ev.title || ev.label || ''),
    ...tokens(ev.type || ev.kind || ev.category || ''),
    ...tokens(ev.description || ev.message || ev.detail || ev.summary || ''),
    ...tokens(ev.service || ev.component || ''),
    ...tokens(Array.isArray(ev.tags) ? ev.tags.join(' ') : (ev.tags || '')),
  ].filter(Boolean);
  if (!pToks.size || !evToks.length) return 0;
  let hits = 0;
  for (const t of evToks) if (pToks.has(t)) hits++;
  return hits / Math.max(pToks.size, evToks.length);
}

function normaliseProfiles(raw) {
  const arr = ['profiles', 'intel_profiles', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((p, i) => ({
    id:          p.id || String(i),
    name:        p.name || p.label || p.subject || `Profile ${i + 1}`,
    category:    p.category || p.type || p.actor_type || '',
    nationality: p.nationality || p.origin || p.country || '',
    description: String(p.description || p.summary || p.bio || '').slice(0, 200),
    aliases:     Array.isArray(p.aliases) ? p.aliases.join(', ') : (p.aliases || ''),
    tags:        Array.isArray(p.tags) ? p.tags.join(' ') : (p.tags || ''),
  }));
}

function normaliseCommunities(raw) {
  const arr = ['communities', 'clusters', 'items', 'results', 'data'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:      c.id || String(i),
    name:    c.label || c.name || c.id || `Community ${i + 1}`,
    type:    c.type || c.category || '',
    members: Array.isArray(c.members) ? c.members : [],
    summary: String(c.description || c.summary || '').slice(0, 200),
  }));
}

function normaliseOpsEvents(raw) {
  const arr = ['events', 'ops_events', 'items', 'results', 'data'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((e, i) => ({
    id:       e.id || String(i),
    name:     e.name || e.title || e.label || e.type || `Event ${i + 1}`,
    type:     e.type || e.kind || e.category || '',
    severity: (e.severity || e.level || e.priority || '').toLowerCase(),
    detail:   String(e.description || e.message || e.detail || '').slice(0, 200),
    tags:     Array.isArray(e.tags) ? e.tags.join(' ') : (e.tags || ''),
  }));
}

function correlate(profiles, communities, opsEvents) {
  return profiles.map(p => {
    const toks = profileToks(p);

    const matchedComms = communities
      .map(c => ({ ...c, _score: commScore(toks, c) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);

    const matchedOps = opsEvents
      .map(e => ({ ...e, _score: opsScore(toks, e) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);

    const hasCommunity = matchedComms.length > 0;
    const hasOps       = matchedOps.length > 0;

    let coverage;
    if (hasCommunity && hasOps) coverage = 'FULLY TRACKED';
    else if (hasCommunity)      coverage = 'COMMUNITY-LINKED';
    else if (hasOps)            coverage = 'OPS-MONITORED';
    else                        coverage = 'UNTRACKED';

    return { ...p, _comms: matchedComms, _ops: matchedOps, _coverage: coverage };
  });
}

export async function buildIgcoeScript() {
  const [profR, commR, opsR] = await Promise.allSettled([
    fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
    fetch(`${API}/v1/graph/communities`).then(r => r.json()),
    fetch(`${API}/v1/ops/events`).then(r => r.json()),
  ]);
  const profiles    = normaliseProfiles(profR.status === 'fulfilled' ? profR.value : []);
  const communities = normaliseCommunities(commR.status === 'fulfilled' ? commR.value : []);
  const opsEvents   = normaliseOpsEvents(opsR.status === 'fulfilled' ? opsR.value : []);
  const enriched    = correlate(profiles, communities, opsEvents);

  const ft = enriched.filter(e => e._coverage === 'FULLY TRACKED').length;
  const cl = enriched.filter(e => e._coverage === 'COMMUNITY-LINKED').length;
  const om = enriched.filter(e => e._coverage === 'OPS-MONITORED').length;
  const ut = enriched.filter(e => e._coverage === 'UNTRACKED').length;

  return (
    `Intel Profile × Graph Community × Ops Event Triple Coverage: ${profiles.length} threat actor profiles ` +
    `cross-referenced against ${communities.length} graph communities and ${opsEvents.length} ops events. ` +
    `${ft} FULLY TRACKED (community-linked + ops-monitored); ${cl} COMMUNITY-LINKED (community match, no ops coverage); ` +
    `${om} OPS-MONITORED (ops event detected, no community); ${ut} UNTRACKED (no network or operational monitoring). ` +
    `Priority untracked: ${enriched.filter(e => e._coverage === 'UNTRACKED').map(e => e.name).slice(0, 3).join(', ') || 'none'}.`
  );
}

const PANEL_W = 760;
const PANEL_H = 660;
const RD = '#EF4444';
const AM = '#F59E0B';
const CY = '#00CFFF';
const TE = '#2DD4BF';
const GR = '#22C55E';

const COVERAGE_COLOR = {
  'FULLY TRACKED':      GR,
  'COMMUNITY-LINKED':   TE,
  'OPS-MONITORED':      AM,
  'UNTRACKED':          RD,
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

const SEVERITY_COLOR = { critical: RD, error: RD, warning: AM, warn: AM, info: CY, low: GR };

const TABS = ['ALL', 'FULLY TRACKED', 'COMMUNITY-LINKED', 'OPS-MONITORED', 'UNTRACKED'];

export default function IntelProfileGraphCommOpsTriple() {
  const [open, setOpen]             = useState(false);
  const [profiles, setProfiles]     = useState([]);
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
      const [profR, commR, opsR] = await Promise.allSettled([
        fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
        fetch(`${API}/v1/graph/communities`).then(r => r.json()),
        fetch(`${API}/v1/ops/events`).then(r => r.json()),
      ]);
      const profs = normaliseProfiles(profR.status === 'fulfilled' ? profR.value : []);
      const comms = normaliseCommunities(commR.status === 'fulfilled' ? commR.value : []);
      const ops   = normaliseOpsEvents(opsR.status === 'fulfilled' ? opsR.value : []);
      setProfiles(correlate(profs, comms, ops));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:igcoe-toggle', toggle);
    return () => window.removeEventListener('jarvis:igcoe-toggle', toggle);
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
      const brief = await buildIgcoeScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Intel profile × graph community × ops event coverage: ${brief}. Give a 2-sentence threat intelligence coverage brief identifying the highest-priority untracked profiles.` }),
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
    const untrackedCount = profiles.filter(p => p._coverage === 'UNTRACKED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Intel Profile × Graph Community × Ops Event Triple Coverage (IGCOE)"
        style={{
          position: 'fixed', left: 747920, bottom: 8, zIndex: 364,
          background: untrackedCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${untrackedCount > 0 ? RD : CY + '44'}`,
          color: untrackedCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ IGCOE{untrackedCount > 0 ? ` ⚠${untrackedCount}` : ''}
      </button>
    );
  }

  const ft = profiles.filter(p => p._coverage === 'FULLY TRACKED').length;
  const cl = profiles.filter(p => p._coverage === 'COMMUNITY-LINKED').length;
  const om = profiles.filter(p => p._coverage === 'OPS-MONITORED').length;
  const ut = profiles.filter(p => p._coverage === 'UNTRACKED').length;

  const visible = profiles.filter(p =>
    (tab === 'ALL' || p._coverage === tab) &&
    (!search || p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #EF444433', borderRadius: 8,
      zIndex: 6002, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #EF444418',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #EF444422', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: RD, fontWeight: 700, fontSize: 11 }}>◈ INTEL PROFILE × GRAPH COMMUNITY × OPS EVENT</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>IGCOE</span>
        {ut > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {ut} UNTRACKED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['PROFILES',         profiles.length, CY],
          ['FULLY TRACKED',    ft,              GR],
          ['COMM-LINKED',      cl,              TE],
          ['OPS-MONITORED',    om,              AM],
          ['UNTRACKED',        ut,              RD],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: '#0c0c1e', border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px', minWidth: 80, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
        <button
          onClick={assess}
          disabled={assessing}
          style={{ marginLeft: 'auto', background: assessing ? '#111' : '#0a1a0a', border: `1px solid ${GR}55`, color: GR, borderRadius: 4, padding: '4px 12px', fontSize: 10, cursor: assessing ? 'default' : 'pointer', fontFamily: 'monospace' }}
        >
          {assessing ? '…' : '▶ ASSESS'}
        </button>
      </div>

      {assessText && (
        <div style={{ margin: '0 12px 8px', padding: '6px 10px', background: '#0a0a0a', border: `1px solid ${GR}33`, borderRadius: 4, fontSize: 10, color: '#aaa', lineHeight: 1.5, flexShrink: 0 }}>
          {assessText}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? (COVERAGE_COLOR[t] || CY) + '22' : 'transparent',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#666',
            borderRadius: 3, padding: '2px 8px', fontSize: 9, cursor: 'pointer', fontFamily: 'monospace',
          }}>{t}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search profiles…"
          style={{ marginLeft: 'auto', background: '#0c0c1e', border: '1px solid #333', color: '#aaa', borderRadius: 3, padding: '2px 8px', fontSize: 10, fontFamily: 'monospace', width: 160 }}
        />
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 12px' }}>
        {loading && <div style={{ color: '#444', fontSize: 10, padding: 12 }}>loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>error: {err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#444', fontSize: 10, padding: 12 }}>no profiles match</div>}
        {visible.map(p => {
          const col  = COVERAGE_COLOR[p._coverage] || CY;
          const isExp = expanded === p.id;
          return (
            <div key={p.id} style={{ marginBottom: 4, background: '#0c0c1e', border: `1px solid ${col}33`, borderRadius: 5 }}>
              <div
                onClick={() => setExpanded(isExp ? null : p.id)}
                style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span style={{ fontSize: 10, color: col, fontWeight: 700, minWidth: 130 }}>{p._coverage}</span>
                <span style={{ fontSize: 11, color: '#ccc', flex: 1 }}>{p.name}</span>
                {p.category    && chip(p.category,    '#A78BFA')}
                {p.nationality && chip(p.nationality,  '#60A5FA')}
                {p._comms.length > 0 && chip(`${p._comms.length} comm${p._comms.length > 1 ? 's' : ''}`, TE)}
                {p._ops.length  > 0 && chip(`${p._ops.length} ops`,   AM)}
                <span style={{ fontSize: 10, color: '#444' }}>{isExp ? '▾' : '▸'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: `1px solid ${col}22` }}>
                  {p.description && (
                    <div style={{ fontSize: 9, color: '#777', marginBottom: 8, marginTop: 6 }}>{p.description}</div>
                  )}
                  {p.aliases && (
                    <div style={{ fontSize: 9, color: '#555', marginBottom: 8 }}>aliases: {p.aliases}</div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 9, color: TE, letterSpacing: 1, marginBottom: 4 }}>GRAPH COMMUNITIES</div>
                      {p._comms.length === 0
                        ? <div style={{ fontSize: 9, color: '#444', fontStyle: 'italic' }}>no community match</div>
                        : p._comms.map(c => (
                          <div key={c.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 10, color: TE }}>{c.name}</span>
                              {c.type && chip(c.type, '#818CF8')}
                              {c.members.length > 0 && chip(`${c.members.length} nodes`, '#94A3B8')}
                            </div>
                            <ScoreBar score={c._score} color={TE} />
                          </div>
                        ))
                      }
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: AM, letterSpacing: 1, marginBottom: 4 }}>OPS EVENTS</div>
                      {p._ops.length === 0
                        ? <div style={{ fontSize: 9, color: '#444', fontStyle: 'italic' }}>no ops event match</div>
                        : p._ops.map(e => (
                          <div key={e.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 10, color: AM }}>{e.name}</span>
                              {e.severity && chip(e.severity, SEVERITY_COLOR[e.severity] || AM)}
                              {e.type && chip(e.type, '#64748B')}
                            </div>
                            <ScoreBar score={e._score} color={AM} />
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: '6px 12px', borderTop: '1px solid #1a1a2a', fontSize: 9, color: '#555', flexShrink: 0 }}>
        /entities/IntelProfile × /v1/graph/communities × /v1/ops/events · 90s auto-refresh
      </div>
    </div>
  );
}
