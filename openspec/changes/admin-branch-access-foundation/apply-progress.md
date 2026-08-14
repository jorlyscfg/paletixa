# Apply Progress: Admin Branch Access Foundation

## Execution

- Mode: Standard (`strict_tdd: false`)
- Delivery strategy: `auto-chain`
- Chain strategy: `stacked-to-main`
- Current work unit: PR 4 — configuration complete; final verification/remediation pending
- Future target: `main`
- Runtime attempt token: `sha256:1c864de674e762133081d08dbd053160cde01b6a168f9e9565b8528094ba9279`
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
- [x] 4.1 Document explicit audited confirmation for fictitious development accounts while verification remains enabled.
- [ ] 4.2 Complete safe fresh verification and bind prior irreversible-contract evidence.

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

- Focused: `bun run test` passed 3 files/16 tests; lint/build passed (107 modules); HTTP harness returned 200/620 bytes and stopped; Impeccable returned `[]`; diff-check passed. Integration was skipped because it mutates backend fixtures/DDL.
- Correction: stale reads remain suppressible, while guarded serialized mutations always reconcile confirmed results; the overlap test proves refresh/create/status disabled and the result visible. API coverage binds `from('branches')`, returns 201 rows, and never calls `limit`.
- Rollback: revert only `branches.ts`, `BranchWorkspace.tsx`, their focused tests, and this evidence line; auth, backend, tasks 4.x, and prior PR 3 behavior remain untouched.
- Review `review-034dc41bca78498a` generation 10 recovery preserved R3-001/R4-001/R4-002 within 400 authored lines. Runtime token `sha256:69fe6d1328f3a1baeb95b7e328e55b70ac86c18c763e01c510f81472b9af62fb` settled passed with evidence `sha256:847fe49418c09524ccd7f2a963fa41e6c5573b8e2254e13916b8ce6fc683598e`.

## PR 4 Work Unit Evidence

| Evidence | Exact result |
|---|---|
| Focused test | `bun run test` exited 0: 3 files/16 tests in 5.79s. `bun run lint` exited 0. `bun run build` exited 0: 107 modules in 403ms. |
| Runtime harness | Vite served HTTP 200/620 bytes with the root mount on `127.0.0.1:41742`; the process stopped. Impeccable detector returned `[]` for the app shell and admin/auth surfaces. |
| Branch contracts | Metadata/readback found 8 tables with RLS, 1 SELECT policy, 8 pinned-path functions, 3 trusted-email predicates, 0 exposed operator functions, 1 bootstrap receipt, 5 command receipts, and 2 branches. |
| Integration | Destructive integration was not rerun. Prior generation-6 evidence remains bound to this sole branch and migration `20260814025511`: 12/12 passed in 83.31s, including irreversible bootstrap and receipt contracts. |
| Email behavior | Applied exactly one development-branch config change, `require_email_verification: false → true`, with no skipped fields. Fresh metadata reports verification enabled on branch and parent. Disabling verification is documented as neither trusted confirmation nor an approved path. |
| Merge safety | Fresh dry-run reported 18 additions (8 tables, 1 policy, 8 functions, 1 migration), 0 modifications, 0 conflicts, and `applied:false`; saved SQL contains no `auth.config` or verification change. |
| Production integrity | Parent readback remained 0 foundation tables, 0 functions, 0 policies, and real email verification enabled. CLI context was restored to parent. |
| Rollback boundary | Revert the two PR4 docs and PR4 task/progress entries only. Backend rollback for this apply is limited to the separately approved development confirmation procedure; verification is already enabled and production needs no rollback. |

## PR 4 Resolution

- The maintainer replaced unsupported auto-verification with explicit, auditable confirmation restricted to fictitious development accounts. Development and production verification remain enabled.
- No destructive integration, fixture deletion, reset, branch deletion, backend merge, commit, or push ran. CLI context returned to parent `paletixa`; production remains 0 foundation tables/functions/policies.
- Git merge and backend merge are separate approval gates. Any real backend merge requires a later explicit approval naming the branch and reviewed clean dry-run.
