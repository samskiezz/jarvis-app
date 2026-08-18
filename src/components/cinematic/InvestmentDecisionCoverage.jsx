import { useState, useEffect, useCallback } from 'react';

const API = '';
const IVDC_RE = /\b(investment[._-]?decision|decision[._-]?invest|ivdc|investment[._-]?coverage|uncovered[._-]?invest|investment[._-]?decisions|investment[._-]?decision[._-]?coverage|which[._-]?investments[._-]?have[._-]?decisions|investment[._-]?governance|decision[._-]?coverage[._-]?invest)\b/i;

export function isIvdcQuery(t) {
  return IVDC_RE.test(t || '');
}

export async function buildIvdcScript() {
  const [ivR, dcR] = await Promise.allSettled([
    fetch(`${API}/entities/Investment`).then(r => r.json()),
    fetch(`${API}/v1/decision/list?limit=50`).then(r => r.json()),
  ]);
  const investments = normaliseArray(ivR.status === 'fulfilled' ? ivR.value : []);
  const decisions = normaliseArray(dcR.status === 'fulfilled' ? dcR.value : []);
  const enriched = correlate(investments, decisions);
  const covered = enriched.filter(iv => iv._linked).length;
  const uncovered = enriched.filter(iv => !iv._linked).length;
  return (
    `Investment × Decision Coverage: ${investments.length} investments, ${decisions.length} decisions indexed. ` +
    `${covered} investments are COVERED (matched to decisions); ${uncovered} are UNCOVERED (no decision backing). ` +
    `Top uncovered: ${enriched.filter(iv => !iv._linked).slice(0, 4).map(iv => iv.title || iv.name || iv.ticker || iv.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'investments', 'decisions', 'records', 'entities']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(investment, decision) {
  const ivToks = new Set([
    ...tokens(investment.title),
    ...tokens(investment.name),
    ...tokens(investment.description),
    ...tokens(investment.sector),
    ...tokens(investment.type),
    ...tokens(investment.ticker),
  ].filter(Boolean));
  const dcToks = [
    ...tokens(decision.title),
    ...tokens(decision.name),
    ...tokens(decision.body_md),
    ...tokens(decision.description),
    ...tokens(decision.category),
  ].filter(Boolean);
  if (!ivToks.size || !dcToks.length) return 0;
  let hits = 0;
  for (const t of dcToks) if (ivToks.has(t)) hits++;
  return hits / Math.max(ivToks.size, dcToks.length);
}

function correlate(investments, decisions) {
  return investments.map(iv => {
    const scored = decisions
      .map(dec => ({ dec, score: matchScore(iv, dec) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...iv, _linked: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const ACCENT = '#8B5CF6';

export default function InvestmentDecisionCoverage() {
  const [open, setOpen] = useState(false);
  const [investments, setInvestments] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [ivR, dcR] = await Promise.allSettled([
        fetch(`${API}/entities/Investment`).then(r => r.json()),
        fetch(`${API}/v1/decision/list?limit=50`).then(r => r.json()),
      ]);
      setInvestments(normaliseArray(ivR.status === 'fulfilled' ? ivR.value : []));
      setDecisions(normaliseArray(dcR.status === 'fulfilled' ? dcR.value : []));
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) load();
    const id = open ? setInterval(load, 90000) : null;
    return () => { if (id) clearInterval(id); };
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:ivdc-toggle', h);
    return () => window.removeEventListener('jarvis:ivdc-toggle', h);
  }, []);

  const enriched = correlate(investments, decisions);
  const covered = enriched.filter(iv => iv._linked).length;
  const uncovered = enriched.filter(iv => !iv._linked).length;

  const filtered = enriched.filter(iv => {
    if (tab === 'COVERED' && !iv._linked) return false;
    if (tab === 'UNCOVERED' && iv._linked) return false;
    if (search) {
      const s = search.toLowerCase();
      const hay = `${iv.title || ''} ${iv.name || ''} ${iv.ticker || ''} ${iv.sector || ''} ${iv.type || ''}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  });

  const badgeCount = uncovered;
  const badgeCol = uncovered > 0 ? '#F59E0B' : '#22C55E';

  async function doAssess() {
    setAssessing(true); setAssessText('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message: `Investment × Decision Coverage: ${investments.length} investments, ${decisions.length} decisions. ${covered} covered, ${uncovered} uncovered. Top uncovered: ${enriched.filter(iv => !iv._linked).slice(0, 4).map(iv => iv.title || iv.name || iv.ticker || iv.id || '?').join(', ') || 'none'}. Give a 2-sentence investment-governance brief.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.result || JSON.stringify(d);
      setAssessText(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch (e) {
      setAssessText(`Error: ${e.message}`);
    }
    setAssessing(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Investment × Decision Coverage (IVDC)"
        style={{
          position: 'fixed',
          left: 474960,
          bottom: 8,
          zIndex: 197,
          background: open ? ACCENT : '#1e293b',
          border: `1px solid ${ACCENT}`,
          borderRadius: 6,
          color: '#e2e8f0',
          fontSize: 11,
          fontWeight: 700,
          padding: '4px 9px',
          cursor: 'pointer',
          letterSpacing: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        ◈ IVDC
        {badgeCount > 0 && (
          <span style={{ background: badgeCol, color: '#000', borderRadius: 8, fontSize: 10, padding: '0 5px', fontWeight: 800 }}>
            {badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          right: 24,
          bottom: 48,
          width: PANEL_W,
          height: PANEL_H,
          background: 'rgba(10,15,30,0.97)',
          border: `1px solid ${ACCENT}`,
          borderRadius: 12,
          zIndex: 9200,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: `0 0 40px rgba(139,92,246,0.25)`,
          overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: ACCENT, fontSize: 14, fontWeight: 800, letterSpacing: 1 }}>◈ INVESTMENT × DECISION COVERAGE</span>
            <span style={{ flex: 1 }} />
            {loading && <span style={{ color: '#64748b', fontSize: 11 }}>loading…</span>}
            <button onClick={load} title="Refresh" style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13 }}>↺</button>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '8px 16px', borderBottom: '1px solid #0f172a' }}>
            {[
              { label: 'INVESTMENTS', val: investments.length, col: ACCENT },
              { label: 'DECISIONS', val: decisions.length, col: '#06B6D4' },
              { label: 'COVERED', val: covered, col: '#22C55E' },
              { label: 'UNCOVERED', val: uncovered, col: '#F59E0B' },
            ].map(({ label, val, col }) => (
              <div key={label} style={{ flex: 1, background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                <div style={{ color: col, fontSize: 18, fontWeight: 800 }}>{val}</div>
                <div style={{ color: '#475569', fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, padding: '6px 16px', borderBottom: '1px solid #0f172a', alignItems: 'center' }}>
            {['ALL', 'COVERED', 'UNCOVERED'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? ACCENT : '#1e293b',
                border: '1px solid #334155',
                borderRadius: 4,
                color: tab === t ? '#fff' : '#94a3b8',
                fontSize: 10,
                fontWeight: 700,
                padding: '3px 8px',
                cursor: 'pointer',
                letterSpacing: 1,
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search investments…"
              style={{
                flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 4,
                color: '#e2e8f0', fontSize: 11, padding: '3px 8px',
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {err && <div style={{ color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}
            {!err && filtered.length === 0 && !loading && (
              <div style={{ color: '#475569', fontSize: 12, marginTop: 24, textAlign: 'center' }}>No investments match.</div>
            )}
            {filtered.map((iv, i) => {
              const key = iv.id || iv._id || i;
              const isRow = expanded === key;
              const label = iv.title || iv.name || iv.ticker || iv.id || '?';
              const cov = iv._linked;
              return (
                <div key={key} style={{ background: '#0f172a', borderRadius: 6, border: `1px solid ${cov ? '#166534' : '#78350f'}`, overflow: 'hidden' }}>
                  <div
                    onClick={() => setExpanded(isRow ? null : key)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
                  >
                    <span style={{
                      background: cov ? '#14532d' : '#451a03',
                      color: cov ? '#22C55E' : '#F59E0B',
                      borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '2px 6px', letterSpacing: 1,
                    }}>
                      {cov ? 'COVERED' : 'UNCOVERED'}
                    </span>
                    {iv.sector && (
                      <span style={{ background: '#1e293b', color: '#94a3b8', borderRadius: 4, fontSize: 9, padding: '1px 5px' }}>
                        {iv.sector}
                      </span>
                    )}
                    {iv.ticker && (
                      <span style={{ background: '#312e81', color: '#a5b4fc', borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '1px 5px' }}>
                        {iv.ticker}
                      </span>
                    )}
                    <span style={{ color: '#e2e8f0', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                    <span style={{ color: '#334155', fontSize: 11 }}>{isRow ? '▲' : '▼'}</span>
                  </div>

                  {isRow && (
                    <div style={{ borderTop: '1px solid #1e293b', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {iv.description && (
                        <div style={{ color: '#94a3b8', fontSize: 11, fontStyle: 'italic' }}>
                          {String(iv.description).slice(0, 200)}
                        </div>
                      )}
                      {iv._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#64748b', fontSize: 10, letterSpacing: 1 }}>MATCHED DECISIONS</div>
                          {iv._matches.map(({ dec, score }, si) => (
                            <div key={dec.id || dec._id || si} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{
                                background: dec.status === 'final' ? '#14532d' : '#451a03',
                                color: dec.status === 'final' ? '#22C55E' : '#F59E0B',
                                borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '1px 5px',
                              }}>
                                {dec.status || 'draft'}
                              </span>
                              <span style={{ color: '#cbd5e1', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {dec.title || dec.name || dec.id || '?'}
                              </span>
                              <div style={{ width: 60, background: '#1e293b', borderRadius: 2, height: 4 }}>
                                <div style={{ width: `${Math.round(score * 100)}%`, background: ACCENT, height: 4, borderRadius: 2 }} />
                              </div>
                              <span style={{ color: '#475569', fontSize: 10, width: 28, textAlign: 'right' }}>
                                {Math.round(score * 100)}%
                              </span>
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ color: '#F59E0B', fontSize: 11 }}>No matching decisions found for this investment.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid #1e293b' }}>
            {assessText && (
              <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.5 }}>{assessText}</div>
            )}
            <button
              onClick={doAssess}
              disabled={assessing}
              style={{
                background: assessing ? '#1e293b' : ACCENT,
                border: 'none', borderRadius: 6, color: '#fff',
                fontSize: 11, fontWeight: 700, padding: '5px 14px', cursor: 'pointer',
              }}
            >
              {assessing ? 'Assessing…' : '▶ ASSESS'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
