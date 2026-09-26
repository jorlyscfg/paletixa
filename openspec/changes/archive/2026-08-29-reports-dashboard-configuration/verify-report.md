```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:e63ffda32f31dea468619e8549610ef93996e05579f9eaf766ce659bc69c763e
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 13/13
scenarios: 19/19
test_command: 'bunx vitest run src/App.test.tsx src/app/AppShell.test.tsx src/features/auth/api/adminAccess.test.ts src/features/auth/ui/AdminBoundary.test.tsx src/features/sales/api/reportDashboard.test.ts src/features/sales/api/sales.test.ts src/features/sales/api/posShifts.test.ts src/features/sales/ui/SalesReportWorkspace.test.tsx src/features/sales/ui/ReportTrendChart.test.tsx src/features/sales/ui/posUtils.test.ts src/features/sales/ui/SalesWorkspace.test.tsx src/features/sales/ui/PosShiftWorkspace.test.tsx src/features/configuration/api/configuration.test.ts src/features/configuration/ui/ConfigurationWorkspace.test.tsx src/features/events/ui/EventCustomerPortal.test.tsx --reporter verbose'
test_exit_code: 0
test_output_hash: sha256:d4d3ce4491c2b2be1ef01a1475c596989b32ddb87867d62f59c9ecf1748d153d
build_command: 'bun run build'
build_exit_code: 0
build_output_hash: sha256:1a016258592292979a8ad16023e4a64665376dd22d8a37f85844ac9e458ba55e
```

## Verification Report

**Change**: reports-dashboard-configuration  
**Version**: N/A  
**Mode**: Standard

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 14 |
| Tasks complete | 14 |
| Tasks incomplete | 0 |
| Requirements evaluated | 13 |
| Scenarios evaluated | 19 |

### Build & Tests Execution
**Lint**: ✅ Passed  
Command: `bun run lint`  
Exit: `0`  
Output hash: `sha256:050c69da23536758722729aeda55a8d0fb9d557495ef6d33d70873a3b64a71c1`

**Build**: ✅ Passed  
Command: `bun run build`  
Exit: `0`  
Output hash: `sha256:1a016258592292979a8ad16023e4a64665376dd22d8a37f85844ac9e458ba55e`  
The build completed successfully. Existing warnings reported browser `crypto` externalization and an 804.40 kB minified chunk above Vite's advisory threshold.

**Focused tests**: ✅ 166 passed / ❌ 0 failed / ⚠️ 0 skipped  
The exact direct Vitest command in the envelope passed 15 files and 166/166 tests; output hash: `sha256:d4d3ce4491c2b2be1ef01a1475c596989b32ddb87867d62f59c9ecf1748d153d`.

**Migration contract**: ✅ 3 passed / 0 failed  
Command: `bunx vitest run src/features/configuration/api/configurationMigrationContract.test.ts --reporter verbose`  
Output hash: `sha256:003b24586883bcbfdf8b1ed19e16263819e4068a87419db4adabc402c951fa07`.

**Live integration**: ✅ 6 passed / 0 failed  
Command: `REPORTS_DASHBOARD_REPEATABLE=1 bunx vitest run tests/integration/reports-dashboard-configuration.contract.test.ts --reporter verbose`  
InsForge `dev` schema-only validation branch; 6/6 tests and all 98 direct assertions passed. Output hash: `sha256:4a397388a49150326a44a809f0873530a55c142ecd8c213e06aa973abe417962`.

**Package suite**: ✅ 480 passed / 0 failed  
Command: `bun run test`  
63/63 files and 480/480 tests passed. Output hash: `sha256:f0e48df10c0f729d847fafaad9b0ffa9176c482acfae3429f7de4ed50362b6b4`.

**Coverage**: ➖ Not available / threshold: 0% → ➖ Not available. Project configuration reports no coverage tool.

