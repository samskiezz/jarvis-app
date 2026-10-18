/**
 * SwarmInvestmentRiskTriangle — F34
 *
 * Fetches /entities/SwarmJob + /entities/Investment + /entities/RiskSignal
 * Keyword-matches each investment against active swarm jobs AND risk signals to classify:
 *   MONITORED — matched to both a swarm job AND a risk signal
 *   EXPOSED   — has risk signals but no swarm coverage (vulnerable, unprocessed)
 *   RUNNING   — has swarm coverage but no identified risk signals (active, safe)
 *   DORMANT   — no swarm, no risks (idle, untracked)
 *
 * Toggle: ◈ SWIRT button (fixed, bottom strip)
 * Stat tiles: investments / monitored / exposed / running / dormant / swarm jobs / risks
 * Red pulse on EXPOSED count.
 * Expandable rows: matched swarm jobs + matched risk signals.
 * Filter tabs: ALL / MONITORED / EXPOSED / RUNNING / DORMANT + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "swarm investment"/"portfolio swarm"/"investment risk swarm"/"swirt"/"exposed investments"
 * Event: jarvis:swirt-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'MONITORED', 'EXPOSED', 'RUNNING', 'DORMANT'];

const CLS_COLOR = {
  MONITORED: '#22c55e',
  EXPOSED:   '#FF4D6D',
  RUNNING:   '#29E7FF',
  DORMANT:   '#6A8BA0',
};

const PULSE_CSS = `@keyframes swirt-pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}
function classifyInvestment(invToks, swarmJobs, riskSignals) {
  const matchedSwarms = swarmJobs.filter(sj =>
    overlaps(invToks, [sj.name, sj.description, sj.job_type, sj.tags, sj.target].join(' '))
  );
  const matchedRisks = riskSignals.filter(rs =>
    overlaps(invToks, [rs.name, rs.description, rs.signal_type, rs.tags, rs.source].join(' '))
  );
  if (matchedSwarms.length > 0 && matchedRisks.length > 0)
    return { cls: 'MONITORED', matchedSwarms, matchedRisks };
  if (matchedRisks.length > 0)
    return { cls: 'EXPOSED', matchedSwarms: [], matchedRisks };
  if (matchedSwarms.length > 0)
    return { cls: 'RUNNING', matchedSwarms, matchedRisks: [] };
  return { cls: 'DORMANT', matchedSwarms: [], matchedRisks: [] };
}

export function isSwirtQuery(q) {
  return /\b(swarm.invest|portfolio.swarm|invest.*risk.*swarm|swarm.*invest|swirt|exposed.invest|investment.swarm|swarm.portfolio|investment.risk.swarm)\b/i.test(q);
}
export function buildSwirtScript() {
  return 'Opening Swarm-Investment-Risk Triangle. Cross-referencing portfolio investments against active swarm jobs and risk signals to surface exposed assets with no swarm coverage.';
}

export default function SwarmInvestmentRiskTriangle() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [swarmCount, setSwCount]    = useState(0);
  const [riskCount, setRkCount]     = useState(0);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const intervalRef                 = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [swRes, invRes, rkRes] = await Promise.all([
        fetch(`${API}/entities/SwarmJob`,     { headers: hdr }),
        fetch(`${API}/entities/Investment`,   { headers: hdr }),
        fetch(`${API}/entities/RiskSignal`,   { headers: hdr }),
      ]);

      const swRaw  = await swRes.json().catch(() => []);
      const invRaw = await invRes.json().catch(() => []);
      const rkRaw  = await rkRes.json().catch(() => []);

      const swarmJobs    = Array.isArray(swRaw)  ? swRaw  : (swRaw.items  || swRaw.jobs   || []);
      const investments  = Array.isArray(invRaw) ? invRaw : (invRaw.items || invRaw.investments || []);
      const riskSignals  = Array.isArray(rkRaw)  ? rkRaw  : (rkRaw.items  || rkRaw.signals || []);

      setSwCount(swarmJobs.length);
      setRkCount(riskSignals.length);

      const classified = investments.map(inv => {
        const label   = [inv.name, inv.title, inv.description, inv.ticker, inv.sector, inv.tags, inv.asset_class].join(' ');
        const invToks = tokens(label);
        const { cls, matchedSwarms, matchedRisks } = classifyInvestment(invToks, swarmJobs, riskSignals);
        return { ...inv, _cls: cls, _swarms: matchedSwarms, _risks: matchedRisks, _label: label };
      });

      setRows(classified);
    } catch (e) {
      setError(e.message || 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    intervalRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(intervalRef.current);
  }, [open, fetchData]);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:swirt-toggle', handler);
    return () => window.removeEventListener('jarvis:swirt-toggle', handler);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    const counts = { MONITORED: 0, EXPOSED: 0, RUNNING: 0, DORMANT: 0 };
    rows.forEach(r => { counts[r._cls] = (counts[r._cls] || 0) + 1; });
    const prompt = `Portfolio-swarm-risk status: ${rows.length} investments. MONITORED (swarm+risk): ${counts.MONITORED}, EXPOSED (risk, no swarm): ${counts.EXPOSED}, RUNNING (swarm, no risk): ${counts.RUNNING}, DORMANT (neither): ${counts.DORMANT}. In 2 sentences, identify the highest-priority exposed investments and recommend immediate swarm deployment actions.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json().catch(() => ({}));
      const text = data.response || data.message || data.content || JSON.stringify(data);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, [rows]);

  const counts = { MONITORED: 0, EXPOSED: 0, RUNNING: 0, DORMANT: 0 };
  rows.forEach(r => { counts[r._cls] = (counts[r._cls] || 0) + 1; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search && !r._label.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const SEV_COLOR = { CRITICAL: '#FF4D6D', HIGH: '#FFB830', MEDIUM: '#FFD700', LOW: '#22c55e' };

  const panel = open ? (
    <div style={{
      position: 'fixed', right: 20, bottom: 48, zIndex: 131,
      width: 480, maxHeight: '70vh',
      background: 'rgba(4,14,26,0.97)',
      border: '1px solid #1A4A6A', borderRadius: 8,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#C8E6FA',
      boxShadow: '0 0 24px rgba(41,231,255,0.15)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px', borderBottom: '1px solid #1A4A6A',
        background: 'rgba(0,40,70,0.7)', flexShrink: 0,
      }}>
        <span style={{ color: '#29E7FF', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
          ◈ SWARM–INVESTMENT–RISK TRIANGLE
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchData} disabled={loading}
            style={{ background: 'none', border: '1px solid #29E7FF', color: '#29E7FF',
              fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}>
            ▶ REFRESH
          </button>
          <button onClick={assess} disabled={assessing}
            style={{ background: 'none', border: '1px solid #00E5A0', color: '#00E5A0',
              fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}>
            {assessing ? '...' : '▶ ASSESS'}
          </button>
          <button onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#8AA', fontSize: 16, cursor: 'pointer' }}>
            ✕
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'INVEST',    val: rows.length,       color: '#29E7FF' },
          { label: 'MONITORED', val: counts.MONITORED,  color: '#22c55e' },
          { label: 'EXPOSED',   val: counts.EXPOSED,    color: '#FF4D6D', pulse: counts.EXPOSED > 0 },
          { label: 'RUNNING',   val: counts.RUNNING,    color: '#29E7FF' },
          { label: 'DORMANT',   val: counts.DORMANT,    color: '#6A8BA0' },
          { label: 'SWARMS',    val: swarmCount,        color: '#00E5A0' },
          { label: 'RISKS',     val: riskCount,         color: '#FFB830' },
        ].map(t => (
          <div key={t.label} style={{
            flex: '1 1 60px', background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${t.color}33`,
            borderRadius: 6, padding: '6px 4px', textAlign: 'center',
            animation: t.pulse ? 'swirt-pulse 1.5s infinite' : 'none',
          }}>
            <div style={{ color: t.color, fontSize: 14, fontWeight: 700 }}>{t.val}</div>
            <div style={{ color: '#6A8BA0', fontSize: 8, letterSpacing: 1 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              background: tab === t ? '#29E7FF22' : 'none',
              border: `1px solid ${tab === t ? '#29E7FF' : '#1A4A6A'}`,
              color: tab === t ? '#29E7FF' : '#6A8BA0',
              fontSize: 10, padding: '3px 10px', borderRadius: 12, cursor: 'pointer',
            }}>
            {t}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{
            marginLeft: 'auto', background: 'rgba(255,255,255,0.04)',
            border: '1px solid #1A4A6A', color: '#C8E6FA',
            fontSize: 10, padding: '3px 8px', borderRadius: 4,
          }}
        />
      </div>

      {/* Rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 10px' }}>
        {loading && <div style={{ color: '#6A8BA0', fontSize: 11, padding: 10 }}>Loading…</div>}
        {error   && <div style={{ color: '#ef4444', fontSize: 11, padding: 10 }}>{error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: '#6A8BA0', fontSize: 11, padding: 10 }}>No investments match.</div>
        )}
        {visible.map((inv, i) => {
          const id   = inv.id || inv.investment_id || inv.ticker || inv.name || i;
          const name = inv.name || inv.title || inv.ticker || `Investment #${i + 1}`;
          const sect = inv.sector || inv.asset_class || inv.type || '';
          const isExp = expanded === id;
          const cls   = inv._cls;
          const cc    = CLS_COLOR[cls];
          return (
            <div key={id} style={{ borderBottom: '1px solid #0D2A3E', paddingBottom: 6, marginBottom: 4 }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 0' }}
              >
                <span style={{
                  background: `${cc}22`, border: `1px solid ${cc}88`,
                  color: cc, fontSize: 9, padding: '1px 6px', borderRadius: 10,
                  minWidth: 68, textAlign: 'center', letterSpacing: 1,
                }}>
                  {cls}
                </span>
                <span style={{ flex: 1, fontSize: 11, color: '#C8E6FA' }}>{name}</span>
                {sect && <span style={{ color: '#6A8BA0', fontSize: 9 }}>{sect}</span>}
                <span style={{ color: '#4A6A7A', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 8px', background: 'rgba(0,0,0,0.3)', borderRadius: 4, fontSize: 10 }}>
                  {inv.description && (
                    <div style={{ color: '#8AA', marginBottom: 6 }}>{inv.description}</div>
                  )}
                  {inv._risks.length > 0 && (
                    <div>
                      <div style={{ color: '#FF4D6D', fontWeight: 700, marginBottom: 3 }}>
                        RISK SIGNALS ({inv._risks.length})
                      </div>
                      {inv._risks.map((rs, ri) => {
                        const sev = rs.severity || rs.level || 'MEDIUM';
                        const sc = SEV_COLOR[sev.toUpperCase()] || '#FFB830';
                        return (
                          <div key={ri} style={{ display: 'flex', gap: 6, padding: '2px 0', borderBottom: '1px solid #0D2A3E' }}>
                            <span style={{
                              background: `${sc}22`, border: `1px solid ${sc}88`,
                              color: sc, fontSize: 9, padding: '1px 4px', borderRadius: 8,
                            }}>{sev}</span>
                            <span style={{ color: '#C8E6FA' }}>{rs.name || rs.title || `Risk ${ri + 1}`}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {inv._swarms.length > 0 && (
                    <div style={{ marginTop: inv._risks.length > 0 ? 6 : 0 }}>
                      <div style={{ color: '#00E5A0', fontWeight: 700, marginBottom: 3 }}>
                        SWARM JOBS ({inv._swarms.length})
                      </div>
                      {inv._swarms.map((sj, si) => (
                        <div key={si} style={{ display: 'flex', gap: 6, padding: '2px 0', borderBottom: '1px solid #0D2A3E' }}>
                          <span style={{
                            background: '#00E5A022', border: '1px solid #00E5A088',
                            color: '#00E5A0', fontSize: 9, padding: '1px 4px', borderRadius: 8,
                          }}>{sj.status || sj.job_type || 'job'}</span>
                          <span style={{ color: '#C8E6FA' }}>{sj.name || sj.title || sj.job_id || `Job ${si + 1}`}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {inv._risks.length === 0 && inv._swarms.length === 0 && (
                    <div style={{ color: '#6A8BA0' }}>
                      No matching swarm jobs or risk signals. Investment is DORMANT.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assessment */}
      {assessment && (
        <div style={{
          flexShrink: 0, padding: '8px 14px', borderTop: '1px solid #1A4A6A',
          background: 'rgba(0,40,70,0.7)', fontSize: 11, color: '#00E5A0',
          maxHeight: 80, overflowY: 'auto',
        }}>
          {assessment}
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <style>{PULSE_CSS}</style>
      <button
        onClick={() => setOpen(o => !o)}
        title="Swarm–Investment–Risk Exposure Triangle"
        style={{
          position: 'fixed', left: 67960, bottom: 8, zIndex: 131,
          background: open ? 'rgba(41,231,255,0.18)' : 'rgba(6,18,32,0.85)',
          border: `1px solid ${open ? '#29E7FF' : '#1A4A6A'}`,
          color: open ? '#29E7FF' : '#4A8A9A',
          fontSize: 9, padding: '3px 8px', borderRadius: 4,
          cursor: 'pointer', letterSpacing: 1, fontFamily: 'monospace',
          transition: 'all 0.2s',
        }}
      >
        ◈ SWIRT
      </button>
      {panel}
    </>
  );
}
