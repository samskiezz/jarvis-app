/**
 * F265 — Risk Signal × Dataset × Scenario Triple (RDST)
 *
 * Answers: "Which active risk signals have both dataset backing AND a scenario
 * response plan — and which are completely dark (no data, no plan)?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/RiskSignal  → active risk signals
 *   GET /v1/datasets          → dataset catalog
 *   GET /v1/scenario/list     → scenario response plans
 *
 * Each risk signal is correlated against:
 *   1. Datasets  (by name/description/category/tags token match) → DATA_BACKED?
 *   2. Scenarios (by name/description/type/tags token match)     → SCENARIO_PLANNED?
 *
 * Classification:
 *   FULL_COVERAGE  — signal has BOTH dataset backing AND scenario plan
 *   DATA_ONLY      — has dataset backing but no scenario plan
 *   SCENARIO_ONLY  — has scenario plan but no dataset backing
 *   DARK           — neither (highest priority gap)
 *
 * Stat tiles:  risk signals / datasets / scenarios / dark
 * Red badge:   dark count on button.
 * Expand row:  matched datasets + matched scenarios with relevance bars.
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ RDST  at left:5640 bottom:18, zIndex:68.
 * Event:   jarvis:rdst-toggle
 * Voice:   "risk dataset scenario / rdst / dark risks / risk data scenario /
 *           risk coverage triple / risk without data / risk without plan /
 *           risk signal coverage triple / unplanned risks / data dark risk"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

const RDST_RE =
  /\b(risk[._-]?dataset[._-]?scenario|rdst|dark[._-]?risk(?:s)?|risk[._-]?data[._-]?scenario|risk[._-]?coverage[._-]?triple|risk[._-]?without[._-]?data|risk[._-]?without[._-]?plan|risk[._-]?signal[._-]?coverage[._-]?triple|unplanned[._-]?risk(?:s)?|data[._-]?dark[._-]?risk(?:s)?)\b/i;

export function isRdstQuery(t) {
  return RDST_RE.test(t || '');
}

export async function buildRdstScript() {
  const [riskR, dsR, scnR] = await Promise.allSettled([
    fetch(`${API}/entities/RiskSignal`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/datasets`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
  ]);
  const risks = normRisks(riskR.status === 'fulfilled' ? riskR.value : []);
  const datasets = normDatasets(dsR.status === 'fulfilled' ? dsR.value : []);
  const scenarios = normScenarios(scnR.status === 'fulfilled' ? scnR.value : []);
  const enriched = enrich(risks, datasets, scenarios);
  const dark = enriched.filter(r => r._class === 'DARK').length;
  const full = enriched.filter(r => r._class === 'FULL_COVERAGE').length;
  return (
    `Risk × Dataset × Scenario: ${risks.length} risk signals, ${datasets.length} datasets, ${scenarios.length} scenarios. ` +
    `${full} signals are fully covered (data-backed + scenario-planned); ${dark} are DARK (no dataset, no scenario plan). ` +
    `Top dark signals: ${enriched.filter(r => r._class === 'DARK').slice(0, 3).map(r => r.title || r.name || '?').join(', ') || 'none'}.`
  );
}

// ─── normalise ───────────────────────────────────────────────────────────────

function normRisks(raw) {
  if (!raw) return [];
  for (const k of ['items', 'results', 'data', 'risk_signals', 'risks']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normDatasets(raw) {
  if (!raw) return [];
  for (const k of ['datasets', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normScenarios(raw) {
  if (!raw) return [];
  for (const k of ['scenarios', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

// ─── token helpers ────────────────────────────────────────────────────────────

function toks(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function riskToks(r) {
  return new Set([
    ...toks(r.title),
    ...toks(r.name),
    ...toks(r.description),
    ...toks(r.category),
    ...toks(r.source),
    ...(Array.isArray(r.tags) ? r.tags.flatMap(toks) : toks(r.tags)),
  ]);
}

function dsScore(risk, ds) {
  const rt = riskToks(risk);
  const dt = new Set([
    ...toks(ds.name),
    ...toks(ds.title),
    ...toks(ds.description),
    ...toks(ds.category),
    ...toks(ds.type),
    ...(Array.isArray(ds.tags) ? ds.tags.flatMap(toks) : toks(ds.tags)),
  ]);
  if (!rt.size || !dt.size) return 0;
  let hits = 0;
  for (const t of rt) if (dt.has(t)) hits++;
  return hits / Math.max(rt.size, dt.size);
}

function scnScore(risk, scn) {
  const rt = riskToks(risk);
  const st = new Set([
    ...toks(scn.name),
    ...toks(scn.title),
    ...toks(scn.description),
    ...toks(scn.type),
    ...(Array.isArray(scn.tags) ? scn.tags.flatMap(toks) : toks(scn.tags)),
  ]);
  if (!rt.size || !st.size) return 0;
  let hits = 0;
  for (const t of rt) if (st.has(t)) hits++;
  return hits / Math.max(rt.size, st.size);
}

// ─── enrichment ──────────────────────────────────────────────────────────────

function enrich(risks, datasets, scenarios) {
  return risks.map(r => {
    const dsMatches = datasets
      .map(d => ({ ds: d, score: dsScore(r, d) }))
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const scnMatches = scenarios
      .map(s => ({ scn: s, score: scnScore(r, s) }))
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const hasDs = dsMatches.length > 0;
    const hasScn = scnMatches.length > 0;
    const _class =
      hasDs && hasScn
        ? 'FULL_COVERAGE'
        : hasDs
        ? 'DATA_ONLY'
        : hasScn
        ? 'SCENARIO_ONLY'
        : 'DARK';
    return { ...r, _class, _dsMatches: dsMatches, _scnMatches: scnMatches };
  });
}

// ─── constants ────────────────────────────────────────────────────────────────

const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const RD = '#EF4444';
const MU = '#6E8AA0';
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const CLASS_COLOR = {
  FULL_COVERAGE: GR,
  DATA_ONLY: CY,
  SCENARIO_ONLY: AM,
  DARK: RD,
};

const SEVERITY_COLOR = {
  CRITICAL: RD,
  HIGH: RD,
  MEDIUM: AM,
  LOW: GR,
  INFO: CY,
};

const chip = (label, color = CY) => (
  <span
    style={{
      display: 'inline-block',
      padding: '1px 7px',
      borderRadius: 4,
      border: `1px solid ${color}44`,
      background: `${color}14`,
      color,
      fontSize: 10,
      letterSpacing: 1,
      marginRight: 4,
    }}
  >
    {label}
  </span>
);

const scorebar = (score, color = CY) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
    <div
      style={{
        width: 60,
        height: 4,
        background: '#1a2535',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${Math.round(score * 100)}%`,
          height: '100%',
          background: color,
          borderRadius: 2,
        }}
      />
    </div>
    <span style={{ color: MU, fontSize: 10 }}>{(score * 100).toFixed(0)}%</span>
  </div>
);

// ─── component ───────────────────────────────────────────────────────────────

export default function RiskDatasetScenarioTriple() {
  const [open, setOpen] = useState(false);
  const [risks, setRisks] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [riskR, dsR, scnR] = await Promise.allSettled([
        fetch(`${API}/entities/RiskSignal`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
        fetch(`${API}/v1/datasets`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
      ]);
      setRisks(normRisks(riskR.status === 'fulfilled' ? riskR.value : []));
      setDatasets(normDatasets(dsR.status === 'fulfilled' ? dsR.value : []));
      setScenarios(normScenarios(scnR.status === 'fulfilled' ? scnR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:rdst-toggle', onToggle);
    return () => window.removeEventListener('jarvis:rdst-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const enriched = enrich(risks, datasets, scenarios);
  const dark = enriched.filter(r => r._class === 'DARK').length;

  const TABS = ['ALL', 'FULL_COVERAGE', 'DATA_ONLY', 'SCENARIO_ONLY', 'DARK'];
  const q = search.toLowerCase();
  const visible = enriched
    .filter(r => tab === 'ALL' || r._class === tab)
    .filter(r =>
      !q ||
      (r.title || r.name || '').toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q)
    );

  const assess = async () => {
    setAssessing(true);
    setBrief('');
    try {
      const ctx = await buildRdstScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Risk × Dataset × Scenario coverage brief: ${ctx}. Give a 2-sentence intelligence assessment.` }),
      });
      const d = await r.json();
      const text = (d.answer || d.response || d.text || 'Assessment unavailable.').slice(0, 400);
      setBrief(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      setBrief('Assessment unavailable.');
    }
    setAssessing(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 5640,
          bottom: 18,
          zIndex: 68,
          background: dark > 0 ? '#1a0a0a' : '#0a1520',
          border: `1px solid ${dark > 0 ? RD : CY}44`,
          color: dark > 0 ? RD : CY,
          fontFamily: MONO,
          fontSize: 10,
          padding: '4px 10px',
          borderRadius: 4,
          cursor: 'pointer',
          letterSpacing: 1,
        }}
      >
        ◈ RDST{dark > 0 && (
          <span
            style={{
              marginLeft: 6,
              background: RD,
              color: '#000',
              borderRadius: 8,
              padding: '0 5px',
              fontSize: 9,
              fontWeight: 700,
            }}
          >
            {dark}
          </span>
        )}
      </button>
    );
  }

  const statTile = (label, value, color = CY) => (
    <div
      style={{
        flex: 1,
        minWidth: 80,
        background: '#0a1520',
        border: `1px solid ${color}33`,
        borderRadius: 6,
        padding: '8px 10px',
        textAlign: 'center',
      }}
    >
      <div style={{ color, fontFamily: MONO, fontSize: 18, fontWeight: 700 }}>{value}</div>
      <div style={{ color: MU, fontFamily: MONO, fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <div
      style={{
        position: 'fixed',
        top: 60,
        right: 20,
        width: 560,
        maxHeight: 'calc(100vh - 80px)',
        background: '#060e18',
        border: `1px solid ${RD}44`,
        borderRadius: 8,
        boxShadow: `0 0 30px ${RD}22`,
        zIndex: 9100,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: MONO,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${RD}33`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#060e18',
        }}
      >
        <span style={{ color: RD, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
          ◈ RISK × DATASET × SCENARIO TRIPLE
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {loading && <span style={{ color: MU, fontSize: 10 }}>loading…</span>}
          <button
            onClick={load}
            style={{ background: 'none', border: `1px solid ${CY}44`, color: CY, borderRadius: 3, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}
          >
            ↺
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{ background: 'none', border: `1px solid ${MU}44`, color: MU, borderRadius: 3, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 14px', flexWrap: 'wrap' }}>
        {statTile('RISK SIGNALS', enriched.length, RD)}
        {statTile('DATASETS', datasets.length, CY)}
        {statTile('SCENARIOS', scenarios.length, AM)}
        {statTile('FULL COVERAGE', enriched.filter(r => r._class === 'FULL_COVERAGE').length, GR)}
        {statTile('DATA ONLY', enriched.filter(r => r._class === 'DATA_ONLY').length, CY)}
        {statTile('SCENARIO ONLY', enriched.filter(r => r._class === 'SCENARIO_ONLY').length, AM)}
        {statTile('DARK', dark, RD)}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 8px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${CLASS_COLOR[t] || CY}22` : 'transparent',
              border: `1px solid ${tab === t ? (CLASS_COLOR[t] || CY) : MU + '44'}`,
              color: tab === t ? (CLASS_COLOR[t] || CY) : MU,
              borderRadius: 3,
              padding: '2px 8px',
              fontSize: 9,
              cursor: 'pointer',
              letterSpacing: 1,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 14px 8px' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search signals…"
          style={{
            width: '100%',
            background: '#0a1520',
            border: `1px solid ${CY}33`,
            color: CY,
            fontFamily: MONO,
            fontSize: 10,
            padding: '4px 8px',
            borderRadius: 4,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 10px' }}>
        {visible.length === 0 && (
          <div style={{ color: MU, fontSize: 10, padding: '12px 0' }}>
            {loading ? 'Loading…' : 'No signals match filter.'}
          </div>
        )}
        {visible.map((r, i) => {
          const isExp = expanded === i;
          const cc = CLASS_COLOR[r._class] || MU;
          const sev = (r.severity || '').toUpperCase();
          return (
            <div
              key={r.id || r._id || i}
              style={{
                marginBottom: 6,
                background: '#0a1520',
                border: `1px solid ${cc}33`,
                borderRadius: 5,
                overflow: 'hidden',
              }}
            >
              {/* Row header */}
              <div
                onClick={() => setExpanded(isExp ? null : i)}
                style={{
                  padding: '6px 10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  {sev && chip(sev, SEVERITY_COLOR[sev] || MU)}
                  <span style={{ color: cc, fontSize: 10, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.title || r.name || r.id || '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {chip(r._class, cc)}
                  <span style={{ color: MU, fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Expanded detail */}
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: `1px solid ${cc}22` }}>
                  {r.description && (
                    <div style={{ color: MU, fontSize: 9, margin: '6px 0', lineHeight: 1.5 }}>
                      {r.description.slice(0, 200)}
                    </div>
                  )}

                  {/* Dataset matches */}
                  <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginTop: 8, marginBottom: 4 }}>
                    DATASET MATCHES ({r._dsMatches.length})
                  </div>
                  {r._dsMatches.length === 0 ? (
                    <div style={{ color: MU, fontSize: 9 }}>— no dataset match</div>
                  ) : (
                    r._dsMatches.map((m, j) => (
                      <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        {chip(m.ds.category || m.ds.type || 'DS', CY)}
                        <span style={{ color: '#ccc', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.ds.name || m.ds.title || m.ds.id || '?'}
                        </span>
                        {scorebar(m.score, CY)}
                      </div>
                    ))
                  )}

                  {/* Scenario matches */}
                  <div style={{ color: AM, fontSize: 9, letterSpacing: 1, marginTop: 8, marginBottom: 4 }}>
                    SCENARIO MATCHES ({r._scnMatches.length})
                  </div>
                  {r._scnMatches.length === 0 ? (
                    <div style={{ color: MU, fontSize: 9 }}>— no scenario plan</div>
                  ) : (
                    r._scnMatches.map((m, j) => (
                      <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        {chip(m.scn.type || m.scn.status || 'SCN', AM)}
                        <span style={{ color: '#ccc', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.scn.name || m.scn.title || m.scn.id || '?'}
                        </span>
                        {scorebar(m.score, AM)}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ASSESS footer */}
      <div style={{ padding: '8px 14px', borderTop: `1px solid ${RD}22` }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            background: assessing ? '#0a1520' : `${RD}22`,
            border: `1px solid ${RD}44`,
            color: RD,
            fontFamily: MONO,
            fontSize: 10,
            padding: '4px 12px',
            borderRadius: 4,
            cursor: assessing ? 'not-allowed' : 'pointer',
            letterSpacing: 1,
          }}
        >
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        {brief && (
          <div style={{ color: '#ccc', fontSize: 9, marginTop: 6, lineHeight: 1.6 }}>{brief}</div>
        )}
      </div>
    </div>
  );
}
