import React, { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || '';
const TABS = ['ALL', 'FULLY_COVERED', 'DUAL_COVERED', 'SINGLE_LINKED', 'UNCOVERED'];
const CLASS_COLOR = {
  FULLY_COVERED: '#22c55e',
  DUAL_COVERED: '#00bfff',
  SINGLE_LINKED: '#ffd700',
  UNCOVERED: '#ff4444',
};
const PULSE_STYLE = `@keyframes igasnic-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function classifyRow(inv, communities, skills, risks) {
  const invToks = tokens(`${inv.title || ''} ${inv.description || ''} ${inv.tags || ''}`);
  const hitCommunity = communities.some(c =>
    overlaps(invToks, `${c.name || ''} ${c.description || ''} ${c.members || ''} ${c.tags || ''}`)
  );
  const hitSkill = skills.some(s =>
    overlaps(invToks, `${s.name || ''} ${s.description || ''} ${s.category || ''} ${s.tags || ''}`)
  );
  const hitRisk = risks.some(r =>
    overlaps(invToks, `${r.title || ''} ${r.description || ''} ${r.category || ''} ${r.tags || ''}`)
  );
  const count = [hitCommunity, hitSkill, hitRisk].filter(Boolean).length;
  if (count === 3) return 'FULLY_COVERED';
  if (count === 2) return 'DUAL_COVERED';
  if (count === 1) return 'SINGLE_LINKED';
  return 'UNCOVERED';
}

export default function InvestigationGraphSkillRiskNexus() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [assessment, setAssessment] = useState({});
  const intervalRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [invRes, comRes, skillRes, riskRes] = await Promise.all([
        fetch(`${API}/v1/investigations`),
        fetch(`${API}/v1/graph/communities`),
        fetch(`${API}/v1/aip/skill`),
        fetch(`${API}/entities/RiskSignal`),
      ]);
      const [invData, comData, skillData, riskData] = await Promise.all([
        invRes.ok ? invRes.json() : [],
        comRes.ok ? comRes.json() : [],
        skillRes.ok ? skillRes.json() : [],
        riskRes.ok ? riskRes.json() : [],
      ]);
      const investigations = Array.isArray(invData) ? invData : (invData.items || invData.data || []);
      const communities = Array.isArray(comData) ? comData : (comData.items || comData.data || []);
      const skills = Array.isArray(skillData) ? skillData : (skillData.items || skillData.data || []);
      const risks = Array.isArray(riskData) ? riskData : (riskData.items || riskData.data || []);
      const classified = investigations.map(inv => ({
        ...inv,
        _class: classifyRow(inv, communities, skills, risks),
      }));
      setRows(classified);
    } catch (e) {
      setError(e.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:igasnic-toggle', onToggle);
    return () => window.removeEventListener('jarvis:igasnic-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    fetchData();
    intervalRef.current = setInterval(fetchData, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, fetchData]);

  const assess = useCallback(async (row) => {
    setAssessing(row.id);
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `IGASNIC assessment for investigation "${row.title || row.id}": coverage class ${row._class}. Provide a brief network intelligence analysis.`,
        }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.result || JSON.stringify(d);
      setAssessment(prev => ({ ...prev, [row.id]: text }));
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessment(prev => ({ ...prev, [row.id]: `Error: ${e.message}` }));
    } finally {
      setAssessing(null);
    }
  }, []);

  const counts = {
    ALL: rows.length,
    FULLY_COVERED: rows.filter(r => r._class === 'FULLY_COVERED').length,
    DUAL_COVERED: rows.filter(r => r._class === 'DUAL_COVERED').length,
    SINGLE_LINKED: rows.filter(r => r._class === 'SINGLE_LINKED').length,
    UNCOVERED: rows.filter(r => r._class === 'UNCOVERED').length,
  };

  const visible = rows.filter(r => {
    const matchTab = tab === 'ALL' || r._class === tab;
    const q = search.toLowerCase();
    const matchSearch = !q || (r.title || '').toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  return (
    <>
      <style>{PULSE_STYLE}</style>
      <button
        title="IGASNIC — Investigation × Graph Community × AIP Skill × Risk Signal Nexus"
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed',
          left: 1116880,
          bottom: 8,
          zIndex: 710,
          background: 'rgba(0,191,255,0.13)',
          border: '1px solid rgba(0,191,255,0.45)',
          borderRadius: 6,
          color: '#00bfff',
          fontFamily: 'monospace',
          fontSize: 11,
          padding: '4px 9px',
          cursor: 'pointer',
          letterSpacing: 1,
          animation: 'igasnic-pulse 3s ease-in-out infinite',
        }}
      >
        IGASNIC
      </button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 711,
          background: 'rgba(0,0,0,0.82)',
          display: 'flex', flexDirection: 'column',
          fontFamily: 'monospace',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px',
            borderBottom: '1px solid rgba(0,191,255,0.3)',
            background: 'rgba(0,10,30,0.95)',
          }}>
            <span style={{ color: '#00bfff', fontSize: 14, letterSpacing: 2 }}>
              ◈ IGASNIC — Investigation × Graph Community × AIP Skill × Risk Signal Nexus
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: 'none', border: '1px solid #ff4444', color: '#ff4444',
              borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontSize: 12,
            }}>✕ CLOSE</button>
          </div>

          <div style={{ display: 'flex', gap: 6, padding: '8px 20px', background: 'rgba(0,5,20,0.9)', flexWrap: 'wrap' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? 'rgba(0,191,255,0.22)' : 'rgba(0,191,255,0.06)',
                border: `1px solid ${tab === t ? '#00bfff' : 'rgba(0,191,255,0.25)'}`,
                color: tab === t ? '#00bfff' : '#668',
                borderRadius: 4, padding: '3px 10px', cursor: 'pointer',
                fontSize: 11, letterSpacing: 1,
              }}>
                {t} <span style={{ opacity: 0.7 }}>({counts[t] || 0})</span>
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search investigations…"
              style={{
                marginLeft: 'auto', background: 'rgba(0,191,255,0.07)',
                border: '1px solid rgba(0,191,255,0.3)', borderRadius: 4,
                color: '#cce', padding: '3px 10px', fontSize: 11, width: 200,
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 20px' }}>
            {loading && <div style={{ color: '#00bfff', textAlign: 'center', padding: 30 }}>Loading…</div>}
            {error && <div style={{ color: '#ff4444', padding: 10 }}>{error}</div>}
            {!loading && visible.length === 0 && (
              <div style={{ color: '#557', textAlign: 'center', padding: 40 }}>No investigations match</div>
            )}
            {visible.map(row => (
              <div key={row.id || row.title} style={{
                background: 'rgba(0,10,30,0.8)',
                border: `1px solid ${CLASS_COLOR[row._class] || '#334'}40`,
                borderLeft: `3px solid ${CLASS_COLOR[row._class] || '#334'}`,
                borderRadius: 5,
                marginBottom: 6,
                padding: '8px 12px',
                cursor: 'pointer',
              }} onClick={() => setExpanded(expanded === (row.id || row.title) ? null : (row.id || row.title))}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    fontSize: 10, padding: '1px 7px', borderRadius: 3,
                    background: `${CLASS_COLOR[row._class]}22`,
                    color: CLASS_COLOR[row._class] || '#aaa',
                    border: `1px solid ${CLASS_COLOR[row._class] || '#aaa'}44`,
                    letterSpacing: 1,
                  }}>{row._class}</span>
                  <span style={{ color: '#cce', fontSize: 12, flex: 1 }}>{row.title || row.id || '—'}</span>
                  <span style={{ color: '#445', fontSize: 10 }}>▼</span>
                </div>
                {expanded === (row.id || row.title) && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(0,191,255,0.1)' }}>
                    {row.description && (
                      <div style={{ color: '#889', fontSize: 11, marginBottom: 6 }}>{row.description}</div>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      {row.status && <span style={{ color: '#aab', fontSize: 10 }}>Status: {row.status}</span>}
                      {row.created_at && <span style={{ color: '#667', fontSize: 10 }}>Created: {row.created_at}</span>}
                    </div>
                    {assessment[row.id] && (
                      <div style={{
                        background: 'rgba(0,191,255,0.07)', border: '1px solid rgba(0,191,255,0.2)',
                        borderRadius: 4, padding: '6px 10px', color: '#adf', fontSize: 11, marginBottom: 8,
                      }}>{assessment[row.id]}</div>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); assess(row); }}
                      disabled={assessing === row.id}
                      style={{
                        background: 'rgba(0,191,255,0.15)', border: '1px solid #00bfff',
                        color: '#00bfff', borderRadius: 4, padding: '3px 12px',
                        cursor: assessing === row.id ? 'wait' : 'pointer', fontSize: 11,
                      }}
                    >
                      {assessing === row.id ? 'ASSESSING…' : 'ASSESS'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{
            padding: '6px 20px',
            borderTop: '1px solid rgba(0,191,255,0.15)',
            background: 'rgba(0,5,20,0.95)',
            color: '#446',
            fontSize: 10,
            display: 'flex', gap: 20,
          }}>
            <span>TOTAL {counts.ALL}</span>
            <span style={{ color: CLASS_COLOR.FULLY_COVERED }}>● FULL {counts.FULLY_COVERED}</span>
            <span style={{ color: CLASS_COLOR.DUAL_COVERED }}>● DUAL {counts.DUAL_COVERED}</span>
            <span style={{ color: CLASS_COLOR.SINGLE_LINKED }}>● SINGLE {counts.SINGLE_LINKED}</span>
            <span style={{ color: CLASS_COLOR.UNCOVERED }}>● UNCOV {counts.UNCOVERED}</span>
            <span style={{ marginLeft: 'auto' }}>AUTO-REFRESH 90s · IGASNIC</span>
          </div>
        </div>
      )}
    </>
  );
}

export function isIgasnicQuery(q) {
  const s = q.toLowerCase();
  return (
    s.includes('igasnic') ||
    (s.includes('investigation') && s.includes('graph')) ||
    (s.includes('network') && s.includes('intelligence') && s.includes('nexus')) ||
    (s.includes('graph') && s.includes('skill')) ||
    (s.includes('investigation') && s.includes('skill') && s.includes('risk')) ||
    (s.includes('uncovered') && s.includes('investigation')) ||
    s.includes('network intelligence nexus')
  );
}

export function buildIgasnicScript() {
  return 'IGASNIC online. Opening Investigation Graph Skill Risk Nexus. Correlating investigations against graph communities, AIP skills, and risk signals.';
}
