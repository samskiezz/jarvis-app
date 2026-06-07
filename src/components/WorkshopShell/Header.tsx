import { COLORS as C } from "@/domain/colors";

const btn = {
  fontSize: 10,
  letterSpacing: 1,
  padding: "6px 12px",
  borderRadius: 4,
  cursor: "pointer",
  border: `1px solid ${C.border}`,
  background: "rgba(0,0,0,0.3)",
  color: C.textB,
  fontFamily: "inherit",
};

export default function Header({
  title,
  onTitleChange,
  onSave,
  onLoad,
  previewMode,
  onTogglePreview,
}: {
  title: string;
  onTitleChange: (v: string) => void;
  onSave: () => void;
  onLoad: () => void;
  previewMode: boolean;
  onTogglePreview: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderBottom: `1px solid ${C.border}`,
        background: "rgba(4,10,16,0.85)",
        backdropFilter: "blur(8px)",
      }}
    >
      <span style={{ fontSize: 12, color: C.neon, fontWeight: 700, letterSpacing: 2 }}>
        WORKSHOP
      </span>
      <input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        style={{
          flex: 1,
          background: "rgba(0,0,0,0.3)",
          border: `1px solid ${C.border}`,
          color: C.textB,
          borderRadius: 4,
          padding: "5px 10px",
          fontSize: 11,
          fontFamily: "inherit",
        }}
      />
      <button onClick={onSave} style={btn}>
        SAVE
      </button>
      <button onClick={onLoad} style={btn}>
        LOAD
      </button>
      <button
        onClick={onTogglePreview}
        style={{
          ...btn,
          borderColor: previewMode ? C.neon : C.border,
          color: previewMode ? C.neon : C.textB,
        }}
      >
        {previewMode ? "EDIT" : "PREVIEW"}
      </button>
    </div>
  );
}
