# Apply Progress: Reports Dashboard and Operational Configuration

## Execution

- **Mode**: Standard (strict TDD disabled; no TDD module loaded)
- **Artifact store**: Hybrid OpenSpec + Engram
- **Delivery**: Auto-chain, `stacked-to-main`
- **Review budget**: 400 changed lines; this is the bounded corrective backend consumer-migration rerun in the `stacked-to-main` chain.
- **PR boundary**: Phase 1 backend contracts, Phase 3 Reports frontend, and Phase 4 configuration/consumer/access work remain complete; this batch extends only Phase 2 task 2.2 runtime evidence.
- **Assigned scope**: Work unit `backend-consumer-migration-contract-rerun`, Phase 2 task 2.2 only. Phase 5 verification and scope guard remain pending.
- **Native attempt**: The orchestrator-owned attempt `sha256:374271d9e9ab85e21fdca6e7dcfb27500b482c3d70a9d443df1ec867fc6fae17` is generation 14, ordinal 14; this executor did not acquire, reset, or settle it.
- **Candidate/evidence binding**: Native status reports candidate identity `sha256:fe5660b58a91e145957dfe670f26e93691058f560f1b7fa7b6c2e4df3a52ec31` and tree `78c4293b6febe22a0559847320901927a14d127a`; this rerun's distinct evidence revision is `sha256:6e89fb2d133d901a89d28a6059794aefd8828399caf6c850640ded05c6396560`, distinct from failed revision `sha256:7e33c39ddb3c086cd11c03da20d7e473500255977086880854e8eb06b5cc2c62`.
- **Runtime boundary**: The reviewed follow-up migration was applied only to the live InsForge `dev` schema-only branch, then the guarded Vitest suite exercised authenticated RPCs and direct fixture SQL. The prior configuration timeout remains fixed. No browser/E2E harness is available.

## Completed Tasks

- [x] 1.1 Retained typed global Event/POS configuration singletons with compatibility defaults `7/15/10`, exact bounds, effective-state metadata, verified-admin backfill, and non-null accountable owners.
- [x] 1.2 Corrected `report_dashboard_snapshot` so Event allocation counts use the selected inclusive calendar window and `available_count` uses daily capacity multiplied by the number of days in that window; UTC half-open sale ranges, Mexico City boundaries, zero-filled daily data, complete product/category aggregates, and separate operational indicators remain intact.
- [x] 1.3 Retained capability/RLS/grant enforcement, active-branch selector validation, all-branch and legacy-unscoped semantics, locked hash receipts, atomic audit, replay/conflict handling, DML denial, lifecycle/reversal rules, and legacy Event RPC signatures.
- [x] 2.1 Added and runtime-validated the lifecycle, aggregate, boundary, scope, workload, allocation, completed-once, and cancellation-release contract assertions on `dev`.
- [x] 2.2 Added and runtime-validated the configuration authorization, validation, owner/default, audit/idempotency, effective-state, precedence, and workflow-preservation assertions, including configured POS fallback and wholesale-threshold consumers on `dev`.
- [x] 3.1 Added a typed `report_dashboard_snapshot` adapter, strict date-only range validation, explicit `America/Mexico_City` and scope request/response metadata, last-valid snapshot preservation/retry behavior, accessible report states, complete server-authoritative aggregates, and separated operational indicators.
- [x] 3.2 Added the dependency-free SVG/CSS `ReportTrendChart` with a textual daily-series equivalent, mobile-first DOM order, and non-interactive 44px-safe surrounding controls.
- [x] 3.3 Added adapter, date, aggregate, state, accessibility, and recovery coverage in the focused report suites, including dedicated chart tests.
- [x] 4.1 Added typed global configuration adapters and accessible forms for exactly the Event capacity, POS USD/MXN fallback rate, and POS wholesale threshold settings, including bounds, defaults, owner/effective metadata, replay status, and protected error states.
- [x] 4.2 Connected configured POS fallback rate and threshold handling while retaining explicit active-shift rates, existing Event server availability/allocation, and open-shift behavior; added a forward migration for server-side POS fallback/threshold consumption.
- [x] 4.3 Added server-capability-driven Reports/Configuración navigation and safe fallback to Catálogo when a stale or unauthorized module is selected; exposed `configuration.manage` through the existing admin context migration.
- [x] 4.4 Added configuration API/UI, POS threshold/rate, Event availability, migration-contract, and access/navigation coverage.

## Task Checkbox State

- [x] 1.1 Backend typed settings and owner backfill
- [x] 1.2 Backend report snapshot and lifecycle aggregates
- [x] 1.3 Backend authorization, integrity, and compatibility contracts
- [x] 2.1 Backend integration contract suite — lifecycle, aggregate, boundary, scope, workload, allocation, and cancellation-release assertions pass on `dev`
- [x] 2.2 Configuration and workflow contract coverage — capability denial, exact validation, owner/default, audit/idempotency, effective timing, explicit-rate precedence, configured fallback/threshold consumption, reservation preservation, and open-shift preservation pass on `dev`
- [x] 3.1 Reports frontend typed adapter, dates, states, scopes, timezone, and dashboard consumption
- [x] 3.2 Reports trend chart and accessible textual equivalent
- [x] 3.3 Reports frontend adapter/dashboard/chart tests
- [x] 4.1–4.4 Configuration consumers, access/navigation, and tests
- [ ] 5.1–5.2 Full verification and scope guard

## Changed Files (cumulative)

