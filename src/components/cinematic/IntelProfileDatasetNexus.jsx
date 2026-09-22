/**
 * IntelProfileDatasetNexus — F549
 * "JARVIS, intel profile dataset / ipdset / threat actor data / intel data coverage / which threats have datasets"
 * Cross-references /entities/IntelProfile + /v1/datasets.
 * Finds ASSOCIATED intel profiles (≥1 dataset keyword-matches) vs UNDOCUMENTED (data blind spots).
 * Coverage % tile; ALL/ASSOCIATED/UNDOCUMENTED filter tabs + search; click-to-expand matched datasets.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence intel-data coverage brief + TTS.
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
const BTN_LEFT = 49_620;
const Z_INDEX  = 116;

const IPDSET_RE =
  /\bipdset\b|\bintel.?profile.?dataset\b|\bthreat.?actor.?data\b|\bintel.?data.?coverage\b|\bwhich.?threats?.?have.?datasets?\b|\bthreat.?dataset\b|\bactor.?dataset\b|\bintel.?data\b|\bprofile.?dataset\b/i;

export function isIpdsetQuery(text) {
  return IPDSET_RE.test(text || "");
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

function normaliseProfiles(data) {
  if (!data) return [];
  const raw =
    data.profiles || data.intel_profiles || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((p, i) => ({
    id:          p.id || `profile-${i}`,
    name:        p.name || p.alias || p.handle || p.subject || `Profile ${i + 1}`,
    threat:      (p.threat_level || p.threat || p.severity || "UNKNOWN").toUpperCase(),
    actor_type:  p.actor_type || p.type || p.category || "",
    description: p.description || p.summary || p.bio || "",
    tags:        Array.isArray(p.tags) ? p.tags.join(" ") : String(p.tags || ""),
  }));
}

function normaliseDatasets(data) {
  if (!data) return [];
  const raw =
    data.datasets || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((d, i) => ({
    id:        d.id || `ds-${i}`,
    name:      d.name || d.title || d.dataset_name || `Dataset ${i + 1}`,
    kind:      d.source || d.source_type || d.type || d.kind || "DATA",
    row_count: d.row_count || d.rows || d.count || 0,
    summary:   d.description || d.summary || "",
    tags:      Array.isArray(d.tags) ? d.tags.join(" ") : String(d.tags || ""),
  }));
}

function crossRef(profiles, datasets) {
  return profiles.map((p) => {
    const haystack = `${p.name} ${p.description} ${p.tags} ${p.actor_type}`;
    const matches = datasets
      .map((d) => ({
        d,
        hits: overlap(haystack, `${d.name} ${d.summary} ${d.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...p,
      associated: matches.length > 0,
      matches:    matches.map(({ d, hits }) => ({ ...d, hits })),
    };
  });
}

// ─── buildIpdsetScript (for JarvisBrain) ─────────────────────────────────────

export async function buildIpdsetScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [pRes, dRes] = await Promise.all([
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
      fetch(`${base}/v1/datasets`,           { headers: hdr }),
    ]);
    const pData = pRes.ok ? await pRes.json() : {};
    const dData = dRes.ok ? await dRes.json() : {};

    const profiles  = normaliseProfiles(pData);
    const datasets  = normaliseDatasets(dData);
    const crossed   = crossRef(profiles, datasets);

    const total        = crossed.length;
    const associated   = crossed.filter((p) => p.associated).length;
    const undocumented = total - associated;
    const coverage     = total > 0 ? Math.round((associated / total) * 100) : 0;
    const topBlind     = crossed
      .filter((p) => !p.associated)
      .slice(0, 2)
      .map((p) => p.name)
      .join(", ");

    const brief =
      `${coverage}% of ${total} intel profiles have dataset associations. ` +
      `${associated} ASSOCIATED, ${undocumented} UNDOCUMENTED (data blind spots).` +
      (topBlind ? ` Blind spot profiles: ${topBlind}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Intel Profile × Dataset Coverage: ${brief} Provide a 2-sentence intel-data readiness assessment.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Intel Profile × Dataset Coverage unavailable: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

const THREAT_COLOR = {
  CRITICAL: "#FF2244",
  HIGH:     "#FF6644",
  MEDIUM:   "#FFA500",
  LOW:      "#29E7FF",
  UNKNOWN:  "#8899AA",
};

const KIND_COLOR = {
  DATABASE: "#29E7FF",
  FILE:     "#00E5A0",
  STREAM:   "#FFA500",
  API:      "#BB88FF",
};

export default function IntelProfileDatasetNexus() {
  const [open, setOpen]         = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [crossed, setCrossed]   = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [query, setQuery]       = useState("");
  const [expanded, setExp]      = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssess]  = useState(false);
  const [brief, setBrief]       = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [pRes, dRes] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
        fetch(`${base}/v1/datasets`,           { headers: hdr }),
      ]);
      const pData = pRes.ok ? await pRes.json() : {};
      const dData = dRes.ok ? await dRes.json() : {};
      const p = normaliseProfiles(pData);
      const d = normaliseDatasets(dData);
      setProfiles(p);
      setDatasets(d);
      setCrossed(crossRef(p, d));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () =>
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    window.addEventListener("jarvis:ipdset-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ipdset-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssess(true);
    setBrief("");
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const total        = crossed.length;
      const associated   = crossed.filter((p) => p.associated).length;
      const undocumented = total - associated;
      const coverage     = total > 0 ? Math.round((associated / total) * 100) : 0;
      const prompt = `Intel Profile × Dataset Coverage: ${coverage}% coverage (${associated}/${total} associated, ${undocumented} data blind spots). Assess intel-data readiness in 2 sentences.`;
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const d    = res.ok ? await res.json() : {};
      const text = d.response || d.message || d.reply || "Assessment complete.";
      setBrief(text);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "onyx" }),
      });
    } catch (e) {
      setBrief(`Assessment error: ${e.message}`);
    } finally {
      setAssess(false);
    }
  }, [crossed]);

  const visible = crossed.filter((p) => {
    if (tab === "ASSOCIATED"   && !p.associated) return false;
    if (tab === "UNDOCUMENTED" &&  p.associated) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!p.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const total          = crossed.length;
  const nAssociated    = crossed.filter((p) => p.associated).length;
  const nUndocumented  = total - nAssociated;
  const coverage       = total > 0 ? Math.round((nAssociated / total) * 100) : 0;

  const btnStyle = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: Z_INDEX,
    background: "rgba(0,0,0,0.85)",
    border: `1px solid ${CY}`,
    color: CY,
    fontFamily: "monospace",
    fontSize: 10,
    padding: "2px 7px",
    cursor: "pointer",
    borderRadius: 3,
    userSelect: "none",
    display: "flex",
    alignItems: "center",
    gap: 4,
  };

  const panelStyle = {
    position: "fixed",
    right: 18,
    bottom: 54,
    width: 460,
    maxHeight: "78vh",
    overflowY: "auto",
    background: "rgba(0,6,18,0.97)",
    border: `1px solid ${CY}44`,
    borderRadius: 8,
    padding: 16,
    zIndex: 9999,
    fontFamily: "monospace",
    color: CY,
    boxSizing: "border-box",
  };

  return (
    <>
      <button
        style={btnStyle}
        onClick={() => setOpen((v) => { if (!v) load(); return !v; })}
        title="Intel Profile × Dataset Nexus"
      >
        ◈ IPDSET
        {nUndocumented > 0 && (
          <span
            style={{
              background: AMB,
              color: "#000",
              borderRadius: 8,
              padding: "0 4px",
              fontSize: 9,
            }}
          >
            {nUndocumented}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>
              INTEL PROFILE × DATASET NEXUS
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={load}
                style={{
                  background: "none",
                  border: `1px solid ${CY}55`,
                  color: CY,
                  cursor: "pointer",
                  padding: "2px 8px",
                  borderRadius: 3,
                  fontSize: 10,
                }}
                title="Refresh"
              >
                ↺
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: DIM,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[
              {
                label: "COVERAGE",
                value: `${coverage}%`,
                color: coverage > 60 ? GRN : coverage > 30 ? AMB : "#FF4466",
              },
              { label: "ASSOCIATED",   value: nAssociated,   color: GRN },
              { label: "UNDOCUMENTED", value: nUndocumented, color: AMB },
              { label: "DATASETS",     value: datasets.length, color: CY },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  background: "rgba(41,231,255,0.05)",
                  border: `1px solid ${color}33`,
                  borderRadius: 4,
                  padding: "6px 8px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 16, fontWeight: "bold", color }}>{value}</div>
                <div style={{ fontSize: 8, color: DIM, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Assess */}
          <div style={{ marginBottom: 10 }}>
            <button
              onClick={assess}
              disabled={assessing || crossed.length === 0}
              style={{
                background: assessing
                  ? "rgba(41,231,255,0.1)"
                  : "rgba(41,231,255,0.15)",
                border: `1px solid ${CY}88`,
                color: CY,
                cursor: assessing ? "wait" : "pointer",
                padding: "4px 14px",
                borderRadius: 3,
                fontSize: 10,
                fontFamily: "monospace",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 10,
                  color: "#cde",
                  lineHeight: 1.5,
                  padding: "6px 8px",
                  background: "rgba(41,231,255,0.05)",
                  borderRadius: 3,
                }}
              >
                {brief}
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {["ALL", "ASSOCIATED", "UNDOCUMENTED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "none",
                  border: `1px solid ${tab === t ? CY : CY + "33"}`,
                  color: tab === t ? CY : DIM,
                  cursor: "pointer",
                  padding: "2px 10px",
                  borderRadius: 3,
                  fontSize: 10,
                  fontFamily: "monospace",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search intel profiles…"
            style={{
              width: "100%",
              background: "rgba(41,231,255,0.06)",
              border: `1px solid ${CY}33`,
              color: CY,
              padding: "4px 8px",
              borderRadius: 3,
              fontSize: 10,
              marginBottom: 8,
              boxSizing: "border-box",
              fontFamily: "monospace",
            }}
          />

          {/* Profile rows */}
          {loading ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
              Loading…
            </div>
          ) : visible.length === 0 ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
              No profiles match.
            </div>
          ) : (
            visible.map((p) => (
              <div key={p.id}>
                <div
                  onClick={() => setExp(expanded === p.id ? null : p.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 6px",
                    marginBottom: 3,
                    cursor: "pointer",
                    borderRadius: 3,
                    background: "rgba(41,231,255,0.04)",
                    border: `1px solid ${p.associated ? GRN + "44" : DIM + "22"}`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: p.associated ? GRN : DIM,
                      minWidth: 90,
                    }}
                  >
                    {p.associated ? "ASSOCIATED" : "UNDOCUMENTED"}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 10,
                      color: p.associated ? GRN : DIM,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.name}
                  </span>
                  <span
                    style={{
                      fontSize: 8,
                      color: THREAT_COLOR[p.threat] || DIM,
                    }}
                  >
                    {p.threat}
                  </span>
                  {p.associated && (
                    <span style={{ fontSize: 8, color: GRN }}>
                      ⬡ {p.matches.length} ds
                    </span>
                  )}
                </div>

                {/* Expanded matched datasets */}
                {expanded === p.id && p.associated && (
                  <div style={{ marginLeft: 12, marginBottom: 6 }}>
                    {p.matches.map((d) => (
                      <div
                        key={d.id}
                        style={{
                          padding: "3px 6px",
                          marginBottom: 2,
                          borderRadius: 2,
                          background: "rgba(0,229,160,0.05)",
                          border: `1px solid ${CY}22`,
                          fontSize: 9,
                        }}
                      >
                        <span
                          style={{
                            color: KIND_COLOR[d.kind.toUpperCase()] || AMB,
                            marginRight: 4,
                          }}
                        >
                          [{d.kind.toUpperCase()}]
                        </span>
                        <span style={{ color: GRN }}>{d.name}</span>
                        {d.row_count > 0 && (
                          <span style={{ color: DIM, marginLeft: 6 }}>
                            {d.row_count.toLocaleString()} rows
                          </span>
                        )}
                        <span style={{ color: DIM, marginLeft: 6 }}>
                          hits:{d.hits}
                        </span>
                        {d.summary && (
                          <div
                            style={{
                              color: DIM,
                              marginTop: 2,
                              lineHeight: 1.4,
                              whiteSpace: "normal",
                            }}
                          >
                            {d.summary.slice(0, 100)}
                            {d.summary.length > 100 ? "…" : ""}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {expanded === p.id && !p.associated && (
                  <div
                    style={{
                      marginLeft: 12,
                      marginBottom: 6,
                      fontSize: 9,
                      color: DIM,
                    }}
                  >
                    No datasets are associated with this intel profile.
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
