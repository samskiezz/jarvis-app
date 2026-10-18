/**
 * KnowledgeIntelInvestigationTriad — F32
 *
 * Fetches /knowledge/ + /entities/IntelProfile + /v1/investigations
 * Keyword-matches each knowledge article against intel profiles and investigations
 * to classify articles as:
 *   COMPLETE   — matched to both a profile AND an investigation
 *   PROFILED   — matched to an IntelProfile only
 *   FILED      — matched to an investigation only
 *   UNANCHORED — no match to either
 *
 * Toggle: ◈ KIITRIAD button (left:66840, bottom:8, zIndex:128)
 * Stat tiles: knowledge / complete / profiled / filed / unanchored
 * Amber pulse on unanchored count.
 * Expandable rows: matched profiles + matched investigations.
 * Filter tabs: ALL / COMPLETE / PROFILED / FILED / UNANCHORED + text search.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "knowledge triangle"/"knowledge traceability"/"intel knowledge"/"kiitriad"/"knowledge profile"
 * Event: jarvis:kiitriad-toggle
 * Auto-refresh: 90 s
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const API     = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const TABS = ['ALL', 'COMPLETE', 'PROFILED', 'FILED', 'UNANCHORED'];

const CLS_COLOR = {
  COMPLETE:   '#22c55e',
  PROFILED:   '#29E7FF',
  FILED:      '#9F7AEA',
  UNANCHORED: '#FFB830',
};

const PULSE_CSS = `@keyframes kiitriad-pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`;

function tokens(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}
function overlaps(aToks, bStr) {
  const setB = new Set(tokens(bStr));
  return aToks.some(t => setB.has(t));
}
function classifyArticle(artToks, profiles, investigations) {
  const matchedProfiles = profiles.filter(p =>
    overlaps(artToks, [p.name, p.alias, p.description, p.domain, p.tags].join(' '))
  );
  const matchedInvestigations = investigations.filter(inv =>
    overlaps(artToks, [inv.title, inv.description, inv.summary, inv.category].join(' '))
  );
  if (matchedProfiles.length > 0 && matchedInvestigations.length > 0)
    return { cls: 'COMPLETE', matchedProfiles, matchedInvestigations };
  if (matchedProfiles.length > 0)
    return { cls: 'PROFILED', matchedProfiles, matchedInvestigations: [] };
  if (matchedInvestigations.length > 0)
    return { cls: 'FILED', matchedProfiles: [], matchedInvestigations };
  return { cls: 'UNANCHORED', matchedProfiles: [], matchedInvestigations: [] };
}

export function isKiitriадQuery(q) {
  return /\b(knowledge triangle|knowledge traceability|intel knowledge|kiitriad|knowledge profile|knowledge investigation|intel article)\b/i.test(q);
}
export function buildKiitriаdScript() {
  return 'Opening Knowledge Intel Investigation Triad. Cross-referencing knowledge articles against intel profiles and open investigations to surface unanchored knowledge with no traceability.';
}

export default function KnowledgeIntelInvestigationTriad() {
  const [open, setOpen]               = useState(false);
  const [rows, setRows]               = useState([]);
  const [profileCount, setProfileCount] = useState(0);
  const [invCount, setInvCount]       = useState(0);
  const [tab, setTab]                 = useState('ALL');
  const [search, setSearch]           = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [expanded, setExpanded]       = useState(null);
  const [assessing, setAssessing]     = useState(false);
  const [assessment, setAssessment]   = useState('');
  const intervalRef                   = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [knowRes, profRes, invRes] = await Promise.all([
        fetch(`${API}/knowledge/`,               { headers: hdr }),
        fetch(`${API}/entities/IntelProfile`,    { headers: hdr }),
        fetch(`${API}/v1/investigations`,        { headers: hdr }),
      ]);

      const knowRaw = await knowRes.json().catch(() => []);
      const profRaw = await profRes.json().catch(() => []);
      const invRaw  = await invRes.json().catch(() => []);

      const knowledge     = Array.isArray(knowRaw) ? knowRaw : (knowRaw.articles || knowRaw.items || []);
      const profiles      = Array.isArray(profRaw) ? profRaw : (profRaw.intel_profiles || profRaw.items || []);
      const investigations = Array.isArray(invRaw)  ? invRaw  : (invRaw.investigations  || invRaw.items  || []);

      setProfileCount(profiles.length);
      setInvCount(investigations.length);

      const classified = knowledge.map((art, idx) => {
        const label  = [art.title, art.topic, art.tags, art.summary].join(' ');
        const artToks = tokens(label);
        const { cls, matchedProfiles, matchedInvestigations } = classifyArticle(artToks, profiles, investigations);
        return { ...art, _cls: cls, _profiles: matchedProfiles, _investigations: matchedInvestigations, _label: label, _idx: idx };
      });

      setRows(classified);
    } catch (e) {
      setError(e.message || 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    intervalRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(intervalRef.current);
  }, [open, fetchData]);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:kiitriad-toggle', handler);
    return () => window.removeEventListener('jarvis:kiitriad-toggle', handler);
  }, []);

  const counts = {
    COMPLETE:   rows.filter(r => r._cls === 'COMPLETE').length,
    PROFILED:   rows.filter(r => r._cls === 'PROFILED').length,
    FILED:      rows.filter(r => r._cls === 'FILED').length,
    UNANCHORED: rows.filter(r => r._cls === 'UNANCHORED').length,
  };

  const visible = rows.filter(r => {
    if (tab !== 'ALL' && r._cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r._label.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const total     = rows.length;
    const complete  = counts.COMPLETE;
    const profiled  = counts.PROFILED;
    const filed     = counts.FILED;
    const unanchored = counts.UNANCHORED;
    const prompt = `JARVIS knowledge traceability assessment: ${total} knowledge articles total. ${complete} fully traced (linked to both intel profiles and investigations), ${profiled} profiled only, ${filed} filed only, ${unanchored} unanchored with no traceability. Provide a 2-sentence operational briefing on knowledge coverage and the highest-priority action.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json().catch(() => ({}));
      const text = d.response || d.message || d.reply || d.content || 'Assessment complete.';
      setAssessment(text);
      if (window.speechSynthesis) {
        const utt = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(utt);
      }
    } catch { setAssessment('Assessment unavailable.'); }
    finally { setAssessing(false); }
  };

  const panel = open ? (
    <div style={{
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%,-50%)',
      width: 700, maxHeight: '85vh',
      background: 'rgba(6,18,32,0.98)',
      border: '1px solid #1A4A6A',
      borderRadius: 10, zIndex: 9200,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', color: '#C8E6FA',
      boxShadow: '0 0 40px rgba(0,200,255,0.12)',
      overflow: 'hidden',
    }}>
      <style>{PULSE_CSS}</style>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid #1A4A6A',
        background: 'rgba(0,40,70,0.7)', flexShrink: 0,
      }}>
        <span style={{ color: '#29E7FF', fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
          ◈ KNOWLEDGE INTEL INVESTIGATION TRIAD
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchData} disabled={loading}
            style={{ background: 'none', border: '1px solid #29E7FF', color: '#29E7FF',
              fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}>
            ▶ REFRESH
          </button>
          <button onClick={assess} disabled={assessing}
            style={{ background: 'none', border: '1px solid #00E5A0', color: '#00E5A0',
              fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}>
            {assessing ? '...' : '▶ ASSESS'}
          </button>
          <button onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: '#8AA', fontSize: 16, cursor: 'pointer' }}>
            ✕
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexShrink: 0 }}>
        {[
          { label: 'KNOWLEDGE',   val: rows.length,       color: '#29E7FF' },
          { label: 'COMPLETE',    val: counts.COMPLETE,    color: '#22c55e' },
          { label: 'PROFILED',    val: counts.PROFILED,    color: '#29E7FF' },
          { label: 'FILED',       val: counts.FILED,       color: '#9F7AEA' },
          { label: 'UNANCHORED',  val: counts.UNANCHORED,  color: '#FFB830',
            pulse: counts.UNANCHORED > 0 },
          { label: 'PROFILES',    val: profileCount,       color: '#60A5FA' },
          { label: 'OPEN CASES',  val: invCount,           color: '#F59E0B' },
        ].map(t => (
          <div key={t.label} style={{
            flex: 1, background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${t.color}33`,
            borderRadius: 6, padding: '6px 4px', textAlign: 'center',
            animation: t.pulse ? 'kiitriad-pulse 1.5s infinite' : 'none',
          }}>
            <div style={{ color: t.color, fontSize: 16, fontWeight: 700 }}>{t.val}</div>
            <div style={{ color: '#6A8BA0', fontSize: 9, letterSpacing: 1 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              background: tab === t ? '#29E7FF22' : 'none',
              border: `1px solid ${tab === t ? '#29E7FF' : '#1A4A6A'}`,
              color: tab === t ? '#29E7FF' : '#6A8BA0',
              fontSize: 10, padding: '3px 10px', borderRadius: 12, cursor: 'pointer',
            }}>
            {t}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search knowledge…"
          style={{
            marginLeft: 'auto', background: 'rgba(255,255,255,0.04)',
            border: '1px solid #1A4A6A', color: '#C8E6FA',
            fontSize: 10, padding: '3px 8px', borderRadius: 4,
          }}
        />
      </div>

      {/* Rows */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '0 14px 10px' }}>
        {loading && <div style={{ color: '#6A8BA0', fontSize: 11, padding: 10 }}>Loading…</div>}
        {error   && <div style={{ color: '#ef4444', fontSize: 11, padding: 10 }}>{error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: '#6A8BA0', fontSize: 11, padding: 10 }}>No articles match.</div>
        )}
        {visible.map((art) => {
          const id   = art.id || art.article_id || art.title || art._idx;
          const title = art.title || `Article #${art._idx + 1}`;
          const topic = art.topic || art.type || '';
          const isExp = expanded === id;
          const cls   = art._cls;
          const cc    = CLS_COLOR[cls];
          return (
            <div key={id} style={{
              borderBottom: '1px solid #0D2A3E', paddingBottom: 6, marginBottom: 4,
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: 'pointer', padding: '4px 0',
                }}
              >
                <span style={{
                  background: `${cc}22`, border: `1px solid ${cc}88`,
                  color: cc, fontSize: 9, padding: '1px 6px', borderRadius: 10,
                  minWidth: 85, textAlign: 'center', letterSpacing: 1,
                }}>
                  {cls}
                </span>
                <span style={{ flex: 1, fontSize: 11, color: '#C8E6FA' }}>{title}</span>
                {topic && (
                  <span style={{ color: '#6A8BA0', fontSize: 9 }}>{topic}</span>
                )}
                <span style={{ color: '#4A6A7A', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '6px 8px', background: 'rgba(0,0,0,0.3)', borderRadius: 4, fontSize: 10 }}>
                  {art.summary && (
                    <div style={{ color: '#8AA', marginBottom: 6 }}>{art.summary}</div>
                  )}
                  {art._profiles.length > 0 && (
                    <div>
                      <div style={{ color: '#29E7FF', fontWeight: 700, marginBottom: 3 }}>
                        INTEL PROFILES ({art._profiles.length})
                      </div>
                      {art._profiles.map((p, pi) => (
                        <div key={pi} style={{
                          display: 'flex', gap: 6, padding: '2px 0',
                          borderBottom: '1px solid #0D2A3E',
                        }}>
                          <span style={{
                            background: '#29E7FF22', border: '1px solid #29E7FF88',
                            color: '#29E7FF', fontSize: 9, padding: '1px 4px', borderRadius: 8,
                          }}>{p.domain || p.type || 'profile'}</span>
                          <span style={{ color: '#C8E6FA' }}>{p.name || p.alias || `Profile ${pi + 1}`}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {art._investigations.length > 0 && (
                    <div style={{ marginTop: art._profiles.length > 0 ? 6 : 0 }}>
                      <div style={{ color: '#9F7AEA', fontWeight: 700, marginBottom: 3 }}>
                        INVESTIGATIONS ({art._investigations.length})
                      </div>
                      {art._investigations.map((inv, ii) => (
                        <div key={ii} style={{
                          display: 'flex', gap: 6, padding: '2px 0',
                          borderBottom: '1px solid #0D2A3E',
                        }}>
                          <span style={{
                            background: '#9F7AEA22', border: '1px solid #9F7AEA88',
                            color: '#9F7AEA', fontSize: 9, padding: '1px 4px', borderRadius: 8,
                          }}>{inv.status || 'open'}</span>
                          <span style={{ color: '#C8E6FA' }}>{inv.title || `Case ${ii + 1}`}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {art._profiles.length === 0 && art._investigations.length === 0 && (
                    <div style={{ color: '#FFB830' }}>
                      No intel profiles or investigations matched. Article is UNANCHORED.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assessment */}
      {assessment && (
        <div style={{
          flexShrink: 0, padding: '8px 14px', borderTop: '1px solid #1A4A6A',
          background: 'rgba(0,40,70,0.7)', fontSize: 11, color: '#00E5A0',
          maxHeight: 80, overflowY: 'auto',
        }}>
          {assessment}
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <style>{PULSE_CSS}</style>
      <button
        onClick={() => setOpen(o => !o)}
        title="Knowledge Intel Investigation Triad"
        style={{
          position: 'fixed', left: 66840, bottom: 8, zIndex: 128,
          background: open ? 'rgba(41,231,255,0.18)' : 'rgba(6,18,32,0.85)',
          border: `1px solid ${open ? '#29E7FF' : '#1A4A6A'}`,
          color: open ? '#29E7FF' : '#4A8A9A',
          fontSize: 9, padding: '3px 8px', borderRadius: 4,
          cursor: 'pointer', letterSpacing: 1, fontFamily: 'monospace',
          transition: 'all 0.2s',
        }}
      >
        ◈ KIITRIAD
      </button>
      {panel}
    </>
  );
}
