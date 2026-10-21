/**
 * SkillContactInvestmentReadiness — F91
 *
 * Fetches /v1/aip/skill + /entities/Contact + /entities/Investment.
 * Keyword-matches each skill against contacts AND investments to classify:
 *   READY     — skill matched both a contact who can execute AND a funding investment
 *   SUPPORTED — skill matched a contact only (people-backed, no funding link)
 *   FUNDED    — skill matched an investment only (money-backed, no contact owner)
 *   BLIND     — no contact or investment match (capability desert)
 *
 * Toggle: ◈ SCIRAM button (fixed, bottom strip) left:99320, zIndex:188
 * Stat tiles: skills / contacts / investments / ready / supported / funded / blind
 * Amber pulse on BLIND count (unanchored capabilities).
 * Expandable rows: matched contacts with role/org + matched investments with type/value.
 * Filter tabs: ALL / READY / SUPPORTED / FUNDED / BLIND + text search.
 * ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "sciram"/"skill contact investment"/"skill funding"/"blind skills"
 *        "skill readiness"/"skill support"/"capability readiness"/"funded skills"
 *        "supported skills"/"skill owner"/"unanchored skills"/"skill coverage"
 * Event: jarvis:sciram-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'READY', 'SUPPORTED', 'FUNDED', 'BLIND'];

const CLS_COLOR = {
  READY:     '#22C55E',
  SUPPORTED: '#38BDF8',
  FUNDED:    '#A78BFA',
  BLIND:     '#6B7280',
};

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  if (!bStr) return false;
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}

function normalizeArray(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw?.[k])) return raw[k];
  }
  return [];
}

export function isSciramQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'sciram', 'skill contact investment', 'skill funding', 'blind skills',
    'skill readiness', 'skill support', 'capability readiness', 'funded skills',
    'supported skills', 'skill owner', 'unanchored skills', 'skill coverage',
  ].some(k => s.includes(k));
}

export function buildSciramScript() {
  return (
    'Fetch /v1/aip/skill, /entities/Contact, and /entities/Investment. ' +
    'Keyword-match each skill (by name, description, category) against contact names/roles/organisations AND investment names/types/asset classes. ' +
    'Classify each skill as READY/SUPPORTED/FUNDED/BLIND. ' +
    'Report total BLIND count (skills with no contact owner and no investment backing — capability deserts), ' +
    'identify which BLIND skills carry the highest strategic risk, ' +
    'and recommend contact assignments or investment allocations to close the capability gap.'
  );
}

export default function SkillContactInvestmentReadiness() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState('');
  const [counts, setCounts]         = useState({
    skills: 0, contacts: 0, investments: 0,
    ready: 0, supported: 0, funded: 0, blind: 0,
  });
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [skRaw, conRaw, invRaw] = await Promise.all([
        fetch(`${API}/v1/aip/skill`,        { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/Contact`,    { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/entities/Investment`, { headers: hdrs }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const skills      = normalizeArray(skRaw,  ['items', 'skills', 'results', 'data']);
      const contacts    = normalizeArray(conRaw,  ['items', 'contacts', 'results', 'data', 'entities']);
      const investments = normalizeArray(invRaw,  ['items', 'investments', 'results', 'data', 'entities']);

      const built = skills.map((sk, idx) => {
        const skText = [sk.name, sk.title, sk.description, sk.category, sk.tags, sk.type]
          .filter(Boolean).join(' ');
        const skToks = tokens(skText);

        const matchedContacts = contacts.filter(con => {
          const s = [
            con.name, con.full_name, con.fullName, con.role, con.title,
            con.organisation, con.organization, con.org, con.description, con.bio,
          ].filter(Boolean).join(' ');
          return overlaps(skToks, s);
        });

        const matchedInvestments = investments.filter(inv => {
          const s = [
            inv.name, inv.title, inv.type, inv.asset_class, inv.assetClass,
            inv.description, inv.category, inv.instrument,
          ].filter(Boolean).join(' ');
          return overlaps(skToks, s);
        });

        const hasContact    = matchedContacts.length > 0;
        const hasInvestment = matchedInvestments.length > 0;
        let cls;
        if (hasContact && hasInvestment) cls = 'READY';
        else if (hasContact)             cls = 'SUPPORTED';
        else if (hasInvestment)          cls = 'FUNDED';
        else                             cls = 'BLIND';

        return {
          id:                 sk.id || sk._id || `sk-${idx}`,
          name:               sk.name || sk.title || `Skill ${idx + 1}`,
          category:           sk.category || sk.type || '',
          score:              sk.score ?? sk.level ?? sk.rating ?? null,
          cls,
          matchedContacts,
          matchedInvestments,
        };
      });

      const ready     = built.filter(r => r.cls === 'READY').length;
      const supported = built.filter(r => r.cls === 'SUPPORTED').length;
      const funded    = built.filter(r => r.cls === 'FUNDED').length;
      const blind     = built.filter(r => r.cls === 'BLIND').length;

      setRows(built);
      setCounts({ skills: built.length, contacts: contacts.length, investments: investments.length, ready, supported, funded, blind });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:sciram-toggle', handler);
    return () => window.removeEventListener('jarvis:sciram-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    fetchData();
    timerRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment('');
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: buildSciramScript() }),
      });
      const data = await res.json();
      const txt  = data?.response || data?.message || data?.content || JSON.stringify(data);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt.slice(0, 300) } }));
    } catch (e) {
      setAssessment(`Error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, []);

  const pulse = counts.blind > 0
    ? { animation: 'jpulse 1.4s ease-in-out infinite', color: '#F59E0B' }
    : {};

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.name.toLowerCase().includes(s)
        || r.category.toLowerCase().includes(s)
        || r.cls.toLowerCase().includes(s);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: 99320, zIndex: 188,
          background: 'rgba(0,0,0,0.7)', border: '1px solid #F59E0B',
          color: '#F59E0B', padding: '3px 8px', fontSize: 11, cursor: 'pointer',
          borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
        }}
      >
        ◈ SCIRAM{counts.blind > 0 ? <span style={pulse}> {counts.blind}</span> : null}
      </button>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 680, maxHeight: '80vh',
        background: 'rgba(5,10,20,0.97)', border: '1px solid #F59E0B',
        borderRadius: 8, zIndex: 9500, overflowY: 'auto', fontFamily: 'monospace',
        boxShadow: '0 0 32px rgba(245,158,11,0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid rgba(245,158,11,0.3)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: '#F59E0B', fontSize: 13, fontWeight: 'bold' }}>
            ◈ SCIRAM — Skill × Contact × Investment Readiness
          </span>
          <button
            onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 }}
          >✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexWrap: 'wrap' }}>
          {[
            { label: 'SKILLS',      val: counts.skills },
            { label: 'CONTACTS',    val: counts.contacts },
            { label: 'INVESTMENTS', val: counts.investments },
            { label: 'READY',       val: counts.ready,     color: '#22C55E' },
            { label: 'SUPPORTED',   val: counts.supported, color: '#38BDF8' },
            { label: 'FUNDED',      val: counts.funded,    color: '#A78BFA' },
            { label: 'BLIND',       val: counts.blind,     color: '#F59E0B', doPulse: counts.blind > 0 },
          ].map(t => (
            <div key={t.label} style={{
              background: 'rgba(255,255,255,0.05)', borderRadius: 6,
              padding: '6px 12px', textAlign: 'center', minWidth: 72,
            }}>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: t.color || '#ccc', ...(t.doPulse ? pulse : {}) }}>
                {t.val}
              </div>
              <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '0 14px 8px', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${tab === t ? '#F59E0B' : '#333'}`,
              color: tab === t ? '#F59E0B' : '#aaa', padding: '3px 10px',
              borderRadius: 4, cursor: 'pointer', fontSize: 11,
            }}>{t}</button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search…"
            style={{
              flex: 1, minWidth: 120, background: 'rgba(255,255,255,0.05)',
              border: '1px solid #333', color: '#ccc', padding: '3px 8px',
              borderRadius: 4, fontSize: 11, marginLeft: 4,
            }}
          />
        </div>

        {/* Assess */}
        <div style={{ padding: '0 14px 10px' }}>
          <button onClick={assess} disabled={assessing} style={{
            background: 'rgba(245,158,11,0.2)', border: '1px solid #F59E0B',
            color: '#F59E0B', padding: '4px 14px', borderRadius: 4,
            cursor: assessing ? 'wait' : 'pointer', fontSize: 11,
          }}>
            {assessing ? '…assessing' : '▶ ASSESS'}
          </button>
          {assessment && (
            <div style={{
              marginTop: 8, color: '#ccc', fontSize: 11,
              lineHeight: 1.5, maxHeight: 80, overflowY: 'auto',
            }}>
              {assessment}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: '0 14px 8px', color: '#F87171', fontSize: 11 }}>
            Error: {error}
          </div>
        )}

        {/* Rows */}
        <div style={{ padding: '0 14px 14px' }}>
          {loading && !rows.length && (
            <div style={{ color: '#888', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>Loading…</div>
          )}
          {visible.map(row => (
            <div key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 4 }}>
              <div
                onClick={() => setExpanded(ex => ({ ...ex, [row.id]: !ex[row.id] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer' }}
              >
                <span style={{ color: CLS_COLOR[row.cls], fontSize: 10, fontWeight: 'bold', minWidth: 76 }}>
                  {row.cls}
                </span>
                <span style={{ color: '#eee', fontSize: 12, flex: 1 }}>{row.name}</span>
                {row.category && (
                  <span style={{ color: '#888', fontSize: 10 }}>{row.category}</span>
                )}
                {row.score != null && (
                  <span style={{ color: '#A78BFA', fontSize: 10, marginLeft: 4 }}>score:{row.score}</span>
                )}
                <span style={{ color: '#555', fontSize: 10 }}>{expanded[row.id] ? '▲' : '▼'}</span>
              </div>

              {expanded[row.id] && (
                <div style={{ paddingLeft: 12, paddingBottom: 8 }}>
                  {/* Matched contacts */}
                  {row.matchedContacts.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: '#38BDF8', fontSize: 10, marginBottom: 4 }}>
                        Contacts ({row.matchedContacts.length})
                      </div>
                      {row.matchedContacts.slice(0, 5).map((c, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                          <span style={{ color: '#ccc', fontSize: 11 }}>
                            {c.name || c.full_name || c.fullName || '—'}
                          </span>
                          {(c.role || c.title) && (
                            <span style={{
                              background: 'rgba(56,189,248,0.15)', color: '#38BDF8',
                              fontSize: 9, padding: '1px 5px', borderRadius: 3,
                            }}>
                              {c.role || c.title}
                            </span>
                          )}
                          {(c.organisation || c.organization || c.org) && (
                            <span style={{ color: '#888', fontSize: 9 }}>
                              {c.organisation || c.organization || c.org}
                            </span>
                          )}
                        </div>
                      ))}
                      {row.matchedContacts.length > 5 && (
                        <div style={{ color: '#555', fontSize: 10 }}>
                          +{row.matchedContacts.length - 5} more
                        </div>
                      )}
                    </div>
                  )}

                  {/* Matched investments */}
                  {row.matchedInvestments.length > 0 && (
                    <div>
                      <div style={{ color: '#A78BFA', fontSize: 10, marginBottom: 4 }}>
                        Investments ({row.matchedInvestments.length})
                      </div>
                      {row.matchedInvestments.slice(0, 5).map((inv, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                          <span style={{ color: '#ccc', fontSize: 11 }}>
                            {inv.name || inv.title || '—'}
                          </span>
                          {(inv.type || inv.asset_class || inv.assetClass) && (
                            <span style={{
                              background: 'rgba(167,139,250,0.15)', color: '#A78BFA',
                              fontSize: 9, padding: '1px 5px', borderRadius: 3,
                            }}>
                              {inv.type || inv.asset_class || inv.assetClass}
                            </span>
                          )}
                          {inv.value != null && (
                            <span style={{ color: '#888', fontSize: 9 }}>
                              {typeof inv.value === 'number' ? inv.value.toLocaleString() : inv.value}
                            </span>
                          )}
                        </div>
                      ))}
                      {row.matchedInvestments.length > 5 && (
                        <div style={{ color: '#555', fontSize: 10 }}>
                          +{row.matchedInvestments.length - 5} more
                        </div>
                      )}
                    </div>
                  )}

                  {row.matchedContacts.length === 0 && row.matchedInvestments.length === 0 && (
                    <div style={{ color: '#555', fontSize: 11 }}>No matching contacts or investments found.</div>
                  )}
                </div>
              )}
            </div>
          ))}
          {!loading && visible.length === 0 && (
            <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
              No skills match this filter.
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes jpulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.5}}`}</style>
    </>
  );
}
