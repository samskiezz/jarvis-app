import { useState, useEffect, useCallback } from 'react';

const API = '';
const HLB_RE = /\b(history[._-]?lake|pattern[._-]?oracle|series[._-]?catalog|hlb|skill[._-]?metrics|forecast[._-]?skill|history[._-]?series|observation[._-]?data|data[._-]?series|history[._-]?lake[._-]?browser|predict[._-]?skill|skill[._-]?score)\b/i;

export function isHlbQuery(t) {
  return HLB_RE.test(t || '');
}

export async function buildHlbScript() {
  try {
    const [seriesRes, skillRes] = await Promise.all([
      fetch(`${API}/v1/history/series`).then(r => r.json()),
      fetch(`${API}/v1/predict/skill`).then(r => r.json()),
    ]);
    const items = Array.isArray(seriesRes.items) ? seriesRes.items : [];
    const totalObs = items.reduce((s, x) => s + (x.n_obs || 0), 0);
    const skill = skillRes.mean_skill_vs_baseline;
    const nScored = skillRes.n_scored || 0;
    return (
      `History Lake: ${items.length} series in catalog with ${totalObs.toLocaleString()} observations. ` +
      `Pattern Oracle skill: ${nScored > 0 ? `${nScored} scored forecasts, mean skill ${skill !== null && skill !== undefined ? skill.toFixed(3) : 'n/a'}.` : 'no scored forecasts yet.'}`
    );
  } catch {
    return 'History Lake: unable to reach history lake service.';
  }
}

function ageLabel(ms) {
  if (!ms) return '';
  const d = Date.now() - ms;
  if (d < 60000) return `${Math.floor(d / 1000)}s ago`;
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}

