import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const OESRTRI_RE = /\b(oesrtri|ops\s+event\s+scenario\s+report|unaddressed\s+ops\s+event|scenario\s+backed\s+ops(?:\s+event)?|report\s+tagged\s+ops(?:\s+event)?|ops\s+event\s+coverage\s+triple|ops\s+triple\s+coverage)\b/i;

export function isOesrtriQuery(t) { return OESRTRI_RE.test(t || ''); }

export async function buildOesrtriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [oeR, scnR, rptR] = await Promise.allSettled([
    fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/reports`, { headers: hdr }).then(r => r.json()),
  ]);
  const oeRaw = oeR.value ?? {};
  const events = Array.isArray(oeRaw) ? oeRaw : (oeRaw.events ?? oeRaw.data ?? oeRaw.results ?? []);
  const scnRaw = scnR.value ?? {};
  const scenarios = Array.isArray(scnRaw) ? scnRaw : (scnRaw.scenarios ?? scnRaw.data ?? scnRaw.results ?? []);
  const rptRaw = rptR.value ?? {};
  const reports = Array.isArray(rptRaw) ? rptRaw : (rptRaw.reports ?? rptRaw.data ?? rptRaw.results ?? []);

  const scnBlob = scenarios.map(s => `${s.name ?? s.title ?? s.id ?? ''} ${s.description ?? ''}`.toLowerCase()).join(' ');
  const rptBlob = reports.map(r => `${r.name ?? r.title ?? r.id ?? ''} ${r.description ?? ''} ${r.type ?? ''}`.toLowerCase()).join(' ');

  let fullyCovered = 0, scenBacked = 0, rptTagged = 0, unaddressed = 0;
  for (const ev of events) {
    const text = `${ev.name ?? ev.title ?? ev.id ?? ''} ${ev.description ?? ''} ${ev.type ?? ''} ${ev.severity ?? ''}`.toLowerCase();
    const tokens = text.split(/\W+/).filter(t => t.length > 2);
    const hasScn = tokens.some(tok => scnBlob.includes(tok));
    const hasRpt = tokens.some(tok => rptBlob.includes(tok));
    if (hasScn && hasRpt) fullyCovered++;
    else if (hasScn) scenBacked++;
    else if (hasRpt) rptTagged++;
    else unaddressed++;
  }
  return `OESRTRI Ops Event × Scenario × Report Triple: ${events.length} ops events assessed against ${scenarios.length} scenarios and ${reports.length} reports. ` +
    `FULLY COVERED: ${fullyCovered} (scenario + report). ` +
    `SCENARIO-BACKED: ${scenBacked}. REPORT-TAGGED: ${rptTagged}. ` +
    `UNADDRESSED: ${unaddressed} (no scenario or report coverage — operational gap).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 80, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY COVERED': '#34d399',
  'SCENARIO-BACKED': '#a78bfa',
  'REPORT-TAGGED': '#f59e0b',
  UNADDRESSED: '#ef4444',
};

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreAgainst(event, items, nameFields) {
  const text = `${event.name ?? event.title ?? event.id ?? ''} ${event.description ?? ''} ${event.type ?? ''} ${event.severity ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const item of items) {
    const itext = nameFields.map(f => `${item[f] ?? ''}`).join(' ').toLowerCase();
    const hits = tokens.filter(tok => itext.includes(tok));
    if (hits.length > 0) matched.push({ item, score: Math.min(100, hits.length * 30) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function classifyEvent(event, scenarios, reports) {
  const text = `${event.name ?? event.title ?? event.id ?? ''} ${event.description ?? ''} ${event.type ?? ''} ${event.severity ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const scnBlob = scenarios.map(s => `${s.name ?? s.title ?? s.id ?? ''} ${s.description ?? ''}`.toLowerCase()).join(' ');
  const rptBlob = reports.map(r => `${r.name ?? r.title ?? r.id ?? ''} ${r.description ?? ''} ${r.type ?? ''}`.toLowerCase()).join(' ');
  const hasScn = tokens.some(tok => scnBlob.includes(tok));
  const hasRpt = tokens.some(tok => rptBlob.includes(tok));
  if (hasScn && hasRpt) return 'FULLY COVERED';
  if (hasScn) return 'SCENARIO-BACKED';
  if (hasRpt) return 'REPORT-TAGGED';
  return 'UNADDRESSED';
}

export default function OpsEventScenarioReportTriple() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [reports, setReports] = useState([]);
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
      const [oeR, scnR, rptR] = await Promise.allSettled([
        fetch(`${API}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/reports`, { headers: hdr }).then(r => r.json()),
      ]);
      const oeRaw = oeR.value ?? {};
      const evs = Array.isArray(oeRaw) ? oeRaw : (oeRaw.events ?? oeRaw.data ?? oeRaw.results ?? []);
      const scnRaw = scnR.value ?? {};
      const scns = Array.isArray(scnRaw) ? scnRaw : (scnRaw.scenarios ?? scnRaw.data ?? scnRaw.results ?? []);
      const rptRaw = rptR.value ?? {};
      const rpts = Array.isArray(rptRaw) ? rptRaw : (rptRaw.reports ?? rptRaw.data ?? rptRaw.results ?? []);
      setEvents(evs);
      setScenarios(scns);
      setReports(rpts);
      setRows(evs.map(ev => ({
        ev,
        state: classifyEvent(ev, scns, rpts),
        matchedScenarios: scoreAgainst(ev, scns, ['name', 'title', 'id', 'description', 'tags']),
        matchedReports: scoreAgainst(ev, rpts, ['name', 'title', 'id', 'description', 'type', 'category']),
      })));
      setLastUpdated(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:oesrtri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:oesrtri-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 60000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyCoveredCount = rows.filter(r => r.state === 'FULLY COVERED').length;
  const scenBackedCount = rows.filter(r => r.state === 'SCENARIO-BACKED').length;
  const rptTaggedCount = rows.filter(r => r.state === 'REPORT-TAGGED').length;
  const unaddressedCount = rows.filter(r => r.state === 'UNADDRESSED').length;

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = `${r.ev.name ?? r.ev.title ?? r.ev.id ?? ''} ${r.ev.type ?? ''} ${r.ev.severity ?? ''}`.toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });

  const assess = async (row) => {
    const id = row.ev.name ?? row.ev.title ?? row.ev.id ?? 'event';
    setAssessing(id);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const scnNames = row.matchedScenarios.slice(0, 2).map(m => m.item.name ?? m.item.title ?? m.item.id ?? '?').join(', ');
      const rptNames = row.matchedReports.slice(0, 2).map(m => m.item.name ?? m.item.title ?? m.item.id ?? '?').join(', ');
      const stateDesc = row.state === 'FULLY COVERED'
        ? `is fully covered by scenarios (${scnNames || 'found'}) and reports (${rptNames || 'found'})`
        : row.state === 'SCENARIO-BACKED'
        ? `is backed by scenarios (${scnNames || 'found'}) but has no report coverage`
        : row.state === 'REPORT-TAGGED'
        ? `is tagged in reports (${rptNames || 'found'}) but has no scenario plan`
        : 'is UNADDRESSED — no scenario plan or report coverage exists';
      const prompt = `Ops event "${id}" ${stateDesc}. In exactly 2 sentences, assess the coverage risk for this operational event.`;
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
      position: 'fixed', left: 784880, bottom: 8, zIndex: 430,
      width: 560, maxHeight: '82vh',
      background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(52,211,153,0.22)',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#34d399', letterSpacing: 2, fontWeight: 700, flex: 1 }}>◈ OESRTRI — OPS EVENT × SCENARIO × REPORT</span>
        {unaddressedCount > 0 && (
          <span style={{ background: '#ef4444', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{unaddressedCount} UNADDRESSED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Events', val: events.length },
          { label: 'Fully Covered', val: fullyCoveredCount, color: '#34d399' },
          { label: 'Scen-Backed', val: scenBackedCount, color: '#a78bfa' },
          { label: 'Rpt-Tagged', val: rptTaggedCount, color: '#f59e0b' },
          { label: 'Unaddressed', val: unaddressedCount, color: '#ef4444' },
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
            <div style={{ height: '100%', width: `${Math.round((fullyCoveredCount / rows.length) * 100)}%`, background: '#34d399', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((scenBackedCount / rows.length) * 100)}%`, background: '#a78bfa', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${Math.round((rptTaggedCount / rows.length) * 100)}%`, background: '#f59e0b', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {rows.length ? Math.round((fullyCoveredCount / rows.length) * 100) : 0}% fully covered · {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FULLY COVERED', 'SCENARIO-BACKED', 'REPORT-TAGGED', 'UNADDRESSED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#34d399') : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700,
            color: filter === f ? (f === 'FULLY COVERED' || f === 'ALL' ? '#000' : f === 'UNADDRESSED' ? '#fff' : '#fff') : '#aaa',
            cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search events…"
          style={{ flex: 1, minWidth: 100, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
        />
      </div>

      {/* Row list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>no ops events match</div>
        )}
        {visible.map((row, i) => {
          const id = row.ev.name ?? row.ev.title ?? row.ev.id ?? `ev-${i}`;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>{id}</span>
                {row.ev.type && (
                  <span style={{ fontSize: 10, color: '#94a3b8', background: 'rgba(148,163,184,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.ev.type}</span>
                )}
                {row.ev.severity && (
                  <span style={{ fontSize: 10, color: '#64748b', background: 'rgba(100,116,139,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.ev.severity}</span>
                )}
                <span style={{ fontSize: 10, color: STATE_COLOR[row.state] ?? '#888', fontWeight: 700, letterSpacing: 1 }}>{row.state}</span>
                <span style={{ fontSize: 10, color: '#555' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 10px 10px' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing === id}
                    style={{ background: assessing === id ? '#444' : 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 4, color: '#34d399', fontSize: 10, padding: '3px 10px', cursor: assessing === id ? 'not-allowed' : 'pointer', marginBottom: 8 }}
                  >
                    {assessing === id ? 'ASSESSING…' : '▶ ASSESS'}
                  </button>

                  <div style={{ display: 'flex', gap: 10 }}>
                    {/* Left: matched scenarios */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: '#a78bfa', marginBottom: 6, letterSpacing: 1, fontWeight: 700 }}>
                        SCENARIOS ({row.matchedScenarios.length})
                      </div>
                      {row.matchedScenarios.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no scenario match — planning gap</div>
                      ) : row.matchedScenarios.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.title ?? m.item.id ?? `scn-${mi}`;
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                              <span style={{ fontSize: 10, color: '#c4b5fd', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{n}</span>
                              <span style={{ fontSize: 10, color: '#a78bfa', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#a78bfa', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right: matched reports */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: '#f59e0b', marginBottom: 6, letterSpacing: 1, fontWeight: 700 }}>
                        REPORTS ({row.matchedReports.length})
                      </div>
                      {row.matchedReports.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no report match — documentation gap</div>
                      ) : row.matchedReports.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.title ?? m.item.id ?? `rpt-${mi}`;
                        const type = m.item.type ?? m.item.category ?? '';
                        return (
                          <div key={mi} style={{ marginBottom: 5 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                              <span style={{ fontSize: 10, color: '#fde68a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{n}</span>
                              {type && <span style={{ fontSize: 9, color: '#b45309', background: 'rgba(180,83,9,0.15)', borderRadius: 2, padding: '0 3px', marginRight: 4 }}>{type}</span>}
                              <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#f59e0b', borderRadius: 2 }} />
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
