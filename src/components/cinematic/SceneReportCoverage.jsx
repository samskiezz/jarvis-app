import { useState, useEffect, useCallback } from 'react';

const API = '';
const SCENE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const SCNRPT_RE = /\b(scene[._-]?report|report[._-]?scene|scnrpt|unreported[._-]?scene|scene[._-]?report[._-]?coverage|which[._-]?scenes?[._-]?have[._-]?reports?|scenes?[._-]?with[._-]?reports?|scene[._-]?documentation|scene[._-]?intel[._-]?report|scene[._-]?backed[._-]?report|report[._-]?backed[._-]?scene)\b/i;

export function isScnrptQuery(t) {
  return SCNRPT_RE.test(t || '');
}

export async function buildScnrptScript() {
  const [sceneResults, rptR] = await Promise.allSettled([
    Promise.all(SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.json()).catch(() => null))),
    fetch(`${API}/v1/reports`).then(r => r.json()),
  ]);
  const rawScenes = sceneResults.status === 'fulfilled'
    ? sceneResults.value.filter(Boolean).map((s, i) => normaliseScene(s, SCENE_IDS[i]))
    : [];
  const reports = normaliseArray(rptR.status === 'fulfilled' ? rptR.value : [], 'reports');
  const enriched = correlate(rawScenes, reports);
  const unreported = enriched.filter(s => !s._covered).length;
  const reported = enriched.length - unreported;
  const topUnreported = enriched
    .filter(s => !s._covered)
    .slice(0, 3)
    .map(s => s._label)
    .join(', ') || 'none';
  return (
    `Scene × Report Coverage: ${enriched.length} cinematic scenes, ${reports.length} reports indexed. ` +
    `${reported} scene${reported !== 1 ? 's' : ''} have at least one intelligence report backing them (REPORTED); ` +
    `${unreported} scene${unreported !== 1 ? 's' : ''} have no report coverage (UNREPORTED — documentation gap). ` +
    `Unreported scenes: ${topUnreported}.`
  );
}

function normaliseScene(raw, id) {
  if (!raw) return { id, _label: `Scene ${id}`, _anchors: [] };
  const label = raw.title || raw.name || raw.scene_name || `Scene ${id}`;
  const anchors = Array.isArray(raw.anchors) ? raw.anchors : [];
  return { ...raw, id, _label: label, _anchors: anchors };
}

function normaliseArray(raw, hint) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const keys = [hint, 'reports', 'items', 'results', 'data', 'records'].filter(Boolean);
  for (const k of keys) if (Array.isArray(raw[k])) return raw[k];
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(t => t.length > 2);
}

function sceneTokens(scene) {
  const anchorTexts = scene._anchors.flatMap(a => {
    if (typeof a === 'string') return tokens(a);
    return [
      ...tokens(a.label), ...tokens(a.title), ...tokens(a.text),
      ...tokens(a.description), ...tokens(a.value), ...tokens(a.name),
    ];
  });
  return new Set([...tokens(scene._label), ...tokens(scene.description), ...anchorTexts].filter(Boolean));
}

function reportTokens(report) {
  return [
    ...tokens(report.title), ...tokens(report.name), ...tokens(report.summary),
    ...tokens(report.description), ...tokens(report.type), ...tokens(report.category),
    ...(Array.isArray(report.tags) ? report.tags.flatMap(t => tokens(t)) : []),
  ].filter(Boolean);
}

function matchScore(scene, report) {
  const sToks = sceneTokens(scene);
  const rToks = reportTokens(report);
  if (!sToks.size || !rToks.length) return 0;
  let hits = 0;
  for (const t of rToks) if (sToks.has(t)) hits++;
  return hits / Math.max(sToks.size, rToks.length);
}

