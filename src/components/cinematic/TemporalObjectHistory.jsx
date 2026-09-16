import { useState, useEffect, useCallback } from 'react';

const API = '';
const TOBJ_RE = /\b(temporal[._-]?history|object[._-]?history|tobj|time[._-]?travel|object[._-]?timeline|property[._-]?history|what[._-]?changed|object[._-]?changes|temporal[._-]?object|bitemporal|property[._-]?timeline|when[._-]?did[._-]?this[._-]?change|temporal[._-]?facts|fact[._-]?history|object[._-]?facts)\b/i;

export function isTobjQuery(t) {
  return TOBJ_RE.test(t || '');
}

export async function buildTobjScript() {
  try {
    const r = await fetch(`${API}/v1/ontology/objects?limit=10`).then(r => r.json());
    const items = Array.isArray(r?.items) ? r.items : [];
    const total = r?.total ?? r?.count ?? items.length;
    if (items.length === 0) {
      return 'Temporal Object History: no ontology objects to scan yet.';
    }
    const first = items[0];
    const oid = first?.id || first?.object_id || '';
    if (!oid) return `Temporal Object History: ${total} objects available for temporal inspection.`;
    const h = await fetch(`${API}/v1/jarvis/temporal/history/${encodeURIComponent(oid)}?limit=20`).then(r => r.json());
    const facts = Array.isArray(h?.history) ? h.history : [];
    const props = [...new Set(facts.map(f => f.prop || '?'))];
    const actor = facts[0]?.actor || 'unknown';
    return (
      `Temporal Object History: ${total} objects tracked. Object "${oid}" has ${facts.length} temporal facts across ${props.length} properties. ` +
      `Last recorded by actor "${actor}".`
    );
  } catch {
    return 'Temporal Object History: unable to reach the temporal endpoint.';
  }
}

