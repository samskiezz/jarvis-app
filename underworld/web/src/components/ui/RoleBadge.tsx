import type { SwarmRole } from "@/lib/types";
import {
  Beaker, BookOpen, Cpu, Dna, FlaskConical, Microscope,
  ScrollText, ShieldAlert, Sigma, Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const ROLE_META: Record<SwarmRole, { color: string; icon: LucideIcon; label: string }> = {
  literature_scout:      { color: "text-glow-sky",    icon: BookOpen,       label: "Literature Scout" },
  genome_analyst:        { color: "text-glow-jade",   icon: Dna,            label: "Genome Analyst" },
  protein_modeller:      { color: "text-glow-purple", icon: Microscope, label: "Protein Modeller" },
  chemistry_generator:   { color: "text-pink-400",    icon: Beaker,         label: "Chemistry Generator" },
  toxicity_checker:      { color: "text-glow-rose",   icon: ShieldAlert,    label: "Toxicity Checker" },
  trial_simulator:       { color: "text-glow-amber",  icon: Cpu,            label: "Trial Simulator" },
  regulatory_reasoner:   { color: "text-glow-violet", icon: ScrollText,     label: "Regulatory Reasoner" },
  experimental_designer: { color: "text-glow-sky",    icon: FlaskConical,   label: "Experimental Designer" },
  formula_oracle:        { color: "text-glow-amber",  icon: Sigma,          label: "Formula Oracle" },
  generalist:            { color: "text-zinc-400",    icon: Sparkles,       label: "Generalist" },
};

interface Props {
  role: SwarmRole;
  size?: "xs" | "sm" | "md";
  withIcon?: boolean;
  withLabel?: boolean;
  className?: string;
}

export default function RoleBadge({
  role, size = "sm", withIcon = true, withLabel = true, className = "",
}: Props) {
  const meta = ROLE_META[role];
  const Icon = meta.icon;
  const sz =
    size === "xs" ? "text-[8px] px-1 py-px gap-0.5"
    : size === "md" ? "text-[10px] px-2 py-1"
    : "text-[9px] px-1.5 py-0.5";
  const iconSize = size === "xs" ? 8 : size === "md" ? 11 : 10;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-medium uppercase tracking-widest ${meta.color} ${sz} ${className}`}
      style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}
      title={meta.label}
    >
      {withIcon ? <Icon size={iconSize} /> : null}
      {withLabel ? <span>{meta.label}</span> : null}
    </span>
  );
}
