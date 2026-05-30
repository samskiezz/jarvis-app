/**
 * Panel registry — single source of truth for which panels exist, their default
 * layout, sidebar icon/label, and titles. JarvisTerminal iterates this list to
 * build the sidebar, default panel state, and the workspace.
 *
 * To add a new panel:
 *   1. Add an entry here.
 *   2. Render it inside JarvisTerminal's workspace switch (or — once the panels
 *      themselves are extracted — return a component reference from this file).
 */

export const PANELS = [
  { id: "MAP",        icon: "🌍", label: "GLOBE",    title: "🌍 GLOBE / MAP",          defaultVisible: true,  defaultCol: 0, defaultRow: 0, h: 400 },
  { id: "VERTEX",     icon: "◈",  label: "VERTEX",   title: "◈ VERTEX GRAPH",          defaultVisible: true,  defaultCol: 1, defaultRow: 0, h: 400 },
  { id: "RISK",       icon: "⚠",  label: "RISK",     title: "⚠ RISK SIGNALS",          defaultVisible: true,  defaultCol: 2, defaultRow: 0, h: 400 },
  { id: "EXPLORER",   icon: "⊞",  label: "OBJECTS",  title: "⊞ OBJECT EXPLORER",       defaultVisible: true,  defaultCol: 0, defaultRow: 1, h: 370 },
  { id: "TIMELINE",   icon: "◷",  label: "TIMELINE", title: "◷ TIMELINE",              defaultVisible: true,  defaultCol: 1, defaultRow: 1, h: 370 },
  { id: "MARKETS",    icon: "$",  label: "MARKETS",  title: "$ MARKETS",               defaultVisible: true,  defaultCol: 2, defaultRow: 1, h: 370 },
  { id: "EMAILS",     icon: "✉",  label: "EMAILS",   title: "✉ EMAIL CORPUS",          defaultVisible: true,  defaultCol: 0, defaultRow: 2, h: 350 },
  { id: "WATCHLIST",  icon: "◉",  label: "WATCH",    title: "◉ WATCHLIST",             defaultVisible: true,  defaultCol: 1, defaultRow: 2, h: 350 },
  { id: "ANALYST",    icon: "◎",  label: "ANALYST",  title: "◎ AI ANALYST",            defaultVisible: true,  defaultCol: 2, defaultRow: 2, h: 350 },
  { id: "PANOPTICON", icon: "⌬",  label: "PANO",     title: "⌬ PANOPTICON LIVE",       defaultVisible: true,  defaultCol: 0, defaultRow: 3, h: 300 },
  { id: "CS3D",       icon: "🎯", label: "CS3D",     title: "🎯 COUNTERSTRIKE 3D LIVE",defaultVisible: true,  defaultCol: 1, defaultRow: 3, h: 300 },
];

const ROW_Y = [50, 455, 830, 1185];

/**
 * Build the default panel-state map for a given viewport width.
 * Layout uses 3 equal-width columns with a wider left column.
 */
export function buildDefaultPanelState(viewportWidth) {
  const cols = [
    { x: 0, w: Math.floor(viewportWidth * 0.43) },
    { x: Math.floor(viewportWidth * 0.44), w: Math.floor(viewportWidth * 0.27) },
    { x: Math.floor(viewportWidth * 0.72), w: Math.floor(viewportWidth * 0.27) },
  ];
  const state = {};
  PANELS.forEach((p) => {
    const col = cols[p.defaultCol] || cols[0];
    state[p.id] = {
      x: col.x,
      y: ROW_Y[p.defaultRow] ?? 50,
      w: col.w,
      h: p.h,
      visible: p.defaultVisible,
      minimized: false,
      z: 10,
    };
  });
  return state;
}
