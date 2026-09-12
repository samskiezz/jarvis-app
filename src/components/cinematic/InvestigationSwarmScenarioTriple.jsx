/**
 * F218: Investigation × SwarmJob × Scenario Triple Coverage (INVSWSC)
 *
 * Three-way keyword-correlates each open investigation against active swarm jobs
 * AND operational scenarios to surface:
 *   FULLY AUTOMATED & PLANNED — swarm coverage + scenario response plan found
 *   AUTOMATED-ONLY            — swarm backing found, no scenario planning
 *   PLANNED-ONLY              — scenario exists, no swarm automation
 *   UNATTENDED                — neither — investigation has no automation or planning
 *
 * Real endpoints:
 *   GET /v1/investigations    — open investigation cases
 *   GET /entities/SwarmJob    — active swarm jobs
 *   GET /v1/scenario/list     — operational scenarios
 *   POST /v1/jarvis/agent/chat — ASSESS brief
 *
 * Voice triggers: "invswsc" / "invest swarm scenario" / "investigation triple" /
 *   "unattended investigation" / "automation plan invest" / "investigation automation plan" /
 *   "swarm scenario invest" / "invest automation scenario" / "investigation swarm"
 */

import { useState, useEffect, useCallback } from 'react';

const API = '';

const INVSWSC_RE =
  /\b(invswsc|invest[._-]?swarm[._-]?scenario|swarm[._-]?scenario[._-]?invest|investigation[._-]?triple|unattended[._-]?investigation|automation[._-]?plan[._-]?invest|investigation[._-]?automation[._-]?plan|swarm[._-]?scenario[._-]?investigation|investigation[._-]?swarm[._-]?scenario|invest[._-]?automation[._-]?scenario)\b/i;

export function isInvswscQuery(t) {
  return INVSWSC_RE.test(t || '');
}

// ── normalisers ────────────────────────────────────────────────────────────────

