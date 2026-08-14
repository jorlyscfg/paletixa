```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:3aa969f053bf82806560f456e2b02e129b0d66c06b1fd3d8a7e669988a7f69de
verdict: fail
blockers: 2
critical_findings: 2
requirements: 4/6
scenarios: 11/13
test_command: PATH="$HOME/.bun/bin:$PATH" bun run test
test_exit_code: 0
test_output_hash: sha256:b99ea0bf20b497d31eab5794a4fc00ec8187fce24459a71db2e1957184725486
build_command: PATH="$HOME/.bun/bin:$PATH" bun run lint && PATH="$HOME/.bun/bin:$PATH" bun run build
build_exit_code: 0
build_output_hash: sha256:5f3a4cfe609828917b8368cc2803db52ff0826541b5b666e8671f0a64ca66d8c
```

## Verification Report

**Change**: `admin-branch-access-foundation`
**Version**: N/A
**Mode**: Standard (`strict_tdd: false`)
**Persistence**: Hybrid
**Runtime token**: `sha256:1c06faba2418512bfb5c01641cf453b66c7a5af883d1e1005a8a14eaa358fdbe`

### Completeness

| Metric | Value |
|---|---:|
| Tasks total | 15 |
| Tasks complete | 14 |
| Tasks incomplete | 1 |
| Requirements complete | 4/6 |
| Scenarios compliant | 11/13 |

All proposal, specification, design, task, and apply-progress artifacts were read directly. Task 4.2 remains incomplete because two scenarios still lack complete passed runtime proof.

### Build & Tests Execution

| Check | Evidence | Result |
|---|---|---|
| Fresh source tests | `PATH="$HOME/.bun/bin:$PATH" bun run test` — 3 files, 16 tests | ✅ Exit 0 |
| Bound integration evidence | 12/12 passed in 83.31s on generation 6, migration `20260814025511`, sole schema-only validation branch | ✅ Reused as explicitly authorized |
| Fresh lint + build | ESLint clean; TypeScript and Vite passed; 107 modules | ✅ Exit 0 |
| Fresh HTTP harness | HTTP 200, 620 bytes, root mount present; process stopped | ✅ Passed |
| Fresh Impeccable detector | `[]` for app shell, auth boundary, workspace, and CSS | ✅ Exit 0 |
| Coverage | No coverage command or threshold is configured | ➖ Not available |

The integration suite was not rerun because its bootstrap receipt and fixed fixtures are intentionally irreversible without destructive cleanup or branch reset. The reused evidence is explicitly bound by `apply-progress.md:68-69,84-85` to generation 6, migration `20260814025511`, and `admin-branch-access-foundation-validation`.

### Runtime and Backend Safety Evidence

| Check | Result |
|---|---|
| Development topology | Exactly one reusable schema-only branch; state `ready` |
| Development email verification | `true` |
| Production email verification | `true` |
| Development readback | 8 foundation tables; 8 RLS-enabled; 1 branch policy; 8 functions; 8 pinned paths; 3 trusted-email predicates; 1 bootstrap receipt; 5 command receipts; 2 branches |
| Production readback | 0 foundation tables; 0 foundation functions; 0 foundation policies |
| Merge dry-run | 18 added; 0 modified; 0 conflicts; `applied:false`; no auth configuration change |
| Final CLI context | Production `paletixa` |

No reset, delete, real backend merge, production SQL mutation, or irreversible integration action was executed. Git and backend merge remain separate approval gates.

### Spec Compliance Matrix