### Spec Compliance Matrix
| Requirement | Scenario | Runtime covering test | Result |
|-------------|----------|------------------------|--------|
| Operational Configuration — Initial Typed Settings | Effective typed values | `tests/integration/reports-dashboard-configuration.contract.test.ts > validates typed settings, effective timing, replay/conflict audit, bounds, and workflow preservation`; `ConfigurationWorkspace.test.tsx > renders only the typed global settings with effective metadata` | ✅ COMPLIANT |
| Operational Configuration — Validation and Effective Use | Invalid mutation | `tests/integration/reports-dashboard-configuration.contract.test.ts > validates typed settings, effective timing, replay/conflict audit, bounds, and workflow preservation`; `configuration.test.ts > validates exact bounds and sends a typed mutation request` | ✅ COMPLIANT |
| Operational Configuration — Validation and Effective Use | Workflow consumption | `tests/integration/reports-dashboard-configuration.contract.test.ts > validates typed settings, effective timing, replay/conflict audit, bounds, and workflow preservation`; `... > uses the configured POS fallback rate for a new USD sale when no explicit rate is supplied`; `... > uses the configured POS wholesale threshold for a new sale` | ✅ COMPLIANT |
| Operational Configuration — Owner, Scope, Audit, and Idempotency | Audited retry | `tests/integration/reports-dashboard-configuration.contract.test.ts > validates typed settings, effective timing, replay/conflict audit, bounds, and workflow preservation` | ✅ COMPLIANT |
| Operational Configuration — Owner, Scope, Audit, and Idempotency | Scope denial | `tests/integration/reports-dashboard-configuration.contract.test.ts > denies missing capabilities, protected tables, and new configuration access without widening legacy Event access` | ✅ COMPLIANT |
| Operational Configuration — Configuration States and Accessibility | Unavailable configuration | `ConfigurationWorkspace.test.tsx > renders only the typed global settings with effective metadata`; `... > renders an unauthorized state without exposing configuration values`; `... > validates locally and preserves the effective value when saving fails` | ✅ COMPLIANT |
| Reports Dashboard — Canonical Recognized Sales | Recognized and reversed sales | `tests/integration/reports-dashboard-configuration.contract.test.ts > counts recognized lifecycle data, complete aggregates, dates, scope, and separate operations` | ✅ COMPLIANT |
| Reports Dashboard — Explicit Reporting Dates | Sale date differs from Event date | `tests/integration/reports-dashboard-configuration.contract.test.ts > counts recognized lifecycle data, complete aggregates, dates, scope, and separate operations` | ✅ COMPLIANT |
| Reports Dashboard — Explicit Reporting Dates | Invalid range | `tests/integration/reports-dashboard-configuration.contract.test.ts > rejects invalid calendar, timezone, scope, lifecycle, and range selectors`; `SalesReportWorkspace.test.tsx > validates invalid input without replacing the last valid snapshot` | ✅ COMPLIANT |
| Reports Dashboard — Complete Aggregate Snapshot | More than one hundred sales | `tests/integration/reports-dashboard-configuration.contract.test.ts > counts recognized lifecycle data, complete aggregates, dates, scope, and separate operations` | ✅ COMPLIANT |
| Reports Dashboard — Complete Aggregate Snapshot | Empty period | `tests/integration/reports-dashboard-configuration.contract.test.ts > counts recognized lifecycle data, complete aggregates, dates, scope, and separate operations`; `SalesReportWorkspace.test.tsx > keeps every channel visible and renders an authorized no-data snapshot as empty content` | ✅ COMPLIANT |
| Reports Dashboard — Separate Operational Indicators | Workload is not revenue | `tests/integration/reports-dashboard-configuration.contract.test.ts > counts recognized lifecycle data, complete aggregates, dates, scope, and separate operations`; `SalesReportWorkspace.test.tsx > renders server-authoritative sales, complete aggregate rankings, operations, and metadata` | ✅ COMPLIANT |
| Reports Dashboard — Authorized Branch Scope | Out-of-scope branch | `tests/integration/reports-dashboard-configuration.contract.test.ts > rejects invalid calendar, timezone, scope, lifecycle, and range selectors`; `... > denies missing capabilities, protected tables, and new configuration access without widening legacy Event access` | ✅ COMPLIANT |
| Reports Dashboard — Visible States and Accessibility | Responsive failure recovery | `SalesReportWorkspace.test.tsx > preserves the last valid snapshot through a retryable error and retries that range`; `... > announces initial loading and disables controls while the snapshot is pending`; `... > shows an unauthorized state without protected data` | ✅ COMPLIANT |
| Reports Dashboard — Bounded Product Scope | Unsupported metric request | `SalesReportWorkspace.test.tsx > keeps every channel visible and renders an authorized no-data snapshot as empty content`; `ConfigurationWorkspace.test.tsx > renders only the typed global settings with effective metadata` | ✅ COMPLIANT |
| Admin Access Control — Branch-Scoped Capability Enforcement | Authorized scoped request | `tests/integration/reports-dashboard-configuration.contract.test.ts > counts recognized lifecycle data, complete aggregates, dates, scope, and separate operations` | ✅ COMPLIANT |
| Admin Access Control — Branch-Scoped Capability Enforcement | Scope or capability denial | `tests/integration/reports-dashboard-configuration.contract.test.ts > denies missing capabilities, protected tables, and new configuration access without widening legacy Event access` | ✅ COMPLIANT |
| Admin Access Control — Explicit Capability Authorization | Authorized action | `tests/integration/reports-dashboard-configuration.contract.test.ts > counts recognized lifecycle data, complete aggregates, dates, scope, and separate operations`; `src/App.test.tsx > hides report and configuration entries when their capabilities are absent` | ✅ COMPLIANT |
| Admin Access Control — Explicit Capability Authorization | Missing capability | `tests/integration/reports-dashboard-configuration.contract.test.ts > denies missing capabilities, protected tables, and new configuration access without widening legacy Event access`; `src/App.test.tsx > hides report and configuration entries when their capabilities are absent` | ✅ COMPLIANT |

