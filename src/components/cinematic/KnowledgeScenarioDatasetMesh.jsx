/**
 * F438 — Knowledge × Scenario × Dataset Intelligence Mesh (KSDM)
 *
 * Answers: "For each KB article, is there a matching response scenario AND a
 * backing dataset?  FULLY_GROUNDED (both), SCENARIO_ONLY, DATA_ONLY, or
 * THEORETICAL (neither — pure theory with no data and no action playbook)."
 *
 * Data sources (confirmed real endpoints):
 *   GET /knowledge/          → KB articles
 *   GET /v1/scenario/list   → response / action scenarios
 *   GET /v1/datasets        → data catalog
 *
 * Classification:
 *   FULLY_GROUNDED  — article has BOTH a matched scenario AND a matched dataset
 *   SCENARIO_ONLY   — scenario matched, no dataset
 *   DATA_ONLY       — dataset matched, no scenario
 *   THEORETICAL     — neither (no data, no playbook — knowledge gap risk)
 *
 * Stat tiles:  KB articles / scenarios / datasets / theoretical
 * Amber badge: theoretical count on button
 * Expand row:  matched scenarios (max 5) + matched datasets (max 5) with relevance bars
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ KSDM  at left:7380 bottom:18, zIndex:68
 * Event:   jarvis:ksdm-toggle
 * Voice:   "knowledge scenario dataset / ksdm / grounded knowledge / theoretical knowledge /
 *           kb scenario dataset / knowledge coverage mesh / ungrounded knowledge /
 *           knowledge data gap / kb without data / knowledge without playbook"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || 'dev-key';

const BG   = 'rgba(10,12,20,0.97)';
const BD   = 'rgba(255,255,255,0.10)';
const MU   = '#64748B';
const AM   = '#F59E0B';
const CY   = '#06B6D4';
const VI   = '#A78BFA';
const GR   = '#10B981';
const MONO = "'JetBrains Mono','Fira Code',monospace";

const FILTERS     = ['ALL', 'FULLY_GROUNDED', 'SCENARIO_ONLY', 'DATA_ONLY', 'THEORETICAL'];
const CLASS_COLOR = {
  FULLY_GROUNDED : GR,
  SCENARIO_ONLY  : VI,
  DATA_ONLY      : CY,
  THEORETICAL    : AM,
};

// ─── exports for JarvisBrain ─────────────────────────────────────────────────
const KSDM_RE =
  /\b(knowledge[._-]?scenario[._-]?dataset|ksdm|grounded[._-]?knowledge|theoretical[._-]?knowledge|kb[._-]?scenario[._-]?dataset|knowledge[._-]?coverage[._-]?mesh|ungrounded[._-]?knowledge|knowledge[._-]?data[._-]?gap|kb[._-]?without[._-]?data|knowledge[._-]?without[._-]?playbook)\b/i;

export function isKsdmQuery(t) { return KSDM_RE.test(t || ''); }

export async function buildKsdmScript() {
  const [kbR, scR, dsR] = await Promise.allSettled([
    fetch(`${API}/knowledge/`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${API}/v1/datasets`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
  ]);
  const articles   = normKb(kbR.status === 'fulfilled' ? kbR.value : []);
  const scenarios  = normScenarios(scR.status === 'fulfilled' ? scR.value : []);
  const datasets   = normDatasets(dsR.status === 'fulfilled' ? dsR.value : []);
  const enriched   = enrich(articles, scenarios, datasets);
  const theoretical = enriched.filter(r => r._class === 'THEORETICAL').length;
  const full        = enriched.filter(r => r._class === 'FULLY_GROUNDED').length;
  return (
    `Knowledge × Scenario × Dataset Mesh: ${articles.length} KB articles, ` +
    `${scenarios.length} scenarios, ${datasets.length} datasets. ` +
    `${full} articles are fully grounded (scenario + dataset match); ` +
    `${theoretical} are THEORETICAL (no data, no playbook — knowledge gap). ` +
    `Theoretical articles: ${enriched.filter(r => r._class === 'THEORETICAL').slice(0, 3)
      .map(r => r.title || r.name || '?').join(', ') || 'none'}.`
  );
}

// ─── normalise ───────────────────────────────────────────────────────────────
function normKb(raw) {
  if (!raw) return [];
  for (const k of ['articles', 'items', 'results', 'data', 'entries']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return Array.isArray(raw) ? raw : [];
}
function normScenarios(raw) {
  if (!raw) return [];
  for (const k of ['scenarios', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return Array.isArray(raw) ? raw : [];
}
function normDatasets(raw) {
  if (!raw) return [];
  for (const k of ['datasets', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return Array.isArray(raw) ? raw : [];
}

// ─── token extraction ─────────────────────────────────────────────────────────
function tokens(obj) {
  if (!obj) return new Set();
  const bag = Object.values(obj)
    .flatMap(v => (Array.isArray(v) ? v : [v]))
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
  return new Set(bag);
}

function relevance(aTokens, b) {
  const bTok = tokens(b);
  let hits = 0;
  for (const t of aTokens) if (bTok.has(t)) hits++;
  return hits;
}

// ─── enrichment ──────────────────────────────────────────────────────────────
function enrich(articles, scenarios, datasets) {
  return articles.map(art => {
    const aTok = tokens(art);
    const matchedScenarios = scenarios
      .map(s => ({ ...s, _score: relevance(aTok, s) }))
      .filter(s => s._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    const matchedDatasets = datasets
      .map(d => ({ ...d, _score: relevance(aTok, d) }))
      .filter(d => d._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    const hasSc = matchedScenarios.length > 0;
    const hasDs = matchedDatasets.length > 0;
    const _class = hasSc && hasDs ? 'FULLY_GROUNDED'
      : hasSc ? 'SCENARIO_ONLY'
      : hasDs  ? 'DATA_ONLY'
      : 'THEORETICAL';
    return { ...art, _class, matchedScenarios, matchedDatasets };
  });
}

// ─── component ───────────────────────────────────────────────────────────────
export default function KnowledgeScenarioDatasetMesh() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [filter, setFilter]   = useState('ALL');
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [kbR, scR, dsR] = await Promise.allSettled([
        fetch(`${API}/knowledge/`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${API}/v1/datasets`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const articles  = normKb(kbR.status === 'fulfilled' ? kbR.value : []);
      const scenarios = normScenarios(scR.status === 'fulfilled' ? scR.value : []);
      const datasets  = normDatasets(dsR.status === 'fulfilled' ? dsR.value : []);
      setRows(enrich(articles, scenarios, datasets));
      setLastFetch(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:ksdm-toggle', handler);
    return () => window.removeEventListener('jarvis:ksdm-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true); setAssessText('');
    try {
      const script = await buildKsdmScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Assess this knowledge-scenario-dataset coverage report in 2 sentences:\n${script}` }),
      }).then(x => x.json());
      const txt = r?.response || r?.content || r?.message || script;
      setAssessText(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch (_) { setAssessText('Assessment unavailable.'); }
    setAssessing(false);
  }, []);

  const theoretical = rows.filter(r => r._class === 'THEORETICAL').length;
  const full        = rows.filter(r => r._class === 'FULLY_GROUNDED').length;
  const scenOnly    = rows.filter(r => r._class === 'SCENARIO_ONLY').length;
  const dataOnly    = rows.filter(r => r._class === 'DATA_ONLY').length;

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r._class !== filter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.title || r.name || '').toLowerCase().includes(q) ||
           (r.topic || r.category || '').toLowerCase().includes(q);
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Knowledge × Scenario × Dataset Mesh"
        style={{
          position: 'fixed', left: 7380, bottom: 18, zIndex: 68,
          fontFamily: MONO, fontSize: 10, padding: '3px 8px',
          background: 'rgba(10,12,20,0.85)', border: `1px solid ${BD}`,
          color: CY, cursor: 'pointer', borderRadius: 4, whiteSpace: 'nowrap',
        }}
      >
        ◈ KSDM
        {theoretical > 0 && (
          <span style={{
            marginLeft: 4, background: AM, color: '#000',
            borderRadius: 8, padding: '1px 5px', fontSize: 9,
          }}>{theoretical}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)',
      width: 720, maxHeight: '80vh', overflowY: 'auto',
      background: BG, border: `1px solid ${BD}`, borderRadius: 10,
      zIndex: 900, padding: 20, fontFamily: MONO,
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
    }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
          ◈ KNOWLEDGE × SCENARIO × DATASET MESH
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={assess} disabled={assessing} style={{
            fontFamily: MONO, fontSize: 10, padding: '3px 10px',
            background: 'transparent', border: `1px solid ${VI}`,
            color: VI, cursor: 'pointer', borderRadius: 4,
          }}>▶ ASSESS</button>
          <button onClick={() => setOpen(false)} style={{
            fontFamily: MONO, fontSize: 11, padding: '2px 8px',
            background: 'transparent', border: `1px solid ${MU}`,
            color: MU, cursor: 'pointer', borderRadius: 4,
          }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'KB ARTICLES', value: rows.length, color: CY },
          { label: 'GROUNDED', value: full, color: GR },
          { label: 'DATA_ONLY', value: dataOnly, color: CY },
          { label: 'THEORETICAL', value: theoretical, color: AM },
        ].map(t => (
          <div key={t.label} style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: 6,
            padding: '8px 10px', textAlign: 'center',
          }}>
            <div style={{ color: t.color, fontSize: 18, fontWeight: 700 }}>{t.value}</div>
            <div style={{ color: MU, fontSize: 9, letterSpacing: 1 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* proportional bar */}
      {rows.length > 0 && (
        <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
          {[['FULLY_GROUNDED', GR], ['SCENARIO_ONLY', VI], ['DATA_ONLY', CY], ['THEORETICAL', AM]]
            .map(([cls, col]) => {
              const pct = (rows.filter(r => r._class === cls).length / rows.length) * 100;
              return pct > 0 ? (
                <div key={cls} style={{ width: `${pct}%`, background: col }} title={`${cls}: ${pct.toFixed(0)}%`} />
              ) : null;
            })}
        </div>
      )}

      {/* assess text */}
      {assessText && (
        <div style={{
          margin: '0 0 12px', padding: '8px 12px',
          background: 'rgba(167,139,250,0.08)', border: `1px solid ${VI}`,
          borderRadius: 6, color: '#e2e8f0', fontSize: 11, lineHeight: 1.5,
        }}>{assessText}</div>
      )}

      {/* filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            fontFamily: MONO, fontSize: 9, padding: '2px 8px',
            background: filter === f ? CY : 'transparent',
            border: `1px solid ${filter === f ? CY : BD}`,
            color: filter === f ? '#000' : MU,
            cursor: 'pointer', borderRadius: 3,
          }}>{f}</button>
        ))}
        <input
          placeholder="search articles…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            marginLeft: 'auto', fontFamily: MONO, fontSize: 10,
            background: 'rgba(255,255,255,0.05)', border: `1px solid ${BD}`,
            color: '#e2e8f0', padding: '2px 8px', borderRadius: 3, width: 160,
          }}
        />
      </div>

      {/* rows */}
      {loading && rows.length === 0 && (
        <div style={{ color: MU, fontSize: 11, textAlign: 'center', padding: 20 }}>loading…</div>
      )}
      {!loading && visible.length === 0 && (
        <div style={{ color: MU, fontSize: 11, textAlign: 'center', padding: 20 }}>no articles match</div>
      )}
      {visible.map((art, i) => {
        const isExp = expanded === i;
        const clsColor = CLASS_COLOR[art._class] || MU;
        return (
          <div key={i} style={{
            marginBottom: 6, borderRadius: 6, overflow: 'hidden',
            border: `1px solid ${isExp ? clsColor : BD}`,
          }}>
            <div
              onClick={() => setExpanded(isExp ? null : i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 12px', cursor: 'pointer',
                background: isExp ? 'rgba(255,255,255,0.05)' : 'transparent',
              }}
            >
              <span style={{
                fontSize: 9, padding: '1px 6px', borderRadius: 3,
                background: `${clsColor}22`, color: clsColor, whiteSpace: 'nowrap',
              }}>{art._class}</span>
              <span style={{ color: '#e2e8f0', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {art.title || art.name || `Article ${i + 1}`}
              </span>
              {art.topic && (
                <span style={{ color: MU, fontSize: 9, whiteSpace: 'nowrap' }}>{art.topic}</span>
              )}
              <span style={{ color: MU, fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
            </div>
            {isExp && (
              <div style={{ padding: '8px 14px 12px', borderTop: `1px solid ${BD}` }}>
                {/* matched scenarios */}
                <div style={{ color: VI, fontSize: 10, marginBottom: 6, letterSpacing: 1 }}>
                  MATCHED SCENARIOS ({art.matchedScenarios.length})
                </div>
                {art.matchedScenarios.length === 0 && (
                  <div style={{ color: MU, fontSize: 10, marginBottom: 10 }}>none</div>
                )}
                {art.matchedScenarios.map((s, j) => (
                  <div key={j} style={{ marginBottom: 5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ color: '#e2e8f0', fontSize: 10 }}>{s.name || s.title || `Scenario ${j + 1}`}</span>
                      <span style={{ color: VI, fontSize: 9 }}>score {s._score}</span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                      <div style={{ width: `${Math.min(100, s._score * 15)}%`, height: '100%', background: VI, borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
                {/* matched datasets */}
                <div style={{ color: CY, fontSize: 10, margin: '10px 0 6px', letterSpacing: 1 }}>
                  MATCHED DATASETS ({art.matchedDatasets.length})
                </div>
                {art.matchedDatasets.length === 0 && (
                  <div style={{ color: MU, fontSize: 10 }}>none</div>
                )}
                {art.matchedDatasets.map((d, j) => (
                  <div key={j} style={{ marginBottom: 5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ color: '#e2e8f0', fontSize: 10 }}>{d.name || d.title || `Dataset ${j + 1}`}</span>
                      <span style={{ color: CY, fontSize: 9 }}>score {d._score}</span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                      <div style={{ width: `${Math.min(100, d._score * 15)}%`, height: '100%', background: CY, borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* footer */}
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', color: MU, fontSize: 9 }}>
        <span>SCENARIO_ONLY: {scenOnly} · DATA_ONLY: {dataOnly}</span>
        <span>{lastFetch ? `updated ${lastFetch.toLocaleTimeString()}` : 'loading…'}</span>
      </div>
    </div>
  );
}
