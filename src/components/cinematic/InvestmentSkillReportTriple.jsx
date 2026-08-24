import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const ISRTRI_RE = /\b(isrtri|investment[_\s-]?skill[_\s-]?report|invest[_\s-]?skill[_\s-]?report|investment[_\s-]?report[_\s-]?skill|uncovered[_\s-]?investment[_\s-]?skill|investment[_\s-]?coverage|skill[_\s-]?backed[_\s-]?investment|reported[_\s-]?investment|invest[_\s-]?coverage)\b/i;

export function isIsrtriQuery(t) { return ISRTRI_RE.test(t || ''); }

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
}

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    for (const k of ['results', 'items', 'data', 'investments', 'records', 'list', 'entries']) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    const vals = Object.values(raw);
    if (vals.length === 1 && Array.isArray(vals[0])) return vals[0];
  }
  return [];
}

function normInvestments(raw) {
  return normaliseArray(raw).map(v => ({
    id: v.id || v._id || String(Math.random()),
    name: v.name || v.title || v.investment_name || v.label || 'Unnamed Investment',
    ticker: v.ticker || v.symbol || '',
    sector: v.sector || v.category || v.asset_class || '',
    desc: [v.description, v.notes, v.tags, v.sector, v.type].filter(Boolean).join(' '),
  }));
}

function normSkills(raw) {
  return normaliseArray(raw).map(s => ({
    id: s.id || s._id || String(Math.random()),
    name: s.name || s.title || s.skill_name || 'Unnamed Skill',
    text: [s.name, s.title, s.description, s.category, s.domain, s.tags].filter(Boolean).join(' '),
  }));
}

function normReports(raw) {
  return normaliseArray(raw).map(r => ({
    id: r.id || r._id || String(Math.random()),
    text: [r.title, r.name, r.summary, r.type, r.tags, r.category].filter(Boolean).join(' '),
  }));
}

function matchScore(invToks, fields) {
  if (!invToks.length) return 0;
  const fToks = new Set(tok(fields));
  const hits = invToks.filter(t => fToks.has(t)).length;
  return hits / invToks.length;
}

const THRESHOLD = 0.08;

function correlate(investments, skills, reports) {
  return investments.map(v => {
    const vToks = tok(`${v.name} ${v.ticker} ${v.sector} ${v.desc}`);
    const bestSkill = skills.reduce((best, s) => {
      const sc = matchScore(vToks, s.text);
      return sc > best.score ? { score: sc, item: s } : best;
    }, { score: 0, item: null });
    const bestReport = reports.reduce((best, r) => {
      const sc = matchScore(vToks, r.text);
      return sc > best.score ? { score: sc, item: r } : best;
    }, { score: 0, item: null });
    const hasSk = bestSkill.score >= THRESHOLD;
    const hasRp = bestReport.score >= THRESHOLD;
    const state = hasSk && hasRp ? 'FULLY ANALYZED'
      : hasSk ? 'SKILL-BACKED'
      : hasRp ? 'REPORTED'
      : 'UNCOVERED';
    return { ...v, state, skScore: bestSkill.score, rpScore: bestReport.score };
  });
}

export async function buildIsrtriScript() {
  const hdr = { 'Authorization': `Bearer ${localStorage.getItem('jarvis_api_key') || 'dev-key'}` };
  const [vR, sR, rR] = await Promise.allSettled([
    fetch(`${API}/entities/Investment`, { headers: hdr }).then(r => r.ok ? r.json() : []),
    fetch(`${API}/v1/aip/skill`, { headers: hdr }).then(r => r.ok ? r.json() : []),
    fetch(`${API}/v1/reports`, { headers: hdr }).then(r => r.ok ? r.json() : []),
  ]);
  const investments = normInvestments(vR.status === 'fulfilled' ? vR.value : []);
  const skills = normSkills(sR.status === 'fulfilled' ? sR.value : []);
  const reports = normReports(rR.status === 'fulfilled' ? rR.value : []);
  const rows = correlate(investments, skills, reports);
  const fa = rows.filter(r => r.state === 'FULLY ANALYZED').length;
  const sb = rows.filter(r => r.state === 'SKILL-BACKED').length;
  const rp = rows.filter(r => r.state === 'REPORTED').length;
  const uc = rows.filter(r => r.state === 'UNCOVERED').length;
  return `ISRTRI Investment × Skill × Report: ${investments.length} investments cross-referenced against ${skills.length} skills and ${reports.length} reports. ` +
    `FULLY ANALYZED: ${fa} (skill-backed + report-found — investment has both capability coverage and intelligence documentation). ` +
    `SKILL-BACKED: ${sb} (skill match found, no report). ` +
    `REPORTED: ${rp} (report found, no skill coverage). ` +
    `UNCOVERED: ${uc} (no skill or report coverage — investment intelligence gap).`;
}