| Requirement | Scenario | Runtime evidence | Result |
|---|---|---|---|
| Verified Active Administrator Access | Eligible access | Bound integration exercises capability-authorized commands after reassignment; fresh workspace tests render the authorized shell | ✅ COMPLIANT |
| Verified Active Administrator Access | Invalid access state | Bound anonymous/expired/unverified/inactive denials; fresh generic-denial UI test confirms no branch request | ✅ COMPLIANT |
| Explicit Capability Authorization | Authorized action | Bound `create_branch` and `set_branch_status` calls succeed only after server role assignment | ✅ COMPLIANT |
| Explicit Capability Authorization | Missing capability | Bound direct context, RLS, and both RPC denials return no protected branch rows | ✅ COMPLIANT |
| Controlled Privilege Assignment | Escalation is denied | Bound protected-table INSERT/UPDATE/DELETE denials and browser denial of operator functions | ✅ COMPLIANT |
| Controlled Privilege Assignment | First administrator bootstrap | Bound eligibility, rollback, replay, conflict, consumption, revoke, and reassignment contracts | ✅ COMPLIANT |
| Authorized Branch Listing | Authorized listing | Fresh mocked API test proves 201 rows and no client limit; live readback proves the SELECT policy exists, but no passed runtime test performs an authorized direct backend SELECT and asserts identity, name, and status | ⚠️ PARTIAL |
| Authorized Branch Listing | Listing is denied | Bound direct RLS denial plus fresh workspace non-disclosure test | ✅ COMPLIANT |
| Branch Creation and Identity | Create branch | Bound test proves one named row and returned identity; static SQL defaults status to `active`, but no passed runtime assertion checks the created row/result status is `active` and the result contains the normalized name | ⚠️ PARTIAL |
| Branch Creation and Identity | Creation retry | Bound matching replay, divergent conflict, and concurrent duplicate prevention | ✅ COMPLIANT |
| Branch Status Transitions and Availability | Status transition | Bound suspend/activate sequence plus fresh status UI transition | ✅ COMPLIANT |
| Branch Status Transitions and Availability | Status retry | Bound same-state fresh request, replay, divergent conflict, and invalid-status rejection | ✅ COMPLIANT |
| Branch Status Transitions and Availability | Suspended branch | Bound `assert_branch_active` success/denial/reactivation sequence | ✅ COMPLIANT |

**Compliance summary**: 11/13 scenarios compliant. Two scenarios have implementation/static evidence but lack complete passed runtime coverage, so their requirements are not complete.

### Correctness (Static and Readback Evidence)

| Area | Status | Notes |
|---|---|---|
| Auth/RLS/capability | ✅ Implemented | One trusted server predicate gates context, branch SELECT, and authenticated commands; direct authorization DML is revoked |
| Trusted email/profile active | ✅ Implemented | Three privileged predicates inspect trusted verification and active profile; both environments keep verification enabled |
| Bootstrap/revoke/reassign | ✅ Implemented | Operator-only functions; immutable bootstrap marker survives revoke; reassignment validates replacement and is transactional |
| Receipts/idempotency/concurrency | ✅ Implemented | Immutable actor/request receipts, canonical hashes, advisory transaction lock, replay and conflict behavior |
| Branch status/suspended guard | ✅ Implemented | Only `active`/`suspended`; same-state update is stable; private reusable active-branch guard exists |
| Browser boundary/no leakage | ✅ Implemented | Browser accepts URL/anon key only; server context is authoritative; denied UI does not fetch branch data |
| Retry/stale read/serialization | ✅ Implemented | Request IDs survive retries, stale reads are suppressed, mutation controls serialize commands |
| More than 200 branches | ✅ Implemented | Fresh test returns 201 rows and confirms no `.limit()` call |
| Documentation | ✅ Implemented | Free-tier topology, explicit dev confirmation, independent rollout approvals, and compensating rollback are documented |

### Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| Single authorization predicate | ✅ Yes | `has_capability` is reused by context, RLS, and RPCs |
| Explicit roles/capabilities | ✅ Yes | Global authorization tables and idempotent admin seed match design |
| RPC-only mutation surface | ✅ Yes | Direct branch and authorization writes are denied |
| Immutable bootstrap and command receipts | ✅ Yes | Receipt tables and grants match the design |
| Schema-only validation then dry-run | ✅ Yes | Development-only migration, clean dry-run, and untouched production were read back |
| Trusted verification field compatibility | ⚠️ Accepted deviation | InsForge 2.3.1 uses `email_verified`; compatibility probe for `email_confirmed_at` is documented and tested |

### Accessibility, Mobile, and Impeccable

