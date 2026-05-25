import type { ReactNode } from "react";

interface Tab<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  count?: number;
}

interface Props<T extends string> {
  tabs: Tab<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
}

export default function Tabs<T extends string>({ tabs, active, onChange, className = "" }: Props<T>) {
  return (
    <div className={`flex border-b border-glow-purple/10 ${className}`}>
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`tab flex items-center gap-1.5 ${isActive ? "tab-active" : ""}`}
          >
            {t.icon}
            <span>{t.label}</span>
            {t.count !== undefined ? (
              <span className={`ml-1 rounded px-1 text-[9px] ${isActive ? "bg-glow-purple/20 text-glow-purple" : "bg-zinc-800 text-zinc-500"}`}>
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
