import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const POLL_MS = 90_000;
const SCENE_IDS = ['01_command_atrium','02_strategic_command','03_neural_nexus',
  '04_threat_matrix','05_intelligence_hub','06_operations_control',
  '07_financial_warfare','08_contact_network','09_research_lab','10_decision_engine'];

const SCSRISK_RE = /\b(scsrisk|scene\s+system\s+risk|system\s+risk\s+scene|alarmed\s+scene|scene\s+risk\s+system|scene\s+threat\s+system|system\s+backed\s+scene|risk\s+triggered\s+scene|scene\s+infrastructure\s+risk|scene\s+svc\s+risk)\b/i;

export function isScsriskQuery(t) { return SCSRISK_RE.test(t || ''); }

export async function buildScsriskScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  try {
    const [scenesR, sysR, rsR] = await Promise.allSettled([
      Promise.all(SCENE_IDS.map(id =>
        fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdr })
          .then(r => r.ok ? r.json() : null).catch(() => null)
      )),
      fetch(`${API}/v1/jarvis/system/status`, { headers: hdr }).then(r => r.json()),
      fetch(`${API}/entities/RiskSignal`, { headers: hdr }).then(r => r.json()),
    ]);

    const rawScenes = (scenesR.value ?? []).filter(Boolean);
    const sysRaw = sysR.value ?? {};
    const services = Array.isArray(sysRaw) ? sysRaw
      : (sysRaw.services ?? sysRaw.checks ?? sysRaw.data ?? Object.values(sysRaw).filter(Array.isArray)[0] ?? []);
    const rsRaw = rsR.value ?? {};
    const risks = Array.isArray(rsRaw) ? rsRaw : (rsRaw.risks ?? rsRaw.data ?? rsRaw.results ?? []);

    const svcText = services.map(s =>
      `${s.name ?? s.id ?? s.service ?? ''} ${s.description ?? ''} ${s.status ?? ''}`.toLowerCase()
    ).join(' ');
    const riskText = risks.map(r =>
      `${r.title ?? r.name ?? r.id ?? ''} ${r.description ?? ''} ${r.category ?? ''} ${r.source ?? ''}`.toLowerCase()
    ).join(' ');

    let fullyAlarmed = 0, svcBacked = 0, riskTriggered = 0, clear = 0;
    for (const raw of rawScenes) {
      const anchors = Array.isArray(raw?.anchors) ? raw.anchors : [];
      const anchorText = anchors.map(a =>
        [a.label, a.value, a.title, a.name, a.description].filter(Boolean).join(' ')
      ).join(' ');
      const text = `${raw.title ?? raw.id ?? ''} ${raw.description ?? ''} ${anchorText}`.toLowerCase();
      const tokens = text.split(/\W+/).filter(t => t.length > 2);
      const hasSvc = tokens.some(tok => svcText.includes(tok));
      const hasRisk = tokens.some(tok => riskText.includes(tok));
      if (hasSvc && hasRisk) fullyAlarmed++;
      else if (hasSvc) svcBacked++;
      else if (hasRisk) riskTriggered++;
      else clear++;
    }
    return `SCSRISK Scene × System Status × Risk Signal: ${rawScenes.length} cinematic scenes assessed against ` +
      `${services.length} live system services and ${risks.length} active risk signals. ` +
      `FULLY ALARMED: ${fullyAlarmed} (system service + risk signal — scene has both live infrastructure backing and active threat context). ` +
      `SVC-BACKED: ${svcBacked} (system service found, no risk signal — infrastructure coverage but no threat aligned). ` +
      `RISK-TRIGGERED: ${riskTriggered} (risk signal match, no system service — threat context but no service monitoring this scene domain). ` +
      `CLEAR: ${clear} (no system or risk coverage — scene dark on both dimensions).`;
  } catch {
    return 'Scene × System Status × Risk Signal assessment unavailable at this time, sir.';
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 80, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY ALARMED': '#ef4444',
  'SVC-BACKED':    '#22d3ee',
  'RISK-TRIGGERED':'#f97316',
  CLEAR:           '#6b7280',
};

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function sceneText(raw) {
  const anchors = Array.isArray(raw?.anchors) ? raw.anchors : [];
  const anchorText = anchors.map(a =>
    [a.label, a.value, a.title, a.name, a.description].filter(Boolean).join(' ')
  ).join(' ');
  return `${raw.title ?? raw.id ?? ''} ${raw.description ?? ''} ${anchorText}`.toLowerCase();
}

