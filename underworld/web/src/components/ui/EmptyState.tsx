import type { ReactNode } from "react";

interface Props {
  icon?: ReactNode;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}

export default function EmptyState({ icon, title, hint, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-glow-purple/20 bg-glow-purple/5 text-glow-purple/60">
          {icon}
        </div>
      ) : null}
      <div className="text-[12px] tracking-wide text-zinc-300">{title}</div>
      {hint ? <div className="max-w-xs text-[10px] text-zinc-500">{hint}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
