import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const RISOE_RE = /\b(risoe|risk\s+signal\s+intel\s+ops|risk\s+intel\s+ops|risk\s+ops\s+intel|risk\s+intel\s+event|blind\s+risk\s+signal|active\s+risk\s+signal|risk\s+signal\s+intelligence\s+ops|risk\s+intel\s+operation|risk\s+ops\s+event|risk\s+intel\s+flag\s+ops|risk\s+intel\s+trigger)\b/i;
const THRESHOLD = 0.07;

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const fToks = tok(fieldText);
  const fSet = new Set(fToks);
  const hits = toks.filter(t => fSet.has(t)).length;
  return hits / toks.length;
}

function normaliseRiskSignals(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.risk_signals) ? raw.risk_signals
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((r, i) => ({
    id: r.id || r._id || `rs-${i}`,
    label: r.name || r.title || r.signal_type || r.type || `RiskSignal ${i + 1}`,
    signalType: r.signal_type || r.type || r.kind || '',
    severity: r.severity || r.priority || r.level || '',
    source: r.source || r.origin || '',
    description: r.description || r.summary || r.content || '',
    tags: Array.isArray(r.tags) ? r.tags.join(' ') : String(r.tags || ''),
    _searchText: [r.name, r.title, r.signal_type, r.type, r.kind, r.severity, r.source, r.description, r.tags].filter(Boolean).join(' '),
  }));
}

function normaliseIntelProfiles(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.intel_profiles) ? raw.intel_profiles
    : Array.isArray(raw.profiles) ? raw.profiles
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((p, i) => ({
    id: p.id || p._id || `ip-${i}`,
    label: p.name || p.title || p.subject || `IntelProfile ${i + 1}`,
    category: p.category || p.type || p.kind || '',
    threat_level: p.threat_level || p.risk || p.severity || '',
    description: p.description || p.summary || p.bio || '',
    tags: Array.isArray(p.tags) ? p.tags.join(' ') : String(p.tags || ''),
    _searchText: [p.name, p.title, p.subject, p.category, p.type, p.kind, p.threat_level, p.description, p.tags].filter(Boolean).join(' '),
  }));
}

function normaliseOpsEvents(raw) {
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
    label: e.name || e.title || e.event_type || e.type || `OpsEvent ${i + 1}`,
    eventType: e.event_type || e.type || e.kind || '',
    severity: e.severity || e.priority || e.level || '',
    status: e.status || e.state || '',
    description: e.description || e.summary || e.message || '',
    tags: Array.isArray(e.tags) ? e.tags.join(' ') : String(e.tags || ''),
    _searchText: [e.name, e.title, e.event_type, e.type, e.kind, e.severity, e.status, e.description, e.tags].filter(Boolean).join(' '),
  }));
}

function correlate(riskSignals, intelProfiles, opsEvents) {
  return riskSignals.map(rs => {
    const toks = tok(rs._searchText);
    const matchedIp = intelProfiles
      .map(ip => ({ ...ip, score: matchScore(toks, ip._searchText) }))
      .filter(ip => ip.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const matchedOe = opsEvents
      .map(oe => ({ ...oe, score: matchScore(toks, oe._searchText) }))
      .filter(oe => oe.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const hasIp = matchedIp.length > 0;
    const hasOe = matchedOe.length > 0;
    const coverage =
      hasIp && hasOe ? 'FULLY_ACTIVE' :
      hasIp ? 'INTEL_BACKED' :
      hasOe ? 'OPS_TRIGGERED' :
      'BLIND';
    return { ...rs, matchedIp, matchedOe, coverage };
  });
}

export function isRisoeQuery(t) {
  return RISOE_RE.test(t || '');
}

export async function buildRisoeScript() {
  try {
    const [rsRes, ipRes, oeRes] = await Promise.all([
      fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
    ]);
    const riskSignals = normaliseRiskSignals(rsRes);
    const intelProfiles = normaliseIntelProfiles(ipRes);
    const opsEvents = normaliseOpsEvents(oeRes);
    const correlated = correlate(riskSignals, intelProfiles, opsEvents);
    const fullyActive = correlated.filter(r => r.coverage === 'FULLY_ACTIVE').length;
    const blind = correlated.filter(r => r.coverage === 'BLIND').length;
    return `RISOE analysis: ${riskSignals.length} risk signals cross-referenced against ${intelProfiles.length} intel profiles and ${opsEvents.length} ops events. ${fullyActive} signals are FULLY ACTIVE — confirmed intelligence backing and live operational trigger. ${blind} signals are BLIND with no intel or ops coverage — these are unmonitored threat vectors requiring immediate intelligence profiling and operational response assignment.`;
  } catch {
    return 'RISOE data unavailable — check /entities/RiskSignal, /entities/IntelProfile, and /v1/ops/events endpoints.';
  }
}

const RD = '#FF4444';
const CY = '#29E7FF';
const OR = '#FF8C00';
const GR = '#555';

const FILTER_TABS = ['ALL', 'FULLY ACTIVE', 'INTEL BACKED', 'OPS TRIGGERED', 'BLIND'];
const COV_MAP = {
  'FULLY ACTIVE': 'FULLY_ACTIVE',
  'INTEL BACKED': 'INTEL_BACKED',
  'OPS TRIGGERED': 'OPS_TRIGGERED',
  'BLIND': 'BLIND',
};

function ScoreBar({ score, color }) {
  return (
    <div style={{ height: 3, background: '#1A2535', borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: 3, width: `${Math.min(100, Math.round(score * 100))}%`, background: color, borderRadius: 2, transition: 'width 0.3s' }} />
    </div>
  );
}

function Badge({ label, color }) {
  if (!label) return null;
  return (
    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: `${color}22`, color, border: `1px solid ${color}55`, letterSpacing: 1, marginLeft: 4 }}>
      {String(label).toUpperCase().slice(0, 14)}
    </span>
  );
}

