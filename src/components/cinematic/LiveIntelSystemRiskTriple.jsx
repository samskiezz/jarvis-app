import { useState, useEffect, useCallback } from 'react';

const API = '';
const LSRTRI_RE = /\b(lsrtri|live[._\-\s]?system[._\-\s]?risk|triple[._\-\s]?critical|system[._\-\s]?risk[._\-\s]?live|critical[._\-\s]?alarm|service[._\-\s]?risk[._\-\s]?live|live[._\-\s]?service[._\-\s]?alert|triple[._\-\s]?alarm)\b/i;

export function isLsrtriQuery(t) { return LSRTRI_RE.test(t || ''); }

export function buildLsrtriScript(data) {
  if (!data) return 'Checking live intel against system services and risk signals now.';
  const rows = data.rows || [];
  const fc = rows.filter(r => r.state === 'FULLY CRITICAL').length;
  const total = rows.length;
  const topNames = rows.filter(r => r.state === 'FULLY CRITICAL').slice(0, 2).map(r => r.title || 'event').join(' and ');
  if (fc > 0) {
    return `LSRTRI triple alarm: ${fc} of ${total} live events are FULLY CRITICAL — live intel plus degraded service plus active risk signal simultaneously${topNames ? ': ' + topNames : ''}. Immediate escalation recommended on the highest-severity triple overlaps.`;
  }
  return `LSRTRI assessment: ${total} live intel events cross-referenced against system services and risk signals. No FULLY CRITICAL triple alarms detected — monitor LIVE+RISK and LIVE+DEGRADED states for emerging convergence.`;
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(aToks, other) {
  const bToks = tokens(other);
  if (!aToks.length || !bToks.length) return 0;
  let hits = 0;
  for (const a of aToks) for (const b of bToks) {
    if (a === b || (a.length > 3 && b.startsWith(a)) || (b.length > 3 && a.startsWith(b))) hits++;
  }
  return hits / Math.max(aToks.length, bToks.length);
}

function normaliseIntel(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.earthquakes)) {
    return raw.earthquakes.map(e => ({
      title: e.place || e.location || 'Seismic Event',
      description: `M${e.magnitude ?? '?'} ${e.place || ''}`.trim(),
      source: 'seismic',
    }));
  }
  const arr = raw.items || raw.events || raw.data || raw.results || raw.intel || [];
  return Array.isArray(arr) ? arr : [];
}

function normaliseServices(raw) {
  if (!raw) return [];
  const svcs = raw.services || raw.components || raw.checks || raw.modules || raw.items || [];
  if (Array.isArray(svcs) && svcs.length > 0) return svcs;
  if (raw && typeof raw === 'object') {
    return Object.entries(raw)
      .filter(([k]) => !['status', 'uptime', 'cpu', 'mem', 'load', 'version', 'timestamp'].includes(k))
      .map(([k, v]) => ({ name: k, status: typeof v === 'string' ? v : (v?.status || 'unknown') }));
  }
  return [];
}

function normaliseSignals(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const arr = raw.results || raw.signals || raw.items || raw.data || [];
  return Array.isArray(arr) ? arr : [];
}

const DEGRADED_STATUSES = ['degraded', 'down', 'error', 'critical', 'unhealthy', 'failed'];

function isDegradedStatus(svc) {
  const s = String(svc.status || svc.health || svc.state || '').toLowerCase();
  return DEGRADED_STATUSES.some(x => s.includes(x));
}

function classifyEvent(evt, services, signals) {
  const evToks = tokens(`${evt.title || ''} ${evt.description || ''} ${evt.source || ''} ${evt.place || ''}`);
  const degradedSvcs = services.filter(isDegradedStatus);
  const hasDegraded = degradedSvcs.some(svc =>
    matchScore(evToks, `${svc.name || ''} ${svc.id || ''}`) > 0
  );
  const hasRisk = signals.some(sig =>
    matchScore(evToks, `${sig.title || ''} ${sig.category || ''} ${sig.description || ''}`) > 0
  );
  if (hasDegraded && hasRisk) return 'FULLY CRITICAL';
  if (hasRisk) return 'LIVE+RISK';
  if (hasDegraded) return 'LIVE+DEGRADED';
  return 'NORMAL';
}

