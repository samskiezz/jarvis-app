'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Activity, Loader2, AlertTriangle, Play, ChevronRight } from 'lucide-react';

/**
 * SciencePanel — surfaces the JARVIS science engine (14 curated consoles +
 * ~449 methods) onto the Osiris surface. Reads through the fail-safe proxy
 * routes under /api/jarvis/sci. Themed to match the dark/gold Osiris panels
 * (gold #D4AF37, cyan #00E5FF, void bg).
 *
 * Left:  the 14 domain consoles.
 * Right: methods of the selected console + a freeform run form
 *        (method + JSON args → POST run → result).
 */

interface Domain {
  id: string;
  label: string;
  icon?: string;
  blurb?: string;
  keywords?: string[];
  count?: number;
}

interface Method {
  key: string;
  doc?: string;
  engine?: string;
  domain?: string;
}

interface SciencePanelProps {
  onClose: () => void;
}

export default function SciencePanel({ onClose }: SciencePanelProps) {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [domainsError, setDomainsError] = useState<string | null>(null);
  const [loadingDomains, setLoadingDomains] = useState(true);

  const [selected, setSelected] = useState<string | null>(null);
  const [methods, setMethods] = useState<Method[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(false);
  const [methodsError, setMethodsError] = useState<string | null>(null);

  const [activeMethod, setActiveMethod] = useState<string>('');
  const [argsText, setArgsText] = useState<string>('{}');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  // ── Load console catalog ──
  useEffect(() => {
    let alive = true;
    setLoadingDomains(true);
    fetch('/api/jarvis/sci', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const list: Domain[] = Array.isArray(d?.domains) ? d.domains : [];
        setDomains(list);
        if (!d?.available && list.length === 0) {
          setDomainsError('Science engine unavailable');
        }
        if (list.length > 0) setSelected(list[0].id);
      })
      .catch((e) => {
        if (alive) setDomainsError(e instanceof Error ? e.message : 'Failed to load consoles');
      })
      .finally(() => {
        if (alive) setLoadingDomains(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // ── Load methods for the selected console ──
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setLoadingMethods(true);
    setMethodsError(null);
    setResult(null);
    setActiveMethod('');
    setArgsText('{}');
    fetch(`/api/jarvis/sci/${selected}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const list: Method[] = Array.isArray(d?.methods) ? d.methods : [];
        setMethods(list);
        if (list.length > 0) setActiveMethod(list[0].key);
        if (d?.error) setMethodsError(String(d.error));
      })
      .catch((e) => {
        if (alive) setMethodsError(e instanceof Error ? e.message : 'Failed to load methods');
      })
      .finally(() => {
        if (alive) setLoadingMethods(false);
      });
    return () => {
      alive = false;
    };
  }, [selected]);

  const handleRun = useCallback(async () => {
    if (!selected || !activeMethod) return;
    let value: Record<string, unknown> = {};
    if (argsText.trim()) {
      try {
        const parsed = JSON.parse(argsText);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          value = parsed;
        } else {
          setResult('Arguments must be a JSON object, e.g. { "I": 1e-6 }');
          return;
        }
      } catch {
        setResult('Invalid JSON in arguments');
        return;
      }
    }
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch(`/api/jarvis/sci/${selected}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: activeMethod, value }),
      });
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (e) {
      setResult(`Request failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setRunning(false);
    }
  }, [selected, activeMethod, argsText]);

  const selectedDomain = domains.find((d) => d.id === selected) || null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-x-4 top-20 bottom-20 md:inset-x-auto md:right-20 md:left-auto md:w-[760px] z-[400] flex flex-col glass-panel overflow-hidden"
      style={{ background: 'rgba(6,6,12,0.92)', borderColor: 'rgba(212,175,55,0.25)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--gold-primary)]/20 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[var(--cyan-primary)]" />
          <span className="font-mono text-sm font-bold tracking-[0.2em] text-[var(--gold-primary)]">
            SCIENCE ENGINE
          </span>
          <span className="font-mono text-[10px] text-[var(--text-muted)] tracking-widest">
            {domains.length} CONSOLES
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close science panel"
          className="p-1.5 rounded hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4 text-white/60" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* ── LEFT: console list ── */}
        <div className="w-44 md:w-52 shrink-0 border-r border-[var(--gold-primary)]/15 overflow-y-auto">
          {loadingDomains && (
            <div className="flex items-center gap-2 p-4 text-[var(--text-muted)] text-xs font-mono">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
            </div>
          )}
          {domainsError && !loadingDomains && (
            <div className="flex items-start gap-2 p-4 text-[#FF9500] text-xs font-mono">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {domainsError}
            </div>
          )}
          {domains.map((d) => {
            const isActive = d.id === selected;
            return (
              <button
                key={d.id}
                onClick={() => setSelected(d.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-white/5 transition-colors flex items-center justify-between gap-2 ${
                  isActive ? 'bg-[var(--gold-primary)]/15' : 'hover:bg-white/5'
                }`}
              >
                <div className="min-w-0">
                  <div
                    className={`font-mono text-[11px] tracking-wide truncate ${
                      isActive ? 'text-[var(--gold-primary)]' : 'text-white/70'
                    }`}
                  >
                    {d.label || d.id}
                  </div>
                  {typeof d.count === 'number' && (
                    <div className="font-mono text-[9px] text-[var(--text-muted)]">{d.count} methods</div>
                  )}
                </div>
                {isActive && <ChevronRight className="w-3 h-3 text-[var(--gold-primary)] shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* ── RIGHT: methods + run form ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {selectedDomain?.blurb && (
            <p className="px-4 pt-3 pb-2 text-[11px] text-[var(--text-muted)] font-mono leading-relaxed shrink-0">
              {selectedDomain.blurb}
            </p>
          )}

          {/* Method picker */}
          <div className="px-4 pb-2 shrink-0">
            <label className="block font-mono text-[10px] tracking-widest text-[var(--cyan-primary)] mb-1">
              METHOD
            </label>
            {loadingMethods ? (
              <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs font-mono py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading methods…
              </div>
            ) : methodsError ? (
              <div className="flex items-start gap-2 text-[#FF9500] text-xs font-mono py-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {methodsError}
              </div>
            ) : (
              <select
                value={activeMethod}
                onChange={(e) => setActiveMethod(e.target.value)}
                className="w-full bg-black/40 border border-[var(--gold-primary)]/25 rounded px-2 py-1.5 font-mono text-xs text-white/90 focus:outline-none focus:border-[var(--cyan-primary)]/60"
              >
                {methods.length === 0 && <option value="">No methods</option>}
                {methods.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.key}
                  </option>
                ))}
              </select>
            )}
            {activeMethod && (
              <p className="mt-1.5 text-[10px] text-[var(--text-muted)] font-mono leading-relaxed">
                {methods.find((m) => m.key === activeMethod)?.doc || ''}
              </p>
            )}
          </div>

          {/* Args editor */}
          <div className="px-4 pb-2 shrink-0">
            <label className="block font-mono text-[10px] tracking-widest text-[var(--cyan-primary)] mb-1">
              ARGUMENTS (JSON)
            </label>
            <textarea
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              spellCheck={false}
              rows={3}
              placeholder='{ "I": 1e-6 }'
              className="w-full bg-black/40 border border-[var(--gold-primary)]/25 rounded px-2 py-1.5 font-mono text-xs text-[var(--cyan-primary)] focus:outline-none focus:border-[var(--cyan-primary)]/60 resize-none"
            />
          </div>

          {/* Run */}
          <div className="px-4 pb-3 shrink-0">
            <button
              onClick={handleRun}
              disabled={running || !activeMethod}
              className="flex items-center gap-2 px-4 py-1.5 rounded font-mono text-xs font-bold tracking-widest bg-[var(--gold-primary)]/15 border border-[var(--gold-primary)]/50 text-[var(--gold-primary)] hover:bg-[var(--gold-primary)]/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              RUN
            </button>
          </div>

          {/* Result */}
          <div className="flex-1 min-h-0 px-4 pb-4 overflow-auto">
            {result !== null && (
              <pre className="bg-black/50 border border-[var(--cyan-primary)]/20 rounded p-3 font-mono text-[11px] text-[var(--alert-green)] whitespace-pre-wrap break-words">
                {result}
              </pre>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
