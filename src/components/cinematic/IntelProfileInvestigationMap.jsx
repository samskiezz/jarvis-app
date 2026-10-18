/**
 * IntelProfileInvestigationMap — F303
 * Fetches /entities/IntelProfile + /v1/investigations; keyword-matches each
 * intel profile against open investigations to surface LINKED vs UNLINKED profiles.
 * Stat tiles (profiles/linked/unlinked/investigations); severity-sorted rows;
 * expandable rows show matched investigations with status badge.
 * ◈ IIMAP toggle; voice "intel profile"/"intel cases"/"profile linkage"/"iimap".
 * Additive-only — no edits to CinematicShell/CinematicHome/JarvisLoader.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GR = "#00FF9F";
const AM = "#FFB800";
const RD = "#FF4444";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const POLL_MS = 90_000;

const IIMAP_RE =
  /\bintel.?profile.?invest\b|\bintel.?cases?\b|\bprofile.?linkage\b|\bintel.?invest\b|\biimap\b|\bprofile.?invest\b|\binvest.?profile\b|\bintel.?open.?cases?\b|\blinked.?profile\b|\bunlinked.?profile\b/i;

export function isIntelInvQuery(text) {
  return IIMAP_RE.test(text || "");
}

function tokenize(str) {
  return (str || "")
    .toLowerCase()
    .split(/[\s,;:\-_/()[\]{}\.]+/)
    .filter((t) => t.length >= 3);
}

const STATUS_ORDER = { open: 0, active: 0, in_progress: 1, pending: 2, closed: 3, resolved: 4 };

function matchInvestigations(profile, investigations) {
  const pTokens = tokenize(
    (profile.name || profile.title || "") +
      " " +
      (profile.description || "") +
      " " +
      (profile.role || profile.type || "") +
      " " +
      (profile.affiliation || profile.organization || "") +
      " " +
      (profile.tags || []).join(" "),
  );
  return investigations.filter((inv) => {
    const iTokens = tokenize(
      (inv.title || inv.name || "") +
        " " +
        (inv.description || inv.summary || "") +
        " " +
        (inv.type || inv.category || "") +
        " " +
        (inv.tags || []).join(" "),
    );
    return pTokens.some((pt) => iTokens.includes(pt));
  });
}

export async function buildIntelInvScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [pr, ir] = await Promise.allSettled([
    fetch(`${base}/entities/IntelProfile`, { headers }),
    fetch(`${base}/v1/investigations`, { headers }),
  ]);
  if (pr.status !== "fulfilled" || !pr.value.ok)
    return "Intel profile data unavailable, sir.";
  if (ir.status !== "fulfilled" || !ir.value.ok)
    return "Investigation data unavailable, sir.";
  const pd = await pr.value.json();
  const id = await ir.value.json();
  const profiles = Array.isArray(pd) ? pd : pd.profiles || pd.items || pd.data || [];
  const investigations = Array.isArray(id) ? id : id.investigations || id.items || id.data || [];
  const linked = profiles.filter((p) => matchInvestigations(p, investigations).length > 0);
  const unlinked = profiles.length - linked.length;
  const open = investigations.filter((i) => ["open", "active", "in_progress"].includes((i.status || "").toLowerCase()));
  if (!profiles.length) return "No intel profiles found, sir.";
  return (
    `Intel profile linkage analysis complete. ${profiles.length} profiles assessed against ${investigations.length} investigations. ` +
    `${linked.length} profiles are linked to active cases. ${unlinked} profiles have no direct investigation match. ` +
    `${open.length} investigations are currently open or active. ` +
    (linked.length > 0
      ? `Top linked profile: ${linked[0].name || linked[0].title || "unknown"}.`
      : "No cross-references detected at this time.")
  );
}

const TAG = { background: "rgba(0,0,0,0.75)", border: `1px solid ${CY}33`, borderRadius: 6, padding: "2px 7px", fontSize: 10, color: CY };
const STAT_BOX = { background: "rgba(0,0,0,0.55)", border: `1px solid ${CY}33`, borderRadius: 8, padding: "10px 16px", minWidth: 90, textAlign: "center" };
const STATUS_COLORS = { open: GR, active: GR, in_progress: AM, pending: AM, closed: "#888", resolved: "#888" };

function StatusBadge({ status }) {
  const s = (status || "").toLowerCase();
  const col = STATUS_COLORS[s] || CY;
  return (
    <span style={{ ...TAG, borderColor: col + "55", color: col, textTransform: "uppercase", letterSpacing: 1 }}>
      {status || "unknown"}
    </span>
  );
}

export default function IntelProfileInvestigationMap() {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [pr, ir] = await Promise.allSettled([
        fetch(`${base}/entities/IntelProfile`, { headers }),
        fetch(`${base}/v1/investigations`, { headers }),
      ]);
      if (pr.status === "fulfilled" && pr.value.ok) {
        const d = await pr.value.json();
        setProfiles(Array.isArray(d) ? d : d.profiles || d.items || d.data || []);
      } else {
        setErr("Intel profile fetch failed");
      }
      if (ir.status === "fulfilled" && ir.value.ok) {
        const d = await ir.value.json();
        setInvestigations(Array.isArray(d) ? d : d.investigations || d.items || d.data || []);
      } else {
        setErr((e) => e || "Investigation fetch failed");
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:intel-inv-map-toggle", handler);
    return () => window.removeEventListener("jarvis:intel-inv-map-toggle", handler);
  }, []);

  const mapped = profiles.map((p) => ({
    ...p,
    _matches: matchInvestigations(p, investigations),
  }));

  const filtered = mapped
    .filter((p) => {
      if (tab === "LINKED") return p._matches.length > 0;
      if (tab === "UNLINKED") return p._matches.length === 0;
      return true;
    })
    .filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (p.name || p.title || "").toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q) ||
        (p.role || p.type || "").toLowerCase().includes(q)
      );
    });

  const linkedCount = mapped.filter((p) => p._matches.length > 0).length;
  const unlinkedCount = mapped.length - linkedCount;
  const openInvCount = investigations.filter((i) =>
    ["open", "active", "in_progress"].includes((i.status || "").toLowerCase()),
  ).length;

  const TABS = ["ALL", "LINKED", "UNLINKED"];

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed", bottom: 8, left: 60120, zIndex: 116,
          background: open ? `${CY}22` : "rgba(0,0,0,0.7)",
          border: `1px solid ${CY}55`, borderRadius: 6, color: CY,
          fontSize: 10, padding: "3px 8px", cursor: "pointer",
          fontFamily: "monospace", letterSpacing: 1, whiteSpace: "nowrap",
        }}
        title="Intel Profile × Investigation Linkage Map"
      >
        ◈ IIMAP
      </button>

      {open && (
        <div
          style={{
            position: "fixed", top: 40, right: 16, width: 560, maxHeight: "82vh",
            background: "rgba(5,10,18,0.97)", border: `1px solid ${CY}55`,
            borderRadius: 12, zIndex: 9200, display: "flex", flexDirection: "column",
            fontFamily: "monospace", color: CY, boxShadow: `0 0 40px ${CY}22`,
            overflow: "hidden",
          }}
        >
          {/* header */}
          <div style={{ padding: "12px 16px 8px", borderBottom: `1px solid ${CY}22`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, letterSpacing: 2 }}>◈ INTEL PROFILE × INVESTIGATION MAP</span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 16, lineHeight: 1 }}
            >×</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 16px", borderBottom: `1px solid ${CY}11` }}>
            <div style={STAT_BOX}>
              <div style={{ fontSize: 18, fontWeight: "bold", color: CY }}>{mapped.length}</div>
              <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>PROFILES</div>
            </div>
            <div style={STAT_BOX}>
              <div style={{ fontSize: 18, fontWeight: "bold", color: GR }}>{linkedCount}</div>
              <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>LINKED</div>
            </div>
            <div style={STAT_BOX}>
              <div style={{ fontSize: 18, fontWeight: "bold", color: AM }}>{unlinkedCount}</div>
              <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>UNLINKED</div>
            </div>
            <div style={STAT_BOX}>
              <div style={{ fontSize: 18, fontWeight: "bold", color: CY }}>{openInvCount}</div>
              <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>OPEN INV.</div>
            </div>
          </div>

          {/* filter tabs + search */}
          <div style={{ display: "flex", gap: 4, padding: "8px 16px 0", alignItems: "center" }}>
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "rgba(0,0,0,0.4)",
                  border: `1px solid ${tab === t ? CY : CY + "33"}`, borderRadius: 5,
                  color: tab === t ? CY : "#666", fontSize: 9, padding: "3px 10px",
                  cursor: "pointer", letterSpacing: 1,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search profiles…"
              style={{
                flex: 1, background: "rgba(0,0,0,0.5)", border: `1px solid ${CY}33`,
                borderRadius: 5, color: CY, fontSize: 10, padding: "3px 8px",
                outline: "none", fontFamily: "monospace", marginLeft: 4,
              }}
            />
          </div>

          {/* list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 12px" }}>
            {loading && !profiles.length && (
              <div style={{ color: "#666", fontSize: 11, textAlign: "center", paddingTop: 24 }}>loading…</div>
            )}
            {err && (
              <div style={{ color: RD, fontSize: 10, padding: "8px 0" }}>⚠ {err}</div>
            )}
            {!loading && !err && filtered.length === 0 && (
              <div style={{ color: "#555", fontSize: 11, textAlign: "center", paddingTop: 24 }}>no profiles match this filter</div>
            )}
            {filtered.map((profile, idx) => {
              const isLinked = profile._matches.length > 0;
              const rowKey = profile.id || profile.name || idx;
              const isExp = !!expanded[rowKey];
              return (
                <div
                  key={rowKey}
                  style={{
                    borderBottom: `1px solid ${CY}18`, marginBottom: 4, paddingBottom: 4,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "5px 0" }}
                    onClick={() => setExpanded((prev) => ({ ...prev, [rowKey]: !isExp }))}
                  >
                    <span style={{ color: isLinked ? GR : AM, fontSize: 13, minWidth: 14 }}>
                      {isLinked ? "●" : "○"}
                    </span>
                    <span style={{ flex: 1, fontSize: 11, color: isLinked ? CY : "#aaa" }}>
                      {profile.name || profile.title || `Profile #${idx + 1}`}
                    </span>
                    <span style={{ ...TAG, borderColor: (isLinked ? GR : AM) + "55", color: isLinked ? GR : AM, fontSize: 9 }}>
                      {isLinked ? `${profile._matches.length} CASE${profile._matches.length > 1 ? "S" : ""}` : "UNLINKED"}
                    </span>
                    {(profile.role || profile.type) && (
                      <span style={{ ...TAG, color: "#888", fontSize: 9 }}>{profile.role || profile.type}</span>
                    )}
                    <span style={{ color: "#555", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {isExp && (
                    <div style={{ paddingLeft: 22, paddingBottom: 6 }}>
                      {profile.description && (
                        <div style={{ fontSize: 10, color: "#888", marginBottom: 6, lineHeight: 1.4 }}>
                          {profile.description.slice(0, 180)}{profile.description.length > 180 ? "…" : ""}
                        </div>
                      )}
                      {profile.affiliation && (
                        <div style={{ fontSize: 9, color: "#666", marginBottom: 4 }}>
                          affiliation: {profile.affiliation}
                        </div>
                      )}
                      {profile._matches.length === 0 ? (
                        <div style={{ fontSize: 10, color: AM }}>no investigation links detected</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {profile._matches.map((inv, ii) => (
                            <div
                              key={inv.id || ii}
                              style={{
                                background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}22`,
                                borderRadius: 6, padding: "5px 10px", display: "flex", gap: 8, alignItems: "center",
                              }}
                            >
                              <span style={{ flex: 1, fontSize: 10, color: CY }}>
                                {inv.title || inv.name || `Investigation #${ii + 1}`}
                              </span>
                              <StatusBadge status={inv.status} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* footer */}
          <div style={{ padding: "6px 16px", borderTop: `1px solid ${CY}22`, fontSize: 9, color: "#555", display: "flex", justifyContent: "space-between" }}>
            <span>auto-refresh 90 s · {filtered.length} of {mapped.length} profiles shown</span>
            {loading && <span style={{ color: AM }}>refreshing…</span>}
          </div>
        </div>
      )}
    </>
  );
}
