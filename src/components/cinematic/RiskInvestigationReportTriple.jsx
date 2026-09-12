import { useState, useEffect, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const API_KEY = (typeof window !== 'undefined' && (window.__JARVIS_API_KEY__ || 'dev-key')) || 'dev-key';
const POLL_MS = 60000;

const RIRT_RE = /\b(rirt|risk[._-]?inv[._-]?report|risk[._-]?investigation[._-]?report|signal[._-]?case[._-]?report|risk[._-]?case[._-]?report|unaddressed[._-]?risk|risk[._-]?coverage[._-]?triple|risk[._-]?triple|risk[._-]?inv[._-]?rpt)\b/i;
export function isRirtQuery(t) { return RIRT_RE.test(t || ''); }

function tok(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}
function matchScore(aTokens, bSet) {
  if (!aTokens.length || !bSet.size) return 0;
  return aTokens.filter(t => bSet.has(t)).length / Math.max(aTokens.length, bSet.size);
}
const THRESHOLD = 0.06;

const COV = {
  FULLY_COVERED: 'FULLY_COVERED',
  INV_BACKED: 'INV_BACKED',
  REPORT_BACKED: 'REPORT_BACKED',
  DARK: 'DARK',
};

const COV_COLOUR = {
  [COV.FULLY_COVERED]: '#00ffcc',
  [COV.INV_BACKED]: '#7bd4ff',
  [COV.REPORT_BACKED]: '#ffd700',
  [COV.DARK]: '#ff4455',
};

function normaliseArray(raw, ...keys) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  for (const k of keys) if (Array.isArray(raw[k])) return raw[k];
  const first = Object.values(raw).find(v => Array.isArray(v));
  return first || [];
}

function classify(riskTokens, investigations, reports) {
  const bSetInv = new Set(investigations.flatMap(inv => tok([inv.title, inv.description, inv.summary, inv.name].join(' '))));
  const bSetRpt = new Set(reports.flatMap(r => tok([r.title, r.summary, r.description, r.content, r.name].join(' '))));
  const invScore = matchScore(riskTokens, bSetInv);
  const rptScore = matchScore(riskTokens, bSetRpt);
  const hasInv = invScore >= THRESHOLD;
  const hasRpt = rptScore >= THRESHOLD;
  if (hasInv && hasRpt) return { cov: COV.FULLY_COVERED, invScore, rptScore };
  if (hasInv) return { cov: COV.INV_BACKED, invScore, rptScore };
  if (hasRpt) return { cov: COV.REPORT_BACKED, invScore, rptScore };
  return { cov: COV.DARK, invScore, rptScore };
}

export async function buildRirtScript() {
  const hdrs = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
  try {
    const [riskRes, invRes, rptRes] = await Promise.all([
      fetch(`${API}/entities/RiskSignal`, { headers: hdrs }),
      fetch(`${API}/v1/investigations`, { headers: hdrs }),
      fetch(`${API}/v1/reports`, { headers: hdrs }),
    ]);
    const risks = normaliseArray(riskRes.ok ? await riskRes.json() : {}, 'items', 'data', 'results', 'signals');
    const investigations = normaliseArray(invRes.ok ? await invRes.json() : {}, 'items', 'data', 'results', 'investigations');
    const reports = normaliseArray(rptRes.ok ? await rptRes.json() : {}, 'items', 'data', 'results', 'reports');
    const enriched = risks.map(rs => {
      const rt = tok([rs.title, rs.description, rs.summary, rs.signal, rs.name, rs.type].join(' '));
      return { ...rs, ...classify(rt, investigations, reports) };
    });
    const fully = enriched.filter(r => r.cov === COV.FULLY_COVERED).length;
    const invOnly = enriched.filter(r => r.cov === COV.INV_BACKED).length;
    const rptOnly = enriched.filter(r => r.cov === COV.REPORT_BACKED).length;
    const dark = enriched.filter(r => r.cov === COV.DARK).length;
    return `RISK SIGNAL — INVESTIGATION — REPORT TRIPLE COVERAGE. ${risks.length} risk signals cross-referenced against ${investigations.length} active investigations and ${reports.length} reports. FULLY COVERED: ${fully} risks with both investigation and report backing. INVESTIGATION BACKED: ${invOnly} risks with active case but no report. REPORT BACKED: ${rptOnly} risks with research but no active investigation. DARK: ${dark} unaddressed risks with neither coverage. ${dark > 0 ? `${dark} risk signal${dark > 1 ? 's are' : ' is'} completely unaddressed — immediate triage recommended.` : 'All risk signals have at least some coverage.'}`;
  } catch {
    return 'RIRT triple coverage check failed. Verify risk, investigation, and report endpoints.';
  }
}

