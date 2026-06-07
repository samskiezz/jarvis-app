import { COLORS as C } from "@/domain/colors";

const row = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 4,
  marginBottom: 10,
};

const label = {
  fontSize: 8,
  color: C.text,
  letterSpacing: 1.2,
  textTransform: "uppercase" as const,
};

const input = {
  background: "rgba(0,0,0,0.3)",
  border: `1px solid ${C.border}`,
  color: C.textB,
  borderRadius: 4,
  padding: "5px 8px",
  fontSize: 10,
  fontFamily: "inherit",
};

export default function PropertyPanel({
  widget,
  onChange,
}: {
  widget: any;
  onChange: (cfg: any) => void;
}) {
  if (!widget) {
    return (
      <div
        style={{
          width: 220,
          borderLeft: `1px solid ${C.border}`,
          background: "rgba(4,10,16,0.85)",
          padding: 14,
          color: C.text,
          fontSize: 10,
        }}
      >
        Select a widget to configure its properties.
      </div>
    );
  }

  const cfg = widget.config || {};
  const set = (key: string, val: any) => {
    onChange({ ...cfg, [key]: val });
  };

  return (
    <div
      style={{
        width: 220,
        borderLeft: `1px solid ${C.border}`,
        background: "rgba(4,10,16,0.85)",
        padding: 14,
        overflowY: "auto",
      }}
    >
      <div style={{ fontSize: 9, color: C.text, letterSpacing: 2, marginBottom: 10 }}>
        PROPERTIES
      </div>

      <div style={row}>
        <span style={label}>Title</span>
        <input value={cfg.title || ""} onChange={(e) => set("title", e.target.value)} style={input} />
      </div>

      <div style={row}>
        <span style={label}>Data Source</span>
        <input
          value={cfg.dataSource || ""}
          onChange={(e) => set("dataSource", e.target.value)}
          style={input}
          placeholder="/v1/ontology/objects"
        />
      </div>

      <div style={row}>
        <span style={label}>Field</span>
        <input value={cfg.field || ""} onChange={(e) => set("field", e.target.value)} style={input} />
      </div>

      <div style={row}>
        <span style={label}>Chart Type</span>
        <select
          value={cfg.chartType || "line"}
          onChange={(e) => set("chartType", e.target.value)}
          style={input}
        >
          <option value="line">line</option>
          <option value="bar">bar</option>
          <option value="scatter">scatter</option>
        </select>
      </div>

      <div style={row}>
        <span style={label}>Series ID</span>
        <input value={cfg.seriesId || ""} onChange={(e) => set("seriesId", e.target.value)} style={input} />
      </div>

      <div style={row}>
        <span style={label}>Grid Width (1-12)</span>
        <input
          type="number"
          min={1}
          max={12}
          value={cfg.grid?.w || 4}
          onChange={(e) => set("grid", { ...(cfg.grid || {}), w: Number(e.target.value) })}
          style={input}
        />
      </div>

      <div style={row}>
        <span style={label}>Filters (JSON)</span>
        <textarea
          value={JSON.stringify(cfg.filters || {}, null, 2)}
          onChange={(e) => {
            try {
              set("filters", JSON.parse(e.target.value));
            } catch {}
          }}
          style={{ ...input, minHeight: 60, resize: "vertical" as const }}
        />
      </div>

      <div style={row}>
        <span style={label}>Bindings (JSON)</span>
        <textarea
          value={JSON.stringify(cfg.bindings || {}, null, 2)}
          onChange={(e) => {
            try {
              set("bindings", JSON.parse(e.target.value));
            } catch {}
          }}
          style={{ ...input, minHeight: 60, resize: "vertical" as const }}
        />
      </div>
    </div>
  );
}