| File | Action | Summary |
|---|---|---|
| `migrations/20260829000000_reports-dashboard-configuration.sql` | Modified previously | Scoped Event allocation to the selected window and multiplied daily capacity by the inclusive window day count. |
| `tests/integration/reports-dashboard-configuration.contract.test.ts` | Existing | Lifecycle-deletion and cancellation-release fixtures, batched CLI state/audit probes, POS consumer contract probes, and active assertions were validated unchanged in this rerun. |
| `src/features/sales/api/sales.ts` | Modified | Added typed dashboard snapshot contracts, runtime response mapping, strict date/scope/timezone request normalization, authorization classification, and the `report_dashboard_snapshot` adapter while retaining legacy report exports. |
| `src/features/sales/api/reportDashboard.test.ts` | Created | Covers full snake_case-to-camelCase snapshot mapping, scope, timezone, exact 366-day bounds, no-data, malformed responses, and authorization errors. |
| `src/features/sales/api/sales.test.ts` | Modified | Retains legacy report adapter coverage and verifies the dashboard adapter remains a separate complete-snapshot contract. |
| `src/features/sales/ui/salesReportUtils.ts` | Modified | Added strict inclusive date validation, complete channel normalization, and aggregate ranking helpers while retaining detail-ranking compatibility. |
| `src/features/sales/ui/SalesReportWorkspace.tsx` | Modified | Replaced capped-detail-derived KPIs with the typed snapshot dashboard, visible scope/timezone metadata, separated operations, complete aggregate rendering, accessible states, and last-valid-range recovery. |
| `src/features/sales/ui/SalesReportWorkspace.test.tsx` | Modified | Covers server-authoritative metrics, no-data, dates, scope/timezone arguments, loading, invalid input preservation, retry recovery, unauthorized-without-data, and accessibility. |
| `src/features/sales/ui/ReportTrendChart.tsx` | Created | Dependency-free responsive SVG trend with a textual daily data equivalent. |
| `src/features/sales/ui/ReportTrendChart.test.tsx` | Created | Verifies SVG/textual rendering and empty-state behavior without chart dependencies. |
| `src/app/appModules.ts` | Created | Centralized module identifiers and navigation metadata for capability-filtered navigation. |
| `src/app/AppShell.tsx` | Modified | Added an optional visible-module set used by the capability-gated admin shell. |
| `src/App.tsx` | Modified | Filters Reports/Configuración by server-returned capabilities and prevents unauthorized active-module entry. |
| `src/App.test.tsx` | Modified | Covers capability-filtered Reports/Configuración entries and the new configuration workspace entry. |
| `src/features/auth/ui/AdminBoundary.tsx` | Modified | Passes the server access context into the admin renderer without changing cashier semantics. |
| `src/features/configuration/api/configuration.ts` | Modified | Added typed global setting mapping, validation, effective metadata, and mutation adapters while retaining legacy Event signatures. |
| `src/features/configuration/ui/ConfigurationWorkspace.tsx` | Modified | Added the three-setting responsive configuration form and loading/default/error/unauthorized states. |
| `src/features/configuration/api/configuration.test.ts` | Created | Covers typed mapping, exact bounds, mutation payloads, replay status, incomplete responses, and authorization classification. |
| `src/features/configuration/ui/ConfigurationWorkspace.test.tsx` | Created | Covers the three forms, effective metadata, local validation, failed-save preservation, and unauthorized no-value rendering. |
| `src/features/configuration/api/configurationMigrationContract.test.ts` | Created previously | Covers capability exposure and server-side POS fallback/threshold migration contracts. |
| `migrations/20260830000000_expose-configuration-capability.sql` | Renamed | The reviewed SQL is unchanged; its migration name was normalized from underscores to hyphens after the InsForge CLI rejected the original filename, then applied to `dev`. |
| `src/features/configuration/api/configurationMigrationContract.test.ts` | Modified | Updated only the raw-migration import to follow the CLI-compliant filename; the focused migration contract suite passed. |
| `src/features/sales/ui/posUtils.ts` | Modified | Accepts an effective POS threshold while retaining the compatibility default. |
| `src/features/sales/ui/SalesWorkspace.tsx` | Modified | Loads global configuration when no active shift exists and gives active-shift rates precedence for POS display/submission. |
| `src/features/sales/ui/{posUtils.test.ts,SalesWorkspace.test.tsx}` | Modified | Covers threshold boundaries, configured fallback rates, and explicit active-shift rate precedence. |
| `src/features/events/ui/EventCustomerPortal.test.tsx` | Modified | Verifies the server-returned Event capacity is requested and presented for the selected date. |
| `openspec/changes/reports-dashboard-configuration/tasks.md` | Modified | Checked Phase 2 task 2.2 after the live fallback/threshold assertions passed; retained Phase 5 pending. |
| `openspec/changes/reports-dashboard-configuration/apply-progress.md` | Modified | Merged cumulative Phase 1–4 evidence with the corrective migration application, passing Phase 2.2 runtime result, cleanup evidence, and Phase 5 pending state. |

## Work Unit Evidence

| Evidence | Result |
|---|---|
| Migration apply | `npx -y @insforge/cli db migrations up 20260830000000_expose-configuration-capability.sql --json` on the CLI-linked `dev` schema-only branch (parent `paletixa`) — exit 0; version `20260830000000` applied successfully. The original underscore filename was rejected by the CLI, so only the filename/import were normalized; SQL content was not changed. |
| Focused test command | `REPORTS_DASHBOARD_REPEATABLE=1 bunx vitest run tests/integration/reports-dashboard-configuration.contract.test.ts --reporter verbose` — exit 0; 1 test file and 6/6 tests passed in 56.40s. All 98 direct `expect(...)` assertion calls in the enabled suite executed; configured fallback returned `12.3456`, threshold pricing returned `130`, and explicit rate `20` remained authoritative. |
| Runtime harness | The same command on InsForge `dev` (`schema-only`, parent `paletixa`) exercised live authenticated RPCs and direct fixture SQL. Configuration authorization, exact validation, owner/default state, audit/idempotency, effective timing, POS-rate precedence, reservation preservation, open-shift preservation, fallback, and threshold assertions all passed. |
| Runtime diagnosis | The applied migration replaced the legacy `get_access_context` and `record_sale_channels_legacy` boundaries on `dev`; the live consumer probes now use the configured values. The migration invokes repricing only for newly created POS results, while existing sales and non-POS workflow rows are not rewritten by migration application. |
| Default guard | `bunx vitest run tests/integration/reports-dashboard-configuration.contract.test.ts --reporter verbose` — exit 0; 1 file and 6 tests skipped because `REPORTS_DASHBOARD_REPEATABLE` was not enabled; no runtime assertions executed. |
| Lint | `bun run lint` — exit 0. |
| Build/type check | `bun run build` — exit 0; existing browser-crypto externalization and chunk-size warnings only. |
| Cleanup | The suite's `afterAll` completed; the post-run targeted query returned zero fixture branches, categories, products, customers, orders, reservations, event/wholesale items, test-marked sales, contract reversals, configuration mutations, and disabled user triggers. Configuration was restored to capacity `7`, rate `15.0000`, threshold `10`, with all effective timestamps `NULL`. No transient InsForge/parent metadata error occurred in this rerun; the prior run's retried parent `502` remains historical only. |
| Rollback boundary | Revert only the CLI-compliant migration filename/import and Phase 2.2 task/evidence updates locally; on `dev`, remove only the follow-up `get_access_context`, `reprice_operational_sale`, and wrapped `record_sale_channels_legacy` behavior through an explicit inverse migration if rollback is required. Preserve the reviewed `20260829000000` schema, all Phase 1/3/4 code, audit/config history, active-shift/open-shift behavior, and unrelated dirty/untracked work. |

