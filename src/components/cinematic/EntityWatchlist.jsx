/**
 * EntityWatchlist — F55
 * Personal entity watchlist persisted in localStorage.
 * Fetches live data from /entities/{Task,RiskSignal,IntelProfile,SwarmJob,Investment,Contact}
 * for each saved item; click → AI assessment via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle: ⬡ WATCH at left:4444 bottom strip with green item-count badge.
 * "JARVIS, watchlist" / "my watchlist" / "watched items" → isWatchlistQuery.
 *
 * Other panels can pin items via:
 *   window.dispatchEvent(new CustomEvent("jarvis:watchlist-add", {
 *     detail: { id, type, label }
 *   }));
 */
import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GN = "#39FF14";
const AM = "#F5A623";
const RD = "#FF4444";
const DIM = "#4A6070";
const STORAGE_KEY = "jarvis_watchlist_v1";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const TYPE_COLOR = {
  Task: CY,
  RiskSignal: RD,
  IntelProfile: AM,
  SwarmJob: GN,
  Investment: "#A78BFA",
  Contact: "#60A5FA",
};

function loadWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveWatchlist(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

export function isWatchlistQuery(text) {
  return /watch.?list|my watch(ed)?|pinned item|saved entit/i.test(text);
}

export async function buildWatchlistScript() {
  const list = loadWatchlist();
  if (list.length === 0)
    return "Your watchlist is empty, sir. You can add entities from any panel using the watchlist-add event.";
  const preview = list
    .slice(0, 5)
    .map((w) => `${w.type} ${w.label || w.id}`)
    .join(", ");
  return `Watchlist contains ${list.length} item${list.length > 1 ? "s" : ""}: ${preview}. Opening now, sir.`;
}

export default function EntityWatchlist() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(loadWatchlist);
  const [entityData, setEntityData] = useState({});
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState("");
  const pollRef = useRef(null);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onAdd = (e) => {
      const { id, type, label } = e?.detail || {};
      if (!id || !type) return;
      const list = loadWatchlist();
      if (!list.some((w) => w.id === id && w.type === type)) {
        const next = [...list, { id: String(id), type, label: label || String(id) }];
        saveWatchlist(next);
        setItems(next);
      }
    };
    window.addEventListener("jarvis:watchlist-toggle", onToggle);
    window.addEventListener("jarvis:watchlist-add", onAdd);
    return () => {
      window.removeEventListener("jarvis:watchlist-toggle", onToggle);
      window.removeEventListener("jarvis:watchlist-add", onAdd);
    };
  }, []);

  useEffect(() => {
    if (!open || items.length === 0) return;
    fetchAll();
    pollRef.current = setInterval(fetchAll, 60_000);
    return () => clearInterval(pollRef.current);
  }, [open, items.length]);

  async function fetchAll() {
    setLoading(true);
    const byType = {};
    for (const w of items) {
      if (!byType[w.type]) byType[w.type] = [];
      byType[w.type].push(w.id);
    }
    const result = {};
    await Promise.all(
      Object.entries(byType).map(async ([type, ids]) => {
        try {
          const r = await fetch(`${apiBase()}/entities/${type}`, {
            headers: { Authorization: `Bearer ${API_KEY}` },
          });
          if (!r.ok) return;
          const d = await r.json();
          const list = Array.isArray(d)
            ? d
            : d.entities || d.items || d.data || [];
          for (const id of ids) {
            const found = list.find(
              (e) =>
                String(e.id ?? e._id ?? e.name ?? "") === id
            );
            if (found) result[`${type}:${id}`] = found;
          }
        } catch {}
      })
    );
    setEntityData(result);
    setLoading(false);
  }

  async function analyze(w) {
    if (selected?.id === w.id && selected?.type === w.type) return;
    setSelected(w);
    setAiLoading(true);
    setAiText("");
    const entity = entityData[`${w.type}:${w.id}`];
    const context = entity
      ? JSON.stringify(entity).slice(0, 500)
      : `${w.type} id: ${w.id}`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          message: `Provide a 2-sentence intelligence assessment of this ${w.type}: ${context}`,
        }),
      });
      const d = await r.json();
      const text = (d.answer || "Assessment unavailable.").trim();
      setAiText(text);
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text } })
      );
    } catch {
      setAiText("Assessment unavailable — reasoning core offline.");
    }
    setAiLoading(false);
  }

  function removeItem(w) {
    const next = loadWatchlist().filter(
      (x) => !(x.id === w.id && x.type === w.type)
    );
    saveWatchlist(next);
    setItems(next);
    if (selected?.id === w.id && selected?.type === w.type) {
      setSelected(null);
      setAiText("");
    }
  }

  function clearAll() {
    saveWatchlist([]);
    setItems([]);
    setEntityData({});
    setSelected(null);
    setAiText("");
  }

  const watchCount = items.length;

  return (
    <>
      {open && (
        <div
          style={{
            position: "fixed",
            left: 160,
            top: 50,
            zIndex: 69,
            width: "min(640px, 92vw)",
            maxHeight: "calc(100vh - 100px)",
            background: "rgba(4,8,14,0.93)",
            border: `1px solid ${CY}33`,
            borderTop: `2px solid ${CY}`,
            borderRadius: 10,
            backdropFilter: "blur(12px)",
            display: "flex",
            flexDirection: "column",
            fontFamily: "'JetBrains Mono',monospace",
            color: "#DCEBF5",
            overflow: "hidden",
            boxShadow: `0 0 60px ${CY}18`,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderBottom: `1px solid ${CY}22`,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                color: CY,
                fontSize: 11,
                letterSpacing: 2,
                fontWeight: 700,
              }}
            >
              ⬡ ENTITY WATCHLIST
            </span>
            <span
              style={{
                background: GN,
                color: "#030509",
                borderRadius: 8,
                fontSize: 8,
                padding: "1px 6px",
                fontWeight: 700,
              }}
            >
              {watchCount}
            </span>
            <div style={{ flex: 1 }} />
            {loading && (
              <span
                style={{ fontSize: 8, color: DIM, letterSpacing: 1 }}
              >
                SYNCING…
              </span>
            )}
            <button
              onClick={clearAll}
              style={{
                background: "transparent",
                border: `1px solid ${RD}44`,
                color: RD,
                fontSize: 8,
                padding: "2px 6px",
                borderRadius: 4,
                cursor: "pointer",
                letterSpacing: 1,
                fontFamily: "inherit",
              }}
            >
              CLEAR ALL
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: DIM,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>

          {items.length === 0 ? (
            <div
              style={{
                padding: 32,
                textAlign: "center",
                color: DIM,
                fontSize: 10,
                lineHeight: 1.9,
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 10, color: `${CY}44` }}>
                ⬡
              </div>
              Watchlist is empty.
              <br />
              Add entities by dispatching{" "}
              <span style={{ color: CY }}>jarvis:watchlist-add</span>
              <br />
              <span style={{ fontSize: 8 }}>
                {"{ id, type, label }"}
              </span>
            </div>
          ) : (
            <div
              style={{ flex: 1, display: "flex", overflow: "hidden" }}
            >
              {/* Item list */}
              <div
                style={{
                  width: 210,
                  borderRight: `1px solid ${CY}11`,
                  overflowY: "auto",
                  padding: "4px 0",
                  flexShrink: 0,
                }}
              >
                {items.map((w) => {
                  const entity = entityData[`${w.type}:${w.id}`];
                  const isSelected =
                    selected?.id === w.id && selected?.type === w.type;
                  const sev =
                    entity?.severity ?? entity?.score ?? entity?.priority;
                  const isCrit =
                    sev !== undefined &&
                    sev !== null &&
                    (Number(sev) >= 90 ||
                      String(sev).toLowerCase() === "critical");
                  const accent = TYPE_COLOR[w.type] || CY;
                  return (
                    <div
                      key={`${w.type}:${w.id}`}
                      onClick={() => analyze(w)}
                      style={{
                        padding: "7px 10px",
                        cursor: "pointer",
                        borderLeft: `2px solid ${isSelected ? accent : "transparent"}`,
                        background: isSelected ? `${accent}08` : "transparent",
                        transition: "background 0.15s",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          marginBottom: 3,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 7,
                            color: accent,
                            background: `${accent}18`,
                            padding: "1px 4px",
                            borderRadius: 3,
                            letterSpacing: 1,
                          }}
                        >
                          {w.type.slice(0, 7).toUpperCase()}
                        </span>
                        {isCrit && (
                          <span
                            style={{
                              fontSize: 7,
                              color: RD,
                              animation: "ewlpulse 1s ease-in-out infinite",
                            }}
                          >
                            ●
                          </span>
                        )}
                        {!entity && !loading && (
                          <span
                            style={{ fontSize: 7, color: `${AM}88` }}
                            title="Not found in latest fetch"
                          >
                            ?
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          color: "#DCEBF5",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          marginBottom: 2,
                        }}
                      >
                        {w.label ||
                          entity?.name ||
                          entity?.title ||
                          w.id}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeItem(w);
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: `${RD}66`,
                          fontSize: 8,
                          cursor: "pointer",
                          padding: 0,
                          letterSpacing: 0.5,
                          fontFamily: "inherit",
                        }}
                      >
                        ✕ unwatch
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Detail pane */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: 12,
                  minWidth: 0,
                }}
              >
                {!selected ? (
                  <div
                    style={{
                      color: DIM,
                      fontSize: 9,
                      fontStyle: "italic",
                      textAlign: "center",
                      paddingTop: 20,
                    }}
                  >
                    ← select an item to receive AI assessment
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        fontSize: 10,
                        color: TYPE_COLOR[selected.type] || CY,
                        letterSpacing: 2,
                        marginBottom: 10,
                        fontWeight: 700,
                      }}
                    >
                      {selected.type.toUpperCase()} ·{" "}
                      {selected.label || selected.id}
                    </div>

                    {entityData[`${selected.type}:${selected.id}`] && (
                      <pre
                        style={{
                          fontSize: 8,
                          color: "#8BA8B8",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                          maxHeight: 140,
                          overflowY: "auto",
                          marginBottom: 12,
                          background: `${CY}06`,
                          borderRadius: 4,
                          padding: 8,
                          border: `1px solid ${CY}11`,
                        }}
                      >
                        {JSON.stringify(
                          entityData[`${selected.type}:${selected.id}`],
                          null,
                          2
                        ).slice(0, 700)}
                      </pre>
                    )}

                    {!entityData[`${selected.type}:${selected.id}`] &&
                      !loading && (
                        <div
                          style={{
                            fontSize: 8,
                            color: `${AM}99`,
                            marginBottom: 12,
                            fontStyle: "italic",
                          }}
                        >
                          Live data not available for this item (endpoint
                          may not have returned a match).
                        </div>
                      )}

                    <div
                      style={{
                        fontSize: 9,
                        color: CY,
                        marginBottom: 6,
                        letterSpacing: 1,
                      }}
                    >
                      ◆ AI ASSESSMENT
                    </div>
                    {aiLoading ? (
                      <div
                        style={{
                          color: DIM,
                          fontSize: 9,
                          fontStyle: "italic",
                        }}
                      >
                        consulting reasoning core…
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 9,
                          color: "#DCEBF5",
                          lineHeight: 1.7,
                        }}
                      >
                        {aiText}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Footer */}
          <div
            style={{
              padding: "4px 12px",
              borderTop: `1px solid ${CY}11`,
              flexShrink: 0,
            }}
          >
            <span
              style={{ fontSize: 7, color: DIM, letterSpacing: 0.5 }}
            >
              /entities/&#123;Task,RiskSignal,IntelProfile,SwarmJob,Investment,Contact&#125; · /v1/jarvis/agent/chat
            </span>
          </div>
        </div>
      )}

      {/* Toggle button — left:4444 bottom strip */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Entity Watchlist (Alt+W)"
        style={{
          position: "fixed",
          left: 4444,
          bottom: 18,
          zIndex: 68,
          background: open ? CY : "rgba(5,8,13,0.75)",
          color: open ? "#030509" : CY,
          border: `1px solid ${CY}`,
          borderRadius: 6,
          padding: "3px 8px",
          fontSize: 8,
          fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: 1.5,
          cursor: "pointer",
          backdropFilter: "blur(6px)",
          boxShadow: open ? `0 0 12px ${CY}` : "none",
        }}
      >
        ⬡ WATCH
        {watchCount > 0 && (
          <span
            style={{
              marginLeft: 4,
              background: GN,
              color: "#030509",
              borderRadius: 8,
              fontSize: 7,
              padding: "0 4px",
              fontWeight: 700,
            }}
          >
            {watchCount}
          </span>
        )}
      </button>

      <style>{`
        @keyframes ewlpulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.3; transform: scale(1.4); }
        }
      `}</style>
    </>
  );
}
