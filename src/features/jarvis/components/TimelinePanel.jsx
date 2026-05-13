export default function TimelinePanel({ liveData }) {
  const events = liveData?.corpus?.timeline || [];
  return <div style={{ padding: 8, color: "#9fb" }}>{events.length} timeline events loaded</div>;
}
