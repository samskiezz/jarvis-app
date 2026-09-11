/**
 * AcousticContactMonitor — F274.
 *
 * Data sources (all real — backed by server/routes/acoustic.py):
 *   GET  /v1/acoustic/contacts?limit=200
 *       → {count, model, contacts:[{id,lat,lon,label,classification,confidence,source,model,ts,meta}]}
 *   POST /v1/acoustic/contact  {lat, lon, label, classification?, confidence?, source?, meta?}
 *       → {ok, contact:{...}}
 *
 * Displays:
 *   - Stat tiles: total / unique labels / operator-tagged / model
 *   - ALL / OPERATOR / CLASSIFIED filter tabs + text search
 *   - Per-contact: lat/lon chip + label + source chip + age + confidence bar on expand
 *   - Inline LOG CONTACT form → POST /v1/acoustic/contact
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle: ⊙ ACSN at left:269760, bottom:8, zIndex:152.
 * Badge: green=contact count, amber=no contacts.
 * 60 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isAcsnQuery(q) / buildAcsnScript()
 *
 * Voice triggers: "acoustic / acoustic contacts / contact map / yamnet /
 *   sound classification / audio contacts / acsn / acoustic monitor /
 *   acoustic log / contact log / acoustic sensor"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const RD  = "#F87171";
const AM  = "#F5A623";
const GN  = "#4ADE80";
const CY  = "#29E7FF";
const PU  = "#A78BFA";
const DIM = "#3A4A55";

const BTN_LEFT = 269760;
const POLL_MS  = 60_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const ACSN_RE =
  /\b(acoustic\b|acoustic\s+contacts?|contact\s+map|yamnet\b|sound\s+classif|audio\s+contacts?|acsn\b|acoustic\s+monitor|acoustic\s+log|contact\s+log|acoustic\s+sensor)\b/i;

export function isAcsnQuery(t) {
  return ACSN_RE.test(t || "");
}

export async function buildAcsnScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/acoustic/contacts?limit=200`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const contacts = d?.contacts || [];
    const total    = d?.count ?? contacts.length;
    const model    = d?.model || "unknown";
    const latest   = contacts[0];
    const latestLabel = latest?.label || latest?.classification || "unlabelled";
    return (
      `Acoustic Contact Monitor: ${total} contact${total !== 1 ? "s" : ""} logged via ${model}. ` +
      (latest
        ? `Most recent contact tagged "${latestLabel}" at ${Number(latest.lat).toFixed(4)}, ${Number(latest.lon).toFixed(4)}.`
        : "No contacts logged yet.")
    );
  } catch {
    return "Acoustic Contact Monitor is unavailable at this time, sir.";
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function age(ts) {
  if (!ts) return "—";
  const raw = typeof ts === "string" ? new Date(ts).getTime() / 1000 : Number(ts);
  const s = Math.max(0, Math.floor(Date.now() / 1000 - raw));
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function srcColor(src) {
  if (src === "operator") return CY;
  if (src === "classifier" || src === "yamnet") return PU;
  return AM;
}

// ─── fetch helpers ─────────────────────────────────────────────────────────────

async function fetchContacts(limit = 200) {
  const r = await fetch(`${apiBase()}/v1/acoustic/contacts?limit=${limit}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function postContact(body) {
  const r = await fetch(`${apiBase()}/v1/acoustic/contact`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function agentAssess(contacts, model) {
  const total = contacts.length;
  const labels = [...new Set(contacts.map(c => c.label || c.classification).filter(Boolean))].slice(0, 5);
  const prompt =
    `Acoustic contacts: ${total} logged using model "${model}". ` +
    (labels.length ? `Labels seen: ${labels.join(", ")}. ` : "") +
    `Give a 2-sentence operational brief on the acoustic contact picture and any recommended action.`;
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ message: prompt }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "Assessment unavailable.";
}

// ─── Tile ─────────────────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      background: "#0D1A20", border: `1px solid ${color || CY}33`,
      borderRadius: 6, padding: "8px 12px", minWidth: 90, flex: "1 1 90px",
    }}>
      <div style={{ color: color || CY, fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{value ?? "—"}</div>
      <div style={{ color: "#6A8899", fontSize: 10, marginTop: 3, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

// ─── ContactRow ───────────────────────────────────────────────────────────────

function ContactRow({ c }) {
  const [expanded, setExpanded] = useState(false);
  const label = c.label || c.classification || "unlabelled";
  const conf  = c.confidence != null ? Number(c.confidence) : null;

  return (
    <div style={{
      padding: "6px 0", borderBottom: "1px solid #0D1A20", cursor: "pointer",
    }}
      onClick={() => setExpanded(v => !v)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          background: `${srcColor(c.source)}18`, color: srcColor(c.source),
          border: `1px solid ${srcColor(c.source)}44`, borderRadius: 3,
          padding: "1px 5px", fontSize: 9, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: 0.5, flexShrink: 0,
        }}>
          {c.source || "?"}
        </span>
        <span style={{ color: "#C9D8E0", fontSize: 11, flex: 1 }}>{label}</span>
        <span style={{ color: DIM, fontSize: 9, flexShrink: 0 }}>{age(c.ts)}</span>
        <span style={{ color: DIM, fontSize: 10 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 6, paddingLeft: 8 }}>
          <div style={{ color: CY, fontSize: 10, marginBottom: 3 }}>
            {Number(c.lat).toFixed(5)}, {Number(c.lon).toFixed(5)}
          </div>
          {c.classification && c.classification !== label && (
            <div style={{ fontSize: 10, color: PU }}>classifier: {c.classification}</div>
          )}
          {conf != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <span style={{ color: "#6A8899", fontSize: 9, minWidth: 60 }}>confidence</span>
              <div style={{ flex: 1, height: 4, background: "#1A2A33", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${Math.round(conf * 100)}%`, height: "100%", background: GN }} />
              </div>
              <span style={{ color: GN, fontSize: 9, minWidth: 32 }}>{Math.round(conf * 100)}%</span>
            </div>
          )}
          {c.model && (
            <div style={{ color: "#6A8899", fontSize: 9, marginTop: 3 }}>model: {c.model}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const TABS = ["ALL", "OPERATOR", "CLASSIFIED"];

export default function AcousticContactMonitor() {
  const [open, setOpen]       = useState(false);
  const [tab, setTab]         = useState("ALL");
  const [q, setQ]             = useState("");
  const [data, setData]       = useState(null);
  const [err, setErr]         = useState("");
  const [notice, setNotice]   = useState("");
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState("");

  // Log form
  const [logLat, setLogLat]     = useState("");
  const [logLon, setLogLon]     = useState("");
  const [logLabel, setLogLabel] = useState("");
  const [logging, setLogging]   = useState(false);
  const [showLog, setShowLog]   = useState(false);

  const pollRef = useRef(null);

  const showNotice = (msg, ms = 3500) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), ms);
  };

  const load = useCallback(async () => {
    try {
      const d = await fetchContacts(200);
      setData(d);
      setErr("");
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [load]);

  useEffect(() => {
    const fn = () => setOpen(v => !v);
    window.addEventListener("jarvis:acsn-toggle", fn);
    return () => window.removeEventListener("jarvis:acsn-toggle", fn);
  }, []);

  // ── derived state ──────────────────────────────────────────────────────────
  const contacts   = data?.contacts || [];
  const model      = data?.model || "—";
  const total      = data?.count ?? contacts.length;
  const operatorCs = contacts.filter(c => c.source === "operator");
  const classifiedCs = contacts.filter(c => c.source !== "operator" && c.classification);
  const uniqueLabels = new Set(contacts.map(c => c.label || c.classification).filter(Boolean)).size;

  const badgeColor = total > 0 ? GN : AM;
  const badgeLabel = total > 0 ? String(total) : "0";

  // ── filtered list ──────────────────────────────────────────────────────────
  const lq = q.toLowerCase();
  const base = tab === "OPERATOR" ? operatorCs : tab === "CLASSIFIED" ? classifiedCs : contacts;
  const filtered = lq
    ? base.filter(c => JSON.stringify(c).toLowerCase().includes(lq))
    : base;

  // ── actions ────────────────────────────────────────────────────────────────
  async function handleLog() {
    const lat = parseFloat(logLat);
    const lon = parseFloat(logLon);
    if (isNaN(lat) || isNaN(lon)) {
      showNotice("Lat and lon must be valid numbers.");
      return;
    }
    setLogging(true);
    try {
      const d = await postContact({ lat, lon, label: logLabel || "operator-tagged", source: "operator" });
      showNotice(d?.ok ? `Contact #${d.contact?.id} logged at ${lat}, ${lon}` : "Log failed");
      setLogLat(""); setLogLon(""); setLogLabel("");
      await load();
    } catch (e) {
      showNotice(`Error: ${e}`);
    } finally {
      setLogging(false);
    }
  }

  async function handleAssess() {
    setAssessing(true);
    setAssessment("");
    try {
      const brief = await agentAssess(contacts, model);
      setAssessment(brief);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: brief }));
    } catch {
      setAssessment("Assessment failed.");
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Acoustic Contact Monitor"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 152,
          background: "#0D1A20", border: `1px solid ${badgeColor}55`,
          borderRadius: 6, color: badgeColor, fontFamily: "monospace",
          fontSize: 10, fontWeight: 700, padding: "3px 8px",
          cursor: "pointer", letterSpacing: 1, whiteSpace: "nowrap",
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ⊙ ACSN
        <span style={{
          background: `${badgeColor}22`, color: badgeColor,
          borderRadius: 4, padding: "1px 5px", fontSize: 9,
        }}>
          {badgeLabel}
        </span>
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", right: 18, top: "8%", width: 500, maxHeight: "80vh",
      background: "#06111A", border: `1px solid ${CY}44`,
      borderRadius: 12, boxShadow: `0 0 40px ${CY}18`,
      zIndex: 9200, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: "#C9D8E0", fontSize: 12,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 16px", borderBottom: `1px solid ${CY}33`,
        background: "#08161E",
      }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 13, flex: 1 }}>
          ⊙ ACOUSTIC CONTACTS
        </span>
        <span style={{ color: "#6A8899", fontSize: 9 }}>{model}</span>
        <button
          onClick={() => setShowLog(v => !v)}
          style={{
            background: `${GN}18`, border: `1px solid ${GN}44`, borderRadius: 4,
            color: GN, padding: "3px 10px", fontSize: 10, cursor: "pointer",
            fontFamily: "monospace", fontWeight: 700,
          }}
        >
          + LOG
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "none", border: "none", color: "#6A8899",
            cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0,
          }}
        >×</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px", flexWrap: "wrap" }}>
        <Tile label="Total"      value={total}         color={CY} />
        <Tile label="Labels"     value={uniqueLabels}  color={PU} />
        <Tile label="Operator"   value={operatorCs.length}   color={GN} />
        <Tile label="Classified" value={classifiedCs.length} color={AM} />
      </div>

      {/* Log form */}
      {showLog && (
        <div style={{
          padding: "8px 16px", borderBottom: `1px solid #1A2A33`,
          background: "#08161E",
        }}>
          <div style={{ color: "#6A8899", fontSize: 10, fontWeight: 700, marginBottom: 6, letterSpacing: 1 }}>
            LOG CONTACT
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={logLat}
              onChange={e => setLogLat(e.target.value)}
              placeholder="lat"
              style={{
                background: "#0D1A20", border: `1px solid #1A2A33`, borderRadius: 4,
                color: CY, padding: "3px 6px", fontSize: 11, fontFamily: "monospace",
                outline: "none", width: 80,
              }}
            />
            <input
              value={logLon}
              onChange={e => setLogLon(e.target.value)}
              placeholder="lon"
              style={{
                background: "#0D1A20", border: `1px solid #1A2A33`, borderRadius: 4,
                color: CY, padding: "3px 6px", fontSize: 11, fontFamily: "monospace",
                outline: "none", width: 80,
              }}
            />
            <input
              value={logLabel}
              onChange={e => setLogLabel(e.target.value)}
              placeholder="label (optional)"
              style={{
                background: "#0D1A20", border: `1px solid #1A2A33`, borderRadius: 4,
                color: CY, padding: "3px 6px", fontSize: 11, fontFamily: "monospace",
                outline: "none", flex: 1, minWidth: 100,
              }}
            />
            <button
              onClick={handleLog}
              disabled={logging}
              style={{
                background: `${GN}18`, border: `1px solid ${GN}44`, borderRadius: 4,
                color: GN, padding: "3px 10px", fontSize: 10, cursor: "pointer",
                fontFamily: "monospace", fontWeight: 700,
              }}
            >
              {logging ? "…" : "↑ SUBMIT"}
            </button>
          </div>
        </div>
      )}

      {/* Tabs + search */}
      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        padding: "0 16px 8px", borderBottom: `1px solid #1A2A33`,
      }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setQ(""); }}
            style={{
              background: tab === t ? `${CY}22` : "none",
              border: "none", borderBottom: tab === t ? `2px solid ${CY}` : "2px solid transparent",
              color: tab === t ? CY : "#6A8899",
              padding: "6px 12px", cursor: "pointer", fontFamily: "monospace",
              fontSize: 10, fontWeight: 700, letterSpacing: 1,
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: "auto", background: "#0D1A20", border: `1px solid #1A2A33`,
            borderRadius: 4, color: CY, padding: "3px 8px", fontSize: 11,
            fontFamily: "monospace", outline: "none", width: 120,
          }}
        />
      </div>

      {/* Notice / error */}
      {notice && (
        <div style={{ padding: "4px 16px", background: `${AM}18`, color: AM, fontSize: 10, fontWeight: 700 }}>
          {notice}
        </div>
      )}
      {err && (
        <div style={{ padding: "4px 16px", color: RD, fontSize: 10 }}>
          Error: {err}
        </div>
      )}

      {/* Contact list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
        {filtered.length === 0 ? (
          <div style={{ color: DIM, fontSize: 11, padding: "12px 0" }}>
            {total === 0 ? "No contacts logged yet. Use + LOG to add one." : "No contacts match filter."}
          </div>
        ) : (
          filtered.map(c => <ContactRow key={c.id} c={c} />)
        )}
      </div>

      {/* Assessment */}
      {assessment && (
        <div style={{
          padding: "8px 16px", borderTop: `1px solid #1A2A33`,
          color: "#A0C4D0", fontSize: 11, lineHeight: 1.5,
          background: "#08161E",
        }}>
          {assessment}
        </div>
      )}

      {/* Footer */}
      <div style={{
        display: "flex", gap: 8, padding: "8px 16px",
        borderTop: `1px solid #1A2A33`, background: "#06111A",
        alignItems: "center",
      }}>
        <button
          onClick={handleAssess}
          disabled={assessing}
          style={{
            background: `${CY}18`, border: `1px solid ${CY}44`, borderRadius: 4,
            color: CY, padding: "4px 12px", fontSize: 10, cursor: "pointer",
            fontFamily: "monospace", fontWeight: 700,
          }}
        >
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <span style={{ color: DIM, fontSize: 9, flex: 1 }}>
          auto-refresh 60s · /v1/acoustic/contacts
        </span>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "none", border: `1px solid #1A2A33`, borderRadius: 4,
            color: "#6A8899", padding: "3px 10px", fontSize: 10, cursor: "pointer",
            fontFamily: "monospace",
          }}
        >
          CLOSE
        </button>
      </div>
    </div>
  );
}
