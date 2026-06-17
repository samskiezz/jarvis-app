import { useEffect, useState } from "react";

interface Props {
  chatter: string[];
  className?: string;
}

export default function ChatterFeed({ chatter, className }: Props) {
  const [visible, setVisible] = useState<string[]>([]);
  useEffect(() => {
    if (!chatter || chatter.length === 0) return;
    setVisible((prev) => {
      const merged = [...chatter, ...prev];
      const seen = new Set<string>();
      const dedup: string[] = [];
      for (const c of merged) {
        if (!seen.has(c)) {
          seen.add(c);
          dedup.push(c);
        }
        if (dedup.length >= 8) break;
      }
      return dedup;
    });
  }, [chatter]);

  if (visible.length === 0) {
    return (
      <div className={className ?? "rounded-lg border border-glow-purple/20 bg-zinc-950/40 p-3"}>
        <div className="text-[10px] uppercase tracking-widest text-zinc-400">Chatter</div>
        <div className="mt-1 text-[10px] text-zinc-500">The colony is silent…</div>
      </div>
    );
  }
  return (
    <div className={className ?? "rounded-lg border border-glow-purple/20 bg-zinc-950/40 p-3"}>
      <div className="text-[10px] uppercase tracking-widest text-zinc-400">Chatter</div>
      <ul className="mt-2 space-y-1 text-[11px] leading-tight text-zinc-300">
        {visible.map((c, i) => (
          <li
            key={`${c}::${i}`}
            className="border-l-2 border-fuchsia-500/40 pl-2 italic"
            style={{ opacity: 1 - i * 0.08 }}
          >
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}
