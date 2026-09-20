import { useState, useEffect, useCallback } from 'react';

const API = '';

const SYSRSK_RE = /\b(sysrsk|system[._-]?risk|service[._-]?risk|system[._-]?status[._-]?risk|service[._-]?threat|compromised[._-]?service|degraded[._-]?service[._-]?risk|system[._-]?health[._-]?risk|service[._-]?alert[._-]?risk|threat[._-]?service|risk[._-]?service[._-]?health)\b/i;

export function isSysrskQuery(t) {
  return SYSRSK_RE.test(t || '');
}

function normaliseServices(raw) {
  if (!raw) return [];
  // /v1/jarvis/system/status returns services array or a map
  const services = raw.services || raw.components || raw.checks || raw.modules || raw.items || [];
  if (Array.isArray(services) && services.length > 0) {
    return services.map((s, i) => ({
      id:     s.id || s.name || String(i),
      name:   s.name || s.service || s.component || s.module || `Service ${i + 1}`,
      status: (s.status || s.health || s.state || '').toLowerCase(),
      detail: String(s.message || s.detail || s.error || s.latency_ms || '').slice(0, 200),
    }));
  }
  // Flat object shape: { "backend": "ok", "vllm": "error" }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const keys = Object.keys(raw).filter(k => typeof raw[k] === 'string' || typeof raw[k] === 'object');
    if (keys.length > 0) {
      return keys.map((k, i) => {
        const v = raw[k];
        const status = typeof v === 'string' ? v : (v?.status || v?.health || '');
        const detail = typeof v === 'object' ? String(v?.message || v?.detail || JSON.stringify(v)).slice(0, 200) : '';
        return { id: k, name: k, status: status.toLowerCase(), detail };
      });
    }
  }
  return [];
}

