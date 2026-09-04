/**
 * ContactDatasetNexus — F528
 * "JARVIS, contact dataset / cdata / which contacts have data / contact data coverage / documented contacts"
 * Cross-references /entities/Contact + /v1/datasets.
 * Finds ASSOCIATED contacts (≥1 dataset keyword-matches) vs UNLINKED (no dataset backing).
 * Coverage % tile; ALL/ASSOCIATED/UNLINKED filter tabs + search; click-to-expand matched datasets.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 41_880;
const Z_INDEX  = 107;

const CDATA_RE =
  /\bcdata\b|\bcontact.?dataset\b|\bdataset.?contact\b|\bwhich.?contacts?.?have.?data\b|\bcontact.?data.?coverage\b|\bcontact.?data\b|\bdata.?contact\b|\bcontact.?linked.?data\b|\bdocumented.?contacts?\b/i;

export function isCdataQuery(text) {
  return CDATA_RE.test(text || "");
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(keywords(a));
  return keywords(b).filter((w) => sa.has(w)).length;
}

function normaliseContacts(data) {
  if (!data) return [];
  const raw =
    data.contacts || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((c, i) => ({
    id:   c.id || `con-${i}`,
    name: c.name || c.full_name || c.display_name || `Contact ${i + 1}`,
    role: c.role || c.title || c.occupation || "",
    org:  c.organization || c.company || c.org || "",
    tags: Array.isArray(c.tags) ? c.tags.join(" ") : String(c.tags || ""),
    desc: c.description || c.bio || c.notes || c.summary || "",
  }));
}

function normaliseDatasets(data) {
  if (!data) return [];
  const raw =
    data.datasets || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((ds, i) => ({
    id:   ds.id || `ds-${i}`,
    name: ds.name || ds.title || ds.dataset_name || `Dataset ${i + 1}`,
    kind: (ds.kind || ds.type || ds.format || "DATA").toUpperCase(),
    rows: ds.row_count || ds.rows || ds.count || 0,
    desc: ds.description || ds.summary || ds.notes || "",
    tags: Array.isArray(ds.tags) ? ds.tags.join(" ") : String(ds.tags || ""),
  }));
}

function crossRef(contacts, datasets) {
  return contacts.map((con) => {
    const haystack = `${con.name} ${con.role} ${con.org} ${con.desc} ${con.tags}`;
    const matches = datasets
      .map((ds) => ({
        ds,
        hits: overlap(haystack, `${ds.name} ${ds.desc} ${ds.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...con,
      associated: matches.length > 0,
      matches: matches.map(({ ds, hits }) => ({ ...ds, hits })),
    };
  });
}

// ─── buildCdataScript (for JarvisBrain) ──────────────────────────────────────

export async function buildCdataScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [conRes, dsRes] = await Promise.all([
      fetch(`${base}/entities/Contact`, { headers: hdr }),
      fetch(`${base}/v1/datasets`,      { headers: hdr }),
    ]);
    const conData = conRes.ok ? await conRes.json() : {};
    const dsData  = dsRes.ok  ? await dsRes.json()  : {};

    const contacts  = normaliseContacts(conData);
    const datasets  = normaliseDatasets(dsData);
    const crossed   = crossRef(contacts, datasets);

    const total      = crossed.length;
    const associated = crossed.filter((c) => c.associated).length;
    const unlinked   = total - associated;
    const coverage   = total > 0 ? Math.round((associated / total) * 100) : 0;
    const topUnlinked = crossed
      .filter((c) => !c.associated)
      .slice(0, 2)
      .map((c) => c.name)
      .join(", ");

    const prompt = `JARVIS contact-dataset nexus: ${total} contacts analysed against ${datasets.length} datasets. ${associated} contacts have dataset associations (${coverage}% coverage). ${unlinked} contacts have no dataset backing — potential intelligence blind spots. Top unlinked contacts: ${topUnlinked || "none"}. Provide a 2-sentence data-intelligence brief.`;
    const chatRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt }),
    });
    const chatData = chatRes.ok ? await chatRes.json() : {};
    const brief =
      chatData.response || chatData.message || chatData.content ||
      `${associated} of ${total} contacts are backed by dataset associations (${coverage}% coverage). ${unlinked} contacts remain without dataset linkage — potential intelligence blind spots.`;

    window.dispatchEvent(
      new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } })
    );
    return brief;
  } catch (err) {
    return `Contact-dataset nexus error: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function ContactDatasetNexus() {
  const [open, setOpen]           = useState(false);
  const [crossed, setCrossed]     = useState([]);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]         = useState("");
  const [loading, setLoading]     = useState(false);
  const timerRef = useRef(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [conRes, dsRes] = await Promise.all([
        fetch(`${base}/entities/Contact`, { headers: hdr }),
        fetch(`${base}/v1/datasets`,      { headers: hdr }),
      ]);
      const conData = conRes.ok ? await conRes.json() : {};
      const dsData  = dsRes.ok  ? await dsRes.json()  : {};
      const contacts = normaliseContacts(conData);
      const datasets = normaliseDatasets(dsData);
      setCrossed(crossRef(contacts, datasets));
    } catch (_) {
      /* network unavailable */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:cdata-toggle", onToggle);
    return () => window.removeEventListener("jarvis:cdata-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetch_();
    timerRef.current = setInterval(fetch_, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetch_]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const result = await buildCdataScript();
      setBrief(result);
    } finally {
      setAssessing(false);
    }
  }, []);

  const associated = crossed.filter((c) => c.associated);
  const unlinked   = crossed.filter((c) => !c.associated);
  const coverage   = crossed.length > 0
    ? Math.round((associated.length / crossed.length) * 100)
    : 0;

  const visible = crossed
    .filter((c) => {
      if (tab === "ASSOCIATED") return c.associated;
      if (tab === "UNLINKED")   return !c.associated;
      return true;
    })
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.role.toLowerCase().includes(q) ||
        c.org.toLowerCase().includes(q)
      );
    });

  const btnStyle = {
    position: "fixed",
    bottom: 8,
    left: BTN_LEFT,
    zIndex: Z_INDEX,
    background: "rgba(0,20,40,0.85)",
    border: `1px solid ${!open ? DIM : CY}`,
    color: !open ? DIM : CY,
    fontFamily: "monospace",
    fontSize: 10,
    padding: "3px 7px",
    cursor: "pointer",
    borderRadius: 3,
    whiteSpace: "nowrap",
  };

  if (!open) {
    return (
      <button
        style={btnStyle}
        onClick={() => setOpen(true)}
        title="Contact × Dataset Nexus (CDATA)"
      >
        ◈ CDATA{unlinked.length > 0 && (
          <span style={{ color: AMB, marginLeft: 4 }}>{unlinked.length}</span>
        )}
      </button>
    );
  }

  const panel = {
    position: "fixed",
    bottom: 36,
    left: Math.min(BTN_LEFT, window.innerWidth - 480),
    width: 460,
    maxHeight: "75vh",
    overflowY: "auto",
    zIndex: Z_INDEX + 1,
    background: "rgba(0,10,25,0.97)",
    border: `1px solid ${CY}`,
    borderRadius: 6,
    fontFamily: "monospace",
    fontSize: 11,
    color: CY,
    padding: 14,
    boxShadow: `0 0 24px ${CY}44`,
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(false)}>
        ◈ CDATA ✕
      </button>

      <div style={panel}>
        <div style={{ fontSize: 13, fontWeight: "bold", marginBottom: 10 }}>
          ◈ CONTACT × DATASET NEXUS
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[
            ["CONTACTS",   crossed.length,    CY],
            ["ASSOCIATED", associated.length, GRN],
            ["UNLINKED",   unlinked.length,   AMB],
            ["COVERAGE",   `${coverage}%`,    coverage > 40 ? GRN : AMB],
          ].map(([label, val, col]) => (
            <div
              key={label}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${col}55`,
                borderRadius: 4,
                padding: "4px 6px",
                textAlign: "center",
              }}
            >
              <div style={{ color: col, fontSize: 14, fontWeight: "bold" }}>{val}</div>
              <div style={{ color: DIM, fontSize: 9 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {["ALL", "ASSOCIATED", "UNLINKED"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? CY : "transparent",
                color: tab === t ? "#000" : DIM,
                border: `1px solid ${tab === t ? CY : DIM}`,
                borderRadius: 3,
                padding: "2px 8px",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${DIM}`,
            borderRadius: 3,
            color: CY,
            padding: "3px 6px",
            fontSize: 10,
            marginBottom: 8,
            boxSizing: "border-box",
          }}
        />

        {/* list */}
        {loading && !crossed.length ? (
          <div style={{ color: DIM, textAlign: "center", padding: 20 }}>FETCHING…</div>
        ) : visible.length === 0 ? (
          <div style={{ color: DIM, padding: 12 }}>No contacts match.</div>
        ) : (
          visible.map((con) => (
            <div
              key={con.id}
              style={{
                borderBottom: "1px solid rgba(41,231,255,0.1)",
                paddingBottom: 8,
                marginBottom: 8,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                onClick={() => setExpanded(expanded === con.id ? null : con.id)}
              >
                <span
                  style={{
                    fontSize: 9,
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: con.associated ? `${GRN}22` : `${AMB}22`,
                    color: con.associated ? GRN : AMB,
                    border: `1px solid ${con.associated ? GRN : AMB}55`,
                    flexShrink: 0,
                  }}
                >
                  {con.associated ? "ASSOCIATED" : "UNLINKED"}
                </span>
                <span style={{ color: con.associated ? CY : DIM, flexGrow: 1 }}>{con.name}</span>
                {con.role && (
                  <span
                    style={{
                      fontSize: 9,
                      padding: "1px 4px",
                      borderRadius: 2,
                      background: `${CY}22`,
                      color: DIM,
                      border: `1px solid ${CY}22`,
                      flexShrink: 0,
                      maxWidth: 100,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {con.role}
                  </span>
                )}
                <span style={{ color: DIM }}>{expanded === con.id ? "▲" : "▼"}</span>
              </div>

              {expanded === con.id && (
                <div style={{ marginTop: 6, paddingLeft: 8 }}>
                  {con.org && (
                    <div style={{ color: DIM, fontSize: 10, marginBottom: 4 }}>
                      org: {con.org}
                    </div>
                  )}
                  {con.matches.length === 0 ? (
                    <div style={{ color: AMB, fontSize: 10 }}>No datasets correlated.</div>
                  ) : (
                    con.matches.map((ds) => (
                      <div
                        key={ds.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 6,
                          marginBottom: 4,
                          paddingLeft: 4,
                          borderLeft: `2px solid ${GRN}55`,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 8,
                            padding: "1px 4px",
                            borderRadius: 2,
                            background: `${CY}22`,
                            color: CY,
                            border: `1px solid ${CY}44`,
                            flexShrink: 0,
                            marginTop: 1,
                          }}
                        >
                          {ds.kind}
                        </span>
                        <div style={{ flexGrow: 1 }}>
                          <div style={{ color: CY, fontSize: 10 }}>{ds.name}</div>
                          {ds.rows > 0 && (
                            <div style={{ color: DIM, fontSize: 9 }}>
                              {ds.rows.toLocaleString()} rows
                            </div>
                          )}
                        </div>
                        <span style={{ color: DIM, fontSize: 9, flexShrink: 0 }}>{ds.hits}↑</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {/* assess */}
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            marginTop: 8,
            width: "100%",
            background: assessing ? "transparent" : `${GRN}22`,
            border: `1px solid ${GRN}`,
            color: GRN,
            borderRadius: 3,
            padding: "4px 0",
            cursor: assessing ? "not-allowed" : "pointer",
            fontSize: 10,
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>

        {brief && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              background: "rgba(0,229,160,0.06)",
              border: `1px solid ${GRN}44`,
              borderRadius: 4,
              color: GRN,
              fontSize: 10,
              lineHeight: 1.5,
            }}
          >
            {brief}
          </div>
        )}
      </div>
    </>
  );
}
