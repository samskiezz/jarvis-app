/**
 * ContactInvestmentScenarioAlignment — F50
 *
 * Fetches /entities/Contact + /entities/Investment + /v1/scenario/list
 * Cross-references each contact against investments AND scenarios to classify:
 *   ALIGNED  — matched both an investment AND a scenario (fully strategic)
 *   INVESTED — matched an investment only (financially linked, no scenario context)
 *   SCENED   — matched a scenario only (scenario-relevant contact, no investment link)
 *   SHADOW   — no match in either (dark contact — no strategic alignment)
 *
 * Toggle: ◈ CISALIGN button (fixed, bottom strip) left:76920, zIndex:148
 * Stat tiles: contacts / investments / scenarios / aligned / invested / scened / shadow
 * Amber pulse on SHADOW count.
 * Expandable rows: matched investments with type/value badge + matched scenarios with status badge.
 * Filter tabs: ALL / ALIGNED / INVESTED / SCENED / SHADOW + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "contact investment scenario"/"strategic alignment"/"cisalign"/"shadow contacts"/
 *        "unaligned contacts"/"contact alignment"/"investment scenario"/"strategic contacts"/
 *        "contact strategy"/"dark contacts"
 * Event: jarvis:cisalign-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ALIGNED', 'INVESTED', 'SCENED', 'SHADOW'];

const CLS_COLOR = {
  ALIGNED:  '#00E5A0',
  INVESTED: '#29E7FF',
  SCENED:   '#A78BFA',
  SHADOW:   '#FFB800',
};

const PULSE_CSS = `@keyframes cisalign-pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function classifyContact(cToks, investments, scenarios) {
  const matchedInvestments = investments.filter(inv =>
    overlaps(cToks, [inv.title, inv.name, inv.type, inv.category, inv.tags, inv.description, inv.entity, inv.contact, inv.owner, inv.manager].join(' '))
  );
  const matchedScenarios = scenarios.filter(sc =>
    overlaps(cToks, [sc.title, sc.name, sc.type, sc.category, sc.tags, sc.description, sc.topic, sc.domain, sc.contact, sc.stakeholder].join(' '))
  );
  const hasInvestment = matchedInvestments.length > 0;
  const hasScenario   = matchedScenarios.length > 0;
  const cls = hasInvestment && hasScenario ? 'ALIGNED'
            : hasInvestment ? 'INVESTED'
            : hasScenario   ? 'SCENED'
            : 'SHADOW';
  return { cls, matchedInvestments, matchedScenarios };
}

function normalizeArray(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

function fmtValue(inv) {
  const v = inv.value || inv.amount || inv.total || inv.current_value || inv.market_value;
  if (!v) return null;
  const n = parseFloat(v);
  if (isNaN(n)) return String(v).slice(0, 12);
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function isCisalignQuery(q) {
  return /\b(cisalign|contact.invest|invest.scenario|strategic.align|shadow.contact|unalign.contact|contact.align|invest.scenario|strategic.contact|contact.strategy|dark.contact|contact.strategic)\b/i.test(q);
}
export function buildCisalignScript() {
  return 'Opening Contact × Investment × Scenario Strategic Alignment. Cross-referencing contacts against investments and scenarios to map strategic alignment and identify dark unlinked contacts.';
}

export default function ContactInvestmentScenarioAlignment() {
  const [open, setOpen]                     = useState(false);
  const [rows, setRows]                     = useState([]);
  const [investmentCount, setInvestmentCount] = useState(0);
  const [scenarioCount, setScenarioCount]   = useState(0);
  const [tab, setTab]                       = useState('ALL');
  const [search, setSearch]                 = useState('');
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState('');
  const [expanded, setExpanded]             = useState(null);
  const [assessing, setAssessing]           = useState(false);
  const [assessment, setAssessment]         = useState('');
  const intervalRef                         = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const h = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
      const [ctcRes, invRes, scnRes] = await Promise.all([
        fetch(`${API}/entities/Contact`,   { headers: h }),
        fetch(`${API}/entities/Investment`,{ headers: h }),
        fetch(`${API}/v1/scenario/list`,   { headers: h }),
      ]);
      const [ctcRaw, invRaw, scnRaw] = await Promise.all([
        ctcRes.ok ? ctcRes.json() : [],
        invRes.ok ? invRes.json() : [],
        scnRes.ok ? scnRes.json() : [],
      ]);

      const contacts    = normalizeArray(ctcRaw, ['items','data','results','contacts','people','persons']);
      const investments = normalizeArray(invRaw, ['items','data','results','investments','portfolio','assets']);
      const scenarios   = normalizeArray(scnRaw, ['items','data','results','scenarios','list']);

      setInvestmentCount(investments.length);
      setScenarioCount(scenarios.length);

      const built = contacts.map((c, i) => {
        const id      = c.id || c.contact_id || `ctc-${i}`;
        const name    = c.name || c.full_name || c.title || c.display_name || id;
        const role    = c.role || c.title || c.position || c.job_title || '';
        const org     = c.organization || c.company || c.org || c.employer || '';
        const tags    = c.tags || c.keywords || '';
        const toks    = tokens([name, role, org, tags, c.description, c.domain, c.sector, c.category, c.notes].join(' '));
        const { cls, matchedInvestments, matchedScenarios } = classifyContact(toks, investments, scenarios);
        return { id, name, role, org, _cls: cls, _investments: matchedInvestments, _scenarios: matchedScenarios };
      });
      setRows(built);
    } catch (e) {
      setError(e.message || 'fetch error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = e => { if (e.detail?.open !== undefined) setOpen(e.detail.open); else setOpen(o => !o); };
    window.addEventListener('jarvis:cisalign-toggle', handler);
    return () => window.removeEventListener('jarvis:cisalign-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(intervalRef.current); return; }
    load();
    intervalRef.current = setInterval(load, 90000);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true); setAssessment('');
    const counts = { ALIGNED: 0, INVESTED: 0, SCENED: 0, SHADOW: 0 };
    rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });
    const shadowNames = rows.filter(r => r._cls === 'SHADOW').slice(0, 5).map(r => r.name).join(', ');
    const prompt = `Contact × Investment × Scenario Strategic Alignment assessment: ${rows.length} contacts cross-referenced against ${investmentCount} investments and ${scenarioCount} scenarios. ${counts.ALIGNED} contacts are fully aligned (matched both investments AND scenarios — strategically integrated). ${counts.INVESTED} are investment-linked only (financially tied but not scenario-mapped). ${counts.SCENED} are scenario-relevant only (appear in scenarios but have no investment link). ${counts.SHADOW} contacts are completely dark — no alignment with any investment or scenario.${shadowNames ? ` Shadow contacts include: ${shadowNames}.` : ''} Assess the strategic alignment depth, identify which shadow contacts represent the highest operational risk, and recommend priority actions to reduce blind spots in the contact-investment-scenario triad.`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const text = data?.response || data?.message || data?.content || JSON.stringify(data);
      setAssessment(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: text.slice(0, 400) } }));
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    }
    setAssessing(false);
  }, [rows, assessing, investmentCount, scenarioCount]);

  const counts = { ALIGNED: 0, INVESTED: 0, SCENED: 0, SHADOW: 0 };
  rows.forEach(r => { if (counts[r._cls] !== undefined) counts[r._cls]++; });

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return [r.name, r.role, r.org, r.id].some(f => (f || '').toLowerCase().includes(s));
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 76920, zIndex: 148,
          background: 'rgba(255,184,0,0.10)', border: '1px solid #FFB800',
          color: '#FFB800', fontSize: 9, padding: '3px 6px', cursor: 'pointer',
          borderRadius: 3, letterSpacing: 1, fontFamily: 'monospace',
        }}
      >
        ◈ CISALIGN
      </button>
    );
  }

  return (
    <>
      <style>{PULSE_CSS}</style>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 560, maxHeight: '82vh',
        background: 'rgba(5,15,25,0.97)', border: '1px solid #1a1200',
        borderRadius: 6, zIndex: 9149, display: 'flex', flexDirection: 'column',
        fontFamily: 'monospace', color: '#e2eaf0', overflow: 'hidden',
        boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{
          padding: '8px 14px', borderBottom: '1px solid #1a1200',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(255,184,0,0.04)',
        }}>
          <span style={{ fontSize: 11, color: '#FFB800', letterSpacing: 2 }}>
            ◈ CONTACT × INVESTMENT × SCENARIO — CISALIGN
          </span>
          <button onClick={() => setOpen(false)} style={{
            background: 'none', border: 'none', color: '#6A8BA0', cursor: 'pointer', fontSize: 14,
          }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', flexWrap: 'wrap' }}>
          {[
            { label: 'CONTACTS',   val: rows.length,          color: '#29E7FF' },
            { label: 'INVESTMENTS',val: investmentCount,      color: '#29E7FF' },
            { label: 'SCENARIOS',  val: scenarioCount,        color: '#29E7FF' },
            { label: 'ALIGNED',    val: counts.ALIGNED,       color: CLS_COLOR.ALIGNED },
            { label: 'INVESTED',   val: counts.INVESTED,      color: CLS_COLOR.INVESTED },
            { label: 'SCENED',     val: counts.SCENED,        color: CLS_COLOR.SCENED },
            { label: 'SHADOW',     val: counts.SHADOW,        color: CLS_COLOR.SHADOW, pulse: counts.SHADOW > 0 },
          ].map(t => (
            <div key={t.label} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${t.color}33`,
              borderRadius: 4, padding: '4px 10px', minWidth: 72, textAlign: 'center',
              animation: t.pulse ? 'cisalign-pulse 2s ease-in-out infinite' : 'none',
            }}>
              <div style={{ fontSize: 15, color: t.color, fontWeight: 700 }}>{t.val}</div>
              <div style={{ fontSize: 8, color: '#6A8BA0', letterSpacing: 1 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{ padding: '4px 14px', borderBottom: '1px solid #1a1200', display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? `${CLS_COLOR[t] || '#29E7FF'}22` : 'transparent',
              border: `1px solid ${tab === t ? (CLS_COLOR[t] || '#29E7FF') : '#2a4a5a'}`,
              color: tab === t ? (CLS_COLOR[t] || '#29E7FF') : '#6A8BA0',
              padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 9, letterSpacing: 1,
            }}>{t}{t !== 'ALL' ? ` (${counts[t] ?? 0})` : ''}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search contacts…"
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid #2a4a5a',
              color: '#e2eaf0', padding: '2px 8px', borderRadius: 3, fontSize: 9, width: 140,
            }}
          />
        </div>

        {/* Status */}
        {loading && <div style={{ padding: '4px 14px', fontSize: 9, color: '#6A8BA0' }}>⟳ loading…</div>}
        {error   && <div style={{ padding: '4px 14px', fontSize: 9, color: '#ef4444' }}>⚠ {error}</div>}

        {/* Rows */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {visible.map((c, i) => {
            const isExp = expanded === (c.id || i);
            return (
              <div key={c.id || i} style={{
                borderBottom: '1px solid #0e2233',
                background: isExp ? 'rgba(255,255,255,0.03)' : 'transparent',
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : (c.id || i))}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', cursor: 'pointer' }}
                >
                  <span style={{
                    fontSize: 8, padding: '1px 6px', borderRadius: 10,
                    background: `${CLS_COLOR[c._cls]}22`, color: CLS_COLOR[c._cls],
                    border: `1px solid ${CLS_COLOR[c._cls]}55`, letterSpacing: 1,
                    minWidth: 72, textAlign: 'center',
                  }}>{c._cls}</span>
                  {c.role && (
                    <span style={{
                      fontSize: 8, padding: '1px 5px', borderRadius: 3,
                      background: 'rgba(255,255,255,0.05)', color: '#A78BFA',
                      border: '1px solid #A78BFA44',
                    }}>{c.role.slice(0, 16)}</span>
                  )}
                  {c.org && (
                    <span style={{
                      fontSize: 8, padding: '1px 5px', borderRadius: 3,
                      background: 'rgba(255,255,255,0.04)', color: '#6A8BA0',
                      border: '1px solid #2a4a5a',
                    }}>{c.org.slice(0, 14)}</span>
                  )}
                  <span style={{ fontSize: 10, flex: 1, color: '#c8d8e8' }}>{c.name}</span>
                  <span style={{ fontSize: 8, color: '#2a5a7a' }}>
                    {c._investments.length}I {c._scenarios.length}S
                  </span>
                  <span style={{ fontSize: 9, color: '#2a5a7a' }}>{isExp ? '▲' : '▼'}</span>
                </div>
                {isExp && (
                  <div style={{ padding: '0 14px 8px 28px' }}>
                    {c._investments.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 8, color: '#29E7FF', letterSpacing: 1, marginBottom: 2 }}>MATCHED INVESTMENTS</div>
                        {c._investments.slice(0, 5).map((inv, ii) => (
                          <div key={ii} style={{ fontSize: 9, color: '#a0b8c8', padding: '1px 0' }}>
                            · {inv.title || inv.name || `Investment ${ii + 1}`}
                            {(inv.type || inv.category) && (
                              <span style={{ color: '#4a7a9a', marginLeft: 4, fontSize: 8 }}>
                                {[inv.type, inv.category].filter(Boolean).join(' · ').slice(0, 20)}
                              </span>
                            )}
                            {fmtValue(inv) && (
                              <span style={{ color: '#00E5A0', marginLeft: 4, fontSize: 8 }}>
                                {fmtValue(inv)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {c._scenarios.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 8, color: '#A78BFA', letterSpacing: 1, marginBottom: 2 }}>MATCHED SCENARIOS</div>
                        {c._scenarios.slice(0, 5).map((sc, si) => (
                          <div key={si} style={{ fontSize: 9, color: '#a0b8c8', padding: '1px 0' }}>
                            · {sc.title || sc.name || `Scenario ${si + 1}`}
                            {(sc.status || sc.state) && (
                              <span style={{ color: '#4a7a9a', marginLeft: 4, fontSize: 8 }}>
                                {(sc.status || sc.state).toUpperCase().slice(0, 12)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {c._investments.length === 0 && c._scenarios.length === 0 && (
                      <div style={{ color: '#FFB800', fontSize: 9 }}>⬡ No matched investments or scenarios — this contact has no strategic alignment.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!loading && visible.length === 0 && (
            <div style={{ padding: '12px 14px', color: '#6A8BA0', fontSize: 10 }}>No contacts match current filter.</div>
          )}
        </div>

        {/* Assess */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid #1a1200' }}>
          <button
            onClick={assess} disabled={assessing || rows.length === 0}
            style={{
              background: assessing ? 'rgba(255,184,0,0.08)' : 'rgba(255,184,0,0.13)',
              border: '1px solid #FFB800', color: '#FFB800',
              padding: '4px 14px', cursor: assessing ? 'default' : 'pointer',
              borderRadius: 3, fontSize: 10, letterSpacing: 1,
            }}
          >
            {assessing ? '▶ ASSESSING…' : '▶ ASSESS STRATEGIC ALIGNMENT'}
          </button>
          {assessment && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(255,184,0,0.06)', borderLeft: '2px solid #FFB800', color: '#e2eaf0', fontSize: 10, lineHeight: 1.6 }}>
              {assessment}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
