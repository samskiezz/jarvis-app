/**
 * F266 — Investigation × Knowledge × AIP Skill Triple (IKAST)
 *
 * Answers: "Which open investigations have both KB documentation AND a JARVIS
 * AIP skill able to handle them — and which are completely unsupported (no KB
 * article, no automation skill)?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /v1/investigations   → open investigation cases
 *   GET /knowledge/          → knowledge-base articles
 *   GET /v1/aip/skill        → JARVIS AIP skill catalog
 *
 * Each investigation is correlated against:
 *   1. KB articles (by title/content/topic/summary/tags token match) → KB_BACKED?
 *   2. AIP skills  (by name/description/category/tags token match)   → SKILLED?
 *
 * Classification:
 *   FULL_COVERAGE  — investigation has BOTH kb backing AND an AIP skill
 *   KB_ONLY        — has kb backing but no skill
 *   SKILL_ONLY     — has a skill but no kb backing
 *   DARK           — neither (highest priority gap)
 *
 * Stat tiles:  investigations / KB articles / AIP skills / dark
 * Amber badge: dark count on button.
 * Expand row:  matched articles + matched skills with relevance bars.
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ IKAST  at left:5700 bottom:18, zIndex:68.
 * Event:   jarvis:ikast-toggle
 * Voice:   "investigation knowledge skill / ikast / dark investigations /
 *           unsupported cases / case knowledge skill / investigation skill gap /
 *           case skill gap / investigation kb / case coverage triple"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

const IKAST_RE =
  /\b(investigation[._-]?knowledge[._-]?skill|ikast|dark[._-]?investigation(?:s)?|unsupported[._-]?case(?:s)?|case[._-]?knowledge[._-]?skill|investigation[._-]?skill[._-]?gap|case[._-]?skill[._-]?gap|investigation[._-]?kb|case[._-]?coverage[._-]?triple|case[._-]?triple)\b/i;

export function isIkastQuery(t) {
  return IKAST_RE.test(t || '');
}

export async function buildIkastScript() {
  const [invR, kbR, skillR] = await Promise.allSettled([
    fetch(`${API}/v1/investigations`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/knowledge/`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
    fetch(`${API}/v1/aip/skill`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then(r => r.json()),
  ]);
  const invs = normInvs(invR.status === 'fulfilled' ? invR.value : []);
  const articles = normArticles(kbR.status === 'fulfilled' ? kbR.value : []);
  const skills = normSkills(skillR.status === 'fulfilled' ? skillR.value : []);
  const enriched = enrich(invs, articles, skills);
  const dark = enriched.filter(r => r._class === 'DARK').length;
  const full = enriched.filter(r => r._class === 'FULL_COVERAGE').length;
  return (
    `Investigation × Knowledge × Skill: ${invs.length} investigations, ${articles.length} KB articles, ${skills.length} AIP skills. ` +
    `${full} investigations are fully supported (KB-documented + skilled); ${dark} are DARK (no KB article, no AIP skill — highest priority gap). ` +
    `Top unsupported cases: ${enriched.filter(r => r._class === 'DARK').slice(0, 3).map(r => r.title || r.name || '?').join(', ') || 'none'}.`
  );
}

// ─── normalise ───────────────────────────────────────────────────────────────

function normInvs(raw) {
  if (!raw) return [];
  for (const k of ['investigations', 'items', 'results', 'data', 'cases']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normArticles(raw) {
  if (!raw) return [];
  for (const k of ['articles', 'items', 'results', 'data', 'entries']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

function normSkills(raw) {
  if (!raw) return [];
  for (const k of ['skills', 'items', 'results', 'data']) {
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

function invToks(inv) {
  return new Set([
    ...toks(inv.title),
    ...toks(inv.name),
    ...toks(inv.description),
    ...toks(inv.subject),
    ...toks(inv.type),
    ...(Array.isArray(inv.tags) ? inv.tags.flatMap(toks) : toks(inv.tags)),
  ]);
}

function kbScore(inv, art) {
  const it = invToks(inv);
  const at = new Set([
    ...toks(art.title),
    ...toks(art.content),
    ...toks(art.topic),
    ...toks(art.summary),
    ...(Array.isArray(art.tags) ? art.tags.flatMap(toks) : toks(art.tags)),
  ]);
  if (!it.size || !at.size) return 0;
  let hits = 0;
  for (const t of it) if (at.has(t)) hits++;
  return hits / Math.max(it.size, at.size);
}

function skillScore(inv, skill) {
  const it = invToks(inv);
  const st = new Set([
    ...toks(skill.name),
    ...toks(skill.description),
    ...toks(skill.category),
    ...toks(skill.type),
    ...(Array.isArray(skill.tags) ? skill.tags.flatMap(toks) : toks(skill.tags)),
  ]);
  if (!it.size || !st.size) return 0;
  let hits = 0;
  for (const t of it) if (st.has(t)) hits++;
  return hits / Math.max(it.size, st.size);
}

// ─── enrichment ──────────────────────────────────────────────────────────────

function enrich(invs, articles, skills) {
  return invs.map(inv => {
    const kbMatches = articles
      .map(a => ({ art: a, score: kbScore(inv, a) }))
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const skillMatches = skills
      .map(s => ({ skill: s, score: skillScore(inv, s) }))
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const hasKb = kbMatches.length > 0;
    const hasSkill = skillMatches.length > 0;
    const _class =
      hasKb && hasSkill
        ? 'FULL_COVERAGE'
        : hasKb
        ? 'KB_ONLY'
        : hasSkill
        ? 'SKILL_ONLY'
        : 'DARK';
    return { ...inv, _class, _kbMatches: kbMatches, _skillMatches: skillMatches };
  });
}

// ─── constants ────────────────────────────────────────────────────────────────

const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const RD = '#EF4444';
const VL = '#A78BFA';
const MU = '#6E8AA0';
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const CLASS_COLOR = {
  FULL_COVERAGE: GR,
  KB_ONLY: CY,
  SKILL_ONLY: VL,
  DARK: AM,
};

const FILTERS = ['ALL', 'FULL_COVERAGE', 'KB_ONLY', 'SKILL_ONLY', 'DARK'];

// ─── component ───────────────────────────────────────────────────────────────

export default function InvestigationKnowledgeSkillTriple() {
  const [open, setOpen] = useState(false);
  const [invs, setInvs] = useState([]);
  const [articleCount, setArticleCount] = useState(0);
  const [skillCount, setSkillCount] = useState(0);
  const [enriched, setEnriched] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [invR, kbR, skillR] = await Promise.allSettled([
        fetch(`${API}/v1/investigations`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${API}/knowledge/`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${API}/v1/aip/skill`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const inv = normInvs(invR.status === 'fulfilled' ? invR.value : []);
      const arts = normArticles(kbR.status === 'fulfilled' ? kbR.value : []);
      const sk = normSkills(skillR.status === 'fulfilled' ? skillR.value : []);
      setInvs(inv);
      setArticleCount(arts.length);
      setSkillCount(sk.length);
      setEnriched(enrich(inv, arts, sk));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(v => !v); };
    window.addEventListener('jarvis:ikast-toggle', toggle);
    return () => window.removeEventListener('jarvis:ikast-toggle', toggle);
  }, []);

  useEffect(() => {
    if (open) { load(); }
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true); setAssessText('');
    const ctx = buildSummaryCtx(enriched, invs.length, articleCount, skillCount);
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Provide a concise 2-sentence intelligence assessment of this JARVIS investigation × knowledge × skill coverage data:\n${ctx}` }),
      });
      const j = await r.json();
      const txt = j?.response || j?.message || j?.text || 'No assessment available.';
      setAssessText(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setAssessText('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const visible = enriched.filter(inv => {
    if (filter !== 'ALL' && inv._class !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${inv.title || ''} ${inv.name || ''} ${inv.description || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const dark = enriched.filter(r => r._class === 'DARK').length;
  const full = enriched.filter(r => r._class === 'FULL_COVERAGE').length;
  const kbOnly = enriched.filter(r => r._class === 'KB_ONLY').length;
  const skillOnly = enriched.filter(r => r._class === 'SKILL_ONLY').length;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investigation × Knowledge × Skill Triple (IKAST)"
        style={{
          position: 'fixed', left: 5700, bottom: 18, zIndex: 68,
          background: 'rgba(0,0,0,0.72)', border: `1px solid ${AM}`,
          color: AM, fontFamily: MONO, fontSize: 10, padding: '3px 7px',
          borderRadius: 4, cursor: 'pointer', letterSpacing: 1,
          display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        ◈ IKAST
        {dark > 0 && (
          <span style={{
            background: AM, color: '#000', borderRadius: '50%',
            width: 16, height: 16, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 9, fontWeight: 700,
          }}>
            {dark > 99 ? '99+' : dark}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 60, right: 18, width: 580, maxHeight: 'calc(100vh - 80px)',
      background: 'rgba(5,8,14,0.97)', border: `1px solid ${AM}`,
      borderRadius: 8, zIndex: 200, display: 'flex', flexDirection: 'column',
      fontFamily: MONO, color: '#E2E8F0', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: `1px solid rgba(245,158,11,0.25)`,
        background: 'rgba(245,158,11,0.06)',
      }}>
        <span style={{ fontSize: 11, color: AM, letterSpacing: 2 }}>
          ◈ INVESTIGATION × KNOWLEDGE × SKILL (IKAST)
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} disabled={loading}
            style={{ background: 'none', border: `1px solid ${MU}`, color: MU, borderRadius: 3, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}>
            {loading ? '...' : '↺'}
          </button>
          <button onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', color: MU, fontSize: 14, cursor: 'pointer' }}>
            ✕
          </button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, padding: '10px 14px', borderBottom: `1px solid rgba(245,158,11,0.15)` }}>
        {[
          { label: 'INVESTIGATIONS', val: invs.length, c: CY },
          { label: 'KB ARTICLES', val: articleCount, c: '#94A3B8' },
          { label: 'AIP SKILLS', val: skillCount, c: VL },
          { label: 'DARK', val: dark, c: AM },
        ].map(t => (
          <div key={t.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: '6px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.c }}>{t.val}</div>
            <div style={{ fontSize: 8, color: MU, letterSpacing: 1 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* coverage summary bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, padding: '8px 14px', borderBottom: `1px solid rgba(245,158,11,0.12)` }}>
        {[
          { label: 'FULL', val: full, c: GR },
          { label: 'KB ONLY', val: kbOnly, c: CY },
          { label: 'SKILL ONLY', val: skillOnly, c: VL },
          { label: 'DARK', val: dark, c: AM },
        ].map(t => (
          <div key={t.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{ fontSize: 12, color: t.c, fontWeight: 700 }}>{t.val}</div>
            <div style={{ fontSize: 7, color: MU, letterSpacing: 1 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* filters + search */}
      <div style={{ padding: '8px 14px', borderBottom: `1px solid rgba(245,158,11,0.12)`, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                background: filter === f ? AM : 'rgba(255,255,255,0.05)',
                color: filter === f ? '#000' : '#94A3B8',
                border: 'none', borderRadius: 3, padding: '2px 8px', fontSize: 9,
                cursor: 'pointer', letterSpacing: 0.5,
              }}>
              {f.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search investigations…"
          style={{
            background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(245,158,11,0.2)`,
            color: '#E2E8F0', borderRadius: 3, padding: '4px 8px', fontSize: 10, width: '100%',
            boxSizing: 'border-box', outline: 'none', fontFamily: MONO,
          }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
        {err && <div style={{ color: RD, fontSize: 10, marginBottom: 8 }}>{err}</div>}
        {visible.length === 0 && !loading && (
          <div style={{ color: MU, fontSize: 10, textAlign: 'center', paddingTop: 20 }}>No investigations match.</div>
        )}
        {visible.map((inv, i) => {
          const id = inv.id || inv._id || i;
          const isExp = expanded[id];
          const cc = CLASS_COLOR[inv._class] || MU;
          return (
            <div key={id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(v => ({ ...v, [id]: !v[id] }))}
                style={{
                  background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: '7px 10px',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                  borderLeft: `3px solid ${cc}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: '#E2E8F0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {inv.title || inv.name || `Investigation ${id}`}
                  </div>
                  {inv.description && (
                    <div style={{ fontSize: 8.5, color: MU, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {inv.description}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 8, color: cc, background: `${cc}22`, padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap' }}>
                  {inv._class.replace(/_/g, ' ')}
                </span>
                <span style={{ color: MU, fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '0 0 5px 5px', padding: '8px 10px', borderLeft: `3px solid ${cc}`, borderTop: 'none' }}>
                  {/* KB matches */}
                  <div style={{ fontSize: 8, color: CY, letterSpacing: 1, marginBottom: 4 }}>KB ARTICLES ({inv._kbMatches.length})</div>
                  {inv._kbMatches.length === 0
                    ? <div style={{ fontSize: 8.5, color: MU, marginBottom: 6 }}>No KB articles matched.</div>
                    : inv._kbMatches.map((m, j) => (
                      <div key={j} style={{ marginBottom: 5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#CBD5E1', marginBottom: 2 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                            {m.art.title || m.art.topic || '(untitled)'}
                          </span>
                          <span style={{ color: CY }}>{(m.score * 100).toFixed(0)}%</span>
                        </div>
                        <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                          <div style={{ width: `${m.score * 100}%`, height: '100%', background: CY, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))
                  }
                  {/* Skill matches */}
                  <div style={{ fontSize: 8, color: VL, letterSpacing: 1, marginBottom: 4, marginTop: 8 }}>AIP SKILLS ({inv._skillMatches.length})</div>
                  {inv._skillMatches.length === 0
                    ? <div style={{ fontSize: 8.5, color: MU }}>No AIP skills matched.</div>
                    : inv._skillMatches.map((m, j) => (
                      <div key={j} style={{ marginBottom: 5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#CBD5E1', marginBottom: 2 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                            {m.skill.name || '(unnamed skill)'}
                            {m.skill.category && <span style={{ color: VL, marginLeft: 4, fontSize: 7.5 }}>[{m.skill.category}]</span>}
                          </span>
                          <span style={{ color: VL }}>{(m.score * 100).toFixed(0)}%</span>
                        </div>
                        <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                          <div style={{ width: `${m.score * 100}%`, height: '100%', background: VL, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess */}
      <div style={{ padding: '8px 14px', borderTop: `1px solid rgba(245,158,11,0.2)` }}>
        <button onClick={assess} disabled={assessing}
          style={{
            background: assessing ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.18)',
            border: `1px solid ${AM}`, color: AM, borderRadius: 4, padding: '4px 12px',
            fontSize: 10, cursor: 'pointer', letterSpacing: 1, width: '100%',
          }}>
          {assessing ? '⟳ ASSESSING…' : '▶ ASSESS'}
        </button>
        {assessText && (
          <div style={{ fontSize: 9.5, color: '#CBD5E1', marginTop: 8, lineHeight: 1.5, background: 'rgba(245,158,11,0.05)', borderRadius: 4, padding: '6px 8px' }}>
            {assessText}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildSummaryCtx(enriched, invCount, artCount, skillCount) {
  const dark = enriched.filter(r => r._class === 'DARK');
  const full = enriched.filter(r => r._class === 'FULL_COVERAGE');
  return [
    `Total investigations: ${invCount}, KB articles: ${artCount}, AIP skills: ${skillCount}.`,
    `Full coverage: ${full.length}, KB-only: ${enriched.filter(r => r._class === 'KB_ONLY').length}, skill-only: ${enriched.filter(r => r._class === 'SKILL_ONLY').length}, dark: ${dark.length}.`,
    `Top dark investigations: ${dark.slice(0, 5).map(r => r.title || r.name || '?').join('; ')}.`,
    `Top fully-covered investigations: ${full.slice(0, 3).map(r => r.title || r.name || '?').join('; ')}.`,
  ].join(' ');
}
