/**
 * Governance — front end for the Wave-9 governance + secrets-vault services
 * (P11 #77/#78, P1 #11): purpose-based data-use policies, retention + subject-
 * rights (access/export/erase with governed approval), and a connector secrets
 * vault (values never leave the server). Backed by /v1/governance/* + /v1/vault/*.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle, JsonView, Tabs } from "@/components/Wave1Kit";
import { apiGet, apiPost, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.gold;

export default function Governance() {
  const [tab, setTab] = useState("purpose");
  const [purposes, setPurposes] = useState([]);
  const [pName, setPName] = useState(""); const [pMarks, setPMarks] = useState("PUBLIC,INTERNAL");
  const [checkPurpose, setCheckPurpose] = useState(""); const [checkMark, setCheckMark] = useState("PII"); const [checkRes, setCheckRes] = useState(null);
  const [subjKind, setSubjKind] = useState("access"); const [subjId, setSubjId] = useState(""); const [subjRes, setSubjRes] = useState(null);
  const [requests, setRequests] = useState([]);
  const [secrets, setSecrets] = useState([]); const [sName, setSName] = useState(""); const [sVal, setSVal] = useState("");
  const pAsync = useAsync(); const sAsync = useAsync(); const subjAsync = useAsync();

  const loadPurposes = useCallback(async () => { const b = await pAsync.run(() => apiGet("/v1/governance/purposes")); setPurposes(asList(b, "items", "purposes")); }, [pAsync]);
  const loadRequests = useCallback(async () => { const b = await apiGet("/v1/governance/requests").catch(() => null); setRequests(asList(b, "items", "requests")); }, []);
  const loadSecrets = useCallback(async () => { const b = await sAsync.run(() => apiGet("/v1/vault")); setSecrets(asList(b, "items", "secrets")); }, [sAsync]);
  useEffect(() => { loadPurposes(); loadRequests(); loadSecrets(); }, [loadPurposes, loadRequests, loadSecrets]);

  const addPurpose = async () => { if (!pName.trim()) return; await apiPost("/v1/governance/purposes", { name: pName.trim(), description: "", allowed_marks: pMarks.split(",").map((m) => m.trim()).filter(Boolean) }); setPName(""); loadPurposes(); };
  const check = async () => { const b = await apiGet(`/v1/governance/check?purpose=${encodeURIComponent(checkPurpose)}&mark=${encodeURIComponent(checkMark)}`).catch(() => apiPost("/v1/governance/check", { purpose: checkPurpose, mark: checkMark })); setCheckRes(b); };
  const subjectRequest = async () => { const b = await subjAsync.run(() => apiPost("/v1/governance/subject-request", { kind: subjKind, subject_id: subjId.trim() })); setSubjRes(b); loadRequests(); };
  const erase = async (id) => { await apiPost(`/v1/governance/requests/${encodeURIComponent(id)}/execute`, {}).catch(() => apiPost("/v1/governance/execute-erasure", { request_id: id })); loadRequests(); };
  const putSecret = async () => { if (!sName.trim()) return; await apiPost("/v1/vault", { name: sName.trim(), value: sVal }); setSName(""); setSVal(""); loadSecrets(); };

  const allowed = checkRes ? (checkRes.allowed ?? checkRes.ok) : null;

  return (
    <PageShell title="GOVERNANCE" subtitle="purpose-based access · retention & subject-rights · secrets vault" accent={ACCENT}>
      <Tabs tabs={[{ id: "purpose", label: "PURPOSES" }, { id: "subject", label: "SUBJECT RIGHTS" }, { id: "vault", label: "SECRETS VAULT" }]} active={tab} onChange={setTab} accent={ACCENT} />

      {tab === "purpose" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <PanelCard title="DATA-USE PURPOSES" accent={ACCENT}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="purpose name" style={{ ...inputStyle, flex: 1 }} />
              <input value={pMarks} onChange={(e) => setPMarks(e.target.value)} placeholder="allowed marks" style={{ ...inputStyle, flex: 1 }} />
              <Btn accent={ACCENT} onClick={addPurpose}>ADD</Btn>
            </div>
            <DataState loading={pAsync.loading} empty={!purposes.length} emptyLabel="No purposes registered">
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {purposes.map((p, i) => (
                  <div key={i} style={{ fontSize: 10, padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4 }}>
                    <span style={{ color: C.textB, fontWeight: 700 }}>{p.name}</span>
                    <div style={{ marginTop: 3, display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {asList(p.allowed_marks).map((m, j) => <Badge key={j} color={C.gold}>{m}</Badge>)}
                    </div>
                  </div>
                ))}
              </div>
            </DataState>
          </PanelCard>
          <PanelCard title="ACCESS CHECK" accent={C.neon}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input value={checkPurpose} onChange={(e) => setCheckPurpose(e.target.value)} placeholder="purpose" style={{ ...inputStyle, flex: 1 }} />
              <input value={checkMark} onChange={(e) => setCheckMark(e.target.value)} placeholder="mark" style={{ ...inputStyle, width: 110 }} />
              <Btn accent={C.neon} onClick={check}>CHECK</Btn>
            </div>
            {checkRes && (
              <div style={{ padding: 14, textAlign: "center", border: `1px solid ${allowed ? C.neon : C.red}`, borderRadius: 6, background: `${allowed ? C.neon : C.red}10` }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: allowed ? C.neon : C.red }}>{allowed ? "ALLOWED" : "DENIED"}</div>
                <div style={{ fontSize: 9, color: C.text }}>purpose “{checkPurpose}” → mark {checkMark}</div>
              </div>
            )}
          </PanelCard>
        </div>
      )}

      {tab === "subject" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 12 }}>
          <PanelCard title="SUBJECT-RIGHTS REQUEST" accent={ACCENT}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <select value={subjKind} onChange={(e) => setSubjKind(e.target.value)} style={{ ...inputStyle, width: 110 }}>
                <option value="access">access</option><option value="export">export</option><option value="erase">erase</option>
              </select>
              <input value={subjId} onChange={(e) => setSubjId(e.target.value)} placeholder="subject id" style={{ ...inputStyle, flex: 1 }} />
              <Btn accent={ACCENT} onClick={subjectRequest}>SUBMIT</Btn>
            </div>
            <DataState loading={subjAsync.loading} empty={!subjRes} emptyLabel="Submit an access/export/erase request">
              <JsonView data={subjRes} max={300} />
            </DataState>
          </PanelCard>
          <PanelCard title="REQUESTS (erase = governed)" accent={C.red} right={<Btn accent={C.red} onClick={loadRequests}>↻</Btn>}>
            <DataState empty={!requests.length} emptyLabel="No subject requests">
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {requests.map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4 }}>
                    <Badge color={r.status === "pending" ? C.gold : r.status === "executed" ? C.neon : C.text}>{r.status}</Badge>
                    <span style={{ color: C.textB }}>{r.kind}</span>
                    <span style={{ color: C.text, flex: 1 }}>{r.subject_id}</span>
                    {r.kind === "erase" && r.status === "pending" && <Btn accent={C.red} onClick={() => erase(r.id)}>EXECUTE ERASE</Btn>}
                  </div>
                ))}
              </div>
            </DataState>
          </PanelCard>
        </div>
      )}

      {tab === "vault" && (
        <PanelCard title="CONNECTOR SECRETS VAULT" accent={ACCENT}
          right={<Badge color={C.gold}>values never leave the server</Badge>}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <input value={sName} onChange={(e) => setSName(e.target.value)} placeholder="secret name" style={{ ...inputStyle, flex: 1 }} />
            <input value={sVal} onChange={(e) => setSVal(e.target.value)} placeholder="secret value (write-only)" type="password" style={{ ...inputStyle, flex: 1 }} />
            <Btn accent={ACCENT} onClick={putSecret}>STORE</Btn>
          </div>
          <div style={{ fontSize: 8, color: C.text, marginBottom: 8 }}>Reference in a connector config as <code>$secret:name</code>. Stored obfuscated (base64) — honest: not KMS-grade; production should set a real key.</div>
          <DataState loading={sAsync.loading} empty={!secrets.length} emptyLabel="No secrets stored">
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {secrets.map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "5px 8px", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.textB }}>{s.name}</span>
                  <span style={{ color: C.text }}>{s.owner || "—"} · {s.obfuscation || "base64"} · {s.ts ? new Date(s.ts).toLocaleDateString() : ""}</span>
                </div>
              ))}
            </div>
          </DataState>
        </PanelCard>
      )}
    </PageShell>
  );
}
