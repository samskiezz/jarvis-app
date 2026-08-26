import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const ISCTRI_RE = /\b(isctri|invest\s+scenario\s+report|investment\s+scenario\s+report|investment\s+plan\s+report|invest\s+plan\s+report|blind\s+invest\s+scenario|invest\s+scenario\s+coverage|investment\s+scenario\s+triple|invest\s+scen\s+report|investment\s+unplanned\s+report|invest\s+triple\s+governance)\b/i;

export function isIsctriQuery(t) { return ISCTRI_RE.test(t || ''); }

export async function buildIsctriScript() {
  const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
  const hdr = { Authorization: `Bearer ${key}` };
  const [invR, scnR, rptR] = await Promise.allSettled([
    fetch(`${API}/entities/Investment`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
    fetch(`${API}/v1/reports`, { headers: hdr }).then(r => r.json()),
  ]);

  const invRaw = invR.value ?? {};
  const investments = Array.isArray(invRaw) ? invRaw : (invRaw.investments ?? invRaw.data ?? invRaw.results ?? []);

  const scnRaw = scnR.value ?? {};
  const scenarios = Array.isArray(scnRaw) ? scnRaw : (scnRaw.scenarios ?? scnRaw.data ?? scnRaw.results ?? []);

  const rptRaw = rptR.value ?? {};
  const reports = Array.isArray(rptRaw) ? rptRaw : (rptRaw.reports ?? rptRaw.data ?? rptRaw.results ?? []);

  const scnCorpus = scenarios.map(s => `${s.name ?? s.title ?? s.id ?? ''} ${s.description ?? ''} ${s.category ?? ''} ${s.type ?? ''}`.toLowerCase()).join(' ');
  const rptCorpus = reports.map(r => `${r.name ?? r.title ?? r.id ?? ''} ${r.description ?? ''} ${r.type ?? ''} ${r.category ?? ''}`.toLowerCase()).join(' ');

  let fullyCovered = 0, scenPlanned = 0, rptTagged = 0, blind = 0;
  for (const inv of investments) {
    const text = `${inv.name ?? inv.title ?? inv.id ?? ''} ${inv.description ?? ''} ${inv.category ?? ''} ${inv.ticker ?? ''} ${inv.type ?? ''}`.toLowerCase();
    const tokens = text.split(/\W+/).filter(t => t.length > 2);
    const hasScn = tokens.some(tok => scnCorpus.includes(tok));
    const hasRpt = tokens.some(tok => rptCorpus.includes(tok));
    if (hasScn && hasRpt) fullyCovered++;
    else if (hasScn) scenPlanned++;
    else if (hasRpt) rptTagged++;
    else blind++;
  }

  return `ISCTRI Investment × Scenario × Report Coverage: ${investments.length} investments assessed against ${scenarios.length} scenarios and ${reports.length} reports. ` +
    `FULLY COVERED: ${fullyCovered} (scenario plan + report — governance complete). ` +
    `SCENARIO-PLANNED: ${scenPlanned} (response plan found, no report — undocumented). ` +
    `REPORT-TAGGED: ${rptTagged} (report found, no scenario — planning gap). ` +
    `BLIND: ${blind} (no scenario or report coverage — governance gap requiring immediate attention).`;
}

const TILE = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '8px 12px', minWidth: 80, textAlign: 'center' };
const LABEL = { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY COVERED': '#22c55e',
  'SCENARIO-PLANNED': '#8b5cf6',
  'REPORT-TAGGED': '#f59e0b',
  BLIND: '#f97316',
};

