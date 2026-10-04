import { useState, useEffect, useCallback } from 'react';

const API = '';
const IGAP_RE = /\b(intel[._-]?gap|decision[._-]?intel|igap|intel[._-]?coverage|uncovered[._-]?intel|intel[._-]?decision|intel[._-]?decision[._-]?coverage|which[._-]?intel[._-]?has[._-]?no[._-]?decisions|intelligence[._-]?gap|decision[._-]?coverage[._-]?intel)\b/i;

export function isIgapQuery(t) {
  return IGAP_RE.test(t || '');
}

export async function buildIgapScript() {
  const [intelR, decR] = await Promise.allSettled([
    fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
    fetch(`${API}/v1/decision/list?limit=50`).then(r => r.json()),
  ]);
  const intel = normaliseArray(intelR.status === 'fulfilled' ? intelR.value : []);
  const decisions = normaliseArray(decR.status === 'fulfilled' ? decR.value : []);
  const correlated = correlateIntel(intel, decisions);
  const uncovered = correlated.filter(i => !i._covered).length;
  const covered = correlated.filter(i => i._covered).length;
  const topUncovered = correlated.filter(i => !i._covered).slice(0, 4).map(i => i._label || i.id || '?').join(', ');
  return (
    `Intel × Decision Gap Finder: ${intel.length} intel profiles assessed against ${decisions.length} decisions — ` +
    `${covered} COVERED (decision backing found), ${uncovered} UNCOVERED (no decision tracks this intel). ` +
    `Uncovered intel: ${topUncovered || 'none'}.`
  );
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'records', 'entities', 'decisions', 'profiles']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(aToks, candidateFields) {
  if (!aToks.length) return 0;
  const cToks = candidateFields.flatMap(f => tokens(f)).filter(Boolean);
  if (!cToks.length) return 0;
  const cSet = new Set(cToks);
  let hits = 0;
  for (const t of aToks) if (cSet.has(t)) hits++;
  return hits / Math.max(aToks.length, cToks.length);
}

