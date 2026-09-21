import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const RSGCOE_RE = /\b(rsgcoe|risk\s+signal\s+community\s+ops|risk\s+community\s+ops|risk\s+graph\s+ops|community\s+risk\s+ops|network\s+risk\s+ops|ops\s+community\s+risk|risk\s+graph\s+community\s+ops|risk\s+signal\s+graph\s+ops|graph\s+community\s+risk\s+ops|risk\s+ops\s+community|risk\s+ops\s+network|community\s+ops\s+risk\s+signal)\b/i;
const THRESHOLD = 0.07;

export function isRsgcoeQuery(t) {
  return RSGCOE_RE.test(t || '');
}

export async function buildRsgcoeScript() {
  try {
    const [riskRes, gcRes, opsRes] = await Promise.all([
      fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : {}),
      fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
    ]);
    const signals = normaliseSignals(riskRes);
    const communities = normaliseCommunities(gcRes);
    const events = normaliseEvents(opsRes);
    const classified = signals.map(s => classifySignal(s, communities, events));
    const fullyActive = classified.filter(s => s.state === 'FULLY_ACTIVE').length;
    const dark = classified.filter(s => s.state === 'DARK').length;
    return `RSGCOE analysis: ${signals.length} risk signals cross-referenced against ${communities.length} graph network communities and ${events.length} active ops events. ${fullyActive} signals are FULLY ACTIVE — both graph community network context and operational event coverage confirmed. ${dark} signals are DARK — no network community or ops event tracking detected, representing critical untracked threat vectors requiring immediate risk response and network attribution.`;
  } catch {
    return 'RSGCOE data unavailable — check /entities/RiskSignal, /v1/graph/communities, and /v1/ops/events endpoints.';
  }
}

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const fSet = new Set(tok(fieldText));
  const hits = toks.filter(t => fSet.has(t)).length;
  return hits / toks.length;
}

function normaliseSignals(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.risks) ? raw.risks
    : Array.isArray(raw.signals) ? raw.signals
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((s, i) => ({
    id: s.id || s._id || `risk-${i}`,
    label: s.name || s.title || s.signal_name || `Risk Signal ${i + 1}`,
    severity: s.severity || s.level || s.priority || '',
    category: s.category || s.type || '',
    sector: s.sector || s.domain || '',
    source: s.source || '',
    _searchText: [
      s.name, s.title, s.signal_name, s.category, s.type,
      s.sector, s.domain, s.description, s.source, s.tags,
    ].filter(Boolean).join(' '),
  }));
}

function normaliseCommunities(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.communities) ? raw.communities
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((c, i) => ({
    id: c.id || c._id || `comm-${i}`,
    label: c.label || c.name || c.title || `Community ${i + 1}`,
    type: c.type || c.kind || c.category || '',
    _text: [
      c.label, c.name, c.title, c.summary, c.description,
      c.type, c.kind, c.category,
      (c.members || []).join(' '), (c.tags || []).join(' '),
    ].filter(Boolean).join(' '),
  }));
}

function normaliseEvents(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.events) ? raw.events
    : Array.isArray(raw.ops_events) ? raw.ops_events
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((e, i) => ({
    id: e.id || e._id || `oe-${i}`,
    label: e.name || e.title || e.event_name || `Ops Event ${i + 1}`,
    severity: e.severity || e.level || '',
    type: e.type || e.kind || e.category || '',
    _text: [
      e.name, e.title, e.event_name, e.type, e.kind,
      e.category, e.description, e.tags, e.source,
    ].filter(Boolean).join(' '),
  }));
}

