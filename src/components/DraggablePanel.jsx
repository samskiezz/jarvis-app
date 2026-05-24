import { useRef } from "react";
import { COLORS as C } from "@/domain/colors";

export default function DraggablePanel({
  id,
  title,
  children,
  state,
  onMove,
  onResize,
  onClose,
  onMinimize,
  zIndex,
  onClick,
  minimized,
}) {
  const dragRef = useRef(null);
  const resizeRef = useRef(null);

  const onMouseDown = (e) => {
    if (e.target.closest(".panel-ctrl")) return;
    onClick?.();
    const startX = e.clientX,
      startY = e.clientY;
    const startPX = state.x,
      startPY = state.y;
    const onMove_ = (ev) =>
      onMove(id, startPX + (ev.clientX - startX), startPY + (ev.clientY - startY));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove_);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove_);
    window.addEventListener("mouseup", onUp);
    e.preventDefault();
  };

  const onResizeDown = (e) => {
    const startX = e.clientX,
      startY = e.clientY;
    const startW = state.w,
      startH = state.h;
    const onM = (ev) =>
      onResize(
        id,
        Math.max(240, startW + (ev.clientX - startX)),
        Math.max(160, startH + (ev.clientY - startY)),
      );
    const onU = () => {
      window.removeEventListener("mousemove", onM);
      window.removeEventListener("mouseup", onU);
    };
    window.addEventListener("mousemove", onM);
    window.addEventListener("mouseup", onU);
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <div
      ref={dragRef}
      style={{
        position: "absolute",
        left: state.x,
        top: state.y,
        width: state.w,
        height: minimized ? 32 : state.h,
        background: "rgba(2,7,13,0.98)",
        border: `1px solid ${C.border}`,
        borderRadius: 4,
        overflow: "hidden",
        boxShadow: "0 8px 40px rgba(0,0,0,0.9), 0 0 0 1px rgba(0,200,120,0.08)",
        display: "flex",
        flexDirection: "column",
        zIndex,
        userSelect: "none",
      }}
    >
      <div
        onMouseDown={onMouseDown}
        style={{
          height: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 8px",
          borderBottom: `1px solid ${C.border}`,
          background: "rgba(0,200,120,0.03)",
          cursor: "move",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 8,
            color: C.neon,
            letterSpacing: 2,
            fontFamily: "Courier New",
            fontWeight: "bold",
          }}
        >
          {title}
        </span>
        <div className="panel-ctrl" style={{ display: "flex", gap: 4 }}>
          <button
            onClick={onMinimize}
            style={{
              background: "transparent",
              border: `1px solid ${C.borderB}`,
              color: C.gold,
              width: 16,
              height: 16,
              borderRadius: 2,
              cursor: "pointer",
              fontSize: 9,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            —
          </button>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: `1px solid ${C.borderB}`,
              color: "#556",
              width: 16,
              height: 16,
              borderRadius: 2,
              cursor: "pointer",
              fontSize: 9,
            }}
          >
            ✕
          </button>
        </div>
      </div>
      {!minimized && <div style={{ flex: 1, overflow: "hidden" }}>{children}</div>}
      {!minimized && (
        <div
          ref={resizeRef}
          onMouseDown={onResizeDown}
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            width: 14,
            height: 14,
            cursor: "se-resize",
            background:
              "linear-gradient(135deg, transparent 50%, rgba(0,200,120,0.3) 50%)",
            borderRadius: "0 0 4px 0",
          }}
        />
      )}
    </div>
  );
}
