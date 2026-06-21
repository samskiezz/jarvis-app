/**
 * ContactsDirectory — F24 Contacts panel.
 * Sources from /entities/Contact — searchable people list.
 * "JARVIS, contacts" opens the panel and speaks a brief.
 * Additive only — mounted via App.jsx; intent exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GLD = "#FFD700";
const GRN = "#00E5A0";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CONTACT_RE = /\bcontact|people|person|directory|colleague|team.member|staff|personnel|who is\b/i;

async function fetchContacts() {
  const r = await fetch(`${apiBase()}/entities/Contact`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)                  ? d
    : Array.isArray(d?.data)               ? d.data
    : Array.isArray(d?.items)              ? d.items
    : Array.isArray(d?.contacts)           ? d.contacts
    : Array.isArray(d?.results)            ? d.results
    : Array.isArray(d?.people)             ? d.people
    : [];
}

export function isContactsQuery(text) {
  return CONTACT_RE.test(text || "");
}

export async function buildContactsScript() {
  let contacts = [];
  try { contacts = await fetchContacts(); } catch (_) {}

  if (!contacts.length) return "No contacts found in the directory, sir.";

  const total = contacts.length;
  const sample = contacts
    .slice(0, 3)
    .map(c => c.name || c.full_name || c.display_name || c.first_name || "Unknown")
    .join(", ");

  return (
    `Directory contains ${total} contact${total !== 1 ? "s" : ""}. ` +
    (sample ? `Including ${sample}.` : "")
  ).trim();
}

function getInitials(contact) {
  const name = contact.name || contact.full_name || contact.display_name || "";
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function avatarColor(name = "") {
  const colors = [CY, GLD, GRN, "#FF6B9D", "#A78BFA", "#FB923C", "#34D399"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default function ContactsDirectory() {
  const [open,    setOpen]    = useState(false);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter,  setFilter]  = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const arr = await fetchContacts();
      setContacts(arr);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 300_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (CONTACT_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const visible = filter.trim()
    ? contacts.filter(c => {
        const hay = [
          c.name, c.full_name, c.display_name, c.first_name, c.last_name,
          c.email, c.role, c.title, c.department, c.organization, c.company,
          c.phone, c.location, c.tags,
        ].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(filter.toLowerCase());
      })
    : contacts;

  return (
    <>
      {/* Toggle button — bottom-left strip at left:1220 */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Contacts Directory"
        style={{
          position: "fixed", left: 1220, bottom: 18, zIndex: 68,
          background: open ? CY + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${CY}55`,
          borderRadius: 8,
          color: open ? "#04060A" : CY,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${CY}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        CONTACTS
        {contacts.length > 0 && (
          <span style={{
            background: CY + "44", color: CY,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {contacts.length}
          </span>
        )}
      </button>

      {/* Contacts panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(480px,94vw)", maxHeight: "min(600px,78vh)",
          background: "rgba(4,8,14,0.94)",
          border: `1px solid ${CY}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%", background: CY,
              boxShadow: `0 0 10px ${CY}`, display: "inline-block",
              animation: loading ? "ctpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: CY, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              CONTACTS DIRECTORY
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {loading ? "SYNCING" : `${contacts.length} TOTAL`}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Filter */}
          <div style={{ padding: "6px 12px", borderBottom: `1px solid ${CY}18` }}>
            <input
              type="text"
              placeholder="search name, role, email, department…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                background: `rgba(41,231,255,0.06)`, border: `1px solid ${CY}33`,
                borderRadius: 5, color: "#DCEBF5", fontSize: 10,
                padding: "5px 9px", fontFamily: "'JetBrains Mono',monospace",
                outline: "none", letterSpacing: 0.5,
              }}
            />
          </div>

          {/* Contact cards */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: "24px 14px", color: "#566878", fontSize: 10, textAlign: "center" }}>
                {contacts.length === 0 ? "No contacts in directory." : "No matches."}
              </div>
            )}
            {visible.map((c, i) => {
              const name  = c.name || c.full_name || c.display_name ||
                            [c.first_name, c.last_name].filter(Boolean).join(" ") ||
                            `Contact ${i + 1}`;
              const role  = c.role || c.title || c.position || c.job_title || "";
              const dept  = c.department || c.organization || c.company || c.team || "";
              const email = c.email || c.email_address || "";
              const phone = c.phone || c.phone_number || c.mobile || "";
              const loc   = c.location || c.city || c.office || "";
              const tags  = Array.isArray(c.tags) ? c.tags : c.tags ? [c.tags] : [];
              const color = avatarColor(name);
              const initials = getInitials(c);

              return (
                <div key={c.id || c.contact_id || i} style={{
                  margin: "6px 10px",
                  background: "rgba(41,231,255,0.04)",
                  border: `1px solid ${CY}1a`,
                  borderRadius: 8, padding: "9px 12px",
                  display: "flex", gap: 10, alignItems: "flex-start",
                }}>
                  {/* Avatar circle */}
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                    background: color + "22", border: `2px solid ${color}44`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700, color: color, letterSpacing: 0.5,
                  }}>
                    {initials}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Name row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 11, color: "#DCEBF5", fontWeight: 700, letterSpacing: 0.3 }}>
                        {name}
                      </span>
                      {c.status && (
                        <span style={{
                          fontSize: 8, color: c.status === "active" ? GRN : "#566878",
                          background: (c.status === "active" ? GRN : "#566878") + "22",
                          border: `1px solid ${c.status === "active" ? GRN : "#566878"}44`,
                          borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                          fontWeight: 700, textTransform: "uppercase", flexShrink: 0,
                        }}>
                          {c.status}
                        </span>
                      )}
                    </div>

                    {/* Role + dept */}
                    {(role || dept) && (
                      <div style={{ fontSize: 9, color: CY + "bb", marginBottom: 3, letterSpacing: 0.5 }}>
                        {role}{role && dept ? " · " : ""}{dept}
                      </div>
                    )}

                    {/* Contact details */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 10px" }}>
                      {email && (
                        <span style={{ fontSize: 9, color: "#8ba3b8", letterSpacing: 0.3 }}>
                          ✉ {email}
                        </span>
                      )}
                      {phone && (
                        <span style={{ fontSize: 9, color: "#8ba3b8", letterSpacing: 0.3 }}>
                          ☏ {phone}
                        </span>
                      )}
                      {loc && (
                        <span style={{ fontSize: 9, color: "#8ba3b8", letterSpacing: 0.3 }}>
                          ⌖ {loc}
                        </span>
                      )}
                    </div>

                    {/* Tags */}
                    {tags.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                        {tags.slice(0, 4).map((tag, ti) => (
                          <span key={ti} style={{
                            fontSize: 8, color: GLD + "cc",
                            background: GLD + "18", border: `1px solid ${GLD}33`,
                            borderRadius: 3, padding: "1px 5px", letterSpacing: 0.5,
                          }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes ctpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
