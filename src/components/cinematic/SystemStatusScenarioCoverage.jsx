import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SSSCEN_RE = /\b(ssscen|system\s+scenario|service\s+scenario|service\s+incident\s+plan|unscripted\s+service|scripted\s+service|service\s+playbook|system\s+playbook|scenario\s+service\s+coverage|service\s+scenario\s+coverage|system\s+incident\s+plan)\b/i;

export function isSsscenQuery(t) { return SSSCEN_RE.test(t || ''); }

export async function buildSsscenScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [stR, scR] = await Promise.allSettled([
    fetch(`${API}/v1/jarvis/system/status`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
  ]);
  const raw = stR.value ?? {};
  const services = Array.isArray(raw) ? raw
    : (raw.services ?? raw.components ?? raw.checks ?? raw.data ?? []);
  const scRaw = scR.value ?? {};
  const scenarios = Array.isArray(scRaw) ? scRaw
    : (scRaw.scenarios ?? scRaw.data ?? scRaw.results ?? []);

  const scenText = scenarios.map(s =>
    `${s.name ?? s.title ?? s.id ?? ''} ${s.description ?? ''} ${s.type ?? ''} ${s.category ?? ''}`.toLowerCase()
  ).join(' ');

  let scripted = 0, unscripted = 0;
  for (const svc of services) {
    const name = `${svc.name ?? svc.id ?? svc.service ?? ''}`.toLowerCase();
    const tokens = name.split(/\W+/).filter(t => t.length > 2);
    const hit = tokens.some(tok => scenText.includes(tok));
    if (hit) scripted++; else unscripted++;
  }
  return `SSSCEN System Status × Scenario Coverage: ${services.length} live services assessed against ${scenarios.length} playbook scenarios. ` +
    `SCRIPTED: ${scripted} (scenario incident plan found for this service domain). ` +
    `UNSCRIPTED: ${unscripted} (no scenario playbook covers this service — incident response gap).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 90, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = { SCRIPTED: '#22d3ee', UNSCRIPTED: '#f59e0b' };

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreMatch(svc, scenarios) {
  const name = `${svc.name ?? svc.id ?? svc.service ?? ''}`.toLowerCase();
  const svcTokens = tokenize(name);
  const matched = [];
  for (const sc of scenarios) {
    const scText = `${sc.name ?? sc.title ?? sc.id ?? ''} ${sc.description ?? ''} ${sc.type ?? ''} ${sc.category ?? ''}`.toLowerCase();
    const hits = svcTokens.filter(tok => scText.includes(tok));
    if (hits.length > 0) {
      matched.push({ sc, score: Math.min(100, hits.length * 25) });
    }
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function correlate(svc, scenarios) {
  const name = `${svc.name ?? svc.id ?? svc.service ?? ''}`.toLowerCase();
  const tokens = tokenize(name);
  const scenText = scenarios.map(s =>
    `${s.name ?? s.title ?? s.id ?? ''} ${s.description ?? ''} ${s.type ?? ''} ${s.category ?? ''}`.toLowerCase()
  ).join(' ');
  const hit = tokens.some(tok => scenText.includes(tok));
  return hit ? 'SCRIPTED' : 'UNSCRIPTED';
}

export default function SystemStatusScenarioCoverage() {
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const hdr = { Authorization: `Bearer ${key}` };
      const [stR, scR] = await Promise.allSettled([
        fetch(`${API}/v1/jarvis/system/status`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
      ]);
      const raw = stR.value ?? {};
      const svcs = Array.isArray(raw) ? raw
        : (raw.services ?? raw.components ?? raw.checks ?? raw.data ?? []);
      const scRaw = scR.value ?? {};
      const scens = Array.isArray(scRaw) ? scRaw
        : (scRaw.scenarios ?? scRaw.data ?? scRaw.results ?? []);
      setServices(svcs);
      setScenarios(scens);
      setRows(svcs.map(svc => ({
        svc,
        state: correlate(svc, scens),
        matched: scoreMatch(svc, scens),
      })));
      setLastUpdated(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:ssscen-toggle', onToggle);
    return () => window.removeEventListener('jarvis:ssscen-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 60000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const scripted = rows.filter(r => r.state === 'SCRIPTED').length;
  const unscripted = rows.filter(r => r.state === 'UNSCRIPTED').length;

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = `${r.svc.name ?? r.svc.id ?? r.svc.service ?? ''}`.toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });

  const assess = async (row) => {
    const id = row.svc.name ?? row.svc.id ?? row.svc.service ?? 'service';
    setAssessing(id);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const matchNames = row.matched.slice(0, 3).map(m => m.sc.name ?? m.sc.title ?? m.sc.id ?? '?').join(', ');
      const prompt = `System service "${id}" has ${row.state === 'SCRIPTED' ? `scenario coverage (playbooks: ${matchNames || 'found'})` : 'NO scenario playbook coverage — incident response gap'}. In exactly 2 sentences, assess the incident response readiness for this service.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const brief = data.response ?? data.message ?? data.content ?? data.text ?? '';
      if (brief) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: brief } }));
    } catch (_) {}
    setAssessing(null);
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', left: 782080, bottom: 8, zIndex: 425,
      width: 520, maxHeight: '82vh',
      background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(34,211,238,0.25)',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#22d3ee', letterSpacing: 2, fontWeight: 700, flex: 1 }}>◈ SSSCEN — SYSTEM STATUS × SCENARIO COVERAGE</span>
        {unscripted > 0 && (
          <span style={{ background: '#f59e0b', color: '#000', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{unscripted} UNSCRIPTED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Services', val: services.length },
          { label: 'Scenarios', val: scenarios.length },
          { label: 'Scripted', val: scripted, color: '#22d3ee' },
          { label: 'Unscripted', val: unscripted, color: '#f59e0b' },
        ].map(t => (
          <div key={t.label} style={TILE}>
            <div style={LABEL}>{t.label}</div>
            <div style={{ ...VAL, color: t.color ?? '#e2e8f0' }}>{loading ? '…' : t.val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {rows.length > 0 && (
        <div style={{ padding: '0 14px 8px', flexShrink: 0 }}>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round((scripted / rows.length) * 100)}%`, background: '#22d3ee', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {rows.length ? Math.round((scripted / rows.length) * 100) : 0}% scenario coverage · {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'SCRIPTED', 'UNSCRIPTED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? STATE_COLOR[f] ?? '#22d3ee' : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 4, padding: '3px 10px', fontSize: 10, fontWeight: 700,
            color: filter === f ? '#000' : '#aaa', cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search services…"
          style={{ flex: 1, minWidth: 100, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
        />
      </div>

      {/* Row list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>no services match</div>
        )}
        {visible.map((row, i) => {
          const id = row.svc.name ?? row.svc.id ?? row.svc.service ?? `svc-${i}`;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>{id}</span>
                {row.svc.status && (
                  <span style={{ fontSize: 10, color: row.svc.status === 'healthy' || row.svc.status === 'ok' ? '#4ade80' : '#f59e0b', background: 'rgba(255,255,255,0.06)', borderRadius: 3, padding: '1px 6px' }}>
                    {row.svc.status}
                  </span>
                )}
                <span style={{ fontSize: 10, color: STATE_COLOR[row.state] ?? '#888', fontWeight: 700, letterSpacing: 1 }}>{row.state}</span>
                <span style={{ fontSize: 10, color: '#555' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 10px 10px' }}>
                  {/* ASSESS button */}
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing === id}
                    style={{ background: assessing === id ? '#444' : 'rgba(34,211,238,0.15)', border: '1px solid rgba(34,211,238,0.3)', borderRadius: 4, color: '#22d3ee', fontSize: 10, padding: '3px 10px', cursor: assessing === id ? 'not-allowed' : 'pointer', marginBottom: 8 }}
                  >
                    {assessing === id ? 'ASSESSING…' : '▶ ASSESS'}
                  </button>

                  {row.matched.length === 0 ? (
                    <div style={{ color: '#555', fontSize: 11 }}>no matching scenarios</div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 10, color: '#888', marginBottom: 6, letterSpacing: 1 }}>SCENARIO MATCHES ({row.matched.length})</div>
                      {row.matched.slice(0, 6).map((m, mi) => {
                        const scName = m.sc.name ?? m.sc.title ?? m.sc.id ?? `scenario-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#d1d5db' }}>{scName}</span>
                              {m.sc.type && (
                                <span style={{ fontSize: 9, color: '#22d3ee', background: 'rgba(34,211,238,0.1)', borderRadius: 3, padding: '1px 5px' }}>{m.sc.type}</span>
                              )}
                              {m.sc.category && (
                                <span style={{ fontSize: 9, color: '#818cf8', background: 'rgba(129,140,248,0.1)', borderRadius: 3, padding: '1px 5px' }}>{m.sc.category}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#22d3ee', fontWeight: 700, minWidth: 32, textAlign: 'right' }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#22d3ee', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
