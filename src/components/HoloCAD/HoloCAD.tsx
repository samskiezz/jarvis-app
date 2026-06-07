import { useState, useCallback } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";
import MoleculeView from "./MoleculeView";
import TrajectoryView from "./TrajectoryView";
import { getElementColor } from "./MoleculeView";

const GLASS = {
  background: S.glass,
  backdropFilter: S.blur,
  WebkitBackdropFilter: S.blur,
  border: `1px solid ${S.border}`,
  boxShadow: "0 8px 30px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(173,193,205,0.06), inset 0 0 24px rgba(0,0,0,0.25)",
};

interface HoloCADProps {
  data?: {
    type: "molecule" | "trajectory" | "satellite" | "orbital";
    points: any[];
    bonds?: any[];
    meta?: Record<string, any>;
  } | null;
  autoRotate?: boolean;
  title?: string;
}

export default function HoloCAD({ data, autoRotate = true, title = "HoloCAD Viewer" }: HoloCADProps) {
  const [isAutoRotate, setIsAutoRotate] = useState(autoRotate);
  const [showInfo, setShowInfo] = useState(true);
  const [showLegend, setShowLegend] = useState(true);

  const toggleAutoRotate = useCallback(() => setIsAutoRotate((p) => !p), []);

  const emptyState = (
    <div style={{
      ...GLASS, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: 320, flexDirection: "column", gap: 12,
    }}>
      <span style={{ fontSize: 32, opacity: 0.6 }}>🔭</span>
      <div style={{ color: C.textB, fontSize: 12, letterSpacing: 2 }}>Load scientific data to visualize</div>
      <div style={{ color: C.text, fontSize: 9, maxWidth: 320, textAlign: "center" }}>
        Feed molecular structures, trajectory waypoints, satellite paths, or orbital parameters.
      </div>
    </div>
  );

  if (!data || !data.points || data.points.length === 0) {
    return emptyState;
  }

  const btnStyle: React.CSSProperties = {
    background: "rgba(0,200,120,0.1)",
    border: `1px solid ${C.neon}44`,
    color: C.neon,
    borderRadius: 4,
    padding: "4px 10px",
    fontSize: 9,
    letterSpacing: 1,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  const renderViewport = () => {
    switch (data.type) {
      case "molecule":
        return <MoleculeView data={{ points: data.points, bonds: data.bonds }} autoRotate={isAutoRotate} />;
      case "trajectory":
      case "satellite":
      case "orbital":
        return <TrajectoryView data={{ points: data.points }} autoRotate={isAutoRotate} />;
      default:
        return emptyState;
    }
  };

  const metaEntries = data.meta ? Object.entries(data.meta) : [];
  const elements = data.type === "molecule"
    ? Array.from(new Set(data.points.map((p: any) => p.element || "C")))
    : [];

  return (
    <div style={{ position: "relative", width: "100%", minHeight: 420, borderRadius: 8, overflow: "hidden" }}>
      {/* 3D Viewport */}
      <div style={{ position: "relative", width: "100%", height: 480 }}>
        {renderViewport()}
      </div>

      {/* Top overlay controls */}
      <div style={{
        position: "absolute", top: 10, left: 10, right: 10, display: "flex", justifyContent: "space-between",
        pointerEvents: "none",
      }}>
        <div style={{ ...GLASS, borderRadius: 6, padding: "8px 12px", pointerEvents: "auto" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: C.neon, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 8, color: C.text, marginTop: 2 }}>
            TYPE: {data.type.toUpperCase()} · POINTS: {data.points.length}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, pointerEvents: "auto" }}>
          <button onClick={toggleAutoRotate} style={btnStyle}>{isAutoRotate ? "⏸" : "▶"} AUTO</button>
          <button onClick={() => setShowInfo((p) => !p)} style={btnStyle}>ℹ INFO</button>
          <button onClick={() => setShowLegend((p) => !p)} style={btnStyle}>◈ LEGEND</button>
        </div>
      </div>

      {/* Info panel */}
      {showInfo && metaEntries.length > 0 && (
        <div style={{ position: "absolute", bottom: 10, left: 10, ...GLASS, borderRadius: 6, padding: 10, maxWidth: 240, pointerEvents: "auto" }}>
          <div style={{ fontSize: 9, letterSpacing: 1.5, color: C.neon, marginBottom: 6 }}>METADATA</div>
          {metaEntries.map(([k, v]) => (
            <div key={k} style={{ fontSize: 8, color: C.textB, marginBottom: 3, display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ color: C.text }}>{k}</span>
              <span>{String(v).slice(0, 40)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Legend for molecules */}
      {showLegend && data.type === "molecule" && (
        <div style={{ position: "absolute", bottom: 10, right: 10, ...GLASS, borderRadius: 6, padding: 10, pointerEvents: "auto" }}>
          <div style={{ fontSize: 9, letterSpacing: 1.5, color: C.neon, marginBottom: 6 }}>ELEMENTS</div>
          {elements.map((el) => (
            <div key={el} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: getElementColor(el), display: "inline-block" }} />
              <span style={{ fontSize: 8, color: C.textB }}>{el}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