function correlateIntel(intel, decisions) {
  return intel.map(profile => {
    const label =
      profile.name || profile.title || profile.subject || profile.label ||
      profile.description || profile.id || '';
    const intelToks = tokens(label);

    const decisionMatches = decisions
      .map(d => ({
        d,
        score: matchScore(intelToks, [
          d.title, d.body_md, d.body, d.summary, d.category, d.tags,
        ]),
      }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    const covered = decisionMatches.length > 0;
    const topQuality = decisionMatches.length > 0
      ? (decisionMatches[0].d.quality_score ?? decisionMatches[0].d.quality ?? null)
      : null;

    return { ...profile, _label: label, _covered: covered, _decisionMatches: decisionMatches, _topQuality: topQuality };
  });
}

function qualityColor(q) {
  if (q == null) return '#60a5fa';
  if (q >= 0.75) return '#22c55e';
  if (q >= 0.45) return '#f59e0b';
  return '#ef4444';
}

function statusChip(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'final') return { bg: '#22c55e22', color: '#22c55e', border: '#22c55e55' };
  if (v === 'reviewed') return { bg: '#60a5fa22', color: '#60a5fa', border: '#60a5fa55' };
  if (v === 'draft') return { bg: '#f59e0b22', color: '#f59e0b', border: '#f59e0b55' };
  return { bg: 'rgba(148,163,184,0.1)', color: '#94a3b8', border: 'rgba(148,163,184,0.2)' };
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

export default function IntelDecisionGapFinder() {
  const [open, setOpen] = useState(false);
  const [intel, setIntel] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [correlated, setCorrelated] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [intelR, decR] = await Promise.allSettled([
        fetch(`${API}/entities/IntelProfile`).then(r => r.json()),
        fetch(`${API}/v1/decision/list?limit=50`).then(r => r.json()),
      ]);
      const its = normaliseArray(intelR.status === 'fulfilled' ? intelR.value : []);
      const decs = normaliseArray(decR.status === 'fulfilled' ? decR.value : []);
      setIntel(its);
      setDecisions(decs);
      setCorrelated(correlateIntel(its, decs));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:igap-toggle', h);
    return () => window.removeEventListener('jarvis:igap-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const uncovered = correlated.filter(i => !i._covered);
    const prompt =
      `Intel × Decision Gap Finder: ${intel.length} intel profiles, ${decisions.length} decisions. ` +
      `${correlated.length - uncovered.length} COVERED (decision backing), ${uncovered.length} UNCOVERED. ` +
      `Uncovered intel: ${uncovered.slice(0, 5).map(i => i._label || i.id || '?').join(', ') || 'none'}. ` +
      `Give a 2-sentence intel-governance brief.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      }).then(r => r.json());
      const txt = r?.response || r?.answer || r?.message || r?.content || JSON.stringify(r);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const uncoveredCount = correlated.filter(i => !i._covered).length;
  const badgeColor = uncoveredCount > 0 ? '#f59e0b' : '#22c55e';

  const visible = correlated.filter(item => {
    const label = (item._label || item.id || '').toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'COVERED') return item._covered;
    if (tab === 'UNCOVERED') return !item._covered;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Intel × Decision Gap Finder"
        style={{
          position: 'fixed',
          left: 424800,
          bottom: 8,
          zIndex: 186,
          background: 'rgba(15,23,42,0.85)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          color: '#e2e8f0',
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          letterSpacing: 1,
        }}
      >
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: badgeColor,
          boxShadow: uncoveredCount > 0 ? `0 0 6px ${badgeColor}` : 'none',
          display: 'inline-block',
        }} />
        IGAP
        {uncoveredCount > 0 && (
          <span style={{ background: badgeColor, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {uncoveredCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 580,
          maxHeight: '82vh',
          overflowY: 'auto',
          background: 'rgba(10,15,30,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          zIndex: 9600,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#f59e0b' }}>◈ INTEL × DECISION GAP FINDER</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 6, color: '#f59e0b', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={load} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#94a3b8', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}>
                ↺
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'INTEL', val: intel.length, color: '#60a5fa' },
              { label: 'DECISIONS', val: decisions.length, color: '#a78bfa' },
              { label: 'COVERED', val: correlated.length - uncoveredCount, color: '#22c55e' },
              { label: 'UNCOVERED', val: uncoveredCount, color: '#f59e0b' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 12, color: '#fcd34d', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'COVERED', 'UNCOVERED'].map(t => {
              const accent = t === 'COVERED' ? '#22c55e' : t === 'UNCOVERED' ? '#f59e0b' : '#60a5fa';
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    background: tab === t ? `${accent}22` : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${tab === t ? `${accent}66` : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 6,
                    color: tab === t ? accent : '#94a3b8',
                    padding: '3px 10px',
                    fontSize: 11,
                    cursor: 'pointer',
                    fontWeight: tab === t ? 700 : 400,
                  }}
                >
                  {t}
                </button>
              );
            })}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search intel profiles…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}
          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No intel profiles match the current filter.</div>
          )}

          <div>
            {visible.map((item, i) => {
              const id = item.id || item.intel_id || i;
              const label = item._label || `Intel ${id}`;
              const isExp = expanded === id;
              const covColor = item._covered ? '#22c55e' : '#f59e0b';
              const covLabel = item._covered ? 'COVERED' : 'UNCOVERED';
              const kind = item.kind || item.type || item.category || '';
              return (
                <div
                  key={id}
                  style={{ ...ROW, background: isExp ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                  onClick={() => setExpanded(isExp ? null : id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      ...PILL,
                      background: `${covColor}22`,
                      color: covColor,
                      border: `1px solid ${covColor}55`,
                      boxShadow: !item._covered ? `0 0 5px ${covColor}44` : 'none',
                    }}>
                      {covLabel}
                    </span>
                    {kind && (
                      <span style={{ ...PILL, background: 'rgba(167,139,250,0.1)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.2)' }}>
                        {kind}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {item._covered && item._topQuality != null && (
                      <span style={{ ...PILL, background: `${qualityColor(item._topQuality)}22`, color: qualityColor(item._topQuality), border: `1px solid ${qualityColor(item._topQuality)}44`, marginRight: 0 }}>
                        Q {Math.round(item._topQuality * 100)}%
                      </span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {item._decisionMatches.length > 0 ? (
                        <>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Matched decisions:</div>
                          {item._decisionMatches.map(({ d, score }, j) => {
                            const decLabel = d.title || d.summary || d.id || `decision-${j}`;
                            const st = d.status || d.state || '';
                            const q = d.quality_score ?? d.quality ?? null;
                            const chip = statusChip(st);
                            return (
                              <div key={j} style={{ marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ color: '#a78bfa', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{decLabel}</span>
                                  {st && (
                                    <span style={{ ...PILL, background: chip.bg, color: chip.color, border: `1px solid ${chip.border}` }}>
                                      {st}
                                    </span>
                                  )}
                                  {q != null && (
                                    <span style={{ color: qualityColor(q), fontSize: 10 }}>Q {Math.round(q * 100)}%</span>
                                  )}
                                  <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}% match</span>
                                </div>
                                <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: '#a78bfa', borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div style={{ color: '#f59e0b', fontSize: 11 }}>⚠ No decision governance found for this intel profile.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {correlated.length} intel · {decisions.length} decisions · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
