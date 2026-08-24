import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const CSREP_RE = /\b(csrep|contact\s+scenario\s+report|contact\s+report\s+scenario|profiled\s+contacts|contact\s+intel\s+coverage|contact\s+scenario\s+intel|contact\s+threat\s+report|report\s+scenario\s+contact|blind\s+contacts|contact\s+intelligence\s+gap|scenario\s+report\s+contact|contact\s+scenario\s+profiling)\b/i;
const THRESHOLD = 0.07;

export function isCsrepQuery(t) {
  return CSREP_RE.test(t || '');
}

export async function buildCsrepScript() {
  try {
    const [conRes, scenRes, repRes] = await Promise.all([
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/reports`).then(r => r.ok ? r.json() : []),
    ]);
    const contacts = normaliseContacts(conRes);
    const scenarios = normaliseScenarios(scenRes);
    const reports = normaliseReports(repRes);
    const classified = contacts.map(c => classifyContact(c, scenarios, reports));
    const fullyProfiled = classified.filter(c => c.state === 'FULLY_PROFILED').length;
    const blind = classified.filter(c => c.state === 'BLIND').length;
    return `CSREP analysis: ${contacts.length} contacts cross-referenced against ${scenarios.length} threat scenarios and ${reports.length} intelligence reports. ${fullyProfiled} contacts are FULLY PROFILED — both scenario threat modeling and report documentation confirmed. ${blind} contacts are BLIND — no scenario or report coverage detected, representing critical intelligence gaps that should be prioritised for threat modeling and documentation.`;
  } catch {
    return 'CSREP data unavailable — check /entities/Contact, /v1/scenario/list, and /v1/reports endpoints.';
  }
}

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const fSet = new Set(tok(fieldText));
  const hits = toks.filter(t => fSet.has(t)).length;
  return hits / toks.length;
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : Array.isArray(raw.contacts) ? raw.contacts
    : [];
  return arr.map((c, i) => ({
    id: c.id || c._id || `con-${i}`,
    label: c.name || c.full_name || c.fullName || `Contact ${i + 1}`,
    org: c.company || c.organization || c.org || '',
    role: c.title || c.role || c.position || '',
    email: c.email || '',
    _searchText: [c.name, c.full_name, c.fullName, c.email, c.company, c.organization, c.title, c.role, c.description, c.notes, c.tags].filter(Boolean).join(' '),
  }));
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.scenarios) ? raw.scenarios
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((s, i) => ({
    id: s.id || s._id || `scen-${i}`,
    label: s.name || s.title || s.scenario_name || `Scenario ${i + 1}`,
    status: s.status || s.state || '',
    category: s.category || s.type || s.kind || '',
    _searchText: [s.name, s.title, s.scenario_name, s.description, s.summary, s.category, s.type, s.tags, s.objective, s.threat].filter(Boolean).join(' '),
  }));
}

function normaliseReports(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw.reports) ? raw.reports
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.results) ? raw.results
    : [];
  return arr.map((r, i) => ({
    id: r.id || r._id || `rep-${i}`,
    label: r.title || r.name || r.report_name || `Report ${i + 1}`,
    type: r.type || r.category || r.kind || '',
    _searchText: [r.title, r.name, r.report_name, r.summary, r.description, r.type, r.category, r.tags, r.author].filter(Boolean).join(' '),
  }));
}

function classifyContact(contact, scenarios, reports) {
  const toks = tok(contact._searchText);
  const scenMatches = scenarios
    .map(s => ({ ...s, score: Math.max(matchScore(toks, s._searchText), matchScore(tok(s._searchText), contact._searchText)) }))
    .filter(s => s.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const repMatches = reports
    .map(r => ({ ...r, score: Math.max(matchScore(toks, r._searchText), matchScore(tok(r._searchText), contact._searchText)) }))
    .filter(r => r.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
  const hasScen = scenMatches.length > 0;
  const hasRep = repMatches.length > 0;
  let state;
  if (hasScen && hasRep) state = 'FULLY_PROFILED';
  else if (hasScen) state = 'SCENARIO_MAPPED';
  else if (hasRep) state = 'REPORT_BACKED';
  else state = 'BLIND';
  return { ...contact, state, scenMatches, repMatches };
}

const STATE_LABELS = {
  FULLY_PROFILED: 'FULLY PROFILED',
  SCENARIO_MAPPED: 'SCENARIO-MAPPED',
  REPORT_BACKED: 'REPORT-BACKED',
  BLIND: 'BLIND',
};

function ScoreBar({ score, color }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 3, height: 6, width: '100%', overflow: 'hidden', marginTop: 2 }}>
      <div style={{ width: `${Math.round(score * 100)}%`, background: color, height: '100%', transition: 'width 0.3s' }} />
    </div>
  );
}

export default function ContactScenarioReportTriple() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [reports, setReports] = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = { 'Content-Type': 'application/json' };
      const [conRes, scenRes, repRes] = await Promise.all([
        fetch(`${API}/entities/Contact`, { headers }),
        fetch(`${API}/v1/scenario/list`, { headers }),
        fetch(`${API}/v1/reports`, { headers }),
      ]);
      const [conJson, scenJson, repJson] = await Promise.all([conRes.json(), scenRes.json(), repRes.json()]);
      const cons = normaliseContacts(conJson);
      const scens = normaliseScenarios(scenJson);
      const reps = normaliseReports(repJson);
      setContacts(cons);
      setScenarios(scens);
      setReports(reps);
      setClassified(cons.map(c => classifyContact(c, scens, reps)));
    } catch (e) {
      setError('Fetch failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.open !== undefined) { setOpen(e.detail.open); return; }
      setOpen(v => !v);
    };
    window.addEventListener('jarvis:csrep-toggle', handler);
    return () => window.removeEventListener('jarvis:csrep-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  useEffect(() => {
    const handler = (e) => {
      const q = (e.detail?.transcript || '').toLowerCase();
      if (CSREP_RE.test(q)) setOpen(true);
    };
    window.addEventListener('jarvis:voice-query', handler);
    return () => window.removeEventListener('jarvis:voice-query', handler);
  }, []);

  const counts = {
    FULLY_PROFILED: classified.filter(c => c.state === 'FULLY_PROFILED').length,
    SCENARIO_MAPPED: classified.filter(c => c.state === 'SCENARIO_MAPPED').length,
    REPORT_BACKED: classified.filter(c => c.state === 'REPORT_BACKED').length,
    BLIND: classified.filter(c => c.state === 'BLIND').length,
  };

  const visible = classified.filter(c => {
    if (filter !== 'ALL' && c.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return c._searchText.toLowerCase().includes(q) || c.label.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const prompt = `CSREP Contact × Scenario × Report Triple Coverage: ${contacts.length} contacts cross-referenced against ${scenarios.length} threat scenarios and ${reports.length} intelligence reports. Coverage: FULLY PROFILED=${counts.FULLY_PROFILED}, SCENARIO-MAPPED=${counts.SCENARIO_MAPPED}, REPORT-BACKED=${counts.REPORT_BACKED}, BLIND=${counts.BLIND}. In 2 sentences, assess contact intelligence coverage and identify the most critical blind-spot contacts that lack both threat scenario modeling and report documentation.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const j = await res.json();
      const text = j.response || j.message || j.content || JSON.stringify(j);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessment('Assessment failed: ' + e.message);
    } finally {
      setAssessing(false);
    }
  };

  if (!open) return null;

  const profiledPct = classified.length ? Math.round((counts.FULLY_PROFILED / classified.length) * 100) : 0;
  const scenPct = classified.length ? Math.round((counts.SCENARIO_MAPPED / classified.length) * 100) : 0;
  const repPct = classified.length ? Math.round((counts.REPORT_BACKED / classified.length) * 100) : 0;
  const blindPct = classified.length ? Math.round((counts.BLIND / classified.length) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', left: 844800, bottom: 8, zIndex: 537,
      width: 900, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(10,14,26,0.97)', border: '1px solid #1e3a5f',
      borderRadius: 10, fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1',
      boxShadow: '0 0 32px rgba(30,58,95,0.35)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <span style={{ color: '#fb923c', fontWeight: 700, fontSize: 13 }}>◈ CSREP</span>
        <span style={{ color: '#64748b', fontSize: 11 }}>Contact × Scenario × Report Triple Coverage</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <span style={{ color: '#fb923c', fontSize: 10 }}>SYNCING…</span>}
          <button onClick={fetchAll} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {error && <div style={{ padding: '6px 14px', color: '#f87171', fontSize: 11, borderBottom: '1px solid #1e293b' }}>{error}</div>}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 6, padding: '10px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        {[
          { label: 'CONTACTS', val: contacts.length, color: '#e2e8f0' },
          { label: 'SCENARIOS', val: scenarios.length, color: '#f472b6' },
          { label: 'REPORTS', val: reports.length, color: '#22d3ee' },
          { label: 'FULLY PROFILED', val: counts.FULLY_PROFILED, color: '#fb923c', badge: counts.FULLY_PROFILED > 0 },
          { label: 'SCEN-MAPPED', val: counts.SCENARIO_MAPPED, color: '#f472b6' },
          { label: 'REPORT-BACKED', val: counts.REPORT_BACKED, color: '#22d3ee' },
          { label: 'BLIND', val: counts.BLIND, color: '#6b7280', badge: counts.BLIND > 0 },
          { label: 'PROFILED %', val: `${profiledPct}%`, color: '#fb923c' },
        ].map(t => (
          <div key={t.label} style={{ background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center', border: t.badge ? '1px solid ' + t.color : '1px solid #1e293b' }}>
            <div style={{ color: t.color, fontWeight: 700, fontSize: 15 }}>{t.val}</div>
            <div style={{ color: '#475569', fontSize: 9, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
          <span>Coverage</span>
          <span style={{ marginLeft: 'auto', color: '#fb923c' }}>{profiledPct}% fully profiled</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#1e293b' }}>
          {profiledPct > 0 && <div style={{ width: `${profiledPct}%`, background: '#fb923c' }} />}
          {scenPct > 0 && <div style={{ width: `${scenPct}%`, background: '#f472b6' }} />}
          {repPct > 0 && <div style={{ width: `${repPct}%`, background: '#22d3ee' }} />}
          {blindPct > 0 && <div style={{ width: `${blindPct}%`, background: '#374151' }} />}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 9, color: '#475569' }}>
          <span style={{ color: '#fb923c' }}>● FULLY PROFILED</span>
          <span style={{ color: '#f472b6' }}>● SCENARIO-MAPPED</span>
          <span style={{ color: '#22d3ee' }}>● REPORT-BACKED</span>
          <span style={{ color: '#374151' }}>● BLIND</span>
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #1e293b', flexShrink: 0, flexWrap: 'wrap' }}>
        {['ALL', 'FULLY_PROFILED', 'SCENARIO_MAPPED', 'REPORT_BACKED', 'BLIND'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? '#1c0a00' : '#0f172a',
            border: `1px solid ${filter === f ? '#fb923c' : '#1e293b'}`,
            color: filter === f ? '#fdba74' : '#64748b',
            borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace',
          }}>
            {STATE_LABELS[f] || f}{f !== 'ALL' ? ` (${counts[f]})` : ` (${classified.length})`}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{ marginLeft: 'auto', background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0', borderRadius: 4, padding: '3px 10px', fontSize: 10, fontFamily: 'monospace', width: 180 }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '6px 14px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#475569', textAlign: 'center', padding: 24 }}>No contacts match current filter.</div>
        )}
        {visible.map(c => {
          const stateColor = c.state === 'FULLY_PROFILED' ? '#fb923c' : c.state === 'SCENARIO_MAPPED' ? '#f472b6' : c.state === 'REPORT_BACKED' ? '#22d3ee' : '#6b7280';
          const isExp = expanded === c.id;
          return (
            <div key={c.id} style={{ marginBottom: 6, background: '#0f172a', borderRadius: 6, border: `1px solid ${isExp ? '#1e3a5f' : '#1e293b'}` }}>
              <div
                onClick={() => setExpanded(isExp ? null : c.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
              >
                <span style={{ color: stateColor, fontWeight: 700, fontSize: 10, minWidth: 180 }}>{STATE_LABELS[c.state]}</span>
                <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 600 }}>{c.label}</span>
                {c.org && <span style={{ background: '#0f172a', color: '#fbbf24', border: '1px solid #451a03', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>{c.org.slice(0, 20)}</span>}
                {c.role && <span style={{ background: '#0f172a', color: '#94a3b8', border: '1px solid #334155', borderRadius: 3, padding: '1px 6px', fontSize: 9 }}>{c.role.slice(0, 22)}</span>}
                <span style={{ color: '#334155', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: '1px solid #1e293b' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                    {/* Scenarios pane */}
                    <div>
                      <div style={{ color: '#f472b6', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>SCENARIOS ({c.scenMatches.length})</div>
                      {c.scenMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No threat scenario coverage</div>
                        : c.scenMatches.slice(0, 6).map(s => (
                          <div key={s.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#f9a8d4', fontSize: 11 }}>{s.label.slice(0, 40)}{s.label.length > 40 ? '…' : ''}</span>
                              <div style={{ display: 'flex', gap: 4 }}>
                                {s.status && <span style={{ background: '#2d0a1e', color: '#f472b6', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{s.status}</span>}
                                {s.category && <span style={{ background: '#1a0020', color: '#e879f9', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{s.category}</span>}
                              </div>
                            </div>
                            <ScoreBar score={s.score} color="#f472b6" />
                          </div>
                        ))
                      }
                    </div>
                    {/* Reports pane */}
                    <div>
                      <div style={{ color: '#22d3ee', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>REPORTS ({c.repMatches.length})</div>
                      {c.repMatches.length === 0
                        ? <div style={{ color: '#374151', fontSize: 10 }}>No report documentation</div>
                        : c.repMatches.slice(0, 6).map(r => (
                          <div key={r.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#67e8f9', fontSize: 11 }}>{r.label.slice(0, 40)}{r.label.length > 40 ? '…' : ''}</span>
                              {r.type && <span style={{ background: '#082f3e', color: '#22d3ee', borderRadius: 3, padding: '1px 5px', fontSize: 9 }}>{r.type}</span>}
                            </div>
                            <ScoreBar score={r.score} color="#22d3ee" />
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assessment */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
        {assessment && <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.5 }}>{assessment}</div>}
        <button
          onClick={assess}
          disabled={assessing || classified.length === 0}
          style={{
            background: assessing ? '#1e293b' : '#1c0a00', border: '1px solid #fb923c',
            color: assessing ? '#475569' : '#fdba74', borderRadius: 5, padding: '5px 18px',
            cursor: assessing ? 'not-allowed' : 'pointer', fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
          }}
        >
          {assessing ? 'ASSESSING…' : 'ASSESS'}
        </button>
      </div>
    </div>
  );
}
