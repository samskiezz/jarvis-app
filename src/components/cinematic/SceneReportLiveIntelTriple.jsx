import { useState, useEffect, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const API_KEY = (typeof window !== 'undefined' && (window.__JARVIS_API_KEY__ || 'dev-key')) || 'dev-key';
const POLL_MS = 60000;
const SCENE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const SCRLI_RE = /\b(scrli|scene[._-]?report[._-]?live|cinematic[._-]?report[._-]?live|scene[._-]?live[._-]?report|illuminated[._-]?scene|dark[._-]?scene[._-]?report|scene[._-]?world[._-]?report|cinematic[._-]?live[._-]?report|scene[._-]?report[._-]?coverage)\b/i;
export function isScrliQuery(t) { return SCRLI_RE.test(t || ''); }

function tok(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}
function matchScore(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const bSet = new Set(bTokens);
  return aTokens.filter(t => bSet.has(t)).length / Math.max(aTokens.length, bTokens.length);
}
const THRESHOLD = 0.07;
const COV = {
  FULLY_ILLUMINATED: 'FULLY_ILLUMINATED',
  REPORT_BACKED: 'REPORT_BACKED',
  WORLD_TRIGGERED: 'WORLD_TRIGGERED',
  DARK: 'DARK',
};

function normaliseArray(raw, ...keys) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  for (const k of keys) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  const first = Object.values(raw).find(v => Array.isArray(v));
  return first || [];
}

function classifyScene(sceneTokens, reports, liveItems) {
  const reportScore = reports.reduce((best, r) => {
    const rTokens = tok([r.title, r.summary, r.description, r.content, r.name].join(' '));
    return Math.max(best, matchScore(sceneTokens, rTokens));
  }, 0);
  const liveScore = liveItems.reduce((best, li) => {
    const liTokens = tok([li.title, li.summary, li.description, li.content, li.text].join(' '));
    return Math.max(best, matchScore(sceneTokens, liTokens));
  }, 0);
  const hasReport = reportScore >= THRESHOLD;
  const hasLive = liveScore >= THRESHOLD;
  if (hasReport && hasLive) return { cov: COV.FULLY_ILLUMINATED, reportScore, liveScore };
  if (hasReport) return { cov: COV.REPORT_BACKED, reportScore, liveScore };
  if (hasLive) return { cov: COV.WORLD_TRIGGERED, reportScore, liveScore };
  return { cov: COV.DARK, reportScore, liveScore };
}

export async function buildScrliScript() {
  const hdrs = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
  try {
    const [sceneResults, reportRes, liveRes] = await Promise.all([
      Promise.all(SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null))),
      fetch(`${API}/v1/reports`, { headers: hdrs }),
      fetch(`${API}/functions/getLiveIntel`, { headers: hdrs }),
    ]);
    const scenes = sceneResults.filter(Boolean);
    const reportRaw = reportRes.ok ? await reportRes.json() : {};
    const liveRaw = liveRes.ok ? await liveRes.json() : {};
    const reports = normaliseArray(reportRaw, 'items', 'data', 'results', 'reports');
    const liveItems = normaliseArray(liveRaw, 'items', 'data', 'results', 'intel', 'signals');
    const enriched = scenes.map(sc => {
      const sceneTokens = tok([sc.title, sc.description, sc.name, sc.context, sc.summary].join(' '));
      return { ...sc, ...classifyScene(sceneTokens, reports, liveItems) };
    });
    const illuminated = enriched.filter(s => s.cov === COV.FULLY_ILLUMINATED).length;
    const reportBacked = enriched.filter(s => s.cov === COV.REPORT_BACKED).length;
    const worldTriggered = enriched.filter(s => s.cov === COV.WORLD_TRIGGERED).length;
    const dark = enriched.filter(s => s.cov === COV.DARK).length;
    return `SCENE — REPORT — LIVE INTEL TRIPLE COVERAGE REPORT. ${scenes.length} cinematic scenes cross-referenced against ${reports.length} reports and ${liveItems.length} live intel signals. FULLY ILLUMINATED: ${illuminated} scenes with both report and live coverage. REPORT BACKED: ${reportBacked} scenes covered by reports only. WORLD TRIGGERED: ${worldTriggered} scenes with live intel only. DARK: ${dark} scenes with no coverage. ${illuminated > 0 ? `${illuminated} scene${illuminated > 1 ? 's are' : ' is'} fully illuminated with maximum intelligence overlay.` : `No scenes are fully illuminated — report or live intel gaps detected.`} Recommend enriching dark scenes with targeted report generation.`;
  } catch {
    return 'SCRLI triple coverage check failed. Verify cinematic scene, reports, and live intel endpoints.';
  }
}

