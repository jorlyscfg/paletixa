# Design: Reports Dashboard and Operational Configuration

## Technical Approach

Keep the Vite SPA and add a versioned InsForge `report_dashboard_snapshot` RPC. SQL computes revenue and product/category aggregates from `sales` and `sale_items`, excludes `sale_reversals`, and returns workload separately; the dashboard never derives KPIs from capped `report_sales_detail`. Add typed global configuration operations; preserve Event signatures. No inventory/purchasing/tax/stock/export.

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Reporting contract | Accept inclusive ISO `from`/`to` and `timezone: 'America/Mexico_City'`; persist instants UTC. Reject missing, malformed, reversed, or over-366-day ranges. Return zero-filled days; count zero returns `averageTicketMxn: 0` and `averageState: 'no-data'`. | A server half-open interval prevents browser/DST drift and preserves the contract. |
| Lifecycle facts | A non-reversed ledger sale is revenue once; a reversed sale is excluded. Wholesale `pending|processing` is workload-only; `completed` contributes revenue only through its current non-reversed generation; `cancelled` is excluded; `deleted` is excluded from workload and reverses its sale. Completed→cancelled reverses revenue. Regeneration/replacement reverses the predecessor; only the latest non-reversed `wholesale_order_sales` generation counts. Event `pending` is workload-only; `reserved` is workload/allocation-only; `completed` creates one full-total sale and is revenue once; `cancelled` is excluded and releases allocation. Event `processing|deleted` are invalid, never inferred. POS shifts are status only. | Authoritative lifecycle history prevents double counting; every case requires integration tests. |
| Scope and legacy facts | Existing `reports.view` guards reports; current admins are all-branch because no admin assignment exists. Selectors permit `all` or an active branch ID, validated server-side; cashiers with only `pos.use` are denied. Branch totals/shifts match `branch_id`. Null legacy/admin-created wholesale/Event sales are `global/unassigned`, all-branch/global only, never selected-branch revenue. Global wholesale workload and Event workload/capacity/allocation stay labeled global for every selection. No synthetic legacy shift. | Prevents widening while preserving global Event visibility. |
| Configuration and authorization | Add admin `configuration.manage` for only new `get_operational_configuration`/`set_operational_configuration`. `report_dashboard_snapshot` and legacy report RPCs use `reports.view`; no workflow-read capability exists. Global only; config rejects selectors. Defaults: 7 carts, 15 rate, 10 quantity. Bounds: capacity/threshold 1–10,000; rate 0.01–10,000, four decimals. Existing allocations/open-shift rates stay; new workflows resolve values and explicit POS rates win. Legacy Event getter/setter retain `events.manage` signatures; RLS denies base-table access and EXECUTE grants only RPCs. | Additive operations avoid changing workflow permissions, unsafe key/value storage, or branch precedence. |
| Ownership and mutation | A domain singleton has `owner_id UUID NOT NULL`; migration backfills `updated_by` or a verified active admin, aborting if neither exists. Therefore `EffectiveSetting.ownerId` is non-null. Setters lock, hash, receipt, and atomically audit actor/scope/before/after/time; same payload replays, changed payload conflicts. Direct DML is revoked. | This guarantees accountability, including defaults. |

## Data Flow

```text
dates + permitted scope → snapshot RPC → UTC/Mexico aggregates + global operations → typed adapter → dashboard
config form → typed config RPC → singleton + audit/idempotency → Event/POS consumers
```

Invalid dates show validation and preserve the last valid snapshot; unauthorized selectors do likewise without data. Retryable report errors retry the last valid range; initial errors show error. Reports expose loading, authorized-empty zero/no-data, or unauthorized-without-data. Configuration exposes loading, default/unconfigured, retryable-error, validation, or unauthorized-without-values. Announce results/scope/timezone via live regions/focus. Incumbent `ops-*` stacks mobile-first; targets are 44px, DOM order stays keyboard-safe, and SVG has a textual trend.

## File Changes

| File | Action | Description |
|---|---|---|
| `migrations/20260829000000_reports-dashboard-configuration.sql` | Create | Snapshot/config RPCs, typed settings, owner backfill, bounds, consumers, capability, RLS, audit. |
| `src/features/sales/api/sales.ts`, `SalesReportWorkspace.tsx`, `salesReportUtils.ts` | Modify | Snapshot adapter, date/scope states, rankings, retries. |
| `src/features/sales/ui/ReportTrendChart.tsx` | Create | Accessible SVG plus textual trend. |
| `src/features/configuration/{api/configuration.ts,ui/ConfigurationWorkspace.tsx}`, POS/auth consumers | Modify | Three settings, metadata, validation, consumers, capability. |
| `src/features/sales/api/reportDashboard.test.ts`, configuration tests, `tests/integration/reports-dashboard-configuration.contract.test.ts` | Create/modify | Lifecycle, >100 rows, dates, scope/RLS, states, bounds, audit. |

## Interfaces / Contracts

```ts
type ReportSnapshot = { from: string; to: string; timezone: 'America/Mexico_City'; scope: Scope; sales: { totalMxn: number; count: number; averageTicketMxn: number; averageState: 'value'|'no-data'; channels: ChannelTotal[]; daily: DailyPoint[]; products: ProductAggregate[] }; operations: OperationsSnapshot }
type EffectiveSetting<T> = { key: string; type: 'integer'|'rate'; value: T; scope: 'global'; ownerId: string; state: 'configured'|'compatibility-default'; effectiveAt: string|null }
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit/UI | Range/zero semantics, adapters, bounds, loading/error/unauthorized/default states, trend text, responsive order | Existing Vitest/Testing Library. |
| Integration | Every lifecycle above, UTC/Mexico boundary, 366-day and >100 rows, global/unassigned scope, selector/RLS denial, owner/effective consumers, audit retries | InsForge contracts; `bun run test:integration`. |
| E2E | Not available | Components/contracts; lint/build. |

## Threat Matrix

N/A — no routing, shell commands, subprocesses, VCS/PR automation, executable classification, or process-integration boundary changes.

## Migration / Rollout

Run the additive migration/grants and owner backfill before frontend rollout; do not rewrite ledger or backfill unscoped facts. Keep old Event RPC signatures compatible. Roll back by hiding new UI and reverting adapters, retaining audit/config history.

## Open Questions

- None.
