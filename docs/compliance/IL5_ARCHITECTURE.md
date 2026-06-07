# IL5 / FedRAMP High Architecture Document

**Version:** 1.0  
**Classification:** INTERNAL  
**Status:** LIVING DOCUMENT — sections marked *implemented*, *partial*, or *planned*.

---

## 1. System Overview

The Jarvis Backend is a Palantir-class sovereign data platform providing ontology-driven knowledge management, governed actions, multi-tenant isolation, and tamper-evident audit. This document describes the architecture from an IL5 (Impact Level 5) / FedRAMP High perspective, mapping every control family to concrete system components.

| Component | Status |
|-----------|--------|
| Authentication & Authorization | implemented |
| Encryption at Rest / In Transit | partial |
| Audit & Accountability | implemented |
| Configuration Management | implemented |
| Incident Response | planned |
| Continuous Monitoring | partial |

---

## 2. System Boundary Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        AUTHORISED USERS                          │
│   (Bearer tokens → role resolution → clearance lattice)         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ TLS 1.2+
┌──────────────────────────▼──────────────────────────────────────┐
│                     JARVIS BACKEND                               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │   FastAPI   │ │  RevDB      │ │  Ontology   │ │  Actions  │ │
│  │   Router    │ │  (SQLite)   │ │  Store      │ │  Service  │ │
│  │   Layer     │ │             │ │  (SQLite)   │ │           │ │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └─────┬─────┘ │
│         └─────────────────┴─────────────────┴────────────┘      │
│                           │                                      │
│  ┌─────────────┐ ┌────────┴────────┐ ┌─────────────┐           │
│  │ Audit Ledger│ │ Cross-Org Trust │ │  Tenancy    │           │
│  │ (SQLite)    │ │   (SQLite)      │ │  (SQLite)   │           │
│  │ KGIK hash   │ │                 │ │             │           │
│  │ chain       │ │                 │ │             │           │
│  └─────────────┘ └─────────────────┘ └─────────────┘           │
└─────────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                     DATA LAYER                                   │
│   SQLite (WAL mode)  │  Optional: PostgreSQL (pg_store)        │
└─────────────────────────────────────────────────────────────────┘
```

**Status:** *implemented* — all boundary components exist and are wired.

---

## 3. Data Flow Diagrams

### 3.1 Inbound Data Flow

```
Client Request
      │
      ▼
[ TLS termination ] ──▶ [ CORS middleware ]
      │
      ▼
[ Bearer validation ] ──▶ [ Role resolution (security.py) ]
      │
      ▼
[ Tenant resolution (auth_tenancy.py) ] ──▶ [ Clearance check (redaction.py) ]
      │
      ▼
[ Route handler ] ──▶ [ Service layer ] ──▶ [ SQLite store ]
      │
      ▼
[ Audit record (audit.py) ] ──▶ [ RevDB commit (revdb.py) ]
```

**Status:** *implemented*

### 3.2 Outbound Data Flow

```
Service Layer
      │
      ▼
[ Redaction / classification mask (security.py) ]
      │
      ▼
[ Tenant-scoped filter (tenancy.py scope_filter) ]
      │
      ▼
[ Cross-org trust validation (cross_org.py) ] ──▶ [ Peer tenant ]
      │
      ▼
[ Response serialization ] ──▶ [ TLS ]
```

**Status:** *partial* — cross-org sharing is implemented; response DLP is planned.

### 3.3 Internal Data Flow

```
Ontology Write
      │
      ▼
[ Ontology Store (upsert_object / delete_object / apply_action) ]
      │
      ├──▶ [ RevDB commit auto-generated ]
      ├──▶ [ Audit ledger record ]
      └──▶ [ Action audit (actions_service.py) ]
```

**Status:** *implemented*

---

## 4. Control Mappings (NIST 800-53 rev 5)

### 4.1 Access Control (AC)

| Control | Implementation | Status |
|---------|---------------|--------|
| AC-2 | Role-based accounts: `public`, `analyst`, `admin` mapped via `JARVIS_ROLES` and `JARVIS_API_KEY`. | implemented |
| AC-3 | Clearance lattice enforced on every ontology READ by `redaction.py` (`PUBLIC < INTERNAL < FINANCIAL < PII < RESTRICTED`). | implemented |
| AC-6 | Least privilege: `public` sees only PUBLIC; `analyst` sees PUBLIC/INTERNAL/FINANCIAL; `admin` sees all. | implemented |
| AC-17 | Remote access governed by bearer-token gating (`require_bearer` / `optional_bearer`). | implemented |

### 4.2 Audit & Accountability (AU)

| Control | Implementation | Status |
|---------|---------------|--------|
| AU-3 | Every mutation writes `actor`, `action`, `resource`, `detail` to `audit_log`. | implemented |
| AU-6 | Hash-chained tamper evidence (`sha256(prev_hash + payload)`). `verify_chain()` detects alterations. | implemented |
| AU-9 | Append-only ledger; no UPDATE/DELETE paths exposed on `audit_log`. | implemented |
| AU-12 | RevDB auto-commits on every ontology write and action execution, providing a second audit dimension. | implemented |

### 4.3 Configuration Management (CM)

| Control | Implementation | Status |
|---------|---------------|--------|
| CM-2 | CI/CD pipeline in `.github/workflows/` builds, tests, and packages the backend. | implemented |
| CM-6 | All settings are env-var driven (`JARVIS_API_KEY`, `JARVIS_ROLES`, `CORS_ORIGINS`, `REQUIRE_AUTH`). | implemented |
| CM-7 | Minimal attack surface: stdlib `sqlite3` only; no external DB driver required for default deployment. | implemented |

### 4.4 Identification & Authentication (IA)

| Control | Implementation | Status |
|---------|---------------|--------|
| IA-2 | Bearer-token authentication (`Authorization: Bearer <token>`). | implemented |
| IA-5 | Token strength: dev key is env-configurable; production should rotate via secrets vault (`server/routes/vault.py`). | partial |
| IA-8 | IdP plug-in seam in `auth_tenancy.py` — replacing `principal` with a JWT `sub` requires zero call-site changes. | implemented |

### 4.5 System & Communications Protection (SC)

| Control | Implementation | Status |
|---------|---------------|--------|
| SC-8 | TLS 1.2+ in transit (terminated at the reverse proxy / ingress layer). | planned |
| SC-13 | Encryption at rest: SQLite files reside on encrypted volumes (platform responsibility); field-level encryption not yet applied. | partial |
| SC-28 | SQLite WAL mode with `PRAGMA synchronous=NORMAL` for durability. Backup/restore is operator-managed. | partial |

### 4.6 System & Information Integrity (SI)

| Control | Implementation | Status |
|---------|---------------|--------|
| SI-4 | Continuous monitoring via the audit ledger + RevDB. Anomaly detection is planned via the proactive loop. | partial |
| SI-7 | Hash-chain integrity verification (`audit.py verify_chain()`). | implemented |

---

## 5. Authentication / Authorization Architecture

```
Authorization Header
        │
        ▼
