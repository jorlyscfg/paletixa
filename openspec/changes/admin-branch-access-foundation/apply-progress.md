# Apply Progress: Admin Branch Access Foundation

## Execution

- Mode: Standard (`strict_tdd: false`)
- Delivery strategy: `auto-chain`
- Chain strategy: `stacked-to-main`
- Current work unit: PR 3 — `pr3-authentication-branch-workspace` (bounded correction complete)
- Future target: `main`
- Runtime attempt token: `sha256:8afb1752134297fe40bc56c9e1f9f1a4295b145a2a39b65d6a4a3ace971a8719`
- Auditable baseline commit: `6e7db8bc0354cacf9bb249bdfd9e3503fd00746e`; the PR 1 commit is its direct child, with the exact child hash persisted in Engram and the Result Contract because a commit cannot contain its own hash.

## Cumulative Task Status

- [x] 1.1 Install and verify Vitest, jsdom, Testing Library, and executable unit/integration scripts.
- [x] 1.2 Create and inspect the schema-only InsForge branch.
- [x] 1.3 Add RED authorization integration contracts.
- [x] 1.4 Add the authorization and branch schema migration.
- [x] 1.5 Make direct authorization and branch access denials GREEN.
- [x] 2.1 Add bootstrap rejection, replay, conflict, and rollback contracts.
- [x] 2.2 Add privileged bootstrap, revoke, and reassignment operations.
- [x] 2.3 Add branch command idempotency and concurrency contracts.
- [x] 2.4 Add transactional branch command RPCs.
- [x] 3.1 Add typed URL/anon-key-only browser configuration and privileged-key rejection tests.
- [x] 3.2 Add the authentication boundary.
- [x] 3.3 Add the branch workspace.
- [x] 3.4 Wire application providers and protected states.
- [ ] 4.1 Document development email verification behavior.
- [ ] 4.2 Complete backend and rollout verification.

## Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test | `bun run test` exited 0: 1 test file passed, 2 tests passed in 1.56s. |
| Integration test | `bun run test:integration` exited 0: 1 test file passed, 1 test passed in 1.64s. The smoke test initializes real `@insforge/sdk` auth/database modules from URL and anon-key configuration without a backend request or mutation. |
| Lint | `bun run lint` exited 0 with no ESLint findings. |
| Build | `bun run build` exited 0: TypeScript build and Vite 8.2.1 production build succeeded; 16 modules transformed in 254ms. |
| Runtime harness | `bun run dev --host 0.0.0.0 --port 41731` served `http://127.0.0.1:41731/` with HTTP 200, a 620-byte document, and the root mount; the harness terminated the process and confirmed it stopped. |
| Rollback boundary | Revert `package.json` and `bun.lock`; delete `vitest.config.ts`, `.env.example`, `src/env.d.ts`, `src/test/setup.ts`, `src/lib/insforge.ts`, `src/lib/insforge.test.ts`, and `tests/integration/browser-client.integration.test.ts`. This removes only PR 1 test tooling and public browser client configuration. |

## Review Budget

- Changed lines: 369 total across implementation and required OpenSpec persistence: 363 additions plus 6 deletions.
- Implementation breakdown: `package.json` 11, `bun.lock` 203, and new configuration/source/tests 98 (312 lines).
- Persistence breakdown: `tasks.md` 4 and `apply-progress.md` 53 (57 lines).
- Budget result: within the 400-line work-unit limit.

## PR 2 Work Unit Evidence