**Compliance summary**: 19/19 scenarios have passing runtime coverage. The live contract exercised lifecycle/reversal rules, Mexico City boundaries, 366-day limits, zero/no-data semantics, >100-row aggregation, global workload/capacity, branch scope, configuration validation, owner/default state, atomic audit/idempotency, effective timing, explicit-rate precedence, configured fallback/threshold consumption, and preservation of reservations/open shifts.

### Correctness (Static Evidence)
| Requirement area | Status | Notes |
|------------------|--------|-------|
| Canonical reporting | ✅ Implemented | `report_dashboard_snapshot` aggregates `sales`/`sale_items`, excludes `sale_reversals`, handles wholesale generations and Event lifecycle facts, and does not use the capped detail adapter. |
| Date and aggregate contract | ✅ Implemented | Explicit `America/Mexico_City`, UTC half-open bounds, inclusive maximum 366 days, zero-filled daily series, complete channels/products/categories, and explicit no-data average state. |
| Operational separation | ✅ Implemented | Wholesale workload, Event capacity/allocation, and POS shift status are returned and rendered in separate labeled sections. |
| Configuration | ✅ Implemented | Exactly three typed global settings use defaults 7/15/10, bounded validation, owner/effective metadata, atomic audit, receipts, replay/conflict handling, and append-only protection. |
| Authorization | ✅ Implemented | Server RPCs enforce `reports.view` and `configuration.manage`; branch selectors are validated server-side; client metadata/email prefixes cannot widen access. |
| Consumer behavior | ✅ Implemented | Configured POS fallback rate and threshold affect new POS sales; explicit active-shift rate wins; existing allocations, reservations, sales, and open-shift rates remain unchanged. |
| Scope guard | ✅ Implemented | No inventory, purchasing, tax, stock, export, generic settings, synthetic shifts, client-derived revenue, or unscoped business-fact backfill was found. |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Preserve Vite SPA and use versioned server snapshot RPC | ✅ Yes | Frontend remains a Vite/React SPA and calls the typed snapshot adapter. |
| Use canonical ledger and keep operational facts separate | ✅ Yes | SQL and UI preserve recognized-sale semantics and separate workload/capacity/status. |
| Use explicit Mexico City calendar dates and UTC instants | ✅ Yes | Adapter, RPC, metadata, and live boundary tests agree. |
| Enforce server capabilities and global/branch policy | ✅ Yes | RPC checks, RLS/grants, capability-filtered navigation, and direct-denial tests align. |
| Use typed global configuration with accountable owners and audit/idempotency | ✅ Yes | Singleton tables, owner backfill, locked mutations, receipts, audit, and consumer probes align. |
| Roll out migration before consumers | ✅ Yes | `20260829000000_reports-dashboard-configuration.sql` precedes `20260830000000_expose-configuration-capability.sql`; the later migration consumes resolver functions defined by the earlier migration. |
| Keep E2E as unavailable | ✅ Yes | Design records E2E as unavailable; verification uses Vitest/jsdom, lint, build, and live RPC contracts only. |

### Issues Found
**CRITICAL**: None.  
**WARNING**:
- One earlier execution of the exact focused frontend command failed once at a `PosShiftWorkspace` header-callback assertion; the same bounded command was rerun without source changes and passed 15/15 files and 166/166 tests. This indicates a timing-sensitive test risk that remains undocumented in the test itself.
- `openspec/config.yaml` still says the test runner is unavailable even though Bun/Vitest tests and live integration contracts are installed and executable; verification used the available commands directly.
- No browser/E2E harness is available, so responsive and browser-specific behavior is evidenced by jsdom tests, static source inspection, lint, and build rather than a real browser.
- Passing runs retain existing non-fatal diagnostics: React Query pending-rejection stderr notice, Vite browser `crypto` externalization/chunk-size warnings, and jsdom canvas `getContext()` notices.
**SUGGESTION**:
- Make the POS header-callback test wait explicitly for the callback state so future focused runs do not depend on effect scheduling.

### Verdict
PASS WITH WARNINGS
All 13 requirements and 19 scenarios have passing runtime coverage, the final bounded test/build/integration checks passed, and the scope/migration review is coherent; warnings are limited to the recovered timing-sensitive test run, stale test capability metadata, unavailable E2E tooling, and non-fatal diagnostics.
