```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:c1af11ef8b7fec9750c20140d41e2e50f8d301a16f1cdfe9383b02d9f9835c86
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 6/6
scenarios: 13/13
test_command: PATH="$HOME/.bun/bin:$PATH" bun run test
test_exit_code: 0
test_output_hash: sha256:3eac3d7e75354bdd81086754ad30cd4524af08ec50e6f15ee55cb671ae168d8c
build_command: PATH="$HOME/.bun/bin:$PATH" bun run lint && PATH="$HOME/.bun/bin:$PATH" bun run build
build_exit_code: 0
build_output_hash: sha256:bfdbad27e4d8434bd192479d46a6f06d0ed8e92d8f827104fa30ec6149b54e40
```

# Verification Report

**Change**: `admin-branch-access-foundation`
**Mode**: Standard (`strict_tdd: false`)
**Runtime token**: `sha256:9d8bb0196ccd88b780b4ed9d0cfa04dcaa58e8b01f8e2ad53b3b4e770c8737d5`

## Fresh Evidence

| Check | Exact result |
|---|---|
| Source tests | `PATH="$HOME/.bun/bin:$PATH" bun run test` exited 0: 3 files, 16 tests passed in 4.26s. |
| Lint/build | `bun run lint && bun run build` exited 0: ESLint clean; TypeScript and Vite passed, 107 modules built in 339ms. |
| Repeatable dev runtime | `AUTH_RLS_REPEATABLE=1 bunx vitest run tests/integration/auth-rls.contract.test.ts` exited 0: 1 passed, 11 skipped in 29.85s. A unique capable fixture called `create_branch`; the result asserted normalized `name` and `result_status: active`, and direct RLS SELECT asserted the same branch's `id`, `name`, and `status: active`. |
| Cleanup | Test teardown and independent branch readback both passed: temporary users, profiles, roles, command receipts, and branches were all 0. Cleanup predicates were limited to this run's unique user/request/branch. |
| Prior irreversible contracts | Bound generation-6 evidence remains valid: 12/12 passed in 83.31s on migration `20260814025511` and the sole validation branch. No fixed bootstrap/receipt fixture was rerun or changed. |
| Production integrity | Parent readback after restoration: 0 foundation tables, 0 foundation functions, and 0 branch policies. Final CLI project is `paletixa`. No production SQL/RPC/write ran. |
| Rollback boundary | Revert the repeatable mode in `tests/integration/auth-rls.contract.test.ts` and the task/progress/report updates; no backend rollback is required because all temporary rows were deleted. |

## Compliance

All 6 requirements and 13 scenarios are compliant. The two remediated scenarios now have fresh runtime proof:

- **Authorized listing** returns branch `id`, normalized `name`, and lifecycle `status` through the capable user's direct SELECT.
- **Create branch** returns and persists the normalized name with initial `active` status.

Authorization denials, bootstrap/reassignment, idempotency/concurrency, status transitions, suspended guards, browser non-disclosure, and rollout safety remain covered by the previously accepted evidence and fresh source checks.

## Safety and Remaining Warning

- Only `admin-branch-access-foundation-validation` received temporary fixture writes; no branch create/reset/delete/merge occurred.
- CLI context was checked before setup, RPC mutation, cleanup, and parent restoration; it finished on production `paletixa`.
- Vite still warns that SDK `crypto` is browser-externalized. Build/runtime shell evidence passes, but browser E2E sign-in remains deferred.

## Canonical Verification Evidence

The `evidence_revision` is SHA-256 of this exact JSON line including its trailing newline:

```json
{"schema":"gentle-ai.verification-evidence/v1","change":"admin-branch-access-foundation","runtime_token":"sha256:9d8bb0196ccd88b780b4ed9d0cfa04dcaa58e8b01f8e2ad53b3b4e770c8737d5","mode":"standard","requirements":"6/6","scenarios":"13/13","fresh":{"test":{"command":"PATH=\"$HOME/.bun/bin:$PATH\" bun run test","exit_code":0,"output_hash":"sha256:3eac3d7e75354bdd81086754ad30cd4524af08ec50e6f15ee55cb671ae168d8c","result":"3 files, 16 tests passed"},"build":{"command":"PATH=\"$HOME/.bun/bin:$PATH\" bun run lint && PATH=\"$HOME/.bun/bin:$PATH\" bun run build","exit_code":0,"output_hash":"sha256:bfdbad27e4d8434bd192479d46a6f06d0ed8e92d8f827104fa30ec6149b54e40","result":"lint clean; TypeScript and Vite build passed; 107 modules"},"runtime":{"command":"PATH=\"$HOME/.bun/bin:$PATH\" AUTH_RLS_REPEATABLE=1 bunx vitest run tests/integration/auth-rls.contract.test.ts","result":"1 passed, 11 skipped in 29.85s; authorized SELECT returned id/name/status; create_branch returned normalized name and active status"},"cleanup":{"contract_users":0,"contract_profiles":0,"contract_roles":0,"contract_receipts":0,"contract_branches":0},"production_readback":{"foundation_tables":0,"foundation_functions":0,"branch_policies":0},"final_cli_project":"paletixa"},"reused":{"integration":{"result":"12/12 passed in 83.31s","migration":"20260814025511","branch":"admin-branch-access-foundation-validation","generation":6}}}
```

## Verdict

**PASS WITH WARNINGS** — task 4.2 has complete fresh runtime and cleanup evidence; rollout remains separately approval-gated.
