import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const API_KEY = (typeof window !== 'undefined' && (window.__JARVIS_API_KEY__ || 'dev-key')) || 'dev-key';
const POLL_MS = 90000;

const TLSC_RE = /\b(tlsc|task[\s_-]*live[\s_-]*scenario|live[\s_-]*task[\s_-]*scenario|scenario[\s_-]*live[\s_-]*task|task[\s_-]*scenario[\s_-]*live|live[\s_-]*scenario[\s_-]*task|scenario[\s_-]*task[\s_-]*live|armed[\s_-]*tasks?|task[\s_-]*world[\s_-]*scenario|world[\s_-]*task[\s_-]*scenario)\b/i;

export function isTlscQuery(t) { return TLSC_RE.test(t || ''); }

function tok(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const bSet = new Set(bTokens);
  const hits = aTokens.filter(t => bSet.has(t)).length;
  return hits / Math.max(aTokens.length, bTokens.length);
}

const THRESHOLD = 0.08;

const COV = {
  FULLY_ARMED: 'FULLY_ARMED',
  LIVE_ONLY: 'LIVE_ONLY',
  PLANNED: 'PLANNED',
  DORMANT: 'DORMANT',
};

function liveEventTokens(events) {
  const tokens = [];
  for (const ev of events) {
    tokens.push(
      ...tok([
        ev?.title, ev?.type, ev?.description,
        ev?.place?.name, ev?.place?.country,
        ev?.symbol, ev?.name,
      ].join(' '))
    );
  }
  return tokens;
}

function classifyTask(taskTokens, liveEvents, scenarios) {
  let bestLiveScore = 0;
  let bestLiveEvent = null;
  for (const ev of liveEvents) {
    const evt = tok([ev?.title, ev?.type, ev?.description, ev?.place?.name, ev?.symbol, ev?.name].join(' '));
    const s = matchScore(taskTokens, evt);
    if (s > bestLiveScore) { bestLiveScore = s; bestLiveEvent = ev; }
  }
  let bestScenario = null;
  let bestScenScore = 0;
  for (const sc of scenarios) {
    const st = tok([sc?.name, sc?.title, sc?.description, sc?.type, sc?.domain, (sc?.tags || []).join(' ')].join(' '));
    const s = matchScore(taskTokens, st);
    if (s > bestScenScore) { bestScenScore = s; bestScenario = sc; }
  }
  const hasLive = bestLiveScore >= THRESHOLD;
  const hasScen = bestScenScore >= THRESHOLD;
  let cov;
  if (hasLive && hasScen) cov = COV.FULLY_ARMED;
  else if (hasLive) cov = COV.LIVE_ONLY;
  else if (hasScen) cov = COV.PLANNED;
  else cov = COV.DORMANT;
  return { cov, bestLiveEvent, bestLiveScore, bestScenario, bestScenScore };
}