## Audit Review

- **Server authority**: Event availability continues to come from `get_event_availability`; reservation allocation remains server-controlled. New POS fallback and threshold behavior is enforced by the forward migration for newly created POS sales, while explicit active-shift rates and existing sales remain unchanged.
- **Phase 2 runtime evidence**: The report/lifecycle contract path passes on `dev`, including the deleted wholesale reversal, latest-generation selection, Mexico City boundaries, exact 366-day acceptance, zero/no-data response, global Event workload/capacity visibility, and actual Event cancellation release.
- **Configuration surface**: The UI exposes only the three typed global settings, validates finite/bounded values, renders owner/effective state/timing, preserves values on failed saves, and retains legacy Event getter/setter compatibility.
- **Access/security**: Reports and Configuración entries use only server-returned capabilities; stale unauthorized selections fall back to Catálogo. No email prefix, client scope, or branch selector is used to authorize access.
- **Date contract**: Client and adapter accept exactly 366 inclusive calendar days, reject malformed/reversed/367-day ranges, send date-only values with explicit `America/Mexico_City`, and display returned UTC/scope metadata without grouping by Event date.
- **Recovery/security**: Invalid input preserves the current snapshot; generic request failures preserve the last valid snapshot and retry its range; authorization failures render without protected data.
- **Operations boundary**: Wholesale workload, Event capacity/allocation, and POS shift status are visibly separate from recognized sales and carry workload/capacity/status labels.
- **Unsupported scope**: No inventory, purchasing, tax, stock, export, synthetic shift, or other unsupported metric was added. Existing Event reservation and POS shift boundaries were preserved.
- **Accessibility/responsive behavior**: Loading, retryable error, invalid-date, authorized empty/no-data, and unauthorized-without-data states use live/alert semantics and focus recovery; the trend has a textual equivalent and mobile-first layout.

## Deviations

The approved design listed consumers in the main configuration migration; the already-reviewed follow-up migration was required because `dev` still exposed legacy `record_sale_channels_legacy` and `get_access_context` definitions. The InsForge CLI rejected the original underscore-containing filename, so the migration path and one raw-test import were normalized to the documented hyphen convention without changing SQL. After application, the active fallback/threshold assertions passed. Event reservation and POS shift source files required no production changes because their server-backed behavior remained compatible and is covered by the passing assertions.

## Incomplete Scope

- [x] Phase 2 task 2.1 backend integration tests — lifecycle, aggregate, boundary, scope, workload, allocation, completed-once, and cancellation-release assertions pass on `dev`.
- [x] Phase 2 task 2.2 configuration/workflow integration tests — capability denial, exact validation, owner/default, audit/idempotency, effective timing, explicit-rate precedence, configured fallback/threshold consumption, reservation preservation, and open-shift preservation assertions pass on `dev`.
- [x] Phase 4 configuration consumers, access/navigation, and tests
- [ ] Phase 5 full verification and scope guard

## Next Work-Unit Boundary

This corrective backend-test boundary is complete for Phase 2: tasks 2.1 and 2.2 are checked after the reviewed consumer migration was applied and the live suite passed. Phase 5 tasks 5.1–5.2 remain pending; do not claim final verification or archive readiness. The pre-existing dirty worktree prevents a reliable repository-wide changed-line count; this correction estimates roughly 50 authored changed lines plus one migration path rename and did not edit unrelated product code.

## Phase 5 Verification Attempt

- **Work unit**: `phase5-verification-scope-guard` — only tasks 5.1–5.2 were evaluated.
- **Native attempt binding**: The orchestrator-owned attempt `sha256:17e36ab19b1537352b8dd3b66db84c312ea1c92163fbee021342adae79534f22` is generation 15, ordinal 15, with initial candidate identity `sha256:fe5660b58a91e145957dfe670f26e93691058f560f1b7fa7b6c2e4df3a52ec31` and tree `78c4293b6febe22a0559847320901927a14d127a`; this executor did not acquire, reset, or settle it.
- **Changed-line estimate**: 0 implementation/source lines; approximately 70 authored verification-artifact lines, below the 400-line bound. The unrelated dirty and untracked worktree was preserved.

### Verification Commands and Outcomes

