import { useState, useEffect, useCallback } from 'react';

const API = '';

const LGCSTRI_RE = /\b(lgcstri|live[._\s-]?intel[._\s-]?communit\w*[._\s-]?scenario|communit\w*[._\s-]?live[._\s-]?scenario|live[._\s-]?communit\w*[._\s-]?scenario|world[._\s-]?communit\w*[._\s-]?scenario|scenario[._\s-]?live[._\s-]?communit\w*|live[._\s-]?scenario[._\s-]?communit\w*|unplanned[._\s-]?world[._\s-]?event|world[._\s-]?event[._\s-]?scenario|intel[._\s-]?communit\w*[._\s-]?plan)\b/i;

export function isLgcstriQuery(t) {
  return LGCSTRI_RE.test(t || '');
}

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function normaliseLive(raw) {
  if (!raw) return [];
  const out = [];
  for (const e of (Array.isArray(raw.earthquakes) ? raw.earthquakes : [])) {
    const place = e.place || e.location || '';
    const mag   = e.magnitude || e.mag || '';
    out.push({
      id:     `seismic-${place}-${mag}`,
      type:   'SEISMIC',
      label:  `M${mag} ${place}`.trim(),
      tokens: tok(`${place} earthquake seismic quake tectonic geological catastrophe disaster`),
    });
  }
  for (const c of (Array.isArray(raw.crypto) ? raw.crypto : [])) {
    const sym = c.symbol || c.name || '';
    out.push({
      id:     `crypto-${sym}`,
      type:   'CRYPTO',
      label:  sym,
      tokens: tok(`${sym} crypto bitcoin blockchain digital currency asset finance market trading`),
    });
  }
  for (const f of (Array.isArray(raw.fx) ? raw.fx : [])) {
    const pair = f.pair || f.symbol || f.name || '';
    out.push({
      id:     `fx-${pair}`,
      type:   'FX',
      label:  pair,
      tokens: tok(`${pair} forex currency exchange rate finance trade market`),
    });
  }
  return out;
}