export default function RiskInvestigationReportTriple() {
  const [open, setOpen] = useState(false);
  const [risks, setRisks] = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [reports, setReports] = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessText, setAssessText] = useState('');
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hdrs = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const [riskRes, invRes, rptRes] = await Promise.all([
        fetch(`${API}/entities/RiskSignal`, { headers: hdrs }),
        fetch(`${API}/v1/investigations`, { headers: hdrs }),
        fetch(`${API}/v1/reports`, { headers: hdrs }),
      ]);
      const rs = normaliseArray(riskRes.ok ? await riskRes.json() : {}, 'items', 'data', 'results', 'signals');
      const inv = normaliseArray(invRes.ok ? await invRes.json() : {}, 'items', 'data', 'results', 'investigations');
      const rpt = normaliseArray(rptRes.ok ? await rptRes.json() : {}, 'items', 'data', 'results', 'reports');
      setRisks(rs);
      setInvestigations(inv);
      setReports(rpt);
      setEnriched(rs.map(r => {
        const rt = tok([r.title, r.description, r.summary, r.signal, r.name, r.type].join(' '));
        return { ...r, ...classify(rt, inv, rpt) };
      }));
    } catch {
      // handled silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const iv = setInterval(load, POLL_MS);
    return () => clearInterval(iv);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(prev => !prev);
    window.addEventListener('jarvis:rirt-toggle', handler);
    return () => window.removeEventListener('jarvis:rirt-toggle', handler);
  }, []);

  const assess = async (risk) => {
    setAssessing(true);
    setAssessText('');
    const key = risk.id || risk.title;
    setExpanded(key);
    try {
      const hdrs = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const prompt = `Assess risk signal: ${risk.title || risk.name || risk.signal || JSON.stringify(risk).slice(0, 200)}. Coverage: ${risk.cov}. Investigation match: ${(risk.invScore * 100).toFixed(0)}%. Report match: ${(risk.rptScore * 100).toFixed(0)}%. Severity: ${risk.severity || risk.level || 'unknown'}. Be brief and tactical.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ message: prompt }),
      });
      if (res.ok) {
        const d = await res.json();
        setAssessText(d.response || d.answer || d.message || d.text || JSON.stringify(d).slice(0, 300));
      } else {
        setAssessText('Assessment unavailable.');
      }
    } catch {
      setAssessText('Assessment failed.');
    } finally {
      setAssessing(false);
    }
  };

  const speak = (text) => {
    const hdrs = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
    fetch(`${API}/v1/voice/tts`, { method: 'POST', headers: hdrs, body: JSON.stringify({ text }) }).catch(() => {});
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
  };

  const visible = enriched.filter(rs => {
    if (filter !== 'ALL' && rs.cov !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (rs.title || rs.name || rs.signal || '').toLowerCase().includes(q);
    }
    return true;
  });

  const dark = enriched.filter(r => r.cov === COV.DARK).length;
  const fully = enriched.filter(r => r.cov === COV.FULLY_COVERED).length;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 878960, bottom: 8, zIndex: 578,
          background: 'rgba(0,20,30,0.85)', border: `1px solid ${dark > 0 ? '#ff445544' : '#0ff3'}`,
          color: dark > 0 ? '#ff4455' : fully > 0 ? '#00ffcc' : '#888',
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
          fontFamily: 'monospace', letterSpacing: 1,
        }}
        title="Risk Signal × Investigation × Report Triple Coverage"
      >
        ◈ RIRT{dark > 0 ? ` ·${dark}` : fully > 0 ? ` [${fully}]` : ''}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', left: 878960, bottom: 36, zIndex: 578,
      width: 360, maxHeight: 520,
      background: 'rgba(0,12,20,0.97)', border: '1px solid #0ff4',
      borderRadius: 6, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', fontSize: 11, color: '#cce',
      boxShadow: '0 0 18px #00ffcc22',
    }}>
      <div style={{ padding: '6px 10px', borderBottom: '1px solid #0ff2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#00ffcc', fontWeight: 700, letterSpacing: 1 }}>◈ RIRT TRIPLE</span>
        <span style={{ color: '#888', fontSize: 10 }}>
          {risks.length}RS · {investigations.length}INV · {reports.length}RPT
        </span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 13 }}>✕</button>
      </div>

      <div style={{ padding: '4px 10px', display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid #0ff1' }}>
        {['ALL', ...Object.values(COV)].map(c => {
          const cnt = c === 'ALL' ? enriched.length : enriched.filter(r => r.cov === c).length;
          return (
            <button key={c} onClick={() => setFilter(c)}
              style={{
                padding: '2px 6px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
                background: filter === c ? (c === 'ALL' ? '#0ff2' : COV_COLOUR[c] + '33') : 'transparent',
                border: `1px solid ${c === 'ALL' ? '#0ff5' : COV_COLOUR[c] + '66'}`,
                color: c === 'ALL' ? '#0ff' : COV_COLOUR[c],
              }}>
              {c === 'ALL' ? 'ALL' : c.replace(/_/g, ' ')} {cnt}
            </button>
          );
        })}
      </div>

      <div style={{ padding: '4px 10px', borderBottom: '1px solid #0ff1' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="filter risk signals…"
          style={{ width: '100%', background: '#001418', border: '1px solid #0ff3', color: '#cce', padding: '2px 6px', fontSize: 10, borderRadius: 3, boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {loading && <div style={{ padding: 10, color: '#888' }}>Loading…</div>}
        {!loading && visible.length === 0 && <div style={{ padding: 10, color: '#555' }}>No risk signals.</div>}
        {visible.map((rs, i) => {
          const key = rs.id || rs.title || i;
          const isExp = expanded === key;
          return (
            <div key={key} style={{ borderBottom: '1px solid #0ff1', padding: '5px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setExpanded(isExp ? null : key)}>
                <span style={{ color: COV_COLOUR[rs.cov], fontWeight: 600, fontSize: 10 }}>
                  {rs.title || rs.name || rs.signal || `Risk #${i + 1}`}
                </span>
                <span style={{ color: COV_COLOUR[rs.cov], fontSize: 9 }}>{rs.cov.replace(/_/g, ' ')}</span>
              </div>
              <div style={{ color: '#556', fontSize: 9, marginTop: 2 }}>
                INV: {(rs.invScore * 100).toFixed(0)}% · RPT: {(rs.rptScore * 100).toFixed(0)}%
                {rs.severity && <span style={{ marginLeft: 6, color: rs.severity === 'CRITICAL' ? '#ff4455' : '#888' }}>· {rs.severity}</span>}
              </div>
              {isExp && (
                <div style={{ marginTop: 5, paddingTop: 5, borderTop: '1px solid #0ff1' }}>
                  {rs.description && <div style={{ color: '#99b', fontSize: 9, marginBottom: 4 }}>{String(rs.description).slice(0, 180)}</div>}
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => assess(rs)}
                      style={{ fontSize: 9, padding: '2px 6px', background: '#001a22', border: '1px solid #0ff4', color: '#0ff', cursor: 'pointer', borderRadius: 3 }}>
                      ASSESS
                    </button>
                    <button onClick={() => speak(`Risk signal ${rs.title || 'unknown'}: ${rs.cov.replace(/_/g, ' ')}. Investigation match: ${(rs.invScore * 100).toFixed(0)}%. Report match: ${(rs.rptScore * 100).toFixed(0)}%.`)}
                      style={{ fontSize: 9, padding: '2px 6px', background: '#001a22', border: '1px solid #0ff4', color: '#0ff', cursor: 'pointer', borderRadius: 3 }}>
                      SPEAK
                    </button>
                  </div>
                  {assessing && expanded === key && <div style={{ color: '#888', fontSize: 9, marginTop: 3 }}>Assessing…</div>}
                  {assessText && expanded === key && <div style={{ color: '#aee', fontSize: 9, marginTop: 3, maxHeight: 80, overflowY: 'auto' }}>{assessText}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: '4px 10px', borderTop: '1px solid #0ff2', display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#556' }}>
        <span>DARK: <span style={{ color: '#ff4455' }}>{dark}</span> · COVERED: <span style={{ color: '#00ffcc' }}>{fully}</span></span>
        <button onClick={load} style={{ background: 'none', border: 'none', color: '#0ff7', cursor: 'pointer', fontSize: 9 }}>↻ REFRESH</button>
      </div>
    </div>
  );
}