function fmtAge(ms) {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  if (diff < 0) return 'future';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtTs(ms) {
  if (!ms) return '—';
  try {
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
  } catch {
    return String(ms);
  }
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };
const ACCENT = '#a78bfa';

export default function TemporalObjectHistory() {
  const [open, setOpen] = useState(false);
  const [objects, setObjects] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [history, setHistory] = useState([]);
  const [asOfProps, setAsOfProps] = useState(null);
  const [loading, setLoading] = useState(false);
  const [histLoading, setHistLoading] = useState(false);
  const [asOfLoading, setAsOfLoading] = useState(false);
  const [snapStatus, setSnapStatus] = useState('');
  const [snapping, setSnapping] = useState(false);
  const [tab, setTab] = useState('HISTORY');
  const [propFilter, setPropFilter] = useState('');
  const [asOfMs, setAsOfMs] = useState('');
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');

  const loadObjects = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/v1/ontology/objects?limit=100`).then(r => r.json());
      const items = Array.isArray(r?.items) ? r.items : [];
      setObjects(items);
      if (items.length > 0 && !selectedId) {
        const first = items[0];
        setSelectedId(first?.id || first?.object_id || '');
      }
    } catch {
      /* silent — badge will show dim */
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const loadHistory = useCallback(async (oid) => {
    if (!oid) return;
    setHistLoading(true);
    try {
      const r = await fetch(`${API}/v1/jarvis/temporal/history/${encodeURIComponent(oid)}?limit=50`).then(r => r.json());
      setHistory(Array.isArray(r?.history) ? r.history : []);
    } catch {
      setHistory([]);
    } finally {
      setHistLoading(false);
    }
  }, []);

  const loadAsOf = useCallback(async (oid, ms) => {
    if (!oid) return;
    setAsOfLoading(true);
    try {
      const q = ms ? `?valid_time=${ms}` : '';
      const r = await fetch(`${API}/v1/jarvis/temporal/as-of/${encodeURIComponent(oid)}${q}`).then(r => r.json());
      setAsOfProps(r?.props || {});
    } catch {
      setAsOfProps({});
    } finally {
      setAsOfLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:tobj-toggle', h);
    return () => window.removeEventListener('jarvis:tobj-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    loadObjects();
    const id = setInterval(loadObjects, 120_000);
    return () => clearInterval(id);
  }, [open, loadObjects]);

  useEffect(() => {
    if (!open || !selectedId) return;
    loadHistory(selectedId);
    if (tab === 'AS-OF') loadAsOf(selectedId, asOfMs ? Number(asOfMs) : undefined);
  }, [open, selectedId, tab, loadHistory, loadAsOf, asOfMs]);

  const selectObject = (oid) => {
    setSelectedId(oid);
    setHistory([]);
    setAsOfProps(null);
    setSnapStatus('');
    loadHistory(oid);
    if (tab === 'AS-OF') loadAsOf(oid, asOfMs ? Number(asOfMs) : undefined);
  };

  const snapshot = async () => {
    if (!selectedId) return;
    setSnapping(true);
    setSnapStatus('');
    try {
      const r = await fetch(`${API}/v1/jarvis/temporal/snapshot/${encodeURIComponent(selectedId)}`, {
        method: 'POST',
        headers: { Authorization: 'Bearer dev-key' },
      }).then(r => r.json());
      const n = r?.facts ?? 0;
      setSnapStatus(r?.status === 'snapshotted' ? `✓ Snapshotted ${n} facts` : (r?.status || 'done'));
      if (r?.status === 'snapshotted') loadHistory(selectedId);
    } catch (e) {
      setSnapStatus(`Error: ${e.message}`);
    } finally {
      setSnapping(false);
    }
  };

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const uniqProps = [...new Set(history.map(f => f.prop || '?'))];
    const actors = [...new Set(history.map(f => f.actor || ''))].slice(0, 3).join(', ');
    const prompt =
      `Temporal Object History for object "${selectedId}": ${history.length} recorded facts across ` +
      `${uniqProps.length} properties (${uniqProps.slice(0, 5).join(', ')}). Actors: ${actors || 'unknown'}. ` +
      `Give a 2-sentence temporal data coverage brief.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      }).then(r => r.json());
      const txt = r?.response || r?.answer || r?.message || r?.content || JSON.stringify(r);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const totalFacts = history.length;
  const uniqProps = [...new Set(history.map(f => f.prop || '?'))];
  const latestActor = history[0]?.actor || '—';
  const badgeColor = totalFacts > 0 ? ACCENT : '#475569';

  const visibleHistory = history.filter(f => {
    if (!propFilter) return true;
    return (f.prop || '').toLowerCase().includes(propFilter.toLowerCase());
  });

  const asOfEntries = Object.entries(asOfProps || {});

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Temporal Object History Browser"
        style={{
          position: 'fixed',
          left: 433920,
          bottom: 8,
          zIndex: 188,
          background: 'rgba(15,23,42,0.85)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          color: '#e2e8f0',
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          letterSpacing: 1,
        }}
      >
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: badgeColor,
          boxShadow: totalFacts > 0 ? `0 0 6px ${badgeColor}` : 'none',
          display: 'inline-block',
        }} />
        TOBJ
        {totalFacts > 0 && (
          <span style={{ background: badgeColor, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {totalFacts}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 620,
          maxHeight: '84vh',
          overflowY: 'auto',
          background: 'rgba(10,15,30,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          zIndex: 9600,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: ACCENT }}>◷ TEMPORAL OBJECT HISTORY</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing || !selectedId}
                style={{ background: `${ACCENT}18`, border: `1px solid ${ACCENT}44`, borderRadius: 6, color: ACCENT, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button
                onClick={snapshot}
                disabled={snapping || !selectedId}
                title="Snapshot current ontology props as temporal facts"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#94a3b8', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {snapping ? '...' : '◉ SNAP'}
              </button>
              <button onClick={() => { loadObjects(); loadHistory(selectedId); }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#94a3b8', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}>
                ↺
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          {/* Object picker */}
          <div style={{ padding: '10px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>OBJECT:</span>
            <select
              value={selectedId}
              onChange={e => selectObject(e.target.value)}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6,
                color: '#e2e8f0',
                padding: '4px 8px',
                fontSize: 11,
                outline: 'none',
              }}
            >
              {objects.length === 0 && <option value="">— no objects —</option>}
              {objects.map(o => {
                const oid = o?.id || o?.object_id || '?';
                const lbl = o?.label || o?.title || o?.name || oid;
                return <option key={oid} value={oid}>{lbl} ({oid})</option>;
              })}
            </select>
            {loading && <span style={{ fontSize: 10, color: '#64748b' }}>loading…</span>}
          </div>

          {snapStatus && (
            <div style={{ margin: '6px 16px 0', padding: '5px 10px', background: snapStatus.startsWith('Error') ? 'rgba(239,68,68,0.08)' : `${ACCENT}0d`, border: `1px solid ${snapStatus.startsWith('Error') ? '#ef4444' : ACCENT}33`, borderRadius: 6, fontSize: 11, color: snapStatus.startsWith('Error') ? '#ef4444' : '#c4b5fd' }}>
              {snapStatus}
            </div>
          )}

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'OBJECTS', val: objects.length, color: ACCENT },
              { label: 'HISTORY EVENTS', val: totalFacts, color: totalFacts > 0 ? ACCENT : '#475569' },
              { label: 'PROPS TRACKED', val: uniqProps.length, color: uniqProps.length > 0 ? '#60a5fa' : '#475569' },
              { label: 'LATEST ACTOR', val: latestActor, color: '#22c55e', small: true },
            ].map(({ label, val, color, small }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: small ? 11 : 18, fontWeight: 700, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Assessment block */}
          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: `${ACCENT}0d`, border: `1px solid ${ACCENT}33`, borderRadius: 8, fontSize: 12, color: '#c4b5fd', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          {/* Tab switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['HISTORY', 'AS-OF'].map(t => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  if (t === 'AS-OF' && selectedId) loadAsOf(selectedId, asOfMs ? Number(asOfMs) : undefined);
                }}
                style={{
                  background: tab === t ? `${ACCENT}22` : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? `${ACCENT}66` : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? ACCENT : '#94a3b8',
                  padding: '3px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: tab === t ? 700 : 400,
                }}
              >
                {t}
              </button>
            ))}
            {tab === 'HISTORY' && (
              <input
                value={propFilter}
                onChange={e => setPropFilter(e.target.value)}
                placeholder="Filter by property…"
                style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
              />
            )}
            {tab === 'AS-OF' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                <span style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap' }}>valid_time (ms):</span>
                <input
                  value={asOfMs}
                  onChange={e => setAsOfMs(e.target.value)}
                  placeholder="leave blank for now"
                  style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none' }}
                />
                <button
                  onClick={() => selectedId && loadAsOf(selectedId, asOfMs ? Number(asOfMs) : undefined)}
                  style={{ background: `${ACCENT}18`, border: `1px solid ${ACCENT}44`, borderRadius: 6, color: ACCENT, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
                >
                  GO
                </button>
              </div>
            )}
          </div>

          {/* HISTORY TAB */}
          {tab === 'HISTORY' && (
            <div>
              {histLoading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading history…</div>}
              {!histLoading && visibleHistory.length === 0 && (
                <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>
                  {selectedId ? 'No temporal facts recorded for this object yet. Use ◉ SNAP to snapshot current props.' : 'Select an object above.'}
                </div>
              )}
              {visibleHistory.map((f, i) => {
                const propColor = '#60a5fa';
                const actorColor = f.actor === 'system' ? '#64748b' : '#22c55e';
                const src = f.source || '';
                return (
                  <div key={f.id ?? i} style={ROW}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ ...PILL, background: `${propColor}18`, color: propColor, border: `1px solid ${propColor}44` }}>
                        {f.prop || '?'}
                      </span>
                      <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {String(f.value ?? '').slice(0, 80)}{String(f.value ?? '').length > 80 ? '…' : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: '#64748b' }}>valid: {fmtTs(f.valid_from)}</span>
                      <span style={{ fontSize: 10, color: '#475569' }}>tx: {fmtTs(f.tx_time)}</span>
                      <span style={{ fontSize: 10, color: '#475569' }}>({fmtAge(f.tx_time)})</span>
                      <span style={{ ...PILL, background: `${actorColor}14`, color: actorColor, border: `1px solid ${actorColor}33`, marginRight: 0 }}>
                        {f.actor || 'system'}
                      </span>
                      {src && <span style={{ fontSize: 10, color: '#475569' }}>src:{src}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* AS-OF TAB */}
          {tab === 'AS-OF' && (
            <div>
              {asOfLoading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading point-in-time state…</div>}
              {!asOfLoading && asOfProps !== null && asOfEntries.length === 0 && (
                <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No bitemporal state found for this object at the specified time.</div>
              )}
              {!asOfLoading && asOfEntries.length > 0 && (
                <div>
                  <div style={{ padding: '6px 16px 4px', fontSize: 10, color: '#64748b' }}>
                    Object state at valid_time={asOfMs || 'now'} as known now
                  </div>
                  {asOfEntries.map(([prop, value]) => (
                    <div key={prop} style={ROW}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ ...PILL, background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)' }}>
                          {prop}
                        </span>
                        <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {String(value).slice(0, 120)}{String(value).length > 120 ? '…' : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!asOfLoading && asOfProps === null && (
                <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>Select an object and hit GO to reconstruct its state at a point in time.</div>
              )}
            </div>
          )}

          {/* Footer */}
          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {tab === 'HISTORY'
              ? `${visibleHistory.length} of ${totalFacts} facts · ${uniqProps.length} props · GET /v1/jarvis/temporal/history · auto-refresh 120s`
              : `AS-OF view · GET /v1/jarvis/temporal/as-of · POST /v1/jarvis/temporal/snapshot`}
          </div>
        </div>
      )}
    </>
  );
}
