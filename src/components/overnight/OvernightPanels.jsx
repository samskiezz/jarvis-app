import { Suspense, lazy, useMemo, useRef, useState } from 'react';
import { PANELS } from './panelRegistry.generated';
import PanelErrorBoundary from './PanelErrorBoundary';

/**
 * OvernightPanels — ONE launcher overlay that makes the ~109 self-contained "overnight" panels
 * (built by the autonomous loop but never wired in) reachable, without mounting 109 colliding
 * floating buttons. It renders a single launcher button; opening it shows a searchable, category-
 * grouped list; selecting a panel lazy-loads and mounts it (one at a time) behind an error
 * boundary. Each panel is self-contained (zero props, renders its own UI), so it behaves exactly
 * as its author designed once mounted. This is the only new mount point in the live shell.
 */

// Vite turns this into a lazy import map: { '../cinematic/SituationRoom.jsx': () => import(...) }
const MODULES = import.meta.glob('../cinematic/*.jsx');

const CY = '#3fe0d0';
const PANEL_BG = 'rgba(8,16,20,0.94)';

export default function OvernightPanels() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(null); // the mounted panel meta, or null
  const lazyCache = useRef({});

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const groups = {};
    for (const p of PANELS) {
      if (q && !p.label.toLowerCase().includes(q) && !p.category.toLowerCase().includes(q)) continue;
      (groups[p.category] ||= []).push(p);
    }
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [query]);

  function getLazy(file) {
    if (!lazyCache.current[file]) {
      const loader = MODULES[`../cinematic/${file}`];
      lazyCache.current[file] = loader ? lazy(loader) : null;
    }
    return lazyCache.current[file];
  }

  function pick(p) {
    setActive(p);
    setOpen(false);
  }

  const ActivePanel = active ? getLazy(active.file) : null;

  return (
    <>
      {/* launcher toggle button — single, fixed, non-colliding (bottom-left) */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Overnight panels"
        style={{
          position: 'fixed', left: 16, bottom: 16, zIndex: 99998,
          width: 46, height: 46, borderRadius: 12, cursor: 'pointer',
          background: PANEL_BG, border: `1px solid ${CY}55`, color: CY,
          font: '18px ui-monospace, monospace', backdropFilter: 'blur(8px)',
          boxShadow: open ? `0 0 0 2px ${CY}55` : '0 4px 18px rgba(0,0,0,0.5)',
        }}
      >
        ◈
      </button>

      {/* launcher grid */}
      {open && (
        <div
          style={{
            position: 'fixed', left: 16, bottom: 72, zIndex: 99999,
            width: 380, maxHeight: '70vh', overflowY: 'auto', padding: 14, borderRadius: 14,
            background: PANEL_BG, border: `1px solid ${CY}40`, color: '#cfeee9',
            font: '12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
            backdropFilter: 'blur(12px)', boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ color: CY, letterSpacing: 1 }}>OVERNIGHT PANELS · {PANELS.length}</strong>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'transparent', border: 'none', color: '#9fc', cursor: 'pointer', fontSize: 16 }}
            >
              ×
            </button>
          </div>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="filter panels…"
            style={{
              width: '100%', boxSizing: 'border-box', marginBottom: 10, padding: '7px 10px',
              borderRadius: 8, background: 'rgba(0,0,0,0.35)', border: `1px solid ${CY}33`,
              color: '#dffaf5', font: 'inherit', outline: 'none',
            }}
          />
          {grouped.length === 0 && <div style={{ opacity: 0.6 }}>no panels match “{query}”.</div>}
          {grouped.map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: 10 }}>
              <div style={{ color: `${CY}aa`, fontSize: 10, letterSpacing: 1, margin: '6px 0 4px' }}>
                {cat.toUpperCase()} · {items.length}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {items.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => pick(p)}
                    title={p.endpoints?.join('  ') || ''}
                    style={{
                      padding: '5px 9px', borderRadius: 7, cursor: 'pointer',
                      background: active?.key === p.key ? `${CY}22` : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${active?.key === p.key ? CY : 'rgba(255,255,255,0.12)'}`,
                      color: '#dffaf5', font: 'inherit',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* the mounted panel + an unmount control */}
      {active && ActivePanel && (
        <>
          <div
            style={{
              position: 'fixed', left: 70, bottom: 22, zIndex: 99997,
              padding: '4px 10px', borderRadius: 8, background: PANEL_BG, border: `1px solid ${CY}40`,
              color: CY, font: '11px ui-monospace, monospace', backdropFilter: 'blur(8px)',
            }}
          >
            ▸ {active.label}
            <button
              onClick={() => setActive(null)}
              style={{ marginLeft: 8, background: 'transparent', border: 'none', color: '#9fc', cursor: 'pointer' }}
            >
              unmount ✕
            </button>
          </div>
          <PanelErrorBoundary label={active.label} onClose={() => setActive(null)}>
            <Suspense fallback={null}>
              <ActivePanel />
            </Suspense>
          </PanelErrorBoundary>
        </>
      )}
    </>
  );
}
