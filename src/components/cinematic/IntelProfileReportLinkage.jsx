/**
 * IntelProfileReportLinkage — F70
 * ◈ IPRLINK button (left:983800, bottom:8, zIndex:134)
 * parallel-fetches /entities/IntelProfile + /v1/reports
 * keyword-correlates each intel profile (name/aliases/org/role/tags)
 * against report titles/descriptions/tags/type to classify
 * DOCUMENTED (≥1 report match) vs UNREPORTED (intelligence gap)
 * amber badge on unreported count; filter tabs ALL/DOCUMENTED/UNREPORTED
 * expand profile → matched report cards with type badge + relevance bar
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence threat-actor coverage brief + TTS
 * voice trigger: "iprlink/intel profile report/threat actor report/documented actor/unreported actor/actor coverage/threat coverage report"
 * jarvis:iprlink-toggle event; 90-s auto-refresh
 */
import { useEffect, useState, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AM = "#F59E0B";
const GR = "#10B981";
const RD = "#EF4444";
const PU = "#A78BFA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const IPRLINK_RE =
  /\biprlink\b|\bintel.profile.report|\bthreat.actor.report|\bdocumented.actor|\bunreported.actor|\bactor.coverage|\bthreat.coverage.report|\bprofile.report.link|\bactor.report.gap/i;

export function isIprlinkQuery(text) {
  return IPRLINK_RE.test(text || "");
}

function tokenise(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

const STOP = new Set([
  "the", "and", "for", "are", "was", "were", "has", "have", "had",
  "not", "but", "with", "this", "that", "from", "will", "can",
  "its", "any", "all", "new", "our", "your", "their", "about",
]);

function relevance(profile, report) {
  const profileTokens = new Set(
    tokenise(
      `${profile.name || ""} ${(profile.aliases || []).join(" ")} ${profile.org || ""} ${profile.role || ""} ${(profile.tags || []).join(" ")}`
    ).filter((t) => !STOP.has(t))
  );
  const reportTokens = tokenise(
    `${report.title || ""} ${report.description || ""} ${(report.tags || []).join(" ")} ${report.type || ""} ${report.author || ""}`
  ).filter((t) => !STOP.has(t));

  if (!profileTokens.size || !reportTokens.length) return 0;
  const matches = reportTokens.filter((t) => profileTokens.has(t)).length;
  return Math.round((matches / Math.max(profileTokens.size, 1)) * 100);
}

export async function buildIprlinkScript() {
  const base = apiBase();
  const [profilesRes, reportsRes] = await Promise.all([
    fetch(`${base}/entities/IntelProfile`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    fetch(`${base}/v1/reports`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
  ]);
  const profilesData = await profilesRes.json();
  const reportsData = await reportsRes.json();
  const profiles = Array.isArray(profilesData) ? profilesData : (profilesData.items || profilesData.data || []);
  const reports = Array.isArray(reportsData) ? reportsData : (reportsData.items || reportsData.data || []);
  const documented = profiles.filter((p) =>
    reports.some((r) => relevance(p, r) > 0)
  ).length;
  const unreported = profiles.length - documented;
  return `Intel Profile Report Linkage analysis complete, sir. Of ${profiles.length} tracked threat actor profiles, ${documented} are documented in the intelligence report archive, while ${unreported} remain unreported — representing active intelligence coverage gaps requiring immediate attention.`;
}

export default function IntelProfileReportLinkage() {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState("");
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    try {
      const base = apiBase();
      const [pRes, rRes] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/reports`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const pData = await pRes.json();
      const rData = await rRes.json();
      setProfiles(Array.isArray(pData) ? pData : (pData.items || pData.data || []));
      setReports(Array.isArray(rData) ? rData : (rData.items || rData.data || []));
    } catch {
      // silently retain prior state
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:iprlink-toggle", onToggle);
    return () => window.removeEventListener("jarvis:iprlink-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const enriched = profiles.map((p) => {
    const matched = reports
      .map((r) => ({ ...r, score: relevance(p, r) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...p, matched, status: matched.length > 0 ? "DOCUMENTED" : "UNREPORTED" };
  });

  const documented = enriched.filter((p) => p.status === "DOCUMENTED").length;
  const unreported = enriched.filter((p) => p.status === "UNREPORTED").length;

  const visible = enriched
    .filter((p) => {
      if (filter === "DOCUMENTED") return p.status === "DOCUMENTED";
      if (filter === "UNREPORTED") return p.status === "UNREPORTED";
      return true;
    })
    .filter((p) =>
      !search ||
      (p.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.role || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.org || "").toLowerCase().includes(search.toLowerCase())
    );

  async function assess() {
    setAssessing(true);
    try {
      const base = apiBase();
      const context = `Intel profiles: ${profiles.length}. Reports: ${reports.length}. Documented actors: ${documented}. Unreported actors (coverage gaps): ${unreported}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Assess threat actor report coverage. ${context} Which gaps are most critical?` }),
      });
      const d = await r.json();
      const text = (d.answer || "").trim();
      setBrief(text);
      if (text) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  function typeColor(type) {
    if (!type) return CY;
    const t = type.toLowerCase();
    if (t.includes("threat")) return RD;
    if (t.includes("intel")) return PU;
    if (t.includes("ops")) return CY;
    if (t.includes("knowledge")) return GR;
    return AM;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Intel Profile × Report Linkage (IPRLINK)"
        style={{
          position: "fixed", left: 983800, bottom: 8, zIndex: 134,
          background: "rgba(5,8,13,0.75)", border: `1px solid ${AM}`,
          color: AM, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
          letterSpacing: 1,
        }}
      >
        ◈ IPRLINK{unreported > 0 && (
          <span style={{ marginLeft: 5, background: AM, color: "#000", borderRadius: 3, padding: "1px 4px", fontSize: 9 }}>
            {unreported}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh",
      background: "rgba(0,0,0,0.82)", zIndex: 134, display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'JetBrains Mono',monospace",
    }}>
      <div style={{
        background: "rgba(8,14,22,0.97)", border: `1px solid ${AM}44`,
        borderRadius: 14, padding: "20px 24px", width: "min(820px,94vw)",
        maxHeight: "88vh", overflowY: "auto", boxShadow: `0 0 60px ${AM}22`,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <span style={{ color: AM, fontWeight: 700, letterSpacing: 3, fontSize: 13 }}>◈ IPRLINK</span>
            <span style={{ color: "#607080", fontSize: 10, marginLeft: 10 }}>IntelProfile × Report Linkage</span>
          </div>
          <button onClick={() => setOpen(false)} style={{ color: "#607080", background: "none", border: "none", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          {[
            { label: "PROFILES", val: profiles.length, c: CY },
            { label: "REPORTS", val: reports.length, c: CY },
            { label: "DOCUMENTED", val: documented, c: GR },
            { label: "UNREPORTED", val: unreported, c: AM },
          ].map(({ label, val, c }) => (
            <div key={label} style={{
              flex: "1 1 130px", background: "rgba(255,255,255,0.03)", border: `1px solid ${c}33`,
              borderRadius: 8, padding: "8px 12px", textAlign: "center",
            }}>
              <div style={{ color: c, fontSize: 20, fontWeight: 700 }}>{val}</div>
              <div style={{ color: "#607080", fontSize: 9, letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Coverage bar */}
        {profiles.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#607080", marginBottom: 4 }}>
              <span>COVERAGE</span>
              <span>{Math.round((documented / profiles.length) * 100)}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
              <div style={{
                height: "100%", borderRadius: 2,
                width: `${Math.round((documented / profiles.length) * 100)}%`,
                background: documented / profiles.length > 0.7 ? GR : documented / profiles.length > 0.4 ? AM : RD,
              }} />
            </div>
          </div>
        )}

        {/* Filter + Search */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          {["ALL", "DOCUMENTED", "UNREPORTED"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              background: filter === f ? AM : "rgba(255,255,255,0.04)",
              color: filter === f ? "#000" : "#607080",
              border: `1px solid ${filter === f ? AM : "rgba(255,255,255,0.1)"}`,
              borderRadius: 4, padding: "3px 10px", fontSize: 10, cursor: "pointer", letterSpacing: 1,
            }}>{f}</button>
          ))}
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="search profiles…"
            style={{
              flex: 1, minWidth: 160, background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4,
              color: "#DCEBF5", padding: "3px 8px", fontSize: 10,
            }}
          />
          <button onClick={() => { setAssessing(true); assess(); }} disabled={assessing} style={{
            background: assessing ? "rgba(255,255,255,0.04)" : AM, color: assessing ? "#607080" : "#000",
            border: `1px solid ${AM}`, borderRadius: 4, padding: "3px 12px", fontSize: 10,
            cursor: assessing ? "default" : "pointer", letterSpacing: 1,
          }}>
            {assessing ? "…" : "▶ ASSESS COVERAGE"}
          </button>
        </div>

        {brief && (
          <div style={{
            background: "rgba(247,179,11,0.07)", border: `1px solid ${AM}44`,
            borderRadius: 6, padding: "8px 12px", marginBottom: 12, color: "#DCEBF5", fontSize: 11,
          }}>{brief}</div>
        )}

        {loading && <div style={{ color: "#607080", fontSize: 11, textAlign: "center", padding: 20 }}>loading…</div>}

        {/* Profile list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((p) => {
            const isExp = expanded === (p.id || p.name);
            const borderC = p.status === "DOCUMENTED" ? GR : AM;
            return (
              <div key={p.id || p.name} style={{
                background: "rgba(255,255,255,0.03)", border: `1px solid ${borderC}33`,
                borderRadius: 8, overflow: "hidden",
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : (p.id || p.name))}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer" }}
                >
                  <span style={{
                    fontSize: 9, letterSpacing: 1, padding: "2px 6px", borderRadius: 3,
                    background: p.status === "DOCUMENTED" ? `${GR}22` : `${AM}22`,
                    color: p.status === "DOCUMENTED" ? GR : AM, border: `1px solid ${borderC}44`,
                  }}>{p.status}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#DCEBF5", fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name || "Unnamed Profile"}
                    </div>
                    <div style={{ color: "#607080", fontSize: 10 }}>
                      {p.role || "unknown role"}{p.org ? ` · ${p.org}` : ""}
                    </div>
                  </div>
                  <span style={{ color: "#607080", fontSize: 10 }}>{p.matched.length} report{p.matched.length !== 1 ? "s" : ""}</span>
                  <span style={{ color: "#607080", fontSize: 12 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ padding: "0 14px 12px" }}>
                    {p.matched.length === 0 ? (
                      <div style={{ color: AM, fontSize: 11, padding: "8px 0" }}>
                        ⚠ No intelligence reports reference this actor — coverage gap.
                      </div>
                    ) : (
                      p.matched.map((r) => (
                        <div key={r.id || r.title} style={{
                          background: "rgba(255,255,255,0.03)", border: `1px solid rgba(255,255,255,0.06)`,
                          borderRadius: 6, padding: "8px 12px", marginBottom: 6,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{
                              fontSize: 9, padding: "1px 5px", borderRadius: 3,
                              background: `${typeColor(r.type)}22`, color: typeColor(r.type),
                              border: `1px solid ${typeColor(r.type)}44`,
                            }}>{r.type || "REPORT"}</span>
                            <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {r.title || "Untitled Report"}
                            </span>
                            <span style={{ color: "#607080", fontSize: 9 }}>score {r.score}</span>
                          </div>
                          <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                            <div style={{ height: "100%", borderRadius: 2, width: `${Math.min(r.score, 100)}%`, background: typeColor(r.type) }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!loading && visible.length === 0 && (
          <div style={{ color: "#607080", fontSize: 11, textAlign: "center", padding: 20 }}>
            No profiles match the current filter.
          </div>
        )}

        <div style={{ marginTop: 14, fontSize: 9, color: "#607080", textAlign: "right" }}>
          auto-refresh 90s · {profiles.length} profiles · {reports.length} reports
        </div>
      </div>
    </div>
  );
}