function tokenize(text) {
  return `${text}`.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreAgainst(inv, items, fields) {
  const text = `${inv.name ?? inv.title ?? inv.id ?? ''} ${inv.description ?? ''} ${inv.category ?? ''} ${inv.ticker ?? ''} ${inv.type ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const matched = [];
  for (const item of items) {
    const itemText = fields.map(f => `${item[f] ?? ''}`).join(' ').toLowerCase();
    const hits = tokens.filter(tok => itemText.includes(tok));
    if (hits.length > 0) matched.push({ item, score: Math.min(100, hits.length * 30) });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function classify(inv, scenarios, reports) {
  const text = `${inv.name ?? inv.title ?? inv.id ?? ''} ${inv.description ?? ''} ${inv.category ?? ''} ${inv.ticker ?? ''} ${inv.type ?? ''}`.toLowerCase();
  const tokens = tokenize(text);
  const scnCorpus = scenarios.map(s => `${s.name ?? s.title ?? s.id ?? ''} ${s.description ?? ''} ${s.category ?? ''} ${s.type ?? ''}`.toLowerCase()).join(' ');
  const rptCorpus = reports.map(r => `${r.name ?? r.title ?? r.id ?? ''} ${r.description ?? ''} ${r.type ?? ''} ${r.category ?? ''}`.toLowerCase()).join(' ');
  const hasScn = tokens.some(tok => scnCorpus.includes(tok));
  const hasRpt = tokens.some(tok => rptCorpus.includes(tok));
  if (hasScn && hasRpt) return 'FULLY COVERED';
  if (hasScn) return 'SCENARIO-PLANNED';
  if (hasRpt) return 'REPORT-TAGGED';
  return 'BLIND';
}

export default function InvestScenarioReportTriple() {
  const [open, setOpen] = useState(false);
  const [investments, setInvestments] = useState([]);
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
      const [invR, scnR, rptR] = await Promise.allSettled([
        fetch(`${API}/entities/Investment`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.json()),
        fetch(`${API}/v1/reports`, { headers: hdr }).then(r => r.json()),
      ]);
      const invRaw = invR.value ?? {};
      const invs = Array.isArray(invRaw) ? invRaw : (invRaw.investments ?? invRaw.data ?? invRaw.results ?? []);
      const scnRaw = scnR.value ?? {};
      const scns = Array.isArray(scnRaw) ? scnRaw : (scnRaw.scenarios ?? scnRaw.data ?? scnRaw.results ?? []);
      const rptRaw = rptR.value ?? {};
      const rpts = Array.isArray(rptRaw) ? rptRaw : (rptRaw.reports ?? rptRaw.data ?? rptRaw.results ?? []);
      setInvestments(invs);
      setScenarios(scns);
      setReports(rpts);
      setRows(invs.map(inv => ({
        inv,
        state: classify(inv, scns, rpts),
        matchedScn: scoreAgainst(inv, scns, ['name', 'title', 'id', 'description', 'category', 'type']),
        matchedRpt: scoreAgainst(inv, rpts, ['name', 'title', 'id', 'description', 'type', 'category']),
      })));
      setLastUpdated(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:isctri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:isctri-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    'FULLY COVERED': rows.filter(r => r.state === 'FULLY COVERED').length,
    'SCENARIO-PLANNED': rows.filter(r => r.state === 'SCENARIO-PLANNED').length,
    'REPORT-TAGGED': rows.filter(r => r.state === 'REPORT-TAGGED').length,
    'BLIND': rows.filter(r => r.state === 'BLIND').length,
  };

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = `${r.inv.name ?? r.inv.title ?? r.inv.id ?? ''} ${r.inv.category ?? ''} ${r.inv.ticker ?? ''}`.toLowerCase();
      if (!name.includes(q)) return false;
    }
    return true;
  });

  const assess = async (row) => {
    const id = row.inv.name ?? row.inv.title ?? row.inv.id ?? 'investment';
    setAssessing(id);
    try {
      const key = localStorage.getItem('jarvis_api_key') || 'dev-key';
      const scnNames = row.matchedScn.slice(0, 2).map(m => m.item.name ?? m.item.title ?? m.item.id ?? '?').join(', ');
      const rptNames = row.matchedRpt.slice(0, 2).map(m => m.item.name ?? m.item.title ?? m.item.id ?? '?').join(', ');
      const stateDesc = row.state === 'FULLY COVERED'
        ? `is FULLY COVERED with scenario plan(s) (${scnNames || 'found'}) and report(s) (${rptNames || 'found'})`
        : row.state === 'SCENARIO-PLANNED'
          ? `has a SCENARIO PLAN (${scnNames || 'found'}) but no report documentation — undocumented response plan`
          : row.state === 'REPORT-TAGGED'
            ? `is REPORT-TAGGED (${rptNames || 'found'}) but has no scenario response plan — planning gap`
            : 'is BLIND — no scenario plan or report found — governance and documentation gap';
      const prompt = `Investment "${id}" ${stateDesc}. In exactly 2 sentences, assess the governance coverage risk and recommend immediate action.`;
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

  const blindCount = counts['BLIND'];
  const fullyCovCount = counts['FULLY COVERED'];
  const covPct = rows.length ? Math.round((fullyCovCount / rows.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 787680, bottom: 8, zIndex: 435,
      width: 540, maxHeight: '82vh',
      background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(249,115,22,0.22)',
      borderRadius: 10, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#f97316', letterSpacing: 2, fontWeight: 700, flex: 1 }}>◈ ISCTRI — INVESTMENT × SCENARIO × REPORT</span>
        {blindCount > 0 && (
          <span style={{ background: '#f97316', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{blindCount} BLIND</span>
        )}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Investments', val: investments.length },
          { label: 'Scenarios', val: scenarios.length, color: '#8b5cf6' },
          { label: 'Reports', val: reports.length, color: '#f59e0b' },
          { label: 'Fully Covered', val: fullyCovCount, color: '#22c55e' },
          { label: 'Scen-Planned', val: counts['SCENARIO-PLANNED'], color: '#8b5cf6' },
          { label: 'Rpt-Tagged', val: counts['REPORT-TAGGED'], color: '#f59e0b' },
          { label: 'Blind', val: blindCount, color: '#f97316' },
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
            <div style={{ height: '100%', width: `${covPct}%`, background: '#22c55e', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${rows.length ? Math.round((counts['SCENARIO-PLANNED'] / rows.length) * 100) : 0}%`, background: '#8b5cf6', transition: 'width 0.4s' }} />
            <div style={{ height: '100%', width: `${rows.length ? Math.round((counts['REPORT-TAGGED'] / rows.length) * 100) : 0}%`, background: '#f59e0b', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
            {covPct}% fully covered · {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </div>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {['ALL', 'FULLY COVERED', 'SCENARIO-PLANNED', 'REPORT-TAGGED', 'BLIND'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] ?? '#f97316') : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700,
            color: filter === f ? '#fff' : '#aaa', cursor: 'pointer', letterSpacing: 1,
          }}>{f}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{ flex: 1, minWidth: 100, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 8px', color: '#e2e8f0', fontSize: 11, outline: 'none' }}
        />
      </div>

      {/* Row list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 10px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>no investments match</div>
        )}
        {visible.map((row, i) => {
          const id = row.inv.name ?? row.inv.title ?? row.inv.id ?? `inv-${i}`;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 4, background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ flex: 1, fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>{id}</span>
                {row.inv.ticker && (
                  <span style={{ fontSize: 10, color: '#94a3b8', background: 'rgba(148,163,184,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.inv.ticker}</span>
                )}
                {row.inv.category && (
                  <span style={{ fontSize: 10, color: '#64748b', background: 'rgba(100,116,139,0.1)', borderRadius: 3, padding: '1px 5px' }}>{row.inv.category}</span>
                )}
                <span style={{ fontSize: 10, color: STATE_COLOR[row.state] ?? '#888', fontWeight: 700, letterSpacing: 1 }}>{row.state}</span>
                <span style={{ fontSize: 10, color: '#555' }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 10px 10px' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing === id}
                    style={{ background: assessing === id ? '#444' : 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 4, color: '#f97316', fontSize: 10, padding: '3px 10px', cursor: assessing === id ? 'not-allowed' : 'pointer', marginBottom: 8 }}
                  >
                    {assessing === id ? 'ASSESSING…' : '▶ ASSESS'}
                  </button>

                  <div style={{ display: 'flex', gap: 12 }}>
                    {/* Scenarios */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: '#8b5cf6', marginBottom: 6, letterSpacing: 1, fontWeight: 700 }}>
                        SCENARIOS ({row.matchedScn.length})
                      </div>
                      {row.matchedScn.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no scenario matches</div>
                      ) : row.matchedScn.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.title ?? m.item.id ?? `scn-${mi}`;
                        const cat = m.item.category ?? m.item.type ?? '';
                        return (
                          <div key={mi} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#c4b5fd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</span>
                              {cat && <span style={{ fontSize: 9, color: '#8b5cf6', background: 'rgba(139,92,246,0.12)', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>{cat}</span>}
                              <span style={{ fontSize: 10, color: '#8b5cf6', fontWeight: 700 }}>{m.score}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                              <div style={{ height: '100%', width: `${m.score}%`, background: '#8b5cf6', borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Reports */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: '#f59e0b', marginBottom: 6, letterSpacing: 1, fontWeight: 700 }}>
                        REPORTS ({row.matchedRpt.length})
                      </div>
                      {row.matchedRpt.length === 0 ? (
                        <div style={{ color: '#555', fontSize: 10 }}>no report matches</div>
                      ) : row.matchedRpt.slice(0, 4).map((m, mi) => {
                        const n = m.item.name ?? m.item.title ?? m.item.id ?? `rpt-${mi}`;
                        const typ = m.item.type ?? m.item.category ?? '';
                        return (
                          <div key={mi} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ flex: 1, fontSize: 10, color: '#fcd34d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</span>
                              {typ && <span style={{ fontSize: 9, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>{typ}</span>}
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
