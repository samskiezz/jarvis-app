/**
 * ScrapeIntelStudio — F326
 * OSINT & document-scrape intelligence console.
 *
 * Data sources (all read-only — no bearer-gated mutations):
 *   GET /v1/jarvis/scrape/status              (poll 90 s)
 *   GET /v1/jarvis/scrape/engines             (on open)
 *   GET /v1/jarvis/scrape/search?q=&k=        (on query)
 *   GET /v1/jarvis/scrape/document/{id}       (on expand)
 *   POST /v1/jarvis/agent/chat                (ASSESS)
 *
 * Toggle: ⬡ SCRP  left:497760  bottom:8  zIndex:202
 * Event:  jarvis:scrp-toggle
 * Voice:  "scrape intel" | "osint" | "scraped documents" | "search documents" |
 *         "document search" | "scrp" | "intel scrape" | "web intel" |
 *         "scraped docs" | "what was scraped" | "find document" |
 *         "scrape status" | "scrape engine"
 *
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const GN   = "#4ADE80";
const AM   = "#F5A623";
const PU   = "#B06EFF";
const GRAY = "#4E6070";

const BTN_LEFT   = 497760;
const POLL_MS    = 90_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── fetch helpers ─────────────────────────────────────────────────────────────

function hdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

async function fetchStatus() {
  const r = await fetch(`${apiBase()}/v1/jarvis/scrape/status`, { headers: hdr() });
  if (!r.ok) throw new Error(`scrape/status ${r.status}`);
  return r.json();
}

async function fetchEngines() {
  const r = await fetch(`${apiBase()}/v1/jarvis/scrape/engines`, { headers: hdr() });
  if (!r.ok) throw new Error(`scrape/engines ${r.status}`);
  return r.json();
}

async function fetchSearch(q, k) {
  const r = await fetch(
    `${apiBase()}/v1/jarvis/scrape/search?q=${encodeURIComponent(q)}&k=${k}`,
    { headers: hdr() },
  );
  if (!r.ok) throw new Error(`scrape/search ${r.status}`);
  return r.json();
}

async function fetchDocument(docId) {
  const r = await fetch(
    `${apiBase()}/v1/jarvis/scrape/document/${encodeURIComponent(docId)}`,
    { headers: hdr() },
  );
  if (!r.ok) throw new Error(`scrape/document ${r.status}`);
  return r.json();
}

async function postAssess(brief) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { ...hdr(), "Content-Type": "application/json" },
    body: JSON.stringify({ message: brief }),
  });
  if (!r.ok) throw new Error(`agent/chat ${r.status}`);
  return r.json();
}

// ─── JarvisBrain exports ───────────────────────────────────────────────────────

const SCRP_RE =
  /\b(scrape\s+intel|osint\b|scraped?\s+doc|document\s+search|search\s+doc|scrp\b|intel\s+scrape|web\s+intel|what\s+was\s+scraped|find\s+doc|scrape\s+stat|scrape\s+engine|scrape\s+studi)\b/i;

export function isScrpQuery(text) {
  return SCRP_RE.test(text || "");
}

export async function buildScrpScript() {
  try {
    const status = await fetchStatus();
    window.dispatchEvent(new CustomEvent("jarvis:scrp-toggle"));
    const stored = status?.stored_full_text?.total ?? status?.scraped_documents ?? 0;
    const pending = status?.pending_targets ?? 0;
    const engine = status?.best_engine ?? "sequential";
    const pct = status?.seed_progress?.pct ?? 0;
    return (
      `Scrape Intelligence Studio: ${stored} document${stored !== 1 ? "s" : ""} stored at full-text resolution via ${engine}, sir. ` +
      (pending > 0
        ? `${pending} target${pending !== 1 ? "s" : ""} remain pending — seed progress at ${Math.round(pct)}%.`
        : "All catalogue targets have been indexed — corpus is current.")
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:scrp-toggle"));
    return "Scrape Intelligence Studio open, sir.";
  }
}

// ─── sub-components ────────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div style={{
      flex: 1, background: "rgba(41,231,255,0.04)", border: `1px solid ${CY}22`,
      borderRadius: 7, padding: "7px 10px", textAlign: "center",
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: color || CY }}>{value ?? "—"}</div>
      <div style={{ fontSize: 7, color: GRAY, marginTop: 2, letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

function AvailDot({ available }) {
  return (
    <span style={{
      display: "inline-block", width: 7, height: 7, borderRadius: "50%",
      background: available ? GN : "#F87171",
      boxShadow: available ? `0 0 6px ${GN}` : undefined,
      marginRight: 5,
    }} />
  );
}

function EngineRow({ engine }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "4px 0", borderBottom: `1px solid ${CY}11`,
    }}>
      <AvailDot available={engine.available} />
      <span style={{ color: engine.available ? CY : GRAY, fontSize: 10, flex: 1 }}>{engine.name}</span>
      <span style={{
        fontSize: 8, background: "rgba(255,255,255,0.05)", borderRadius: 4,
        padding: "1px 5px", color: GRAY,
      }}>{engine.detect}</span>
    </div>
  );
}

function SearchResult({ result, expanded, onToggle, onDocLoad, docData, docLoading }) {
  const title = result.title || result.url || result.id || "Document";
  const snippet = result.content_snippet || result.snippet || "";

  return (
    <div style={{ borderBottom: `1px solid ${CY}11` }}>
      <div
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 0", cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 9, color: PU, minWidth: 16 }}>{expanded ? "▾" : "▸"}</span>
        <span style={{ color: CY, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </span>
        {result.id && (
          <span style={{ fontSize: 7, color: GRAY, fontFamily: "monospace" }}>
            {String(result.id).slice(0, 8)}
          </span>
        )}
      </div>

      {expanded && (
        <div style={{ paddingLeft: 22, paddingBottom: 8 }}>
          {snippet && (
            <div style={{ fontSize: 9, color: "#AECBD6", marginBottom: 6, lineHeight: 1.5 }}>
              {snippet.slice(0, 300)}{snippet.length > 300 ? "…" : ""}
            </div>
          )}
          {result.url && (
            <div style={{ fontSize: 8, color: GRAY, marginBottom: 4, wordBreak: "break-all" }}>
              {result.url}
            </div>
          )}
          {result.id && !docData && (
            <button
              onClick={onDocLoad}
              disabled={docLoading}
              style={{
                background: "rgba(41,231,255,0.08)", border: `1px solid ${CY}44`,
                borderRadius: 5, padding: "3px 10px", color: CY, fontSize: 9,
                cursor: docLoading ? "default" : "pointer",
              }}
            >
              {docLoading ? "loading…" : "▶ FULL DOC"}
            </button>
          )}
          {docData && (
            <div style={{
              marginTop: 6, padding: "6px 8px",
              background: "rgba(0,0,0,0.3)", borderRadius: 5,
              fontSize: 9, color: "#AECBD6", lineHeight: 1.5, whiteSpace: "pre-wrap",
              maxHeight: 120, overflow: "auto",
            }}>
              {(docData.content || docData.text || JSON.stringify(docData, null, 2)).slice(0, 600)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ────────────────────────────────────────────────────────────

export default function ScrapeIntelStudio() {
  const [open, setOpen]           = useState(false);
  const [tab, setTab]             = useState("STATUS");
  const [status, setStatus]       = useState(null);
  const [engines, setEngines]     = useState(null);
  const [query, setQuery]         = useState("");
  const [kVal, setKVal]           = useState(10);
  const [results, setResults]     = useState([]);
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded]   = useState({});
  const [docData, setDocData]     = useState({});
  const [docLoading, setDocLoading] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessTxt, setAssessTxt] = useState("");
  const [badge, setBadge]         = useState(null);
  const [badgeColor, setBadgeColor] = useState(GN);

  const pollRef  = useRef(null);
  const debounce = useRef(null);

  const loadStatus = useCallback(async () => {
    try {
      const s = await fetchStatus();
      setStatus(s);
      const stored = s?.stored_full_text?.total ?? s?.scraped_documents ?? 0;
      const pending = s?.pending_targets ?? 0;
      setBadge(stored > 0 ? stored : null);
      setBadgeColor(pending > 0 ? AM : GN);
    } catch {
      setStatus(null);
    }
  }, []);

  const loadEngines = useCallback(async () => {
    if (engines) return;
    try {
      const e = await fetchEngines();
      setEngines(e);
    } catch {
      setEngines({ engines: {}, available_counts: {}, note: "unavailable" });
    }
  }, [engines]);

  useEffect(() => {
    if (!open) return;
    loadStatus();
    loadEngines();
    pollRef.current = setInterval(loadStatus, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [open, loadStatus, loadEngines]);

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:scrp-toggle", toggle);
    return () => window.removeEventListener("jarvis:scrp-toggle", toggle);
  }, []);

  // debounced search
  useEffect(() => {
    if (tab !== "SEARCH") return;
    clearTimeout(debounce.current);
    if (!query.trim()) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const d = await fetchSearch(query.trim(), kVal);
        setResults(d?.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(debounce.current);
  }, [query, kVal, tab]);

  const toggleRow = (id) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const loadDoc = useCallback(async (docId) => {
    setDocLoading((prev) => ({ ...prev, [docId]: true }));
    try {
      const d = await fetchDocument(docId);
      setDocData((prev) => ({ ...prev, [docId]: d }));
    } catch {
      setDocData((prev) => ({ ...prev, [docId]: { error: "not found" } }));
    } finally {
      setDocLoading((prev) => ({ ...prev, [docId]: false }));
    }
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true); setAssessTxt("");
    try {
      const stored = status?.stored_full_text?.total ?? 0;
      const pending = status?.pending_targets ?? 0;
      const engine = status?.best_engine ?? "unknown";
      const msg =
        `Scrape Intel Studio: ${stored} stored docs, ${pending} pending targets, best engine = ${engine}. ` +
        `Give a 2-sentence brief on corpus health and next recommended action.`;
      const d = await postAssess(msg);
      const txt = d?.answer || "Analysis complete, sir.";
      setAssessTxt(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessTxt("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [status]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Scrape Intelligence Studio"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 202,
          background: "rgba(5,8,13,0.75)",
          border: `1px solid ${CY}`,
          borderRadius: 6,
          color: CY,
          fontSize: 9,
          letterSpacing: 1,
          padding: "4px 8px",
          cursor: "pointer",
          backdropFilter: "blur(4px)",
          boxShadow: `0 0 12px ${CY}33`,
          whiteSpace: "nowrap",
        }}
      >
        ⬡ SCRP
        {badge != null && (
          <span style={{
            marginLeft: 5,
            background: badgeColor,
            color: "#04060A",
            borderRadius: 8,
            padding: "1px 5px",
            fontSize: 8,
            fontWeight: 700,
          }}>
            {badge}
          </span>
        )}
      </button>
    );
  }

  // ── panel content ─────────────────────────────────────────────────────────────

  const stored = status?.stored_full_text?.total ?? status?.scraped_documents ?? "—";
  const scraped = status?.scraped_documents ?? "—";
  const pending = status?.pending_targets ?? "—";
  const bestEngine = status?.best_engine ?? "—";
  const seedPct = status?.seed_progress?.pct ?? 0;

  const allEngines = engines
    ? [
        ...(engines.engines?.content ?? []),
        ...(engines.engines?.browser ?? []),
      ]
    : [];
  const availCount = engines?.available_counts ?? {};

  const TABS = ["STATUS", "SEARCH", "ENGINES"];

  return (
    <div style={{
      position: "fixed",
      left: BTN_LEFT,
      bottom: 44,
      zIndex: 202,
      width: 340,
      maxHeight: "82vh",
      background: "rgba(5,8,13,0.93)",
      border: `1px solid ${CY}55`,
      borderRadius: 10,
      display: "flex",
      flexDirection: "column",
      backdropFilter: "blur(14px)",
      boxShadow: `0 0 50px ${CY}18`,
      fontFamily: "'JetBrains Mono',monospace",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "9px 12px 7px", borderBottom: `1px solid ${CY}22`,
      }}>
        <span style={{ color: CY, fontSize: 11, fontWeight: 700, letterSpacing: 2, flex: 1 }}>
          ⬡ SCRAPE INTEL STUDIO
        </span>
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            background: "rgba(41,231,255,0.1)", border: `1px solid ${CY}55`,
            borderRadius: 5, padding: "3px 8px", color: CY,
            fontSize: 8, cursor: assessing ? "default" : "pointer", letterSpacing: 1,
          }}
        >
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "none", border: "none", color: GRAY,
            fontSize: 14, cursor: "pointer", lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px 4px" }}>
        <StatTile label="SCRAPED" value={scraped} color={CY} />
        <StatTile label="FTS STORED" value={stored} color={GN} />
        <StatTile label="PENDING" value={pending} color={pending > 0 ? AM : GRAY} />
        <StatTile label="ENGINE" value={bestEngine === "—" ? "—" : bestEngine.slice(0, 8)} color={PU} />
      </div>

      {/* assess text */}
      {assessTxt && (
        <div style={{
          margin: "0 12px 4px",
          padding: "6px 8px",
          background: "rgba(41,231,255,0.06)",
          borderRadius: 5,
          fontSize: 9, color: "#AECBD6", lineHeight: 1.5,
        }}>
          {assessTxt}
        </div>
      )}

      {/* tabs */}
      <div style={{
        display: "flex", gap: 2,
        padding: "4px 12px 0",
        borderBottom: `1px solid ${CY}22`,
      }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${CY}18` : "none",
              border: `1px solid ${tab === t ? CY : "transparent"}`,
              borderBottom: "none",
              borderRadius: "5px 5px 0 0",
              color: tab === t ? CY : GRAY,
              fontSize: 8, letterSpacing: 1,
              padding: "4px 9px", cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* body */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 12px" }}>

        {/* STATUS tab */}
        {tab === "STATUS" && (
          <div>
            {/* seed progress bar */}
            {status?.seed_progress && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 8, color: GRAY, letterSpacing: 1 }}>SEED PROGRESS</span>
                  <span style={{ fontSize: 8, color: CY }}>
                    {status.seed_progress.fetched}/{status.seed_progress.total}
                    {" "}({Math.round(seedPct)}%)
                  </span>
                </div>
                <div style={{ background: "#0C1620", borderRadius: 3, height: 5, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${Math.min(100, seedPct)}%`,
                    background: seedPct >= 100 ? GN : CY,
                    transition: "width 0.4s",
                  }} />
                </div>
              </div>
            )}

            {/* stored full text details */}
            {status?.stored_full_text && (
              <div style={{
                background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}18`,
                borderRadius: 6, padding: "7px 10px", marginBottom: 8,
              }}>
                <div style={{ fontSize: 8, color: GRAY, letterSpacing: 1, marginBottom: 5 }}>
                  FULL-TEXT STORE
                </div>
                {Object.entries(status.stored_full_text).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{ fontSize: 8, color: GRAY }}>{k}</span>
                    <span style={{ fontSize: 8, color: CY, fontFamily: "monospace" }}>
                      {typeof v === "object" ? JSON.stringify(v).slice(0, 40) : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {!status && (
              <div style={{ fontSize: 9, color: GRAY, textAlign: "center", paddingTop: 20 }}>
                loading scrape status…
              </div>
            )}
          </div>
        )}

        {/* SEARCH tab */}
        {tab === "SEARCH" && (
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="search scraped docs…"
                style={{
                  flex: 1, background: "rgba(41,231,255,0.06)",
                  border: `1px solid ${CY}44`, borderRadius: 5,
                  color: CY, fontSize: 9, padding: "5px 8px",
                  fontFamily: "inherit", outline: "none",
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                <span style={{ fontSize: 7, color: GRAY }}>k={kVal}</span>
                <input
                  type="range" min={5} max={30} step={5}
                  value={kVal}
                  onChange={(e) => setKVal(Number(e.target.value))}
                  style={{ width: 60, accentColor: CY }}
                />
              </div>
            </div>

            {searching && (
              <div style={{ fontSize: 9, color: GRAY, textAlign: "center", paddingTop: 8 }}>
                searching…
              </div>
            )}

            {!searching && results.length === 0 && query.trim() && (
              <div style={{ fontSize: 9, color: GRAY, textAlign: "center", paddingTop: 8 }}>
                no results for "{query}"
              </div>
            )}

            {results.map((r, i) => {
              const id = r.id ?? `r${i}`;
              return (
                <SearchResult
                  key={id}
                  result={r}
                  expanded={!!expanded[id]}
                  onToggle={() => toggleRow(id)}
                  onDocLoad={() => loadDoc(id)}
                  docData={docData[id]}
                  docLoading={!!docLoading[id]}
                />
              );
            })}

            {!searching && results.length > 0 && (
              <div style={{ fontSize: 8, color: GRAY, textAlign: "center", paddingTop: 6 }}>
                {results.length} result{results.length !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        )}

        {/* ENGINES tab */}
        {tab === "ENGINES" && (
          <div>
            {engines ? (
              <>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  {Object.entries(availCount).map(([kind, n]) => (
                    <div key={kind} style={{
                      flex: 1, textAlign: "center",
                      background: "rgba(41,231,255,0.04)",
                      border: `1px solid ${CY}22`, borderRadius: 5, padding: "5px 4px",
                    }}>
                      <div style={{ color: GN, fontWeight: 700, fontSize: 13 }}>{n}</div>
                      <div style={{ color: GRAY, fontSize: 7, letterSpacing: 1 }}>
                        {kind.toUpperCase()}
                      </div>
                    </div>
                  ))}
                </div>

                {["content", "browser", "recon"].map((kind) => {
                  const list = engines.engines?.[kind] ?? [];
                  if (!list.length) return null;
                  return (
                    <div key={kind} style={{ marginBottom: 10 }}>
                      <div style={{
                        fontSize: 8, color: GRAY, letterSpacing: 1,
                        marginBottom: 4, textTransform: "uppercase",
                      }}>
                        {kind}
                      </div>
                      {list.map((e) => <EngineRow key={e.name} engine={e} />)}
                    </div>
                  );
                })}

                {engines.note && (
                  <div style={{
                    marginTop: 8, fontSize: 8, color: GRAY,
                    lineHeight: 1.5, fontStyle: "italic",
                  }}>
                    {engines.note}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 9, color: GRAY, textAlign: "center", paddingTop: 20 }}>
                loading engines…
              </div>
            )}
          </div>
        )}
      </div>

      {/* footer */}
      <div style={{
        borderTop: `1px solid ${CY}18`,
        padding: "5px 12px",
        fontSize: 7, color: GRAY, letterSpacing: 1,
        display: "flex", justifyContent: "space-between",
      }}>
        <span>SCRP · /v1/jarvis/scrape/*</span>
        <span>{POLL_MS / 1000}s POLL</span>
      </div>
    </div>
  );
}
