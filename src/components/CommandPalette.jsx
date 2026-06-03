/**
 * CommandPalette — the primary navigation surface (⌘K / Ctrl+K).
 *
 * A centered neon-glass modal built on `cmdk`. Rows are the union of every
 * registry PAGE, a handful of global ACTIONS, and a last-resort "Ask Jarvis"
 * fallback that hands the raw query to the omnipresent assistant.
 *
 * Filtering is done in this component (shouldFilter={false}) so we can:
 *   • match page `aliases` as well as labels, and
 *   • run jarvisAgent.interpret() each keystroke and float any `navigate`
 *     intent to the top as the strongest hit.
 * cmdk still owns arrow-key/Enter selection over whatever rows we render.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import { COLORS as C, SHELL as S, glow } from "@/domain/colors";
import { PAGES, GROUPS } from "@/lib/pageRegistry";
import { createPageUrl } from "@/utils";
import { interpret } from "@/lib/jarvisAgent";

const APEX_BASE = "/apex";
const apexUrl = (name) => `${APEX_BASE}${createPageUrl(name)}`;
const groupColor = (id) => GROUPS.find((g) => g.id === id)?.color || C.neon;
const groupLabel = (id) => GROUPS.find((g) => g.id === id)?.label || id?.toUpperCase();

// Global actions that aren't a single page.
const ACTIONS = [
  { id: "act-underworld", label: "Go to Underworld", hint: "destination", to: "/apex/Underworld" },
  { id: "act-launcher", label: "Back to Launcher", hint: "destination", to: "/" },
];

// Lowercase haystack for a page: label + spaced name + aliases.
function pageHaystack(p) {
  return [
    p.label,
    p.name.replace(/([A-Z])/g, " $1"),
    ...(p.aliases || []),
  ].join(" ").toLowerCase();
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  // Global ⌘K / Ctrl+K toggle; Esc handled by the modal itself.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Open the palette from anywhere (e.g. the rail / top-strip affordance).
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("jarvis:open-palette", onOpen);
    return () => window.removeEventListener("jarvis:open-palette", onOpen);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const go = useCallback((to) => { close(); navigate(to); }, [close, navigate]);

  const askJarvis = useCallback((q) => {
    close();
    // Hand the query to the omnipresent assistant (JarvisAssistant listens).
    window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { query: q } }));
  }, [close]);

  // Pages addressable in the palette = APEX pages only (no underworld sim here;
  // Underworld itself is offered as an explicit action).
  const apexPages = useMemo(() => PAGES.filter((p) => p.dest !== "underworld"), []);

  // Compute the filtered result set on each keystroke.
  const { topHit, pageRows, actionRows } = useMemo(() => {
    const q = query.trim().toLowerCase();

    // jarvisAgent hint: float the navigate target to the top.
    let hint = null;
    if (q) {
      const plan = interpret(query, { pages: apexPages });
      if (plan.intent === "navigate" && plan.page) hint = plan.page.name;
    }

    const matchedPages = q
      ? apexPages.filter((p) => pageHaystack(p).includes(q))
      : apexPages;

    // Ensure the hint page is present even if its label didn't substring-match.
    let pages = matchedPages;
    if (hint && !pages.some((p) => p.name === hint)) {
      const hp = apexPages.find((p) => p.name === hint);
      if (hp) pages = [hp, ...pages];
    }

    const matchedActions = q
      ? ACTIONS.filter((a) => `${a.label} ${a.hint}`.toLowerCase().includes(q))
      : ACTIONS;

    return { topHit: hint, pageRows: pages, actionRows: matchedActions };
  }, [query, apexPages]);

  if (!open) return null;

  return (
    <>
    <style>{`
      [cmdk-item][data-selected="true"] { background: rgba(0,200,120,0.12); }
      [cmdk-item]:hover { background: rgba(0,200,120,0.06); }
      [cmdk-group-heading] { display: block; }
    `}</style>
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 20000,
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "14vh", background: "rgba(1,4,7,0.62)",
        backdropFilter: "blur(2px)",
        fontFamily: S.ui,
      }}
    >
      <Command
        shouldFilter={false}
        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); close(); } }}
        style={{
          width: "min(560px, 92vw)", maxHeight: "62vh", display: "flex", flexDirection: "column",
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${C.neon}`, borderRadius: S.radius,
          boxShadow: glow(C.neon),
          overflow: "hidden",
        }}
      >
        <div cmdk-input-wrapper="" style={{
          display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
          borderBottom: `1px solid ${S.border}`, background: "transparent",
        }}>
          <span style={{ fontFamily: S.mono, color: C.neon, fontSize: S.fs.lg, opacity: 0.8 }}>⌘</span>
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Search pages, actions, or ask Jarvis…"
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: S.textHi, fontSize: S.fs.lg, fontFamily: S.ui, letterSpacing: 0.2,
            }}
          />
          <span style={{ fontFamily: S.mono, color: S.text, fontSize: S.fs.xs, letterSpacing: 1 }}>ESC</span>
        </div>

        <Command.List style={{ overflowY: "auto", padding: 6 }}>
          <Command.Empty style={{ padding: "14px 12px", color: S.text, fontSize: S.fs.md }}>
            No matches.
          </Command.Empty>

          {pageRows.length > 0 && (
            <Command.Group heading="Pages" style={groupHeadingStyle}>
              {pageRows.map((p) => (
                <Row
                  key={p.name}
                  value={`page-${p.name}`}
                  onSelect={() => go(apexUrl(p.name))}
                  icon={p.icon}
                  label={p.label}
                  meta={groupLabel(p.group)}
                  accent={groupColor(p.group)}
                  highlight={topHit === p.name}
                />
              ))}
            </Command.Group>
          )}

          {actionRows.length > 0 && (
            <Command.Group heading="Actions" style={groupHeadingStyle}>
              {actionRows.map((a) => (
                <Row
                  key={a.id}
                  value={a.id}
                  onSelect={() => go(a.to)}
                  icon="→"
                  label={a.label}
                  meta={a.hint}
                  accent={C.blue}
                />
              ))}
            </Command.Group>
          )}

          {query.trim() && (
            <Command.Group heading="Jarvis" style={groupHeadingStyle}>
              <Row
                value="ask-jarvis"
                onSelect={() => askJarvis(query.trim())}
                icon="◆"
                label={`Ask Jarvis: ${query.trim()}`}
                meta="assistant"
                accent={C.neon}
                forceMount
              />
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
    </>
  );
}

const groupHeadingStyle = {
  fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 2, color: S.text, padding: "8px 8px 4px", fontWeight: 700,
};

function Row({ value, onSelect, icon, label, meta, accent, highlight, forceMount }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      forceMount={forceMount}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "7px 9px",
        borderRadius: S.radius, cursor: "pointer", fontFamily: S.ui, fontSize: S.fs.md, color: S.textHi,
        borderLeft: `2px solid ${highlight ? accent : "transparent"}`,
      }}
    >
      <span style={{ width: 16, textAlign: "center", color: accent, fontSize: S.fs.lg, flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {meta && <span style={{ fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1, color: accent, opacity: 0.75 }}>{meta}</span>}
    </Command.Item>
  );
}
