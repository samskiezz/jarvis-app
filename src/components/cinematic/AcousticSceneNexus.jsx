/**
 * F701 — Acoustic × Cinematic Scene Nexus (ACSCENE)
 * Endpoints: /v1/acoustic/contacts  ×  /v1/cinematic/scene/{id} (scenes 1-10)
 * Keyword-correlates acoustic contact labels against scene anchor texts.
 * Classifies each contact as SCENE-LINKED (≥1 keyword match) or UNLOCATED.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 * Voice: "acscene / acoustic scene / scene acoustic / sensor scene /
 *         contact scene match / acoustic cinematic / scene contact / acoustic location"
 */
import { useState, useEffect, useRef, useCallback } from "react";

// ─── Intent helpers (imported by JarvisBrain) ────────────────────────────────

export function isAcsceneQuery(q) {
  const t = q.toLowerCase();
  return (
    t.includes("acscene") ||
    (t.includes("acoustic") && t.includes("scene")) ||
    (t.includes("scene") && t.includes("acoustic")) ||
    (t.includes("sensor") && t.includes("scene")) ||
    (t.includes("contact") && t.includes("scene") && t.includes("match")) ||
    (t.includes("acoustic") && t.includes("cinematic")) ||
    (t.includes("scene") && t.includes("contact")) ||
    (t.includes("acoustic") && t.includes("location"))
  );
}

export async function buildAcsceneScript() {
  try {
    const [acRes, ...sceneResults] = await Promise.all([
      fetch("/v1/acoustic/contacts").catch(() => null),
      ...Array.from({ length: 10 }, (_, i) =>
        fetch(`/v1/cinematic/scene/${i + 1}`).catch(() => null)
      ),
    ]);

    const contacts = acRes?.ok ? await acRes.json().catch(() => []) : [];
    const scenes = await Promise.all(
      sceneResults.map(async (r, i) => {
        if (!r?.ok) return null;
        const d = await r.json().catch(() => null);
        return d ? { id: i + 1, ...d } : null;
      })
    );
    const validScenes = scenes.filter(Boolean);

    const sceneKeywords = validScenes.flatMap((sc) => {
      const src = [sc.anchor, sc.title, sc.description, sc.label]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return src.split(/\W+/).filter((w) => w.length > 3);
    });
    const kwSet = new Set(sceneKeywords);

    const contactList = Array.isArray(contacts.contacts)
      ? contacts.contacts
      : Array.isArray(contacts)
      ? contacts
      : [];

    const linked = contactList.filter((c) => {
      const label = (c.label || c.name || c.id || "").toLowerCase();
      return label.split(/\W+/).some((w) => kwSet.has(w));
    });

    const pct =
      contactList.length > 0
        ? Math.round((linked.length / contactList.length) * 100)
        : 0;

    const brief = `Acoustic-Scene Nexus: ${contactList.length} contacts, ${linked.length} scene-linked (${pct}%), ${validScenes.length} scenes loaded.`;

    const chatRes = await fetch("/v1/jarvis/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `${brief} Summarise scene-contact coverage in 2 sentences.`,
      }),
    }).catch(() => null);

    const chatJson = chatRes?.ok ? await chatRes.json().catch(() => null) : null;
    return (
      chatJson?.response ||
      chatJson?.message ||
      `${brief} Scene-linked contacts visible in ACSCENE panel.`
    );
  } catch {
    return "ACSCENE: error building brief — check /v1/acoustic/contacts and /v1/cinematic/scene endpoints.";
  }
}

// ─── Panel component ──────────────────────────────────────────────────────────

const SCENE_COUNT = 10;
const REFRESH_MS = 90_000;
const TABS = ["ALL", "SCENE-LINKED", "UNLOCATED"];

function Badge({ n, color }) {
  if (!n) return null;
  return (
    <span
      style={{
        background: color,
        color: "#000",
        borderRadius: 4,
        padding: "0 5px",
        fontSize: 10,
        fontWeight: 700,
        marginLeft: 4,
      }}
    >
      {n}
    </span>
  );
}

