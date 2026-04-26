# Org Isolation Audit — SEC-05

**Date:** 2026-04-25  
**Reviewer:** Implementation audit (automated + manual)

## Enforcement Layer

| Component | File | Status |
|-----------|------|--------|
| `OrgContextService` (REQUEST-scoped) | `src/common/org-context.service.ts` | ✅ Added |
| `OrgScopeInterceptor` (global `APP_INTERCEPTOR`) | `src/common/interceptors/org-scope.interceptor.ts` | ✅ Added |
| `@EnforceOrgScope()` decorator | `src/common/decorators/enforce-org-scope.decorator.ts` | ✅ Added |

The interceptor blocks any authenticated request from a role in `{admin, manager, supervisor, agent}` that carries no `orgId` in its JWT — logs CRITICAL and returns 403.

---

## Service-by-Service Audit

### Users (`users.service.ts` / `users.controller.ts`)
- `findAll(orgId?)` — passes org filter to query ✅
- `GET /users` — super_admin gets all; others scoped to `user.orgId` ✅
- `GET /users/:id` — cross-org access → 403 ✅
- `PATCH /users/:id` — `assertSameOrg()` guard ✅

### Agents (`agents.service.ts` / `agents.controller.ts`)
- `findFieldStaff(orgId?)` — filters `WHERE organisationId = orgId` ✅
- `findAll(orgId?)` — filters when orgId present ✅
- `getLiveAgents(orgId?)` — filters when orgId present ✅
- `GET /agents/:id` — cross-org blocked with 403 ✅

### Tasks (`tasks.service.ts` / `tasks.controller.ts`)
- `findAll({ organisationId })` — filters when present ✅
- `getStats({ organisationId })` — filters when present ✅
- `GET /tasks` — passes `user.orgId` for non-super_admin ✅

### Jobs (`jobs.service.ts` / `jobs.controller.ts`)
- `GET /jobs` — **intentionally unscoped** (marketplace: workers/employers browse all open jobs). Status filter `status=open` limits to published listings. ✅ (by design)
- `GET /jobs/my-postings` — scoped to `user.userId` (poster) ✅
- `POST /jobs` — sets `postedById = user.userId` and `orgId` on creation ✅
- Admin views of org jobs use `postedById` or org-level filter via reports ✅

### Reports (`reports.service.ts` / `reports.controller.ts`)
- `taskReport(orgId?)` — filters when present ✅
- `attendanceReport(orgId?)` — filters when present ✅
- `financialReport(orgId?)` — filters when present ✅
- `agentPerformanceReport(orgId?)` — filters when present ✅
- `loginReport(orgId?)` — **BUG FIXED**: was ignoring `orgId` param; now applies `WHERE organisationId = orgId` ✅
- All report controller handlers: `orgId = user.role === SUPER_ADMIN ? undefined : user.orgId` ✅

### Wallet (`wallet.service.ts`)
- All wallet operations scoped by `agentId` → each agent has exactly one wallet ✅
- `getPlatformStats()` — aggregate view, super_admin only ✅

### Organisations (`organisations.service.ts`)
- `getStats(orgId)`, `getMembers(orgId)`, `getDashboard(orgId)` — all org-scoped ✅
- Controller enforces caller is member of that org or super_admin ✅

### Disputes (`disputes.service.ts`)
- `findForOrg(orgId)` — filters `WHERE organisationId = orgId` ✅

### Chat (`chat.service.ts`)
- Scoped by `conversationId` — users can only access conversations they are a participant in ✅

### GPS (`gps.service.ts`)
- Location data scoped by `agentId` ✅

### Audit (`audit.service.ts`)
- `getAuditLogs({ orgId })` — non-super_admin restricted to own org ✅

---

## Cross-Org Attack Surface Summary

| Risk | Status |
|------|--------|
| User A reads User B's profile via `GET /users/:id` | ✅ Blocked (assertSameOrg) |
| User A reads Org B's agents via `GET /agents` | ✅ Blocked (orgId in JWT filter) |
| User A reads Org B's tasks via `GET /tasks` | ✅ Blocked (organisationId filter) |
| User A reads Org B's login logs via reports | ✅ Fixed (loginReport bug patched) |
| User A reads all jobs (marketplace) | ✅ By design (open marketplace) |
| Role with no orgId in JWT bypasses isolation | ✅ Blocked by OrgScopeInterceptor |
| Super_admin accesses cross-org data | ✅ Intended — super_admin is exempt |

---

## Roles Requiring `orgId` in JWT

The following roles will receive a 403 if their JWT contains no `orgId`:

- `admin`
- `manager`
- `supervisor`
- `agent`

Exempt (orgId optional):
- `super_admin` — cross-org by design
- `employer` — may be individual (no org)
- `worker` — individual role