[ auth.py: optional_bearer / require_bearer ]
        │
        ▼
[ security.py: role_for_token(token) ]
        │
        ├──▶ explicit JARVIS_ROLES mapping
        ├──▶ JARVIS_API_KEY → admin
        └──▶ unknown → public
        │
        ▼
[ redaction.py: clearance_rank(role) ]
        │
        ▼
[ READ ]  can_view(mark, role) ──▶ redact(obj, role)
[ WRITE ] governed by actions_service.py + approval gates
```

**Status:** *implemented*

---

## 6. Encryption

### 6.1 At Rest

- **SQLite databases** (`server/data/*.db`) rely on the underlying filesystem/volume encryption (LUKS, EBS encrypted volumes, etc.).
- **Field-level encryption** for PII props is *planned* — today PII is masked via `security.py` redaction rather than encrypted at rest.

### 6.2 In Transit

- **TLS 1.2+** is required at the ingress / reverse-proxy layer (not terminated inside the Python process).
- **CORS** is locked to explicit origins when `JARVIS_CORS_ORIGINS` is set; otherwise a regex is used for developer convenience.

**Status:** *partial*

---

## 7. Audit Logging Architecture

Two complementary audit planes exist:

1. **KGIKLedger** (`server/services/audit.py`)
   - Append-only hash chain.
   - Every row links to the previous via `sha256(prev_hash + canonical)`.
   - `verify_chain()` recomputes the entire chain on demand.

2. **RevDB** (`server/services/revdb.py`)
   - Git-like commits with parent pointers.
   - Every ontology write auto-generates a commit containing the old/new value diff.
   - Branches allow parallel policy exploration.

Both planes are queryable via the API (`/v1/audit`, `/v1/security/audit`, `/v1/revdb/history`).

**Status:** *implemented*

---

## 8. Incident Response Procedures

1. **Detection** — Monitor `audit_log` for `action.submit.denied`, `security.whoami` anomalies, and chain-break alerts from `verify_chain()`.
2. **Containment** — Rotate `JARVIS_API_KEY` and revoke tokens via `JARVIS_ROLES` reconfiguration.
3. **Eradication** — Use RevDB `revert_to` to roll back ontology mutations to a known-good commit.
4. **Recovery** — Replay legitimate commits from a backup branch.
5. **Post-Incident** — Export the audit tail (`/v1/security/audit`) for forensic analysis.

**Status:** *planned* — procedures documented; automated playbooks are future work.

---

## 9. Configuration Management

- **CI/CD:** GitHub Actions workflows in `.github/workflows/`.
- **Env-driven config:** All secrets and toggles are externalised (`server/config.py`).
- **Idempotent schema:** Every SQLite service runs `CREATE TABLE IF NOT EXISTS` on import so rolling deployments never fail on DDL.
- **No secrets in source:** API keys, DB paths, and role mappings are injected at runtime.

**Status:** *implemented*

---

## 10. Multi-Tenancy & Cross-Org Boundaries

- **Tenant isolation:** `tenancy.py` provides `scope_filter()` and `tenant_db_path()` for incremental adoption of row-level or per-tenant DB isolation.
- **Cross-org sharing:** `cross_org.py` mints bilateral trust tokens with expiry and permission scopes. Shares are recorded in `cross_org_share`.

**Status:** *implemented*

---

## 11. Roadmap to Full IL5 Accreditation

| Milestone | Target | Status |
|-----------|--------|--------|
| TLS termination inside app or mTLS sidecar | M+1 | planned |
| Field-level encryption for PII at rest | M+2 | planned |
| Automated anomaly detection on audit stream | M+2 | planned |
| FIPS 140-2 validated crypto module | M+3 | planned |
| Formal penetration testing & SSP generation | M+3 | planned |

---

*This document is maintained by the platform security team. Last updated: 2026-06-07.*