const STATE_ORDER = ['FULLY CRITICAL', 'LIVE+RISK', 'LIVE+DEGRADED', 'RISK+DEGRADED', 'NORMAL'];
const STATE_COLOR = {
  'FULLY CRITICAL': '#FF2D55',
  'LIVE+RISK': '#FF6B35',
  'LIVE+DEGRADED': '#FF9500',
  'RISK+DEGRADED': '#FFD60A',
  'NORMAL': '#30D158',
};

export default function LiveIntelSystemRiskTriple() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [services, setServices] = useState([]);
  const [signals, setSignals] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [intelR, sysR, rskR] = await Promise.all([
        fetch(`${API}/functions/getLiveIntel`),
        fetch(`${API}/v1/jarvis/system/status`),
        fetch(`${API}/entities/RiskSignal`),
      ]);
      const [intelD, sysD, rskD] = await Promise.all([intelR.json(), sysR.json(), rskR.json()]);
      const evts = normaliseIntel(intelD);
      const svcs = normaliseServices(sysD);
      const sigs = normaliseSignals(rskD);
      setServices(svcs);
      setSignals(sigs);

      const classified = evts.map(e => ({ ...e, state: classifyEvent(e, svcs, sigs) }));

      // RISK+DEGRADED: risk signals paired with degraded services but with no live event match
      const degradedSvcs = svcs.filter(isDegradedStatus);
      const riskDegRows = [];
      for (const sig of sigs) {
        const sigToks = tokens(`${sig.title || ''} ${sig.category || ''} ${sig.description || ''}`);
        const hasDegMatch = degradedSvcs.some(svc =>
          matchScore(sigToks, `${svc.name || ''} ${svc.id || ''}`) > 0
        );
        const alreadyCovered = classified.some(r =>
          r.state === 'FULLY CRITICAL' &&
          matchScore(sigToks, `${r.title || ''} ${r.description || ''}`) > 0
        );
        if (hasDegMatch && !alreadyCovered) {
          riskDegRows.push({
            title: sig.title || 'Risk Signal',
            description: `${sig.category || ''}${sig.severity ? ' · ' + sig.severity : ''}`.trim() || '—',
            source: 'risk+degraded',
            state: 'RISK+DEGRADED',
          });
        }
      }

      setRows([...classified, ...riskDegRows]);
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:lsrtri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:lsrtri-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [open, load]);

  const counts = STATE_ORDER.reduce((acc, s) => {
    acc[s] = rows.filter(r => r.state === s).length;
    return acc;
  }, {});
  const fcCount = counts['FULLY CRITICAL'];

  const displayed = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (r.title || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.source || '').toLowerCase().includes(q);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    const fcNames = rows.filter(r => r.state === 'FULLY CRITICAL').slice(0, 3).map(r => r.title || 'event').join(', ');
    const prompt = `LSRTRI triple alarm analysis: ${rows.length} live intel events assessed against ${services.length} system services and ${signals.length} active risk signals. ${fcCount} FULLY CRITICAL triple alarms detected${fcNames ? ': ' + fcNames : ''}. Provide a 2-sentence triple alarm brief identifying the highest-severity convergence and the recommended escalation path.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const txt = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {}
    setAssessing(false);
  }

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', left: 769200, bottom: 8, zIndex: 402,
      width: 440,
      background: 'rgba(8,12,20,0.93)',
      border: `1px solid ${fcCount > 0 ? '#FF2D5566' : '#FFFFFF22'}`,
      borderRadius: 10,
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: 11,
      color: '#DCEBF5',
      boxShadow: fcCount > 0 ? '0 0 40px #FF2D5522' : '0 0 24px #00000055',
      backdropFilter: 'blur(8px)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #FFFFFF11' }}>
        <span style={{ color: '#FF2D55', fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>◈ LSRTRI</span>
        <span style={{ color: '#6E8AA0', fontSize: 9, flex: 1 }}>LIVE INTEL × SYSTEM × RISK TRIPLE</span>
        {fcCount > 0 && (
          <span style={{
            background: '#FF2D55', color: '#fff', borderRadius: 4,
            padding: '1px 6px', fontSize: 9, fontWeight: 700,
            animation: 'lsrtri-pulse 1.2s ease-in-out infinite',
          }}>
            {fcCount} CRITICAL
          </span>
        )}
        {loading && <span style={{ color: '#6E8AA0', fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: 'none', color: '#6E8AA0',
          cursor: 'pointer', fontSize: 12, padding: 0,
        }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 5, padding: '6px 12px', flexWrap: 'wrap' }}>
        {STATE_ORDER.map(s => (
          <div key={s} style={{
            flex: '1 1 60px', background: 'rgba(255,255,255,0.04)',
            borderRadius: 6, padding: '4px 4px', textAlign: 'center',
            border: `1px solid ${STATE_COLOR[s]}33`,
          }}>
            <div style={{ color: STATE_COLOR[s], fontSize: 14, fontWeight: 700 }}>{counts[s] || 0}</div>
            <div style={{ color: '#6E8AA0', fontSize: 7, letterSpacing: 0.5, marginTop: 1, lineHeight: 1.2 }}>{s}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 3, padding: '3px 12px', overflowX: 'auto', flexWrap: 'wrap' }}>
        {['ALL', ...STATE_ORDER].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] || '#29E7FF') + '22' : 'none',
            border: `1px solid ${filter === f ? (STATE_COLOR[f] || '#29E7FF') : '#FFFFFF22'}`,
            color: filter === f ? (STATE_COLOR[f] || '#29E7FF') : '#6E8AA0',
            borderRadius: 4, cursor: 'pointer', fontSize: 8, padding: '2px 5px', letterSpacing: 0.5,
            whiteSpace: 'nowrap',
          }}>
            {f === 'ALL' ? `ALL (${rows.length})` : `${f} (${counts[f] || 0})`}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '4px 12px' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search events…"
          style={{
            width: '100%', background: 'rgba(255,255,255,0.05)',
            border: '1px solid #FFFFFF22', borderRadius: 4,
            color: '#DCEBF5', fontSize: 10, padding: '3px 8px',
            boxSizing: 'border-box', outline: 'none',
          }}
        />
      </div>

      {/* Rows */}
      <div style={{ maxHeight: 240, overflowY: 'auto', padding: '4px 12px' }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: '#6E8AA0', textAlign: 'center', padding: 12, fontSize: 10 }}>
            no events matched
          </div>
        )}
        {displayed.map((row, i) => (
          <div
            key={i}
            onClick={() => setExpanded(expanded === i ? null : i)}
            style={{
              borderLeft: `3px solid ${STATE_COLOR[row.state]}`,
              padding: '5px 8px', marginBottom: 4, borderRadius: 4,
              background: 'rgba(255,255,255,0.03)', cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#DCEBF5', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>
                {row.title || '(event)'}
              </span>
              <span style={{
                background: STATE_COLOR[row.state] + '33',
                color: STATE_COLOR[row.state],
                borderRadius: 3, padding: '1px 5px', fontSize: 7, whiteSpace: 'nowrap', letterSpacing: 0.5,
              }}>{row.state}</span>
            </div>
            {expanded === i && (
              <div style={{ marginTop: 4, color: '#8EA3B3', fontSize: 10, lineHeight: 1.4 }}>
                {row.description || row.source || '—'}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ASSESS button */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid #FFFFFF11' }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            width: '100%',
            background: assessing ? '#FF2D5511' : '#FF2D5522',
            border: '1px solid #FF2D5555',
            color: '#FF2D55', borderRadius: 5,
            cursor: assessing ? 'wait' : 'pointer',
            fontSize: 10, padding: '5px 0', letterSpacing: 2,
          }}
        >
          {assessing ? '◉ ASSESSING…' : '▶ ASSESS TRIPLE ALARMS'}
        </button>
      </div>

      <style>{`@keyframes lsrtri-pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
    </div>
  );
}
