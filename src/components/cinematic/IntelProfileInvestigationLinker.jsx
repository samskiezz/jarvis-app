/**
 * IntelProfileInvestigationLinker — F82.
 *
 * Parallel-fetches /entities/IntelProfile + /v1/investigations and
 * keyword-correlates each intel profile against the open investigations
 * catalogue to surface INVESTIGATED profiles (at least one active case)
 * vs UNTRACKED profiles (known threat actor with zero investigation coverage).
 *
 * Stat tiles: profiles / investigations / investigated / untracked
 * Filter tabs: ALL / INVESTIGATED / UNTRACKED + text search
 * Expand any profile → matched investigations with status badge + relevance score
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence threat-investigation brief + TTS
 *
 * Toggle: ◈ IPINV at left:21120, zIndex 65.
 * Voice: "intel investigation" / "profile investigation" / "threat investigation" /
 *        "which intel profiles have cases" / "ipinv"
 * Auto-refresh: 300 s (5 min).
 *
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GREEN = "#00c878";
const AMBER = "#F5A623";
const RED = "#FF3D5A";
const VIOLET = "#A78BFA";
const BTN_LEFT = 21120;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isIpinvQuery(q) {
  return /intel.{0,20}invest|invest.{0,20}intel|profile.{0,15}invest|invest.{0,15}profile|threat.{0,15}invest|which\s+intel.{0,20}case|ipinv\b/i.test(
    q || ""
  );
}

export async function buildIpinvScript() {
  try {
    const [pr, ir] = await Promise.all([
      fetch(`${apiBase()}/entities/IntelProfile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({}),
      }),
      fetch(`${apiBase()}/v1/investigations`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const profiles = normaliseArray(pr.ok ? await pr.json() : []);
    const investigations = normaliseArray(ir.ok ? await ir.json() : []);
    const links = buildLinks(profiles, investigations);
    const investigatedIds = new Set(links.map((l) => l.profileId));
    const untracked = profiles.length - investigatedIds.size;
    window.dispatchEvent(new CustomEvent("jarvis:ipinv-toggle"));
    if (!profiles.length)
      return "No intel profiles found, sir. The threat registry appears empty.";
    return (
      `Intel profile investigation coverage active, sir. ` +
      `${profiles.length} intel profile${profiles.length !== 1 ? "s" : ""} cross-referenced ` +
      `against ${investigations.length} investigation${investigations.length !== 1 ? "s" : ""}. ` +
      `${investigatedIds.size} profile${investigatedIds.size !== 1 ? "s" : ""} ` +
      `${investigatedIds.size === 1 ? "has" : "have"} active case coverage. ` +
      `${untracked} threat actor${untracked !== 1 ? "s" : ""} ${untracked === 1 ? "is" : "are"} ` +
      `untracked — no open investigation found. Select a profile to review matched cases.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:ipinv-toggle"));
    return "Intel profile investigation linker open, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function IntelProfileInvestigationLinker() {
  const [visible, setVisible] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [aiMap, setAiMap] = useState({});
  const [aiLoading, setAiLoading] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [pr, ir] = await Promise.all([
        fetch(`${apiBase()}/entities/IntelProfile`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({}),
        }),
        fetch(`${apiBase()}/v1/investigations`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      const rawProfiles = normaliseArray(pr.ok ? await pr.json() : []);
      const rawInvestigations = normaliseArray(ir.ok ? await ir.json() : []);
      setProfiles(rawProfiles);
      setInvestigations(rawInvestigations);
      setLinks(buildLinks(rawProfiles, rawInvestigations));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:ipinv-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ipinv-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, 300_000);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessLink(profile, inv) {
    const key = `${profile.id || profile._id || profile.name}::${inv.id || inv._id || inv.title}`;
    if (aiMap[key] || aiLoading === key) return;
    setAiLoading(key);
    const profName =
      profile.name || profile.title || profile.alias || "Unknown Profile";
    const invTitle = inv.title || inv.name || inv.case_number || "Unknown Investigation";
    const invStatus = inv.status || inv.state || "";
    const prompt =
      `As JARVIS, provide a 2-sentence assessment of the operational significance of ` +
      `investigating intel profile "${profName}" under case "${invTitle}" ` +
      `(status: ${invStatus || "unknown"}). Be direct and intelligence-focused.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAiMap((prev) => ({ ...prev, [key]: answer }));
      if (answer)
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
        );
    } catch (_) {
      setAiMap((prev) => ({ ...prev, [key]: "Unable to reach reasoning core." }));
    } finally {
      setAiLoading(null);
    }
  }

  const investigatedIds = new Set(links.map((l) => l.profileId));
  const untrackedCount = profiles.length - investigatedIds.size;

  const filtered = profiles
    .filter((p) => {
      const pid = p.id || p._id || p.name;
      if (filter === "investigated") return investigatedIds.has(pid);
      if (filter === "untracked") return !investigatedIds.has(pid);
      return true;
    })
    .filter((p) => {
      if (!search.trim()) return true;
      const txt = [
        p.name || "",
        p.title || "",
        p.alias || "",
        p.type || "",
        p.description || "",
        p.threat_level || "",
        p.organization || "",
        ...(Array.isArray(p.aliases) ? p.aliases : []),
      ]
        .join(" ")
        .toLowerCase();
      return txt.includes(search.toLowerCase());
    });

  const selectedLinks = selected
    ? links.filter(
        (l) => l.profileId === (selected.id || selected._id || selected.name)
      )
    : [];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Intel Profile × Investigation Linker"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 65,
          height: 26,
          padding: "0 8px",
          background: visible ? `${VIOLET}22` : "rgba(8,14,22,0.82)",
          border: `1px solid ${visible ? VIOLET : "#2A3A4A"}`,
          borderRadius: 5,
          color: visible ? VIOLET : "#6E8AA0",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {untrackedCount > 0 && !visible && (
          <span
            style={{
              display: "inline-block",
              marginRight: 5,
              background: AMBER,
              color: "#000",
              borderRadius: "50%",
              width: 14,
              height: 14,
              fontSize: 9,
              lineHeight: "14px",
              textAlign: "center",
            }}
          >
            {untrackedCount}
          </span>
        )}
        ◈ IPINV
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 44,
            left: Math.min(BTN_LEFT, window.innerWidth - 660),
            zIndex: 65,
            width: 640,
            maxHeight: "75vh",
            display: "flex",
            flexDirection: "column",
            background: "rgba(4,10,18,0.96)",
            border: `1px solid ${VIOLET}44`,
            borderTop: `2px solid ${VIOLET}`,
            borderRadius: 12,
            boxShadow: `0 0 40px ${VIOLET}14, 0 8px 32px rgba(0,0,0,0.75)`,
            fontFamily: "'JetBrains Mono', monospace",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderBottom: `1px solid ${VIOLET}22`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: VIOLET, fontSize: 13 }}>◈</span>
            <span
              style={{
                color: VIOLET,
                fontSize: 11,
                letterSpacing: 2,
                fontWeight: 700,
              }}
            >
              INTEL PROFILE × INVESTIGATION LINKER
            </span>
            {loading && (
              <span style={{ marginLeft: "auto", color: "#6E8AA0", fontSize: 10 }}>
                loading…
              </span>
            )}
            <button
              onClick={() => setVisible(false)}
              style={{
                marginLeft: loading ? 0 : "auto",
                background: "transparent",
                border: "none",
                color: "#6E8AA0",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "8px 14px",
              borderBottom: `1px solid #1A2A3A`,
              flexShrink: 0,
            }}
          >
            {[
              { label: "PROFILES", val: profiles.length, col: VIOLET },
              { label: "INVESTIGATIONS", val: investigations.length, col: CY },
              { label: "INVESTIGATED", val: investigatedIds.size, col: GREEN },
              { label: "UNTRACKED", val: untrackedCount, col: AMBER },
            ].map((t) => (
              <div
                key={t.label}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid #1A2A3A",
                  borderRadius: 6,
                  padding: "5px 8px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 14, color: t.col, fontWeight: 700 }}>
                  {t.val}
                </div>
                <div
                  style={{
                    fontSize: 8,
                    color: "#4E6A7A",
                    letterSpacing: 1,
                    marginTop: 1,
                  }}
                >
                  {t.label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "7px 14px",
              borderBottom: `1px solid #1A2A3A`,
              flexShrink: 0,
              alignItems: "center",
            }}
          >
            {["all", "investigated", "untracked"].map((f) => (
              <button
                key={f}
                onClick={() => {
                  setFilter(f);
                  setSelected(null);
                }}
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  border: `1px solid ${filter === f ? VIOLET : "#2A3A4A"}`,
                  background: filter === f ? `${VIOLET}22` : "transparent",
                  color: filter === f ? VIOLET : "#6E8AA0",
                  fontSize: 10,
                  letterSpacing: 1,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textTransform: "uppercase",
                }}
              >
                {f}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: `1px solid #2A3A4A`,
                borderRadius: 4,
                padding: "2px 8px",
                color: "#DCEBF5",
                fontSize: 10,
                fontFamily: "inherit",
                width: 120,
                outline: "none",
              }}
            />
          </div>

          {/* Split body */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            {/* Profile list (left) */}
            <div
              style={{
                width: 240,
                borderRight: `1px solid #1A2A3A`,
                overflowY: "auto",
                flexShrink: 0,
              }}
            >
              {!loading && filtered.length === 0 && (
                <div style={{ padding: 14, color: "#6E8AA0", fontSize: 10 }}>
                  No profiles in this filter.
                </div>
              )}
              {filtered.map((p) => {
                const pid = p.id || p._id || p.name;
                const isInvestigated = investigatedIds.has(pid);
                const isActive =
                  selected &&
                  (selected.id || selected._id || selected.name) === pid;
                const threat = (
                  p.threat_level ||
                  p.threat ||
                  p.risk_level ||
                  ""
                )
                  .toString()
                  .toUpperCase();
                const threatColor =
                  threat === "CRITICAL" || threat === "HIGH"
                    ? RED
                    : threat === "MEDIUM"
                    ? AMBER
                    : threat === "LOW"
                    ? GREEN
                    : "#4E6A7A";
                return (
                  <div
                    key={pid}
                    onClick={() => setSelected(p)}
                    style={{
                      padding: "9px 12px",
                      borderBottom: `1px solid #0E1A26`,
                      cursor: "pointer",
                      background: isActive ? `${VIOLET}12` : "transparent",
                      borderLeft: isActive
                        ? `3px solid ${VIOLET}`
                        : "3px solid transparent",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        marginBottom: 3,
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: isInvestigated ? GREEN : "#2A3A4A",
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 10,
                          color: "#DCEBF5",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.name || p.title || p.alias || pid}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 5, paddingLeft: 12 }}>
                      {p.type && (
                        <span
                          style={{
                            fontSize: 8,
                            color: VIOLET,
                            letterSpacing: 1,
                            padding: "1px 4px",
                            border: `1px solid ${VIOLET}44`,
                            borderRadius: 3,
                          }}
                        >
                          {p.type}
                        </span>
                      )}
                      {threat && (
                        <span
                          style={{
                            fontSize: 8,
                            color: threatColor,
                            letterSpacing: 1,
                            padding: "1px 4px",
                            border: `1px solid ${threatColor}44`,
                            borderRadius: 3,
                          }}
                        >
                          {threat}
                        </span>
                      )}
                      {isInvestigated ? (
                        <span
                          style={{
                            fontSize: 8,
                            color: GREEN,
                            letterSpacing: 1,
                          }}
                        >
                          {
                            links.filter((l) => l.profileId === pid).length
                          }{" "}
                          case
                          {links.filter((l) => l.profileId === pid).length !== 1
                            ? "s"
                            : ""}
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 8,
                            color: AMBER,
                            letterSpacing: 1,
                          }}
                        >
                          UNTRACKED
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Investigation detail pane (right) */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {!selected && (
                <div
                  style={{
                    padding: 20,
                    color: "#6E8AA0",
                    fontSize: 10,
                    lineHeight: 1.6,
                  }}
                >
                  Select an intel profile to see matched investigations.
                </div>
              )}
              {selected && selectedLinks.length === 0 && (
                <div style={{ padding: 20, color: "#6E8AA0", fontSize: 10 }}>
                  No matching investigations for this profile. Threat actor is
                  UNTRACKED — no open case found.
                </div>
              )}
              {selected && selectedLinks.length > 0 && (
                <div>
                  <div
                    style={{
                      padding: "8px 14px",
                      borderBottom: `1px solid #1A2A3A`,
                      color: GREEN,
                      fontSize: 10,
                      letterSpacing: 1,
                      fontWeight: 700,
                    }}
                  >
                    {selectedLinks.length} CASE
                    {selectedLinks.length !== 1 ? "S" : ""} FOR "
                    {(
                      selected.name ||
                      selected.title ||
                      selected.alias ||
                      "PROFILE"
                    ).toUpperCase()}
                    "
                  </div>
                  {selectedLinks.map((link, i) => {
                    const inv = link.investigation;
                    const invId =
                      inv.id || inv._id || inv.title || inv.case_number;
                    const aiKey = `${
                      selected.id || selected._id || selected.name
                    }::${invId}`;
                    const aiText = aiMap[aiKey];
                    const isLoadingThis = aiLoading === aiKey;
                    const status = (
                      inv.status ||
                      inv.state ||
                      ""
                    )
                      .toString()
                      .toUpperCase();
                    const statusColor =
                      status === "OPEN" || status === "ACTIVE"
                        ? CY
                        : status === "INVESTIGATING"
                        ? AMBER
                        : status === "CLOSED"
                        ? "#4E6A7A"
                        : VIOLET;
                    return (
                      <div
                        key={`${aiKey}-${i}`}
                        style={{
                          padding: "10px 14px",
                          borderBottom: `1px solid #0E1A26`,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 8,
                            marginBottom: 5,
                          }}
                        >
                          <span
                            style={{
                              color: CY,
                              fontSize: 12,
                              marginTop: 1,
                              flexShrink: 0,
                            }}
                          >
                            ◉
                          </span>
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontSize: 11,
                                color: "#DCEBF5",
                                marginBottom: 2,
                              }}
                            >
                              {inv.title ||
                                inv.name ||
                                inv.case_number ||
                                invId}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 6,
                                flexWrap: "wrap",
                              }}
                            >
                              {status && (
                                <span
                                  style={{
                                    fontSize: 8,
                                    color: statusColor,
                                    letterSpacing: 1,
                                    padding: "1px 4px",
                                    border: `1px solid ${statusColor}44`,
                                    borderRadius: 3,
                                  }}
                                >
                                  {status}
                                </span>
                              )}
                              {inv.type && (
                                <span
                                  style={{
                                    fontSize: 8,
                                    color: VIOLET,
                                    letterSpacing: 1,
                                    padding: "1px 4px",
                                    border: `1px solid ${VIOLET}44`,
                                    borderRadius: 3,
                                  }}
                                >
                                  {inv.type}
                                </span>
                              )}
                              <span
                                style={{
                                  fontSize: 8,
                                  color: "#4E6A7A",
                                  letterSpacing: 1,
                                }}
                              >
                                [{link.matchScore} keyword match
                                {link.matchScore !== 1 ? "es" : ""}]
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => assessLink(selected, inv)}
                            disabled={isLoadingThis || !!aiText}
                            style={{
                              flexShrink: 0,
                              padding: "2px 8px",
                              borderRadius: 4,
                              border: `1px solid ${
                                aiText ? GREEN + "66" : CY + "66"
                              }`,
                              background: aiText
                                ? `${GREEN}12`
                                : isLoadingThis
                                ? `${CY}22`
                                : "transparent",
                              color: aiText ? GREEN : CY,
                              fontSize: 9,
                              letterSpacing: 1,
                              cursor:
                                isLoadingThis || aiText ? "default" : "pointer",
                              fontFamily: "inherit",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {aiText
                              ? "✓ ASSESSED"
                              : isLoadingThis
                              ? "consulting…"
                              : "▶ ASSESS"}
                          </button>
                        </div>
                        {inv.description && (
                          <div
                            style={{
                              marginLeft: 20,
                              marginBottom: 5,
                              fontSize: 10,
                              color: "#4E8A9A",
                              lineHeight: 1.5,
                              maxHeight: 48,
                              overflow: "hidden",
                            }}
                          >
                            {String(inv.description).slice(0, 180)}…
                          </div>
                        )}
                        {aiText && (
                          <div
                            style={{
                              marginLeft: 20,
                              marginTop: 5,
                              padding: "6px 10px",
                              background: `${GREEN}0A`,
                              border: `1px solid ${GREEN}22`,
                              borderRadius: 5,
                              fontSize: 10,
                              color: "#A0D8B0",
                              lineHeight: 1.5,
                            }}
                          >
                            <span
                              style={{
                                color: GREEN,
                                fontSize: 8,
                                letterSpacing: 1,
                                fontWeight: 700,
                                display: "block",
                                marginBottom: 3,
                              }}
                            >
                              JARVIS ASSESSMENT
                            </span>
                            {aiText}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "5px 14px",
              borderTop: `1px solid ${VIOLET}18`,
              fontSize: 10,
              color: "#4E6A7A",
              letterSpacing: 1,
              flexShrink: 0,
            }}
          >
            /entities/IntelProfile + /v1/investigations · 5-min auto-refresh ·
            click ▶ ASSESS for AI brief
          </div>
        </div>
      )}
    </>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of [
      "items",
      "results",
      "data",
      "profiles",
      "investigations",
      "cases",
      "records",
      "nodes",
    ]) {
      if (Array.isArray(data[k])) return data[k];
    }
  }
  return [];
}

function keywords(str) {
  if (!str) return [];
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function buildLinks(profiles, investigations) {
  if (!profiles.length || !investigations.length) return [];
  const results = [];
  for (const p of profiles) {
    const pid = p.id || p._id || p.name;
    const pText = [
      p.name || "",
      p.title || "",
      p.alias || "",
      p.description || "",
      p.type || "",
      p.organization || "",
      ...(Array.isArray(p.aliases) ? p.aliases : []),
      ...(Array.isArray(p.tags) ? p.tags : []),
    ].join(" ");
    const pKws = keywords(pText);
    if (!pKws.length) continue;
    for (const inv of investigations) {
      const invText = [
        inv.title || "",
        inv.name || "",
        inv.case_number || "",
        inv.description || "",
        inv.type || "",
        inv.subject || "",
        ...(Array.isArray(inv.tags) ? inv.tags : []),
        ...(Array.isArray(inv.entities) ? inv.entities.join(" ") : []),
      ].join(" ");
      const invKws = keywords(invText);
      const score = pKws.filter((w) => invKws.includes(w)).length;
      if (score >= 1)
        results.push({ profileId: pid, investigation: inv, matchScore: score });
    }
  }
  results.sort((a, b) => b.matchScore - a.matchScore);
  return results;
}
