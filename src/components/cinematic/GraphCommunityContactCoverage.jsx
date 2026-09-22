/**
 * F188 — Graph Community × Contact Coverage (GCONT)
 *
 * Parallel-fetches /v1/graph/communities and /entities/Contact, then
 * keyword-correlates each network community (label + member metadata) against
 * contact records (name, org, role, tags) to surface:
 *
 *   REPRESENTED   — at least one contact keyword-matches this community
 *   UNREPRESENTED — no contact record aligns with this community (coverage gap)
 *
 * Stat tiles: communities / contacts / represented / unrepresented
 * Filter tabs: ALL | REPRESENTED | UNREPRESENTED + text search
 * Expand community → matched contacts with role badge + relevance score.
 * Teal badge on represented count.
 * ▶ ASSESS: 2-sentence community-contact brief via /v1/jarvis/agent/chat +
 *   jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ GCONT  at bottom:8 left:66840, zIndex:129.
 * Event:   jarvis:gcont-toggle
 * Voice:   "community contact / graph contact / gcont / contact community /
 *           which communities have contacts / unrepresented communities /
 *           community representation"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 66840;
const POLL_MS  = 90_000;
const TEAL     = "#2DD4BF";
const SLATE    = "#6E8AA0";
const VIOLET   = "#A78BFA";
const AMBER    = "#F59E0B";
const GREEN    = "#34D399";
const CYAN     = "#29E7FF";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const GCONT_RE =
  /\b(community\s+contact[s]?|contact[s]?\s+community|gcont|graph\s+contact[s]?|contact[s]?\s+communit\w*|which\s+communit\w*\s+(have|has|lack[s]?|need[s]?)\s+contact[s]?|unrepresented\s+communit\w*|communit\w*\s+representation|communit\w*\s+without\s+contact[s]?)\b/i;

export function isGcontQuery(q) { return GCONT_RE.test(q); }

export async function buildGcontScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [commRes, contRes] = await Promise.all([
      fetch(`${base}/v1/graph/communities`, { headers: hdr }),
      fetch(`${base}/entities/Contact`,     { headers: hdr }),
    ]);
    const communities = normaliseCommunities(await commRes.json());
    const contacts    = normaliseContacts(await contRes.json());

    const represented   = communities.filter(
      (c) => contacts.some((ct) => relevance(c, ct) > 0)
    ).length;
    const unrepresented = communities.length - represented;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS graph-community contact coverage: ${communities.length} network communities ` +
          `cross-referenced against ${contacts.length} contact records. ` +
          `${represented} communities have at least one contact match (represented stakeholders); ` +
          `${unrepresented} communities have no contact alignment (representation gap). ` +
          `Provide a 2-sentence community-contact coverage brief — formal British butler tone, ` +
          `first person, highlight the representation gap if significant.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Community contact coverage analysis complete, sir.").trim();
  } catch {
    return "Community contact coverage assessment unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseCommunities(raw) {
  const arr = Array.isArray(raw)                    ? raw
    : Array.isArray(raw?.communities)               ? raw.communities
    : Array.isArray(raw?.items)                     ? raw.items
    : Array.isArray(raw?.data)                      ? raw.data
    : Array.isArray(raw?.results)                   ? raw.results
    : [];
  return arr.map((c, i) => ({
    id:      c.id          || c.community_id || String(i),
    label:   c.label       || c.name         || c.title    || `Community ${i + 1}`,
    members: Array.isArray(c.members)
      ? c.members.map((m) => (typeof m === "string" ? m : m?.id || m?.label || "")).join(" ")
      : (c.member_count != null ? `size:${c.member_count}` : ""),
    size:    c.size        || c.member_count || c.count    || null,
    type:    c.type        || c.cluster_type || c.category || "",
    tags:    Array.isArray(c.tags) ? c.tags.join(" ") : (c.tags || ""),
  }));
}

function normaliseContacts(raw) {
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.contacts)           ? raw.contacts
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((c, i) => ({
    id:    c.id           || c.contact_id    || String(i),
    name:  c.name         || c.full_name     || c.display_name  || `Contact ${i + 1}`,
    org:   c.org          || c.organisation  || c.organization   || c.company        || "",
    role:  c.role         || c.title         || c.position       || c.job_title      || "",
    email: c.email        || c.email_address || "",
    tags:  Array.isArray(c.tags) ? c.tags.join(" ") : (c.tags  || ""),
    notes: (c.notes       || c.bio           || c.summary        || "").toString().slice(0, 200),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"'%]+/)
    .filter((w) => w.length >= 3);
}

function relevance(community, contact) {
  const cw = keywords(
    `${community.label} ${community.members} ${community.type} ${community.tags}`
  );
  const ctw = keywords(
    `${contact.name} ${contact.org} ${contact.role} ${contact.email} ${contact.tags} ${contact.notes}`
  );
  return cw.filter((w) => ctw.some((p) => p.includes(w) || w.includes(p))).length;
}

function buildLinked(communities, contacts) {
  return communities.map((comm) => {
    const matched = contacts
      .map((ct) => ({ ...ct, score: relevance(comm, ct) }))
      .filter((ct) => ct.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...comm, contacts: matched, represented: matched.length > 0 };
  });
}

function fmtSize(size) {
  if (size == null) return null;
  const n = Number(size);
  if (isNaN(n)) return null;
  return `${n} node${n !== 1 ? "s" : ""}`;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "REPRESENTED", "UNREPRESENTED"];

export default function GraphCommunityContactCoverage() {
  const [open,         setOpen]         = useState(false);
  const [communities,  setCommunities]  = useState([]);
  const [contacts,     setContacts]     = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [filter,       setFilter]       = useState("ALL");
  const [search,       setSearch]       = useState("");
  const [expanded,     setExpanded]     = useState(null);
  const [assessing,    setAssessing]    = useState(false);
  const [lastFetch,    setLastFetch]    = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [commRes, contRes] = await Promise.all([
        fetch(`${base}/v1/graph/communities`, { headers: hdr }),
        fetch(`${base}/entities/Contact`,     { headers: hdr }),
      ]);
      setCommunities(normaliseCommunities(await commRes.json()));
      setContacts(normaliseContacts(await contRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:gcont-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gcont-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildGcontScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked        = buildLinked(communities, contacts);
  const represented   = linked.filter((c) => c.represented).length;
  const unrepresented = linked.length - represented;

  const displayed = linked.filter((c) => {
    if (filter === "REPRESENTED"   && !c.represented) return false;
    if (filter === "UNREPRESENTED" &&  c.represented) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      c.label.toLowerCase().includes(q) ||
      c.type.toLowerCase().includes(q)  ||
      c.tags.toLowerCase().includes(q)
    );
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Graph Community × Contact Coverage (GCONT)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 129,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${TEAL}55`,
          color: TEAL, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {represented > 0
          ? <><span style={{ background: TEAL, color: "#000", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{represented}</span>◈ GCONT</>
          : "◈ GCONT"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 129,
      width: 500, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${TEAL}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${TEAL}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${TEAL}33` }}>
        <span style={{ color: TEAL, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ GCONT</span>
        <span style={{ color: SLATE, fontSize: 9, flex: 1 }}>GRAPH COMMUNITY × CONTACT COVERAGE</span>
        {lastFetch && <span style={{ color: SLATE, fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: TEAL, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${TEAL}22` }}>
        {[
          { label: "COMMUNITIES",   value: linked.length,   col: SLATE  },
          { label: "CONTACTS",      value: contacts.length, col: VIOLET },
          { label: "REPRESENTED",   value: represented,     col: TEAL   },
          { label: "UNREPRESENTED", value: unrepresented,   col: AMBER  },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: SLATE, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${TEAL}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${TEAL}22` : "none",
            border: `1px solid ${filter === t ? TEAL : SLATE}`,
            color: filter === t ? TEAL : SLATE,
            borderRadius: 5, padding: "2px 8px", fontSize: 9,
            cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search communities…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)",
            border: "1px solid #6E8AA044", borderRadius: 5, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 9, outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          background: "none", border: `1px solid ${TEAL}`,
          color: TEAL, borderRadius: 5, padding: "2px 8px",
          fontSize: 9, cursor: "pointer", letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* community list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: SLATE, fontSize: 10, textAlign: "center", padding: 20 }}>
            No communities match the current filter.
          </div>
        )}
        {displayed.map((comm) => {
          const isExp  = expanded === comm.id;
          const col    = comm.represented ? TEAL : AMBER;
          const badge  = comm.represented ? "REPRESENTED" : "UNREPRESENTED";
          const szStr  = fmtSize(comm.size);
          return (
            <div key={comm.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : comm.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${TEAL}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${comm.represented ? `${TEAL}44` : "#6E8AA022"}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col, flexShrink: 0,
                }}>
                  {badge}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{comm.label}</span>
                {comm.type && (
                  <span style={{
                    fontSize: 8, padding: "1px 5px", borderRadius: 4,
                    background: `${VIOLET}22`, color: VIOLET, letterSpacing: 1,
                  }}>
                    {comm.type.slice(0, 10).toUpperCase()}
                  </span>
                )}
                {szStr && <span style={{ fontSize: 8, color: CYAN }}>{szStr}</span>}
                {comm.represented && (
                  <span style={{ fontSize: 8, color: TEAL }}>
                    {comm.contacts.length} contact{comm.contacts.length !== 1 ? "s" : ""}
                  </span>
                )}
                <span style={{ color: SLATE, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${TEAL}22` }}>
                  {comm.contacts.length === 0 ? (
                    <div style={{ fontSize: 9, color: AMBER }}>
                      No contact records keyword-correlate with this community — representation gap.
                    </div>
                  ) : (
                    comm.contacts.map((ct) => (
                      <div key={ct.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5" }}>{ct.name}</span>
                        {ct.org && (
                          <span style={{ fontSize: 8, color: VIOLET }}>{ct.org.slice(0, 14)}</span>
                        )}
                        {ct.role && (
                          <span style={{
                            fontSize: 8, padding: "1px 5px", borderRadius: 4,
                            background: `${TEAL}22`, color: TEAL, letterSpacing: 1,
                          }}>
                            {ct.role.slice(0, 12).toUpperCase()}
                          </span>
                        )}
                        <span style={{ fontSize: 8, color: GREEN }}>rel:{ct.score}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
