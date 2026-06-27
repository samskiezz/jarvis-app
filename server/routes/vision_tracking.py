"""Vision tracking viewer — browse processed matches and their tracks.

Endpoints
---------
- GET  /v1/vision/tracking              -> HTML viewer
- GET  /v1/vision/tracking/matches      -> JSON list of matches
- GET  /v1/vision/tracking/matches/{id} -> JSON match details + summary
- GET  /v1/vision/tracking/matches/{id}/frames -> JSON frame tracks (paginated)
"""
from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Query
from fastapi.responses import HTMLResponse

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("WC2026_TRACKING_DB", ROOT / "data" / "wc2026_tracking.db"))

router = APIRouter(prefix="/v1/vision/tracking", tags=["vision"])


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {k: row[k] for k in row.keys()}


@router.get("/matches")
def list_matches(limit: int = Query(200, ge=1, le=2000)) -> dict[str, Any]:
    """List all processed matches with core metadata."""
    if not DB_PATH.exists():
        return {"matches": [], "db_exists": False}
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM matches ORDER BY processed_at DESC LIMIT ?", (limit,)
        ).fetchall()
        matches = []
        for r in rows:
            d = _row_to_dict(r)
            try:
                d["features"] = json.loads(d.pop("features_json", "{}"))
            except Exception:
                d["features"] = {}
            matches.append(d)
        total = conn.execute("SELECT COUNT(*) FROM matches").fetchone()[0]
    return {"matches": matches, "total": total, "db_exists": True}


@router.get("/matches/{match_id}")
def get_match(match_id: str) -> dict[str, Any]:
    """Return one match plus aggregate track statistics."""
    if not DB_PATH.exists():
        return {"error": "tracking database not found"}
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM matches WHERE match_id = ?", (match_id,)
        ).fetchone()
        if not row:
            return {"error": "match not found", "match_id": match_id}
        match = _row_to_dict(row)
        try:
            match["features"] = json.loads(match.pop("features_json", "{}"))
        except Exception:
            match["features"] = {}

        summary = conn.execute(
            """
            SELECT
                COUNT(DISTINCT frame_idx) AS frames,
                COUNT(*) AS tracks,
                COUNT(DISTINCT player_id) AS players,
                COUNT(DISTINCT CASE WHEN team = 'home' THEN player_id END) AS home_players,
                COUNT(DISTINCT CASE WHEN team = 'away' THEN player_id END) AS away_players,
                MIN(timestamp) AS start_ts,
                MAX(timestamp) AS end_ts
            FROM frame_tracks WHERE match_id = ?
            """,
            (match_id,),
        ).fetchone()
        summary_dict = _row_to_dict(summary)
    return {"match": match, "summary": summary_dict}


