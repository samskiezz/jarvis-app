/**
 * wave1 — shared helpers for the Wave-1 platform pages (OntologyManager,
 * SearchHub, Operations, GraphOps).
 *
 * Every Wave-1 backend is reached through the same app API base that
 * ScienceConsole uses (kimiClient.request). These pages share a tiny async
 * runner so each one gets identical loading / error / graceful-degradation
 * behavior without re-implementing the try/catch dance, plus a couple of small
 * formatting utilities used by the shared result renderers.
 */
import { useState, useCallback } from "react";
import { kimiClient } from "@/api/kimiClient";
import { appParams } from "@/lib/app-params";

// Thin convenience wrappers over kimiClient.request so call sites read cleanly.
export const apiGet = (path) => kimiClient.request(path);
export const apiPost = (path, body) =>
  kimiClient.request(path, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });

// Raw GET that returns the response body as text (kimiClient always JSON-parses,
// which breaks markdown/plain-text exports). Used for report exports where the
// backend may hand back markdown rather than JSON.
export const apiGetText = async (path) => {
  const headers = appParams.apiKey ? { Authorization: `Bearer ${appParams.apiKey}` } : {};
  const res = await fetch(`${appParams.apiBaseUrl}${path}`, { headers });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    const err = new Error(`API ${res.status}: ${t || res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return res.text();
};

// Trigger a browser download of a text/JSON blob (used by report exports).
export const download = (filename, content, mime = "text/plain") => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// Build a querystring from an object, dropping empty/nullish values.
export const qs = (params) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
};

// Best-effort extraction of a list from a backend response that might wrap its
// payload in {items}, {results}, {data}, {objects}, etc. — Wave-1 services
// aren't perfectly uniform, so we stay forgiving.
export const asList = (body, ...keys) => {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return [];
  for (const k of [...keys, "items", "results", "data", "objects", "list"]) {
    if (Array.isArray(body[k])) return body[k];
  }
  return [];
};

// Human label for an ontology object / search hit (id is the reliable fallback).
export const labelOf = (o) =>
  (o &&
    (o.name || o.label || o.title || o.display_name || o.id)) ||
  "(unnamed)";

/**
 * useAsync — a minimal async-action hook. `run(fn)` executes `fn`, tracking
 * { loading, error } and returning the resolved value (or null on failure so
 * callers can branch). Designed so a single failing call degrades gracefully
 * instead of throwing through the render tree.
 */
export function useAsync() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (fn) => {
    setLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, setError, run };
}
