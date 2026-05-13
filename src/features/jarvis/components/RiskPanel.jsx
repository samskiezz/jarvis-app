import { RISK_SIGNALS } from "../data/intel";

export default function RiskPanel({ onFocus }) {
  return (
    <div style={{ padding: 8, overflowY: "auto", height: "100%" }}>
      {RISK_SIGNALS.map((r) => (
        <button key={r.id} onClick={() => onFocus?.(r.linked)} style={{ display: "block", width: "100%", marginBottom: 4 }}>
          {r.severity} · {r.title}
        </button>
      ))}
    </div>
  );
}
