/**
 * Activity — front end for the Wave-4 collaboration activity feed (/v1/activity).
 *
 * Dual-purpose: as a standalone page it renders inside a PageShell; passed
 * `embedded` it renders just the PanelCard so Reports (and any other page) can
 * drop in a compact activity widget without a second network abstraction. The
 * feed degrades gracefully — a failure surfaces inline and auto-refresh keeps
 * trying on the next tick.
 */
import { useCallback, useEffect, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, DataState } from "@/components/PageKit";
import { Btn } from "@/components/Wave1Kit";
import { apiGet, qs, asList, labelOf, useAsync } from "@/lib/wave1";

const ACCENT = C.neon;

const verbColor = (v = "") => {
  const s = String(v).toLowerCase();
  if (/(create|add|generate|new)/.test(s)) return C.neon;
  if (/(delete|remove|flag|alert)/.test(s)) return C.red;
  if (/(update|edit|merge|resolve|change)/.test(s)) return C.gold;
  return C.blue;
};

function FeedList({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 560, overflowY: "auto" }}>
      {items.map((a, i) => {
        const verb = a.action || a.verb || a.type || a.event || "event";
        const who = a.actor || a.user || a.author || a.by;
        const when = a.created_at || a.timestamp || a.at || a.time;
        const target = a.resource_id || a.target || a.object || a.resource_type;
        return (
          <div key={a.id || i} style={{ border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.25)",
            borderRadius: 5, padding: "7px 9px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: verbColor(verb),
                boxShadow: `0 0 5px ${verbColor(verb)}`, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: verbColor(verb) }}>{String(verb)}</span>
              {who && <span style={{ fontSize: 9, color: C.textB }}>· {String(who)}</span>}
            </div>
            <div style={{ fontSize: 9, color: C.textB, marginTop: 3, lineHeight: 1.5 }}>
              {a.message || a.text || a.summary || (target ? `→ ${target}` : labelOf(a))}
            </div>
            {when && <div style={{ fontSize: 8, color: C.text, marginTop: 2 }}>{String(when)}</div>}
          </div>
        );
      })}
    </div>
  );
}

export default function Activity({ embedded = false, limit = 50 }) {
  const [items, setItems] = useState([]);
  const feedAsync = useAsync();

  const load = useCallback(async () => {
    const body = await feedAsync.run(() => apiGet(`/v1/activity${qs({ limit })}`));
    setItems(body ? asList(body, "activity", "events", "items") : []);
  }, [feedAsync, limit]);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000); // light auto-refresh
    return () => clearInterval(t);
  }, [load]);

  const card = (
    <PanelCard title="ACTIVITY FEED" accent={ACCENT}
      right={<span style={{ fontSize: 8, color: C.text }}>{items.length}</span>}>
      <DataState loading={feedAsync.loading && items.length === 0} error={feedAsync.error}
        empty={!feedAsync.loading && items.length === 0} emptyLabel="No recent activity">
        <FeedList items={items} />
      </DataState>
    </PanelCard>
  );

  if (embedded) return card;

  return (
    <PageShell
      title="ACTIVITY"
      subtitle="WAVE-4 COLLAB — RECENT ACTIVITY ACROSS THE PLATFORM"
      accent={ACCENT}
      actions={<Btn accent={ACCENT} onClick={load}>↻ REFRESH</Btn>}
    >
      <div style={{ maxWidth: 720 }}>{card}</div>
    </PageShell>
  );
}