export default function AcousticSceneNexus() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [ttsText, setTtsText] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [acRes, ...sceneResArr] = await Promise.all([
        fetch("/v1/acoustic/contacts").catch(() => null),
        ...Array.from({ length: SCENE_COUNT }, (_, i) =>
          fetch(`/v1/cinematic/scene/${i + 1}`).catch(() => null)
        ),
      ]);

      const acJson = acRes?.ok ? await acRes.json().catch(() => ({})) : {};
      const rawContacts = Array.isArray(acJson.contacts)
        ? acJson.contacts
        : Array.isArray(acJson)
        ? acJson
        : [];

      const sceneArr = await Promise.all(
        sceneResArr.map(async (r, i) => {
          if (!r?.ok) return null;
          const d = await r.json().catch(() => null);
          return d ? { id: i + 1, ...d } : null;
        })
      );
      const validScenes = sceneArr.filter(Boolean);

      const allKws = validScenes.flatMap((sc) => {
        const src = [sc.anchor, sc.title, sc.description, sc.label]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return src.split(/\W+/).filter((w) => w.length > 3);
      });
      const kwSet = new Set(allKws);

      const enriched = rawContacts.map((c) => {
        const label = (c.label || c.name || c.id || "").toLowerCase();
        const words = label.split(/\W+/);
        const matchedScenes = validScenes.filter((sc) => {
          const scWords = [sc.anchor, sc.title, sc.description, sc.label]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .split(/\W+/);
          return words.some((w) => w.length > 3 && scWords.includes(w));
        });
        return { ...c, matchedScenes, linked: matchedScenes.length > 0 };
      });

      setContacts(enriched);
      setScenes(validScenes);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:acscene-toggle", onToggle);
    return () => window.removeEventListener("jarvis:acscene-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const linkedCount = contacts.filter((c) => c.linked).length;
  const unlocatedCount = contacts.filter((c) => !c.linked).length;
  const pct =
    contacts.length > 0
      ? Math.round((linkedCount / contacts.length) * 100)
      : 0;

  const filtered = contacts.filter((c) => {
    if (tab === "SCENE-LINKED" && !c.linked) return false;
    if (tab === "UNLOCATED" && c.linked) return false;
    const q = search.toLowerCase();
    if (q) {
      const label = (c.label || c.name || c.id || "").toLowerCase();
      if (!label.includes(q)) return false;
    }
    return true;
  });

  async function assess() {
    const brief = `ACSCENE: ${contacts.length} contacts, ${linkedCount} scene-linked (${pct}%), ${scenes.length} scenes.`;
    const chatRes = await fetch("/v1/jarvis/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `${brief} Assess scene-contact coverage gaps and priority contacts. 3 sentences.`,
      }),
    }).catch(() => null);
    const chatJson = chatRes?.ok ? await chatRes.json().catch(() => null) : null;
    const text =
      chatJson?.response ||
      chatJson?.message ||
      `${brief} Assess complete.`;
    setTtsText(text);
    fetch("/v1/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: "en-GB" }),
    }).catch(() => null);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Acoustic Scene Nexus (F701)"
        style={{
          position: "fixed",
          left: 153540,
          bottom: 8,
          zIndex: 237,
          background: "rgba(0,30,60,0.85)",
          border: "1px solid #0af",
          color: "#0af",
          borderRadius: 6,
          padding: "3px 8px",
          fontSize: 11,
          cursor: "pointer",
          fontFamily: "monospace",
          letterSpacing: 1,
        }}
      >
        ◈ ACSCENE
        {linkedCount > 0 && <Badge n={linkedCount} color="#0af" />}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        left: 153540,
        bottom: 44,
        zIndex: 237,
        width: 420,
        maxHeight: 540,
        background: "rgba(0,10,30,0.97)",
        border: "1px solid #0af",
        borderRadius: 10,
        color: "#cef",
        fontFamily: "monospace",
        fontSize: 12,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 0 24px #0af4",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid #0af4",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span style={{ color: "#0af", fontWeight: 700, letterSpacing: 2 }}>
          ◈ ACOUSTIC × SCENE NEXUS
        </span>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "none",
            border: "none",
            color: "#0af",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          ✕
        </button>
      </div>

      {/* Stat tiles */}
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "8px 12px",
          borderBottom: "1px solid #0af2",
        }}
      >
        {[
          { label: "CONTACTS", val: contacts.length, color: "#0af" },
          { label: "SCENE-LINKED", val: linkedCount, color: "#0f8" },
          { label: "UNLOCATED", val: unlocatedCount, color: "#fa0" },
          { label: "SCENES", val: scenes.length, color: "#88f" },
          { label: "COVERAGE", val: `${pct}%`, color: pct >= 50 ? "#0f8" : "#fa0" },
        ].map((t) => (
          <div
            key={t.label}
            style={{
              flex: 1,
              background: "rgba(0,40,80,0.6)",
              borderRadius: 6,
              padding: "4px 0",
              textAlign: "center",
              border: `1px solid ${t.color}44`,
            }}
          >
            <div style={{ color: t.color, fontWeight: 700, fontSize: 13 }}>
              {t.val}
            </div>
            <div style={{ color: "#89a", fontSize: 9 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "6px 12px",
          borderBottom: "1px solid #0af2",
          alignItems: "center",
        }}
      >
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? "#0af" : "rgba(0,40,80,0.5)",
              color: tab === t ? "#000" : "#0af",
              border: "none",
              borderRadius: 4,
              padding: "2px 8px",
              cursor: "pointer",
              fontSize: 10,
              fontWeight: tab === t ? 700 : 400,
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{
            marginLeft: "auto",
            background: "rgba(0,20,50,0.8)",
            border: "1px solid #0af4",
            color: "#cef",
            borderRadius: 4,
            padding: "2px 6px",
            fontSize: 10,
            width: 120,
            outline: "none",
          }}
        />
      </div>

      {/* Contact list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {loading && (
          <div style={{ padding: 12, color: "#0af", textAlign: "center" }}>
            loading…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 12, color: "#89a", textAlign: "center" }}>
            no contacts
          </div>
        )}
        {filtered.map((c, i) => {
          const cid = c.id || c.contact_id || i;
          const label = c.label || c.name || c.id || `contact-${i}`;
          const isExp = expanded === cid;
          return (
            <div
              key={cid}
              style={{
                padding: "6px 12px",
                borderBottom: "1px solid #0af1",
                cursor: "pointer",
                background: isExp ? "rgba(0,50,100,0.5)" : "transparent",
              }}
              onClick={() => setExpanded(isExp ? null : cid)}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: c.linked ? "#0f8" : "#fa0",
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, color: "#cef" }}>{label}</span>
                {c.linked && (
                  <span style={{ color: "#0f8", fontSize: 10 }}>
                    {c.matchedScenes.length} scene{c.matchedScenes.length !== 1 ? "s" : ""}
                  </span>
                )}
                {!c.linked && (
                  <span style={{ color: "#fa0", fontSize: 10 }}>UNLOCATED</span>
                )}
                <span style={{ color: "#89a", fontSize: 10 }}>
                  {isExp ? "▲" : "▼"}
                </span>
              </div>
              {isExp && (
                <div style={{ marginTop: 6, paddingLeft: 14 }}>
                  {c.frequency && (
                    <div style={{ color: "#89a", fontSize: 10 }}>
                      freq: {c.frequency}
                    </div>
                  )}
                  {c.type && (
                    <div style={{ color: "#89a", fontSize: 10 }}>
                      type: {c.type}
                    </div>
                  )}
                  {c.linked && c.matchedScenes.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ color: "#0af", fontSize: 10, marginBottom: 2 }}>
                        Matched scenes:
                      </div>
                      {c.matchedScenes.map((sc) => (
                        <div
                          key={sc.id}
                          style={{
                            background: "rgba(0,80,160,0.3)",
                            borderRadius: 4,
                            padding: "2px 6px",
                            marginBottom: 2,
                            fontSize: 10,
                            color: "#88f",
                          }}
                        >
                          Scene {sc.id}
                          {sc.title ? ` — ${sc.title}` : ""}
                          {sc.anchor ? ` (${sc.anchor})` : ""}
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

      {/* Footer */}
      <div
        style={{
          padding: "6px 12px",
          borderTop: "1px solid #0af4",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <button
          onClick={assess}
          style={{
            background: "#0af",
            color: "#000",
            border: "none",
            borderRadius: 4,
            padding: "3px 10px",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 11,
          }}
        >
          ▶ ASSESS
        </button>
        <button
          onClick={load}
          style={{
            background: "rgba(0,40,80,0.7)",
            color: "#0af",
            border: "1px solid #0af4",
            borderRadius: 4,
            padding: "3px 8px",
            cursor: "pointer",
            fontSize: 10,
          }}
        >
          ↺
        </button>
        {ttsText && (
          <span
            style={{
              flex: 1,
              color: "#89a",
              fontSize: 9,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {ttsText}
          </span>
        )}
      </div>
    </div>
  );
}