function normaliseInvestigations(raw) {
  if (!raw) return [];
  const arr = ['investigations', 'cases', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((inv, i) => ({
    id:     inv.id || String(i),
    name:   inv.name || inv.title || inv.subject || `Investigation ${i + 1}`,
    kind:   inv.kind || inv.type || inv.category || '',
    status: inv.status || inv.state || '',
    desc:   String(inv.description || inv.summary || inv.notes || '').slice(0, 300),
    tags:   Array.isArray(inv.tags) ? inv.tags.join(' ') : (inv.tags || ''),
    seeds:  Number(inv.seeds || inv.seed_count || 0),
  }));
}

function normaliseSwarmJobs(raw) {
  if (!raw) return [];
  const arr = ['swarm_jobs', 'jobs', 'items', 'results', 'data', 'records', 'entities'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((j, i) => ({
    id:     j.id || String(i),
    name:   j.name || j.title || j.target || `SwarmJob ${i + 1}`,
    kind:   j.kind || j.type || j.category || '',
    status: j.status || j.state || '',
    desc:   String(j.description || j.summary || j.domain || j.notes || '').slice(0, 300),
    tags:   Array.isArray(j.tags) ? j.tags.join(' ') : (j.tags || ''),
  }));
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  const arr = ['scenarios', 'items', 'results', 'data', 'records', 'list'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:       s.id || String(i),
    name:     s.name || s.title || `Scenario ${i + 1}`,
    category: s.category || s.type || s.kind || '',
    status:   s.status || s.state || '',
    desc:     String(s.description || s.summary || s.objective || s.notes || '').slice(0, 300),
    tags:     Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

// ── token helpers ─────────────────────────────────────────────────────────────

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(invToks, other) {
  const otherToks = [
    ...tokens(other.name || other.title || ''),
    ...tokens(other.kind || other.category || other.type || ''),
    ...tokens(other.status || ''),
    ...tokens(other.desc || other.description || other.summary || ''),
    ...tokens(other.tags || ''),
  ].filter(Boolean);
  if (!invToks.size || !otherToks.length) return 0;
  let hits = 0;
  for (const t of otherToks) if (invToks.has(t)) hits++;
  return hits / Math.max(invToks.size, otherToks.length);
}

// ── correlator ────────────────────────────────────────────────────────────────

function correlate(investigations, jobs, scenarios) {
  return investigations.map(inv => {
    const invToks = new Set([
      ...tokens(inv.name),
      ...tokens(inv.kind),
      ...tokens(inv.status),
      ...tokens(inv.desc),
      ...tokens(inv.tags),
    ].filter(Boolean));

    const matchedJobs = jobs
      .map(j => ({ ...j, _score: matchScore(invToks, j) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedScenarios = scenarios
      .map(s => ({ ...s, _score: matchScore(invToks, s) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasSwarm    = matchedJobs.length > 0;
    const hasScenario = matchedScenarios.length > 0;

    let coverage;
    if (hasSwarm && hasScenario)  coverage = 'FULLY AUTOMATED & PLANNED';
    else if (hasSwarm)             coverage = 'AUTOMATED-ONLY';
    else if (hasScenario)          coverage = 'PLANNED-ONLY';
    else                           coverage = 'UNATTENDED';

    return { ...inv, _jobs: matchedJobs, _scenarios: matchedScenarios, _coverage: coverage };
  });
}

// ── spoken script builder ─────────────────────────────────────────────────────

export async function buildInvswscScript() {
  try {
    const [iR, jR, sR] = await Promise.allSettled([
      fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : []),
    ]);
    const invs  = normaliseInvestigations(iR.status === 'fulfilled' ? iR.value : []);
    const jobs  = normaliseSwarmJobs(jR.status === 'fulfilled' ? jR.value : []);
    const scens = normaliseScenarios(sR.status === 'fulfilled' ? sR.value : []);
    const rows  = correlate(invs, jobs, scens);
    const fa = rows.filter(r => r._coverage === 'FULLY AUTOMATED & PLANNED').length;
    const ao = rows.filter(r => r._coverage === 'AUTOMATED-ONLY').length;
    const po = rows.filter(r => r._coverage === 'PLANNED-ONLY').length;
    const ua = rows.filter(r => r._coverage === 'UNATTENDED').length;
    return (
      `Investigation × SwarmJob × Scenario Triple Coverage (INVSWSC): ${invs.length} open investigations cross-referenced against ${jobs.length} swarm jobs and ${scens.length} operational scenarios. ` +
      `${fa} FULLY AUTOMATED & PLANNED (both swarm and scenario coverage found); ${ao} AUTOMATED-ONLY (swarm backing, no scenario); ` +
      `${po} PLANNED-ONLY (scenario exists, no swarm automation); ${ua} UNATTENDED (no automation or planning — critical gap). ` +
      (ua > 0
        ? `Unattended investigations: ${rows.filter(r => r._coverage === 'UNATTENDED').slice(0, 3).map(r => r.name || r.id || '?').join(', ')}. Recommend assigning swarm jobs and scenario coverage immediately.`
        : `All open investigations carry automation or scenario planning. Operational readiness is strong.`)
    );
  } catch {
    return 'Investigation × SwarmJob × Scenario Triple Coverage unavailable — check endpoints.';
  }
}

// ── colours & constants ───────────────────────────────────────────────────────

const PANEL_W = 660;
const PANEL_H = 620;
const GR  = '#22C55E';   // fully automated & planned
const CY  = '#00CFFF';   // automated-only
const AM  = '#F59E0B';   // planned-only
const RD  = '#EF4444';   // unattended
const DIM = '#6B7280';

const COVERAGE_COLOR = {
  'FULLY AUTOMATED & PLANNED': GR,
  'AUTOMATED-ONLY':            CY,
  'PLANNED-ONLY':              AM,
  'UNATTENDED':                RD,
};

const TABS = ['ALL', 'FULLY AUTOMATED & PLANNED', 'AUTOMATED-ONLY', 'PLANNED-ONLY', 'UNATTENDED'];

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
    <div style={{ height: 3, width: `${Math.round(score * 100)}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
  </div>
);

// ── component ─────────────────────────────────────────────────────────────────

export default function InvestigationSwarmScenarioTriple() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]           = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [iR, jR, sR] = await Promise.allSettled([
        fetch(`${API}/v1/investigations`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/scenario/list`).then(r => r.ok ? r.json() : []),
      ]);
      const invs  = normaliseInvestigations(iR.status === 'fulfilled' ? iR.value : []);
      const jobs  = normaliseSwarmJobs(jR.status === 'fulfilled' ? jR.value : []);
      const scens = normaliseScenarios(sR.status === 'fulfilled' ? sR.value : []);
      setRows(correlate(invs, jobs, scens));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:invswsc-toggle', toggle);
    return () => window.removeEventListener('jarvis:invswsc-toggle', toggle);
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
      const brief = await buildInvswscScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Investigation × SwarmJob × Scenario triple coverage: ${brief}. Give a 2-sentence operational readiness assessment.`,
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
    const unattended = rows.filter(r => r._coverage === 'UNATTENDED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investigation × SwarmJob × Scenario Triple Coverage (INVSWSC)"
        style={{
          position: 'fixed', left: 749600, bottom: 8, zIndex: 367,
          background: unattended > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${unattended > 0 ? RD : CY + '44'}`,
          color: unattended > 0 ? RD : CY,
          borderRadius: 4, padding: '3px 8px', fontSize: 10,
          cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ INVSWSC{unattended > 0 ? ` ⚠${unattended}` : ''}
      </button>
    );
  }

  // ── derived counts ──────────────────────────────────────────────────────────

  const fa  = rows.filter(r => r._coverage === 'FULLY AUTOMATED & PLANNED').length;
  const ao  = rows.filter(r => r._coverage === 'AUTOMATED-ONLY').length;
  const po  = rows.filter(r => r._coverage === 'PLANNED-ONLY').length;
  const ua  = rows.filter(r => r._coverage === 'UNATTENDED').length;

  const visible = rows.filter(r =>
    (tab === 'ALL' || r._coverage === tab) &&
    (!search || r.name.toLowerCase().includes(search.toLowerCase()) || r.kind.toLowerCase().includes(search.toLowerCase()))
  );

  // ── expanded panel ──────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040f', border: '1px solid #00CFFF33', borderRadius: 8,
      zIndex: 6218, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #00CFFF18',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid #00CFFF22',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>
          ◈ INVESTIGATION × SWARM × SCENARIO TRIPLE
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>INVSWSC</span>
        {ua > 0 && (
          <span style={{
            fontSize: 10, color: RD, background: '#EF444422',
            border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px',
          }}>
            ⚠ {ua} UNATTENDED
          </span>
        )}
        <button onClick={assess} disabled={assessing} style={{
          background: 'none', border: `1px solid ${CY}44`, color: CY,
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
          ['INVESTIGATIONS', rows.length, CY],
          ['FULLY AUTO+PLANNED', fa, GR],
          ['AUTOMATED-ONLY', ao, CY],
          ['PLANNED-ONLY', po, AM],
          ['UNATTENDED', ua, RD],
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
          {rows.length > 0 && [[fa, GR], [ao, CY], [po, AM], [ua, RD]].map(([v, c], i) =>
            v > 0 ? <div key={i} style={{ flex: v, background: c, transition: 'flex .4s' }} /> : null
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '2px 8px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
            background: tab === t ? (COVERAGE_COLOR[t] || CY) + '33' : '#08080f',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#888',
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
          placeholder="Search investigations…"
          style={{
            width: '100%', background: '#08080f', border: '1px solid #00CFFF33',
            borderRadius: 4, color: CY, fontSize: 10, padding: '4px 8px',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Assess result */}
      {assessText && (
        <div style={{
          margin: '0 12px 6px', padding: '6px 8px', background: '#05050d',
          border: '1px solid #00CFFF33', borderRadius: 4, fontSize: 10, color: '#ccc', flexShrink: 0,
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
            No investigations match filter.
          </div>
        )}
        {visible.map(inv => {
          const color = COVERAGE_COLOR[inv._coverage] || CY;
          const isExp = expanded === inv.id;
          return (
            <div key={inv.id} style={{
              marginBottom: 5, border: `1px solid ${color}33`,
              borderRadius: 5, background: '#06060e', overflow: 'hidden',
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : inv.id)}
                style={{ padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span style={{
                  fontSize: 10, color, minWidth: 0, flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {inv.name}
                </span>
                {inv.kind && (
                  <span style={{ fontSize: 9, color: DIM, flexShrink: 0 }}>{inv.kind}</span>
                )}
                {inv.seeds > 0 && (
                  <span style={{ fontSize: 9, color: '#555', flexShrink: 0 }}>seeds:{inv.seeds}</span>
                )}
                {chip(inv._coverage, color)}
                <span style={{ color: '#444', fontSize: 10, flexShrink: 0 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 8px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {/* Swarm jobs */}
                  <div>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4, fontWeight: 700 }}>
                      SWARM JOBS ({inv._jobs.length})
                    </div>
                    {inv._jobs.length === 0
                      ? <div style={{ fontSize: 9, color: '#555' }}>No swarm automation found</div>
                      : inv._jobs.map((j, i) => (
                        <div key={i} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
                            <span style={{ fontSize: 9, color: '#ccc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {j.name}
                            </span>
                            {j.kind && chip(j.kind, CY)}
                          </div>
                          <ScoreBar score={j._score} color={CY} />
                        </div>
                      ))
                    }
                  </div>
                  {/* Scenarios */}
                  <div>
                    <div style={{ fontSize: 9, color: AM, marginBottom: 4, fontWeight: 700 }}>
                      SCENARIOS ({inv._scenarios.length})
                    </div>
                    {inv._scenarios.length === 0
                      ? <div style={{ fontSize: 9, color: '#555' }}>No scenario planning found</div>
                      : inv._scenarios.map((s, i) => (
                        <div key={i} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
                            <span style={{ fontSize: 9, color: '#ccc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {s.name}
                            </span>
                            {s.category && chip(s.category, AM)}
                          </div>
                          <ScoreBar score={s._score} color={AM} />
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
        padding: '4px 12px', borderTop: '1px solid #00CFFF11',
        fontSize: 9, color: '#444', flexShrink: 0, display: 'flex', justifyContent: 'space-between',
      }}>
        <span>INVSWSC · /v1/investigations × /entities/SwarmJob × /v1/scenario/list</span>
        <button onClick={load} style={{ background: 'none', border: 'none', color: '#555', fontSize: 9, cursor: 'pointer' }}>
          ↻ refresh
        </button>
      </div>
    </div>
  );
}
