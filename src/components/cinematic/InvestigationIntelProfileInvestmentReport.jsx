/**
 * InvestigationIntelProfileInvestmentReport — F260
 *
 * Fetches /v1/investigations
 *         /entities/IntelProfile
 *         /entities/Investment
 *         /v1/reports
 *
 * Keyword-matches each investigation against intel profiles, investments,
 * and reports to classify:
 *
 *   ANCHORED  — matches all 3 other sources
 *   PROFILED  — matches 2 of 3 other sources
 *   TRACKED   — matches exactly 1 other source
 *   ADRIFT    — no match to any source
 *               (orphaned investigations with no intel profile, no investment
 *                tracking, no report — intelligence dead-ends)
 *
 * Toggle: ◈ INVIAM button (fixed, bottom strip) left:193400, zIndex:356
 * Stat tiles: investigations / intel profiles / investments / reports /
 *             anchored / profiled / tracked / adrift
 * Red pulse on ADRIFT count (intelligence orphans).
 * Expandable rows: matched intel profiles with type badge +
 *                  matched investments with amount/status badge +
 *                  matched reports with date badge.
 * Filter tabs: ALL / ANCHORED / PROFILED / TRACKED / ADRIFT + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "inviam"/"investigation intel"/"intelligence asset map"/
 *        "adrift investigations"/"investigation investment"/
 *        "investigation report"/"intel profile map"/"investigation ownership"
 * Event: jarvis:inviam-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from "@/api/cinematicDataAdapters";

// API base resolved via apiBase()
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'ANCHORED', 'PROFILED', 'TRACKED', 'ADRIFT'];

const CLS_COLOR = {
  ANCHORED: '#22C55E',
  PROFILED: '#F59E0B',
  TRACKED:  '#38BDF8',
  ADRIFT:   '#EF4444',
};

export function isInviamQuery(q) {
  const s = (q || '').toLowerCase();
  return s.includes('inviam') ||
    s.includes('investigation intel') ||
    s.includes('intelligence asset map') ||
    s.includes('adrift investigation') ||
    s.includes('investigation investment') ||
    s.includes('investigation report') ||
    s.includes('intel profile map') ||
    s.includes('investigation ownership');
}

export function buildInviamScript() {
  return 'Analyse the Investigation × IntelProfile × Investment × Report Intelligence Asset Ownership Map. ' +
    'Identify ADRIFT investigations (no intel profile, no investment tracking, no report — intelligence orphans). ' +
    'Recommend the top 3 most critical orphaned investigations to anchor. ' +
    'Keep the response under 120 words.';
}

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeInvestigations(raw) {
  if (Array.isArray(raw))                    return raw;
  if (Array.isArray(raw?.investigations))    return raw.investigations;
  if (Array.isArray(raw?.data))              return raw.data;
  if (Array.isArray(raw?.results))           return raw.results;
  return [];
}

function normalizeIntelProfiles(raw) {
  if (Array.isArray(raw))                    return raw;
  if (Array.isArray(raw?.intel_profiles))    return raw.intel_profiles;
  if (Array.isArray(raw?.profiles))          return raw.profiles;
  if (Array.isArray(raw?.data))              return raw.data;
  if (Array.isArray(raw?.results))           return raw.results;
  return [];
}

function normalizeInvestments(raw) {
  if (Array.isArray(raw))                    return raw;
  if (Array.isArray(raw?.investments))       return raw.investments;
  if (Array.isArray(raw?.data))              return raw.data;
  if (Array.isArray(raw?.results))           return raw.results;
  return [];
}

function normalizeReports(raw) {
  if (Array.isArray(raw))                    return raw;
  if (Array.isArray(raw?.reports))           return raw.reports;
  if (Array.isArray(raw?.data))              return raw.data;
  if (Array.isArray(raw?.results))           return raw.results;
  return [];
}

function invText(inv) {
  return [inv.name, inv.title, inv.description, inv.subject, inv.type,
          inv.category, inv.tags, inv.status].filter(Boolean).join(' ');
}

function classifyInvestigation(invToks, intelProfiles, investments, reports) {
  const matchedProfiles = intelProfiles.filter(p => {
    const t = [p.name, p.title, p.description, p.type, p.category,
               p.subject, p.entity, p.tags].filter(Boolean).join(' ');
    return overlaps(invToks, t);
  });
  const matchedInvestments = investments.filter(inv => {
    const t = [inv.name, inv.title, inv.description, inv.type, inv.category,
               inv.instrument, inv.sector, inv.tags].filter(Boolean).join(' ');
    return overlaps(invToks, t);
  });
  const matchedReports = reports.filter(r => {
    const t = [r.name, r.title, r.description, r.type, r.category,
               r.subject, r.author, r.tags].filter(Boolean).join(' ');
    return overlaps(invToks, t);
  });
  const hits = (matchedProfiles.length > 0 ? 1 : 0)
             + (matchedInvestments.length > 0 ? 1 : 0)
             + (matchedReports.length > 0 ? 1 : 0);
  const cls = hits === 3 ? 'ANCHORED'
            : hits === 2 ? 'PROFILED'
            : hits === 1 ? 'TRACKED'
            : 'ADRIFT';
  return { cls, matchedProfiles, matchedInvestments, matchedReports };
}

const hdr = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

async function apiFetch(path) {
  const r = await fetch(`${API}${path}`, { headers: hdr });
  if (!r.ok) return null;
  return r.json();
}

export default function InvestigationIntelProfileInvestmentReport() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const [advice, setAdvice]       = useState('');
  const timerRef                  = useRef(null);

  const counts = {
    ANCHORED: rows.filter(r => r.cls === 'ANCHORED').length,
    PROFILED: rows.filter(r => r.cls === 'PROFILED').length,
    TRACKED:  rows.filter(r => r.cls === 'TRACKED').length,
    ADRIFT:   rows.filter(r => r.cls === 'ADRIFT').length,
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invRaw, prRaw, inRaw, rpRaw] = await Promise.all([
        apiFetch('/v1/investigations'),
        apiFetch('/entities/IntelProfile'),
        apiFetch('/entities/Investment'),
        apiFetch('/v1/reports'),
      ]);
      const investigations = normalizeInvestigations(invRaw);
      const intelProfiles  = normalizeIntelProfiles(prRaw);
      const investments    = normalizeInvestments(inRaw);
      const reports        = normalizeReports(rpRaw);

      const classified = investigations.map(inv => {
        const invToks = tokens(invText(inv));
        const { cls, matchedProfiles, matchedInvestments, matchedReports } =
          classifyInvestigation(invToks, intelProfiles, investments, reports);
        return { inv, cls, matchedProfiles, matchedInvestments, matchedReports };
      });
      setRows(classified);
    } catch { /* network offline — keep stale data */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:inviam-toggle', toggle);
    return () => window.removeEventListener('jarvis:inviam-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    setAdvice('');
    try {
      const prompt = buildInviamScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.text || JSON.stringify(d);
      setAdvice(text);
      try {
        await fetch(`${apiBase()}/v1/voice/tts`, {
          method: 'POST', headers: hdr,
          body: JSON.stringify({ text: text.slice(0, 300) }),
        });
      } catch { /* TTS optional */ }
    } catch { setAdvice('Assessment unavailable — check backend connectivity.'); }
    setAssessing(false);
  }

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      const t = (r.inv.name || r.inv.title || '').toLowerCase();
      if (!t.includes(s)) return false;
    }
    return true;
  });

  const adriftCount = counts.ADRIFT;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investigation × IntelProfile × Investment × Report Intelligence Asset Ownership Map"
        style={{
          position: 'fixed', left: 193400, bottom: 8, zIndex: 356,
          background: 'rgba(5,8,13,0.82)', border: '1px solid #22D3EE44',
          color: '#22D3EE', borderRadius: 6, padding: '3px 8px',
          fontSize: 11, fontFamily: "'JetBrains Mono',monospace",
          cursor: 'pointer', letterSpacing: 1,
          boxShadow: adriftCount > 0 ? '0 0 8px #EF444466' : 'none',
        }}
      >
        ◈ INVIAM
        {adriftCount > 0 && (
          <span style={{
            marginLeft: 5, background: '#EF4444', color: '#fff',
            borderRadius: 4, padding: '1px 5px', fontSize: 10,
            animation: 'inviam-pulse 1.4s ease-in-out infinite',
          }}>{adriftCount}</span>
        )}
        <style>{`@keyframes inviam-pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1060,
      background: 'rgba(2,5,10,0.93)', backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'JetBrains Mono',monospace", color: '#DCEBF5',
      padding: '18px 20px', overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <span style={{ color: '#22D3EE', fontSize: 15, fontWeight: 700, letterSpacing: 2 }}>
          ◈ INVIAM — INVESTIGATION × INTEL PROFILE × INVESTMENT × REPORT ASSET OWNERSHIP MAP
        </span>
        <button onClick={() => setOpen(false)} style={{
          marginLeft: 'auto', background: 'none', border: '1px solid #22D3EE44',
          color: '#22D3EE', borderRadius: 4, padding: '2px 10px',
          cursor: 'pointer', fontSize: 12,
        }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {[
          { label: 'INVESTIGATIONS', val: rows.length,                                             color: '#22D3EE' },
          { label: 'INTEL PROFILES', val: rows.reduce((a, r) => a + r.matchedProfiles.length, 0),   color: '#A78BFA' },
          { label: 'INVESTMENTS',    val: rows.reduce((a, r) => a + r.matchedInvestments.length, 0), color: '#F59E0B' },
          { label: 'REPORTS',        val: rows.reduce((a, r) => a + r.matchedReports.length, 0),     color: '#38BDF8' },
          { label: 'ANCHORED',       val: counts.ANCHORED, color: CLS_COLOR.ANCHORED },
          { label: 'PROFILED',       val: counts.PROFILED, color: CLS_COLOR.PROFILED },
          { label: 'TRACKED',        val: counts.TRACKED,  color: CLS_COLOR.TRACKED  },
          { label: 'ADRIFT',         val: counts.ADRIFT,   color: CLS_COLOR.ADRIFT   },
        ].map(({ label, val, color }) => (
          <div key={label} style={{
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}44`,
            borderRadius: 6, padding: '6px 12px', minWidth: 90, textAlign: 'center',
          }}>
            <div style={{ color, fontSize: 18, fontWeight: 700 }}>{val}</div>
            <div style={{ color: '#8899AA', fontSize: 10, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Loading indicator */}
      {loading && (
        <div style={{ color: '#22D3EE88', fontSize: 11, marginBottom: 8 }}>
          ⟳ Loading investigation data…
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#22D3EE22' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${tab === t ? '#22D3EE' : '#22D3EE22'}`,
            color: tab === t ? '#22D3EE' : '#8899AA',
            borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer',
          }}>{t} {t !== 'ALL' ? `(${counts[t] ?? 0})` : `(${rows.length})`}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search investigations…"
          style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid #22D3EE22',
            color: '#DCEBF5', borderRadius: 4, padding: '3px 10px', fontSize: 11,
            outline: 'none', minWidth: 180,
          }}
        />
      </div>

      {/* ASSESS button */}
      <div style={{ marginBottom: 12 }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? '#22D3EE22' : '#22D3EE33',
          border: '1px solid #22D3EE66', color: '#22D3EE',
          borderRadius: 4, padding: '4px 14px', fontSize: 11,
          cursor: assessing ? 'not-allowed' : 'pointer',
        }}>
          {assessing ? '⟳ Assessing…' : '▶ ASSESS'}
        </button>
        {advice && (
          <div style={{
            marginTop: 8, background: 'rgba(34,211,238,0.06)',
            border: '1px solid #22D3EE33', borderRadius: 6,
            padding: '8px 12px', fontSize: 12, color: '#AACCDD',
            maxWidth: 700, lineHeight: 1.5,
          }}>{advice}</div>
        )}
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#8899AA', fontSize: 12, padding: '12px 0' }}>
            No investigations match the current filter.
          </div>
        )}
        {visible.map((row, i) => {
          const id = row.inv.id || row.inv.name || i;
          const isExp = !!expanded[id];
          return (
            <div key={id} style={{
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${CLS_COLOR[row.cls]}22`,
              borderRadius: 6, marginBottom: 6, overflow: 'hidden',
            }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [id]: !e[id] }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 12px', cursor: 'pointer',
                }}
              >
                <span style={{
                  color: CLS_COLOR[row.cls], fontSize: 10, fontWeight: 700,
                  background: `${CLS_COLOR[row.cls]}22`,
                  borderRadius: 3, padding: '1px 6px', minWidth: 72, textAlign: 'center',
                }}>{row.cls}</span>
                <span style={{ color: '#DCEBF5', fontSize: 12, flex: 1 }}>
                  {row.inv.name || row.inv.title || `investigation-${id}`}
                </span>
                {row.inv.status && (
                  <span style={{
                    color: '#8899AA', fontSize: 10,
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 3, padding: '1px 6px',
                  }}>{row.inv.status}</span>
                )}
                <span style={{ color: '#22D3EE', fontSize: 11 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 12px 10px', borderTop: '1px solid #22D3EE11' }}>
                  {/* Matched intel profiles */}
                  {row.matchedProfiles.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ color: '#A78BFA', fontSize: 10, marginBottom: 4 }}>
                        INTEL PROFILES ({row.matchedProfiles.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedProfiles.slice(0, 5).map((p, pi) => (
                          <span key={pi} style={{
                            background: '#A78BFA22', border: '1px solid #A78BFA44',
                            color: '#A78BFA', borderRadius: 3, padding: '2px 7px', fontSize: 10,
                          }}>
                            {p.name || p.title || `profile-${pi}`}
                            {(p.type || p.category) && (
                              <span style={{
                                marginLeft: 5, background: '#A78BFA22',
                                color: '#C4B5FD', borderRadius: 3, padding: '0 4px', fontSize: 9,
                              }}>{p.type || p.category}</span>
                            )}
                          </span>
                        ))}
                        {row.matchedProfiles.length > 5 && (
                          <span style={{ color: '#475569', fontSize: 10 }}>
                            +{row.matchedProfiles.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Matched investments */}
                  {row.matchedInvestments.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ color: '#F59E0B', fontSize: 10, marginBottom: 4 }}>
                        INVESTMENTS ({row.matchedInvestments.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedInvestments.slice(0, 5).map((inv, ii) => (
                          <span key={ii} style={{
                            background: '#F59E0B22', border: '1px solid #F59E0B44',
                            color: '#F59E0B', borderRadius: 3, padding: '2px 7px', fontSize: 10,
                          }}>
                            {inv.name || inv.title || `investment-${ii}`}
                            {(inv.amount != null || inv.status) && (
                              <span style={{
                                marginLeft: 5, background: '#F59E0B22',
                                color: '#FCD34D', borderRadius: 3, padding: '0 4px', fontSize: 9,
                              }}>
                                {[inv.status, inv.amount != null ? `$${Number(inv.amount).toLocaleString()}` : null]
                                  .filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </span>
                        ))}
                        {row.matchedInvestments.length > 5 && (
                          <span style={{ color: '#475569', fontSize: 10 }}>
                            +{row.matchedInvestments.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Matched reports */}
                  {row.matchedReports.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ color: '#38BDF8', fontSize: 10, marginBottom: 4 }}>
                        REPORTS ({row.matchedReports.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.matchedReports.slice(0, 5).map((r, ri) => (
                          <span key={ri} style={{
                            background: '#38BDF822', border: '1px solid #38BDF844',
                            color: '#38BDF8', borderRadius: 3, padding: '2px 7px', fontSize: 10,
                          }}>
                            {r.name || r.title || `report-${ri}`}
                            {(r.date || r.created_at) && (
                              <span style={{
                                marginLeft: 5, background: '#38BDF822',
                                color: '#7DD3FC', borderRadius: 3, padding: '0 4px', fontSize: 9,
                              }}>
                                {(r.date || r.created_at || '').slice(0, 10)}
                              </span>
                            )}
                          </span>
                        ))}
                        {row.matchedReports.length > 5 && (
                          <span style={{ color: '#475569', fontSize: 10 }}>
                            +{row.matchedReports.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {row.matchedProfiles.length === 0 && row.matchedInvestments.length === 0 && row.matchedReports.length === 0 && (
                    <div style={{ color: '#8899AA', fontSize: 11, marginTop: 8 }}>
                      No intel profiles, investments, or reports matched this investigation.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
