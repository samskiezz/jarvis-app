import { useState, useEffect, useCallback } from "react";

const API = "";

export function isCtkinvtriQuery(q) {
  const t = q.toLowerCase();
  return (
    t.includes("ckinvtri") ||
    t.includes("contact knowledge investment") ||
    t.includes("knowledge investment contact") ||
    t.includes("contact portfolio knowledge") ||
    t.includes("mapped contacts") ||
    t.includes("fully mapped contact") ||
    t.includes("dark contact") ||
    t.includes("contact triple nexus") ||
    t.includes("contact intel investment") ||
    t.includes("knowledge backed contact") ||
    t.includes("invested contact")
  );
}

export async function buildCtkinvtriScript() {
  try {
    const [cRes, kRes, iRes] = await Promise.all([
      fetch(`${API}/entities/Contact`),
      fetch(`${API}/knowledge/`),
      fetch(`${API}/entities/Investment`),
    ]);
    const contacts = cRes.ok ? await cRes.json() : [];
    const knowledge = kRes.ok ? await kRes.json() : [];
    const investments = iRes.ok ? await iRes.json() : [];

    const cList = Array.isArray(contacts) ? contacts : contacts.items ?? contacts.data ?? [];
    const kList = Array.isArray(knowledge) ? knowledge : knowledge.items ?? knowledge.data ?? [];
    const iList = Array.isArray(investments) ? investments : investments.items ?? investments.data ?? [];

    let fullyMapped = 0, knowledgeOnly = 0, investmentOnly = 0, dark = 0;
    cList.forEach((c) => {
      const name = (c.name || c.title || c.id || "").toLowerCase();
      const hasK = kList.some((k) => (k.title || k.content || "").toLowerCase().includes(name.split(" ")[0]) && name.length > 2);
      const hasI = iList.some((inv) => (inv.name || inv.title || inv.sector || "").toLowerCase().includes(name.split(" ")[0]) && name.length > 2);
      if (hasK && hasI) fullyMapped++;
      else if (hasK) knowledgeOnly++;
      else if (hasI) investmentOnly++;
      else dark++;
    });

    const total = cList.length;
    const pct = total ? ((fullyMapped / total) * 100).toFixed(1) : "0.0";
    return `CKINVTRI Contact × Knowledge × Investment Triple Nexus: ${total} contacts | ${kList.length} articles | ${iList.length} investments | ${fullyMapped} fully mapped (${pct}%) | ${knowledgeOnly} knowledge-only | ${investmentOnly} investment-only | ${dark} dark contacts with no cross-reference.`;
  } catch (e) {
    return `CKINVTRI: fetch error — ${e.message}`;
  }
}

function classify(contact, kList, iList) {
  const name = (contact.name || contact.title || contact.id || "").toLowerCase();
  const token = name.split(" ")[0];
  if (token.length < 3) return { type: "DARK", kMatches: [], iMatches: [] };
  const kMatches = kList.filter((k) => (k.title || k.content || "").toLowerCase().includes(token));
  const iMatches = iList.filter((inv) => (inv.name || inv.title || inv.sector || "").toLowerCase().includes(token));
  const hasK = kMatches.length > 0;
  const hasI = iMatches.length > 0;
  if (hasK && hasI) return { type: "FULLY_MAPPED", kMatches, iMatches };
  if (hasK) return { type: "KNOWLEDGE_ONLY", kMatches, iMatches };
  if (hasI) return { type: "INVESTMENT_ONLY", kMatches, iMatches };
  return { type: "DARK", kMatches, iMatches };
}

const TYPE_COLOR = {
  FULLY_MAPPED: "#00ff88",
  KNOWLEDGE_ONLY: "#38bdf8",
  INVESTMENT_ONLY: "#a78bfa",
  DARK: "#64748b",
};

