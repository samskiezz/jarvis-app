import { useState, useEffect, useCallback } from 'react';

const API = '';
const SCENE_IDS = [
  '01_command_atrium',
  '02_ai_core_chamber',
  '03_world_control_room',
  '04_intelligence_graph_space',
  '05_operations_war_room',
  '06_data_fusion_reactor',
  '07_document_intelligence_vault',
  '08_simulation_theatre',
  '09_analytics_observatory',
  '10_system_security_core',
];

const SRISV_RE = /\b(scene[._-]?risk|cinematic[._-]?coverage|scene[._-]?investigation|srisv|scene[._-]?intelligence|which[._-]?scenes?[._-]?are[._-]?live|scene[._-]?ground[._-]?truth|cinematic[._-]?risk|scene[._-]?intel|live[._-]?scenes?)\b/i;

export function isSrisvQuery(t) {
  return SRISV_RE.test(t || '');
}

export async function buildSrisvScript() {
  const [sceneResults, riskR, invR] = await Promise.allSettled([
    Promise.allSettled(
      SCENE_IDS.map(id =>
        fetch(`${API}/v1/cinematic/scene/${id}`, {
          headers: { Authorization: 'Bearer dev-key' },
        }).then(r => r.json()).then(d => ({ id, data: d }))
      )
    ),
    fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
    fetch(`${API}/v1/investigations`).then(r => r.json()),
  ]);

  const scenes = sceneResults.status === 'fulfilled'
    ? sceneResults.value.filter(s => s.status === 'fulfilled').map(s => s.value)
    : [];
  const risks = normaliseList(riskR.status === 'fulfilled' ? riskR.value : [], ['risks', 'signals', 'items', 'results', 'data']);
  const invs = normaliseList(invR.status === 'fulfilled' ? invR.value : [], ['investigations', 'cases', 'items', 'results', 'data']);

  const enriched = scenes.map(s => classifyScene(s, risks, invs));
  const dual = enriched.filter(s => s._class === 'DUAL_COVERAGE').length;
  const dark = enriched.filter(s => s._class === 'DARK').length;

  return (
    `Scene × Risk × Investigation Coverage: ${scenes.length} cinematic scenes correlated against ${risks.length} risk signals and ${invs.length} investigations. ` +
    `${dual} scenes have dual coverage (risk + investigation); ${dark} scenes are dark (no intelligence anchor). ` +
    `Dual-covered: ${enriched.filter(s => s._class === 'DUAL_COVERAGE').map(s => s.id.replace(/_/g, ' ')).slice(0, 3).join(', ') || 'none'}.`
  );
}

function normaliseList(raw, keys) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function sceneTokens(scene) {
  const anchors = scene.data?.anchors || {};
  const parts = [];
  for (const [key, val] of Object.entries(anchors)) {
    if (key.startsWith('_')) continue;
    parts.push(key);
    if (typeof val === 'string') parts.push(val);
    else if (val && typeof val === 'object') {
      for (const v of Object.values(val)) {
        if (typeof v === 'string') parts.push(v);
      }
    }
  }
  const meta = scene.data?.scene_metadata || scene.data?.metadata || {};
  parts.push(scene.id.replace(/_/g, ' '));
  parts.push(String(meta.title || ''));
  parts.push(String(meta.description || ''));
  return new Set(
    parts.join(' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2)
  );
}

function entityTokens(...fields) {
  return fields
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function scoreAgainst(sceneToks, etoks) {
  if (!sceneToks.size || !etoks.length) return 0;
  let hits = 0;
  for (const t of etoks) if (sceneToks.has(t)) hits++;
  return hits / Math.max(sceneToks.size, etoks.length);
}

function classifyScene(scene, risks, invs) {
  const sToks = sceneTokens(scene);

  const riskMatches = risks
    .map(r => ({
      r,
      score: scoreAgainst(sToks, entityTokens(r.title, r.name, r.description, r.category, r.severity, ...(r.tags || []))),
    }))
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const invMatches = invs
    .map(inv => ({
      inv,
      score: scoreAgainst(sToks, entityTokens(inv.title, inv.name, inv.description, ...(Array.isArray(inv.seeds) ? inv.seeds : []))),
    }))
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const hasRisk = riskMatches.length > 0;
  const hasInv = invMatches.length > 0;
  const cls = hasRisk && hasInv ? 'DUAL_COVERAGE' : hasRisk ? 'RISK_ONLY' : hasInv ? 'INV_ONLY' : 'DARK';
  return { ...scene, _class: cls, _risks: riskMatches, _invs: invMatches };
}

const PANEL_W = 620;
const PANEL_H = 580;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const RD = '#EF4444';
const PR = '#A78BFA';
const OR = '#FB923C';

const CLASS_COLOR = { DUAL_COVERAGE: GR, RISK_ONLY: AM, INV_ONLY: CY, DARK: RD };

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4, border: `1px solid ${color}44`,
    background: `${color}14`, color, fontSize: 10, letterSpacing: 1, marginRight: 4,
  }}>{label}</span>
);

