import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const API_KEY = (typeof window !== 'undefined' && (window.__JARVIS_API_KEY__ || 'dev-key')) || 'dev-key';
const POLL_MS = 90000;

const CRST_RE = /\b(crst|contact[\s_-]*report[\s_-]*scenario[\s_-]*triple|contact[\s_-]*scenario[\s_-]*report[\s_-]*triple|report[\s_-]*scenario[\s_-]*contact[\s_-]*triple|contact[\s_-]*report[\s_-]*triple|contact[\s_-]*scenario[\s_-]*triple|contact[\s_-]*triple[\s_-]*coverage|contact[\s_-]*triple[\s_-]*gap)\b/i;

export function isCrstQuery(t) { return CRST_RE.test(t || ''); }

function tok(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const bSet = new Set(bTokens);
  const hits = aTokens.filter(t => bSet.has(t)).length;
  return hits / Math.max(aTokens.length, bTokens.length);
}

const THRESHOLD = 0.08;

const COV = {
  FULLY_COVERED: 'FULLY_COVERED',
  REPORT_ONLY: 'REPORT_ONLY',
  SCENARIO_ONLY: 'SCENARIO_ONLY',
  UNCOVERED: 'UNCOVERED',
};

function classifyContact(ctTokens, reports, scenarios) {
  let bestReport = null, bestRepScore = 0;
  for (const r of reports) {
    const rt = tok([r?.title, r?.summary, r?.type, r?.domain, (r?.tags || []).join(' ')].join(' '));
    const s = matchScore(ctTokens, rt);
    if (s > bestRepScore) { bestRepScore = s; bestReport = r; }
  }
  let bestScenario = null, bestScenScore = 0;
  for (const sc of scenarios) {
    const st = tok([sc?.name, sc?.title, sc?.description, sc?.type, sc?.domain, (sc?.tags || []).join(' ')].join(' '));
    const s = matchScore(ctTokens, st);
    if (s > bestScenScore) { bestScenScore = s; bestScenario = sc; }
  }
  const hasReport = bestRepScore >= THRESHOLD;
  const hasScenario = bestScenScore >= THRESHOLD;
  let cov;
  if (hasReport && hasScenario) cov = COV.FULLY_COVERED;
  else if (hasReport) cov = COV.REPORT_ONLY;
  else if (hasScenario) cov = COV.SCENARIO_ONLY;
  else cov = COV.UNCOVERED;
  return { cov, bestReport, bestRepScore, bestScenario, bestScenScore };
}