function normaliseSignals(raw) {
  if (!raw) return [];
  const arr = ['signals', 'items', 'results', 'data', 'records', 'risks'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:       s.id || String(i),
    name:     s.title || s.name || s.signal || s.label || `Signal ${i + 1}`,
    severity: (s.severity || s.level || s.priority || '').toLowerCase(),
    category: s.category || s.type || s.kind || s.sector || '',
    desc:     String(s.description || s.summary || s.detail || s.source || '').slice(0, 200),
    tags:     Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(aToks, other) {
  const bToks = [
    ...tokens(other.name),
    ...tokens(other.category),
    ...tokens(other.desc),
    ...tokens(other.tags),
  ].filter(Boolean);
  if (!aToks.size || !bToks.length) return 0;
  let hits = 0;
  for (const t of bToks) if (aToks.has(t)) hits++;
  return hits / Math.max(aToks.size, bToks.length);
}

function isHealthy(status) {
  return ['ok', 'up', 'online', 'healthy', 'running', 'active', 'green'].some(g => status.includes(g));
}

function correlate(services, signals) {
  return services.map(svc => {
    const toks = new Set([...tokens(svc.name), ...tokens(svc.detail)].filter(Boolean));
    const matched = signals
      .map(sig => ({ ...sig, _score: matchScore(toks, sig) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);

    const healthy  = isHealthy(svc.status);
    const hasRisk  = matched.length > 0;

    let coverage;
    if (!healthy && hasRisk)     coverage = 'COMPROMISED';
    else if (!healthy && !hasRisk) coverage = 'DEGRADED';
    else if (healthy && hasRisk)   coverage = 'THREATENED';
    else                           coverage = 'SECURE';

    return { ...svc, _signals: matched, _coverage: coverage };
  });
}

export async function buildSysrskScript() {
  const [svcR, sigR] = await Promise.allSettled([
    fetch(`${API}/v1/jarvis/system/status`).then(r => r.json()),
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
  ]);
  const services = normaliseServices(svcR.status === 'fulfilled' ? svcR.value : {});
  const signals  = normaliseSignals(sigR.status === 'fulfilled' ? sigR.value : []);
  const enriched = correlate(services, signals);
  const comp = enriched.filter(e => e._coverage === 'COMPROMISED').length;
  const deg  = enriched.filter(e => e._coverage === 'DEGRADED').length;
  const thr  = enriched.filter(e => e._coverage === 'THREATENED').length;
  const sec  = enriched.filter(e => e._coverage === 'SECURE').length;
  return (
    `System Status × Risk Signal Alert Monitor: ${services.length} services cross-referenced against ` +
    `${signals.length} active risk signals. ` +
    `${comp} COMPROMISED (service degraded AND risk signal present); ` +
    `${deg} DEGRADED (service issue, no risk signal alignment); ` +
    `${thr} THREATENED (healthy service but risk signal detected in its domain); ` +
    `${sec} SECURE (healthy + no risk signal alignment). ` +
    `Priority: ${enriched.filter(e => e._coverage === 'COMPROMISED').map(e => e.name).slice(0, 3).join(', ') || 'none compromised'}.`
  );
}

const PANEL_W = 720;
const PANEL_H = 640;
const RD = '#EF4444';
const AM = '#F59E0B';
const CY = '#00CFFF';
const GR = '#22C55E';

const COVERAGE_COLOR = {
  'COMPROMISED': RD,
  'DEGRADED':    AM,
  'THREATENED':  '#F97316',
  'SECURE':      GR,
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

const TABS = ['ALL', 'COMPROMISED', 'DEGRADED', 'THREATENED', 'SECURE'];

export default function SystemStatusRiskMonitor() {
  const [open, setOpen]             = useState(false);
  const [services, setServices]     = useState([]);
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
      const [svcR, sigR] = await Promise.allSettled([
        fetch(`${API}/v1/jarvis/system/status`).then(r => r.json()),
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
      ]);
      const rawSvc = normaliseServices(svcR.status === 'fulfilled' ? svcR.value : {});
      const rawSig = normaliseSignals(sigR.status === 'fulfilled' ? sigR.value : []);
      setServices(correlate(rawSvc, rawSig));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:sysrsk-toggle', toggle);
    return () => window.removeEventListener('jarvis:sysrsk-toggle', toggle);
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
      const brief = await buildSysrskScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `System status risk assessment: ${brief}. Give a 2-sentence operational brief on current system security posture and the highest-priority compromised or threatened service.` }),
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
    const compromisedCount = services.filter(s => s._coverage === 'COMPROMISED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="System Status × Risk Signal Alert Monitor (SYSRSK)"
        style={{
          position: 'fixed', left: 739520, bottom: 8, zIndex: 349,
          background: compromisedCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${compromisedCount > 0 ? RD : CY + '44'}`,
          color: compromisedCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ SYSRSK{compromisedCount > 0 ? ` ⚠${compromisedCount}` : ''}
      </button>
    );
  }

  const comp = services.filter(s => s._coverage === 'COMPROMISED').length;
  const deg  = services.filter(s => s._coverage === 'DEGRADED').length;
  const thr  = services.filter(s => s._coverage === 'THREATENED').length;
  const sec  = services.filter(s => s._coverage === 'SECURE').length;

  const visible = services.filter(s =>
    (tab === 'ALL' || s._coverage === tab) &&
    (!search || s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.detail.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #EF444433', borderRadius: 8,
      zIndex: 6001, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #EF444418',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #EF444422', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: RD, fontWeight: 700, fontSize: 11 }}>◈ SYSTEM STATUS × RISK SIGNAL MONITOR</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>SYSRSK</span>
        {comp > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {comp} COMPROMISED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['SERVICES', services.length, CY],
          ['COMPROMISED', comp, RD],
          ['DEGRADED',    deg,  AM],
          ['THREATENED',  thr,  '#F97316'],
          ['SECURE',      sec,  GR],
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
          placeholder="search services…"
          style={{ marginLeft: 'auto', background: '#0c0c1e', border: '1px solid #333', color: '#aaa', borderRadius: 3, padding: '2px 8px', fontSize: 10, fontFamily: 'monospace', width: 160 }}
        />
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 12px' }}>
        {loading && <div style={{ color: '#444', fontSize: 10, padding: 12 }}>loading system status…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>error: {err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#444', fontSize: 10, padding: 12 }}>no services match</div>}
        {visible.map(svc => {
          const col = COVERAGE_COLOR[svc._coverage] || CY;
          const isExp = expanded === svc.id;
          return (
            <div key={svc.id} style={{ marginBottom: 4, background: '#0c0c1e', border: `1px solid ${col}33`, borderRadius: 5 }}>
              <div
                onClick={() => setExpanded(isExp ? null : svc.id)}
                style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span style={{ fontSize: 10, color: col, fontWeight: 700, minWidth: 100 }}>{svc._coverage}</span>
                <span style={{ fontSize: 11, color: '#ccc', flex: 1 }}>{svc.name}</span>
                {chip(svc.status || 'unknown', svc.status && isHealthy(svc.status) ? GR : RD)}
                {svc._signals.length > 0 && chip(`${svc._signals.length} risk${svc._signals.length > 1 ? 's' : ''}`, AM)}
                <span style={{ fontSize: 10, color: '#444' }}>{isExp ? '▾' : '▸'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: `1px solid ${col}22` }}>
                  {svc.detail && (
                    <div style={{ fontSize: 9, color: '#777', marginBottom: 8, marginTop: 6 }}>{svc.detail}</div>
                  )}
                  {svc._signals.length === 0 ? (
                    <div style={{ fontSize: 9, color: '#444', fontStyle: 'italic' }}>no matched risk signals</div>
                  ) : (
                    svc._signals.map(sig => (
                      <div key={sig.id} style={{ marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 10, color: AM }}>{sig.name}</span>
                          {chip(sig.severity || 'unknown', sig.severity === 'critical' ? RD : AM)}
                          {sig.category && chip(sig.category, '#8B5CF6')}
                        </div>
                        <ScoreBar score={sig._score} color={AM} />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: '6px 12px', borderTop: '1px solid #1a1a2a', fontSize: 9, color: '#555', flexShrink: 0 }}>
        /v1/jarvis/system/status × /entities/RiskSignal · 60s auto-refresh
      </div>
    </div>
  );
}
