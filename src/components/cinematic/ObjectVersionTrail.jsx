/**
 * ObjectVersionTrail — F273
 *
 * Object version inspector wired to the real temporal backend:
 *   GET /v1/temporal/object/{object_id}/versions
 *     → { object_id, count, versions: [{ts, kind, detail}] }
 *
 * Features:
 *   - object_id text input + Load button
 *   - Vertical timeline newest-first: version number, ISO timestamp, actor, changed-field chips
 *   - Click any two version rows → side-by-side diff panel below
 *     (added props = green, removed props = red)
 *   - Rate-of-change metric: versions/day over last 30 days
 *   - ▶ ASSESS → /v1/jarvis/agent/chat + TTS via jarvis:speak-dossier
 *
 * Toggle: ◈ VERTR (left:200680, zIndex:369); event jarvis:vertr-toggle
 * Mounted in App.jsx
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiBase } from '@/api/cinematicDataAdapters';

const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || 'dev-key';

const CY  = '#00E5FF';
const GRN = '#00E5A0';
const RED = '#FF4444';
const AMB = '#F5A623';
const DIM = '#1A2A3A';
const BRD = '#0D1B2A';
const TXT = '#DCEBF5';
const MUT = '#6E8AA0';
const BTN_LEFT = 200680;

// ── exported helpers for JarvisBrain ─────────────────────────────────────────

export function isVertrQuery(q) {
  const s = (q || '').toLowerCase();
  return [
    'vertr', 'version trail', 'object version', 'object versions',
    'version history', 'object history', 'change history',
    'object changelog', 'who changed', 'object changes',
    'version inspector', 'temporal object',
  ].some(kw => s.includes(kw));
}

export function buildVertrScript() {
  return `Inspect the Object Version Trail panel. Summarise: the object_id loaded, total version count, rate of change (versions per day over last 30 days), the most recent change kind and actor, and any notable mutation pattern. Assess object stability in two sentences.`;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtTs(ts) {
  if (!ts) return '—';
  const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts);
  return isNaN(d) ? String(ts) : d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function extractActor(v) {
  return v?.detail?.actor || v?.detail?.payload?.actor || null;
}

function extractFields(v) {
  const d = v?.detail || {};
  const keys = Object.keys(d).filter(k => k !== 'actor');
  return keys.length ? keys : null;
}

function normTs(ts) {
  if (!ts) return 0;
  return typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts;
}

function versionsPerDay(versions) {
  const now = Date.now();
  const cutoff = now - 30 * 24 * 3600000;
  const recent = versions.filter(v => normTs(v.ts) >= cutoff);
  return (recent.length / 30).toFixed(2);
}

function flattenDetail(detail) {
  if (!detail || typeof detail !== 'object') return {};
  const out = {};
  function walk(obj, prefix) {
    for (const [k, v] of Object.entries(obj || {})) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object') {
        walk(v, key);
      } else {
        out[key] = String(v ?? '');
      }
    }
  }
  walk(detail, '');
  return out;
}

function diffDetails(a, b) {
  const fa = flattenDetail(a?.detail);
  const fb = flattenDetail(b?.detail);
  const allKeys = new Set([...Object.keys(fa), ...Object.keys(fb)]);
  const added = [];
  const removed = [];
  const changed = [];
  for (const k of allKeys) {
    const va = fa[k];
    const vb = fb[k];
    if (va === undefined) added.push({ k, v: vb });
    else if (vb === undefined) removed.push({ k, v: va });
    else if (va !== vb) changed.push({ k, from: va, to: vb });
  }
  return { added, removed, changed };
}

// ── component ────────────────────────────────────────────────────────────────

export default function ObjectVersionTrail() {
  const [open, setOpen]           = useState(false);
  const [objectId, setObjectId]   = useState('');
  const [inputVal, setInputVal]   = useState('');
  const [versions, setVersions]   = useState([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [selected, setSelected]   = useState([]);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');

  // listen for toggle event from JarvisBrain
  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:vertr-toggle', handler);
    return () => window.removeEventListener('jarvis:vertr-toggle', handler);
  }, []);

  const load = useCallback(async (oid) => {
    const id = (oid || inputVal).trim();
    if (!id) return;
    setObjectId(id);
    setLoading(true);
    setError(null);
    setSelected([]);
    setAssessText('');
    try {
      const r = await fetch(
        `${apiBase()}/v1/temporal/object/${encodeURIComponent(id)}/versions`,
        { headers: { Authorization: `Bearer ${API_KEY}` } }
      );
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const data = await r.json();
      const vs = (data.versions || []).slice().reverse(); // newest first
      setVersions(vs);
      setTotal(data.count ?? vs.length);
    } catch (e) {
      setError(e.message);
      setVersions([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [inputVal]);

  function toggleSelect(idx) {
    setSelected(prev => {
      if (prev.includes(idx)) return prev.filter(i => i !== idx);
      if (prev.length >= 2) return [prev[prev.length - 1], idx];
      return [...prev, idx];
    });
  }

  async function runAssess() {
    if (!objectId || !versions.length) return;
    setAssessing(true);
    setAssessText('');
    const prompt = `${buildVertrScript()} Object: ${objectId}. Total versions: ${total}. Versions per day (30d): ${versionsPerDay(versions)}. Most recent: kind=${versions[0]?.kind}, actor=${extractActor(versions[0]) || 'unknown'}. Versions sample (newest 3): ${JSON.stringify(versions.slice(0,3))}.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await r.json();
      const text = data.response || data.message || data.answer || 'No response.';
      setAssessText(text);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      setAssessText('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  }

  // diff panel: use the two selected rows (sorted oldest first for diff)
  const diffPair = selected.length === 2
    ? [versions[Math.max(...selected)], versions[Math.min(...selected)]] // older, newer
    : null;
  const diff = diffPair ? diffDetails(diffPair[0], diffPair[1]) : null;

  const vpd = versions.length ? versionsPerDay(versions) : null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 8, left: BTN_LEFT,
          zIndex: 369, background: '#0a1520', border: `1px solid ${CY}`,
          color: CY, padding: '3px 8px', borderRadius: 4,
          fontSize: 11, fontFamily: 'monospace', cursor: 'pointer', opacity: 0.85,
        }}
      >
        ◈ VERTR
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', top: 60, right: 20, width: 560, maxHeight: '82vh',
      background: BRD, border: `1px solid ${CY}`, borderRadius: 6,
      zIndex: 369, display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace', fontSize: 12, color: TXT,
      boxShadow: `0 0 24px #00E5FF22`,
    }}>
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px', borderBottom: `1px solid #1a3a5a`,
        background: '#0d1e30',
      }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 1 }}>◈ VERTR</span>
        <span style={{ color: MUT, fontSize: 10, flex: 1 }}>Object Version Trail</span>
        {vpd !== null && (
          <span style={{ color: AMB, fontSize: 10 }}>{vpd} ver/day (30d)</span>
        )}
        <button
          onClick={runAssess}
          disabled={assessing || !objectId || !versions.length}
          style={{
            background: assessing ? DIM : '#0a2a1a', border: `1px solid ${GRN}`,
            color: GRN, padding: '2px 8px', borderRadius: 3,
            fontSize: 10, cursor: 'pointer', opacity: assessing ? 0.5 : 1,
          }}
        >
          {assessing ? '…' : '▶ ASSESS'}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: 'none', border: 'none', color: MUT,
            fontSize: 14, cursor: 'pointer', padding: '0 4px',
          }}
        >✕</button>
      </div>

      {/* search bar */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 10px', borderBottom: `1px solid #1a3a5a` }}>
        <input
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="Enter object_id…"
          style={{
            flex: 1, background: DIM, border: `1px solid #2a4a6a`,
            color: TXT, padding: '3px 6px', borderRadius: 3, fontSize: 11,
          }}
        />
        <button
          onClick={() => load()}
          disabled={loading || !inputVal.trim()}
          style={{
            background: '#0a1e3a', border: `1px solid ${CY}`, color: CY,
            padding: '3px 10px', borderRadius: 3, fontSize: 11, cursor: 'pointer',
          }}
        >
          {loading ? '…' : 'Load'}
        </button>
      </div>

      {/* body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px' }}>
        {error && (
          <div style={{ color: RED, padding: '8px 0' }}>Error: {error}</div>
        )}
        {!error && !loading && objectId && versions.length === 0 && (
          <div style={{ color: MUT, padding: '8px 0' }}>No version history found for "{objectId}".</div>
        )}
        {!error && !loading && !objectId && (
          <div style={{ color: MUT, padding: '8px 0' }}>Enter an object ID to inspect its version trail.</div>
        )}

        {/* stats bar */}
        {versions.length > 0 && (
          <div style={{
            display: 'flex', gap: 16, marginBottom: 8,
            padding: '4px 0', borderBottom: `1px solid #1a3a5a`,
          }}>
            <span><span style={{ color: MUT }}>object </span><span style={{ color: CY }}>{objectId}</span></span>
            <span><span style={{ color: MUT }}>total </span><span style={{ color: CY }}>{total}</span></span>
            <span><span style={{ color: MUT }}>select 2 to diff → </span><span style={{ color: AMB }}>{selected.length}/2</span></span>
          </div>
        )}

        {/* timeline */}
        {versions.map((v, i) => {
          const actor  = extractActor(v);
          const fields = extractFields(v);
          const isSel  = selected.includes(i);
          const tsMs   = normTs(v.ts);
          const kindColor = v.kind === 'created' ? GRN : v.kind?.startsWith('action:') ? AMB : CY;
          return (
            <div
              key={i}
              onClick={() => toggleSelect(i)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 3,
                padding: '5px 8px', marginBottom: 4, borderRadius: 4,
                background: isSel ? '#0a2a3a' : DIM,
                border: `1px solid ${isSel ? CY : '#1a3a5a'}`,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: MUT, minWidth: 28, textAlign: 'right' }}>
                  #{total - i}
                </span>
                <span style={{ color: kindColor, minWidth: 110 }}>{v.kind || 'unknown'}</span>
                <span style={{ color: MUT, fontSize: 10, flex: 1 }}>{fmtTs(tsMs)}</span>
                {actor && (
                  <span style={{
                    background: '#0a2030', border: `1px solid #2a4a6a`,
                    color: AMB, padding: '1px 5px', borderRadius: 3, fontSize: 10,
                  }}>{actor}</span>
                )}
              </div>
              {fields && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingLeft: 36 }}>
                  {fields.map(f => (
                    <span key={f} style={{
                      background: '#0a1e2e', border: `1px solid #2a4a6a`,
                      color: MUT, padding: '0 4px', borderRadius: 2, fontSize: 10,
                    }}>{f}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* diff panel */}
        {diff && (
          <div style={{
            marginTop: 8, padding: '8px', background: '#0a1520',
            border: `1px solid ${AMB}`, borderRadius: 4,
          }}>
            <div style={{ color: AMB, fontWeight: 700, marginBottom: 6, fontSize: 11 }}>
              DIFF — v#{total - selected[1]} → v#{total - selected[0]}
            </div>
            {diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0 && (
              <div style={{ color: MUT }}>No prop differences detected.</div>
            )}
            {diff.added.map(({ k, v }) => (
              <div key={`a-${k}`} style={{ color: GRN, fontSize: 11, marginBottom: 2 }}>
                + {k}: <span style={{ color: TXT }}>{v}</span>
              </div>
            ))}
            {diff.removed.map(({ k, v }) => (
              <div key={`r-${k}`} style={{ color: RED, fontSize: 11, marginBottom: 2 }}>
                − {k}: <span style={{ color: TXT }}>{v}</span>
              </div>
            ))}
            {diff.changed.map(({ k, from, to }) => (
              <div key={`c-${k}`} style={{ fontSize: 11, marginBottom: 2 }}>
                <span style={{ color: AMB }}>~ {k}: </span>
                <span style={{ color: RED }}>{from}</span>
                <span style={{ color: MUT }}> → </span>
                <span style={{ color: GRN }}>{to}</span>
              </div>
            ))}
          </div>
        )}

        {/* assess response */}
        {assessText && (
          <div style={{
            marginTop: 8, padding: '8px', background: '#0a1520',
            border: `1px solid ${GRN}`, borderRadius: 4, fontSize: 11,
            color: TXT, lineHeight: 1.5,
          }}>
            {assessText}
          </div>
        )}
      </div>
    </div>
  );
}
