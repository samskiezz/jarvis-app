/**
 * TemporalTimelineExplorer — F272
 *
 * Interactive time-series explorer wired to the real temporal backend:
 *   GET /v1/temporal/series        — series catalog (dropdown)
 *   GET /v1/temporal/range         — observations as dots on SVG timeline
 *   GET /v1/temporal/events        — threshold-crossing events as red markers
 *
 * Toggle: ◈ TMPTML button (fixed, bottom strip) left:200120, zIndex:368
 * Features:
 *   - series_id dropdown pre-populated from /v1/temporal/series
 *   - date-range epoch-ms inputs (t0 / t1) with "last 24h / 7d / 30d" quick picks
 *   - SVG horizontal time axis with observation dots
 *   - Red vertical markers for threshold-crossing events
 *   - Stats bar: n / min / max / mean / std above chart
 *   - Brush-to-zoom: drag on the SVG canvas narrows t0/t1 and re-fetches
 *   - ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "tmptml"/"temporal timeline"/"time series"/"temporal explorer"/"series timeline"
 * Event: jarvis:tmptml-toggle
 * Auto-refresh: none (manual + brush interaction driven)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const CY  = '#00E5FF';
const RED = '#FF3860';
const GRN = '#00FF88';
const AMB = '#F59E0B';
const DIM = '#1A2A3A';
const BRD = '#0D1B2A';
const TXT = '#DCEBF5';
const MUT = '#6E8AA0';

const W = 680;
const H = 110;
const PAD = { l: 48, r: 16, t: 12, b: 28 };

function isoToMs(iso) {
  const d = new Date(iso);
  return isNaN(d) ? null : d.getTime();
}

function fmtMs(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

function fmtNum(v, dp = 3) {
  if (v == null || isNaN(v)) return '—';
  return Number(v).toFixed(dp);
}

function quickRange(label) {
  const now = Date.now();
  const h = 3600000;
  if (label === '1h')  return { t0: now - h,       t1: now };
  if (label === '6h')  return { t0: now - 6*h,     t1: now };
  if (label === '24h') return { t0: now - 24*h,    t1: now };
  if (label === '7d')  return { t0: now - 7*24*h,  t1: now };
  if (label === '30d') return { t0: now - 30*24*h, t1: now };
  return null;
}

export function isTmptmlQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'tmptml','temporal timeline','time series explorer','temporal explorer',
    'series timeline','time series','temporal series','temporal analysis',
    'timeline explorer','time explorer',
  ].some(kw => s.includes(kw));
}

export function buildTmptmlScript() {
  return `Inspect the temporal timeline explorer. Summarise the selected series name, time range, observation count, statistics (min/max/mean), and threshold-crossing event count. Identify any notable anomalies or trend in two sentences.`;
}

export default function TemporalTimelineExplorer() {
  const [open,       setOpen]       = useState(false);
  const [seriesList, setSeriesList] = useState([]);
  const [seriesId,   setSeriesId]   = useState('');
  const [t0,         setT0]         = useState(() => Date.now() - 24*3600000);
  const [t1,         setT1]         = useState(() => Date.now());
  const [points,     setPoints]     = useState([]);
  const [events,     setEvents]     = useState([]);
  const [stats,      setStats]      = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState('');
  const svgRef = useRef(null);
  const brushRef = useRef(null); // { startX, startPx }

  // load series catalog once
  useEffect(() => {
    if (!open) return;
    fetch(`${apiBase()}/v1/temporal/series`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    })
      .then(r => r.json())
      .then(d => {
        const ids = Array.isArray(d?.series) ? d.series : [];
        setSeriesList(ids);
        if (ids.length > 0 && !seriesId) setSeriesId(ids[0]);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fetchData = useCallback(() => {
    if (!seriesId) return;
    setLoading(true);
    setPoints([]); setEvents([]); setStats(null);
    const base = apiBase();
    const hdrs = { Authorization: `Bearer ${API_KEY}` };
    Promise.all([
      fetch(`${base}/v1/temporal/range?series_id=${encodeURIComponent(seriesId)}&t0=${t0}&t1=${t1}`, { headers: hdrs }).then(r => r.json()),
      fetch(`${base}/v1/temporal/events?series_id=${encodeURIComponent(seriesId)}`, { headers: hdrs }).then(r => r.json()),
    ])
      .then(([rangeData, evData]) => {
        setPoints(Array.isArray(rangeData?.points) ? rangeData.points : []);
        setStats(rangeData?.stats || null);
        const evArr = Array.isArray(evData?.events) ? evData.events : [];
        setEvents(evArr.filter(e => e.t >= t0 && e.t <= t1));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [seriesId, t0, t1]);

  useEffect(() => {
    if (open && seriesId) fetchData();
  }, [open, seriesId, fetchData]);

  // toggle via event
  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:tmptml-toggle', onToggle);
    return () => window.removeEventListener('jarvis:tmptml-toggle', onToggle);
  }, []);

  // SVG coordinate helpers
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  function tToX(t) {
    if (t1 === t0) return PAD.l;
    return PAD.l + ((t - t0) / (t1 - t0)) * innerW;
  }

  function vToY(v, minV, maxV) {
    if (maxV === minV) return PAD.t + innerH / 2;
    return PAD.t + innerH - ((v - minV) / (maxV - minV)) * innerH;
  }

  // brush-to-zoom
  function onMouseDown(e) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pxX = e.clientX - rect.left;
    brushRef.current = { startX: pxX };
    e.preventDefault();
  }

  function onMouseUp(e) {
    if (!brushRef.current) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const endX = e.clientX - rect.left;
    const startX = brushRef.current.startX;
    brushRef.current = null;
    const svgW = rect.width;
    const frac0 = Math.max(0, Math.min(1, (Math.min(startX, endX) - PAD.l) / innerW));
    const frac1 = Math.max(0, Math.min(1, (Math.max(startX, endX) - PAD.l) / innerW));
    if (Math.abs(frac1 - frac0) < 0.02) return; // too small — ignore
    const span = t1 - t0;
    const newT0 = Math.round(t0 + frac0 * span);
    const newT1 = Math.round(t0 + frac1 * span);
    setT0(newT0);
    setT1(newT1);
  }

  // assess
  const handleAssess = async () => {
    if (!seriesId) return;
    setAssessing(true); setAssessment('');
    const script = buildTmptmlScript() + ` Series: ${seriesId}. Stats: ${JSON.stringify(stats)}. Points: ${points.length}. Events: ${events.length}.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const txt = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim() || 'No assessment returned.';
      setAssessment(txt);
      // TTS
      try {
        const tr = await fetch(`${apiBase()}/v1/voice/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: txt.slice(0, 400) }),
        });
        const tb = await tr.arrayBuffer();
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const buf = await ctx.decodeAudioData(tb);
        const src = ctx.createBufferSource();
        src.buffer = buf; src.connect(ctx.destination); src.start(0);
      } catch {}
    } catch { setAssessment('Assessment unavailable.'); }
    finally { setAssessing(false); }
  };

  // chart render
  const minV = stats?.min ?? (points.length ? Math.min(...points.map(p => p.v)) : 0);
  const maxV = stats?.max ?? (points.length ? Math.max(...points.map(p => p.v)) : 1);
  const tickCount = 4;
  const tTicks = Array.from({ length: tickCount + 1 }, (_, i) => t0 + (i / tickCount) * (t1 - t0));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 200120, zIndex: 368,
          background: 'rgba(0,229,255,0.10)', border: `1px solid ${CY}55`,
          color: CY, fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          letterSpacing: 2, padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
          backdropFilter: 'blur(6px)',
        }}
      >◈ TMPTML</button>
    );
  }

  return (
    <>
      {/* toggle button stays visible */}
      <button
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed', bottom: 8, left: 200120, zIndex: 368,
          background: `${CY}22`, border: `1px solid ${CY}`,
          color: CY, fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          letterSpacing: 2, padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
        }}
      >◈ TMPTML</button>

      {/* panel */}
      <div style={{
        position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)',
        zIndex: 2000, width: W + 32, maxWidth: '98vw',
        background: 'rgba(8,14,22,0.96)', border: `1px solid ${CY}44`,
        borderRadius: 12, padding: '16px 20px', backdropFilter: 'blur(14px)',
        boxShadow: `0 0 60px ${CY}18`, fontFamily: "'JetBrains Mono',monospace", color: TXT,
      }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ color: CY, fontWeight: 700, fontSize: 13, letterSpacing: 3 }}>TEMPORAL TIMELINE EXPLORER</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: MUT }}>◈ TMPTML</span>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: MUT, cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>

        {/* controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10, alignItems: 'center' }}>
          <select
            value={seriesId}
            onChange={e => { setSeriesId(e.target.value); setAssessment(''); }}
            style={{ background: DIM, border: `1px solid ${CY}44`, color: TXT, fontSize: 11, padding: '3px 6px', borderRadius: 4, fontFamily: 'inherit', minWidth: 160 }}
          >
            {seriesList.length === 0 && <option value="">no series found</option>}
            {seriesList.map(id => <option key={id} value={id}>{id}</option>)}
          </select>

          <input
            type="number" placeholder="t0 (epoch ms)"
            value={t0}
            onChange={e => setT0(Number(e.target.value))}
            style={{ background: DIM, border: `1px solid ${CY}44`, color: TXT, fontSize: 11, padding: '3px 6px', borderRadius: 4, fontFamily: 'inherit', width: 140 }}
          />
          <input
            type="number" placeholder="t1 (epoch ms)"
            value={t1}
            onChange={e => setT1(Number(e.target.value))}
            style={{ background: DIM, border: `1px solid ${CY}44`, color: TXT, fontSize: 11, padding: '3px 6px', borderRadius: 4, fontFamily: 'inherit', width: 140 }}
          />

          {['1h','6h','24h','7d','30d'].map(lbl => (
            <button key={lbl} onClick={() => { const r = quickRange(lbl); if (r) { setT0(r.t0); setT1(r.t1); } }}
              style={{ background: 'rgba(0,229,255,0.08)', border: `1px solid ${CY}44`, color: CY, fontSize: 10, padding: '2px 7px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}>
              {lbl}
            </button>
          ))}

          <button onClick={fetchData} disabled={!seriesId || loading}
            style={{ background: loading ? DIM : `${CY}22`, border: `1px solid ${CY}66`, color: CY, fontSize: 10, padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1 }}>
            {loading ? '…' : '▶ FETCH'}
          </button>
        </div>

        {/* stats bar */}
        {stats && (
          <div style={{ display: 'flex', gap: 18, fontSize: 11, marginBottom: 8, color: MUT }}>
            {[
              ['n',    stats.n],
              ['min',  fmtNum(stats.min)],
              ['max',  fmtNum(stats.max)],
              ['mean', fmtNum(stats.mean)],
              ['first',fmtNum(stats.first)],
              ['last', fmtNum(stats.last)],
            ].map(([k, v]) => (
              <span key={k}><span style={{ color: CY }}>{k}</span> {v}</span>
            ))}
            {events.length > 0 && (
              <span><span style={{ color: RED }}>events</span> {events.length}</span>
            )}
          </div>
        )}

        {/* SVG timeline */}
        <div style={{ background: BRD, borderRadius: 6, border: `1px solid ${CY}22`, userSelect: 'none', cursor: 'crosshair', marginBottom: 8 }}>
          <svg
            ref={svgRef}
            width="100%" viewBox={`0 0 ${W} ${H}`}
            style={{ display: 'block' }}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
          >
            {/* axes */}
            <line x1={PAD.l} y1={PAD.t + innerH} x2={PAD.l + innerW} y2={PAD.t + innerH} stroke={`${CY}33`} strokeWidth={1}/>
            <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + innerH} stroke={`${CY}33`} strokeWidth={1}/>

            {/* time ticks */}
            {tTicks.map((t, i) => {
              const x = tToX(t);
              return (
                <g key={i}>
                  <line x1={x} y1={PAD.t + innerH} x2={x} y2={PAD.t + innerH + 4} stroke={`${CY}44`} strokeWidth={1}/>
                  <text x={x} y={H - 4} textAnchor="middle" fill={MUT} fontSize={7}>
                    {new Date(t).toLocaleTimeString(undefined, { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                  </text>
                </g>
              );
            })}

            {/* y label */}
            <text x={4} y={PAD.t + innerH / 2} fill={MUT} fontSize={7} textAnchor="middle"
              transform={`rotate(-90, 4, ${PAD.t + innerH / 2})`}>{seriesId.slice(0, 12)}</text>

            {/* observation dots */}
            {points.map((p, i) => {
              const x = tToX(p.t);
              const y = vToY(p.v, minV, maxV);
              return <circle key={i} cx={x} cy={y} r={2.5} fill={GRN} opacity={0.75}/>;
            })}

            {/* event markers */}
            {events.map((ev, i) => {
              const x = tToX(ev.t);
              return (
                <g key={i}>
                  <line x1={x} y1={PAD.t} x2={x} y2={PAD.t + innerH} stroke={RED} strokeWidth={1.5} strokeDasharray="3,2" opacity={0.8}/>
                  <circle cx={x} cy={vToY(ev.value, minV, maxV)} r={3.5} fill={RED} opacity={0.9}/>
                </g>
              );
            })}

            {/* no-data label */}
            {!loading && points.length === 0 && (
              <text x={W/2} y={H/2} textAnchor="middle" fill={MUT} fontSize={11}>no observations in range</text>
            )}
            {loading && (
              <text x={W/2} y={H/2} textAnchor="middle" fill={CY} fontSize={11}>loading…</text>
            )}
          </svg>
        </div>

        <div style={{ fontSize: 9, color: MUT, marginBottom: 8 }}>
          Drag on chart to zoom into a sub-range.&nbsp; Observation dots = <span style={{ color: GRN }}>●</span>&nbsp; Event markers = <span style={{ color: RED }}>│</span>
        </div>

        {/* time range display */}
        {t0 && t1 && (
          <div style={{ fontSize: 10, color: MUT, marginBottom: 8 }}>
            Range: <span style={{ color: TXT }}>{fmtMs(t0)}</span> → <span style={{ color: TXT }}>{fmtMs(t1)}</span>
          </div>
        )}

        {/* assess */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <button onClick={handleAssess} disabled={assessing || !seriesId}
            style={{ background: assessing ? DIM : `${AMB}22`, border: `1px solid ${AMB}66`, color: AMB, fontSize: 10, padding: '4px 14px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1 }}>
            {assessing ? '…' : '▶ ASSESS'}
          </button>
        </div>
        {assessment && (
          <div style={{ fontSize: 11, color: TXT, background: `${AMB}11`, border: `1px solid ${AMB}33`, borderRadius: 6, padding: '8px 12px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {assessment}
          </div>
        )}
      </div>
    </>
  );
}
