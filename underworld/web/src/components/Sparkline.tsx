interface Props {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
}

export default function Sparkline({
  values,
  width = 240,
  height = 60,
  stroke = "#a855f7",
  fill = "rgba(168,85,247,0.18)",
}: Props) {
  if (values.length === 0) {
    return (
      <div className="flex h-[60px] w-full items-center justify-center text-[9px] uppercase tracking-widest text-zinc-600">
        no data
      </div>
    );
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  const step = width / Math.max(1, values.length - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / span) * (height - 8) - 4;
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      <path d={area} fill={fill} stroke="none" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}