export default function RiskSignalIntelOpsTriple() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState([]);
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
      const [rsRes, ipRes, oeRes] = await Promise.all([
        fetch(`${API}/entities/RiskSignal`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/IntelProfile`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/ops/events`).then(r => r.ok ? r.json() : []),
      ]);
      const riskSignals = normaliseRiskSignals(rsRes);
      const intelProfiles = normaliseIntelProfiles(ipRes);
      const opsEvents = normaliseOpsEvents(oeRes);
      setData(correlate(riskSignals, intelProfiles, opsEvents));
    } catch { setData([]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => { if (!o) load(); return !o; });
    window.addEventListener('jarvis:risoe-toggle', toggle);
    return () => window.removeEventListener('jarvis:risoe-toggle', toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = data.filter(rs => {
    if (filter !== 'ALL' && rs.coverage !== COV_MAP[filter]) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!rs.label.toLowerCase().includes(q) && !rs._searchText.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts = {
    fullyActive: data.filter(r => r.coverage === 'FULLY_ACTIVE').length,
    intelBacked: data.filter(r => r.coverage === 'INTEL_BACKED').length,
    opsTriggered: data.filter(r => r.coverage === 'OPS_TRIGGERED').length,
    blind: data.filter(r => r.coverage === 'BLIND').length,
  };

  const totalIp = [...new Set(data.flatMap(r => r.matchedIp.map(p => p.id)))].length;
  const totalOe = [...new Set(data.flatMap(r => r.matchedOe.map(e => e.id)))].length;

  const assess = async () => {
    setAssessing(true); setAssessText('');
    try {
      const script = await buildRisoeScript();
      setAssessText(script);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
    } catch { setAssessText('Assessment unavailable.'); }
    setAssessing(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="RiskSignal × IntelProfile × Ops Event Triple Coverage"
        style={{
          position: 'fixed', left: 829120, bottom: 8, zIndex: 509,
          background: 'rgba(5,8,13,0.82)', border: `1px solid ${RD}55`,
          color: RD, fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          letterSpacing: 1.5, padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
          backdropFilter: 'blur(6px)', whiteSpace: 'nowrap',
        }}>
        ◈ RISOE
        {counts.blind > 0 && (
          <span style={{ marginLeft: 5, background: GR, color: '#DCEBF5', borderRadius: 3, padding: '0 4px', fontSize: 8, fontWeight: 700 }}>
            {counts.blind}
          </span>
        )}
        {counts.fullyActive > 0 && (
          <span style={{ marginLeft: 3, background: RD, color: '#04060A', borderRadius: 3, padding: '0 4px', fontSize: 8, fontWeight: 700 }}>
            {counts.fullyActive}
          </span>
        )}
      </button>
    );
  }

  const covColor = c =>
    c === 'FULLY_ACTIVE' ? RD :
    c === 'INTEL_BACKED' ? CY :
    c === 'OPS_TRIGGERED' ? OR : GR;

  return (
    <div style={{
      position: 'fixed', top: 60, right: 16, zIndex: 509, width: 'min(820px,95vw)',
      maxHeight: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column',
      background: 'rgba(5,10,18,0.97)', border: `1px solid ${RD}44`,
      borderRadius: 10, fontFamily: "'JetBrains Mono',monospace", overflow: 'hidden',
      boxShadow: `0 0 40px ${RD}22`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${RD}33`, flexShrink: 0 }}>
        <span style={{ color: RD, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>◈ RISOE</span>
        <span style={{ color: '#6E8AA0', fontSize: 9 }}>RiskSignal × IntelProfile × Ops Event</span>
        {loading && <span style={{ color: RD, fontSize: 8, animation: 'risoe_pulse 1s infinite' }}>LOADING…</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={assess} disabled={assessing} style={{
            background: `${RD}22`, border: `1px solid ${RD}55`, color: RD,
            fontSize: 9, padding: '3px 8px', borderRadius: 3, cursor: assessing ? 'default' : 'pointer', letterSpacing: 1,
          }}>{assessing ? 'ASSESSING…' : 'ASSESS'}</button>
          <button onClick={() => setOpen(false)} style={{
            background: 'transparent', border: `1px solid #2A3A50`, color: '#6E8AA0',
            fontSize: 9, padding: '3px 8px', borderRadius: 3, cursor: 'pointer',
          }}>✕</button>
        </div>
      </div>

      {/* Assess output */}
      {assessText && (
        <div style={{ padding: '6px 14px', background: `${RD}11`, borderBottom: `1px solid ${RD}22`, color: '#DCEBF5', fontSize: 9, lineHeight: 1.5, flexShrink: 0 }}>
          {assessText}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: `1px solid ${RD}22`, flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'RISK SIGNALS', val: data.length, color: '#DCEBF5' },
          { label: 'INTEL PROFILES', val: totalIp, color: CY },
          { label: 'OPS EVENTS', val: totalOe, color: OR },
          { label: 'FULLY ACTIVE', val: counts.fullyActive, color: RD },
          { label: 'INTEL BACKED', val: counts.intelBacked, color: CY },
          { label: 'OPS TRIGGERED', val: counts.opsTriggered, color: OR },
          { label: 'BLIND', val: counts.blind, color: GR },
        ].map(s => (
          <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '4px 10px', minWidth: 70, textAlign: 'center' }}>
            <div style={{ color: s.color, fontSize: 13, fontWeight: 700 }}>{s.val}</div>
            <div style={{ color: '#4A5A70', fontSize: 8, letterSpacing: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {data.length > 0 && (
        <div style={{ margin: '6px 14px', height: 5, borderRadius: 3, overflow: 'hidden', display: 'flex', flexShrink: 0 }}>
          {[
            { n: counts.fullyActive, c: RD },
            { n: counts.intelBacked, c: CY },
            { n: counts.opsTriggered, c: OR },
            { n: counts.blind, c: '#1E1E2A' },
          ].map((seg, i) => (
            <div key={i} style={{ flex: seg.n, background: seg.c, minWidth: seg.n ? 2 : 0, transition: 'flex 0.4s' }} />
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: `1px solid ${RD}22`, flexShrink: 0, flexWrap: 'wrap' }}>
        {FILTER_TABS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? `${RD}33` : 'transparent',
            border: `1px solid ${filter === f ? RD : '#2A3A50'}`,
            color: filter === f ? RD : '#6E8AA0', fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="search risk signals…"
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.04)', border: `1px solid #2A3A50`, color: '#DCEBF5', fontSize: 9, padding: '2px 8px', borderRadius: 3, outline: 'none', width: 140 }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px' }}>
        {visible.length === 0 && (
          <div style={{ color: '#6E8AA0', fontSize: 10, textAlign: 'center', padding: 24 }}>
            {loading ? 'Loading…' : 'No risk signals match filter.'}
          </div>
        )}
        {visible.map(rs => {
          const isExp = expanded === rs.id;
          const cc = covColor(rs.coverage);
          return (
            <div key={rs.id} style={{ marginBottom: 4, borderRadius: 5, border: `1px solid ${cc}33`, background: `${cc}07`, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(isExp ? null : rs.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: cc, flexShrink: 0 }} />
                <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rs.label}</span>
                {rs.signalType && <Badge label={rs.signalType} color={RD} />}
                {rs.severity && <Badge label={rs.severity} color='#6E8AA0' />}
                <Badge label={`${rs.matchedIp.length}IP / ${rs.matchedOe.length}OE`} color={cc} />
                <span style={{ fontSize: 8, color: cc, letterSpacing: 1, marginLeft: 4 }}>{rs.coverage.replace(/_/g, ' ')}</span>
                <span style={{ color: '#6E8AA0', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${cc}22` }}>
                  {rs.description && (
                    <div style={{ color: '#6E8AA0', fontSize: 9, marginBottom: 8, lineHeight: 1.4 }}>{rs.description.slice(0, 160)}{rs.description.length > 160 ? '…' : ''}</div>
                  )}
                  <div style={{ display: 'flex', gap: 10 }}>
                    {/* Left: intel profiles */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>INTEL PROFILES ({rs.matchedIp.length})</div>
                      {rs.matchedIp.length === 0
                        ? <div style={{ color: '#444', fontSize: 9 }}>no intel profile match</div>
                        : rs.matchedIp.slice(0, 5).map(p => (
                          <div key={p.id} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ color: '#DCEBF5', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
                              {p.category && <Badge label={p.category} color={CY} />}
                              {p.threat_level && <Badge label={p.threat_level} color='#FF4444' />}
                            </div>
                            <ScoreBar score={p.score} color={CY} />
                          </div>
                        ))}
                    </div>
                    {/* Right: ops events */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: OR, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>OPS EVENTS ({rs.matchedOe.length})</div>
                      {rs.matchedOe.length === 0
                        ? <div style={{ color: '#444', fontSize: 9 }}>no ops event match</div>
                        : rs.matchedOe.slice(0, 5).map(e => (
                          <div key={e.id} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ color: '#DCEBF5', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}</span>
                              {e.eventType && <Badge label={e.eventType} color={OR} />}
                              {e.severity && <Badge label={e.severity} color='#6E8AA0' />}
                            </div>
                            <ScoreBar score={e.score} color={OR} />
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <style>{`@keyframes risoe_pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}
