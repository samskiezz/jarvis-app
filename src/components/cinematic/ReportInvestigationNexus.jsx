/**
 * ReportInvestigationNexus — F543 (RINV)
 * "JARVIS, report investigation / investigation report / rinv / which investigations have reports /
 *  documented cases / undocumented investigations / case report coverage"
 * Cross-references /v1/reports + /v1/investigations.
 * Finds DOCUMENTED investigations (≥1 report keyword-matches) vs UNDOCUMENTED (blind spot cases).
 * Coverage % tile; ALL/DOCUMENTED/UNDOCUMENTED filter tabs + search; click-to-expand matched reports.
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

const POLL_MS  = 120_000;
const BTN_LEFT = 47_040;
const Z_INDEX  = 113;

const RINV_RE =
  /\brinv\b|\breport.?investig\b|\binvestig.?report\b|\bwhich.?investig\w*\s+have\s+report\b|\bdocumented.?case\b|\bundocumented.?investig\b|\bcase.?report.?coverage\b|\bcase.?documentation\b|\binvestig.?documentation\b/i;

export function isRinvQuery(text) {
  return RINV_RE.test(text || "");
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

function normaliseReports(data) {
  if (!data) return [];
  const raw =
    data.reports || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:      r.id || `rep-${i}`,
    title:   r.title || r.name || r.report_name || `Report ${i + 1}`,
    type:    (r.type || r.kind || r.category || "REPORT").toUpperCase(),
    author:  r.author || r.created_by || r.owner || "",
    summary: r.summary || r.description || r.abstract || r.body || "",
    status:  r.status || "",
    tags:    Array.isArray(r.tags) ? r.tags.join(" ") : String(r.tags || ""),
  }));
}

function normaliseInvestigations(data) {
  if (!data) return [];
  const raw =
    data.investigations || data.cases || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((inv, i) => ({
    id:      inv.id || `inv-${i}`,
    title:   inv.title || inv.name || inv.case_name || `Case ${i + 1}`,
    status:  (inv.status || "OPEN").toUpperCase(),
    lead:    inv.lead || inv.owner || inv.assigned_to || "",
    summary: inv.summary || inv.description || inv.notes || "",
    tags:    Array.isArray(inv.tags) ? inv.tags.join(" ") : String(inv.tags || ""),
    updated: inv.updated_at || inv.last_updated || "",
  }));
}

function crossRef(investigations, reports) {
  return investigations.map((inv) => {
    const haystack = `${inv.title} ${inv.summary} ${inv.tags} ${inv.lead}`;
    const matches = reports
      .map((rep) => {
        const needle = `${rep.title} ${rep.summary} ${rep.tags} ${rep.author}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...rep, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...inv, matches, documented: matches.length > 0 };
  });
}

// ─── voice script ─────────────────────────────────────────────────────────────

export async function buildRinvScript() {
  try {
    const base = apiBase();
    const headers = { Authorization: `Bearer ${API_KEY}` };
    const [repRes, invRes] = await Promise.all([
      fetch(`${base}/v1/reports`, { headers }),
      fetch(`${base}/v1/investigations`, { headers }),
    ]);
    const [repData, invData] = await Promise.all([repRes.json(), invRes.json()]);
    const reports       = normaliseReports(repData);
    const investigations = normaliseInvestigations(invData);
    const crossed       = crossRef(investigations, reports);
    const documented    = crossed.filter((i) => i.documented);
    const undocumented  = crossed.filter((i) => !i.documented);
    const pct           = crossed.length
      ? Math.round((documented.length / crossed.length) * 100)
      : 0;

    const prompt =
      `We have ${crossed.length} investigations. ${documented.length} are ` +
      `DOCUMENTED (matched to ≥1 report) and ${undocumented.length} are UNDOCUMENTED ` +
      `(no matching report found). Report coverage: ${pct}%. ` +
      (undocumented.length > 0
        ? `Top undocumented case: "${undocumented[0].title}" (${undocumented[0].status}). `
        : "") +
      `Provide a 2-sentence case-documentation coverage assessment.`;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt }),
    });
    const d = await r.json();
    return d.response || d.message || d.text ||
      `Report-investigation coverage: ${pct}%. ${undocumented.length} undocumented cases detected.`;
  } catch {
    return "Unable to fetch report-investigation data at this time.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ReportInvestigationNexus() {
  const [open,     setOpen]     = useState(false);
  const [crossed,  setCrossed]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [tab,      setTab]      = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief,    setBrief]    = useState("");
  const [assessing,setAssessing]= useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base    = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [repRes, invRes] = await Promise.all([
        fetch(`${base}/v1/reports`, { headers }),
        fetch(`${base}/v1/investigations`, { headers }),
      ]);
      if (!repRes.ok || !invRes.ok) throw new Error("fetch failed");
      const [repData, invData] = await Promise.all([repRes.json(), invRes.json()]);
      const reports        = normaliseReports(repData);
      const investigations = normaliseInvestigations(invData);
      setCrossed(crossRef(investigations, reports));
    } catch {
      // silently keep stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen((o) => {
        if (!o) load();
        return !o;
      });
    };
    window.addEventListener("jarvis:rinv-toggle", toggle);
    return () => window.removeEventListener("jarvis:rinv-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const documented   = crossed.filter((i) => i.documented);
  const undocumented = crossed.filter((i) => !i.documented);
  const coverage     = crossed.length
    ? Math.round((documented.length / crossed.length) * 100)
    : 0;

  const visible = crossed
    .filter((inv) => {
      if (tab === "DOCUMENTED")   return inv.documented;
      if (tab === "UNDOCUMENTED") return !inv.documented;
      return true;
    })
    .filter((inv) =>
      !search ||
      inv.title.toLowerCase().includes(search.toLowerCase()) ||
      inv.lead.toLowerCase().includes(search.toLowerCase())
    );

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const text = await buildRinvScript();
      setBrief(text);
      const ttsRes = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });
      if (ttsRes.ok) {
        const blob = await ttsRes.blob();
        const url  = URL.createObjectURL(blob);
        const aud  = new Audio(url);
        aud.play().catch(() => {});
      }
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  };

  const statusColor = (s) => {
    if (s === "OPEN")      return "#FFA500";
    if (s === "ACTIVE")    return "#29E7FF";
    if (s === "ESCALATED") return "#FF4444";
    if (s === "CLOSED")    return "#8899AA";
    return CY;
  };

  const btnStyle = {
    position: "fixed",
    bottom: 8,
    left: BTN_LEFT,
    zIndex: Z_INDEX,
    background: open ? CY : "rgba(0,10,25,0.88)",
    color: open ? "#000" : CY,
    border: `1px solid ${CY}`,
    borderRadius: 4,
    padding: "3px 8px",
    fontSize: 10,
    fontFamily: "monospace",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  if (!open) {
    return (
      <button style={btnStyle} onClick={() => { setOpen(true); load(); }}
        title="Report × Investigation Nexus (RINV)"
      >
        ◈ RINV{undocumented.length > 0 && (
          <span style={{ color: AMB, marginLeft: 4 }}>{undocumented.length}</span>
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
        ◈ RINV ✕
      </button>

      <div style={panel}>
        <div style={{ fontSize: 13, fontWeight: "bold", marginBottom: 10 }}>
          ◈ REPORT × INVESTIGATION NEXUS
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[
            ["CASES",        crossed.length,       CY],
            ["DOCUMENTED",   documented.length,    GRN],
            ["UNDOCUMENTED", undocumented.length,  AMB],
            ["COVERAGE",     `${coverage}%`,       coverage > 40 ? GRN : AMB],
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
          {["ALL", "DOCUMENTED", "UNDOCUMENTED"].map((t) => (
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
          placeholder="search investigations…"
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
          <div style={{ color: DIM, padding: 12 }}>No investigations match.</div>
        ) : (
          visible.map((inv) => (
            <div
              key={inv.id}
              style={{
                borderBottom: "1px solid rgba(41,231,255,0.1)",
                paddingBottom: 8,
                marginBottom: 8,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
              >
                <span
                  style={{
                    fontSize: 9,
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: inv.documented ? `${GRN}22` : `${AMB}22`,
                    color: inv.documented ? GRN : AMB,
                    border: `1px solid ${inv.documented ? GRN : AMB}55`,
                    flexShrink: 0,
                  }}
                >
                  {inv.documented ? "DOCUMENTED" : "UNDOCUMENTED"}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: `${statusColor(inv.status)}22`,
                    color: statusColor(inv.status),
                    border: `1px solid ${statusColor(inv.status)}55`,
                    flexShrink: 0,
                  }}
                >
                  {inv.status}
                </span>
                <span style={{ color: inv.documented ? CY : DIM, flexGrow: 1 }}>
                  {inv.title}
                </span>
                <span style={{ color: DIM }}>{expanded === inv.id ? "▲" : "▼"}</span>
              </div>

              {expanded === inv.id && (
                <div style={{ marginTop: 6, paddingLeft: 8 }}>
                  {inv.lead && (
                    <div style={{ color: DIM, fontSize: 10, marginBottom: 4 }}>
                      lead: {inv.lead}
                    </div>
                  )}
                  {inv.summary && (
                    <div style={{ color: DIM, fontSize: 10, marginBottom: 6, lineHeight: 1.4 }}>
                      {inv.summary.slice(0, 200)}{inv.summary.length > 200 ? "…" : ""}
                    </div>
                  )}
                  {inv.matches.length === 0 ? (
                    <div style={{ color: AMB, fontSize: 10 }}>No matching reports found.</div>
                  ) : (
                    inv.matches.map((rep) => (
                      <div
                        key={rep.id}
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
                          {rep.type}
                        </span>
                        <div style={{ flexGrow: 1 }}>
                          <div style={{ color: CY, fontSize: 10 }}>{rep.title}</div>
                          {rep.author && (
                            <div style={{ color: DIM, fontSize: 9 }}>by {rep.author}</div>
                          )}
                          {rep.summary && (
                            <div style={{ color: DIM, fontSize: 9, lineHeight: 1.3, marginTop: 2 }}>
                              {rep.summary.slice(0, 100)}{rep.summary.length > 100 ? "…" : ""}
                            </div>
                          )}
                        </div>
                        <span style={{ color: DIM, fontSize: 9, flexShrink: 0 }}>{rep.hits}↑</span>
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
