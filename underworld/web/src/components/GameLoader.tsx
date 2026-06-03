import { ReactNode, useEffect, useRef, useState } from "react";
import { discoverAssets, preloadAll } from "@/lib/assetPreloader";
import * as music from "@/lib/loaderMusic";

// RuneScape-style game loader: a real progress bar that must reach 100% (every
// required asset fetched into cache) before you can enter, with looping theme
// music. The world only mounts once loading completes, so it never pops in.

const TIPS: Record<string, string> = {
  skies: "Hanging the sun, moon and stars…",
  characters: "Waking the Minions…",
  terrain: "Sculpting the land…",
  nature: "Planting forests and meadows…",
  building: "Raising homes and workshops…",
  civic: "Founding libraries and observatories…",
  interior: "Laying floors and lighting hearths…",
  furniture: "Furnishing the homes…",
  instrument: "Calibrating microscopes and forges…",
  vehicle: "Rolling out carts and engines…",
  monument: "Carving the monuments…",
  prop: "Setting out lamps and market stalls…",
  material: "Mixing pigments and materials…",
  world: "Opening a window into the Underworld…",
};

const FLAVOUR = [
  "Tip: every Minion has a hidden inner life — needs, moods, and a story.",
  "Tip: guilds discover real science; masters unlock new eras.",
  "Tip: inventions must pass safety + peer review before they count.",
  "Tip: knowledge can be lost — and rediscovered generations later.",
  "Tip: the world obeys real physics. No over-unity, no FTL.",
];

export default function GameLoader({ children }: { children: ReactNode }) {
  const [pct, setPct] = useState(0);
  const [label, setLabel] = useState("world");
  const [ready, setReady] = useState(false);
  const [entered, setEntered] = useState(false);
  const [musicOn, setMusicOn] = useState(false);
  const [flavour, setFlavour] = useState(FLAVOUR[0]);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const assets = await discoverAssets();
      await preloadAll(assets, (done, total, phase) => {
        setPct(Math.round((done / total) * 100));
        setLabel(phase);
      });
      setPct(100);
      setReady(true);
    })();
    const f = setInterval(() => setFlavour(FLAVOUR[Math.floor(Math.random() * FLAVOUR.length)]), 4500);
    return () => clearInterval(f);
  }, []);

  // Start music on the first user interaction (browsers block autoplay).
  function ensureMusic() {
    if (!musicOn) { music.start().then(() => setMusicOn(true)).catch(() => {}); }
  }
  function toggleMusic() {
    if (musicOn) { music.stop(); setMusicOn(false); }
    else { music.start().then(() => setMusicOn(true)).catch(() => {}); }
  }
  function enter() {
    ensureMusic();
    setEntered(true);
    music.stop(1200); // fade the loader theme as the world opens
  }

  if (entered) return <>{children}</>;

  return (
    <div
      onPointerDown={ensureMusic}
      className="fixed inset-0 z-[1000] flex flex-col items-center justify-center
                 bg-[#0a0a12] text-zinc-200 select-none overflow-hidden"
      style={{ backgroundImage: "radial-gradient(circle at 50% 35%, #1a1030 0%, #0a0a12 60%)" }}
    >
      <button
        onClick={toggleMusic}
        className="absolute top-4 right-5 text-xs tracking-widest text-zinc-500 hover:text-glow-amber"
        title="Toggle theme music"
      >
        {musicOn ? "♪ MUSIC ON" : "♪ MUSIC OFF"}
      </button>

      <div className="mb-2 text-3xl font-bold tracking-[0.3em] text-glow-jade drop-shadow">
        UNDERWORLD
      </div>
      <div className="mb-10 text-[11px] uppercase tracking-[0.4em] text-zinc-500">
        a living patent-minion civilisation
      </div>

      {/* progress bar */}
      <div className="w-[min(560px,80vw)]">
        <div className="mb-2 flex justify-between text-[11px] uppercase tracking-widest text-zinc-400">
          <span>{ready ? "Ready" : (TIPS[label] || "Loading…")}</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="h-4 w-full rounded-full border border-white/10 bg-black/50 p-[2px] shadow-inner">
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-out"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(90deg, #2bd4a8, #6ea8ff 60%, #b48cff)",
              boxShadow: "0 0 12px rgba(110,168,255,0.6)",
            }}
          />
        </div>
      </div>

      {/* enter gate — only at 100% (RuneScape "click to play") */}
      <div className="mt-10 h-14">
        {ready ? (
          <button
            onClick={enter}
            className="animate-pulse rounded-md border border-glow-jade/50 bg-glow-jade/15
                       px-10 py-3 text-sm font-semibold uppercase tracking-[0.3em]
                       text-glow-jade hover:bg-glow-jade/25"
          >
            ▶ Enter the Underworld
          </button>
        ) : (
          <div className="text-[11px] tracking-widest text-zinc-600">
            Loading the world — please wait…
          </div>
        )}
      </div>

      <div className="absolute bottom-8 max-w-[80vw] text-center text-[11px] text-zinc-500">
        {flavour}
      </div>
    </div>
  );
}