const TILE = {
  flex: '1 1 120px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 6, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4,
};
const LBL = { fontSize: 9, letterSpacing: 2, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' };
const VAL = { fontSize: 22, fontWeight: 700, color: '#e2e8f0' };

const STATE_COLOR = {
  'FULLY ANALYZED': '#22d3ee',
  'SKILL-BACKED': '#34d399',
  'REPORTED': '#a78bfa',
  'UNCOVERED': '#f59e0b',
};
const STATE_ORDER = ['FULLY ANALYZED', 'SKILL-BACKED', 'REPORTED', 'UNCOVERED'];

export default function InvestmentSkillReportTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [skills, setSkills] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const hdr = { 'Authorization': `Bearer ${localStorage.getItem('jarvis_api_key') || 'dev-key'}` };
    const [vR, sR, rR] = await Promise.allSettled([
      fetch(`${API}/entities/Investment`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/aip/skill`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/reports`, { headers: hdr }).then(r => r.ok ? r.json() : []),
    ]);
    const investments = normInvestments(vR.status === 'fulfilled' ? vR.value : []);
    const sks = normSkills(sR.status === 'fulfilled' ? sR.value : []);
    const rps = normReports(rR.status === 'fulfilled' ? rR.value : []);
    setSkills(sks);
    setReports(rps);
    setRows(correlate(investments, sks, rps));
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:isrtri-toggle', toggle);
    return () => window.removeEventListener('jarvis:isrtri-toggle', toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing) return;
    const fa = rows.filter(r => r.state === 'FULLY ANALYZED').length;
    const uc = rows.filter(r => r.state === 'UNCOVERED').length;
    const summary = `ISRTRI: ${rows.length} investments. FULLY ANALYZED: ${fa}. SKILL-BACKED: ${rows.filter(r => r.state === 'SKILL-BACKED').length}. REPORTED: ${rows.filter(r => r.state === 'REPORTED').length}. UNCOVERED (no skill or report coverage): ${uc}. ${skills.length} skills, ${reports.length} reports indexed.`;
    setAssessing(true);
    try {
      const hdr = { 'Authorization': `Bearer ${localStorage.getItem('jarvis_api_key') || 'dev-key'}`, 'Content-Type': 'application/json' };
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ message: `Assess this ISRTRI investment skill and report coverage state. Identify the highest-priority uncovered investments lacking both skill capability and intelligence report coverage: ${summary}` }),
      });
      const data = res.ok ? await res.json() : null;
      const text = data?.response || data?.message || data?.content || summary;
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: summary } }));
    }
    setAssessing(false);
  }, [rows, skills, reports, assessing]);

  const uncovered = rows.filter(r => r.state === 'UNCOVERED').length;
  const fa = rows.filter(r => r.state === 'FULLY ANALYZED').length;
  const visible = rows
    .filter(r => filter === 'ALL' || r.state === filter)
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.ticker.toLowerCase().includes(search.toLowerCase()));
  const pct = rows.length ? Math.round((fa / rows.length) * 100) : 0;

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: 'fixed', left: 768080, bottom: 8, zIndex: 400,
          background: uncovered > 0 ? 'rgba(245,158,11,0.18)' : 'rgba(34,211,238,0.12)',
          border: `1px solid ${uncovered > 0 ? 'rgba(245,158,11,0.5)' : 'rgba(34,211,238,0.35)'}`,
          color: uncovered > 0 ? '#f59e0b' : '#22d3ee', borderRadius: 6, padding: '3px 9px',
          fontSize: 10, letterSpacing: 1.5, cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace",
        }}
      >
        ◈ ISRTRI{uncovered > 0 ? ` ⚠${uncovered}` : ''}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, zIndex: 9999, width: 700, maxHeight: 620,
      background: 'rgba(10,14,28,0.97)', border: '1px solid rgba(34,211,238,0.25)',
      borderRadius: 10, fontFamily: "'JetBrains Mono',monospace", color: '#e2e8f0',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <span style={{ fontSize: 11, letterSpacing: 2, color: '#22d3ee', flex: 1 }}>◈ INVESTMENT × SKILL × REPORT</span>
        {loading && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>LOADING…</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
      </div>

      {/* Stat Tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexWrap: 'wrap' }}>
        {STATE_ORDER.map(s => {
          const count = rows.filter(r => r.state === s).length;
          return (
            <div key={s} style={{ ...TILE, borderColor: count > 0 ? `${STATE_COLOR[s]}40` : 'rgba(255,255,255,0.07)' }}>
              <div style={LBL}>{s}</div>
              <div style={{ ...VAL, color: STATE_COLOR[s] }}>{count}</div>
            </div>
          );
        })}
        <div style={TILE}>
          <div style={LBL}>SKILLS</div>
          <div style={VAL}>{skills.length}</div>
        </div>
        <div style={TILE}>
          <div style={LBL}>REPORTS</div>
          <div style={VAL}>{reports.length}</div>
        </div>
      </div>

      {/* Coverage Bar */}
      <div style={{ padding: '0 14px 10px' }}>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#22d3ee', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 4, letterSpacing: 1 }}>
          {pct}% FULLY ANALYZED · {skills.length} skills · {reports.length} reports
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexWrap: 'wrap' }}>
        {['ALL', ...STATE_ORDER].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            background: filter === s ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${filter === s ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.1)'}`,
            color: filter === s ? '#22d3ee' : 'rgba(255,255,255,0.5)',
            borderRadius: 4, padding: '3px 8px', fontSize: 9, letterSpacing: 1, cursor: 'pointer',
          }}>{s} {s !== 'ALL' ? `(${rows.filter(r => r.state === s).length})` : `(${rows.length})`}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 14px 8px' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search investments, tickers…"
          style={{
            width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4, padding: '5px 10px', color: '#e2e8f0', fontSize: 10, letterSpacing: 1,
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px' }}>
        {visible.slice(0, 80).map(r => (
          <div key={r.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            <span style={{
              fontSize: 8, letterSpacing: 1, color: STATE_COLOR[r.state],
              background: `${STATE_COLOR[r.state]}18`, borderRadius: 3, padding: '2px 5px',
              whiteSpace: 'nowrap', minWidth: 90, textAlign: 'center',
            }}>{r.state}</span>
            <span style={{ flex: 1, fontSize: 10, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.name}{r.ticker ? ` (${r.ticker})` : ''}{r.sector ? ` · ${r.sector}` : ''}
            </span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <div style={{ width: 48, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(r.skScore * 100)}%`, background: '#34d399' }} />
              </div>
              <div style={{ width: 48, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(r.rpScore * 100)}%`, background: '#a78bfa' }} />
              </div>
            </div>
          </div>
        ))}
        {visible.length === 0 && !loading && (
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', padding: '20px 0', textAlign: 'center' }}>no investments match</div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={load} disabled={loading} style={{
          background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)',
          color: '#22d3ee', borderRadius: 4, padding: '4px 12px', fontSize: 9, letterSpacing: 1, cursor: 'pointer',
        }}>↺ REFRESH</button>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? 'rgba(255,255,255,0.05)' : 'rgba(34,211,238,0.14)',
          border: '1px solid rgba(34,211,238,0.35)', color: assessing ? 'rgba(255,255,255,0.3)' : '#22d3ee',
          borderRadius: 4, padding: '4px 12px', fontSize: 9, letterSpacing: 1, cursor: 'pointer',
        }}>{assessing ? '…' : '▶ ASSESS'}</button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: 1 }}>
          {rows.length} investments · /entities/Investment × /v1/aip/skill × /v1/reports
        </span>
      </div>
    </div>
  );
}