function tsLabel(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Sparkline({ points, width = 160, height = 32, color = '#22D3EE' }) {
  if (!points || points.length < 2) return <span style={{ color: '#4A5568', fontSize: 10 }}>no data</span>;
  const vals = points.map(p => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = height - ((p.value - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const PANEL_W = 560;
const PANEL_H = 580;
const ACCENT = '#22D3EE';
const BUTTON_LEFT = 484080;

export default function HistoryLakeBrowser() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('SERIES');
  const [series, setSeries] = useState([]);
  const [totalObs, setTotalObs] = useState(0);
  const [skill, setSkill] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [obsCache, setObsCache] = useState({});
  const [obsLoading, setObsLoading] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');

  const loadSeries = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const d = await fetch(`${API}/v1/history/series`).then(r => r.json());
      const items = Array.isArray(d.items) ? d.items : [];
      setSeries(items);
      setTotalObs(items.reduce((s, x) => s + (x.n_obs || 0), 0));
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  }, []);

  const loadSkill = useCallback(async () => {
    try {
      const d = await fetch(`${API}/v1/predict/skill`).then(r => r.json());
      setSkill(d);
    } catch {
      setSkill(null);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    loadSeries();
    loadSkill();
    const id = setInterval(loadSeries, 120000);
    return () => clearInterval(id);
  }, [open, loadSeries, loadSkill]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:hlb-toggle', h);
    return () => window.removeEventListener('jarvis:hlb-toggle', h);
  }, []);

  async function expandRow(sid) {
    if (expanded === sid) { setExpanded(null); return; }
    setExpanded(sid);
    if (obsCache[sid]) return;
    setObsLoading(o => ({ ...o, [sid]: true }));
    try {
      const d = await fetch(`${API}/v1/history/series/${encodeURIComponent(sid)}?limit=200`).then(r => r.json());
      setObsCache(c => ({ ...c, [sid]: Array.isArray(d.observations) ? d.observations : [] }));
    } catch {
      setObsCache(c => ({ ...c, [sid]: [] }));
    }
    setObsLoading(o => ({ ...o, [sid]: false }));
  }

  async function doAssess() {
    setAssessing(true); setAssessText('');
    try {
      const script = await buildHlbScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ message: `Provide a 2-sentence analysis of the History Lake status: ${script}` }),
      });
      const d = await r.json();
      const text = (d.answer || script).slice(0, 280);
      setAssessText(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      setAssessText(`History Lake: ${e.message}`);
    }
    setAssessing(false);
  }

  const badge = series.length > 0
    ? { bg: '#064E3B', color: '#34D399', text: String(series.length) }
    : { bg: '#1C1917', color: '#6B7280', text: '0' };

  const filtered = series.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (s.series_id || '').toLowerCase().includes(q) ||
      (s.entity || '').toLowerCase().includes(q) ||
      (s.metric || '').toLowerCase().includes(q) ||
      (s.source || '').toLowerCase().includes(q)
    );
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="History Lake Browser"
        style={{
          position: 'fixed', left: BUTTON_LEFT, bottom: 8, zIndex: 199,
          background: open ? ACCENT : 'rgba(10,14,20,0.82)',
          border: `1px solid ${ACCENT}55`, color: open ? '#04060A' : ACCENT,
          borderRadius: 6, padding: '3px 7px', fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: open ? `0 0 18px ${ACCENT}88` : 'none',
        }}
      >
        ◷ HLB
        <span style={{
          marginLeft: 5, background: badge.bg, color: badge.color,
          borderRadius: 8, padding: '1px 5px', fontSize: 9,
        }}>{badge.text}</span>
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: BUTTON_LEFT, bottom: 36, zIndex: 199,
          width: PANEL_W, height: PANEL_H,
          background: 'rgba(6,10,16,0.97)', border: `1px solid ${ACCENT}44`,
          borderRadius: 12, display: 'flex', flexDirection: 'column',
          fontFamily: "'JetBrains Mono',monospace", color: '#CBD5E1',
          boxShadow: `0 0 60px ${ACCENT}18`, backdropFilter: 'blur(12px)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '10px 14px 8px', borderBottom: `1px solid ${ACCENT}22`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: ACCENT, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>HISTORY LAKE</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#64748B' }}>PATTERN ORACLE</span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: `1px solid ${ACCENT}11` }}>
            {[
              { label: 'SERIES', val: series.length },
              { label: 'TOTAL OBS', val: totalObs > 999 ? `${(totalObs / 1000).toFixed(1)}k` : String(totalObs) },
              { label: 'N SCORED', val: skill?.n_scored ?? '—' },
              { label: 'MEAN SKILL', val: skill?.mean_skill_vs_baseline !== null && skill?.mean_skill_vs_baseline !== undefined ? skill.mean_skill_vs_baseline.toFixed(3) : '—' },
            ].map(({ label, val }) => (
              <div key={label} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '5px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#64748B', letterSpacing: 1 }}>{label}</div>
                <div style={{ fontSize: 14, color: ACCENT, fontWeight: 700 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: `1px solid ${ACCENT}22` }}>
            {['SERIES', 'SKILL'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '3px 10px', borderRadius: 5, fontSize: 10, letterSpacing: 1, cursor: 'pointer',
                border: `1px solid ${tab === t ? ACCENT : ACCENT + '33'}`,
                background: tab === t ? `${ACCENT}22` : 'transparent',
                color: tab === t ? ACCENT : '#64748B',
              }}>{t}</button>
            ))}
            {tab === 'SERIES' && (
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="search series…"
                style={{
                  marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: `1px solid ${ACCENT}33`,
                  borderRadius: 5, padding: '3px 8px', fontSize: 10, color: '#CBD5E1', outline: 'none', width: 160,
                }}
              />
            )}
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
            {loading && <div style={{ color: '#64748B', fontSize: 11, padding: 12 }}>Loading…</div>}
            {err && <div style={{ color: '#F43F5E', fontSize: 11, padding: 12 }}>Error: {err}</div>}

            {tab === 'SERIES' && !loading && (
              <>
                {filtered.length === 0 && (
                  <div style={{ color: '#64748B', fontSize: 11, padding: '20px 0', textAlign: 'center' }}>
                    {series.length === 0 ? 'No series ingested yet.' : 'No matches.'}
                  </div>
                )}
                {filtered.map(s => {
                  const isExp = expanded === s.series_id;
                  const obs = obsCache[s.series_id];
                  const obsLoad = obsLoading[s.series_id];
                  return (
                    <div key={s.series_id} style={{ marginBottom: 6, background: 'rgba(255,255,255,0.03)', borderRadius: 7, overflow: 'hidden', border: `1px solid ${ACCENT}18` }}>
                      <div
                        onClick={() => expandRow(s.series_id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
                      >
                        <span style={{ color: ACCENT, fontSize: 10 }}>{isExp ? '▼' : '▶'}</span>
                        <span style={{ fontSize: 11, color: '#E2E8F0', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.series_id}
                        </span>
                        <span style={{ fontSize: 9, color: '#94A3B8', background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '2px 5px' }}>
                          {s.source || '—'}
                        </span>
                        <span style={{ fontSize: 9, color: '#64748B' }}>{s.metric || '—'}</span>
                        <span style={{ fontSize: 10, color: '#34D399', background: '#064E3B', borderRadius: 8, padding: '1px 6px', marginLeft: 4 }}>
                          {s.n_obs ?? 0} obs
                        </span>
                      </div>
                      {isExp && (
                        <div style={{ padding: '6px 10px 10px', borderTop: `1px solid ${ACCENT}18` }}>
                          <div style={{ display: 'flex', gap: 16, marginBottom: 6, flexWrap: 'wrap' }}>
                            <div style={{ fontSize: 9, color: '#64748B' }}>
                              <span style={{ color: '#94A3B8' }}>entity: </span>{s.entity || '—'}
                            </div>
                            <div style={{ fontSize: 9, color: '#64748B' }}>
                              <span style={{ color: '#94A3B8' }}>freq: </span>{s.freq || '—'}
                            </div>
                            {s.unit && (
                              <div style={{ fontSize: 9, color: '#64748B' }}>
                                <span style={{ color: '#94A3B8' }}>unit: </span>{s.unit}
                              </div>
                            )}
                            <div style={{ fontSize: 9, color: '#64748B' }}>
                              <span style={{ color: '#94A3B8' }}>first: </span>{tsLabel(s.first_ts)}
                            </div>
                            <div style={{ fontSize: 9, color: '#64748B' }}>
                              <span style={{ color: '#94A3B8' }}>last: </span>{tsLabel(s.last_ts)}
                            </div>
                          </div>
                          {obsLoad && <div style={{ fontSize: 10, color: '#64748B' }}>Loading observations…</div>}
                          {obs && obs.length > 0 && (
                            <div>
                              <Sparkline points={obs} width={480} height={36} color={ACCENT} />
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                                <span style={{ fontSize: 9, color: '#64748B' }}>
                                  min {Math.min(...obs.map(o => o.value)).toFixed(2)}
                                </span>
                                <span style={{ fontSize: 9, color: '#64748B' }}>
                                  max {Math.max(...obs.map(o => o.value)).toFixed(2)}
                                </span>
                                <span style={{ fontSize: 9, color: '#64748B' }}>
                                  {obs.length} pts
                                </span>
                              </div>
                            </div>
                          )}
                          {obs && obs.length === 0 && (
                            <div style={{ fontSize: 10, color: '#64748B' }}>No observations stored.</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {tab === 'SKILL' && (
              <div style={{ padding: '8px 0' }}>
                {!skill ? (
                  <div style={{ color: '#64748B', fontSize: 11 }}>Skill data unavailable.</div>
                ) : (
                  <>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10, color: '#64748B', marginBottom: 8, letterSpacing: 1 }}>ROLLING FORECAST SKILL (ALL DOMAINS)</div>
                      {[
                        { label: 'Scored Forecasts', val: skill.n_scored ?? 0, unit: '', max: null },
                        { label: 'MAE', val: skill.mae, unit: '', max: null },
                        { label: 'RMSE', val: skill.rmse, unit: '', max: null },
                        { label: 'Interval Coverage', val: skill.coverage, unit: '%', pct: true },
                        { label: 'Mean Skill vs Baseline', val: skill.mean_skill_vs_baseline, unit: '', pct: false, signed: true },
                      ].map(({ label, val, unit, pct, signed }) => (
                        <div key={label} style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontSize: 10, color: '#94A3B8' }}>{label}</span>
                            <span style={{ fontSize: 11, color: ACCENT, fontWeight: 600 }}>
                              {val === null || val === undefined
                                ? '—'
                                : pct
                                  ? `${(val * 100).toFixed(1)}%`
                                  : signed
                                    ? (val >= 0 ? `+${val.toFixed(4)}` : val.toFixed(4))
                                    : typeof val === 'number'
                                      ? val.toFixed(4)
                                      : String(val)
                              }{unit}
                            </span>
                          </div>
                          {pct && val !== null && val !== undefined && (
                            <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(100, val * 100)}%`, height: '100%', background: ACCENT, borderRadius: 2 }} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {skill.domain && (
                      <div style={{ fontSize: 9, color: '#64748B' }}>Domain filter: {skill.domain}</div>
                    )}
                    {!skill.domain && (
                      <div style={{ fontSize: 9, color: '#64748B', marginTop: 4 }}>Aggregate across all domains.</div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '8px 14px', borderTop: `1px solid ${ACCENT}18`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={doAssess}
              disabled={assessing}
              style={{
                background: `${ACCENT}22`, border: `1px solid ${ACCENT}55`, color: ACCENT,
                borderRadius: 5, padding: '4px 12px', fontSize: 10, cursor: 'pointer', letterSpacing: 1,
                opacity: assessing ? 0.6 : 1,
              }}
            >
              {assessing ? '…' : '▶ ASSESS'}
            </button>
            {assessText && (
              <span style={{ fontSize: 10, color: '#94A3B8', flex: 1, lineHeight: 1.4 }}>{assessText}</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
