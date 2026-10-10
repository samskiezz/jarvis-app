/**
 * F230: Contact × Scene × Risk Signal Triple Coverage (CSCRS)
 *
 * Parallel-fetches /entities/Contact × all 10 /v1/cinematic/scene/{id} ×
 * /entities/RiskSignal, then keyword-correlates each contact against scene
 * anchor texts AND active risk signals to surface:
 *   FULLY EXPOSED   — scene-aligned + risk signal matched
 *   SCENE-ALIGNED   — scene match found, no risk signal
 *   AT-RISK         — risk signal found, no scene context
 *   CLEAR           — neither
 *
 * Real endpoints:
 *   GET /entities/Contact              — contact directory
 *   GET /v1/cinematic/scene/{id}       — cinematic scene anchors (10 scenes)
 *   GET /entities/RiskSignal           — active risk signals
 *   POST /v1/jarvis/agent/chat         — ASSESS brief
 *
 * Voice triggers: "cscrs" / "contact scene risk" / "exposed contact scene" /
 *   "scene risk contact" / "scene aligned contact" / "contact risk scene"
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const API     = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const API_KEY = import.meta.env.VITE_API_KEY ?? 'dev-key';
const hdr     = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

const PANEL_W = 780;
const PANEL_H = 680;

const CY  = '#00CFFF';
const GR  = '#22C55E';
const AM  = '#F59E0B';
const RD  = '#EF4444';
const PU  = '#A855F7';
const DIM = 'rgba(0,0,0,0.82)';
const BDR = 'rgba(0,207,255,0.18)';

const THRESHOLD = 0.1;

const SCENE_IDS = [
  '01_command_atrium',
  '02_neural_core',
  '03_threat_matrix',
  '04_data_nexus',
  '05_strategic_ops',
  '06_comms_relay',
  '07_intelligence_vault',
  '08_tactical_grid',
  '09_resource_hub',
  '10_oversight_bridge',
];

const CSCRS_RE = /\b(cscrs|contact[._\s-]?scene[._\s-]?risk|scene[._\s-]?risk[._\s-]?contact|exposed[._\s-]?contact[._\s-]?scene|scene[._\s-]?align\w*[._\s-]?contact|contact[._\s-]?risk[._\s-]?scene)\b/i;

export function isCscrsQuery(t) { return CSCRS_RE.test(t || ''); }

// ── helpers ───────────────────────────────────────────────────────────────────

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(aToks, bFields) {
  if (!aToks.length) return 0;
  const pool = tokens(bFields.join(' '));
  if (!pool.length) return 0;
  const hits = aToks.filter(t => pool.includes(t)).length;
  return hits / Math.max(aToks.length, pool.length);
}

// ── normalisers ───────────────────────────────────────────────────────────────

function normaliseContacts(raw) {
  const arr = Array.isArray(raw) ? raw : raw?.items ?? raw?.data ?? raw?.results ?? [];
  return arr.map(c => ({
    id:    String(c.id ?? c._id ?? Math.random()),
    name:  String(c.name ?? c.full_name ?? c.display_name ?? 'Unknown Contact'),
    org:   String(c.org ?? c.company ?? c.organisation ?? c.organization ?? ''),
    role:  String(c.role ?? c.title ?? c.position ?? ''),
    email: String(c.email ?? ''),
    desc:  String(c.description ?? c.bio ?? c.notes ?? ''),
    tags:  Array.isArray(c.tags) ? c.tags : [],
  }));
}

function normaliseScene(raw, id) {
  if (!raw) return null;
  const title   = String(raw.title ?? raw.name ?? id);
  const anchors = Array.isArray(raw.anchors) ? raw.anchors.map(a => String(a.label ?? a.text ?? a.title ?? a)) : [];
  const desc    = String(raw.description ?? raw.summary ?? '');
  return { id, title, anchors, desc };
}

function normaliseRisks(raw) {
  const arr = Array.isArray(raw) ? raw : raw?.items ?? raw?.data ?? raw?.results ?? [];
  return arr.map(r => ({
    id:       String(r.id ?? r._id ?? Math.random()),
    name:     String(r.name ?? r.title ?? r.signal ?? 'Unknown Risk'),
    severity: String(r.severity ?? r.level ?? r.priority ?? 'UNKNOWN').toUpperCase(),
    category: String(r.category ?? r.type ?? ''),
    desc:     String(r.description ?? r.summary ?? ''),
    source:   String(r.source ?? ''),
    tags:     Array.isArray(r.tags) ? r.tags : [],
  }));
}

// ── correlation ───────────────────────────────────────────────────────────────

function correlate(contacts, scenes, risks) {
  return contacts.map(contact => {
    const cToks = tokens([contact.name, contact.org, contact.role, contact.desc, ...contact.tags].join(' '));

    const bestScene = scenes.reduce((best, sc) => {
      if (!sc) return best;
      const s = matchScore(cToks, [sc.title, sc.desc, ...sc.anchors]);
      return s > best.score ? { score: s, item: sc } : best;
    }, { score: 0, item: null });

    const bestRisk = risks.reduce((best, r) => {
      const s = matchScore(cToks, [r.name, r.category, r.desc, r.source, ...r.tags]);
      return s > best.score ? { score: s, item: r } : best;
    }, { score: 0, item: null });

    const hasScene = bestScene.score >= THRESHOLD;
    const hasRisk  = bestRisk.score >= THRESHOLD;

    let coverage, color;
    if (hasScene && hasRisk) {
      coverage = 'FULLY EXPOSED'; color = RD;
    } else if (hasScene) {
      coverage = 'SCENE-ALIGNED'; color = CY;
    } else if (hasRisk) {
      coverage = 'AT-RISK';       color = AM;
    } else {
      coverage = 'CLEAR';         color = GR;
    }

    return {
      contact, coverage, color,
      scene:      hasScene ? bestScene.item  : null,
      risk:       hasRisk  ? bestRisk.item   : null,
      sceneScore: bestScene.score,
      riskScore:  bestRisk.score,
    };
  });
}

// ── script builder ─────────────────────────────────────────────────────────────

export async function buildCscrsScript() {
  try {
    const [contR, ...sceneRs] = await Promise.allSettled([
      fetch(`${API}/entities/Contact`,    { headers: hdr }).then(r => r.ok ? r.json() : null),
      ...SCENE_IDS.map(id =>
        fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdr })
          .then(r => r.ok ? r.json() : null)
          .then(d => normaliseScene(d, id))
      ),
    ]);
    const riskR = await fetch(`${API}/entities/RiskSignal`, { headers: hdr })
      .then(r => r.ok ? r.json() : null).catch(() => null);

    const contacts = normaliseContacts(contR.status === 'fulfilled' ? contR.value : null);
    const scenes   = sceneRs.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
    const risks    = normaliseRisks(riskR);

    const rows   = correlate(contacts, scenes, risks);
    const counts = { 'FULLY EXPOSED': 0, 'SCENE-ALIGNED': 0, 'AT-RISK': 0, 'CLEAR': 0 };
    rows.forEach(r => { counts[r.coverage] = (counts[r.coverage] || 0) + 1; });

    const exposed = rows.filter(r => r.coverage === 'FULLY EXPOSED').slice(0, 5);
    const lines = [
      'Contact × Scene × Risk Signal Triple Coverage (CSCRS)',
      `${contacts.length} contacts | ${scenes.length} scenes | ${risks.length} risk signals`,
      `FULLY EXPOSED: ${counts['FULLY EXPOSED']} | SCENE-ALIGNED: ${counts['SCENE-ALIGNED']} | AT-RISK: ${counts['AT-RISK']} | CLEAR: ${counts['CLEAR']}`,
    ];
    if (exposed.length) {
      lines.push(`Fully exposed contacts: ${exposed.map(r => r.contact.name).join(', ')}`);
    }
    return lines.join('\n');
  } catch {
    return 'CSCRS: data unavailable';
  }
}

// ── component ──────────────────────────────────────────────────────────────────

const TABS = ['ALL', 'FULLY EXPOSED', 'SCENE-ALIGNED', 'AT-RISK', 'CLEAR'];

const SEV_COLOR = { CRITICAL: RD, HIGH: AM, MEDIUM: PU, LOW: GR, UNKNOWN: '#6B7280' };

export default function ContactSceneRiskTriple() {
  const [open,    setOpen]    = useState(false);
  const [rows,    setRows]    = useState([]);
  const [tab,     setTab]     = useState('ALL');
  const [search,  setSearch]  = useState('');
  const [busy,    setBusy]    = useState(false);
  const [assess,  setAssess]  = useState('');
  const [err,     setErr]     = useState('');
  const timerRef = useRef(null);

  const toggle = useCallback(() => setOpen(o => !o), []);

  const load = useCallback(async () => {
    setBusy(true); setErr('');
    try {
      const [contR, ...sceneRs] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`,    { headers: hdr }).then(r => r.ok ? r.json() : null),
        ...SCENE_IDS.map(id =>
          fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdr })
            .then(r => r.ok ? r.json() : null)
            .then(d => normaliseScene(d, id))
        ),
      ]);
      const riskR = await fetch(`${API}/entities/RiskSignal`, { headers: hdr })
        .then(r => r.ok ? r.json() : null).catch(() => null);

      const contacts = normaliseContacts(contR.status === 'fulfilled' ? contR.value : null);
      const scenes   = sceneRs.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
      const risks    = normaliseRisks(riskR);
      setRows(correlate(contacts, scenes, risks));
    } catch (e) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('jarvis:cscrs-toggle', toggle);
    return () => window.removeEventListener('jarvis:cscrs-toggle', toggle);
  }, [toggle]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = { 'FULLY EXPOSED': 0, 'SCENE-ALIGNED': 0, 'AT-RISK': 0, 'CLEAR': 0 };
  rows.forEach(r => { counts[r.coverage] = (counts[r.coverage] || 0) + 1; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.coverage !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.contact.name.toLowerCase().includes(q)
        || r.contact.org.toLowerCase().includes(q)
        || (r.scene?.title ?? '').toLowerCase().includes(q)
        || (r.risk?.name ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const runAssess = async () => {
    setAssess('◌ Assessing…');
    try {
      const script = await buildCscrsScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: hdr,
        body: JSON.stringify({ message: `Contact × Scene × Risk Signal triple coverage assessment:\n${script}` }),
      });
      const d = await r.json();
      const msg = d.response ?? d.answer ?? d.text ?? script;
      setAssess(msg);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: msg } }));
    } catch {
      setAssess('ASSESS unavailable');
    }
  };

  if (!open) {
    return (
      <button
        onClick={toggle}
        title="Contact × Scene × Risk Signal Coverage"
        style={{
          position: 'fixed', left: 756320, bottom: 8, zIndex: 379,
          background: counts['FULLY EXPOSED'] > 0 ? RD : DIM,
          border: `1px solid ${counts['FULLY EXPOSED'] > 0 ? RD : CY}`,
          color: CY, fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          letterSpacing: 1, padding: '3px 7px', cursor: 'pointer', borderRadius: 3,
          whiteSpace: 'nowrap',
        }}
      >
        ◈ CSCRS {counts['FULLY EXPOSED'] > 0 ? <span style={{ color: '#fff', fontWeight: 700 }}>{counts['FULLY EXPOSED']}✗</span> : null}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, zIndex: 379,
      width: PANEL_W, height: PANEL_H,
      background: DIM, border: `1px solid ${BDR}`,
      borderRadius: 6, display: 'flex', flexDirection: 'column',
      fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: CY,
      backdropFilter: 'blur(12px)', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${BDR}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>◈ CSCRS — CONTACT × SCENE × RISK SIGNAL</span>
        {busy && <span style={{ color: AM, fontSize: 9 }}>◌ LOADING</span>}
        <button onClick={load} title="Refresh" style={{ background: 'none', border: 'none', color: CY, cursor: 'pointer', fontSize: 10 }}>↺</button>
        <button onClick={toggle} style={{ background: 'none', border: 'none', color: CY, cursor: 'pointer', fontSize: 12 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${BDR}` }}>
        {[
          { label: 'FULLY EXPOSED',  count: counts['FULLY EXPOSED'],  color: RD },
          { label: 'SCENE-ALIGNED',  count: counts['SCENE-ALIGNED'],  color: CY },
          { label: 'AT-RISK',        count: counts['AT-RISK'],        color: AM },
          { label: 'CLEAR',          count: counts['CLEAR'],          color: GR },
        ].map(({ label, count, color }) => (
          <div key={label} style={{
            flex: 1, background: 'rgba(0,0,0,0.4)', border: `1px solid ${color}33`,
            borderRadius: 4, padding: '5px 8px', textAlign: 'center',
          }}>
            <div style={{ color, fontSize: 16, fontWeight: 700 }}>{count}</div>
            <div style={{ color: '#9CA3AF', fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderBottom: `1px solid ${BDR}`, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? CY : 'transparent',
            color: tab === t ? '#000' : CY,
            border: `1px solid ${CY}44`, borderRadius: 3,
            padding: '2px 7px', fontSize: 9, cursor: 'pointer', letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{
            marginLeft: 'auto', background: 'rgba(0,0,0,0.5)', border: `1px solid ${BDR}`,
            color: CY, padding: '2px 6px', fontSize: 9, borderRadius: 3,
            fontFamily: "'JetBrains Mono',monospace", outline: 'none', width: 150,
          }}
        />
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px' }}>
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>⚠ {err}</div>}
        {!err && visible.length === 0 && (
          <div style={{ color: '#4B5563', fontSize: 10, padding: 8 }}>
            {busy ? '◌ Loading contacts…' : 'No contacts match.'}
          </div>
        )}
        {visible.map((row, i) => (
          <div key={row.contact.id + i} style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto',
            gap: 6, padding: '5px 0', borderBottom: `1px solid ${BDR}`,
            alignItems: 'start',
          }}>
            {/* contact */}
            <div>
              <div style={{ color: '#E5E7EB', fontSize: 10, fontWeight: 600 }}>{row.contact.name}</div>
              {row.contact.org && (
                <div style={{ fontSize: 8, color: '#6B7280', letterSpacing: 1 }}>{row.contact.org}</div>
              )}
              {row.contact.role && (
                <div style={{ fontSize: 8, color: '#4B5563' }}>{row.contact.role}</div>
              )}
            </div>

            {/* scene */}
            <div>
              {row.scene ? (
                <>
                  <div style={{ color: CY, fontSize: 9, fontWeight: 600 }}>✓ SCENE</div>
                  <div style={{ color: '#9CA3AF', fontSize: 8 }}>{row.scene.title.slice(0, 50)}</div>
                  <div style={{ marginTop: 2, height: 3, background: `${CY}33`, borderRadius: 2 }}>
                    <div style={{ width: `${Math.round(row.sceneScore * 100)}%`, height: '100%', background: CY, borderRadius: 2 }} />
                  </div>
                </>
              ) : (
                <div style={{ color: '#4B5563', fontSize: 9 }}>— no scene</div>
              )}
            </div>

            {/* risk */}
            <div>
              {row.risk ? (
                <>
                  <div style={{ color: SEV_COLOR[row.risk.severity] ?? AM, fontSize: 9, fontWeight: 600 }}>
                    ⚠ {row.risk.severity}
                  </div>
                  <div style={{ color: '#9CA3AF', fontSize: 8 }}>{row.risk.name.slice(0, 50)}</div>
                  <div style={{ marginTop: 2, height: 3, background: `${AM}33`, borderRadius: 2 }}>
                    <div style={{ width: `${Math.round(row.riskScore * 100)}%`, height: '100%', background: AM, borderRadius: 2 }} />
                  </div>
                </>
              ) : (
                <div style={{ color: '#4B5563', fontSize: 9 }}>— no risk</div>
              )}
            </div>

            {/* coverage badge */}
            <div style={{
              background: `${row.color}22`, border: `1px solid ${row.color}66`,
              borderRadius: 3, padding: '2px 5px', fontSize: 8, color: row.color,
              letterSpacing: 1, whiteSpace: 'nowrap', textAlign: 'center',
            }}>
              {row.coverage}
            </div>
          </div>
        ))}
      </div>

      {/* ASSESS + TTS output */}
      <div style={{ padding: '6px 12px', borderTop: `1px solid ${BDR}` }}>
        <button onClick={runAssess} style={{
          background: 'rgba(0,207,255,0.1)', border: `1px solid ${CY}`,
          color: CY, padding: '4px 14px', fontSize: 10, cursor: 'pointer',
          borderRadius: 3, letterSpacing: 2, fontFamily: "'JetBrains Mono',monospace",
        }}>
          ◈ ASSESS
        </button>
        {assess && (
          <div style={{
            marginTop: 6, fontSize: 9, color: '#9CA3AF', maxHeight: 80,
            overflowY: 'auto', lineHeight: 1.5, whiteSpace: 'pre-wrap',
          }}>
            {assess}
          </div>
        )}
      </div>
    </div>
  );
}
