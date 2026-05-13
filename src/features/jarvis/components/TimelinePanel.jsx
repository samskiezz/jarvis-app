export default function TimelinePanel({ liveData }) {
  const events = liveData?.corpus?.timeline || [];

  if (!events.length) {
    return <div style={{ padding: 8, color: "#9fb" }}>No timeline events available.</div>;
  }

  return (
    <div style={{ padding: 8, color: "#9fb", maxHeight: 320, overflowY: "auto" }}>
      <div style={{ marginBottom: 8 }}>{events.length} timeline events loaded</div>
      {events.map((event, index) => (
        <article key={event.id || `${event.ts || "evt"}-${index}`} style={{ border: "1px solid #234", padding: 8, marginBottom: 6, background: "#020b12" }}>
          <div style={{ fontWeight: 700 }}>{event.title || event.event || "Untitled event"}</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{event.category || event.type || "UNCATEGORIZED"} · {event.ts || event.time || "Unknown time"}</div>
          {event.detail || event.description ? <div style={{ marginTop: 4, fontSize: 13 }}>{event.detail || event.description}</div> : null}
        </article>
      ))}
    </div>
  );
}
