import { useMemo, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { OBJECTS, LINKS } from "@/domain/ontology";
import { PageShell, PanelCard, StatTile, Grid, Badge } from "@/components/PageKit";

const ACCENT = C.neon;

const typeColor = (t) => C.type[t] || C.text;

// Adjacency built once from the ontology links.
const buildLinksFor = (id) =>
  LINKS.filter((l) => l.a === id || l.b === id).map((l) => ({
    other: l.a === id ? l.b : l.a,
    label: l.label,
    strength: l.strength,
  }));

export default function KGIKBrain() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(OBJECTS[0]?.id || null);

  const byType = useMemo(() => {
    const map = {};
    OBJECTS.forEach((o) => { map[o.type] = (map[o.type] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, []);

  const linkCountById = useMemo(() => {
    const m = {};
    LINKS.forEach((l) => { m[l.a] = (m[l.a] || 0) + 1; m[l.b] = (m[l.b] || 0) + 1; });
    return m;
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? OBJECTS.filter((o) =>
          [o.label, o.type, o.id, ...Object.values(o.props || {})]
            .some((v) => String(v).toLowerCase().includes(q)))
      : OBJECTS;
    return [...list].sort((a, b) => (linkCountById[b.id] || 0) - (linkCountById[a.id] || 0));
  }, [query, linkCountById]);

  const selected = useMemo(() => OBJECTS.find((o) => o.id === selectedId) || null, [selectedId]);
  const selectedLinks = useMemo(() => (selected ? buildLinksFor(selected.id) : []), [selected]);

  const avgDegree = useMemo(
    () => (OBJECTS.length ? ((LINKS.length * 2) / OBJECTS.length).toFixed(1) : "0"),
    []
  );

  return (
    <PageShell
      title="KGIK BRAIN"
      subtitle="KNOWLEDGE GRAPH INTELLIGENCE KERNEL · ONTOLOGY CORE"
      accent={ACCENT}
    >
      <Grid min={160} style={{ marginBottom: 14 }}>
        <StatTile label="Entities" value={OBJECTS.length} accent={ACCENT} sub="graph nodes" />
        <StatTile label="Relations" value={LINKS.length} accent={C.blue} sub="typed links" />
        <StatTile label="Entity Types" value={byType.length} accent={C.purple} />
        <StatTile label="Avg Degree" value={avgDegree} accent={C.gold} sub="links / node" />
      </Grid>

      <PanelCard title="NODES BY TYPE" accent={ACCENT} style={{ marginBottom: 14 }}>
        <Grid min={130}>
          {byType.map(([t, n]) => (
            <div key={t} style={{
              background: "rgba(0,0,0,0.3)", border: `1px solid ${typeColor(t)}44`, borderRadius: 5, padding: "10px 12px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: typeColor(t) }} />
                <span style={{ fontSize: 9, letterSpacing: 1, color: typeColor(t), textTransform: "uppercase", flex: 1 }}>{t}</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: typeColor(t) }}>{n}</span>
              </div>
            </div>
          ))}
        </Grid>
      </PanelCard>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) minmax(300px,1.3fr)", gap: 14, alignItems: "start" }}>
        <PanelCard title="ENTITY INDEX" accent={ACCENT} right={<Badge color={ACCENT}>{filtered.length}</Badge>}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search entities, props, types…"
            style={{
              width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)",
              border: `1px solid ${ACCENT}44`, borderRadius: 5, color: C.textB, fontFamily: "inherit",
              fontSize: 10, padding: "8px 10px", marginBottom: 10,
            }}
          />
          <div style={{ display: "grid", gap: 6, maxHeight: 420, overflowY: "auto" }}>
            {filtered.map((o) => {
              const active = o.id === selectedId;
              return (
                <button
                  key={o.id}
                  onClick={() => setSelectedId(o.id)}
                  style={{
                    textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                    background: active ? typeColor(o.type) + "1a" : "rgba(0,0,0,0.3)",
                    border: `1px solid ${active ? typeColor(o.type) + "88" : C.border}`,
                    borderRadius: 5, padding: "8px 10px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: typeColor(o.type), flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: C.textB, fontWeight: 700, flex: 1 }}>{o.label}</span>
                    <Badge color={typeColor(o.type)}>{o.type}</Badge>
                  </div>
                  <div style={{ fontSize: 8, color: C.text, marginTop: 4 }}>
                    {linkCountById[o.id] || 0} links · conf {Math.round((o.conf || 0) * 100)}% · {o.mark}
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && <div style={{ color: C.text, fontSize: 10, padding: 8 }}>No entities match.</div>}
          </div>
        </PanelCard>

        <PanelCard
          title="ENTITY DETAIL"
          accent={selected ? typeColor(selected.type) : ACCENT}
          right={selected ? <Badge color={typeColor(selected.type)}>{selected.type}</Badge> : null}
        >
          {!selected ? (
            <div style={{ color: C.text, fontSize: 10, padding: 8 }}>Select an entity.</div>
          ) : (
            <>
              <div style={{ fontSize: 15, color: C.textB, fontWeight: 700 }}>{selected.label}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <Badge color={C.mark[selected.mark] || C.text}>{selected.mark}</Badge>
                <Badge color={C.blue}>conf {Math.round((selected.conf || 0) * 100)}%</Badge>
                <Badge color={ACCENT}>{selectedLinks.length} links</Badge>
              </div>

              <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, margin: "14px 0 6px" }}>PROPERTIES</div>
              <dl style={{ margin: 0, fontSize: 10 }}>
                {Object.entries(selected.props || {}).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 8, padding: "4px 0", borderTop: `1px solid ${C.border}` }}>
                    <dt style={{ color: C.text, width: 110, flexShrink: 0 }}>{k}</dt>
                    <dd style={{ margin: 0, color: C.textB }}>{String(v)}</dd>
                  </div>
                ))}
              </dl>

              <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, margin: "14px 0 6px" }}>RELATIONS</div>
              <div style={{ display: "grid", gap: 6 }}>
                {selectedLinks.length === 0 && <div style={{ color: C.text, fontSize: 9 }}>No relations.</div>}
                {selectedLinks.map((l, i) => {
                  const o = OBJECTS.find((x) => x.id === l.other);
                  return (
                    <button
                      key={i}
                      onClick={() => o && setSelectedId(o.id)}
                      style={{
                        textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                        display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                        background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 5,
                      }}
                    >
                      <span style={{ fontSize: 8, color: ACCENT, letterSpacing: 1, minWidth: 120 }}>{l.label}</span>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: typeColor(o?.type), flexShrink: 0 }} />
                      <span style={{ fontSize: 10, color: C.textB, flex: 1 }}>{o?.label || l.other}</span>
                      <span style={{ fontSize: 8, color: C.text }}>{"▮".repeat(l.strength)}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </PanelCard>
      </div>
    </PageShell>
  );
}