export default function ContactKnowledgeInvestmentTriple() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [knowledge, setKnowledge] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [cRes, kRes, iRes] = await Promise.all([
        fetch(`${API}/entities/Contact`),
        fetch(`${API}/knowledge/`),
        fetch(`${API}/entities/Investment`),
      ]);
      const cj = cRes.ok ? await cRes.json() : [];
      const kj = kRes.ok ? await kRes.json() : [];
      const ij = iRes.ok ? await iRes.json() : [];
      setContacts(Array.isArray(cj) ? cj : cj.items ?? cj.data ?? []);
      setKnowledge(Array.isArray(kj) ? kj : kj.items ?? kj.data ?? []);
      setInvestments(Array.isArray(ij) ? ij : ij.items ?? ij.data ?? []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90000);
    return () => clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:ckinvtri-toggle", handler);
    return () => window.removeEventListener("jarvis:ckinvtri-toggle", handler);
  }, []);

  const classified = contacts.map((c) => ({ ...c, ...classify(c, knowledge, investments) }));

  const fullyMapped = classified.filter((c) => c.type === "FULLY_MAPPED").length;
  const knowledgeOnly = classified.filter((c) => c.type === "KNOWLEDGE_ONLY").length;
  const investmentOnly = classified.filter((c) => c.type === "INVESTMENT_ONLY").length;
  const dark = classified.filter((c) => c.type === "DARK").length;
  const pct = contacts.length ? ((fullyMapped / contacts.length) * 100).toFixed(1) : "0.0";

  const visible = classified.filter((c) => {
    if (filter !== "ALL" && c.type !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (c.name || c.title || c.id || "").toLowerCase().includes(s);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    try {
      const brief = await buildCtkinvtriScript();
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `CKINVTRI assessment: ${brief}. Identify highest-priority dark contacts and propose 2 intelligence-gathering actions.` }),
      });
      const data = res.ok ? await res.json() : {};
      const text = data.response || data.message || brief;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Contact × Knowledge × Investment Triple Nexus (CKINVTRI)"
        style={{
          position: "fixed",
          left: 891780,
          bottom: 8,
          zIndex: 251,
          background: "#0f172a",
          border: "1px solid #334155",
          color: "#94a3b8",
          fontSize: 10,
          padding: "3px 7px",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: "0.05em",
          fontFamily: "monospace",
        }}
      >
        ◈ CKINVTRI
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 60,
        right: 20,
        width: 520,
        maxHeight: "82vh",
        overflowY: "auto",
        background: "#0a0f1e",
        border: "1px solid #1e40af",
        borderRadius: 8,
        zIndex: 2510,
        fontFamily: "monospace",
        color: "#e2e8f0",
        boxShadow: "0 0 40px #1e40af55",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #1e3a8a", background: "#0d1b3e" }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: "#60a5fa", letterSpacing: "0.08em" }}>◈ CKINVTRI — Contact × Knowledge × Investment</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} disabled={loading} style={{ background: "none", border: "1px solid #334155", color: "#94a3b8", fontSize: 10, padding: "2px 8px", borderRadius: 3, cursor: "pointer" }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, padding: "10px 14px" }}>
        {[
          { label: "Contacts", val: contacts.length, color: "#60a5fa" },
          { label: "Fully Mapped", val: fullyMapped, color: "#00ff88" },
          { label: "Know Only", val: knowledgeOnly, color: "#38bdf8" },
          { label: "Inv Only", val: investmentOnly, color: "#a78bfa" },
          { label: "Coverage %", val: `${pct}%`, color: dark > 0 ? "#f59e0b" : "#00ff88" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: "#0f172a", border: "1px solid #1e3a8a", borderRadius: 5, padding: "6px 4px", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* dark badge */}
      {dark > 0 && (
        <div style={{ margin: "0 14px 8px", background: "#1e1a2e", border: "1px solid #6d28d9", borderRadius: 4, padding: "5px 10px", fontSize: 11, color: "#a78bfa" }}>
          ⬛ {dark} dark contacts — no knowledge or investment cross-reference found
        </div>
      )}

      {err && <div style={{ margin: "0 14px 8px", color: "#f87171", fontSize: 11 }}>Error: {err}</div>}
      {loading && <div style={{ margin: "0 14px 8px", color: "#60a5fa", fontSize: 11 }}>Loading…</div>}

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
        {["ALL", "FULLY_MAPPED", "KNOWLEDGE_ONLY", "INVESTMENT_ONLY", "DARK"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? "#1e3a8a" : "#0f172a",
              border: `1px solid ${filter === f ? "#3b82f6" : "#334155"}`,
              color: filter === f ? "#93c5fd" : "#64748b",
              fontSize: 10,
              padding: "3px 9px",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            {f}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{ flex: 1, minWidth: 100, background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0", fontSize: 10, padding: "3px 8px", borderRadius: 3, outline: "none" }}
        />
      </div>

      {/* contact list */}
      <div style={{ padding: "0 14px 14px" }}>
        {visible.slice(0, 80).map((c, i) => {
          const id = c.id || c.name || i;
          const isExp = expanded === id;
          return (
            <div
              key={id}
              onClick={() => setExpanded(isExp ? null : id)}
              style={{ cursor: "pointer", padding: "6px 8px", marginBottom: 4, background: "#0f172a", border: "1px solid #1e3a8a", borderRadius: 4 }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "#e2e8f0" }}>{c.name || c.title || c.id || `Contact ${i + 1}`}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: TYPE_COLOR[c.type] ?? "#94a3b8", background: "#0a0f1e", padding: "1px 6px", borderRadius: 3, border: `1px solid ${TYPE_COLOR[c.type] ?? "#334155"}` }}>{c.type}</span>
              </div>
              {isExp && (
                <div style={{ marginTop: 8 }}>
                  {c.kMatches?.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 10, color: "#38bdf8", marginBottom: 3 }}>Knowledge Articles ({c.kMatches.length})</div>
                      {c.kMatches.slice(0, 5).map((k, ki) => (
                        <div key={ki} style={{ fontSize: 10, color: "#94a3b8", padding: "2px 6px", background: "#0a1628", borderRadius: 3, marginBottom: 2 }}>
                          <span style={{ fontSize: 9, color: "#38bdf8", border: "1px solid #1e40af", borderRadius: 2, padding: "0 4px", marginRight: 5 }}>{k.kind || k.type || "article"}</span>
                          {k.title || k.id}
                        </div>
                      ))}
                    </div>
                  )}
                  {c.iMatches?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: "#a78bfa", marginBottom: 3 }}>Investments ({c.iMatches.length})</div>
                      {c.iMatches.slice(0, 5).map((inv, ii) => (
                        <div key={ii} style={{ fontSize: 10, color: "#94a3b8", padding: "2px 6px", background: "#1a0a28", borderRadius: 3, marginBottom: 2 }}>
                          <span style={{ fontSize: 9, color: "#a78bfa", border: "1px solid #6d28d9", borderRadius: 2, padding: "0 4px", marginRight: 5 }}>{inv.sector || inv.type || "inv"}</span>
                          {inv.name || inv.title || inv.id}
                        </div>
                      ))}
                    </div>
                  )}
                  {c.kMatches?.length === 0 && c.iMatches?.length === 0 && (
                    <div style={{ fontSize: 10, color: "#64748b" }}>No knowledge or investment cross-references found.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && !loading && <div style={{ fontSize: 11, color: "#64748b", textAlign: "center", padding: 12 }}>No contacts match filter.</div>}
        {visible.length > 80 && <div style={{ fontSize: 10, color: "#64748b", textAlign: "center", padding: 4 }}>Showing 80 of {visible.length} — use search to narrow</div>}
      </div>

      {/* assess */}
      <div style={{ padding: "0 14px 14px" }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{ width: "100%", background: assessing ? "#0f172a" : "#1e3a8a", border: "1px solid #3b82f6", color: assessing ? "#64748b" : "#93c5fd", fontSize: 11, padding: "7px 0", borderRadius: 4, cursor: assessing ? "default" : "pointer", letterSpacing: "0.06em" }}
        >
          {assessing ? "▶ ASSESSING…" : "▶ ASSESS — Contact Intel Coverage Brief"}
        </button>
      </div>
    </div>
  );
}
