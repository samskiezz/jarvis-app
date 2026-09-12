/**
 * F220: Risk Signal × Scene × Knowledge Triple Coverage (RSKSCN)
 *
 * Three-way keyword-correlates each risk signal against cinematic scenes
 * AND knowledge-base articles to surface:
 *   FULLY CONTEXTUALIZED — scene-mapped AND KB-documented
 *   SCENE-ONLY           — scene alignment found, no KB article
 *   KB-ONLY              — KB article found, no scene alignment
 *   BLIND                — neither scene nor KB coverage
 *
 * Real endpoints:
 *   GET /entities/RiskSignal            — active risk signals
 *   GET /v1/cinematic/scene/{id}        — scene anchor texts (all 10)
 *   GET /knowledge/                     — KB articles
 *   POST /v1/jarvis/agent/chat          — ASSESS brief
 *
 * Voice triggers: "rskscn" / "risk scene knowledge" / "risk context triple" /
 *   "blind risk signal" / "risk signal context" / "scene knowledge risk" /
 *   "risk context coverage" / "risk operational context"
 */

import { useState, useEffect, useCallback } from 'react';
import { apiBase } from '@/api/cinematicDataAdapters';

const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

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

const HDR = { Authorization: `Bearer ${API_KEY}` };

// ── intent helpers ─────────────────────────────────────────────────────────────

const RSKSCN_RE =
  /\b(rskscn|risk[._-]?scene[._-]?knowledge|risk[._-]?context[._-]?triple|blind[._-]?risk[._-]?signal|risk[._-]?signal[._-]?context|scene[._-]?knowledge[._-]?risk|risk[._-]?context[._-]?coverage|risk[._-]?operational[._-]?context)\b/i;

export function isRskscnQuery(t) {
  return RSKSCN_RE.test(t || '');
}

// ── fetchers ───────────────────────────────────────────────────────────────────

async function fetchScene(id) {
  const r = await fetch(`${apiBase()}/v1/cinematic/scene/${id}`, { headers: HDR });
  return r.ok ? r.json() : {};
}

async function fetchRiskSignals() {
  const r = await fetch(`${apiBase()}/entities/RiskSignal`, { headers: HDR });
  return r.ok ? r.json() : [];
}

async function fetchKB() {
  const r = await fetch(`${apiBase()}/knowledge/`, { headers: HDR });
  return r.ok ? r.json() : [];
}

// ── normalisers ────────────────────────────────────────────────────────────────

