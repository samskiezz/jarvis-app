import { useMemo } from "react";

interface Props {
  grid: number[][];
  size?: number;
}

const PALETTE = [
  // dark → light, with a purple cast
  "#050510",
  "#0d0d24",
  "#161636",
  "#202054",
  "#2c2c76",
  "#3a3a99",
  "#4f4fbf",
  "#7d6fe0",
  "#a98aff",
  "#dccaff",
];

export default function Heightmap({ grid, size = 320 }: Props) {
  const cells = grid.length;
  const cell = useMemo(() => Math.max(2, Math.floor(size / Math.max(1, cells))), [cells, size]);

  return (
    <div
      className="grid rounded-sm border border-glow-purple/10"
      style={{
        gridTemplateColumns: `repeat(${cells}, ${cell}px)`,
        gridTemplateRows: `repeat(${cells}, ${cell}px)`,
        width: cells * cell,
        height: cells * cell,
      }}
    >
      {grid.flatMap((row, y) =>
        row.map((v, x) => {
          const idx = Math.max(0, Math.min(PALETTE.length - 1, Math.floor(v * PALETTE.length)));
          return (
            <div
              key={`${x}-${y}`}
              style={{ background: PALETTE[idx] }}
              title={`(${x},${y}) ${v.toFixed(2)}`}
            />
          );
        }),
      )}
    </div>
  );
}