const COV_COLOUR = {
  [COV.FULLY_ILLUMINATED]: '#00ffcc',
  [COV.REPORT_BACKED]: '#7bd4ff',
  [COV.WORLD_TRIGGERED]: '#ffd700',
  [COV.DARK]: '#555',
};

export default function SceneReportLiveIntelTriple() {
  const [open, setOpen] = useState(false);
  const [scenes, setScenes] = useState([]);
  const [reports, setReports] = useState([]);
  const [liveItems, setLiveItems] = useState([]);
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
      const [sceneResults, reportRes, liveRes] = await Promise.all([
        Promise.all(SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null))),
        fetch(`${API}/v1/reports`, { headers: hdrs }),
        fetch(`${API}/functions/getLiveIntel`, { headers: hdrs }),
      ]);
      const scs = sceneResults.filter(Boolean);
      const reportRaw = reportRes.ok ? await reportRes.json() : {};
      const liveRaw = liveRes.ok ? await liveRes.json() : {};
      const rpts = normaliseArray(reportRaw, 'items', 'data', 'results', 'reports');
      const live = normaliseArray(liveRaw, 'items', 'data', 'results', 'intel', 'signals');
      setScenes(scs);
      setReports(rpts);
      setLiveItems(live);
      const enr = scs.map(sc => {
        const sceneTokens = tok([sc.title, sc.description, sc.name, sc.context, sc.summary].join(' '));
        return { ...sc, ...classifyScene(sceneTokens, rpts, live) };
      });
      setEnriched(enr);
    } catch {
      // silently handle
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
    window.addEventListener('jarvis:scrli-toggle', handler);
    return () => window.removeEventListener('jarvis:scrli-toggle', handler);
  }, []);

  const assess = async (scene) => {
    setAssessing(true);
    setAssessText('');
    const key = scene.id || scene.scene_id || scene.title;
    setExpanded(key);
    try {
      const hdrs = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const prompt = `Assess cinematic scene: ${scene.title || scene.name || JSON.stringify(scene).slice(0, 200)}. Coverage: ${scene.cov}. Report score: ${(scene.reportScore * 100).toFixed(0)}%. Live score: ${(scene.liveScore * 100).toFixed(0)}%. Be brief and tactical.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ message: prompt }),
      });
      if (res.ok) {
        const d = await res.json();
        setAssessText(d.response || d.message || d.text || JSON.stringify(d).slice(0, 300));
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

  const visible = enriched.filter(sc => {
    if (filter !== 'ALL' && sc.cov !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (sc.title || sc.name || '').toLowerCase().includes(q);
    }
    return true;
  });

  const illuminated = enriched.filter(s => s.cov === COV.FULLY_ILLUMINATED).length;
  const dark = enriched.filter(s => s.cov === COV.DARK).length;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 878400, bottom: 8, zIndex: 577,
          background: 'rgba(0,20,30,0.85)', border: '1px solid #0ff3',
          color: illuminated > 0 ? '#00ffcc' : '#888', padding: '3px 8px',
          fontSize: 10, cursor: 'pointer', borderRadius: 3,
          fontFamily: 'monospace', letterSpacing: 1,
        }}
        title="Scene × Report × Live Intel Triple Coverage"
      >
        ◈ SCRLI{illuminated > 0 ? ` [${illuminated}]` : dark > 0 ? ` ·${dark}` : ''}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', left: 878400, bottom: 36, zIndex: 577,
      width: 360, maxHeight: 520,
      background: 'rgba(0,12,20,0.97)', border: '1px solid #0ff4',
      borderRadius: 6, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', fontSize: 11, color: '#cce',
      boxShadow: '0 0 18px #00ffcc22',
    }}>
      {/* Header */}
      <div style={{ padding: '6px 10px', borderBottom: '1px solid #0ff2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#00ffcc', fontWeight: 700, letterSpacing: 1 }}>◈ SCRLI TRIPLE</span>
        <span style={{ color: '#888', fontSize: 10 }}>
          {scenes.length}SC · {reports.length}R · {liveItems.length}L
        </span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 13 }}>✕</button>
      </div>

      {/* Coverage badges */}
      <div style={{ padding: '4px 10px', display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid #0ff1' }}>
        {Object.values(COV).map(c => {
          const cnt = enriched.filter(s => s.cov === c).length;
          return (
            <button key={c} onClick={() => setFilter(filter === c ? 'ALL' : c)}
              style={{
                padding: '2px 6px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
                background: filter === c ? COV_COLOUR[c] + '33' : 'transparent',
                border: `1px solid ${COV_COLOUR[c]}66`,
                color: COV_COLOUR[c],
              }}>
              {c.replace(/_/g, ' ')} {cnt}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ padding: '4px 10px', borderBottom: '1px solid #0ff1' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="filter scenes…"
          style={{ width: '100%', background: '#001418', border: '1px solid #0ff3', color: '#cce', padding: '2px 6px', fontSize: 10, borderRadius: 3, boxSizing: 'border-box' }}
        />
      </div>

      {/* Scene list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {loading && <div style={{ padding: 10, color: '#888' }}>Loading…</div>}
        {!loading && visible.length === 0 && <div style={{ padding: 10, color: '#555' }}>No scenes.</div>}
        {visible.map((sc, i) => {
          const key = sc.id || sc.scene_id || sc.title || i;
          const isExp = expanded === key;
          return (
            <div key={key} style={{ borderBottom: '1px solid #0ff1', padding: '5px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setExpanded(isExp ? null : key)}>
                <span style={{ color: COV_COLOUR[sc.cov], fontWeight: 600, fontSize: 10 }}>
                  {sc.title || sc.name || `Scene #${i + 1}`}
                </span>
                <span style={{ color: COV_COLOUR[sc.cov], fontSize: 9 }}>{sc.cov.replace(/_/g, ' ')}</span>
              </div>
              <div style={{ color: '#556', fontSize: 9, marginTop: 2 }}>
                RPT: {(sc.reportScore * 100).toFixed(0)}% · LI: {(sc.liveScore * 100).toFixed(0)}%
              </div>
              {isExp && (
                <div style={{ marginTop: 5, paddingTop: 5, borderTop: '1px solid #0ff1' }}>
                  {sc.description && <div style={{ color: '#99b', fontSize: 9, marginBottom: 4 }}>{String(sc.description).slice(0, 180)}</div>}
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => assess(sc)}
                      style={{ fontSize: 9, padding: '2px 6px', background: '#001a22', border: '1px solid #0ff4', color: '#0ff', cursor: 'pointer', borderRadius: 3 }}>
                      ASSESS
                    </button>
                    <button onClick={() => speak(`Scene ${sc.title || 'unknown'} coverage: ${sc.cov.replace(/_/g, ' ')}`)}
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

      {/* Footer */}
      <div style={{ padding: '4px 10px', borderTop: '1px solid #0ff2', display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#556' }}>
        <span>ILLUMINATED: <span style={{ color: '#00ffcc' }}>{illuminated}</span> · DARK: <span style={{ color: '#555' }}>{dark}</span></span>
        <button onClick={load} style={{ background: 'none', border: 'none', color: '#0ff7', cursor: 'pointer', fontSize: 9 }}>↻ REFRESH</button>
      </div>
    </div>
  );
}
