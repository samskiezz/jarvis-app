/**
 * Reports — front end for the Wave-4 reporting service.
 *
 * Left: generate a brief from an entity-id list, a free-text query, or a case id
 * (POST /v1/reports/generate), then browse the saved-report list (GET /v1/reports)
 * and open one (GET /v1/reports/{id}) which renders its markdown body. Export
 * buttons pull /v1/reports/{id}/export?fmt=md|json and trigger a download.
 * Right: a compact ACTIVITY feed (GET /v1/activity) for situational awareness.
 *
 * Each call degrades gracefully — a failing panel surfaces an inline error and
 * the rest of the page keeps working.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, DataState, Badge } from "@/components/PageKit";
import { Btn, inputStyle } from "@/components/Wave1Kit";
import { apiGet, apiPost, apiGetText, download, asList, labelOf, useAsync } from "@/lib/wave1";
import ActivityFeed from "@/pages/Activity";

const ACCENT = C.purple;

/**
 * Minimal, dependency-free markdown renderer — enough to make a generated brief
 * readable (headings, bold, inline code, bullet lists, paragraphs). Deliberately
 * tiny: reports are trusted backend output, and we avoid adding a markdown dep.
 */
function Markdown({ text }) {
  const blocks = useMemo(() => {
    const lines = String(text || "").replace(/\r/g, "").split("\n");
    const out = [];
    let list = null;
    const inline = (s) =>
      s
        .replace(/\*\*(.+?)\*\*/g, "‹b›$1‹/b›")
        .replace(/`(.+?)`/g, "‹c›$1‹/c›");
    const renderInline = (s, key) => {
      const parts = inline(s).split(/(‹b›.*?‹\/b›|‹c›.*?‹\/c›)/g).filter(Boolean);
      return parts.map((p, i) => {
        if (p.startsWith("‹b›")) return <strong key={i} style={{ color: C.textB }}>{p.slice(3, -4)}</strong>;
        if (p.startsWith("‹c›")) return <code key={i} style={{ color: C.gold, background: "rgba(0,0,0,0.4)", padding: "1px 4px", borderRadius: 3 }}>{p.slice(3, -4)}</code>;
        return <span key={i}>{p}</span>;
      });
    };
    lines.forEach((raw, i) => {
      const line = raw.replace(/\s+$/, "");
      const h = line.match(/^(#{1,4})\s+(.*)$/);
      const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
      if (bullet) { (list ||= []).push(bullet[1]); return; }
      if (list) { out.push(<ul key={`ul${i}`} style={{ margin: "4px 0 8px 16px", padding: 0 }}>{list.map((b, j) => <li key={j} style={{ fontSize: 10, color: C.textB, lineHeight: 1.6 }}>{renderInline(b, j)}</li>)}</ul>); list = null; }
      if (h) {
        const lvl = h[1].length;
        out.push(<div key={i} style={{ fontSize: lvl === 1 ? 14 : lvl === 2 ? 12 : 10.5, fontWeight: 700, color: lvl <= 2 ? ACCENT : C.textB, margin: "10px 0 4px", letterSpacing: lvl === 1 ? 1.5 : 0.5 }}>{renderInline(h[2], i)}</div>);
      } else if (line.trim() === "") {
        out.push(<div key={i} style={{ height: 6 }} />);
      } else {
        out.push(<p key={i} style={{ margin: "0 0 4px", fontSize: 10, color: C.textB, lineHeight: 1.6 }}>{renderInline(line, i)}</p>);
      }
    });
    if (list) out.push(<ul key="ul-last" style={{ margin: "4px 0 8px 16px", padding: 0 }}>{list.map((b, j) => <li key={j} style={{ fontSize: 10, color: C.textB, lineHeight: 1.6 }}>{renderInline(b, j)}</li>)}</ul>);
    return out;
  }, [text]);
  return <div>{blocks}</div>;
}

export default function Reports() {
  // Generate form.
  const [mode, setMode] = useState("query"); // query | entities | case
  const [value, setValue] = useState("");
  const genAsync = useAsync();
  const [genMsg, setGenMsg] = useState(null);

  // Saved list + selected report.
  const [reports, setReports] = useState([]);
  const listAsync = useAsync();
  const [selectedId, setSelectedId] = useState(null);
  const [report, setReport] = useState(null);
  const openAsync = useAsync();
  const [exportMsg, setExportMsg] = useState(null);

  const loadList = useCallback(async () => {
    const body = await listAsync.run(() => apiGet("/v1/reports"));
    setReports(body ? asList(body, "reports") : []);
  }, [listAsync]);

  useEffect(() => { loadList(); }, []);

  const generate = async () => {
    setGenMsg(null);
    const v = value.trim();
    if (!v) { setGenMsg({ err: true, text: "Enter a query, entity ids, or a case id" }); return; }
    let payload = {};
    if (mode === "query") payload = { query: v };
    else if (mode === "case") payload = { case_id: v };
    else payload = { entity_ids: v.split(/[\s,]+/).filter(Boolean) };
    const res = await genAsync.run(() => apiPost("/v1/reports/generate", payload));
    if (res) {
      setGenMsg({ err: false, text: `Generated ${res.id || labelOf(res)}` });
      await loadList();
      const id = res.id || res.report_id;
      if (id) openReport(id);
      else if (res.title || res.body || res.markdown) { setReport(res); setSelectedId(res.id || "(new)"); }
    }
  };

  const openReport = useCallback(async (id) => {
    setSelectedId(id);
    setReport(null);
    setExportMsg(null);
    const res = await openAsync.run(() => apiGet(`/v1/reports/${id}`));
    if (res) setReport(res.report || res);
  }, [openAsync]);

  const exportReport = async (fmt) => {
    setExportMsg(null);
    if (!selectedId) return;
    try {
      if (fmt === "json") {
        const body = await apiGet(`/v1/reports/${selectedId}/export?fmt=json`);
        download(`report-${selectedId}.json`, JSON.stringify(body, null, 2), "application/json");
      } else {
        const md = await apiGetText(`/v1/reports/${selectedId}/export?fmt=md`);
        download(`report-${selectedId}.md`, md, "text/markdown");
      }
      setExportMsg({ err: false, text: `Exported ${fmt.toUpperCase()}` });
    } catch (e) {
      setExportMsg({ err: true, text: String(e.message || e) });
    }
  };

  const body = report && (report.markdown || report.body || report.content || report.text || "");

  return (
    <PageShell
      title="REPORTS"
      subtitle="WAVE-4 REPORTING — GENERATE · BROWSE · RENDER · EXPORT"
      accent={ACCENT}
      actions={<Btn accent={ACCENT} onClick={loadList}>↻ REFRESH</Btn>}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        <StatTile label="Saved Reports" value={reports.length} accent={ACCENT} />
        <StatTile label="Selected" value={report ? labelOf(report) : "—"} accent={C.blue} />
        <StatTile label="Mode" value={mode} accent={C.gold} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr) minmax(0,0.8fr)", gap: 14, alignItems: "start" }}>
        {/* LEFT — generate + list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <PanelCard title="GENERATE BRIEF" accent={ACCENT}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {["query", "entities", "case"].map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  style={{ cursor: "pointer", fontFamily: "inherit", fontSize: 9, letterSpacing: 1, fontWeight: 700,
                    padding: "5px 10px", borderRadius: 4, flex: 1,
                    border: `1px solid ${m === mode ? ACCENT + "88" : C.border}`,
                    background: m === mode ? ACCENT + "1a" : "rgba(0,0,0,0.25)",
                    color: m === mode ? ACCENT : C.text }}>
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
            <textarea value={value} onChange={(e) => setValue(e.target.value)}
              rows={3}
              placeholder={mode === "query" ? "describe the brief you want…"
                : mode === "entities" ? "entity ids, comma or space separated"
                  : "case id"}
              style={{ ...inputStyle, resize: "vertical", marginBottom: 8 }} />
            <Btn accent={ACCENT} onClick={generate} disabled={genAsync.loading}>
              {genAsync.loading ? "GENERATING…" : "▶ GENERATE"}
            </Btn>
            {genMsg && <div style={{ fontSize: 9, color: genMsg.err ? C.red : C.neon, marginTop: 8 }}>{genMsg.err ? "⚠ " : "✓ "}{genMsg.text}</div>}
            {genAsync.error && <div style={{ fontSize: 9, color: C.red, marginTop: 6 }}>⚠ {String(genAsync.error.message || genAsync.error)}</div>}
          </PanelCard>

          <PanelCard title="SAVED REPORTS" accent={C.blue}
            right={<span style={{ fontSize: 8, color: C.text }}>{reports.length}</span>}>
            <DataState loading={listAsync.loading} error={listAsync.error}
              empty={!listAsync.loading && reports.length === 0} emptyLabel="No reports yet">
              <div style={{ maxHeight: 420, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {reports.map((r, i) => {
                  const id = r.id || r.report_id || i;
                  const active = id === selectedId;
                  return (
                    <button key={id} onClick={() => openReport(id)}
                      style={{ textAlign: "left", cursor: "pointer",
                        border: `1px solid ${active ? C.blue + "88" : C.border}`,
                        background: active ? C.blue + "1a" : "rgba(0,0,0,0.25)", borderRadius: 5,
                        padding: "7px 9px", color: C.textB, fontFamily: "inherit" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: active ? C.blue : C.textB }}>{labelOf(r)}</div>
                      <div style={{ fontSize: 8, color: C.text, marginTop: 2 }}>
                        {String(id)}{r.created_at ? ` · ${r.created_at}` : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            </DataState>
          </PanelCard>
        </div>

        {/* MIDDLE — rendered report */}
        <PanelCard title="REPORT" accent={ACCENT}
          right={selectedId && (
            <span style={{ display: "flex", gap: 6 }}>
              <Btn accent={C.neon} onClick={() => exportReport("md")} style={{ fontSize: 8, padding: "3px 8px" }}>⬇ MD</Btn>
              <Btn accent={C.gold} onClick={() => exportReport("json")} style={{ fontSize: 8, padding: "3px 8px" }}>⬇ JSON</Btn>
            </span>
          )}>
          {!selectedId ? (
            <div style={{ padding: 18, fontSize: 10, color: C.text, letterSpacing: 1 }}>
              Generate a brief or select a saved report.
            </div>
          ) : (
            <DataState loading={openAsync.loading} error={openAsync.error} empty={!report && !openAsync.loading}>
              {report && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
                    borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: ACCENT, flex: 1 }}>{labelOf(report)}</span>
                    {report.status && <Badge color={C.neon}>{report.status}</Badge>}
                  </div>
                  {exportMsg && <div style={{ fontSize: 9, color: exportMsg.err ? C.red : C.neon, marginBottom: 8 }}>{exportMsg.err ? "⚠ " : "✓ "}{exportMsg.text}</div>}
                  <div style={{ maxHeight: 520, overflowY: "auto", paddingRight: 6 }}>
                    {body
                      ? <Markdown text={body} />
                      : <div style={{ fontSize: 9, color: C.text }}>Report has no markdown body.</div>}
                  </div>
                </div>
              )}
            </DataState>
          )}
        </PanelCard>

        {/* RIGHT — activity feed */}
        <ActivityFeed embedded limit={30} />
      </div>
    </PageShell>
  );
}
