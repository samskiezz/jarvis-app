import { useMemo } from "react";

interface Props {
  seed: string;
  size?: number;
  alive?: boolean;
}

/**
 * Deterministic procedural avatar: a hexagonal portrait derived from the
 * Minion's id / name. Same input always yields the same shape & hue.
 */
export default function Avatar({ seed, size = 28, alive = true }: Props) {
  const { hue, sat, hatched, eyeY } = useMemo(() => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return {
      hue: h % 360,
      sat: 55 + (h % 30),
      hatched: (h >> 4) % 4,
      eyeY: 14 + ((h >> 8) % 4),
    };
  }, [seed]);

  const color = alive ? `hsl(${hue}, ${sat}%, 60%)` : "hsl(0, 0%, 30%)";
  const dark = alive ? `hsl(${hue}, ${sat}%, 18%)` : "hsl(0, 0%, 8%)";

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className="block">
      <defs>
        <linearGradient id={`g-${seed.slice(-6)}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor={dark} />
        </linearGradient>
      </defs>
      {/* hex */}
      <polygon
        points="16,2 28,9 28,23 16,30 4,23 4,9"
        fill={`url(#g-${seed.slice(-6)})`}
        stroke={alive ? `hsl(${hue}, ${sat}%, 75%)` : "#3f3f46"}
        strokeWidth="0.8"
      />
      {/* eye marker */}
      <circle cx="16" cy={eyeY} r="2.4" fill={dark} />
      <circle cx="16" cy={eyeY} r="1.2" fill="#fff" opacity={alive ? 0.9 : 0.3} />
      {/* hatch pattern bottom */}
      {hatched === 0 ? <path d="M8 22 L24 22" stroke={dark} strokeWidth="0.7" /> : null}
      {hatched === 1 ? <path d="M10 21 L22 23" stroke={dark} strokeWidth="0.7" /> : null}
      {hatched === 2 ? <path d="M12 22 L20 22 M16 20 L16 24" stroke={dark} strokeWidth="0.7" /> : null}
      {hatched === 3 ? <path d="M9 23 L23 21" stroke={dark} strokeWidth="0.7" /> : null}
    </svg>
  );
}
