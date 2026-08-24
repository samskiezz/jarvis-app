import { useState, useEffect, useCallback } from 'react';

const API = '';
const FNDP_RE = /\b(foundry|pipelines?|pipeline[._-]?templates?|fndp|pipeline[._-]?browser|data[._-]?pipelines?|pipeline[._-]?registry|foundry[._-]?pipelines?|world[._-]?os[._-]?pipelines?|pipeline[._-]?catalog)\b/i;

export function isFndpQuery(t) {
  return FNDP_RE.test(t || '');
}

export async function buildFndpScript() {
  try {
    const r = await fetch(`${API}/v1/foundry/pipelines`);
    const d = await r.json();
    const items = normaliseItems(d);
    if (!items.length) {
      return 'Foundry Pipeline Browser: no pipeline templates found — the world_os/foundry_pipelines/ directory may be empty or the service is not initialised.';
    }
    const totalKb = items.reduce((s, p) => s + (p.size || 0), 0) / 1024;
    const largest = items.reduce((a, b) => (a.size > b.size ? a : b), items[0]);
    return (
      `Foundry Pipeline Registry: ${items.length} pipeline template${items.length !== 1 ? 's' : ''} loaded, ` +
      `${totalKb.toFixed(1)} KB total. ` +
      `Largest template: ${largest.name || largest.file} (${((largest.size || 0) / 1024).toFixed(1)} KB). ` +
      `Templates: ${items.map(p => p.name || p.file).slice(0, 5).join(', ')}${items.length > 5 ? '…' : ''}.`
    );
  } catch {
    return 'Foundry Pipeline Browser: unable to reach /v1/foundry/pipelines.';
  }
}

function normaliseItems(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'pipelines', 'data', 'results']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

const PANEL_W = 600;
const PANEL_H = 560;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const PR = '#A78BFA';
const DIM = '#6E8AA0';

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4,
    border: `1px solid ${color}44`, background: `${color}14`,
    color, fontSize: 10, letterSpacing: 1, marginRight: 4, verticalAlign: 'middle',
  }}>{label}</span>
);