| Dimension | Score | Evidence |
|---|---:|---|
| Accessibility | 4/4 | Semantic landmarks/forms, labels, live/status/alert regions, focus recovery, visible focus, skip link, and 44px controls |
| Performance | 3/4 | Small surface and serialized requests; Vite warns that SDK `crypto` is browser-externalized |
| Responsive design | 4/4 | Mobile-first stacking with `sm:` enhancements and fluid widths |
| Theming | 3/4 | Consistent Tailwind palette; no dark theme is required by the artifacts |
| Implementation integrity | 4/4 | Mechanical detector returned no findings; product-specific states and controls are coherent |
| **Total** | **18/20** | **Excellent** |

### Issues Found

**CRITICAL**

1. **Authorized branch listing lacks complete runtime backend proof.** The passed test mocks the SDK result, while the live evidence only inspects policy metadata. Add a safe integration assertion using a capable session that directly selects branches and verifies every returned row exposes identity, name, and lifecycle status.
2. **Branch creation does not runtime-assert the full specified outcome.** The integration contract proves identity and uniqueness but does not assert returned normalized name plus initial `active` status. Add those assertions to the existing safe contract strategy before archive.

**WARNING**

1. Vite reports that Node module `crypto` is externalized for browser compatibility through `@insforge/sdk`. The build and HTTP shell pass, but no browser E2E sign-in request exercises the affected SDK path; monitor or add a browser auth smoke test before production frontend rollout.

**SUGGESTION**

1. Add a non-destructive, repeatable integration mode that uses unique request IDs/names and avoids consuming bootstrap state, so authorized listing and creation projections can be freshly verified without reset or fixture deletion.
2. Configure coverage reporting and a minimum threshold; current verification can report pass/fail counts only.

### Canonical Verification Evidence

The exact evidence preimage bound by `evidence_revision` is the following single JSON line, including its trailing newline:

```json
{"schema":"gentle-ai.verification-evidence/v1","change":"admin-branch-access-foundation","runtime_token":"sha256:1c06faba2418512bfb5c01641cf453b66c7a5af883d1e1005a8a14eaa358fdbe","mode":"standard","requirements":"4/6","scenarios":"11/13","fresh":{"test":{"command":"PATH=\"$HOME/.bun/bin:$PATH\" bun run test","exit_code":0,"output_hash":"sha256:b99ea0bf20b497d31eab5794a4fc00ec8187fce24459a71db2e1957184725486","result":"3 files, 16 tests passed"},"build":{"command":"PATH=\"$HOME/.bun/bin:$PATH\" bun run lint && PATH=\"$HOME/.bun/bin:$PATH\" bun run build","exit_code":0,"output_hash":"sha256:5f3a4cfe609828917b8368cc2803db52ff0826541b5b666e8671f0a64ca66d8c","result":"lint clean; TypeScript and Vite build passed; 107 modules"},"http":{"status":200,"bytes":620,"root_mount":true,"process_stopped":true},"impeccable":{"exit_code":0,"result":[]},"development_readback":{"email_verification":true,"foundation_tables":8,"rls_tables":8,"branch_policies":1,"functions":8,"pinned_functions":8,"trusted_email_predicates":3,"bootstrap_receipts":1,"command_receipts":5,"branches":2},"production_readback":{"email_verification":true,"foundation_tables":0,"branch_policies":0,"functions":0},"merge_dry_run":{"added":18,"modified":0,"conflicts":0,"applied":false,"dry_run":true,"contains_auth_config":false},"final_cli_project":"paletixa"},"reused":{"integration":{"result":"12/12 passed in 83.31s","migration":"20260814025511","branch":"admin-branch-access-foundation-validation","generation":6,"binding":"openspec/changes/admin-branch-access-foundation/apply-progress.md:68-69,84-85","reason":"Irreversible bootstrap receipt and fixed branch fixtures make rerun destructive; reuse explicitly authorized"}}}
```

### Verdict

**FAIL**

The implementation, build, safety readbacks, and 11 scenarios are sound, but independent final verification cannot mark two required scenarios compliant without complete passed runtime coverage.
