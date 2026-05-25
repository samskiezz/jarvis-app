import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface Props {
  value: string;
  label?: string;
  size?: number;
}

export default function CopyButton({ value, label, size = 11 }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 rounded border border-zinc-700/60 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-zinc-400 transition hover:border-glow-purple/40 hover:text-glow-purple"
      title="Copy"
    >
      {copied ? <Check size={size} className="text-glow-jade" /> : <Copy size={size} />}
      {label ? <span>{copied ? "Copied" : label}</span> : null}
    </button>
  );
}
