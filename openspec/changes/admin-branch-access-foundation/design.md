# Design: Admin Branch Access Foundation

## Technical Approach

Preserve the Vite SPA and add an InsForge-backed access state machine plus branch workspace. The browser keeps only URL/anon-key configuration. A versioned PostgreSQL migration owns authorization, RLS, transactional commands, and operator-only bootstrap; no tenant, user-administration, or general audit subsystem is introduced.

## Architecture Decisions

| Decision | Alternatives / tradeoff | Choice and rationale |
|---|---|---|
| One authorization predicate | Repeating checks in policies/RPCs risks drift. | `has_capability(required text)` is the only server-side authorization condition. It returns true only when `auth.uid()` identifies a current `auth.users` row (valid session), that trusted row has `email_confirmed_at IS NOT NULL`, `profiles.is_active = true`, and role mappings contain `required`. `get_admin_context`, every branch RLS policy, and every authenticated RPC call it, so direct requests receive identical denial. |
| Capability storage | A boolean admin flag is simpler but cannot safely grow. Tenant membership exceeds scope. | Global `roles`, `capabilities`, `role_capabilities`, `user_roles`, and `profiles`; seed `admin` plus `branches.manage` idempotently. Clients cannot mutate authorization rows. |
| Command surface | Direct writes make protected fields and retries fragile. | Revoke branch INSERT/UPDATE/DELETE and expose transactional `SECURITY DEFINER` commands. RLS permits SELECT only through `has_capability('branches.manage')`. |
| Bootstrap receipt | General audit history exceeds the proposal. | `bootstrap_first_admin(user_id, change_ref)` is an operator-only procedure, not client-executable. A single immutable `bootstrap_receipt` is only a bootstrap-consumption/idempotency marker; it is not an activity audit. |

## Data Flow

```text
Browser → session recovery → get_admin_context → has_capability
Browser/direct REST → RLS or branch RPC ────────┘
Authorized command → validate/hash → transaction → branch + command receipt
Operator procedure → target validation → grant + bootstrap receipt (one transaction)
```

`App` renders loading, signed-out, inactive/forbidden, error, or workspace states from `get_admin_context`; client claims and URLs never authorize.

## File Changes

| File | Action | Description |
|---|---|---|
| `package.json`, `bun.lock` | Modify | Add `@insforge/sdk` and the Vitest/Testing Library test capability. |
| `.env.example`, `src/env.d.ts`, `src/lib/insforge.ts` | Create | Typed public configuration and singleton anon client; never expose an admin key. |
| `src/main.tsx`, `src/App.tsx` | Modify | Compose providers and protected states. |
| `src/app/AppProviders.tsx` | Create | Application composition root. |
| `src/features/auth/{api,model,ui}/` | Create | Session/context adapter and accessible access states. |
| `src/features/branches/{api,ui}/` | Create | Branch list/create/status workspace. |
| `migrations/*_admin-branch-access-foundation.sql` | Create | Schema, grants, helpers, RLS, RPCs, receipts, seeds, and bootstrap. |
| `vitest.config.ts`, `src/test/setup.ts`, `src/**/*.test.tsx`, `tests/integration/auth-rls.contract.test.ts` | Create | Unit/component and backend contract tests. |

## Interfaces / Contracts

- `has_capability(text)` is `STABLE SECURITY DEFINER`, schema-qualified, with pinned `search_path`; it directly reads `auth.users` and authorization tables to avoid RLS recursion. Revoke `PUBLIC` execution and grant only necessary calls to `authenticated`.
- `get_admin_context()` evaluates `has_capability('branches.manage')` and returns only the safe access state/capabilities.
- `bootstrap_first_admin(user_id, change_ref)` requires a pre-existing target with trusted verified email and `profiles.is_active=true`. Under one transaction/lock it validates that bootstrap is unconsumed, grants `admin`, and inserts the immutable receipt. Same `change_ref` plus same user replays the stored result; the same reference with another user conflicts; any different reference after consumption is rejected. Receipt UPDATE/DELETE and direct DML are denied.
- `branch_command_receipts(actor_id, request_id, operation, payload_hash, branch_id, result_status)` is immutable with `UNIQUE(actor_id,request_id)`.
- `create_branch` hashes canonical `create_branch + normalized_name`. `set_branch_status` hashes canonical `set_branch_status + branch_id + validated_status`. Each command authorizes with `has_capability`, validates, locks/claims its receipt key, mutates and records the result atomically. Matching retries replay the stored branch/result; key reuse with any divergent hash conflicts. Status accepts only `active|suspended`; same-state commands succeed unchanged.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit/component | State mapping, canonical payloads, accessible denied/retry UI | Vitest, jsdom, Testing Library |
| Integration | Predicate parity, bootstrap, receipts, concurrency | Disposable schema-only InsForge branch; SDK plus direct REST/database contract tests |
| E2E | Full browser navigation | Deferred; no routing workflow exists |

RED contracts cover anon/expired/unverified/inactive/missing-capability denial through context, RLS, and every RPC; bootstrap inactive/unverified rejection, irreversible consumption, same-user replay, cross-user conflict, and atomic rollback; create/status replay, concurrent duplication prevention, and divergent-payload conflict.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary is introduced.

## Migration / Rollout

No data migration. Validate the future schema migration on an InsForge schema-only backend branch, contract-test it, inspect merge dry-run, then merge with human approval. Roll back via a compensating migration that revokes RPCs/policies while preserving branch and minimal receipt data; no audited revocation is promised.

## Open Questions

None.
