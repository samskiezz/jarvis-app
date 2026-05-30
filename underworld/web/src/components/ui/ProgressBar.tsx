interface Props {
  value: number;        // 0..1
  label?: string;
  hint?: string;
  variant?: "purple" | "jade" | "amber" | "rose" | "sky" | "auto";
  size?: "sm" | "md";
}

const VARIANTS = {
  purple: "from-glow-purple to-glow-violet",
  jade: "from-glow-jade to-glow-teal",
  amber: "from-glow-amber to-orange-500",
  rose: "from-glow-rose to-pink-500",
  sky: "from-glow-sky to-blue-500",
} as const;

export default function ProgressBar({ value, label, hint, variant = "auto", size = "md" }: Props) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const v: keyof typeof VARIANTS =
    variant !== "auto" ? variant : value < 0.25 ? "rose" : value < 0.5 ? "amber" : value < 0.75 ? "sky" : "jade";
  return (
    <div>
      {label || hint ? (
        <div className="flex justify-between text-[9px] uppercase tracking-widest text-zinc-500">
          {label ? <span>{label}</span> : <span />}
          {hint ? <span className="text-zinc-300">{hint}</span> : null}
        </div>
      ) : null}
      <div
        className={`mt-0.5 overflow-hidden rounded-full bg-ink-3/80 ${size === "sm" ? "h-1" : "h-1.5"}`}
      >
        <div
          className={`h-full rounded-full bg-gradient-to-r ${VARIANTS[v]} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
