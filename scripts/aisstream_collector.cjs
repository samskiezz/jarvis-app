#!/usr/bin/env node
/**
 * Global AIS collector — subscribes to the AISStream.io worldwide PositionReport
 * firehose over WebSocket, keeps a rolling de-duplicated snapshot keyed by MMSI,
 * and serves it as a small REST snapshot for the Osiris map (/api/jarvis/vessels
 * proxies http://localhost:8124/vessels).
 *
 * Why a service and not a Next route: AISStream is a push stream (no REST), and
 * the global feed is thousands of msgs/sec — it must be accumulated by a single
 * always-on process, not re-opened per HTTP request.
 *
 * Key is read from /opt/jarvis-app-1/.env.secrets (gitignored) or AISSTREAM_API_KEY.
 * Runs under PM2 as `jarvis-ais-collector`.
 */
'use strict';

const http = require('http');
const fs = require('fs');

// ws lives in the palantir app's node_modules (Node 20 has no built-in WebSocket).
let WebSocket;
try { WebSocket = require('ws'); }
catch { WebSocket = require('/opt/jarvis-app-1/palantir/node_modules/ws'); }

const PORT = 8124;
const SECRETS = '/opt/jarvis-app-1/.env.secrets';
const STALE_MS = 30 * 60 * 1000;   // drop vessels not seen in 30 min
const MAX_STORE = 300000;          // hard cap on tracked vessels
const SERVE_CAP = 9000;            // max points served to the map (decimated)

function loadKey() {
  if (process.env.AISSTREAM_API_KEY) return process.env.AISSTREAM_API_KEY.trim();
  try {
    const txt = fs.readFileSync(SECRETS, 'utf8');
    const m = txt.match(/^AISSTREAM_API_KEY=(.+)$/m);
    if (m) return m[1].trim();
  } catch { /* no secrets file */ }
  return null;
}

const KEY = loadKey();

/** @type {Map<number,{mmsi:number,lat:number,lng:number,sog:number,cog:number,name:string,ts:number}>} */
const vessels = new Map();
let state = KEY ? 'connecting' : 'no_key';
let lastMsgAt = 0;
let msgCount = 0;
let ws = null;
let backoff = 1000;

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : NaN; }

function ingest(obj) {
  try {
    if (!obj || obj.MessageType !== 'PositionReport') return;
    const md = obj.MetaData || {};
    const pr = (obj.Message && obj.Message.PositionReport) || {};
    const mmsi = num(md.MMSI != null ? md.MMSI : pr.UserID);
    let lat = num(md.latitude != null ? md.latitude : pr.Latitude);
    let lng = num(md.longitude != null ? md.longitude : pr.Longitude);
    if (!Number.isFinite(mmsi) || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    const sog = num(pr.Sog); const cog = num(pr.Cog);
    vessels.set(mmsi, {
      mmsi, lat, lng,
      sog: Number.isFinite(sog) ? sog : 0,
      cog: Number.isFinite(cog) ? cog : 0,
      name: (md.ShipName || '').toString().trim(),
      ts: Date.now(),
    });
    lastMsgAt = Date.now();
    msgCount++;
  } catch { /* skip malformed message */ }
}

function connect() {
  if (!KEY) { console.error('[ais] no AISSTREAM_API_KEY — collector idle (serving empty no_key snapshot)'); return; }
  state = 'connecting';
  ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

  ws.on('open', () => {
    backoff = 1000;
    state = 'subscribing';
    ws.send(JSON.stringify({
      APIKey: KEY,
      BoundingBoxes: [[[90, -180], [-90, 180]]],   // whole world
      FilterMessageTypes: ['PositionReport'],
    }));
    console.log('[ais] connected → subscribed to global PositionReport stream');
  });

  ws.on('message', (raw) => {
    state = 'live';
    let obj;
    try { obj = JSON.parse(raw.toString()); } catch { return; }
    // AISStream sends a plain {error: "..."} text on auth/subscription failure.
    if (obj && obj.error) { state = 'auth_error'; console.error('[ais] stream error:', obj.error); return; }
    ingest(obj);
  });

  ws.on('close', (code, reason) => {
    if (state !== 'auth_error') state = 'reconnecting';
    console.error(`[ais] socket closed (${code}) ${reason ? reason.toString() : ''} — reconnecting in ${backoff}ms`);
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('[ais] socket error:', err && err.message ? err.message : err);
    try { ws.close(); } catch { /* already closing */ }
  });
}

function scheduleReconnect() {
  setTimeout(connect, backoff);
  backoff = Math.min(backoff * 2, 30000);
}

// Prune stale + enforce store cap.
setInterval(() => {
  const cutoff = Date.now() - STALE_MS;
  for (const [mmsi, v] of vessels) if (v.ts < cutoff) vessels.delete(mmsi);
  if (vessels.size > MAX_STORE) {
    const sorted = [...vessels.entries()].sort((a, b) => a[1].ts - b[1].ts);
    const drop = vessels.size - MAX_STORE;
    for (let i = 0; i < drop; i++) vessels.delete(sorted[i][0]);
  }
}, 60000);

// Heartbeat log.
setInterval(() => {
  console.log(`[ais] state=${state} tracked=${vessels.size} msgs=${msgCount} lastMsg=${lastMsgAt ? ((Date.now() - lastMsgAt) / 1000 | 0) + 's ago' : 'never'}`);
}, 30000);

function snapshot() {
  let arr = [...vessels.values()];
  const total = arr.length;
  if (arr.length > SERVE_CAP) {
    const step = Math.ceil(arr.length / SERVE_CAP);
    arr = arr.filter((_, i) => i % step === 0);
  }
  return {
    vessels: arr.map((v) => ({ mmsi: v.mmsi, lat: v.lat, lng: v.lng, sog: v.sog, cog: v.cog, name: v.name })),
    total,
    served: arr.length,
    source: 'AISStream.io (global)',
    status: state,
    updated: new Date(lastMsgAt || Date.now()).toISOString(),
  };
}

http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url && req.url.startsWith('/health')) {
    res.end(JSON.stringify({ status: state, tracked: vessels.size, msgs: msgCount, hasKey: !!KEY }));
    return;
  }
  res.end(JSON.stringify(snapshot()));
}).listen(PORT, '127.0.0.1', () => console.log(`[ais] snapshot server on http://127.0.0.1:${PORT}/vessels  (key:${KEY ? 'loaded' : 'MISSING'})`));

connect();
