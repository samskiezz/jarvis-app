/**
 * WorkshopWidgets — the previously-missing Palantir Workshop widgets, implemented
 * for real: Gantt, Date/Time Picker, Comments, Media Uploader. These close the
 * feature-audit gaps so our Workshop widget set matches Palantir's, and they plug
 * into the self-building Auto Console + the holo render pipeline.
 */
import { useMemo, useRef, useState } from "react";
import { COLORS as C } from "@/domain/colors";

const card = { background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 6 };

/** GANTT — horizontal task bars across a shared time axis. */
export function Gantt({ tasks = [], accent = C.neon }) {
  const { rows, min, span } = useMemo(() => {
    const rs = tasks.map((t) => ({ ...t, s: +new Date(t.start), e: +new Date(t.end || t.start) }));
    const mn = Math.min(...rs.map((r) => r.s), Date.now());
    const mx = Math.max(...rs.map((r) => r.e), mn + 1);
    return { rows: rs, min: mn, span: Math.max(1, mx - mn) };
  }, [tasks]);
  if (!tasks.length) return <Empty label="No scheduled tasks" />;
  return (
    <div style={{ ...card, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((t, i) => {
        const left = ((t.s - min) / span) * 100;
        const w = Math.max(2, ((t.e - t.s) / span) * 100);
        const col = t.color || accent;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 110, fontSize: 9, color: C.textB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</span>
            <div style={{ flex: 1, position: "relative", height: 14, background: "rgba(255,255,255,0.04)", borderRadius: 3 }}>
              <div title={`${t.start} → ${t.end || t.start}`} style={{ position: "absolute", left: `${left}%`, width: `${w}%`, top: 2, height: 10, background: col, borderRadius: 3, boxShadow: `0 0 6px ${col}88` }} />
            </div>
            <span style={{ width: 60, fontSize: 8, color: C.text, textAlign: "right" }}>{t.status || ""}</span>
          </div>
        );
      })}
    </div>
  );
}

/** DATE/TIME PICKER — date + time selection with onChange(ISO). */
export function DateTimePicker({ value, onChange, accent = C.blue }) {
  const [v, setV] = useState(value || new Date().toISOString().slice(0, 16));
  const set = (nv) => { setV(nv); onChange?.(new Date(nv).toISOString()); };
  return (
    <div style={{ ...card, padding: 10, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 9, color: C.text, letterSpacing: 1 }}>WHEN</span>
      <input type="datetime-local" value={v} onChange={(e) => set(e.target.value)}
        style={{ flex: 1, background: "rgba(0,0,0,0.4)", border: `1px solid ${accent}55`, color: C.textB,
          borderRadius: 4, padding: "6px 8px", fontFamily: "inherit", fontSize: 11, colorScheme: "dark" }} />
    </div>
  );
}

/** COMMENTS — a working comment thread (add/list, local state). */
export function Comments({ initial = [], author = "operator", accent = C.purple }) {
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim(); if (!t) return;
    setItems((m) => [...m, { author, text: t, ts: Date.now() }]); setDraft("");
  };
  return (
    <div style={{ ...card, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {items.length === 0 && <Empty label="No comments yet" />}
        {items.map((c, i) => (
          <div key={i} style={{ borderLeft: `2px solid ${accent}`, paddingLeft: 8 }}>
            <div style={{ fontSize: 8, color: accent }}>{c.author} · {new Date(c.ts).toLocaleTimeString()}</div>
            <div style={{ fontSize: 10, color: C.textB }}>{c.text}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a comment…" style={{ flex: 1, background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`, color: C.textB, borderRadius: 4, padding: "6px 8px", fontSize: 10, fontFamily: "inherit" }} />
        <button onClick={add} style={{ background: accent + "22", border: `1px solid ${accent}55`, color: accent, borderRadius: 4, padding: "0 12px", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>POST</button>
      </div>
    </div>
  );
}

/** MEDIA UPLOADER — drag/drop or pick files; lists what was staged. */
export function MediaUploader({ onFiles, accent = C.gold }) {
  const [files, setFiles] = useState([]);
  const [over, setOver] = useState(false);
  const inp = useRef(null);
  const take = (list) => {
    const arr = Array.from(list || []).map((f) => ({ name: f.name, size: f.size, type: f.type }));
    setFiles((m) => [...m, ...arr]); onFiles?.(arr);
  };
  return (
    <div style={{ ...card, padding: 10 }}>
      <div onClick={() => inp.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
        style={{ border: `1px dashed ${over ? accent : C.border}`, borderRadius: 6, padding: 18, textAlign: "center",
          cursor: "pointer", background: over ? accent + "11" : "transparent", color: over ? accent : C.text, fontSize: 10 }}>
        ⬆ Drop files or click to upload
        <input ref={inp} type="file" multiple style={{ display: "none" }} onChange={(e) => take(e.target.files)} />
      </div>
      {files.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
          {files.map((f, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: C.textB }}>
              <span>{f.name}</span><span style={{ color: C.text }}>{(f.size / 1024).toFixed(0)} KB</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ label }) {
  return <div style={{ fontSize: 9, color: C.text, padding: 8 }}>{label}</div>;
}
