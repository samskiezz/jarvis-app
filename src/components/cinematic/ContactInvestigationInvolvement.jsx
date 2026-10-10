/**
 * ContactInvestigationInvolvement — F70
 * /entities/Contact × /v1/investigations → keyword-correlates contacts against open
 * investigations to surface INVOLVED vs CLEAR contacts.
 * Voice: "contact investigation"/"cinv"/"who is involved"/"contact cases"/"involved contacts".
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const GRN = "#4ADE80";
const AMB = "#FFBB33";
const RED = "#FF4455";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CINV_RE =
  /\bcontact\s*invest(?:igation)?\b|\bcinv\b|\bwho\s+is\s+involved\b|\bcontact\s+cases?\b|\binvolved\s+contacts?\b|\bcontact\s+inquiry\b|\bpeople\s+(?:in\s+)?invest(?:igation)?\b|\binvestigation\s+contacts?\b|\bcase\s+contacts?\b/i;

export function isCinvQuery(text) {
  return CINV_RE.test(text || "");
}

async function fetchContacts() {
  const r = await fetch(`${apiBase()}/entities/Contact`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)           ? d
    : Array.isArray(d?.data)        ? d.data
    : Array.isArray(d?.results)     ? d.results
    : Array.isArray(d?.contacts)    ? d.contacts
    : Array.isArray(d?.items)       ? d.items
    : [];
}

async function fetchInvestigations() {
  const r = await fetch(`${apiBase()}/v1/investigations`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)                  ? d
    : Array.isArray(d?.data)               ? d.data
    : Array.isArray(d?.results)            ? d.results
    : Array.isArray(d?.investigations)     ? d.investigations
    : Array.isArray(d?.items)              ? d.items
    : [];
}

function contactKeywords(c) {
  return [
    c?.name, c?.full_name, c?.alias, c?.email,
    c?.role, c?.title, c?.organisation, c?.organization,
    c?.department, c?.tags?.join?.(" "), c?.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function investigationKeywords(inv) {
  return [
    inv?.title, inv?.name, inv?.description, inv?.summary,
    inv?.case_type, inv?.type, inv?.category,
    inv?.tags?.join?.(" "), inv?.details, inv?.owner,
    inv?.assigned_to, inv?.subject,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function correlate(contact, investigations) {
  const cKw    = contactKeywords(contact);
  const tokens = cKw.split(/\W+/).filter((t) => t.length > 3);
  const matched = investigations.filter((inv) => {
    const iKw     = investigationKeywords(inv);
    const iTokens = iKw.split(/\W+/).filter((t) => t.length > 3);
    return tokens.some((t) => iKw.includes(t)) || iTokens.some((t) => cKw.includes(t));
  });
  const status = matched.length > 0 ? "INVOLVED" : "CLEAR";
  return { matched, status };
}

function contactLabel(c) {
  return c?.name || c?.full_name || c?.alias || c?.email || "Unknown Contact";
}

function investigationLabel(inv) {
  return inv?.title || inv?.name || inv?.case_type || "Unnamed Investigation";
}

export async function buildCinvScript() {
  const [contacts, investigations] = await Promise.all([
    fetchContacts(),
    fetchInvestigations(),
  ]);
  if (!contacts.length) return "Contact investigation involvement data is unavailable, sir.";
  const rows     = contacts.map((c) => ({ c, ...correlate(c, investigations) }));
  const involved = rows.filter((r) => r.status === "INVOLVED");
  const clear    = rows.filter((r) => r.status === "CLEAR");
  const invNames = involved.slice(0, 3).map((r) => contactLabel(r.c)).join(", ");
  return (
    `Contact Investigation Involvement: ${contacts.length} contacts assessed against ${investigations.length} open investigations. ` +
    `${involved.length} INVOLVED, ${clear.length} CLEAR. ` +
    (involved.length
      ? `Key involved contacts: ${invNames}.`
      : "No contacts currently correlate with active investigations, sir.")
  );
}

export default function ContactInvestigationInvolvement() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [filter, setFilter]       = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [loading, setLoading]     = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [contacts, investigations] = await Promise.all([
        fetchContacts(),
        fetchInvestigations(),
      ]);
      const built = contacts.map((c) => ({ c, ...correlate(c, investigations) }));
      setRows(built);
    } catch {
      // keep stale
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen((v) => { if (!v) refresh(); return !v; });
    window.addEventListener("jarvis:cinv-toggle", toggle);
    return () => window.removeEventListener("jarvis:cinv-toggle", toggle);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(refresh, 90_000);
    return () => clearInterval(id);
  }, [open, refresh]);

  const involved = rows.filter((r) => r.status === "INVOLVED");
  const clear    = rows.filter((r) => r.status === "CLEAR");

  const visible = rows.filter((r) => {
    if (filter === "INVOLVED" && r.status !== "INVOLVED") return false;
    if (filter === "CLEAR"    && r.status !== "CLEAR")    return false;
    if (search) {
      const label = contactLabel(r.c).toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  async function assess(row) {
    const label = contactLabel(row.c);
    setAssessing(label);
    const invNames = row.matched.map((i) => investigationLabel(i)).join(", ") || "none";
    const prompt =
      `Contact "${label}" is ${row.status} in active investigations. ` +
      (row.matched.length
        ? `Matching investigations: ${invNames}.`
        : "This contact has no correlation with current open investigations.") +
      " Provide a 2-sentence involvement assessment and recommended next intelligence action.";
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const brief = d?.response || d?.message || d?.content || "Assessment complete.";
      const voice = getActiveVoice?.() ?? "ash";
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: brief, voice }),
      });
    } catch {
      // ignore TTS errors
    }
    setAssessing(null);
  }

  if (!open) {
    const involvedCount = involved.length;
    return (
      <button
        onClick={() => { setOpen(true); refresh(); }}
        title="Contacts × Investigations (F70)"
        style={{
          position: "fixed", left: 18520, bottom: 8, zIndex: 75,
          background: "rgba(5,8,13,0.72)", border: `1px solid ${involvedCount > 0 ? AMB : CY}55`,
          borderRadius: 6, padding: "3px 9px", cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 11, color: involvedCount > 0 ? AMB : CY,
          letterSpacing: 1, backdropFilter: "blur(6px)",
        }}
      >
        ◈ CINV{involvedCount > 0 && <sup style={{ color: AMB, marginLeft: 2 }}>{involvedCount}</sup>}
      </button>
    );
  }

  const statusColor = (s) => s === "INVOLVED" ? AMB : GRN;

  return (
    <div style={{
      position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh",
      background: "rgba(2,5,10,0.88)", zIndex: 9100, display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'JetBrains Mono',monospace",
    }}>
      <div style={{
        width: "min(820px,94vw)", maxHeight: "88vh", overflowY: "auto",
        background: "rgba(8,14,22,0.96)", border: `1px solid ${CY}44`,
        borderRadius: 14, padding: "20px 22px",
        boxShadow: `0 0 60px ${CY}18`,
      }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ color: CY, fontSize: 13, letterSpacing: 3, textShadow: `0 0 12px ${CY}` }}>
            ◈ CONTACT × INVESTIGATION INVOLVEMENT
          </span>
          {loading && (
            <span style={{ color: CY, fontSize: 10, marginLeft: "auto" }}>refreshing…</span>
          )}
          <button
            onClick={() => setOpen(false)}
            style={{
              marginLeft: loading ? 0 : "auto", background: "none", border: "none",
              cursor: "pointer", color: "#6E8AA0", fontSize: 16,
            }}
          >✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          {[
            { label: "CONTACTS",      val: rows.length,     col: CY  },
            { label: "INVESTIGATIONS", val: rows.length > 0 ? rows[0]?.matched?.length !== undefined ? rows.reduce((s, r) => s + r.matched.length, 0) : "—" : "—", col: CY },
            { label: "INVOLVED",      val: involved.length, col: AMB },
            { label: "CLEAR",         val: clear.length,    col: GRN },
          ].map(({ label, val, col }) => (
            <div key={label} style={{
              flex: "1 1 100px", background: "rgba(41,231,255,0.05)",
              border: `1px solid ${col}33`, borderRadius: 8, padding: "8px 12px", textAlign: "center",
            }}>
              <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{val}</div>
              <div style={{ color: "#6E8AA0", fontSize: 10, letterSpacing: 1, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* filter + search */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {["ALL", "INVOLVED", "CLEAR"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                background: filter === f ? `${CY}22` : "none",
                border: `1px solid ${filter === f ? CY : "#6E8AA0"}55`,
                borderRadius: 5, padding: "3px 10px", cursor: "pointer",
                color: filter === f ? CY : "#6E8AA0", fontSize: 11,
              }}
            >{f}</button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search contacts…"
            style={{
              marginLeft: "auto", background: "rgba(41,231,255,0.06)",
              border: `1px solid ${CY}33`, borderRadius: 5,
              padding: "3px 10px", color: CY, fontSize: 11,
              outline: "none", width: 160,
            }}
          />
        </div>

        {/* rows */}
        {visible.length === 0 && (
          <div style={{ color: "#6E8AA0", fontSize: 12, textAlign: "center", padding: 20 }}>
            {loading ? "Loading…" : "No contacts match current filter."}
          </div>
        )}
        {visible.map((row, i) => {
          const label = contactLabel(row.c);
          const isExp = expanded === i;
          const col   = statusColor(row.status);
          const busy  = assessing === label;
          return (
            <div key={i} style={{
              border: `1px solid ${col}33`, borderRadius: 8, marginBottom: 8,
              background: "rgba(8,14,22,0.6)",
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : i)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer" }}
              >
                <span style={{ color: col, fontSize: 10, letterSpacing: 1, minWidth: 70 }}>{row.status}</span>
                <span style={{ color: "#DCEBF5", fontSize: 12, flex: 1 }}>{label}</span>
                {row.c?.role && (
                  <span style={{ color: "#6E8AA0", fontSize: 10 }}>{row.c.role}</span>
                )}
                <span style={{ color: "#6E8AA0", fontSize: 10 }}>
                  {row.matched.length} case{row.matched.length !== 1 ? "s" : ""}
                </span>
                <span style={{ color: CY, fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "0 12px 12px" }}>
                  {(row.c?.email || row.c?.organisation || row.c?.organization) && (
                    <div style={{ color: "#6E8AA0", fontSize: 11, marginBottom: 8 }}>
                      {[row.c.email, row.c.organisation || row.c.organization].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  {row.matched.length === 0 ? (
                    <div style={{ color: GRN, fontSize: 11, marginBottom: 8 }}>
                      No active investigations correlate with this contact.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      {row.matched.map((inv, j) => (
                        <div key={j} style={{
                          background: "rgba(255,187,51,0.07)", border: `1px solid ${AMB}33`,
                          borderRadius: 6, padding: "5px 10px", fontSize: 11,
                        }}>
                          <div style={{ color: AMB }}>{investigationLabel(inv)}</div>
                          {(inv.status || inv.case_type || inv.type) && (
                            <div style={{ color: "#6E8AA0", fontSize: 10, marginTop: 1 }}>
                              {inv.status || inv.case_type || inv.type}
                            </div>
                          )}
                          {(inv.summary || inv.description) && (
                            <div style={{ color: "#6E8AA0", marginTop: 2, maxWidth: 260 }}>
                              {(inv.summary || inv.description).slice(0, 80)}
                              {(inv.summary || inv.description).length > 80 ? "…" : ""}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => assess(row)}
                    disabled={busy}
                    style={{
                      background: busy ? "rgba(41,231,255,0.05)" : `${CY}18`,
                      border: `1px solid ${CY}44`, borderRadius: 5,
                      padding: "4px 12px", cursor: busy ? "wait" : "pointer",
                      color: CY, fontSize: 11,
                    }}
                  >
                    {busy ? "assessing…" : "▶ ASSESS INVOLVEMENT"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
