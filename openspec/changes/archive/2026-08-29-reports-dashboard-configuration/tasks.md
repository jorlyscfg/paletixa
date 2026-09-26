# Tasks: Reports Dashboard and Operational Configuration

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 900–1,200 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 backend; PR 2 reports; PR 3 config |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No — chain strategy selected
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

Selected chain strategy: `stacked-to-main`.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Backend migration/RPC contracts | PR 1 | `bun run test:integration -- tests/integration/reports-dashboard-configuration.contract.test.ts` | InsForge dev fixtures | Revert migration/RPCs; retain ledger |
| 2 | Reports adapter/dashboard/chart | PR 2 | `bun run test -- src/features/sales/api/reportDashboard.test.ts src/features/sales/ui/SalesReportWorkspace.test.tsx` | N/A — no browser; jsdom | Hide UI; restore adapters |
| 3 | Configuration consumers/access | PR 3 | `bun run test -- src/features/configuration src/features/sales/api/posShifts.test.ts src/features/sales/ui/posUtils.test.ts` | N/A — no browser; mocked tests | Disable entrypoint/consumers; retain audit |

## Phase 1: Backend

- [x] 1.1 Create `migrations/20260829000000_reports-dashboard-configuration.sql` with typed global settings, defaults 7/15/10, bounds capacity/threshold 1–10,000 and rate 0.01–10,000 at four decimals, `owner_id UUID NOT NULL`, verified-admin backfill, and abort without owner.
- [x] 1.2 Add `report_dashboard_snapshot` with UTC half-open `America/Mexico_City` ranges, sale-time grouping, zero-filled days, complete product/category aggregates, separate operations, and lifecycle/reversal rules.
- [x] 1.3 Enforce `reports.view`/`configuration.manage`, server scope, legacy/global semantics, selector rejection, locked hash receipts, atomic audit, replay/conflict idempotency, DML denial, and legacy Event RPC signatures.

## Phase 2: Backend Tests

- [x] 2.1 Add `tests/integration/reports-dashboard-configuration.contract.test.ts` for POS non-reversed/reversed; wholesale pending/processing-workload, latest-completed-only, cancelled/deleted/replacement-reversal; Event pending-workload, reserved-allocation, completed-once, cancelled-release, processing/deleted-invalid; >100 rows, 366-day/Mexico boundaries, zero/no-data averages, branch denial, legacy unscoped rows, global Event capacity visibility.
- [x] 2.2 Test capability denial, exact bounds/types/non-finite values, non-null owner/default state, atomic audit/idempotency, new-operation-only authorization, effective timing, POS-rate precedence, and unchanged reservations/open shifts.

Runtime note: 2.1 and 2.2 pass against the `dev` schema-only branch. The reviewed follow-up migration was applied to `dev` after its local filename was normalized to the InsForge CLI convention; configured POS fallback and wholesale-threshold consumer probes now return `12.3456` and `130`, while active-shift rates, existing sales, reservations, and open shifts remain unchanged. Phase 5 remains pending.

## Phase 3: Reports Frontend

- [x] 3.1 Update `src/features/sales/api/sales.ts`, `src/features/sales/ui/salesReportUtils.ts`, and `src/features/sales/ui/SalesReportWorkspace.tsx` for typed snapshots, scopes/timezone, exact 366-day validation, states, retry-last-valid-range, and no capped-detail KPIs.
- [x] 3.2 Create `src/features/sales/ui/ReportTrendChart.tsx` with dependency-free SVG/CSS, textual trend equivalent, mobile DOM order, and 44px controls.
- [x] 3.3 Update `src/features/sales/api/reportDashboard.test.ts`, `src/features/sales/api/sales.test.ts`, and `src/features/sales/ui/SalesReportWorkspace.test.tsx` for adapters, dates, aggregates, states, accessibility/recovery.

## Phase 4: Configuration/Consumers

- [x] 4.1 Update `src/features/configuration/api/configuration.ts` and `src/features/configuration/ui/ConfigurationWorkspace.tsx` for only three typed global settings, metadata/defaults/bounds, effective timing, validation, required states, and accessible responsive forms.
- [x] 4.2 Wire `src/features/events/api/reservations.ts`, `src/features/events/ui/EventReservationWorkspace.tsx`, `src/features/sales/ui/posUtils.ts`, `src/features/sales/api/posShifts.ts`, `src/features/sales/ui/SalesWorkspace.tsx`, and `src/features/sales/ui/PosShiftWorkspace.tsx` for capacity→allocation, fallback-only rate, and threshold-at/above wholesale; preserve existing allocation/open-shift behavior and explicit POS rates.
- [x] 4.3 Update `src/features/auth/api/adminAccess.ts`, `src/App.tsx`, and `src/app/AppShell.tsx` for capability-gated entries; never email prefixes/client-only scope.
- [x] 4.4 Add `src/features/configuration/api/configuration.test.ts`, `src/features/configuration/ui/ConfigurationWorkspace.test.tsx`, and focused POS/Event consumer/state tests.

## Phase 5: Verification and Scope Guard

- [x] 5.1 Run `bun run lint`, `bun run build`, focused suites; verify migration-before-consumer ordering.
- [x] 5.2 Confirm absence of inventory, purchasing, tax, stock, export, unsupported metrics, generic settings, client revenue, synthetic shifts, and unscoped backfills.