- `bun run lint` — exit 0; `eslint .` completed without lint findings.
- `bun run build` — exit 0; TypeScript and Vite build completed, transforming 221 modules. Existing warnings only: InsForge SDK `crypto` browser externalization and the 804.40 kB minified application chunk exceeding the 500 kB advisory threshold.
- The requested `bun run test --` frontend invocation expanded the package script's `vitest run src --exclude 'tests/integration/**'` root and therefore executed 63 files/480 tests rather than only the supplied filters. It exited 1 twice: 62 files/479 tests passed and `src/features/events/ui/EventReservationWorkspace.test.tsx` failed one 5,000 ms test timeout (`creates an admin reservation with the customer as the only identity and keeps details immediately before submit`). The run also emitted the existing jsdom `HTMLCanvasElement.getContext()` not-implemented warnings. This failure is retained, not suppressed.
- Focused frontend retry with `bunx vitest run src/App.test.tsx src/app/AppShell.test.tsx src/features/auth/api/adminAccess.test.ts src/features/auth/ui/AdminBoundary.test.tsx src/features/sales/api/reportDashboard.test.ts src/features/sales/api/sales.test.ts src/features/sales/api/posShifts.test.ts src/features/sales/ui/SalesReportWorkspace.test.tsx src/features/sales/ui/ReportTrendChart.test.tsx src/features/sales/ui/posUtils.test.ts src/features/sales/ui/SalesWorkspace.test.tsx src/features/sales/ui/PosShiftWorkspace.test.tsx src/features/configuration/api/configuration.test.ts src/features/configuration/ui/ConfigurationWorkspace.test.tsx src/features/events/ui/EventCustomerPortal.test.tsx --reporter verbose` — exit 0; 15 files and 166/166 tests passed in 29.89 s.
- `bun run test -- src/features/configuration/api/configurationMigrationContract.test.ts` — exit 1 for the same package-script expansion and unrelated EventReservationWorkspace timeout; the requested migration contract file was among the 62 passing files.
- Isolated migration contract command `bunx vitest run src/features/configuration/api/configurationMigrationContract.test.ts --reporter verbose` — exit 0; 1 file and 3/3 tests passed in 1.46 s.
- Repeatable live command `REPORTS_DASHBOARD_REPEATABLE=1 bunx vitest run tests/integration/reports-dashboard-configuration.contract.test.ts --reporter verbose` — exit 1; `beforeAll` timed out at 30,000 ms and `afterAll` also timed out at 30,000 ms, leaving all 6 contract tests skipped and no current-run assertions executed. This live timeout prevents checking 5.1–5.2 in this attempt.

### Migration Ordering and Live `dev` Evidence

- `migrations/20260829000000_reports-dashboard-configuration.sql` is the earlier migration and defines the typed configuration resolver functions used by consumers, including `operational_pos_usd_mxn_rate()` and `operational_pos_wholesale_threshold()`.
- `migrations/20260830000000_expose-configuration-capability.sql` is the later migration and consumes those resolvers for newly recorded POS sales, while wrapping the legacy `record_sale_channels_legacy` boundary. The raw contract import at `src/features/configuration/api/configurationMigrationContract.test.ts:2` uses this exact hyphenated filename; its three isolated assertions passed.
- Read-only CLI checks confirmed the runtime target is InsForge project `dev`, branched from `paletixa`, active, ready, and `schema-only`. The prior persisted Phase 2 evidence remains a separate successful `dev` run after applying `20260830000000_expose-configuration-capability.sql`: 6/6 live tests and 98 direct assertions passed, with fallback `12.3456`, threshold result `130`, explicit rate `20` preserved, and cleanup completed. No new live evidence revision was produced by this timed-out attempt; current native `evidence_revision` is empty.
- A post-timeout read-only query found zero marker branches, categories, products, customers, wholesale orders, event reservations, event mutations, sales, sale items, or shifts; configuration was restored to capacity `7`, rate `15.0000`, and threshold `10`.

### Read-Only Scope Guard Findings

- No inventory, purchasing, tax, stock, export, or other unsupported dashboard panel/metric was found in the proposal, specs, design, migration pair, or changed Reports/Configuration implementation. The report renders only server snapshot sales aggregates plus separately labeled wholesale workload, Event capacity/allocation, and POS shift status.
- Configuration is limited to the three typed global keys in the API, UI, and migration. The `unknown_setting` occurrence is a negative contract input, not a generic setting. No generic or untyped storage was added.
- The dashboard consumes `getReportDashboardSnapshot` and renders server-provided totals, counts, average, channels, daily points, and product aggregates. It does not call the legacy `report_sales_detail` adapter or compose revenue/KPIs from client detail rows; product ranking is presentation over server aggregates only.
- No synthetic shift or unscoped business-fact backfill was added. The migration owner backfill is restricted to configuration accountability; the consumer migration reprices only a newly created POS sale (`result_status = 'created'`, POS channel). Temporary shifts created by the integration fixture were test-only and the read-only cleanup query found none remaining.
- No browser/E2E harness is available; UI evidence is limited to Vitest/jsdom, lint, and build.

### Phase 5 Task State

- [ ] 5.1 Full verification and migration-before-consumer ordering — **not checked** because the package-script frontend command failed on the EventReservationWorkspace timeout and the repeatable live contract run timed out before assertions.
- [ ] 5.2 Scope guard — **not checked as a completed task** because the required verification work unit did not obtain a passing live evidence set, although the read-only source scope inspection found no scope concern.

**Rollback boundary**: Remove only this Phase 5 evidence section from `openspec/changes/reports-dashboard-configuration/apply-progress.md`; no product source, migration, task checkbox, or backend behavior was changed in this batch. Preserve the cumulative Phase 1–4 and Phase 2.2 evidence above. `sdd-verify` remains the final next phase only after a successful Phase 5 completion; archive is not ready.

## Phase 5 Corrective Retry

- **Work unit**: `phase5-verification-scope-guard-retry` — only tasks 5.1–5.2 were evaluated; no product source, migration, or test-semantic edits were made.
- **Mode**: Standard; strict TDD remains disabled. Delivery is auto-chain with `stacked-to-main`; the 400-line review budget applies.
- **Native attempt binding**: Used only the orchestrator-owned active attempt `sha256:42bf2c1b87558d82e259dac9ec49c4210d7cb3435ff1a6d47ca8398b4683843a`, generation 16 / ordinal 16, with `max_attempts: 1` and `max_changed_lines: 400`. This executor did not acquire, reset, or settle it.
- **Candidate binding**: Initial candidate identity `sha256:fe5660b58a91e145957dfe670f26e93691058f560f1b7fa7b6c2e4df3a52ec31`; initial candidate tree `78c4293b6febe22a0559847320901927a14d127a`.
- **Evidence binding**: This retry evidence revision is `sha256:da2d87ead04868da98e755604faa0c5481474c1473f6715c0cfa5c8228690429`, distinct from failed revision `sha256:d07085f6f533f224a453d07817e2b02926422288e982d6a1b5d6c12722fecd46`. A passing settlement would require `--remediates-evidence-revision sha256:d07085f6f533f224a453d07817e2b02926422288e982d6a1b5d6c12722fecd46`; no settlement was performed because the required focused set did not pass.
- **Changed-line estimate**: 0 implementation/source or migration lines; approximately 45 authored verification-artifact lines appended here; below the 400-line bound. Existing dirty and untracked work was preserved.

### Corrective Retry Verification Commands and Outcomes

- `bun run lint` — exit 0; `eslint .` completed without findings.
- `bun run build` — exit 0; TypeScript and Vite transformed 221 modules. Existing warnings only: InsForge SDK `crypto` browser externalization and the 804.40 kB minified chunk advisory.
- `bunx vitest run src/App.test.tsx src/app/AppShell.test.tsx src/features/auth/api/adminAccess.test.ts src/features/auth/ui/AdminBoundary.test.tsx src/features/sales/api/reportDashboard.test.ts src/features/sales/api/sales.test.ts src/features/sales/api/posShifts.test.ts src/features/sales/ui/SalesReportWorkspace.test.tsx src/features/sales/ui/ReportTrendChart.test.tsx src/features/sales/ui/posUtils.test.ts src/features/sales/ui/SalesWorkspace.test.tsx src/features/sales/ui/PosShiftWorkspace.test.tsx src/features/configuration/api/configuration.test.ts src/features/configuration/ui/ConfigurationWorkspace.test.tsx src/features/events/ui/EventCustomerPortal.test.tsx --reporter verbose` — exit 1; 14/15 files passed and 165/166 tests passed. `src/features/events/ui/EventCustomerPortal.test.tsx` timed out once at 5,000 ms in `validates before opening the confirmation modal, then calls the RPC only after confirmation`; the exact direct command was not rerun.
- `bunx vitest run src/features/configuration/api/configurationMigrationContract.test.ts --reporter verbose` — exit 0; 1/1 file and 3/3 tests passed.
- `REPORTS_DASHBOARD_REPEATABLE=1 bunx vitest run tests/integration/reports-dashboard-configuration.contract.test.ts --reporter verbose` — exit 0; 1/1 file and 6/6 live tests passed in 56.15 s. All 98 direct `expect(...)` calls in the enabled contract file were present and the six tests executed them successfully.
- `bun run test` — exit 0; optional full package suite completed once with 63/63 files and 480/480 tests passed. Existing jsdom canvas `getContext()` not-implemented warnings only. This successful broad suite does not convert the separately required exact direct focused command's timeout into a pass.

### Migration Ordering and Runtime Evidence

- The actual `migrations/20260829000000_reports-dashboard-configuration.sql` file defines `operational_pos_usd_mxn_rate()` at line 216 and `operational_pos_wholesale_threshold()` at line 231.
- The later `migrations/20260830000000_expose-configuration-capability.sql` file consumes those resolvers at lines 66 and 203 while wrapping `record_sale_channels_legacy`; the raw migration contract imports this exact hyphenated file and its isolated 3/3 assertions passed.
- The live runtime harness exercised the InsForge `dev` schema-only branch, including authenticated RPCs and fixture SQL. The suite completed `afterAll` without a hook failure; read-only post-run checks found zero marker rows across branches, categories, products, wholesale/event fixtures, sales, sale items, reversals, and POS shifts. Configuration is restored to capacity `7`, rate `15.0000`, threshold `10`, with all effective timestamps `NULL`; append-only trigger state remained enabled. Recent audit/receipt rows are retained history, not fixture rows.

### Read-Only Scope Guard Findings

- No inventory, purchasing, tax, stock, export UI/metric, or other unsupported dashboard value was found in the proposal, specs, design, migration pair, or Reports/Configuration implementation.
- Configuration remains limited to the three typed global keys. `unknown_setting` appears only as a negative validation input; no generic or untyped setting store was added.
- `SalesReportWorkspace` calls `getReportDashboardSnapshot` and renders server-provided aggregates and separately labeled operations. It has no `getSalesReportDetail`, `report_sales_detail`, or client reduction path for report KPIs.
- No synthetic shift or unscoped business-fact backfill was added. The first migration's owner assignment is configuration accountability only; the later consumer wrapper reprices only newly created POS results and leaves existing sales, wholesale behavior, allocations, and open-shift rates unchanged.
- No browser/E2E harness exists; UI evidence is limited to Vitest/jsdom, lint, and build.

### Corrective Retry Task State

- [ ] 5.1 Full verification and migration-before-consumer ordering — **not checked** because the exact direct frontend set had one EventCustomerPortal timeout, despite the passing migration contract, live suite, and full package suite.
- [ ] 5.2 Scope guard — **not checked as a completed task** because the assigned verification work unit did not obtain a clean required focused set; read-only inspection found no scope violation.

**Rollback boundary**: Remove only this `Phase 5 Corrective Retry` section from this cumulative apply-progress artifact. Preserve all prior Phase 1–4 and Phase 2.2 evidence, product source, migrations, test semantics, unrelated dirty/untracked files, and the live audit/config history. `sdd-verify` is not recommended from this partial retry; archive is not ready.

## Phase 5 Final Verification and Scope Guard

- **Work unit**: `phase5-final-verification-scope-guard` — only tasks 5.1–5.2 were evaluated; no product source, migration, or test-semantic edits were made.
- **Mode**: Standard; strict TDD remains disabled. Delivery is auto-chain with `stacked-to-main`; the 400-line review budget applies.
- **Native attempt binding**: Used only the orchestrator-owned active attempt `sha256:ef9e50b5f144d0709479cd357c9c5aeb263f39d2c19200eae45fc31014cf9018`, generation 17 / ordinal 17, with `max_attempts: 1` and `max_changed_lines: 400`. This executor did not acquire, reset, or settle it.
- **Candidate binding**: Native begin candidate identity `sha256:fe5660b58a91e145957dfe670f26e93691058f560f1b7fa7b6c2e4df3a52ec31`; native begin candidate tree `78c4293b6febe22a0559847320901927a14d127a`.
- **Evidence binding**: Distinct final evidence revision `sha256:75328d9cab305d41163ae974e69f4032d24f315df620cbaf1a30e2d25fcab19a`, remediating failed revision `sha256:da2d87ead04868da98e755604faa0c5481474c1473f6715c0cfa5c8228690429`. The orchestrator-owned passing settlement must carry `--remediates-evidence-revision sha256:da2d87ead04868da98e755604faa0c5481474c1473f6715c0cfa5c8228690429` and this distinct evidence revision; this executor intentionally performed no settlement.
- **Changed-line estimate**: 0 production, migration, or test-semantic lines; approximately 50 authored final verification-artifact lines plus two task checkbox changes, below the 400-line bound. Existing dirty and untracked work was preserved.

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | Exact direct frontend Vitest set below — exit 0; 15 files and 166/166 tests passed in 27.72 s. Isolated migration contract below — exit 0; 1 file and 3/3 tests passed in 1.49 s. |
| Runtime harness command/scenario and exact result | `REPORTS_DASHBOARD_REPEATABLE=1 bunx vitest run tests/integration/reports-dashboard-configuration.contract.test.ts --reporter verbose` on InsForge `dev` — exit 0; 1 file and 6/6 live tests passed in 59.11 s, with all 98 direct assertions executed; `afterAll` and post-run cleanup checks completed. |
| Rollback boundary | Revert only the two Phase 5 checkbox changes and remove only this final verification section from the cumulative apply-progress artifact. No product source, migration, or test-semantic behavior changed; preserve prior evidence, live history, and unrelated dirty/untracked files. |

### Final Verification Commands and Outcomes

- `bun run lint` — exit 0; `eslint .` completed without findings.
- `bun run build` — exit 0; `tsc -b` and Vite transformed 221 modules. Existing warnings only: InsForge SDK `crypto` browser externalization and the 804.40 kB minified application chunk advisory.
- `bunx vitest run src/App.test.tsx src/app/AppShell.test.tsx src/features/auth/api/adminAccess.test.ts src/features/auth/ui/AdminBoundary.test.tsx src/features/sales/api/reportDashboard.test.ts src/features/sales/api/sales.test.ts src/features/sales/api/posShifts.test.ts src/features/sales/ui/SalesReportWorkspace.test.tsx src/features/sales/ui/ReportTrendChart.test.tsx src/features/sales/ui/posUtils.test.ts src/features/sales/ui/SalesWorkspace.test.tsx src/features/sales/ui/PosShiftWorkspace.test.tsx src/features/configuration/api/configuration.test.ts src/features/configuration/ui/ConfigurationWorkspace.test.tsx src/features/events/ui/EventCustomerPortal.test.tsx --reporter verbose` — exit 0; 15 files and 166/166 tests passed in 27.72 s. The hardened `EventCustomerPortal.test.tsx` and `PosShiftWorkspace.test.tsx` cases passed; an existing React Query pending-rejection stderr notice did not fail an assertion.
- `bunx vitest run src/features/configuration/api/configurationMigrationContract.test.ts --reporter verbose` — exit 0; 1 file and 3/3 tests passed in 1.49 s.
- `REPORTS_DASHBOARD_REPEATABLE=1 bunx vitest run tests/integration/reports-dashboard-configuration.contract.test.ts --reporter verbose` — exit 0; 1 file and 6/6 live tests passed in 59.11 s. All 98 direct assertions in the enabled contract suite executed successfully against InsForge `dev`.
- `bun run test` — exit 0; the bounded package suite ran once with 63/63 files and 480/480 tests passed in 74.54 s. Existing jsdom `HTMLCanvasElement.getContext()` not-implemented warnings only.

### Migration Ordering and Live `dev` Evidence

- Actual filenames establish the order: `migrations/20260829000000_reports-dashboard-configuration.sql` precedes `migrations/20260830000000_expose-configuration-capability.sql`.
- The earlier migration defines `public.operational_pos_usd_mxn_rate()` at line 216 and `public.operational_pos_wholesale_threshold()` at line 231. The later migration consumes those resolvers at lines 66 and 203 while wrapping `record_sale_channels_legacy`.
- `src/features/configuration/api/configurationMigrationContract.test.ts:2` imports the exact later filename `../../../../migrations/20260830000000_expose-configuration-capability.sql?raw`; its isolated 3/3 assertions passed. This proves the consumer migration is ordered after the resolver migration and uses the CLI-compliant hyphenated filename.
- Read-only InsForge CLI checks identified the runtime target as project `dev`, active and ready, `schema-only`, branched from `paletixa`. The live harness exercised authenticated RPCs and direct fixture SQL on that branch.
- The live `afterAll` completed. A post-run read-only query found zero marker branches, categories, products, customers, wholesale orders, reservations, event mutations, sales, sale items, reversals, or fixture shifts. Configuration was restored to capacity `7`, POS rate `15.0000`, and threshold `10`, with all three effective timestamps `NULL`; append-only audit/receipt history remains intentional history rather than fixture residue.
- Assertions executed, cleanup/default restoration, and runtime boundaries were all observed; no browser or E2E harness exists, so UI coverage is Vitest/jsdom only.

### Read-Only Scope Guard Findings

- No inventory, purchasing, tax, stock, export UI/metric, or other unsupported dashboard value was found in the proposal, all three specs, design, migration pair, or Reports/Configuration implementation. The report surface contains only server snapshot sales aggregates plus separately labeled wholesale workload, Event capacity/allocation, and POS shift status.
- Configuration is limited to the three typed global keys. `unknown_setting` occurs only as a negative validation input; no generic or untyped setting store was added.
- `SalesReportWorkspace` calls `getReportDashboardSnapshot` and renders server-provided totals, counts, average, channels, daily points, products, and operations. It does not call the legacy `getSalesReportDetail`/`report_sales_detail` path or compose report revenue/KPIs from client detail rows; product ranking is presentation over server aggregates.
- No synthetic shift or unscoped business-fact backfill was added. The first migration's owner assignment is configuration accountability only; the later consumer migration reprices only newly created POS results and leaves existing sales, wholesale behavior, allocations, and open-shift rates unchanged.

### Final Phase 5 Task State

- [x] 5.1 Full verification and migration-before-consumer ordering — lint, build, exact direct 15-file frontend set (166/166), isolated migration contract (3/3), repeatable live `dev` contracts (6/6 and 98 assertions), and bounded package suite (480/480) passed once each; filename/import ordering verified from actual files.
- [x] 5.2 Scope guard — read-only inspection found no unsupported domains, generic settings, client-derived report KPIs, synthetic shifts, or unscoped business-fact backfills.

**Rollback boundary**: Revert only the two Phase 5 checkbox changes and remove only this `Phase 5 Final Verification and Scope Guard` section from the cumulative apply-progress artifact. Preserve all prior Phase 1–4 and Phase 2 evidence, product source, migrations, test semantics, live audit/config history, and unrelated dirty/untracked work. `sdd-verify` is recommended next; archive is not ready because verification has not run.

## Phase 5 Gatekeeper Corrective Rerun (Current)

- **Work unit**: `phase5-final-verification-scope-guard` — only tasks 5.1–5.2 were evaluated.
- **Mode**: Standard; strict TDD remains disabled. Delivery is auto-chain with `stacked-to-main`; the 400-line review budget applies.
- **Native attempt binding**: Used only the already-acquired attempt `sha256:ef9e50b5f144d0709479cd357c9c5aeb263f39d2c19200eae45fc31014cf9018`, generation 17 / ordinal 17, with `max_attempts: 1` and `max_changed_lines: 400`. This executor did not acquire, reset, or settle it.
- **Candidate binding**: Initial candidate identity `sha256:fe5660b58a91e145957dfe670f26e93691058f560f1b7fa7b6c2e4df3a52ec31`; initial candidate tree `78c4293b6febe22a0559847320901927a14d127a`.
- **Evidence binding**: No evidence revision is available; the active attempt status reports an empty `evidence_revision`. No settlement was performed.
- **Changed-line estimate**: 0 production, migration, or test-semantic lines; verification artifacts only (this appended record and two task-checkbox reversions), below the 400-line bound. Existing dirty and untracked work was preserved.
- **Authorized test hardening**: The existing EventCustomerPortal async wait and PosShiftWorkspace callback test changes were retained. No further fixes or test-semantic changes were made.

### Current Verification Commands and Outcomes

- `bun run lint` — exit 0; `eslint .` completed without findings.
- `bun run build` — exit 0; `tsc -b` and Vite transformed 221 modules. Existing warnings only: InsForge SDK `crypto` browser externalization and the 804.40 kB minified chunk advisory.
- `bunx vitest run src/App.test.tsx src/app/AppShell.test.tsx src/features/auth/api/adminAccess.test.ts src/features/auth/ui/AdminBoundary.test.tsx src/features/sales/api/reportDashboard.test.ts src/features/sales/api/sales.test.ts src/features/sales/api/posShifts.test.ts src/features/sales/ui/SalesReportWorkspace.test.tsx src/features/sales/ui/ReportTrendChart.test.tsx src/features/sales/ui/posUtils.test.ts src/features/sales/ui/SalesWorkspace.test.tsx src/features/sales/ui/PosShiftWorkspace.test.tsx src/features/configuration/api/configuration.test.ts src/features/configuration/ui/ConfigurationWorkspace.test.tsx src/features/events/ui/EventCustomerPortal.test.tsx --reporter verbose` — exit 1; 14/15 files and 165/166 tests passed. `src/features/sales/ui/PosShiftWorkspace.test.tsx` failed `keeps logout enabled in the opening modal while blocking accidental overlay dismissal`: expected `onLogout` twice after Escape but received one call. The exact command was not rerun.
- `bunx vitest run src/features/configuration/api/configurationMigrationContract.test.ts --reporter verbose` — exit 0; 1 file and 3/3 tests passed.
- `REPORTS_DASHBOARD_REPEATABLE=1 bunx vitest run tests/integration/reports-dashboard-configuration.contract.test.ts --reporter verbose` — exit 0; 1 file and 6/6 live tests passed in 59.10 seconds. The live `dev` suite executed its 98 direct assertions successfully.
- `bun run test` — exit 0; 63/63 files and 480/480 tests passed. Existing jsdom `HTMLCanvasElement.getContext()` not-implemented warnings only. This broad pass does not convert the separately required direct focused failure into a pass.

### Migration Ordering, Cleanup, and Scope Guard

- **Migration ordering**: Actual filenames establish `migrations/20260829000000_reports-dashboard-configuration.sql` before `migrations/20260830000000_expose-configuration-capability.sql`. The earlier file defines `public.operational_pos_usd_mxn_rate()` at line 216 and `public.operational_pos_wholesale_threshold()` at line 231. The later file consumes them at lines 66 and 203 while wrapping `record_sale_channels_legacy`. `src/features/configuration/api/configurationMigrationContract.test.ts:2` imports the exact later hyphenated filename; its isolated 3/3 assertions passed.
- **Runtime and cleanup**: The passing live harness exercised authenticated RPCs and fixture SQL on InsForge `dev`, an active `schema-only` branch of `paletixa`. Its `afterAll` completed; source cleanup disables only the necessary fixture triggers, removes marker branches/categories/products/customers/orders/reservations/sales/items/reversals and the test shift, then restores the captured configuration values and null effective timestamps. The captured current defaults were capacity `7`, POS rate `15.0000`, and threshold `10`; append-only audit/receipt history remains intentional history.
- **Assertions**: The direct frontend command executed 166 tests with one failure; the migration contract executed 3/3; the repeatable live harness executed 6/6 tests and 98 direct assertions; the package suite executed 480/480 tests. No browser or E2E harness exists; UI evidence is Vitest/jsdom, lint, and build only.
- **Scope guard**: Read-only inspection found no inventory, purchasing, tax, stock, export UI/metric, or other unsupported dashboard value in the proposal, all three specs, design, migration pair, or Reports/Configuration implementation. Configuration remains limited to `event_daily_capacity`, `pos_usd_mxn_rate`, and `pos_wholesale_threshold`; `unknown_setting` is only a negative validation input. `SalesReportWorkspace` calls `getReportDashboardSnapshot` and renders server-provided aggregates plus separately labeled workload/capacity/status; it does not use `getSalesReportDetail`/`report_sales_detail` to compose report KPIs. No synthetic shift or unscoped business-fact backfill was added; the owner assignment is configuration accountability only, and the consumer migration reprices only newly created POS results.

### Current Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | Required direct frontend set failed once: 14/15 files and 165/166 tests passed, with the single PosShiftWorkspace callback assertion failure above. The isolated migration contract passed 1/1 file and 3/3 tests. |
| Runtime harness command/scenario and exact result | `REPORTS_DASHBOARD_REPEATABLE=1 bunx vitest run tests/integration/reports-dashboard-configuration.contract.test.ts --reporter verbose` passed against InsForge `dev`: 1/1 file, 6/6 tests, 98 direct assertions, and completed cleanup. |
| Rollback boundary | Revert only the two Phase 5 checkbox reversions and remove only this current corrective-rerun section from the cumulative apply-progress artifact. Preserve all product source, migrations, test semantics, prior evidence, live audit/config history, and unrelated dirty/untracked work. |

### Current Phase 5 Task State

- [ ] 5.1 Full verification and migration-before-consumer ordering — not checked because the exact required direct frontend set failed once.
- [ ] 5.2 Scope guard — not checked as a completed task because the required work unit did not obtain a clean focused result, although read-only inspection found no scope violation.

**Current status**: Partial. Do not retry this already-acquired attempt; no `sdd-verify`, archive, commit, push, deployment, or review transaction was run.

## Phase 5 Completion Rerun

- **Work unit**: `phase5-final-verification-scope-guard` — only tasks 5.1–5.2 were evaluated; no product source, migration, or test-semantic files were changed.
- **Mode**: Standard; strict TDD remains disabled. Delivery is auto-chain with `stacked-to-main`; the 400-line review budget applies.
- **Native attempt binding**: Continued only the provider-owned active attempt `sha256:90660df4195a6facb6d8a70b09bf1959ad34ab90e693ba8943a2d3f32ae8af65` for generation 18 / ordinal 18. The token-matched acquire returned `proceed` without creating another attempt; no reset was performed.
- **Evidence binding**: Passing evidence revision `sha256:9902ceb8539d8499c228c02d3b677cd3931e89dad82dd0e05c9502ba6e58c50f` is distinct from and remediates the failed focused-verification revision `sha256:33e5735cb8afdff857a45e684b0c7ff805da2094568c660d6cb39a495f77db24`. The passing settle used the distinct request ID `phase5-final-verification-scope-guard-20260829-120000-settle`, named the required `--remediates-evidence-revision`, and returned `state: complete`.
- **Changed-line estimate**: 0 production, migration, or test-semantic lines; two Phase 5 task checkbox changes and this verification record only, below the 400-line bound. Existing dirty and untracked repository state was preserved.

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | Direct frontend command `bunx vitest run src/App.test.tsx src/app/AppShell.test.tsx src/features/auth/api/adminAccess.test.ts src/features/auth/ui/AdminBoundary.test.tsx src/features/sales/api/reportDashboard.test.ts src/features/sales/api/sales.test.ts src/features/sales/api/posShifts.test.ts src/features/sales/ui/SalesReportWorkspace.test.tsx src/features/sales/ui/ReportTrendChart.test.tsx src/features/sales/ui/posUtils.test.ts src/features/sales/ui/SalesWorkspace.test.tsx src/features/sales/ui/PosShiftWorkspace.test.tsx src/features/configuration/api/configuration.test.ts src/features/configuration/ui/ConfigurationWorkspace.test.tsx src/features/events/ui/EventCustomerPortal.test.tsx --reporter verbose` — exit 0; 15 files and 166/166 tests passed in 43.84s. Isolated migration contract `bunx vitest run src/features/configuration/api/configurationMigrationContract.test.ts --reporter verbose` — exit 0; 1 file and 3/3 tests passed in 5.19s. |
| Runtime harness command/scenario and exact result | `REPORTS_DASHBOARD_REPEATABLE=1 bunx vitest run tests/integration/reports-dashboard-configuration.contract.test.ts --reporter verbose` — exit 0; live InsForge `dev` schema-only contracts passed 1 file and 6/6 tests in 56.90s. The suite completed `afterAll`; its 98 direct assertions executed successfully. Read-only CLI cleanup checks returned zero marker branches, categories, products, customers, wholesale orders, event reservations, event mutations, sales, sale items, and event items; configuration was restored to capacity 7, POS rate 15.0000, threshold 10, with NULL effective timestamps. |
| Rollback boundary | Revert only the two Phase 5 checkbox changes and remove only this `Phase 5 Completion Rerun` section from the cumulative apply-progress artifact. Preserve all Phase 1–4 product/migration/test work, prior evidence, intentional append-only audit/receipt history, live configuration history, and unrelated dirty/untracked files. |

### Verification Commands and Outcomes

- `bun run lint` — exit 0; `eslint .` completed without findings.
- `bun run build` — exit 0; TypeScript and Vite transformed 221 modules and built successfully. Existing warnings only: InsForge SDK `crypto` browser externalization and the 804.40 kB minified application chunk advisory.
- Direct frontend focused set — exit 0; 15/15 files and 166/166 tests passed. The retained `EventCustomerPortal` async wait and `PosShiftWorkspace` button/Escape logout hardening both passed.
- Isolated migration contract — exit 0; 1/1 file and 3/3 tests passed.
- Repeatable live InsForge contract set — exit 0; 1/1 file and 6/6 tests passed in 56.90s, with all 98 direct assertions executed and cleanup completed.
- `bun run test` — exit 0; 63/63 files and 480/480 tests passed in 78.69s. Existing jsdom `HTMLCanvasElement.getContext()` not-implemented warnings only.
- Native settle — `gentle-ai sdd-attempt settle` with a distinct request ID, passing evidence revision `sha256:9902ceb8539d8499c228c02d3b677cd3931e89dad82dd0e05c9502ba6e58c50f`, and `--remediates-evidence-revision sha256:33e5735cb8afdff857a45e684b0c7ff805da2094568c660d6cb39a495f77db24` — returned `state: complete`.

### Migration Ordering and Runtime State

- Actual filenames establish `migrations/20260829000000_reports-dashboard-configuration.sql` before `migrations/20260830000000_expose-configuration-capability.sql`.
- The earlier migration defines `public.operational_pos_usd_mxn_rate()` at line 216 and `public.operational_pos_wholesale_threshold()` at line 231. The later migration consumes those resolvers at lines 66 and 203 while wrapping `record_sale_channels_legacy`.
- `src/features/configuration/api/configurationMigrationContract.test.ts` imports the exact later hyphenated migration filename; its isolated 3/3 assertions passed.
- Read-only CLI checks confirmed the live target is active, ready, schema-only InsForge `dev`, branched from `paletixa`. No deployment or remote code mutation was performed.

### Scope Guard Findings

- No inventory, purchasing, tax, stock, export UI/metric, or other unsupported dashboard value was found in the proposal, all three specs, design, migration pair, or Reports/Configuration implementation. The report surface contains only server snapshot sales aggregates plus separately labeled wholesale workload, Event capacity/allocation, and POS shift status.
- Configuration remains limited to the three typed global keys. `unknown_setting` occurs only as a negative validation input; no generic or untyped settings store was added.
- `SalesReportWorkspace` calls `getReportDashboardSnapshot` and renders server-provided totals, counts, averages, channels, daily points, product aggregates, and separately labeled operations. It does not call the legacy `getSalesReportDetail`/`report_sales_detail` path to compose report KPIs.
- No synthetic shift or unscoped business-fact backfill was added. The first migration's owner assignment is configuration accountability only; the later consumer migration reprices only newly created POS results and leaves existing sales, wholesale behavior, allocations, and open-shift rates unchanged.
- No browser/E2E harness exists; UI evidence is limited to Vitest/jsdom, lint, and build.

### Final Phase 5 Task State

- [x] 5.1 Full verification and migration-before-consumer ordering — lint, build, exact direct 15-file frontend set (166/166), isolated migration contract (3/3), repeatable live `dev` contracts (6/6 and 98 assertions), and bounded package suite (480/480) passed; filename/import ordering verified from actual files.
- [x] 5.2 Scope guard — read-only inspection found no unsupported domains, generic settings, client-derived report KPIs, synthetic shifts, or unscoped business-fact backfills.

**Current status**: Complete for apply. `sdd-verify` is recommended next; archive remains blocked until strict verification produces a passing verify report.