@router.get("/matches/{match_id}/frames")
def get_frames(
    match_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
) -> dict[str, Any]:
    """Return frame tracks for a match, grouped by frame."""
    if not DB_PATH.exists():
        return {"error": "tracking database not found"}
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT frame_idx, timestamp, player_id, team, x, y
            FROM frame_tracks
            WHERE match_id = ?
            ORDER BY frame_idx, player_id
            LIMIT ? OFFSET ?
            """,
            (match_id, limit, offset),
        ).fetchall()
        total = conn.execute(
            "SELECT COUNT(DISTINCT frame_idx) FROM frame_tracks WHERE match_id = ?",
            (match_id,),
        ).fetchone()[0]

    frames: dict[int, dict[str, Any]] = {}
    for r in rows:
        fid = r["frame_idx"]
        if fid not in frames:
            frames[fid] = {
                "frame_idx": fid,
                "timestamp": r["timestamp"],
                "tracks": [],
            }
        frames[fid]["tracks"].append(
            {
                "player_id": r["player_id"],
                "team": r["team"],
                "x": r["x"],
                "y": r["y"],
            }
        )

    return {
        "match_id": match_id,
        "frames": list(frames.values()),
        "offset": offset,
        "limit": limit,
        "total_frames": total,
    }


_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vision Tracking Viewer</title>
<style>
:root { --bg:#020408; --bg2:#0a121c; --text:#eafcff; --dim:#9ab7c2; --cyan:#29e7ff; --green:#00c878; --red:#ff5d6c; --amber:#f5b942; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--text); font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; font-size:14px; }
header { padding:16px 20px; background:var(--bg2); border-bottom:1px solid #13202d; display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
header h1 { margin:0; font-size:18px; color:var(--cyan); }
header input { background:#0d1a25; border:1px solid #1d3142; color:var(--text); padding:8px 12px; border-radius:8px; min-width:220px; }
#counts { margin-left:auto; color:var(--dim); }
main { display:grid; grid-template-columns: minmax(320px,1fr) minmax(360px,1.3fr); height:calc(100vh - 68px); }
#list { overflow:auto; border-right:1px solid #13202d; }
#detail { overflow:auto; padding:16px; }
table { width:100%; border-collapse:collapse; font-size:13px; }
th, td { padding:10px 12px; text-align:left; border-bottom:1px solid #13202d; }
th { position:sticky; top:0; background:var(--bg2); color:var(--dim); font-weight:600; }
tr:hover { background:#0d1a25; cursor:pointer; }
tr.active { background:#10202e; }
.source { font-size:11px; color:var(--dim); }
.num { font-variant-numeric:tabular-nums; }
.pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; background:#0d2b1f; color:var(--green); }
.pill.away { background:#2b0d15; color:var(--red); }
#frames { display:grid; grid-template-columns: repeat(auto-fill,minmax(160px,1fr)); gap:12px; margin-top:12px; }
.frame { background:var(--bg2); border:1px solid #13202d; border-radius:10px; padding:10px; }
.frame h4 { margin:0 0 8px; font-size:12px; color:var(--dim); }
.dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:4px; }
.dot.home { background:var(--green); }
.dot.away { background:var(--red); }
.empty { padding:40px; color:var(--dim); text-align:center; }
</style>
</head>
<body>
<header>
  <h1>Vision Tracking Viewer</h1>
  <input id="filter" type="search" placeholder="Filter match ID / team...">
  <div id="counts"></div>
</header>
<main>
  <div id="list">
    <table>
      <thead><tr><th>Match</th><th>Source</th><th>Processed</th><th>Possession</th><th>Passes</th></tr></thead>
      <tbody id="tbody"></tbody>
    </table>
  </div>
  <div id="detail"><div class="empty">Select a match to inspect tracks.</div></div>
</main>
<script>
let matches = [];
async function load() {
  const r = await fetch('matches');
  const data = await r.json();
  matches = data.matches || [];
  document.getElementById('counts').textContent = `${matches.length} / ${data.total || 0} matches`;
  render(matches);
}
function fmtDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}
function render(list) {
  const tb = document.getElementById('tbody');
  tb.innerHTML = '';
  list.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><div>${m.match_id}</div><div class="source">${m.home} vs ${m.away}</div></td>
      <td class="source">${m.video_source || '-'}</td>
      <td>${fmtDate(m.processed_at)}</td>
      <td><span class="pill">${(m.possession_home||0).toFixed(1)}%</span> <span class="pill away">${(m.possession_away||0).toFixed(1)}%</span></td>
      <td class="num">${m.n_passes ?? 0}</td>`;
    tr.onclick = () => select(m.match_id, tr);
    tb.appendChild(tr);
  });
}
async function select(id, tr) {
  document.querySelectorAll('#tbody tr').forEach(r => r.classList.remove('active'));
  tr.classList.add('active');
  const [detail, frames] = await Promise.all([
    fetch(`matches/${encodeURIComponent(id)}`).then(r => r.json()),
    fetch(`matches/${encodeURIComponent(id)}/frames?limit=200`).then(r => r.json())
  ]);
  const m = detail.match || {};
  const s = detail.summary || {};
  const el = document.getElementById('detail');
  let html = `<h2>${m.match_id}</h2>
    <p>${m.home} vs ${m.away} &middot; ${m.video_source || '-'} &middot; processed ${fmtDate(m.processed_at)}</p>
    <table>
      <tr><td>Frames</td><td class="num">${s.frames ?? 0}</td></tr>
      <tr><td>Tracks</td><td class="num">${s.tracks ?? 0}</td></tr>
      <tr><td>Players</td><td class="num">${s.players ?? 0}</td></tr>
      <tr><td>Home players</td><td class="num">${s.home_players ?? 0}</td></tr>
      <tr><td>Away players</td><td class="num">${s.away_players ?? 0}</td></tr>
      <tr><td>Possession</td><td><span class="pill">${(m.possession_home||0).toFixed(1)}%</span> <span class="pill away">${(m.possession_away||0).toFixed(1)}%</span></td></tr>
      <tr><td>Passes</td><td class="num">${m.n_passes ?? 0}</td></tr>
      <tr><td>Avg ball speed</td><td class="num">${(m.avg_ball_speed||0).toFixed(2)}</td></tr>
    </table>
    <h3>Sample frames (${frames.frames ? frames.frames.length : 0} shown, ${frames.total_frames || 0} total)</h3>
    <div id="frames">`;
  if (frames.frames) {
    frames.frames.forEach(f => {
      const home = f.tracks.filter(t => t.team === 'home').length;
      const away = f.tracks.filter(t => t.team === 'away').length;
      html += `<div class="frame"><h4>frame ${f.frame_idx} @ ${f.timestamp.toFixed(2)}s</h4>
        <div><span class="dot home"></span>${home} home</div>
        <div><span class="dot away"></span>${away} away</div>
        <div class="num" style="color:var(--dim);margin-top:6px">${f.tracks.length} tracks</div></div>`;
    });
  }
  html += '</div>';
  el.innerHTML = html;
}
document.getElementById('filter').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  render(matches.filter(m => (m.match_id + m.home + m.away + (m.video_source||'')).toLowerCase().includes(q)));
});
load();
</script>
</body>
</html>
"""


@router.get("", response_class=HTMLResponse)
def viewer() -> str:
    """HTML viewer for the tracking database."""
    return _HTML
