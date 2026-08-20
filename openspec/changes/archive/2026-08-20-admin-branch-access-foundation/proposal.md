# Proposal: Admin Branch Access Foundation

## Intent

Establish the first secure operational slice: authenticated administrators can enter a protected workspace and manage branches. This creates the authorization and multi-branch boundary required by future operational work without treating the PRD as an implementation plan.

## Scope

### In Scope
- Email/password sign-in, session recovery, and protected administrator entry.
- Explicit server-side administrator capability checks, active-account checks, and RLS for authorization data and branches.
- Branch list, creation, activation, and suspension for authorized administrators.

### Out of Scope
- POS, inventory, catalog, pricing, money, customer portal, general configuration, and customer/cashier flows.
- Full user administration, company/tenant modeling, audit history, notifications, and configurable modules.

## Capabilities

### New Capabilities
- `admin-access-control`: Authenticated administrator access backed by explicit roles/capabilities, active-account enforcement, and protected session states.
- `branch-lifecycle-management`: Authorized listing, creation, activation, and suspension of first-class branches.

### Modified Capabilities
None. No existing main capability specs exist.

## Approach

Use the InsForge SDK for client authentication and database access. Add a migration-owned authorization and branch schema with RLS and non-recursive server-side authorization helpers; clients cannot assign roles/capabilities or authorize themselves. Keep the SPA UI limited to a protected administrator workspace. Treat a suspended branch as unavailable for future branch-scoped operations.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `src/App.tsx`, `src/main.tsx` | Modified | Session boundary and protected admin entry. |
| `src/auth/`, `src/branches/` | New | Auth state, access states, and branch lifecycle UI. |
| `src/lib/insforge.ts`, `package.json` | New/Modified | SDK client and dependency. |
| `migrations/` | New | Identity/role/capability/branch schema and RLS. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Unauthorized first admin | Med | Provision the initial admin through a documented, privileged one-time backend procedure; never email-prefix authorization or open self-assignment. |
| RLS recursion or privilege escalation | Med | Use reviewed server-side helpers and deny direct role/capability mutation. |
| Unverified/inactive account access | Low | Require verified authentication and active-account checks. |

## Rollback Plan

Disable the new frontend route/deployment to remove administrator entry. Revert the application migration only after confirming no dependent records exist; otherwise deploy a compensating migration that removes policies/access, preserves branch data, and blocks writes. Revert the bootstrap grant through the same privileged procedure.

## Dependencies

- A secure, operator-controlled first-administrator bootstrap procedure and verified InsForge email/password account.
- InsForge schema migration and RLS validation; risky backend changes should be validated on a backend branch first.

## Success Criteria

- [ ] An authenticated, active administrator can list, create, activate, and suspend branches.
- [ ] Unauthenticated, inactive, or unauthorized users cannot reach or mutate branch data, including via direct backend requests.
- [ ] No role/capability can be gained through client state, email prefixes, or self-service assignment.
