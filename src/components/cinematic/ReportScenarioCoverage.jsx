import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const RPSCN_RE = /\b(rpscn|report\s+scenario|scenario\s+report|unplanned\s+report|report\s+plan\s+coverage|report\s+plan\b|scenario\s+backed\s+report|scenario\s+coverage\s+report)\b/i;

export function isRpscnQuery(t) { return RPSCN_RE.test(t || ''); }

export async function buildRpscnScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [rptR, scnR] = await Promise.allSettled([
    fetch(`${API}/v1/reports`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
  ]);
  const rptRaw = rptR.value ?? {};
  const reports = Array.isArray(rptRaw) ? rptRaw : (rptRaw.reports ?? rptRaw.data ?? rptRaw.results ?? []);
  const scnRaw = scnR.value ?? {};
  const scenarios = Array.isArray(scnRaw) ? scnRaw : (scnRaw.scenarios ?? scnRaw.data ?? scnRaw.results ?? []);

  const scnText = scenarios.map(s => `${s.name ?? s.title ?? s.id ?? ''} ${s.description ?? ''} ${s.tags ?? ''}`.toLowerCase()).join(' ');

  let backed = 0, unplanned = 0;
  for (const rpt of reports) {
    const text = `${rpt.name ?? rpt.title ?? rpt.id ?? ''} ${rpt.description ?? ''} ${rpt.type ?? ''} ${rpt.category ?? ''} ${rpt.tags ?? ''}`.toLowerCase();
    const tokens = text.split(/\W+/).filter(t => t.length > 2);
    const has = tokens.some(tok => scnText.includes(tok));
    if (has) backed++;
    else unplanned++;
  }
  return `RPSCN Report × Scenario Coverage: ${reports.length} reports assessed against ${scenarios.length} scenario plans. ` +
    `SCENARIO-BACKED: ${backed} (at least one scenario covers this report's domain). ` +
    `UNPLANNED: ${unplanned} (no scenario coverage — planning gap).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 80, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'SCENARIO-BACKED': '#a78bfa',
  UNPLANNED: '#f59e0b',
};

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreReport(rpt, scenarios) {
  const text = `${rpt.name ?? rpt.title ?? rpt.id ?? ''} ${rpt.description ?? ''} ${rpt.type ?? ''} ${rpt.category ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const scn of scenarios) {
    const scnText = `${scn.name ?? scn.title ?? scn.id ?? ''} ${scn.description ?? ''} ${scn.tags ?? ''}`.toLowerCase();
    const hits = tokens.filter(tok => scnText.includes(tok));
    if (hits.length > 0) matched.push({ item: scn, score: Math.min(100, hits.length * 30) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function correlate(rpt, scenarios) {
  const text = `${rpt.name ?? rpt.title ?? rpt.id ?? ''} ${rpt.description ?? ''} ${rpt.type ?? ''} ${rpt.category ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const scnText = scenarios.map(s => `${s.name ?? s.title ?? s.id ?? ''} ${s.description ?? ''}`.toLowerCase()).join(' ');
  return tokens.some(tok => scnText.includes(tok)) ? 'SCENARIO-BACKED' : 'UNPLANNED';
}

export default function ReportScenarioCoverage() {
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState([]);
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
      const [rptR, scnR] = await Promise.allSettled([
        fetch(`${API}/v1/reports`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
      ]);
      const rptRaw = rptR.value ?? {};
      const rpts = Array.isArray(rptRaw) ? rptRaw : (rptRaw.reports ?? rptRaw.data ?? rptRaw.results ?? []);
      const scnRaw = scnR.value ?? {};
      const scns = Array.isArray(scnRaw) ? scnRaw : (scnRaw.scenarios ?? scnRaw.data ?? scnRaw.results ?? []);
      setReports(rpts);
      setScenarios(scns);
      setRows(rpts.map(rpt => ({
        rpt,
        state: correlate(rpt, scns),
        matched: scoreReport(rpt, scns),
      })));
      setLastUpdated(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:rpscn-toggle', onToggle);
    return () => window.removeEventListener('jarvis:rpscn-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const backedCount = rows.filter(r => r.state === 'SCENARIO-BACKED').length;
  const unplannedCount = rows.filter(r => r.state === 'UNPLANNED').length;

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = `${r.rpt.name ?? r.rpt.title ?? r.rpt.id ?? ''} ${r.rpt.type ?? ''} ${r.rpt.category ?? ''}`.toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });

  const assess = async (row) => {
    const id = row.rpt.name ?? row.rpt.title ?? row.rpt.id ?? 'report';
    setAssessing(id);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const scnNames = row.matched.slice(0, 2).map(m => m.item.name ?? m.item.title ?? m.item.id ?? '?').join(', ');
      const stateDesc = row.state === 'SCENARIO-BACKED'
        ? `is backed by at least one scenario plan (${scnNames || 'found'})`
        : 'has NO scenario coverage — planning gap';
      const prompt = `Report "${id}" ${stateDesc}. In exactly 2 sentences, assess the scenario planning coverage for this report.`;
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
      position: 'fixed', left: 784320, bottom: 8, zIndex: 429,
      width: 520, maxHeight: '82vh',
      background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(167,139,250,0.22)',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#a78bfa', letterSpacing: 2, fontWeight: 700, flex: 1 }}>◈ RPSCN — REPORT × SCENARIO COVERAGE</span>
        {unplannedCount > 0 && (
          <span style={{ background: '#f59e0b', color: '#000', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{unplannedCount} UNPLANNED</span>
        )}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Reports', val: reports.length },
          { label: 'Scenarios', val: scenarios.length, color: '#a78bfa' },
          { label: 'Scenario-Backed', val: backedCount, color: '#a78bfa' },
          { label: 'Unplanned', val: unplannedCount, color: '#f59e0b' },
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
            <div style={{ height: '100%', width: `${Math.round((backedCount / rows.length) * 100)}%`, background: '#a78bfa', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {rows.length ? Math.round((backedCount / rows.length) * 100) : 0}% scenario-backed · {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'SCENARIO-BACKED', 'UNPLANNED'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#a78bfa') : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700,
            color: filter === f ? (f === 'UNPLANNED' ? '#000' : '#fff') : '#aaa', cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search reports…"
          style={{ flex: 1, minWidth: 100, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
        />
      </div>

      {/* Row list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>no reports match</div>
        )}
        {visible.map((row, i) => {
          const id = row.rpt.name ?? row.rpt.title ?? row.rpt.id ?? `rpt-${i}`;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>{id}</span>
                {row.rpt.type && (
                  <span style={{ fontSize: 10, color: '#94a3b8', background: 'rgba(148,163,184,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.rpt.type}</span>
                )}
                {row.rpt.category && (
                  <span style={{ fontSize: 10, color: '#64748b', background: 'rgba(100,116,139,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.rpt.category}</span>
                )}
                <span style={{ fontSize: 10, color: STATE_COLOR[row.state] ?? '#888', fontWeight: 700, letterSpacing: 1 }}>{row.state}</span>
                <span style={{ fontSize: 10, color: '#555' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 10px 10px' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing === id}
                    style={{ background: assessing === id ? '#444' : 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 4, color: '#a78bfa', fontSize: 10, padding: '3px 10px', cursor: assessing === id ? 'not-allowed' : 'pointer', marginBottom: 8 }}
                  >
                    {assessing === id ? 'ASSESSING…' : '▶ ASSESS'}
                  </button>

                  <div style={{ fontSize: 10, color: '#a78bfa', marginBottom: 6, letterSpacing: 1, fontWeight: 700 }}>
                    MATCHED SCENARIOS ({row.matched.length})
                  </div>
                  {row.matched.length === 0 ? (
                    <div style={{ color: '#555', fontSize: 10 }}>no scenario matches — planning gap</div>
                  ) : row.matched.slice(0, 5).map((m, mi) => {
                    const n = m.item.name ?? m.item.title ?? m.item.id ?? `scn-${mi}`;
                    const desc = m.item.description ?? '';
                    return (
                      <div key={mi} style={{ marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                          <span style={{ flex: 1, fontSize: 10, color: '#c4b5fd' }}>{n}</span>
                          {desc && (
                            <span style={{ fontSize: 9, color: '#7c6aad', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{desc.slice(0, 30)}</span>
                          )}
                          <span style={{ fontSize: 10, color: '#a78bfa', fontWeight: 700 }}>{m.score}%</span>
                        </div>
                        <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                          <div style={{ height: '100%', width: `${m.score}%`, background: '#a78bfa', borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
