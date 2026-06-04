/**
 * TenantAdmin — front end for the Wave-7 multi-tenancy service (Palantir
 * platform P16 #116). Create/list tenants, manage memberships, and see the
 * resolved tenant for the current caller (whoami). Tenant resolution prefers an
 * X-Tenant-Id header / bearer principal claim, falling back to a default tenant
 * — the plug-in seam for a real IdP. Backed by /v1/tenants[, /whoami, /members].
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle } from "@/components/Wave1Kit";
import { apiGet, apiPost, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.neon;

export default function TenantAdmin() {
  const [tenants, setTenants] = useState([]);
  const [whoami, setWhoami] = useState(null);
  const [sel, setSel] = useState(null);
  const [members, setMembers] = useState([]);
  const [newName, setNewName] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("analyst");
  const listAsync = useAsync();
  const createAsync = useAsync();
  const memberAsync = useAsync();

  const load = useCallback(async () => {
    const b = await listAsync.run(() => apiGet("/v1/tenants"));
    setTenants(asList(b, "items"));
    const w = await apiGet("/v1/tenants/whoami").catch(() => null);
    if (w) setWhoami(w);
  }, [listAsync]);
  useEffect(() => { load(); }, [load]);

  const inspect = async (t) => {
    setSel(t);
    const b = await apiGet(`/v1/tenants/${encodeURIComponent(t.id)}/members`).catch(() => null);
    setMembers(asList(b, "items"));
  };

  const create = async () => {
    if (!newName.trim()) return;
    await createAsync.run(() => apiPost("/v1/tenants", { name: newName.trim() }));
    setNewName("");
    load();
  };
  const addMember = async () => {
    if (!sel || !memberName.trim()) return;
    await memberAsync.run(() => apiPost(`/v1/tenants/${encodeURIComponent(sel.id)}/members`,
      { principal: memberName.trim(), role: memberRole }));
    setMemberName("");
    inspect(sel);
  };

  return (
    <PageShell title="TENANT ADMIN" subtitle="multi-tenancy · memberships · IdP plug-in seam" accent={ACCENT}
      actions={whoami && <Badge color={C.gold}>tenant: {whoami.tenant?.name || whoami.tenant_id || whoami.tenant || "default"}</Badge>}>
      <Grid min={150} style={{ marginBottom: 14 }}>
        <StatTile label="tenants" value={tenants.length} accent={ACCENT} />
        <StatTile label="you are" value={whoami?.principal || "anon"} accent={C.gold} sub={whoami?.role || ""} />
        <StatTile label="selected" value={sel?.name || "—"} accent={C.neon} />
        <StatTile label="members" value={members.length} accent={C.gold} />
      </Grid>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <PanelCard title="TENANTS" accent={ACCENT}
          right={<span style={{ display: "flex", gap: 6 }}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="new tenant"
              style={{ ...inputStyle, width: 120 }} onKeyDown={(e) => e.key === "Enter" && create()} />
            <Btn accent={ACCENT} onClick={create}>+ CREATE</Btn>
          </span>}>
          <DataState loading={listAsync.loading} error={listAsync.error} empty={!tenants.length} emptyLabel="No tenants — create one (a default is auto-created on first resolve).">
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {tenants.map((t, i) => (
                <button key={i} onClick={() => inspect(t)}
                  style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit", fontSize: 10, padding: "8px 10px",
                    borderRadius: 4, border: `1px solid ${sel?.id === t.id ? ACCENT : C.border}`,
                    background: sel?.id === t.id ? `${ACCENT}14` : "rgba(0,0,0,0.2)", color: C.textB,
                    display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700 }}>{t.name}</span>
                  <Badge color={C.gold}>{t.plan || "free"}</Badge>
                </button>
              ))}
            </div>
          </DataState>
        </PanelCard>

        <PanelCard title={`MEMBERS · ${sel?.name || ""}`} accent={C.gold}>
          {sel ? (
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <input value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="principal (email/id)"
                  style={{ ...inputStyle, flex: 1 }} />
                <select value={memberRole} onChange={(e) => setMemberRole(e.target.value)} style={{ ...inputStyle, width: 110 }}>
                  <option value="admin">admin</option>
                  <option value="analyst">analyst</option>
                  <option value="viewer">viewer</option>
                </select>
                <Btn accent={C.gold} onClick={addMember}>ADD</Btn>
              </div>
              <DataState loading={memberAsync.loading} empty={!members.length} emptyLabel="No members yet">
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {members.map((m, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 10,
                      padding: "5px 8px", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ color: C.textB }}>{m.principal}</span>
                      <Badge color={ACCENT}>{m.role}</Badge>
                    </div>
                  ))}
                </div>
              </DataState>
            </>
          ) : <div style={{ color: C.text, fontSize: 10, padding: 10 }}>Select a tenant to manage members</div>}
        </PanelCard>
      </div>
    </PageShell>
  );
}
