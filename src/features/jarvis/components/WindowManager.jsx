import { useCallback, useState } from "react";

export default function WindowManager({ panels, renderers }) {
  const [closed, setClosed] = useState([]);
  const close = useCallback((id) => setClosed((c) => [...c, id]), []);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: 8 }}>
      {panels.filter((p) => !closed.includes(p.id)).map((p) => (
        <section key={p.id} style={{ border: "1px solid #234", minHeight: 200 }}>
          <header style={{ display: "flex", justifyContent: "space-between", color: "#9fb", padding: 6 }}>
            <span>{p.title}</span>
            <button onClick={() => close(p.id)}>x</button>
          </header>
          <div>{renderers[p.id]?.()}</div>
        </section>
      ))}
    </div>
  );
}
