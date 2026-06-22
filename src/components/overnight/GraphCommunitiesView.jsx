/**
 * GraphCommunitiesView — left-edge slide-in drawer showing the community
 * partition of the knowledge graph from GET /v1/graph/communities.
 *
 * Tab sits at 2 % from top, above ReportsBrowserDrawer (8 %).
 * Polls every 5 min while open.
 * Mounted in src/Layout.jsx after SecondBrainCatalog.
 *
 * Endpoint: GET /v1/graph/communities
 * → { communities: { [node_id]: cluster_id }, n_clusters: number, count: number }
 */
import { useEffect, useReducer, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 320;
const ROSE = "#F43F5E";
const CLUSTER_COLORS = [
  "#29E7FF", "#F43F5E", "#F97316", "#84CC16",
  "#A78BFA", "#0D9488", "#FBBF24", "#60A5FA",
];

function clusterColor(clusterId) {
  const n = typeof clusterId === "number" ? clusterId : parseInt(clusterId, 10);
  return CLUSTER_COLORS[Math.abs(n) % CLUSTER_COLORS.length];
}

function buildClusters(communities) {
  const map = {};
  for (const [nodeId, clusterId] of Object.entries(communities)) {
    const key = String(clusterId);
    if (!map[key]) map[key] = [];
    map[key].push(nodeId);
  }
  return Object.entries(map)
    .map(([id, members]) => ({ id, members }))
    .sort((a, b) => b.members.length - a.members.length);
}

function ClusterRow({ cluster, accent }) {
  const [expanded, setExpanded] = useState(false);
  const preview = cluster.members.slice(0, 3);
  const overflow = cluster.members.length - preview.length;

  return (
    <div
      style={{
        borderBottom: `1px solid ${S.border}`,
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 14px",
          width: "100%",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: accent,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: S.fs.xs,
            color: accent,
            letterSpacing: 1,
            fontFamily: S.mono,
            flexShrink: 0,
          }}
        >
          {`C${cluster.id}`}
        </span>
        <span
          style={{
            flex: 1,
            fontSize: S.fs.xxs,
            color: S.text,
            letterSpacing: 0.5,
            fontFamily: S.mono,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {preview.join(", ")}{overflow > 0 ? ` +${overflow}` : ""}
        </span>
        <span
          style={{
            fontSize: S.fs.xxs,
            color: `${accent}AA`,
            letterSpacing: 1,
            fontFamily: S.mono,
            flexShrink: 0,
          }}
        >
          {cluster.members.length}
        </span>
        <span
          style={{
            fontSize: S.fs.xxs,
            color: S.text,
            fontFamily: S.mono,
            flexShrink: 0,
          }}
        >
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div
          style={{
            padding: "4px 14px 8px 30px",
            display: "flex",
            flexWrap: "wrap",
            gap: "4px 8px",
          }}
        >
          {cluster.members.map((nodeId) => (
            <span
              key={nodeId}
              style={{
                fontSize: S.fs.xxs,
                color: S.textHi,
                fontFamily: S.mono,
                letterSpacing: 0.5,
                background: `${accent}12`,
                border: `1px solid ${accent}33`,
                borderRadius: 3,
                padding: "1px 5px",
                maxWidth: 200,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={nodeId}
            >
              {nodeId}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GraphCommunitiesView() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/graph/communities")
      .then((d) => {
        if (alive) {
          setData(d);
          setErr(false);
        }
      })
      .catch(() => {
        if (alive) setErr(true);
      });

    const timer = setTimeout(() => {
      if (alive) bump();
    }, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, tick]);

  const clusters = data?.communities ? buildClusters(data.communities) : [];

  return (
    <>
      {/* Toggle tab — left edge, 2 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close graph communities" : "Open graph communities"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "2%",
          transform: open
            ? "translateY(0) rotate(180deg)"
            : "translateY(0)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${ROSE}55`,
          borderLeft: open ? "none" : `1px solid ${ROSE}55`,
          color: ROSE,
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: "0 4px 4px 0",
          transition: "left 0.2s ease",
          userSelect: "none",
        }}
      >
        {open ? "COMM ▶" : "COMM ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8996,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderRight: `1px solid ${ROSE}33`,
          display: "flex",
          flexDirection: "column",
          transition: "left 0.2s ease",
          fontFamily: S.mono,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderBottom: `1px solid ${S.border}`,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: S.fs.xs,
              color: ROSE,
              letterSpacing: 2,
              flex: 1,
            }}
          >
            GRAPH COMMUNITIES
          </span>
          {data && (
            <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
              {data.n_clusters ?? clusters.length} clusters · {data.count ?? 0} nodes
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {!open ? null : err ? (
            <div
              style={{
                padding: "20px 14px",
                color: ROSE,
                fontSize: S.fs.xs,
                letterSpacing: 1,
              }}
            >
              ENDPOINT UNREACHABLE
            </div>
          ) : !data ? (
            <div
              style={{
                padding: "20px 14px",
                color: S.text,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              LOADING…
            </div>
          ) : clusters.length === 0 ? (
            <div
              style={{
                padding: "20px 14px",
                color: S.text,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              NO COMMUNITIES DETECTED
            </div>
          ) : (
            clusters.map((cluster) => (
              <ClusterRow
                key={cluster.id}
                cluster={cluster}
                accent={clusterColor(cluster.id)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 14px",
            borderTop: `1px solid ${S.border}`,
            fontSize: S.fs.xxs,
            color: S.text,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          {data
            ? "LIVE · 5 MIN POLL"
            : err
            ? "ERR"
            : "…"}
        </div>
      </div>
    </>
  );
}