function normaliseArray(raw, ...keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function flattenLiveIntel(data) {
  const out = [];
  if (Array.isArray(data?.earthquakes)) out.push(...data.earthquakes.map(e => ({ ...e, _kind: 'SEISMIC' })));
  if (Array.isArray(data?.crypto)) out.push(...data.crypto.map(c => ({ ...c, _kind: 'CRYPTO' })));
  if (Array.isArray(data?.forex)) out.push(...data.forex.map(f => ({ ...f, _kind: 'FX' })));
  if (Array.isArray(data)) out.push(...data);
  return out;
}

export async function buildTlscScript() {
  try {
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [taskRes, intelRes, scRes] = await Promise.allSettled([
      fetch(`${API}/entities/Task`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/functions/getLiveIntel`, { headers: hdr }).then(r => r.ok ? r.json() : {}),
      fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.ok ? r.json() : []),
    ]);
    const tasks = normaliseArray(taskRes.status === 'fulfilled' ? taskRes.value : [], 'items', 'data', 'tasks');
    const liveEvents = flattenLiveIntel(intelRes.status === 'fulfilled' ? intelRes.value : {});
    const scenarios = normaliseArray(scRes.status === 'fulfilled' ? scRes.value : [], 'scenarios', 'items', 'data');
    const counts = { [COV.FULLY_ARMED]: 0, [COV.LIVE_ONLY]: 0, [COV.PLANNED]: 0, [COV.DORMANT]: 0 };
    for (const tk of tasks) {
      const tt = tok([tk?.name, tk?.title, tk?.description, tk?.mission, tk?.priority, (tk?.tags || []).join(' ')].join(' '));
      const { cov } = classifyTask(tt, liveEvents, scenarios);
      counts[cov]++;
    }
    const total = tasks.length;
    const pct = total ? Math.round((counts[COV.FULLY_ARMED] / total) * 100) : 0;
    return `Task live-intel/scenario coverage: ${total} tasks across ${liveEvents.length} live world events and ${scenarios.length} scenarios. ${counts[COV.FULLY_ARMED]} fully armed (${pct}%) — both live world trigger and scenario backing. ${counts[COV.LIVE_ONLY]} live-only (world trigger, no scenario plan), ${counts[COV.PLANNED]} planned (scenario-ready, no live trigger), ${counts[COV.DORMANT]} dormant — ${counts[COV.DORMANT] ? `${counts[COV.DORMANT]} tasks have no live signal or scenario coverage` : 'all tasks have at least partial coverage'}.`;
  } catch {
    return 'Task live intel scenario triple coverage check unavailable.';
  }
}

const CY = '#29E7FF';
const AM = '#f59e0b';
const PU = '#a855f7';
const SL = '#64748b';
const TAB_COLORS = { [COV.FULLY_ARMED]: CY, [COV.LIVE_ONLY]: AM, [COV.PLANNED]: PU, [COV.DORMANT]: SL };

const KIND_COLOR = { SEISMIC: '#ef4444', CRYPTO: '#f59e0b', FX: '#22c55e' };

export default function TaskLiveIntelScenarioTriple() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [rows, setRows] = useState([]);
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
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [taskRes, intelRes, scRes] = await Promise.allSettled([
        fetch(`${API}/entities/Task`, { headers: hdr }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/functions/getLiveIntel`, { headers: hdr }).then(r => r.ok ? r.json() : {}),
        fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      ]);
      const tks = normaliseArray(taskRes.status === 'fulfilled' ? taskRes.value : [], 'items', 'data', 'tasks');
      const evs = flattenLiveIntel(intelRes.status === 'fulfilled' ? intelRes.value : {});
      const scs = normaliseArray(scRes.status === 'fulfilled' ? scRes.value : [], 'scenarios', 'items', 'data');
      setTasks(tks); setLiveEvents(evs); setScenarios(scs);
      const computed = tks.map(tk => {
        const tt = tok([tk?.name, tk?.title, tk?.description, tk?.mission, tk?.priority, (tk?.tags || []).join(' ')].join(' '));
        return { tk, ...classifyTask(tt, evs, scs) };
      });
      setRows(computed);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:tlsc-toggle', onToggle);
    return () => window.removeEventListener('jarvis:tlsc-toggle', onToggle);
  }, []);

  const counts = {
    [COV.FULLY_ARMED]: rows.filter(r => r.cov === COV.FULLY_ARMED).length,
    [COV.LIVE_ONLY]: rows.filter(r => r.cov === COV.LIVE_ONLY).length,
    [COV.PLANNED]: rows.filter(r => r.cov === COV.PLANNED).length,
    [COV.DORMANT]: rows.filter(r => r.cov === COV.DORMANT).length,
  };
  const total = rows.length;
  const pct = total ? Math.round((counts[COV.FULLY_ARMED] / total) * 100) : 0;

  const visible = rows
    .filter(r => filter === 'ALL' || r.cov === filter)
    .filter(r => {
      if (!search) return true;
      const q = search.toLowerCase();
      const tk = r.tk;
      return [tk?.name, tk?.title, tk?.description, tk?.mission, tk?.priority].some(f => String(f || '').toLowerCase().includes(q));
    });

  const assess = async () => {
    setAssessing(true);
    try {
      const script = await buildTlscScript();
      setAssessText(script);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
    } catch { setAssessText('Assessment unavailable.'); }
    setAssessing(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 876160, bottom: 8, zIndex: 573,
          background: 'rgba(5,8,13,0.75)', border: `1px solid ${CY}55`,
          color: CY, borderRadius: 4, padding: '3px 7px', fontSize: 10,
          fontFamily: 'monospace', cursor: 'pointer', letterSpacing: 1,
        }}
        title="Task × Live Intel × Scenario Triple Coverage (TLSC)"
      >◈ TLSC</button>
    );
  }

  const barPcts = total
    ? [
        { w: (counts[COV.FULLY_ARMED] / total) * 100, c: CY },
        { w: (counts[COV.LIVE_ONLY] / total) * 100, c: AM },
        { w: (counts[COV.PLANNED] / total) * 100, c: PU },
        { w: (counts[COV.DORMANT] / total) * 100, c: SL },
      ]
    : [];

  return (
    <div style={{
      position: 'fixed', left: 876160, bottom: 36, zIndex: 573,
      width: 340, maxHeight: '72vh', overflowY: 'auto',
      background: 'rgba(5,8,13,0.94)', border: `1px solid ${CY}44`,
      borderRadius: 8, padding: 14, fontFamily: 'monospace',
      color: '#cdd6f4', backdropFilter: 'blur(10px)',
      boxShadow: `0 0 30px ${CY}22`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ TLSC</span>
        <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>Task × Live Intel × Scenario</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, marginBottom: 8 }}>
        {[
          { label: 'tasks', val: total, c: '#94a3b8' },
          { label: 'live events', val: liveEvents.length, c: AM },
          { label: 'scenarios', val: scenarios.length, c: PU },
          { label: 'armed%', val: `${pct}%`, c: CY },
        ].map(s => (
          <div key={s.label} style={{ background: '#0f172a', borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: s.c }}>{s.val}</div>
            <div style={{ fontSize: 8, color: '#475569', letterSpacing: 1 }}>{s.label.toUpperCase()}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, marginBottom: 8 }}>
        {[
          { label: 'armed', val: counts[COV.FULLY_ARMED], c: CY },
          { label: 'live only', val: counts[COV.LIVE_ONLY], c: AM },
          { label: 'planned', val: counts[COV.PLANNED], c: PU },
          { label: 'dormant', val: counts[COV.DORMANT], c: SL },
        ].map(s => (
          <div key={s.label} style={{ background: '#0f172a', borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: s.c }}>{s.val}</div>
            <div style={{ fontSize: 8, color: '#475569', letterSpacing: 1 }}>{s.label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {total > 0 && (
        <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
          {barPcts.map((b, i) => <div key={i} style={{ width: `${b.w}%`, background: b.c }} />)}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {['ALL', COV.FULLY_ARMED, COV.LIVE_ONLY, COV.PLANNED, COV.DORMANT].map(tab => (
          <button key={tab} onClick={() => setFilter(tab)} style={{
            padding: '2px 7px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
            background: filter === tab ? (TAB_COLORS[tab] || CY) + '22' : 'transparent',
            border: `1px solid ${filter === tab ? (TAB_COLORS[tab] || CY) : '#1e293b'}`,
            color: filter === tab ? (TAB_COLORS[tab] || CY) : '#64748b', fontFamily: 'monospace',
          }}>{tab === 'ALL' ? 'ALL' : tab.replace('_', ' ')}</button>
        ))}
      </div>

      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="search tasks…"
        style={{
          width: '100%', padding: '4px 8px', fontSize: 10, background: '#0f172a',
          border: '1px solid #1e293b', borderRadius: 4, color: '#cdd6f4',
          fontFamily: 'monospace', marginBottom: 8, boxSizing: 'border-box',
        }}
      />

      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
        {visible.slice(0, 30).map((row, i) => {
          const { tk, cov, bestLiveEvent, bestLiveScore, bestScenario, bestScenScore } = row;
          const color = TAB_COLORS[cov] || SL;
          const isExp = expanded === i;
          return (
            <div key={i} style={{ borderBottom: '1px solid #1e293b', padding: '6px 0' }}>
              <div
                onClick={() => setExpanded(isExp ? null : i)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              >
                <span style={{ fontSize: 9, color, border: `1px solid ${color}44`, borderRadius: 2, padding: '1px 4px', minWidth: 68, textAlign: 'center' }}>{cov.replace('_', ' ')}</span>
                <span style={{ flex: 1, fontSize: 10, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tk?.name || tk?.title || 'Unknown'}</span>
                <span style={{ fontSize: 9, color: '#475569' }}>{tk?.priority || tk?.status || ''}</span>
              </div>
              {isExp && (
                <div style={{ marginTop: 6, paddingLeft: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1, background: '#0f172a', borderRadius: 4, padding: 6 }}>
                      <div style={{ fontSize: 8, color: AM, letterSpacing: 1, marginBottom: 4 }}>LIVE INTEL</div>
                      {bestLiveEvent ? (
                        <>
                          <div style={{ fontSize: 9, color: '#e2e8f0', marginBottom: 2, lineHeight: 1.3 }}>{bestLiveEvent?.title || bestLiveEvent?.symbol || bestLiveEvent?.name || 'Event'}</div>
                          <span style={{ fontSize: 8, color: KIND_COLOR[bestLiveEvent?._kind] || AM, border: `1px solid ${KIND_COLOR[bestLiveEvent?._kind] || AM}44`, borderRadius: 2, padding: '0 3px' }}>{bestLiveEvent?._kind || 'EVENT'}</span>
                          <div style={{ background: '#1e293b', borderRadius: 2, height: 3, marginTop: 4 }}>
                            <div style={{ width: `${Math.round(bestLiveScore * 100)}%`, background: AM, height: '100%', borderRadius: 2 }} />
                          </div>
                        </>
                      ) : <div style={{ fontSize: 9, color: '#475569' }}>no match</div>}
                    </div>
                    <div style={{ flex: 1, background: '#0f172a', borderRadius: 4, padding: 6 }}>
                      <div style={{ fontSize: 8, color: PU, letterSpacing: 1, marginBottom: 4 }}>SCENARIO</div>
                      {bestScenario ? (
                        <>
                          <div style={{ fontSize: 9, color: '#e2e8f0', marginBottom: 2, lineHeight: 1.3 }}>{bestScenario?.name || bestScenario?.title || 'Scenario'}</div>
                          <div style={{ fontSize: 8, color: '#64748b' }}>{bestScenario?.type || bestScenario?.status || ''}</div>
                          <div style={{ background: '#1e293b', borderRadius: 2, height: 3, marginTop: 4 }}>
                            <div style={{ width: `${Math.round(bestScenScore * 100)}%`, background: PU, height: '100%', borderRadius: 2 }} />
                          </div>
                        </>
                      ) : <div style={{ fontSize: 9, color: '#475569' }}>no match</div>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && <div style={{ fontSize: 10, color: '#475569', textAlign: 'center', padding: 8 }}>No tasks match</div>}
        {visible.length > 30 && <div style={{ fontSize: 9, color: '#334155', textAlign: 'center' }}>…+{visible.length - 30} more</div>}
      </div>

      <div style={{ borderTop: '1px solid #1e293b', paddingTop: 10, marginTop: 8 }}>
        <button
          onClick={assess} disabled={assessing}
          style={{ width: '100%', padding: '6px 0', background: assessing ? '#1e293b' : CY + '11', border: `1px solid ${CY}`, borderRadius: 4, color: CY, cursor: assessing ? 'default' : 'pointer', fontSize: 11, fontWeight: 700 }}
        >{assessing ? '⟳ Assessing…' : '▶ ASSESS — TLSC coverage brief'}</button>
        {assessText && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8', background: '#0f172a', borderRadius: 4, padding: 8, lineHeight: 1.5 }}>{assessText}</div>
        )}
      </div>

      <div style={{ marginTop: 6, fontSize: 9, color: '#334155', textAlign: 'right' }}>
        {loading ? 'Refreshing…' : `Polls every ${POLL_MS / 1000}s`}
      </div>
    </div>
  );
}