function scoreServices(raw, services) {
  const tokens = tokenize(sceneText(raw));
  const matched = [];
  for (const s of services) {
    const sText = `${s.name ?? s.id ?? s.service ?? ''} ${s.description ?? ''} ${s.status ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => sText.includes(tok));
    if (hits.length > 0) matched.push({ item: s, score: Math.min(100, hits.length * 30) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function scoreRisks(raw, risks) {
  const tokens = tokenize(sceneText(raw));
  const matched = [];
  for (const r of risks) {
    const rText = `${r.title ?? r.name ?? r.id ?? ''} ${r.description ?? ''} ${r.category ?? ''} ${r.source ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => rText.includes(tok));
    if (hits.length > 0) matched.push({ item: r, score: Math.min(100, hits.length * 25) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function correlate(raw, services, risks) {
  const tokens = tokenize(sceneText(raw));
  const svcText = services.map(s => `${s.name ?? s.id ?? s.service ?? ''} ${s.description ?? ''} ${s.status ?? ''}`.toLowerCase()).join(' ');
  const riskText = risks.map(r => `${r.title ?? r.name ?? r.id ?? ''} ${r.description ?? ''} ${r.category ?? ''} ${r.source ?? ''}`.toLowerCase()).join(' ');
  const hasSvc = tokens.some(tok => svcText.includes(tok));
  const hasRisk = tokens.some(tok => riskText.includes(tok));
  if (hasSvc && hasRisk) return 'FULLY ALARMED';
  if (hasSvc) return 'SVC-BACKED';
  if (hasRisk) return 'RISK-TRIGGERED';
  return 'CLEAR';
}

// ── component ─────────────────────────────────────────────────────────────────

export default function SceneSystemRiskTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [services, setServices] = useState([]);
  const [risks, setRisks] = useState([]);
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
      const [scenesR, sysR, rsR] = await Promise.allSettled([
        Promise.all(SCENE_IDS.map(id =>
          fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdr })
            .then(r => r.ok ? r.json() : null).catch(() => null)
        )),
        fetch(`${API}/v1/jarvis/system/status`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/entities/RiskSignal`, { headers: hdr }).then(r => r.json()),
      ]);

      const rawScenes = (scenesR.value ?? []).filter(Boolean);
      const sysRaw = sysR.value ?? {};
      const svcs = Array.isArray(sysRaw) ? sysRaw
        : (sysRaw.services ?? sysRaw.checks ?? sysRaw.data ?? Object.values(sysRaw).filter(Array.isArray)[0] ?? []);
      const rsRaw = rsR.value ?? {};
      const rks = Array.isArray(rsRaw) ? rsRaw : (rsRaw.risks ?? rsRaw.data ?? rsRaw.results ?? []);

      setServices(svcs);
      setRisks(rks);
      setRows(rawScenes.map(raw => ({
        raw,
        label: raw.title ?? raw.id ?? 'Scene',
        state: correlate(raw, svcs, rks),
        leftMatched: scoreServices(raw, svcs),
        rightMatched: scoreRisks(raw, rks),
      })));
      setLastUpdated(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:scsrisk-toggle', onToggle);
    return () => window.removeEventListener('jarvis:scsrisk-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyAlarmedCount  = rows.filter(r => r.state === 'FULLY ALARMED').length;
  const svcBackedCount     = rows.filter(r => r.state === 'SVC-BACKED').length;
  const riskTriggeredCount = rows.filter(r => r.state === 'RISK-TRIGGERED').length;
  const clearCount         = rows.filter(r => r.state === 'CLEAR').length;

  const visible = rows.filter(row => {
    if (filter !== 'ALL' && row.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!row.label.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const assess = async (row) => {
    const id = row.label;
    setAssessing(id);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const svcNames = row.leftMatched.slice(0, 2).map(m => m.item.name ?? m.item.id ?? '?').join(', ');
      const riskNames = row.rightMatched.slice(0, 2).map(m => m.item.title ?? m.item.name ?? m.item.id ?? '?').join(', ');
      const stateDesc = row.state === 'FULLY ALARMED'
        ? `has both system service backing (${svcNames || 'found'}) AND active risk signals (${riskNames || 'found'}) — scene infrastructure is live and threat-flagged`
        : row.state === 'SVC-BACKED'
          ? `has system service backing (${svcNames || 'found'}) but no active risk signals — infrastructure coverage with no current threat alignment`
          : row.state === 'RISK-TRIGGERED'
            ? `has active risk signals (${riskNames || 'found'}) but no system service coverage — threat context without infrastructure monitoring`
            : 'has no system service or risk signal alignment — scene is clear on both infrastructure and threat dimensions';
      const prompt = `Cinematic scene "${id}" ${stateDesc}. In exactly 2 sentences, assess the operational readiness and threat exposure of this scene.`;
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
      position: 'fixed', left: 793280, bottom: 8, zIndex: 445,
      width: 560, maxHeight: '82vh',
      background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#f87171', letterSpacing: 2, fontWeight: 700, flex: 1 }}>◈ SCSRISK — SCENE × SYSTEM STATUS × RISK SIGNAL</span>
        {fullyAlarmedCount > 0 && (
          <span style={{ background: '#ef4444', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{fullyAlarmedCount} ALARMED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Scenes',         val: rows.length },
          { label: 'Live Services',  val: services.length },
          { label: 'Risk Signals',   val: risks.length },
          { label: 'Fully Alarmed',  val: fullyAlarmedCount,  color: '#ef4444' },
          { label: 'SVC-Backed',     val: svcBackedCount,     color: '#22d3ee' },
          { label: 'Risk-Triggered', val: riskTriggeredCount, color: '#f97316' },
          { label: 'Clear',          val: clearCount,          color: '#6b7280' },
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
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', display: 'flex' }}>
            <div style={{ height: '100%', width: `${Math.round((fullyAlarmedCount / rows.length) * 100)}%`, background: '#ef4444', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((svcBackedCount / rows.length) * 100)}%`, background: '#22d3ee', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((riskTriggeredCount / rows.length) * 100)}%`, background: '#f97316', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {rows.length ? Math.round((clearCount / rows.length) * 100) : 0}% clear · {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FULLY ALARMED', 'SVC-BACKED', 'RISK-TRIGGERED', 'CLEAR'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#4ade80') : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700,
            color: filter === f ? (f === 'CLEAR' ? '#fff' : '#000') : '#aaa',
            cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search scenes…"
          style={{ flex: 1, minWidth: 100, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
        />
      </div>

      {/* Row list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>no scenes match</div>
        )}
        {visible.map((row, i) => {
          const id = row.label;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, minWidth: 18 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>{id}</span>
                <span style={{ fontSize: 10, color: STATE_COLOR[row.state] ?? '#888', fontWeight: 700, letterSpacing: 1 }}>{row.state}</span>
                <span style={{ fontSize: 10, color: '#555' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 10px 10px' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing === id}
                    style={{ background: assessing === id ? '#444' : 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 4, color: '#f87171', fontSize: 10, padding: '3px 10px', cursor: assessing === id ? 'not-allowed' : 'pointer', marginBottom: 8 }}
                  >
                    {assessing === id ? 'ASSESSING…' : '▶ ASSESS'}
                  </button>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {/* Left pane: Live Services */}
                    <div>
                      <div style={{ fontSize: 10, color: '#22d3ee', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>LIVE SERVICES ({row.leftMatched.length})</div>
                      {row.leftMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no service matches</div>
                      ) : row.leftMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.id ?? m.item.service ?? `svc-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#67e8f9' }}>{n}</span>
                              {m.item.status && (
                                <span style={{ fontSize: 9, color: '#22d3ee', background: 'rgba(34,211,238,0.12)', borderRadius: 3, padding: '1px 4px' }}>{m.item.status}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#22d3ee', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#22d3ee', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right pane: Risk Signals */}
                    <div>
                      <div style={{ fontSize: 10, color: '#fb923c', marginBottom: 5, letterSpacing: 1, fontWeight: 700 }}>RISK SIGNALS ({row.rightMatched.length})</div>
                      {row.rightMatched.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no risk signal matches</div>
                      ) : row.rightMatched.slice(0, 4).map((m, mi) => {
                        const n = m.item.title ?? m.item.name ?? m.item.id ?? `risk-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#fdba74' }}>{n}</span>
                              {m.item.severity && (
                                <span style={{ fontSize: 9, color: '#f97316', background: 'rgba(249,115,22,0.12)', borderRadius: 3, padding: '1px 4px' }}>{m.item.severity}</span>
                              )}
                              <span style={{ fontSize: 10, color: '#fb923c', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#f97316', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