export default function FoundryPipelineBrowser() {
  const [open, setOpen] = useState(false);
  const [pipelines, setPipelines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [lineage, setLineage] = useState({});
  const [lineageLoading, setLineageLoading] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/v1/foundry/pipelines`);
      const d = await r.json();
      setPipelines(normaliseItems(d));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:fndp-toggle', onToggle);
    return () => window.removeEventListener('jarvis:fndp-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 120000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  async function fetchLineage(file) {
    if (lineage[file] !== undefined || lineageLoading[file]) return;
    setLineageLoading(prev => ({ ...prev, [file]: true }));
    try {
      const r = await fetch(`${API}/v1/foundry/lineage/${encodeURIComponent(file)}`);
      const d = await r.json();
      setLineage(prev => ({ ...prev, [file]: d }));
    } catch {
      setLineage(prev => ({ ...prev, [file]: { status: 'error' } }));
    }
    setLineageLoading(prev => ({ ...prev, [file]: false }));
  }

  function toggleExpand(i) {
    if (expanded === i) {
      setExpanded(null);
    } else {
      setExpanded(i);
      const p = filtered[i];
      if (p) fetchLineage(p.file);
    }
  }

  async function assess() {
    setAssessing(true);
    setBrief('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message: `The Foundry pipeline registry has ${pipelines.length} pipeline template${pipelines.length !== 1 ? 's' : ''}. ` +
            `Total size: ${(pipelines.reduce((s, p) => s + (p.size || 0), 0) / 1024).toFixed(1)} KB. ` +
            `Templates: ${pipelines.map(p => p.name || p.file).join(', ') || 'none'}. ` +
            `Give a 2-sentence pipeline registry health brief and note whether the Foundry runtime appears to be active.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const filtered = pipelines.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(p.name || '').toLowerCase().includes(q) ||
      String(p.file || '').toLowerCase().includes(q)
    );
  });

  const totalKb = pipelines.reduce((s, p) => s + (p.size || 0), 0) / 1024;
  const avgKb = pipelines.length ? totalKb / pipelines.length : 0;
  const largestKb = pipelines.length
    ? Math.max(...pipelines.map(p => (p.size || 0) / 1024))
    : 0;

  const badgeCount = pipelines.length;
  const badgeColor = badgeCount > 0 ? GR : DIM;

  function lineageChip(file) {
    if (lineageLoading[file]) return chip('loading…', DIM);
    const lg = lineage[file];
    if (!lg) return null;
    if (lg.status === 'not_implemented') return chip('SCHEMA ONLY', AM);
    if (lg.status === 'error') return chip('ERROR', '#F43F5E');
    return chip(lg.status || 'OK', GR);
  }

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Foundry Pipeline Browser (FNDP)"
        style={{
          position: 'fixed', left: 661920, bottom: 8, zIndex: 239,
          width: 54, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ⊞ FNDP
        {badgeCount > 0 && (
          <span style={{
            background: badgeColor, color: '#04060A', borderRadius: 3, padding: '0 4px',
            fontSize: 8, fontWeight: 700, minWidth: 14, textAlign: 'center',
          }}>{badgeCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: PANEL_W, height: PANEL_H, zIndex: 9200,
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${CY}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${CY}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${CY}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${CY}` }}>
              ⊞ FOUNDRY PIPELINE BROWSER
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: DIM, fontSize: 10 }}>loading…</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  padding: '2px 8px', borderRadius: 3, border: `1px solid ${CY}55`,
                  background: 'transparent', color: CY, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                }}
              >{assessing ? 'assessing…' : '▶ ASSESS'}</button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 14, padding: 0 }}
              >✕</button>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'TEMPLATES', val: pipelines.length, col: CY },
              { label: 'TOTAL KB', val: totalKb.toFixed(1), col: PR },
              { label: 'AVG KB', val: avgKb.toFixed(1), col: GR },
              { label: 'LARGEST KB', val: largestKb.toFixed(1), col: AM },
            ].map(({ label: l, val, col }) => (
              <div key={l} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '6px 8px', textAlign: 'center',
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: DIM, fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          <div style={{ padding: '0 14px 8px', flexShrink: 0 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search pipelines…"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                borderRadius: 4, color: '#DCEBF5', padding: '4px 10px', fontSize: 10,
                outline: 'none', fontFamily: "'JetBrains Mono',monospace",
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: DIM, fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading…' : pipelines.length === 0
                  ? 'No pipeline templates found. Check world_os/foundry_pipelines/.'
                  : 'No results match search.'}
              </div>
            ) : filtered.map((p, i) => {
              const isExp = expanded === i;
              const sizeKb = ((p.size || 0) / 1024).toFixed(1);
              return (
                <div
                  key={p.file || i}
                  style={{ borderBottom: `1px solid ${CY}11`, paddingBottom: 6, marginBottom: 6 }}
                >
                  <div
                    onClick={() => toggleExpand(i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: 2, background: CY,
                      boxShadow: `0 0 6px ${CY}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>
                      {p.name || p.file}
                    </span>
                    {chip(`${sizeKb} KB`, PR)}
                    {p.file && p.file !== p.name && (
                      <span style={{ color: DIM, fontSize: 9 }}>{p.file}</span>
                    )}
                    <span style={{ color: DIM, fontSize: 9, marginLeft: 4 }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 6 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
                      }}>
                        <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>LINEAGE:</span>
                        {lineageChip(p.file)}
                      </div>
                      {p.preview && (
                        <>
                          <div style={{ color: DIM, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            PREVIEW
                          </div>
                          <pre style={{
                            color: '#A8C0D0', fontSize: 9, lineHeight: 1.5, margin: 0,
                            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                            background: 'rgba(0,207,255,0.04)', borderRadius: 4,
                            padding: '6px 8px', border: `1px solid ${CY}18`,
                            maxHeight: 140, overflowY: 'auto',
                          }}>{p.preview}</pre>
                        </>
                      )}
                      {p.mtime && (
                        <div style={{ color: DIM, fontSize: 9, marginTop: 6 }}>
                          modified: {new Date(p.mtime * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {brief && (
            <div style={{
              padding: '8px 14px', borderTop: `1px solid ${CY}22`,
              color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
              background: 'rgba(0,207,255,0.03)',
            }}>
              <span style={{ color: CY, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