function classifySignal(signal, communities, events) {
  const toks = tok(signal._searchText);
  const matchedCommunities = communities
    .map(c => ({ ...c, score: matchScore(toks, c._text) }))
    .filter(c => c.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const matchedEvents = events
    .map(e => ({ ...e, score: matchScore(toks, e._text) }))
    .filter(e => e.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);

  const hasCommunity = matchedCommunities.length > 0;
  const hasOps = matchedEvents.length > 0;
  const state = hasCommunity && hasOps ? 'FULLY_ACTIVE'
    : hasCommunity ? 'COMMUNITY_TAGGED'
    : hasOps ? 'OPS_TRIGGERED'
    : 'DARK';

  return { ...signal, state, matchedCommunities, matchedEvents };
}

const STATE_COLOR = {
  FULLY_ACTIVE: '#22c55e',
  COMMUNITY_TAGGED: '#22d3ee',
  OPS_TRIGGERED: '#f59e0b',
  DARK: '#f87171',
};

export default function RiskSignalGraphCommunityOpsTriple() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [signals, setSignals] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [events, setEvents] = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [riskRes, gcRes, opsRes] = await Promise.all([
        fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : {}),
        fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
      ]);
      const s = normaliseSignals(riskRes);
      const c = normaliseCommunities(gcRes);
      const e = normaliseEvents(opsRes);
      setSignals(s);
      setCommunities(c);
      setEvents(e);
      setClassified(s.map(sig => classifySignal(sig, c, e)));
    } catch (err) {
      setError('Fetch error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.open !== undefined) { setOpen(e.detail.open); return; }
      setOpen(v => !v);
    };
    window.addEventListener('jarvis:rsgcoe-toggle', handler);
    return () => window.removeEventListener('jarvis:rsgcoe-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  useEffect(() => {
    const handler = (e) => {
      const q = (e.detail?.transcript || '').toLowerCase();
      if (RSGCOE_RE.test(q)) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const counts = {
    FULLY_ACTIVE: classified.filter(s => s.state === 'FULLY_ACTIVE').length,
    COMMUNITY_TAGGED: classified.filter(s => s.state === 'COMMUNITY_TAGGED').length,
    OPS_TRIGGERED: classified.filter(s => s.state === 'OPS_TRIGGERED').length,
    DARK: classified.filter(s => s.state === 'DARK').length,
  };

  const visible = classified.filter(s => {
    if (filter !== 'ALL' && s.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s._searchText.toLowerCase().includes(q) || s.label.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const prompt = `RSGCOE RiskSignal × Graph Community × Ops Event Triple Coverage: ${signals.length} risk signals cross-referenced against ${communities.length} graph network communities and ${events.length} active ops events. Coverage: FULLY_ACTIVE=${counts.FULLY_ACTIVE}, COMMUNITY_TAGGED=${counts.COMMUNITY_TAGGED}, OPS_TRIGGERED=${counts.OPS_TRIGGERED}, DARK=${counts.DARK}. In 2 sentences, assess which risk signals have both network community attribution and active operational event coverage versus those that are completely dark with no network or ops tracking, and identify the most critical untracked threat vectors.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const j = await res.json();
      const text = j.response || j.message || j.content || JSON.stringify(j);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (err) {
      setAssessment('Assessment failed: ' + err.message);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) return null;

  const activePct = classified.length ? Math.round((counts.FULLY_ACTIVE / classified.length) * 100) : 0;
  const commPct = classified.length ? Math.round((counts.COMMUNITY_TAGGED / classified.length) * 100) : 0;
  const opsPct = classified.length ? Math.round((counts.OPS_TRIGGERED / classified.length) * 100) : 0;
  const darkPct = classified.length ? Math.round((counts.DARK / classified.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 850400, bottom: 8, zIndex: 547,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #1a1a2e',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(20,20,60,0.35)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 13 }}>◈ RSGCOE</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>RiskSignal × Graph Community × Ops Event Triple Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#22c55e', fontSize: 10 }}>SYNCING…</span>}
          {counts.FULLY_ACTIVE > 0 && (
            <span style={{ background: '#14532d', color: '#22c55e', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
              {counts.FULLY_ACTIVE} ACTIVE
            </span>
          )}
          {counts.DARK > 0 && (
            <span style={{ background: '#450a0a', color: '#f87171', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
              {counts.DARK} DARK
            </span>
          )}
          <button onClick={fetchAll} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {error && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, borderBottom: '1px solid #1e293b' }}>{error}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        {[
          { label: 'RISK SIGNALS', val: signals.length, color: '#e2e8f0' },
          { label: 'COMMUNITIES', val: communities.length, color: '#22d3ee' },
          { label: 'OPS EVENTS', val: events.length, color: '#f59e0b' },
          { label: 'FULLY ACTIVE', val: counts.FULLY_ACTIVE, color: '#22c55e', badge: counts.FULLY_ACTIVE > 0 },
          { label: 'COMMUNITY', val: counts.COMMUNITY_TAGGED, color: '#22d3ee' },
          { label: 'OPS TRIGGERED', val: counts.OPS_TRIGGERED, color: '#f59e0b' },
          { label: 'DARK', val: counts.DARK, color: '#f87171', badge: counts.DARK > 0 },
          { label: 'ACTIVE %', val: `${activePct}%`, color: '#22c55e' },
        ].map(t => (
          <div key={t.label} style={{ background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center', border: t.badge ? '1px solid ' + t.color : '1px solid #1e293b' }}>
            <div style={{ color: t.color, fontWeight: 700, fontSize: 15 }}>{t.val}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
          <div style={{ width: `${activePct}%`, background: '#22c55e' }} title={`FULLY ACTIVE ${activePct}%`} />
          <div style={{ width: `${commPct}%`, background: '#22d3ee' }} title={`COMMUNITY TAGGED ${commPct}%`} />
          <div style={{ width: `${opsPct}%`, background: '#f59e0b' }} title={`OPS TRIGGERED ${opsPct}%`} />
          <div style={{ width: `${darkPct}%`, background: '#450a0a' }} title={`DARK ${darkPct}%`} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10, color: '#64748b' }}>
          <span style={{ color: '#22c55e' }}>■ ACTIVE {activePct}%</span>
          <span style={{ color: '#22d3ee' }}>■ COMMUNITY {commPct}%</span>
          <span style={{ color: '#f59e0b' }}>■ OPS {opsPct}%</span>
          <span style={{ color: '#f87171' }}>■ DARK {darkPct}%</span>
        </div>
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FULLY_ACTIVE', 'COMMUNITY_TAGGED', 'OPS_TRIGGERED', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#1e293b' : 'none', border: `1px solid ${filter === f ? '#334155' : '#1e293b'}`,
            color: filter === f ? '#e2e8f0' : '#64748b', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontSize: 10,
          }}>{f.replace(/_/g, ' ')}{f !== 'ALL' ? ` (${counts[f] ?? 0})` : ` (${classified.length})`}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search risk signals…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', fontSize: 11, width: 160 }} />
      </div>

      {/* Signal list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px' }}>
        {visible.slice(0, 120).map(s => (
          <div key={s.id}>
            <div onClick={() => setExpanded(expanded === s.id ? null : s.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #0f172a', cursor: 'pointer' }}>
              <span style={{ color: STATE_COLOR[s.state], fontSize: 10, fontWeight: 700, minWidth: 130 }}>{s.state.replace(/_/g, ' ')}</span>
              <span style={{ color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
              {s.severity && <span style={{ color: s.severity === 'CRITICAL' ? '#f87171' : s.severity === 'HIGH' ? '#fb923c' : '#64748b', fontSize: 10, border: '1px solid currentColor', borderRadius: 3, padding: '0 4px' }}>{s.severity}</span>}
              <span style={{ color: '#475569', fontSize: 10 }}>{s.matchedCommunities.length}COMM / {s.matchedEvents.length}OPS</span>
              <span style={{ color: '#334155', fontSize: 11 }}>{expanded === s.id ? '▲' : '▼'}</span>
            </div>
            {expanded === s.id && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '8px 0 8px 16px' }}>
                <div>
                  <div style={{ color: '#22d3ee', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>GRAPH COMMUNITIES ({s.matchedCommunities.length})</div>
                  {s.matchedCommunities.length === 0 && <div style={{ color: '#475569', fontSize: 10 }}>no graph community alignment detected</div>}
                  {s.matchedCommunities.slice(0, 8).map(c => (
                    <div key={c.id} style={{ marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ color: '#e2e8f0', fontSize: 11 }}>{c.label}</span>
                        {c.type && <span style={{ color: '#64748b', fontSize: 9, border: '1px solid #334155', borderRadius: 3, padding: '0 4px' }}>{c.type}</span>}
                      </div>
                      <div style={{ height: 4, background: '#1e293b', borderRadius: 2, width: '100%' }}>
                        <div style={{ height: '100%', background: '#22d3ee', borderRadius: 2, width: `${Math.round(c.score * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                  {s.category && <div style={{ color: '#475569', fontSize: 10, marginTop: 6 }}>{s.category}{s.sector ? ` · ${s.sector}` : ''}</div>}
                </div>
                <div>
                  <div style={{ color: '#f59e0b', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>OPS EVENTS ({s.matchedEvents.length})</div>
                  {s.matchedEvents.length === 0 && <div style={{ color: '#475569', fontSize: 10 }}>no active ops event coverage detected</div>}
                  {s.matchedEvents.slice(0, 8).map(ev => (
                    <div key={ev.id} style={{ marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ color: '#e2e8f0', fontSize: 11 }}>{ev.label}</span>
                        {ev.severity && <span style={{ color: ev.severity === 'CRITICAL' ? '#f87171' : '#f59e0b', fontSize: 9, border: '1px solid currentColor', borderRadius: 3, padding: '0 4px' }}>{ev.severity}</span>}
                        {ev.type && <span style={{ color: '#64748b', fontSize: 9, border: '1px solid #334155', borderRadius: 3, padding: '0 4px' }}>{ev.type}</span>}
                      </div>
                      <div style={{ height: 4, background: '#1e293b', borderRadius: 2, width: '100%' }}>
                        <div style={{ height: '100%', background: '#f59e0b', borderRadius: 2, width: `${Math.round(ev.score * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                  {s.source && <div style={{ color: '#475569', fontSize: 10, marginTop: 6 }}>source: {s.source}</div>}
                </div>
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', padding: '20px 0', textAlign: 'center', fontSize: 12 }}>No risk signals match current filter</div>
        )}
      </div>

      {/* ASSESS */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? '#1e293b' : '#14532d', border: '1px solid #16a34a', color: '#22c55e',
          borderRadius: 5, padding: '4px 16px', cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 700,
        }}>{assessing ? 'ASSESSING…' : 'ASSESS'}</button>
        {assessment && <div style={{ marginTop: 6, color: '#94a3b8', fontSize: 11, lineHeight: 1.5 }}>{assessment}</div>}
      </div>
    </div>
  );
}
