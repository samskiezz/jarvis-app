export default function EmailsPanel({ liveData }) {
  const emails = liveData?.corpus?.emails || [];
  return (
    <div style={{ padding: 8, color: "#9fb", maxHeight: 320, overflowY: "auto" }}>
      <div style={{ marginBottom: 8 }}>Email Corpus</div>
      {emails.length ? emails.map((email, i) => <div key={email.id || i} style={{ marginBottom: 6 }}><strong>{email.subject || "(no subject)"}</strong><div style={{ fontSize: 12 }}>{email.from || "unknown sender"}</div></div>) : <div>No emails loaded.</div>}
    </div>
  );
}