function normaliseArray(raw, ...keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

export async function buildCrstScript() {
  try {
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [ctRes, repRes, scRes] = await Promise.allSettled([
      fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/reports`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.ok ? r.json() : []),
    ]);
    const contacts = normaliseArray(ctRes.status === 'fulfilled' ? ctRes.value : [], 'items', 'data', 'contacts');
    const reports = normaliseArray(repRes.status === 'fulfilled' ? repRes.value : [], 'reports', 'items', 'data');
    const scenarios = normaliseArray(scRes.status === 'fulfilled' ? scRes.value : [], 'scenarios', 'items', 'data');
    const counts = { [COV.FULLY_COVERED]: 0, [COV.REPORT_ONLY]: 0, [COV.SCENARIO_ONLY]: 0, [COV.UNCOVERED]: 0 };
    for (const ct of contacts) {
      const ctt = tok([ct?.name, ct?.role, ct?.email, ct?.department, ct?.tags?.join?.(' '), ct?.description].join(' '));
      const { cov } = classifyContact(ctt, reports, scenarios);
      counts[cov]++;
    }
    const total = contacts.length;
    const pct = total ? Math.round((counts[COV.FULLY_COVERED] / total) * 100) : 0;
    return `Contact triple coverage: ${total} contacts across ${reports.length} reports and ${scenarios.length} scenarios. ${counts[COV.FULLY_COVERED]} fully covered (${pct}%), ${counts[COV.REPORT_ONLY]} report-only, ${counts[COV.SCENARIO_ONLY]} scenario-only, ${counts[COV.UNCOVERED]} uncovered — ${counts[COV.UNCOVERED] ? `${counts[COV.UNCOVERED]} contacts have no intelligence or scenario coverage` : 'all contacts have at least partial coverage'}.`;
  } catch {
    return 'Contact report scenario triple coverage check unavailable.';
  }
}

const CY = '#29E7FF';
const GR = '#22c55e';
const PU = '#a855f7';
const SL = '#64748b';
const TAB_COLORS = { [COV.FULLY_COVERED]: GR, [COV.REPORT_ONLY]: CY, [COV.SCENARIO_ONLY]: PU, [COV.UNCOVERED]: SL };

export default function ContactReportScenarioTriple() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [reports, setReports] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [rows, setRows] = useState([]);
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
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [ctRes, repRes, scRes] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`, { headers: hdr }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/reports`, { headers: hdr }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/scenario/list`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      ]);
      const cts = normaliseArray(ctRes.status === 'fulfilled' ? ctRes.value : [], 'items', 'data', 'contacts');
      const reps = normaliseArray(repRes.status === 'fulfilled' ? repRes.value : [], 'reports', 'items', 'data');
      const scs = normaliseArray(scRes.status === 'fulfilled' ? scRes.value : [], 'scenarios', 'items', 'data');
      setContacts(cts); setReports(reps); setScenarios(scs);
      const computed = cts.map(ct => {
        const ctt = tok([ct?.name, ct?.role, ct?.email, ct?.department, ct?.tags?.join?.(' '), ct?.description].join(' '));
        return { ct, ...classifyContact(ctt, reps, scs) };
      });
      setRows(computed);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:crst-toggle', onToggle);
    return () => window.removeEventListener('jarvis:crst-toggle', onToggle);
  }, []);

  const counts = {
    [COV.FULLY_COVERED]: rows.filter(r => r.cov === COV.FULLY_COVERED).length,
    [COV.REPORT_ONLY]: rows.filter(r => r.cov === COV.REPORT_ONLY).length,
    [COV.SCENARIO_ONLY]: rows.filter(r => r.cov === COV.SCENARIO_ONLY).length,
    [COV.UNCOVERED]: rows.filter(r => r.cov === COV.UNCOVERED).length,
  };
  const total = rows.length;
  const pct = total ? Math.round((counts[COV.FULLY_COVERED] / total) * 100) : 0;

  const visible = rows
    .filter(r => filter === 'ALL' || r.cov === filter)
    .filter(r => {
      if (!search) return true;
      const q = search.toLowerCase();
      const ct = r.ct;
      return [ct?.name, ct?.role, ct?.email, ct?.department].some(f => String(f || '').toLowerCase().includes(q));
    });

  const assess = async () => {
    setAssessing(true);
    try {
      const script = await buildCrstScript();
      setAssessText(script);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
    } catch { setAssessText('Assessment unavailable.'); }
    setAssessing(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 875600, bottom: 8, zIndex: 572,
          background: 'rgba(5,8,13,0.75)', border: `1px solid ${GR}55`,
          color: GR, borderRadius: 4, padding: '3px 7px', fontSize: 10,
          fontFamily: 'monospace', cursor: 'pointer', letterSpacing: 1,
        }}
        title="Contact × Report × Scenario Triple Coverage (CRST)"
      >◈ CRST</button>
    );
  }

  const barPcts = total
    ? [
        { w: (counts[COV.FULLY_COVERED] / total) * 100, c: GR },
        { w: (counts[COV.REPORT_ONLY] / total) * 100, c: CY },
        { w: (counts[COV.SCENARIO_ONLY] / total) * 100, c: PU },
        { w: (counts[COV.UNCOVERED] / total) * 100, c: SL },
      ]
    : [];

  return (
    <div style={{
      position: 'fixed', left: 875600, bottom: 36, zIndex: 572,
      width: 340, maxHeight: '72vh', overflowY: 'auto',
      background: 'rgba(5,8,13,0.94)', border: `1px solid ${GR}44`,
      borderRadius: 8, padding: 14, fontFamily: 'monospace',
      color: '#cdd6f4', backdropFilter: 'blur(10px)',
      boxShadow: `0 0 30px ${GR}22`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ color: GR, fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>◈ CRST</span>
        <span style={{ color: '#64748b', fontSize: 10, flex: 1 }}>Contact × Report × Scenario</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, marginBottom: 8 }}>
        {[
          { label: 'contacts', val: total, c: '#94a3b8' },
          { label: 'reports', val: reports.length, c: CY },
          { label: 'scenarios', val: scenarios.length, c: PU },
          { label: 'covered%', val: `${pct}%`, c: GR },
        ].map(s => (
          <div key={s.label} style={{ background: '#0f172a', borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: s.c }}>{s.val}</div>
            <div style={{ fontSize: 8, color: '#475569', letterSpacing: 1 }}>{s.label.toUpperCase()}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, marginBottom: 8 }}>
        {[
          { label: 'full', val: counts[COV.FULLY_COVERED], c: GR },
          { label: 'rpt only', val: counts[COV.REPORT_ONLY], c: CY },
          { label: 'scen only', val: counts[COV.SCENARIO_ONLY], c: PU },
          { label: 'uncovered', val: counts[COV.UNCOVERED], c: SL },
        ].map(s => (
          <div key={s.label} style={{ background: '#0f172a', borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: s.c }}>{s.val}</div>
            <div style={{ fontSize: 8, color: '#475569', letterSpacing: 1 }}>{s.label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {total > 0 && (
        <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
          {barPcts.map((b, i) => <div key={i} style={{ width: `${b.w}%`, background: b.c }} />)}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {['ALL', COV.FULLY_COVERED, COV.REPORT_ONLY, COV.SCENARIO_ONLY, COV.UNCOVERED].map(tab => (
          <button key={tab} onClick={() => setFilter(tab)} style={{
            padding: '2px 7px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
            background: filter === tab ? (TAB_COLORS[tab] || GR) + '22' : 'transparent',
            border: `1px solid ${filter === tab ? (TAB_COLORS[tab] || GR) : '#1e293b'}`,
            color: filter === tab ? (TAB_COLORS[tab] || GR) : '#64748b', fontFamily: 'monospace',
          }}>{tab === 'ALL' ? 'ALL' : tab.replace('_', ' ')}</button>
        ))}
      </div>

      {/* Search */}
      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="search contacts…"
        style={{
          width: '100%', padding: '4px 8px', fontSize: 10, background: '#0f172a',
          border: `1px solid #1e293b`, borderRadius: 4, color: '#cdd6f4',
          fontFamily: 'monospace', marginBottom: 8, boxSizing: 'border-box',
        }}
      />

      {/* Rows */}
      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
        {visible.slice(0, 30).map((row, i) => {
          const { ct, cov, bestReport, bestRepScore, bestScenario, bestScenScore } = row;
          const color = TAB_COLORS[cov] || SL;
          const isExp = expanded === i;
          return (
            <div key={i} style={{ borderBottom: '1px solid #1e293b', padding: '6px 0' }}>
              <div
                onClick={() => setExpanded(isExp ? null : i)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              >
                <span style={{ fontSize: 9, color, border: `1px solid ${color}44`, borderRadius: 2, padding: '1px 4px', minWidth: 72, textAlign: 'center' }}>{cov.replace('_', ' ')}</span>
                <span style={{ flex: 1, fontSize: 10, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ct?.name || 'Unknown'}</span>
                <span style={{ fontSize: 9, color: '#475569' }}>{ct?.role || ct?.department || ''}</span>
              </div>
              {isExp && (
                <div style={{ marginTop: 6, paddingLeft: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1, background: '#0f172a', borderRadius: 4, padding: 6 }}>
                      <div style={{ fontSize: 8, color: CY, letterSpacing: 1, marginBottom: 4 }}>REPORT</div>
                      {bestReport ? (
                        <>
                          <div style={{ fontSize: 10, color: '#e2e8f0', marginBottom: 3 }}>{bestReport?.title || bestReport?.name || 'Report'}</div>
                          <div style={{ fontSize: 8, color: '#64748b' }}>{bestReport?.type || ''}</div>
                          <div style={{ background: '#1e293b', borderRadius: 2, height: 3, marginTop: 4 }}>
                            <div style={{ width: `${Math.round(bestRepScore * 100)}%`, background: CY, height: '100%', borderRadius: 2 }} />
                          </div>
                        </>
                      ) : <div style={{ fontSize: 9, color: '#475569' }}>no match</div>}
                    </div>
                    <div style={{ flex: 1, background: '#0f172a', borderRadius: 4, padding: 6 }}>
                      <div style={{ fontSize: 8, color: PU, letterSpacing: 1, marginBottom: 4 }}>SCENARIO</div>
                      {bestScenario ? (
                        <>
                          <div style={{ fontSize: 10, color: '#e2e8f0', marginBottom: 3 }}>{bestScenario?.name || bestScenario?.title || 'Scenario'}</div>
                          <div style={{ fontSize: 8, color: '#64748b' }}>{bestScenario?.type || bestScenario?.status || ''}</div>
                          <div style={{ background: '#1e293b', borderRadius: 2, height: 3, marginTop: 4 }}>
                            <div style={{ width: `${Math.round(bestScenScore * 100)}%`, background: PU, height: '100%', borderRadius: 2 }} />
                          </div>
                        </>
                      ) : <div style={{ fontSize: 9, color: '#475569' }}>no match</div>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && <div style={{ fontSize: 10, color: '#475569', textAlign: 'center', padding: 8 }}>No contacts match</div>}
        {visible.length > 30 && <div style={{ fontSize: 9, color: '#334155', textAlign: 'center' }}>…+{visible.length - 30} more</div>}
      </div>

      {/* Assess */}
      <div style={{ borderTop: '1px solid #1e293b', paddingTop: 10, marginTop: 8 }}>
        <button
          onClick={assess} disabled={assessing}
          style={{ width: '100%', padding: '6px 0', background: assessing ? '#1e293b' : GR + '11', border: `1px solid ${GR}`, borderRadius: 4, color: GR, cursor: assessing ? 'default' : 'pointer', fontSize: 11, fontWeight: 700 }}
        >{assessing ? '⟳ Assessing…' : '▶ ASSESS — CRST coverage brief'}</button>
        {assessText && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8', background: '#0f172a', borderRadius: 4, padding: 8, lineHeight: 1.5 }}>{assessText}</div>
        )}
      </div>

      <div style={{ marginTop: 6, fontSize: 9, color: '#334155', textAlign: 'right' }}>
        {loading ? 'Refreshing…' : `Polls every ${POLL_MS / 1000}s`}
      </div>
    </div>
  );
}
