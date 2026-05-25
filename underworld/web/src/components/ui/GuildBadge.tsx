import type { Guild } from "@/lib/types";
import {
  Activity, Atom, Battery, Cpu, FlaskConical, Hammer, Leaf,
  Scale, Shield, Sigma, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const GUILD_META: Record<Guild, { color: string; icon: LucideIcon; label: string }> = {
  maths:       { color: "text-glow-purple",        icon: Sigma,         label: "Maths" },
  physics:     { color: "text-glow-sky",           icon: Atom,          label: "Physics" },
  electrical:  { color: "text-glow-amber",         icon: Zap,           label: "Electrical" },
  mechanical:  { color: "text-zinc-300",           icon: Hammer,        label: "Mechanical" },
  civil:       { color: "text-orange-400",         icon: Hammer,        label: "Civil" },
  materials:   { color: "text-pink-400",           icon: FlaskConical,  label: "Materials" },
  computing:   { color: "text-glow-jade",          icon: Cpu,           label: "Computing" },
  energy:      { color: "text-yellow-400",         icon: Battery,       label: "Energy" },
  agriculture: { color: "text-lime-400",           icon: Leaf,          label: "Agriculture" },
  patent:      { color: "text-glow-violet",        icon: Scale,         label: "Patent" },
  safety:      { color: "text-glow-rose",          icon: Shield,        label: "Safety" },
};

interface Props {
  guild: Guild;
  size?: "xs" | "sm" | "md";
  withIcon?: boolean;
  className?: string;
}

export default function GuildBadge({ guild, size = "sm", withIcon = true, className = "" }: Props) {
  const meta = GUILD_META[guild] || { color: "text-zinc-300", icon: Activity, label: guild };
  const Icon = meta.icon;
  const sz = size === "xs" ? "text-[8px] px-1 py-px gap-0.5" : size === "md" ? "text-[10px] px-2 py-1" : "text-[9px] px-1.5 py-0.5";
  const iconSize = size === "xs" ? 8 : size === "md" ? 11 : 10;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-medium uppercase tracking-widest ${meta.color} ${sz} ${className}`}
      style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}
    >
      {withIcon ? <Icon size={iconSize} /> : null}
      <span>{meta.label}</span>
    </span>
  );
}
