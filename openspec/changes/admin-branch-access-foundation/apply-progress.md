# Apply Progress: Admin Branch Access Foundation

## Execution

- Mode: Standard (`strict_tdd: false`)
- Delivery strategy: `auto-chain`
- Chain strategy: `stacked-to-main`
- Current work unit: PR 1 — `pr1-test-tooling-client-config`
- Future target: `main`
- Runtime attempt token: `sha256:fca6252d2859da4b486a3cd998a58918658b4627851c6523f8c2fbd6e234e56f`
- Auditable baseline commit: `6e7db8bc0354cacf9bb249bdfd9e3503fd00746e`; the PR 1 commit is its direct child, with the exact child hash persisted in Engram and the Result Contract because a commit cannot contain its own hash.

## Cumulative Task Status

- [x] 1.1 Install and verify Vitest, jsdom, Testing Library, and executable unit/integration scripts.
- [ ] 1.2 Create and inspect the schema-only InsForge branch.
- [ ] 1.3 Add RED authorization integration contracts.
- [ ] 1.4 Add the authorization and branch schema migration.
- [ ] 1.5 Make direct authorization and branch access denials GREEN.
- [ ] 2.1 Add bootstrap rejection, replay, conflict, and rollback contracts.
- [ ] 2.2 Add privileged bootstrap, revoke, and reassignment operations.
- [ ] 2.3 Add branch command idempotency and concurrency contracts.
- [ ] 2.4 Add transactional branch command RPCs.
- [x] 3.1 Add typed URL/anon-key-only browser configuration and privileged-key rejection tests.
- [ ] 3.2 Add the authentication boundary.
- [ ] 3.3 Add the branch workspace.
- [ ] 3.4 Wire application providers and protected states.
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

## Deviations and Issues

- Deviations from design: None.
- Issues: Bun was available at `$HOME/.bun/bin/bun` rather than on the default PATH; all evidence commands explicitly added that directory to PATH. The baseline lockfile was regenerated from the documented pre-PR package before restoring PR 1.
- Backend mutation: None.
