# Tasks: Admin Branch Access Foundation

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 850–1,100 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

PR integration order: PR 1 → main; PR 2 after PR 1 → main; PR 3 after PR 2 → main; PR 4 after PR 3 → main. Each PR integrates sequentially.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Test/tooling and safe client config | PR 1 | `bun run test` | `bun run dev --host 0.0.0.0` | test config, env/client only |
| 2 | Authorization migration and privileged operations | PR 2 | `bun run test:integration` | schema-only branch contract run | migration and branch backend only |
| 3 | Auth boundary and branch workspace | PR 3 | `bun run test` | signed-in admin workspace | `src/features/**` and app wiring |
| 4 | Full verification and rollout guidance | PR 4 | `bun run lint && bun run build` | branch merge dry-run | docs and verification scripts |

## Phase 1: Test and Backend Foundation

- [ ] 1.1 Update `package.json`, `bun.lock`, `vitest.config.ts`, and `src/test/setup.ts`; install Vitest/jsdom/Testing Library, add `test` and `test:integration`, and prove each command executes.
- [ ] 1.2 Create schema-only InsForge branch `admin-branch-access-foundation`; inspect migrations/policies/functions, apply only there, restart the dev server with branch anon settings, and record merge dry-run.
- [ ] 1.3 Create `tests/integration/auth-rls.contract.test.ts` RED cases: anon/expired/unverified/inactive/missing-capability deny context, RLS, and every RPC without data.
- [ ] 1.4 Add `migrations/*_admin-branch-access-foundation.sql`: profiles, roles/capabilities, immutable receipts, seeds, grants, non-recursive pinned-path `has_capability`, `get_admin_context`, and branch SELECT RLS.
- [ ] 1.5 Make 1.3 GREEN: deny direct authorization DML and branch writes; return generic denied access for invalid, inactive, or incapable sessions.

## Phase 2: Privileged Commands and Receipts

- [ ] 2.1 Add RED integration cases for unverified/inactive bootstrap rejection, atomic rollback, same-user replay, cross-user conflict, and irreversible consumed bootstrap marker.
- [ ] 2.2 Add privileged `bootstrap_first_admin`, separate `revoke_admin_access`, and separate `reassign_admin_access`; revoke never deletes/reopens bootstrap receipt and none is browser-executable.
- [ ] 2.3 Add RED cases for create/status matching retry replay, divergent request-id conflict, concurrent create uniqueness, valid transitions, same-state success, and suspended-operation rejection.
- [ ] 2.4 Add `create_branch`/`set_branch_status` SECURITY DEFINER RPCs with canonical hashes, locked immutable receipts, validation, atomic mutation, and capability checks; make 2.3 GREEN.

## Phase 3: Browser Features

- [ ] 3.1 Create `.env.example`, `src/env.d.ts`, and `src/lib/insforge.ts` with URL/anon-key only; test that no admin/API key is accepted by browser configuration.
- [ ] 3.2 Create `src/features/auth/{api,model,ui}/` RED/component tests, then session recovery and accessible generic denied/loading/error states from `get_admin_context`.
- [ ] 3.3 Create `src/features/branches/{api,ui}/` RED/component tests, then accessible mobile-first list/create/status controls with 44px targets and no protected-data rendering when denied.
- [ ] 3.4 Wire `src/app/AppProviders.tsx`, `src/App.tsx`, and `src/main.tsx`; verify eligible admin workspace and generic denied session states.

## Phase 4: Configuration and Verification

- [ ] 4.1 Document development-only fictitious-email auto-verification and production real-verification guardrail in `docs/insforge-auth-development.md`; verify server-side verified-email checks remain enabled.
- [ ] 4.2 Run lint, build, component, integration, direct-RLS, and branch runtime checks; inspect backend merge dry-run and document compensating-migration rollback in `docs/admin-branch-access-rollout.md`.
