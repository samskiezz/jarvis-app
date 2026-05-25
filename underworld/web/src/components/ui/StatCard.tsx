import type { ReactNode } from "react";
import Sparkline from "@/components/Sparkline";

interface Props {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  series?: number[];
  stroke?: string;
  fill?: string;
  accent?: "purple" | "amber" | "jade" | "sky" | "rose";
}

const ACCENT: Record<NonNullable<Props["accent"]>, { text: string; rgb: string }> = {
  purple: { text: "text-glow-purple", rgb: "168, 85, 247" },
  amber: { text: "text-glow-amber", rgb: "245, 158, 11" },
  jade: { text: "text-glow-jade", rgb: "16, 185, 129" },
  sky: { text: "text-glow-sky", rgb: "14, 165, 233" },
  rose: { text: "text-glow-rose", rgb: "244, 63, 94" },
};

export default function StatCard({
  label,
  value,
  hint,
  icon,
  series,
  stroke,
  fill,
  accent = "purple",
}: Props) {
  const a = ACCENT[accent];
  return (
    <div className="stat-card group">
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-40 transition group-hover:opacity-70"
        style={{ background: `radial-gradient(circle, rgba(${a.rgb}, 0.45), transparent 70%)` }}
      />
      <div className="stat-label">
        <span>{label}</span>
        {icon ? <span className={a.text}>{icon}</span> : null}
      </div>
      <div className={`stat-value ${a.text}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-[9px] tracking-widest text-zinc-500">{hint}</div> : null}
      {series && series.length > 0 ? (
        <div className="mt-2 -mx-1">
          <Sparkline
            values={series}
            width={220}
            height={32}
            stroke={stroke}
            fill={fill}
          />
        </div>
      ) : null}
    </div>
  );
}