const scorebar = (score, color = CY) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
    <div style={{ width: 60, height: 4, background: '#1a2535', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
    <span style={{ color: '#6E8AA0', fontSize: 10 }}>{(score * 100).toFixed(0)}%</span>
  </div>
);

export default function SceneRiskInvestigationCoverage() {
  const [open, setOpen] = useState(false);
  const [scenes, setScenes] = useState([]);
  const [risks, setRisks] = useState([]);
  const [invs, setInvs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sceneResults, riskR, invR] = await Promise.allSettled([
        Promise.allSettled(
          SCENE_IDS.map(id =>
            fetch(`${API}/v1/cinematic/scene/${id}`, {
              headers: { Authorization: 'Bearer dev-key' },
            }).then(r => r.json()).then(d => ({ id, data: d }))
          )
        ),
        fetch(`${API}/entities/RiskSignal`).then(r => r.json()),
        fetch(`${API}/v1/investigations`).then(r => r.json()),
      ]);

      if (sceneResults.status === 'fulfilled') {
        setScenes(sceneResults.value.filter(s => s.status === 'fulfilled').map(s => s.value));
      }
      setRisks(normaliseList(riskR.status === 'fulfilled' ? riskR.value : [], ['risks', 'signals', 'items', 'results', 'data']));
      setInvs(normaliseList(invR.status === 'fulfilled' ? invR.value : [], ['investigations', 'cases', 'items', 'results', 'data']));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:srisv-toggle', onToggle);
    return () => window.removeEventListener('jarvis:srisv-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = scenes.map(s => classifyScene(s, risks, invs));
  const dual = enriched.filter(s => s._class === 'DUAL_COVERAGE');
  const riskOnly = enriched.filter(s => s._class === 'RISK_ONLY');
  const invOnly = enriched.filter(s => s._class === 'INV_ONLY');
  const dark = enriched.filter(s => s._class === 'DARK');

  const badgeCount = dark.length;
  const badgeColor = badgeCount > 0 ? RD : GR;

  const filtered = enriched
    .filter(s => {
      if (tab === 'ALL') return true;
      if (tab === 'DUAL_COVERAGE') return s._class === 'DUAL_COVERAGE';
      if (tab === 'RISK_ONLY') return s._class === 'RISK_ONLY';
      if (tab === 'INV_ONLY') return s._class === 'INV_ONLY';
      if (tab === 'DARK') return s._class === 'DARK';
      return true;
    })
    .filter(s => {
      if (!search) return true;
      const q = search.toLowerCase();
      return s.id.toLowerCase().includes(q) || s._class.toLowerCase().includes(q);
    });

  async function assess() {
    setAssessing(true);
    setBrief('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message:
            `${scenes.length} cinematic scenes correlated against ${risks.length} risk signals and ${invs.length} investigations. ` +
            `${dual.length} scenes have dual coverage (risk + investigation), ${riskOnly.length} risk only, ${invOnly.length} investigation only, ${dark.length} dark (no intelligence anchor). ` +
            `Dark scenes: ${dark.map(s => s.id.replace(/_/g, ' ')).join(', ') || 'none'}. ` +
            `Give a 2-sentence scene intelligence coverage brief identifying which cinematic views are grounded in real threat context and which are data-dark.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const sceneLabel = s => s.id.replace(/_/g, ' ').toUpperCase();

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Scene × Risk Signal × Investigation Coverage (SRISV)"
        style={{
          position: 'fixed', left: 4740, bottom: 18, zIndex: 68,
          width: 56, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ SRISV
        {badgeCount > 0 && (
          <span style={{
            background: badgeColor, color: '#04060A', borderRadius: 3, padding: '0 4px',
            fontSize: 8, fontWeight: 700, minWidth: 14, textAlign: 'center',
          }}>{badgeCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: PANEL_W, height: PANEL_H, zIndex: 9200,
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${CY}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${CY}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${CY}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${CY}` }}>
              ◈ SCENE × RISK × INVESTIGATION COVERAGE
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: '#6E8AA0', fontSize: 10 }}>loading…</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  padding: '2px 8px', borderRadius: 3, border: `1px solid ${CY}55`,
                  background: 'transparent', color: CY, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                }}
              >{assessing ? 'assessing…' : '▶ ASSESS'}</button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0 }}
              >✕</button>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
            {[
              { label: 'SCENES', val: scenes.length, col: CY },
              { label: 'RISK SIGNALS', val: risks.length, col: AM },
              { label: 'INVESTIGATIONS', val: invs.length, col: PR },
              { label: 'DUAL COVERAGE', val: dual.length, col: GR },
              { label: 'RISK ONLY', val: riskOnly.length, col: OR },
              { label: 'INV ONLY', val: invOnly.length, col: CY },
              { label: 'DARK', val: dark.length, col: RD },
            ].map(({ label: l, val, col }) => (
              <div key={l} style={{
                flex: '1 1 60px', background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '5px 6px', textAlign: 'center', minWidth: 60,
              }}>
                <div style={{ color: col, fontSize: 15, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#6E8AA0', fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
            {['ALL', 'DUAL_COVERAGE', 'RISK_ONLY', 'INV_ONLY', 'DARK'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? CLASS_COLOR[t] || CY : '#2a3a4a'}`,
                  background: tab === t ? `${CLASS_COLOR[t] || CY}22` : 'transparent',
                  color: tab === t ? CLASS_COLOR[t] || CY : '#6E8AA0',
                }}
              >{t.replace(/_/g, ' ')}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search scenes…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                borderRadius: 4, color: '#DCEBF5', padding: '2px 8px', fontSize: 10, outline: 'none',
                fontFamily: "'JetBrains Mono',monospace", width: 150,
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading scenes…' : 'No scenes matched.'}
              </div>
            ) : filtered.map((scene, i) => {
              const isExp = expanded === scene.id;
              const clsColor = CLASS_COLOR[scene._class] || AM;
              return (
                <div key={scene.id} style={{ borderBottom: `1px solid ${CY}11`, paddingBottom: 6, marginBottom: 6 }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : scene.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: clsColor,
                      boxShadow: `0 0 6px ${clsColor}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>{sceneLabel(scene)}</span>
                    {chip(scene._class.replace(/_/g, ' '), clsColor)}
                    {scene._risks.length > 0 && (
                      <span style={{ color: AM, fontSize: 9 }}>⚠{scene._risks.length}</span>
                    )}
                    {scene._invs.length > 0 && (
                      <span style={{ color: PR, fontSize: 9 }}>⊗{scene._invs.length}</span>
                    )}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 4 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {scene._risks.length > 0 && (
                        <>
                          <div style={{ color: AM, fontSize: 9, letterSpacing: 1, marginBottom: 4, marginTop: 2 }}>
                            MATCHED RISK SIGNALS
                          </div>
                          {scene._risks.map(({ r, score }, j) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              {r.severity && chip(String(r.severity).toUpperCase(), AM)}
                              <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                {r.title || r.name || r.id || '?'}
                              </span>
                              {scorebar(score, AM)}
                            </div>
                          ))}
                        </>
                      )}
                      {scene._invs.length > 0 && (
                        <>
                          <div style={{ color: PR, fontSize: 9, letterSpacing: 1, marginBottom: 4, marginTop: 6 }}>
                            MATCHED INVESTIGATIONS
                          </div>
                          {scene._invs.map(({ inv, score }, j) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              {inv.status && chip(String(inv.status).toUpperCase(), PR)}
                              <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                {inv.title || inv.name || inv.id || '?'}
                              </span>
                              {scorebar(score, PR)}
                            </div>
                          ))}
                        </>
                      )}
                      {scene._risks.length === 0 && scene._invs.length === 0 && (
                        <div style={{ color: RD, fontSize: 10 }}>No intelligence anchors found for this scene.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {brief && (
            <div style={{
              padding: '8px 14px', borderTop: `1px solid ${CY}22`,
              color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
              background: 'rgba(0,207,255,0.03)',
            }}>
              <span style={{ color: CY, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