function correlate(scenes, reports) {
  return scenes.map(scene => {
    const scored = reports
      .map(report => ({ report, score: matchScore(scene, report) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...scene, _matches: scored, _covered: scored.length > 0 };
  });
}

function reportTypeColor(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('threat') || t.includes('risk')) return '#ef4444';
  if (t.includes('intel') || t.includes('analysis')) return '#60a5fa';
  if (t.includes('ops') || t.includes('operation')) return '#f97316';
  if (t.includes('summary') || t.includes('brief')) return '#a78bfa';
  return '#64748b';
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

export default function SceneReportCoverage() {
  const [open, setOpen] = useState(false);
  const [scenes, setScenes] = useState([]);
  const [reports, setReports] = useState([]);
  const [enriched, setEnriched] = useState([]);
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
      const [sceneResults, rptR] = await Promise.allSettled([
        Promise.all(SCENE_IDS.map(id =>
          fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.json()).catch(() => null)
        )),
        fetch(`${API}/v1/reports`).then(r => r.json()),
      ]);
      const rawScenes = sceneResults.status === 'fulfilled'
        ? sceneResults.value.filter(Boolean).map((s, i) => normaliseScene(s, SCENE_IDS[i]))
        : [];
      const rawReports = normaliseArray(rptR.status === 'fulfilled' ? rptR.value : [], 'reports');
      setScenes(rawScenes);
      setReports(rawReports);
      setEnriched(correlate(rawScenes, rawReports));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:scnrpt-toggle', h);
    return () => window.removeEventListener('jarvis:scnrpt-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const unreported = enriched.filter(s => !s._covered).length;
    const reported = enriched.filter(s => s._covered).length;
    const topUnreported = enriched
      .filter(s => !s._covered)
      .map(s => s._label)
      .slice(0, 4)
      .join(', ') || 'none';
    const prompt =
      `Scene × Report Coverage: ${scenes.length} cinematic scenes, ${reports.length} reports. ` +
      `${reported} scenes have at least one intelligence report backing them (REPORTED); ` +
      `${unreported} scenes have no report coverage (UNREPORTED — documentation gap). ` +
      `Unreported scenes: ${topUnreported}. ` +
      `Give a 2-sentence scene-report coverage brief.`;
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

  const unreportedCount = enriched.filter(s => !s._covered).length;
  const badge = unreportedCount > 0 ? '#f59e0b' : '#22c55e';

  const visible = enriched.filter(scene => {
    const label = scene._label.toLowerCase();
    if (search && !label.includes(search.toLowerCase())) return false;
    if (tab === 'REPORTED') return scene._covered;
    if (tab === 'UNREPORTED') return !scene._covered;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Scene × Report Coverage"
        style={{
          position: 'fixed',
          left: 699200,
          bottom: 8,
          zIndex: 277,
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
          width: 8, height: 8, borderRadius: '50%',
          background: badge,
          boxShadow: unreportedCount > 0 ? `0 0 6px ${badge}` : 'none',
          display: 'inline-block',
        }} />
        SCNRPT
        {unreportedCount > 0 && (
          <span style={{ background: badge, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {unreportedCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 620,
          maxHeight: '80vh',
          overflowY: 'auto',
          background: 'rgba(10,15,30,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          zIndex: 9680,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#f59e0b' }}>◈ SCENE × REPORT COVERAGE</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 6, color: '#f59e0b', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'SCENES', val: scenes.length, color: '#60a5fa' },
              { label: 'REPORTS', val: reports.length, color: '#a78bfa' },
              { label: 'REPORTED', val: enriched.filter(s => s._covered).length, color: '#22c55e' },
              { label: 'UNREPORTED', val: unreportedCount, color: unreportedCount > 0 ? '#f59e0b' : '#64748b' },
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
            {['ALL', 'REPORTED', 'UNREPORTED'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tab === t ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  color: tab === t ? '#f59e0b' : '#94a3b8',
                  padding: '3px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: tab === t ? 700 : 400,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search scenes…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}

          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No scenes match the current filter.</div>
          )}

          <div>
            {visible.map((scene, i) => {
              const id = scene.id || i;
              const label = scene._label;
              const desc = scene.description || scene.summary || '';
              const isExp = expanded === id;
              return (
                <div
                  key={id}
                  style={{ ...ROW, background: isExp ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                  onClick={() => setExpanded(isExp ? null : id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      ...PILL,
                      background: scene._covered ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                      color: scene._covered ? '#22c55e' : '#f59e0b',
                      border: `1px solid ${scene._covered ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
                    }}>
                      {scene._covered ? 'REPORTED' : 'UNREPORTED'}
                    </span>
                    <span style={{ ...PILL, background: 'rgba(96,165,250,0.12)', color: '#93c5fd', border: '1px solid rgba(96,165,250,0.25)', fontSize: 10 }}>
                      SCENE {id}
                    </span>
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {scene._matches.length > 0 && (
                      <span style={{ color: '#64748b', fontSize: 10 }}>{scene._matches.length} report{scene._matches.length !== 1 ? 's' : ''}</span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {desc && (
                        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{String(desc).slice(0, 200)}</div>
                      )}
                      {scene._anchors.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <span style={{ color: '#475569', fontSize: 10 }}>Anchors: </span>
                          {scene._anchors.slice(0, 5).map((a, j) => {
                            const aLabel = typeof a === 'string' ? a : (a.label || a.title || a.text || '');
                            return aLabel ? (
                              <span key={j} style={{ ...PILL, background: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.2)', fontSize: 10 }}>{aLabel}</span>
                            ) : null;
                          })}
                        </div>
                      )}
                      {scene._matches.length > 0 ? (
                        <div>
                          <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Matched reports:</div>
                          {scene._matches.map(({ report, score }, j) => {
                            const rLabel = report.title || report.name || `Report ${j + 1}`;
                            const rType = report.type || report.category || '';
                            const rDate = report.date || report.created_at || report.year || '';
                            return (
                              <div key={j} style={{ marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ color: '#c4b5fd', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rLabel}</span>
                                  {rType && (
                                    <span style={{ ...PILL, background: `${reportTypeColor(rType)}22`, color: reportTypeColor(rType), border: `1px solid ${reportTypeColor(rType)}44` }}>
                                      {String(rType).toUpperCase()}
                                    </span>
                                  )}
                                  {rDate && (
                                    <span style={{ color: '#64748b', fontSize: 10 }}>{String(rDate).slice(0, 10)}</span>
                                  )}
                                  <span style={{ color: '#888', fontSize: 10 }}>{Math.round(score * 100)}%</span>
                                </div>
                                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: '#f59e0b', borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: '#f59e0b', fontSize: 11 }}>⚠ No intelligence report covers this scene — documentation gap.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {enriched.length} scenes · {reports.length} reports indexed · auto-refresh 120s
          </div>
        </div>
      )}
    </>
  );
}