function normaliseCommunities(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.communities) ? raw.communities
    : Array.isArray(raw?.clusters)    ? raw.clusters
    : Array.isArray(raw?.data)        ? raw.data
    : Array.isArray(raw?.results)     ? raw.results
    : Array.isArray(raw?.items)       ? raw.items
    : [];
  return arr.map((c, i) => ({
    id:      c.id     || String(i),
    label:   c.label  || c.name  || c.title || `Community ${i + 1}`,
    members: Array.isArray(c.members) ? c.members.join(' ') : (c.members || ''),
    summary: String(c.summary || c.description || c.notes || '').slice(0, 300),
    size:    c.size   || (Array.isArray(c.members) ? c.members.length : 0) || 0,
  }));
}

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.scenarios) ? raw.scenarios
    : Array.isArray(raw?.items)     ? raw.items
    : Array.isArray(raw?.results)   ? raw.results
    : Array.isArray(raw?.data)      ? raw.data
    : [];
  return arr.map((s, i) => ({
    id:       s.id       || String(i),
    name:     s.title    || s.name  || s.label || `Scenario ${i + 1}`,
    status:   (s.status  || s.state || '').toLowerCase(),
    category: s.category || s.type  || s.kind  || '',
    desc:     String(s.description || s.objective || s.summary || '').slice(0, 200),
    tags:     Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function matchScore(evTokens, fields) {
  const fToks = new Set(fields.flatMap(f => tok(f)).filter(Boolean));
  if (!evTokens.length || !fToks.size) return 0;
  let hits = 0;
  for (const t of evTokens) if (fToks.has(t)) hits++;
  return hits / Math.max(evTokens.length, fToks.size);
}

function correlate(events, communities, scenarios) {
  return events.map(ev => {
    const matchedCommunities = communities
      .map(c => ({ ...c, _score: matchScore(ev.tokens, [c.label, c.members, c.summary]) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);

    const matchedScenarios = scenarios
      .map(s => ({ ...s, _score: matchScore(ev.tokens, [s.name, s.category, s.desc, s.tags]) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);

    const hasCommunity = matchedCommunities.length > 0;
    const hasScenario  = matchedScenarios.length  > 0;

    let coverage;
    if (hasCommunity && hasScenario)  coverage = 'FULLY PLANNED';
    else if (hasCommunity)            coverage = 'COMMUNITY-ONLY';
    else if (hasScenario)             coverage = 'SCENARIO-PLANNED';
    else                              coverage = 'UNPLANNED';

    return { ...ev, _communities: matchedCommunities, _scenarios: matchedScenarios, _coverage: coverage };
  });
}

export async function buildLgcstriScript() {
  const [intelR, commR, scnR] = await Promise.allSettled([
    fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
    fetch(`${API}/v1/graph/communities`).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`).then(r => r.json()),
  ]);
  const events      = normaliseLive(intelR.status === 'fulfilled' ? intelR.value : {});
  const communities = normaliseCommunities(commR.status === 'fulfilled' ? commR.value : []);
  const scenarios   = normaliseScenarios(scnR.status  === 'fulfilled' ? scnR.value  : []);
  const enriched    = correlate(events, communities, scenarios);

  const fp = enriched.filter(e => e._coverage === 'FULLY PLANNED').length;
  const co = enriched.filter(e => e._coverage === 'COMMUNITY-ONLY').length;
  const sp = enriched.filter(e => e._coverage === 'SCENARIO-PLANNED').length;
  const up = enriched.filter(e => e._coverage === 'UNPLANNED').length;

  return (
    `Live Intel × Graph Community × Scenario Triple Coverage: ${events.length} live world events cross-referenced ` +
    `against ${communities.length} network communities and ${scenarios.length} scenarios. ` +
    `${fp} FULLY PLANNED (community-backed + scenario-planned); ${co} COMMUNITY-ONLY (community match, no scenario); ` +
    `${sp} SCENARIO-PLANNED (scenario exists, no community); ${up} UNPLANNED (no community or scenario — operational gap). ` +
    `Unplanned events: ${enriched.filter(e => e._coverage === 'UNPLANNED').map(e => e.label).slice(0, 3).join(', ') || 'none'}.`
  );
}

const PANEL_W = 760;
const PANEL_H = 660;
const RD  = '#EF4444';
const AM  = '#F59E0B';
const CY  = '#00CFFF';
const GR  = '#22C55E';
const TE  = '#14B8A6';
const PR  = '#A78BFA';

const COVERAGE_COLOR = {
  'FULLY PLANNED':    GR,
  'COMMUNITY-ONLY':   TE,
  'SCENARIO-PLANNED': PR,
  'UNPLANNED':        AM,
};

const TYPE_COLOR = { SEISMIC: '#FF6B6B', CRYPTO: '#F59E0B', FX: '#60A5FA' };

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

const TABS = ['ALL', 'FULLY PLANNED', 'COMMUNITY-ONLY', 'SCENARIO-PLANNED', 'UNPLANNED'];

export default function LiveIntelGraphCommunityScenarioTriple() {
  const [open, setOpen]             = useState(false);
  const [events, setEvents]         = useState([]);
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
      const [intelR, commR, scnR] = await Promise.allSettled([
        fetch(`${API}/functions/getLiveIntel`).then(r => r.json()),
        fetch(`${API}/v1/graph/communities`).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`).then(r => r.json()),
      ]);
      const rawEvents      = normaliseLive(intelR.status === 'fulfilled' ? intelR.value : {});
      const rawCommunities = normaliseCommunities(commR.status === 'fulfilled' ? commR.value : []);
      const rawScenarios   = normaliseScenarios(scnR.status  === 'fulfilled' ? scnR.value  : []);
      setEvents(correlate(rawEvents, rawCommunities, rawScenarios));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:lgcstri-toggle', toggle);
    return () => window.removeEventListener('jarvis:lgcstri-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessText('');
    try {
      const brief = await buildLgcstriScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Live world event community and scenario planning assessment: ${brief}. Give a 2-sentence brief on which unplanned events are highest priority and what community or scenario response is needed.` }),
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
    const unplannedCount = events.filter(e => e._coverage === 'UNPLANNED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Live Intel × Graph Community × Scenario Triple Coverage (LGCSTRI)"
        style={{
          position: 'fixed', left: 751280, bottom: 8, zIndex: 370,
          background: unplannedCount > 0 ? '#F59E0B22' : '#0a0a1a',
          border: `1px solid ${unplannedCount > 0 ? AM : CY + '44'}`,
          color: unplannedCount > 0 ? AM : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ LGCSTRI{unplannedCount > 0 ? ` ⚠${unplannedCount}` : ''}
      </button>
    );
  }

  const fp = events.filter(e => e._coverage === 'FULLY PLANNED').length;
  const co = events.filter(e => e._coverage === 'COMMUNITY-ONLY').length;
  const sp = events.filter(e => e._coverage === 'SCENARIO-PLANNED').length;
  const up = events.filter(e => e._coverage === 'UNPLANNED').length;

  const visible = events.filter(e =>
    (tab === 'ALL' || e._coverage === tab) &&
    (!search || e.label.toLowerCase().includes(search.toLowerCase()) ||
      e.type.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #F59E0B33', borderRadius: 8,
      zIndex: 6002, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #F59E0B18',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #F59E0B22', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: AM, fontWeight: 700, fontSize: 11 }}>◈ LIVE INTEL × COMMUNITY × SCENARIO TRIPLE COVERAGE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>LGCSTRI</span>
        {up > 0 && <span style={{ fontSize: 10, color: AM, background: '#F59E0B22', border: '1px solid #F59E0B55', borderRadius: 3, padding: '1px 5px' }}>⚠ {up} UNPLANNED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['LIVE EVENTS',       events.length, CY],
          ['FULLY PLANNED',     fp,            GR],
          ['COMMUNITY-ONLY',    co,            TE],
          ['SCENARIO-PLANNED',  sp,            PR],
          ['UNPLANNED',         up,            AM],
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
          placeholder="search events…"
          style={{ marginLeft: 'auto', background: '#0c0c1e', border: '1px solid #333', color: '#aaa', borderRadius: 3, padding: '2px 8px', fontSize: 10, fontFamily: 'monospace', width: 160 }}
        />
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 12px' }}>
        {loading && <div style={{ color: '#444', fontSize: 10, padding: 12 }}>loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>error: {err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#444', fontSize: 10, padding: 12 }}>no events match</div>}
        {visible.map(ev => {
          const col   = COVERAGE_COLOR[ev._coverage] || CY;
          const isExp = expanded === ev.id;
          return (
            <div key={ev.id} style={{ marginBottom: 4, background: '#0c0c1e', border: `1px solid ${col}33`, borderRadius: 5 }}>
              <div
                onClick={() => setExpanded(isExp ? null : ev.id)}
                style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span style={{ fontSize: 10, color: col, fontWeight: 700, minWidth: 130 }}>{ev._coverage}</span>
                <span style={{ fontSize: 11, color: '#ccc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.label}</span>
                {chip(ev.type, TYPE_COLOR[ev.type] || CY)}
                {ev._communities.length > 0 && chip(`${ev._communities.length} communit${ev._communities.length > 1 ? 'ies' : 'y'}`, TE)}
                {ev._scenarios.length  > 0 && chip(`${ev._scenarios.length} scenario${ev._scenarios.length  > 1 ? 's' : ''}`,   PR)}
                <span style={{ fontSize: 10, color: '#444' }}>{isExp ? '▾' : '▸'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: `1px solid ${col}22` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 9, color: TE, letterSpacing: 1, marginBottom: 4 }}>GRAPH COMMUNITIES</div>
                      {ev._communities.length === 0
                        ? <div style={{ fontSize: 9, color: '#444', fontStyle: 'italic' }}>no matched communities</div>
                        : ev._communities.map(c => (
                          <div key={c.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 10, color: TE }}>{c.label}</span>
                              {c.size > 0 && chip(`${c.size} members`, '#6EE7B7')}
                            </div>
                            <ScoreBar score={c._score} color={TE} />
                          </div>
                        ))
                      }
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: PR, letterSpacing: 1, marginBottom: 4 }}>SCENARIOS</div>
                      {ev._scenarios.length === 0
                        ? <div style={{ fontSize: 9, color: '#444', fontStyle: 'italic' }}>no matched scenarios</div>
                        : ev._scenarios.map(s => (
                          <div key={s.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 10, color: PR }}>{s.name}</span>
                              {s.status   && chip(s.status,   AM)}
                              {s.category && chip(s.category, '#C4B5FD')}
                            </div>
                            <ScoreBar score={s._score} color={PR} />
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
        /functions/getLiveIntel × /v1/graph/communities × /v1/scenario/list · 60s auto-refresh
      </div>
    </div>
  );
}
