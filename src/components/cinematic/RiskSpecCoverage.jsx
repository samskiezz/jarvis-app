import { useState, useEffect, useCallback } from 'react';

const API = '';
const RSSC_RE = /\b(risk[._-]?spec|spec[._-]?risk|rssc|risk[._-]?coverage|uncovered[._-]?risk|risk[._-]?specification|risk[._-]?spec[._-]?gap|spec[._-]?backed[._-]?risk|risk[._-]?to[._-]?spec|spec[._-]?for[._-]?risk|which[._-]?risks[._-]?have[._-]?spec)\b/i;

export function isRsscQuery(t) {
  return RSSC_RE.test(t || '');
}

export async function buildRsscScript() {
  const [rsR, spR] = await Promise.allSettled([
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
    fetch(`${API}/v1/spec/list`).then(r => r.json()),
  ]);
  const risks = normaliseArray(rsR.status === 'fulfilled' ? rsR.value : []);
  const specs = normaliseArray(spR.status === 'fulfilled' ? spR.value : []);
  const enriched = correlate(risks, specs);
  const covered = enriched.filter(r => r._linked).length;
  const uncovered = enriched.filter(r => !r._linked).length;
  return (
    `Risk Signal × Spec Coverage: ${risks.length} risk signals, ${specs.length} specs indexed. ` +
    `${covered} risk signals are COVERED (matched to specs); ${uncovered} are UNCOVERED. ` +
    `Top uncovered: ${enriched.filter(r => !r._linked).slice(0, 4).map(r => r.name || r.title || r.category || r.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'risks', 'risk_signals', 'signals', 'specs', 'records', 'entities']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(risk, spec) {
  const riskToks = new Set([
    ...tokens(risk.name),
    ...tokens(risk.title),
    ...tokens(risk.description),
    ...tokens(risk.category),
    ...tokens(risk.sector),
    ...tokens(risk.source),
    ...tokens(risk.type),
  ].filter(Boolean));
  const specToks = [
    ...tokens(spec.title),
    ...tokens(spec.name),
    ...tokens(spec.description),
    ...tokens(spec.content),
    ...tokens(spec.kind),
  ].filter(Boolean);
  if (!riskToks.size || !specToks.length) return 0;
  let hits = 0;
  for (const t of specToks) if (riskToks.has(t)) hits++;
  return hits / Math.max(riskToks.size, specToks.length);
}

function correlate(risks, specs) {
  return risks.map(risk => {
    const scored = specs
      .map(spec => ({ spec, score: matchScore(risk, spec) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...risk, _linked: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;

export default function RiskSpecCoverage() {
  const [open, setOpen] = useState(false);
  const [risks, setRisks] = useState([]);
  const [specs, setSpecs] = useState([]);
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
      const [rsR, spR] = await Promise.allSettled([
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
        fetch(`${API}/v1/spec/list`).then(r => r.json()),
      ]);
      setRisks(normaliseArray(rsR.status === 'fulfilled' ? rsR.value : []));
      setSpecs(normaliseArray(spR.status === 'fulfilled' ? spR.value : []));
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
    window.addEventListener('jarvis:rssc-toggle', h);
    return () => window.removeEventListener('jarvis:rssc-toggle', h);
  }, []);

  const enriched = correlate(risks, specs);
  const covered = enriched.filter(r => r._linked).length;
  const uncovered = enriched.filter(r => !r._linked).length;

  const filtered = enriched.filter(r => {
    if (tab === 'COVERED' && !r._linked) return false;
    if (tab === 'UNCOVERED' && r._linked) return false;
    if (search) {
      const s = search.toLowerCase();
      const hay = `${r.name || ''} ${r.title || ''} ${r.category || ''} ${r.sector || ''} ${r.description || ''}`.toLowerCase();
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
          message: `Risk Signal × Spec Coverage: ${risks.length} risk signals, ${specs.length} specs. ${covered} covered, ${uncovered} uncovered. Top uncovered: ${enriched.filter(r => !r._linked).slice(0, 4).map(r => r.name || r.title || r.id || '?').join(', ') || 'none'}. Give a 2-sentence risk-governance brief.`,
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
      {/* dock button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Risk Signal × Spec Coverage (RSSC)"
        style={{
          position: 'fixed',
          left: 465840,
          bottom: 8,
          zIndex: 195,
          background: open ? '#6366F1' : '#1e293b',
          border: '1px solid #6366F1',
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
        ◈ RSSC
        {badgeCount > 0 && (
          <span style={{ background: badgeCol, color: '#000', borderRadius: 8, fontSize: 10, padding: '0 5px', fontWeight: 800 }}>
            {badgeCount}
          </span>
        )}
      </button>

      {/* panel */}
      {open && (
        <div style={{
          position: 'fixed',
          right: 24,
          bottom: 48,
          width: PANEL_W,
          height: PANEL_H,
          background: 'rgba(10,15,30,0.97)',
          border: '1px solid #6366F1',
          borderRadius: 12,
          zIndex: 9200,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 0 40px rgba(99,102,241,0.25)',
          overflow: 'hidden',
        }}>
          {/* header */}
          <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#6366F1', fontSize: 14, fontWeight: 800, letterSpacing: 1 }}>◈ RISK SIGNAL × SPEC COVERAGE</span>
            <span style={{ flex: 1 }} />
            {loading && <span style={{ color: '#64748b', fontSize: 11 }}>loading…</span>}
            <button onClick={load} title="Refresh" style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13 }}>↺</button>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 16px', borderBottom: '1px solid #0f172a' }}>
            {[
              { label: 'RISK SIGNALS', val: risks.length, col: '#6366F1' },
              { label: 'SPECS', val: specs.length, col: '#06B6D4' },
              { label: 'COVERED', val: covered, col: '#22C55E' },
              { label: 'UNCOVERED', val: uncovered, col: '#F59E0B' },
            ].map(({ label, val, col }) => (
              <div key={label} style={{ flex: 1, background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                <div style={{ color: col, fontSize: 18, fontWeight: 800 }}>{val}</div>
                <div style={{ color: '#475569', fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter row */}
          <div style={{ display: 'flex', gap: 6, padding: '6px 16px', borderBottom: '1px solid #0f172a', alignItems: 'center' }}>
            {['ALL', 'COVERED', 'UNCOVERED'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? '#6366F1' : '#1e293b',
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
              placeholder="search risk signals…"
              style={{
                flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 4,
                color: '#e2e8f0', fontSize: 11, padding: '3px 8px',
              }}
            />
          </div>

          {/* list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {err && <div style={{ color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}
            {!err && filtered.length === 0 && !loading && (
              <div style={{ color: '#475569', fontSize: 12, marginTop: 24, textAlign: 'center' }}>No risk signals match.</div>
            )}
            {filtered.map((risk, i) => {
              const key = risk.id || risk._id || i;
              const isOpen = expanded === key;
              const label = risk.name || risk.title || risk.category || risk.id || '?';
              const cov = risk._linked;
              return (
                <div key={key} style={{ background: '#0f172a', borderRadius: 6, border: `1px solid ${cov ? '#166534' : '#78350f'}`, overflow: 'hidden' }}>
                  <div
                    onClick={() => setExpanded(isOpen ? null : key)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
                  >
                    <span style={{
                      background: cov ? '#14532d' : '#451a03',
                      color: cov ? '#22C55E' : '#F59E0B',
                      borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '2px 6px', letterSpacing: 1,
                    }}>
                      {cov ? 'COVERED' : 'UNCOVERED'}
                    </span>
                    {risk.category && (
                      <span style={{ background: '#1e293b', color: '#94a3b8', borderRadius: 4, fontSize: 9, padding: '1px 5px' }}>
                        {risk.category}
                      </span>
                    )}
                    <span style={{ color: '#e2e8f0', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                    <span style={{ color: '#334155', fontSize: 11 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>

                  {isOpen && (
                    <div style={{ borderTop: '1px solid #1e293b', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {risk.description && (
                        <div style={{ color: '#94a3b8', fontSize: 11, fontStyle: 'italic' }}>
                          {String(risk.description).slice(0, 200)}
                        </div>
                      )}
                      {risk._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#64748b', fontSize: 10, letterSpacing: 1 }}>MATCHED SPECS</div>
                          {risk._matches.map(({ spec, score }, si) => (
                            <div key={spec.id || spec._id || si} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{
                                background: spec.status === 'approved' ? '#14532d' : '#451a03',
                                color: spec.status === 'approved' ? '#22C55E' : '#F59E0B',
                                borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '1px 5px',
                              }}>
                                {spec.status || 'draft'}
                              </span>
                              <span style={{ color: '#cbd5e1', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {spec.title || spec.name || spec.id || '?'}
                              </span>
                              <div style={{ width: 60, background: '#1e293b', borderRadius: 2, height: 4 }}>
                                <div style={{ width: `${Math.round(score * 100)}%`, background: '#6366F1', height: 4, borderRadius: 2 }} />
                              </div>
                              <span style={{ color: '#475569', fontSize: 10, width: 28, textAlign: 'right' }}>
                                {Math.round(score * 100)}%
                              </span>
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ color: '#F59E0B', fontSize: 11 }}>No matching specs found for this risk signal.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* assess footer */}
          <div style={{ padding: '8px 16px', borderTop: '1px solid #1e293b' }}>
            {assessText && (
              <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.5 }}>{assessText}</div>
            )}
            <button
              onClick={doAssess}
              disabled={assessing}
              style={{
                background: assessing ? '#1e293b' : '#6366F1',
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
