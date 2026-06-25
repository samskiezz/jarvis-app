import { useState, useEffect, useRef } from "react";

const POLL_MS = 300_000; // 5 min
const ACC = "#A78BFA"; // violet

function rel(ts) {
  if (!ts) return "";
  const d = Date.now() / 1000 - ts;
  if (d < 60) return `${Math.round(d)}s ago`;
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  return `${Math.round(d / 3600)}h ago`;
}

export default function TaxonomyBrowserDrawer() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("families");
  const [families, setFamilies] = useState([]);
  const [frontier, setFrontier] = useState([]);
  const [summary, setSummary] = useState(null);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState("");
  const timerRef = useRef(null);

  const fetchData = async () => {
    try {
      const [sf, fr, sm] = await Promise.allSettled([
        fetch("/v1/jarvis/taxonomy/families").then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch("/v1/jarvis/taxonomy/frontier?limit=30").then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch("/v1/jarvis/taxonomy/summary").then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);
      if (sf.status === "fulfilled") setFamilies(sf.value.families || []);
      if (fr.status === "fulfilled") setFrontier(fr.value.frontier || []);
      if (sm.status === "fulfilled") setSummary(sm.value);
      setErr(null);
    } catch {
      setErr("FETCH ERROR");
    }
  };

  useEffect(() => {
    if (!open) {
      clearInterval(timerRef.current);
      return;
    }
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const TABS = ["families", "frontier"];

  const mono = { fontFamily: "'JetBrains Mono','SF Mono',monospace", fontSize: 10 };

  const filteredFamilies = families.filter(f =>
    !filter || (f.name || f.id || "").toLowerCase().includes(filter.toLowerCase())
  );
  const filteredFrontier = frontier.filter(c =>
    !filter || (c.topic || c.name || c.cell || "").toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <>
      {/* Tab */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed",
          left: open ? 280 : 0,
          top: "1%",
          zIndex: 200,
          cursor: "pointer",
          background: open ? ACC + "33" : "rgba(4,10,16,0.88)",
          border: `1px solid ${ACC}55`,
          borderLeft: open ? `1px solid ${ACC}55` : "none",
          borderRadius: open ? "0 4px 4px 0" : "0 4px 4px 0",
          padding: "8px 7px",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          ...mono,
          color: ACC,
          letterSpacing: 2,
          transition: "left 0.25s",
          userSelect: "none",
        }}
      >
        TAX ◀
      </div>

      {/* Drawer */}
      <div style={{
        position: "fixed",
        left: open ? 0 : -280,
        top: 0,
        width: 280,
        height: "100vh",
        zIndex: 199,
        background: "rgba(4,10,18,0.96)",
        borderRight: `1px solid ${ACC}33`,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        flexDirection: "column",
        transition: "left 0.25s",
        ...mono,
      }}>
        {/* Header */}
        <div style={{ padding: "12px 14px 8px", borderBottom: `1px solid ${ACC}22` }}>
          <div style={{ color: ACC, fontWeight: 700, letterSpacing: 2, fontSize: 11, marginBottom: 4 }}>
            TAXONOMY BROWSER
          </div>
          {summary && (
            <div style={{ color: "#888", fontSize: 9, letterSpacing: 1 }}>
              {summary.cells ?? "?"} CELLS · {summary.families ?? families.length} FAMILIES
            </div>
          )}
          {err && <div style={{ color: "#e8203c", fontSize: 9, marginTop: 3 }}>{err}</div>}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${ACC}22` }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, background: tab === t ? ACC + "22" : "transparent",
              border: "none", borderBottom: tab === t ? `2px solid ${ACC}` : "2px solid transparent",
              color: tab === t ? ACC : "#566878",
              padding: "7px 0", cursor: "pointer", letterSpacing: 1, fontSize: 9,
              fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, textTransform: "uppercase",
            }}>
              {t === "families" ? `FAMILIES (${families.length})` : `FRONTIER (${frontier.length})`}
            </button>
          ))}
        </div>

        {/* Filter */}
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${ACC}11` }}>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="filter…"
            style={{
              width: "100%", background: "rgba(167,139,250,0.07)", border: `1px solid ${ACC}44`,
              borderRadius: 3, color: "#a8bcc8", padding: "4px 8px", fontSize: 9,
              fontFamily: "'JetBrains Mono',monospace", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {tab === "families" && (
            filteredFamilies.length === 0
              ? <div style={{ color: "#566878", padding: "16px 14px", fontSize: 9 }}>NO FAMILIES LOADED</div>
              : filteredFamilies.map((f, i) => {
                  const name = f.name || f.id || `Family ${i + 1}`;
                  const desc = f.description || f.desc || "";
                  const count = f.cell_count ?? f.cells ?? null;
                  return (
                    <div key={f.id || i} style={{
                      padding: "7px 14px",
                      borderBottom: "1px solid rgba(167,139,250,0.06)",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ color: "#a8bcc8", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {name}
                        </span>
                        {count != null && (
                          <span style={{ color: ACC, fontSize: 8, background: ACC + "1a", border: `1px solid ${ACC}44`, borderRadius: 3, padding: "1px 5px", flexShrink: 0, marginLeft: 6 }}>
                            {count}c
                          </span>
                        )}
                      </div>
                      {desc ? (
                        <div style={{ color: "#566878", fontSize: 8, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {desc}
                        </div>
                      ) : null}
                    </div>
                  );
                })
          )}

          {tab === "frontier" && (
            filteredFrontier.length === 0
              ? <div style={{ color: "#566878", padding: "16px 14px", fontSize: 9 }}>NO FRONTIER CELLS</div>
              : filteredFrontier.map((c, i) => {
                  const topic = c.topic || c.name || c.cell || c.id || `Cell ${i + 1}`;
                  const niche = c.niche || c.subcategory || "";
                  const family = c.family || c.family_id || "";
                  return (
                    <div key={c.id || topic} style={{
                      padding: "7px 14px",
                      borderBottom: "1px solid rgba(167,139,250,0.06)",
                    }}>
                      <div style={{ color: "#a8bcc8", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {topic}
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                        {family ? (
                          <span style={{ color: "#566878", fontSize: 8, background: "rgba(255,255,255,0.04)", borderRadius: 3, padding: "1px 5px" }}>
                            {family}
                          </span>
                        ) : null}
                        {niche ? (
                          <span style={{ color: ACC, fontSize: 8, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                            {niche}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "6px 14px", borderTop: `1px solid ${ACC}22`, color: "#566878", fontSize: 8 }}>
          /v1/jarvis/taxonomy · polls every 5 min
        </div>
      </div>
    </>
  );
}