| Evidence | Exact result |
|---|---|
| RED contract | On fresh schema-only branch `admin-branch-access-foundation-validation` at T0, `bun run test:integration` exited 1: PR1 smoke passed and all 11 expanded PR2 cases skipped because `public.profiles` did not exist. |
| Focused test | After migration `20260814025511`, `bun run test:integration` exited 0: 2 files and 12 tests passed in 67.06s — 8 PR2 contract declarations (11 expanded runtime cases) plus 1 PR1 smoke contract. |
| Branch runtime | Fresh schema-only validation branch received the migration from T0. Readback found 8 tables, 1 branch SELECT policy, 8 pinned-path functions, 1 bootstrap receipt, 5 command receipts, 2 branches, and 1 admin grant. |
| Verification field | Real `auth.users` contains `email_verified boolean` and no `email_confirmed_at`. The server-side predicate and privileged target checks use the trusted verification value (with a compatibility probe for `email_confirmed_at`) and the unverified contract passed. |
| Quality | `bun run lint` exited 0. `bun run build` exited 0; Vite built 16 modules in 354ms. |
| Merge safety | Validation-branch dry-run reported 18 additions, 0 modifications, 0 conflicts, and `applied:false`; no merge or production mutation occurred. CLI context was restored to parent `paletixa`. |
| Review budget | PR 2 totals 383 authored changed lines against `origin/main`: 177 migration, 153 contracts, and 53 OpenSpec additions/deletions. |
| Rollback boundary | Remove the migration and PR2 contract file; revert tasks 1.2–1.5/2.1–2.4 plus this PR2 section in `tasks.md` and `apply-progress.md`. Leave the unmerged validation branch untouched pending separately approved deletion. |

## Deviations and Issues

- Deviations from design: InsForge 2.3.1 exposes `auth.users.email_verified`, not `email_confirmed_at`; the predicate checks `email_confirmed_at` when present and uses the platform's trusted `email_verified` field otherwise.
- Issues: Bun was available at `$HOME/.bun/bin/bun` rather than on the default PATH; all evidence commands explicitly added that directory to PATH. The baseline lockfile was regenerated from the documented pre-PR package before restoring PR 1.
- Backend mutation: migration and synthetic contract data exist only on schema-only branch `admin-branch-access-foundation-validation`; production remains unchanged and the prior branch was not reset.

## Review Correction
- Generation 6 for `review-d7347b0943c7efcf` fixed R1-001/R3-001: parent guard failed before SQL; validation branch integration passed 12/12 in 83.31s; lint/build passed; readback was 8 tables/1 policy/8 pinned functions/1 bootstrap receipt/5 command receipts/2 branches/1 admin grant; dry-run was 18 additions/0 modifications/0 conflicts; parent readback remained 0/0/0 and context returned to `paletixa`. Candidate: 400 lines; correction: 31 lines. Rollback only this section plus focused migration/test edits.

## PR 3 Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Correction behavior | Added list-pending/create-visible and stale AdminBoundary access-response tests; no historical RED result is claimed for this correction. |
| Focused test | Exact `bun run test` script executed `vitest run src --exclude 'tests/integration/**'` and exited 0: 3 source files and 14 tests passed. |
| Integration safety | `bun run test:integration` was not run: `auth-rls.contract.test.ts` performs fixture writes, bootstrap consumption, branch commands, and DDL, so it is not read-only. |
| Runtime harness | Vite served HTTP 200 at `127.0.0.1:41733` (620 bytes) and stopped; read-only InsForge `current` confirmed CLI parent `paletixa`. No backend command or fixture mutation ran. |
| Quality | `bun run lint` exited 0; `bun run build` exited 0 with 107 modules transformed in 408ms; Impeccable detector returned `[]`; `git diff --check` passed. |
| Retry and freshness | The latest list/create/status sequence alone commits UI state; successful create closes loading, remains visible after the stale list resolves, and stale AdminBoundary access responses stay suppressed. |
| Rollback boundary | Revert `src/App.tsx`; remove `src/app/AppProviders.tsx` and `src/features/{auth,branches}/`. Revert only tasks 3.2–3.4 and this PR 3 section; backend migration, validation branch, and tasks 4.x remain untouched. |

## PR 3 Review Budget

- Review budget: 397 authored changed lines against `origin/main`, including OpenSpec persistence and excluding pre-existing untracked `.codegraph/`; below the 400-line limit.
- Work unit boundary is PR 2 merged to `main` → PR 3 browser features targeting `main`; PR 4 remains out of scope.