function normaliseRisks(raw) {
  if (!raw) return [];
  const arr = ['risk_signals', 'signals', 'items', 'results', 'data', 'records', 'entities'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:       s.id || String(i),
    name:     s.name || s.title || s.label || `Signal ${i + 1}`,
    severity: s.severity || s.level || s.priority || '',
    category: s.category || s.type || s.sector || s.domain || '',
    desc:     String(s.description || s.summary || s.details || s.body || '').slice(0, 300),
    source:   s.source || s.origin || '',
    tags:     Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function normaliseKB(raw) {
  if (!raw) return [];
  const arr = ['articles', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((a, i) => ({
    id:       a.id || a.slug || String(i),
    title:    a.title || a.name || a.label || `Article ${i + 1}`,
    category: a.category || a.type || a.domain || '',
    summary:  String(a.summary || a.content || a.body || a.abstract || a.description || '').slice(0, 300),
    tags:     Array.isArray(a.tags) ? a.tags.join(' ') : (a.tags || ''),
  }));
}

function extractAnchors(sceneData) {
  if (!sceneData) return '';
  const txt = [];
  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    if (typeof obj.text === 'string') txt.push(obj.text);
    if (typeof obj.title === 'string') txt.push(obj.title);
    if (typeof obj.label === 'string') txt.push(obj.label);
    if (typeof obj.content === 'string') txt.push(obj.content);
    Object.values(obj).forEach(v => { if (typeof v === 'object') walk(v); });
  };
  walk(sceneData);
  return txt.join(' ');
}

// ── token helpers ─────────────────────────────────────────────────────────────

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(riskToks, other) {
  const otherToks = tokens(
    [other.title || other.name || '', other.category || '', other.summary || other.desc || '', other.tags || ''].join(' ')
  );
  if (!riskToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (riskToks.has(t)) hits++;
  return hits / Math.max(riskToks.size, otherToks.length);
}

function sceneMatchScore(riskToks, sceneText) {
  const sceneToks = tokens(sceneText);
  if (!riskToks.size || !sceneToks.length) return 0;
  let hits = 0;
  for (const t of sceneToks) if (riskToks.has(t)) hits++;
  return hits / Math.max(riskToks.size, sceneToks.length);
}

// ── correlator ────────────────────────────────────────────────────────────────

function correlate(risks, scenes, articles) {
  return risks.map(risk => {
    const riskToks = new Set(tokens(
      [risk.name, risk.category, risk.desc, risk.source, risk.tags, risk.severity].join(' ')
    ).filter(Boolean));

    const matchedScenes = scenes
      .map(s => ({ ...s, _score: sceneMatchScore(riskToks, s.text) }))
      .filter(x => x._score > 0.04)
      .sort((a, b) => b._score - a._score)
      .slice(0, 3);

    const matchedArticles = articles
      .map(a => ({ ...a, _score: matchScore(riskToks, a) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasScene = matchedScenes.length > 0;
    const hasKB    = matchedArticles.length > 0;

    let coverage;
    if (hasScene && hasKB)  coverage = 'FULLY CONTEXTUALIZED';
    else if (hasScene)      coverage = 'SCENE-ONLY';
    else if (hasKB)         coverage = 'KB-ONLY';
    else                    coverage = 'BLIND';

    return { ...risk, _scenes: matchedScenes, _articles: matchedArticles, _coverage: coverage };
  });
}

// ── spoken script builder (exported for JarvisBrain) ──────────────────────────

export async function buildRskscnScript() {
  try {
    const [riskRaw, sceneResults, kbRaw] = await Promise.all([
      fetchRiskSignals(),
      Promise.allSettled(SCENE_IDS.map(fetchScene)),
      fetchKB(),
    ]);
    const risks    = normaliseRisks(riskRaw);
    const scenes   = sceneResults.map((r, i) => ({
      id: SCENE_IDS[i],
      label: SCENE_IDS[i].replace(/_/g, ' '),
      text: r.status === 'fulfilled' ? extractAnchors(r.value) : '',
    }));
    const articles = normaliseKB(kbRaw);
    const rows     = correlate(risks, scenes, articles);
    const fc  = rows.filter(r => r._coverage === 'FULLY CONTEXTUALIZED').length;
    const so  = rows.filter(r => r._coverage === 'SCENE-ONLY').length;
    const kbo = rows.filter(r => r._coverage === 'KB-ONLY').length;
    const bl  = rows.filter(r => r._coverage === 'BLIND').length;
    return (
      `Risk Signal × Scene × Knowledge Triple Coverage: ${risks.length} risk signals cross-referenced against all 10 cinematic scenes and ${articles.length} KB articles. ` +
      `${fc} FULLY CONTEXTUALIZED (scene-mapped and KB-documented); ${so} SCENE-ONLY (operational theatre found, no KB); ` +
      `${kbo} KB-ONLY (KB article found, no scene alignment); ${bl} BLIND (no scene or KB context — critical intelligence gap). ` +
      (bl > 0
        ? `Blind signals: ${rows.filter(r => r._coverage === 'BLIND').slice(0, 3).map(r => r.name).join(', ')}. Recommend immediate scene mapping and KB documentation for blind risk signals.`
        : 'All risk signals carry scene or KB context. Risk intelligence coverage is strong.')
    );
  } catch {
    return 'Risk Signal × Scene × Knowledge triple coverage assessment unavailable — check endpoints.';
  }
}

// ── colours & constants ───────────────────────────────────────────────────────

const PANEL_W = 680;
const PANEL_H = 640;
const GR  = '#22C55E';   // fully contextualized
const CY  = '#00CFFF';   // scene-only
const AM  = '#F59E0B';   // kb-only
const RD  = '#EF4444';   // blind
const DIM = '#6B7280';

const COVERAGE_COLOR = {
  'FULLY CONTEXTUALIZED': GR,
  'SCENE-ONLY':           CY,
  'KB-ONLY':              AM,
  'BLIND':                RD,
};

const TABS = ['ALL', 'FULLY CONTEXTUALIZED', 'SCENE-ONLY', 'KB-ONLY', 'BLIND'];

const chip = (label, color = CY) => (
  <span style={{
    fontSize: 9, padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap',
    background: color + '22', color, border: `1px solid ${color}55`, marginLeft: 4,
  }}>
    {label}
  </span>
);

const ScoreBar = ({ score, color }) => (
  <div style={{ height: 3, width: '100%', background: '#111', borderRadius: 2, marginTop: 2 }}>
    <div style={{
      height: 3, width: `${Math.round(score * 100)}%`,
      background: color, borderRadius: 2, transition: 'width .4s',
    }} />
  </div>
);

// ── component ─────────────────────────────────────────────────────────────────

export default function RiskSignalSceneKnowledgeTriple() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]             = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [riskRaw, sceneResults, kbRaw] = await Promise.all([
        fetchRiskSignals(),
        Promise.allSettled(SCENE_IDS.map(fetchScene)),
        fetchKB(),
      ]);
      const risks    = normaliseRisks(riskRaw);
      const scenes   = sceneResults.map((r, i) => ({
        id: SCENE_IDS[i],
        label: SCENE_IDS[i].replace(/_/g, ' '),
        text: r.status === 'fulfilled' ? extractAnchors(r.value) : '',
      }));
      const articles = normaliseKB(kbRaw);
      setRows(correlate(risks, scenes, articles));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:rskscn-toggle', toggle);
    return () => window.removeEventListener('jarvis:rskscn-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessText('');
    try {
      const brief = await buildRskscnScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Risk Signal × Scene × Knowledge triple coverage: ${brief}. Give a 2-sentence risk intelligence readiness assessment.`,
        }),
      });
      const d = await r.json();
      const msg = d.response || d.message || d.content || brief;
      setAssessText(msg);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: msg } }));
    } catch (e) {
      setAssessText(String(e));
    } finally {
      setAssessing(false);
    }
  }, []);

  // ── collapsed button ────────────────────────────────────────────────────────

  if (!open) {
    const blind = rows.filter(r => r._coverage === 'BLIND').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Risk Signal × Scene × Knowledge Triple Coverage (RSKSCN)"
        style={{
          position: 'fixed', left: 750720, bottom: 8, zIndex: 369,
          background: blind > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${blind > 0 ? RD : CY + '44'}`,
          color: blind > 0 ? RD : CY,
          borderRadius: 4, padding: '3px 8px', fontSize: 10,
          cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ RSKSCN{blind > 0 ? ` ⚠${blind}` : ''}
      </button>
    );
  }

  // ── derived counts ──────────────────────────────────────────────────────────

  const fc  = rows.filter(r => r._coverage === 'FULLY CONTEXTUALIZED').length;
  const so  = rows.filter(r => r._coverage === 'SCENE-ONLY').length;
  const kbo = rows.filter(r => r._coverage === 'KB-ONLY').length;
  const bl  = rows.filter(r => r._coverage === 'BLIND').length;

  const visible = rows.filter(r =>
    (tab === 'ALL' || r._coverage === tab) &&
    (!search || r.name.toLowerCase().includes(search.toLowerCase()) ||
     r.category.toLowerCase().includes(search.toLowerCase()))
  );

  // ── panel ───────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040f', border: '1px solid #EF444433', borderRadius: 8,
      zIndex: 6220, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #EF444418',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid #EF444422',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <span style={{ color: RD, fontWeight: 700, fontSize: 11 }}>
          ◈ RISK SIGNAL × SCENE × KNOWLEDGE TRIPLE
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>RSKSCN</span>
        {bl > 0 && (
          <span style={{
            fontSize: 10, color: RD, background: '#EF444422',
            border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px',
          }}>
            ⚠ {bl} BLIND
          </span>
        )}
        <button onClick={assess} disabled={assessing} style={{
          background: 'none', border: `1px solid ${RD}44`, color: RD,
          fontSize: 9, padding: '2px 7px', borderRadius: 3, cursor: 'pointer',
        }}>
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0,
        }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['RISK SIGNALS', rows.length, RD],
          ['FULLY CTX', fc, GR],
          ['SCENE-ONLY', so, CY],
          ['KB-ONLY', kbo, AM],
          ['BLIND', bl, RD],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            flex: '1 1 80px', minWidth: 70, background: '#08080f',
            border: `1px solid ${color}33`, borderRadius: 5, padding: '5px 8px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 7, color: '#666', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: '#111', display: 'flex' }}>
          {rows.length > 0 && [[fc, GR], [so, CY], [kbo, AM], [bl, RD]].map(([v, c], i) =>
            v > 0 ? <div key={i} style={{ flex: v, background: c, transition: 'flex .4s' }} /> : null
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '2px 8px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
            background: tab === t ? (COVERAGE_COLOR[t] || RD) + '33' : '#08080f',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || RD) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || RD) : '#888',
          }}>
            {t}{t !== 'ALL' ? ` (${rows.filter(r => r._coverage === t).length})` : ''}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search risk signals…"
          style={{
            width: '100%', background: '#08080f', border: '1px solid #EF444433',
            borderRadius: 4, color: RD, fontSize: 10, padding: '4px 8px',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Assess result */}
      {assessText && (
        <div style={{
          margin: '0 12px 6px', padding: '6px 8px', background: '#05050d',
          border: '1px solid #EF444433', borderRadius: 4, fontSize: 10, color: '#ccc', flexShrink: 0,
        }}>
          {assessText}
        </div>
      )}

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px' }}>
        {loading && (
          <div style={{ color: '#888', fontSize: 10, textAlign: 'center', padding: 16 }}>Loading…</div>
        )}
        {err && (
          <div style={{ color: RD, fontSize: 10, padding: 8 }}>{err}</div>
        )}
        {!loading && visible.length === 0 && (
          <div style={{ color: '#666', fontSize: 10, textAlign: 'center', padding: 16 }}>
            No signals match filter.
          </div>
        )}
        {visible.map(risk => {
          const color = COVERAGE_COLOR[risk._coverage] || RD;
          const isExp = expanded === risk.id;
          return (
            <div key={risk.id} style={{
              marginBottom: 5, border: `1px solid ${color}33`,
              borderRadius: 5, background: '#06060e', overflow: 'hidden',
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : risk.id)}
                style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span style={{
                  fontSize: 10, color, minWidth: 0, flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {risk.name}
                </span>
                {risk.severity && (
                  <span style={{ fontSize: 9, color: DIM, flexShrink: 0 }}>{risk.severity}</span>
                )}
                {risk.category && (
                  <span style={{ fontSize: 9, color: '#555', flexShrink: 0 }}>{risk.category}</span>
                )}
                {chip(risk._coverage, color)}
                <span style={{ color: '#444', fontSize: 10, flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 8px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {/* Scenes */}
                  <div>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 700 }}>
                      SCENES ({risk._scenes.length})
                    </div>
                    {risk._scenes.length === 0
                      ? <div style={{ fontSize: 9, color: '#555' }}>No scene alignment found</div>
                      : risk._scenes.map((s, i) => (
                        <div key={i} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
                            <span style={{
                              fontSize: 9, color: '#ccc', flex: 1,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {s.label}
                            </span>
                          </div>
                          <ScoreBar score={s._score} color={CY} />
                        </div>
                      ))
                    }
                  </div>
                  {/* KB Articles */}
                  <div>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 700 }}>
                      KB ARTICLES ({risk._articles.length})
                    </div>
                    {risk._articles.length === 0
                      ? <div style={{ fontSize: 9, color: '#555' }}>No KB article found</div>
                      : risk._articles.map((a, i) => (
                        <div key={i} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
                            <span style={{
                              fontSize: 9, color: '#ccc', flex: 1,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {a.title}
                            </span>
                            {a.category && chip(a.category, AM)}
                          </div>
                          <ScoreBar score={a._score} color={AM} />
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: '4px 12px', borderTop: '1px solid #EF444411',
        fontSize: 9, color: '#444', flexShrink: 0, display: 'flex', justifyContent: 'space-between',
      }}>
        <span>RSKSCN · /entities/RiskSignal × /v1/cinematic/scene/* × /knowledge/</span>
        <button onClick={load} style={{ background: 'none', border: 'none', color: '#555', fontSize: 9, cursor: 'pointer' }}>
          ↻ refresh
        </button>
      </div>
    </div>
  );
}
