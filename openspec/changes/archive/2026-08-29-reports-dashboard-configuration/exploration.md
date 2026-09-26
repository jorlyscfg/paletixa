## Exploration: Reports dashboard and operational configuration

### Current State
The admin shell already exposes separate `reports` and `configuration` modules. Reports is currently implemented inside the Sales feature and loads two capability-guarded InsForge RPCs in parallel: channel totals and up to 100 recent sale-detail rows. Both RPCs use `sales.created_at`, accept a maximum 366-day range, and exclude any sale with a `sale_reversals` row. The UI derives total sales, average ticket, channel comparison bars, and a top-five product list from those responses. Because product ranking is derived from the capped detail response, it is not a complete period aggregate.

The current report contract is sales-only: POS, wholesale, and event ledger sales. It does not expose a daily time series, branch filtering, shift performance, event-date metrics, wholesale/event operational queues, inventory, purchasing, tax, or stock availability. Pending wholesale orders and event reservations are operational facts, not recognized revenue, and must not be mixed into sales totals without an explicit metric contract.

Configuration currently owns only the singleton event cart-capacity value (`carts_per_day`, default `7`) through `get_event_configuration` and `set_event_capacity`. Other operational rules remain hardcoded, notably the POS USD/MXN fallback rate (`15`) and the POS wholesale threshold (`10`). The backend has capability checks and audit/idempotency patterns, but only the existing event setting has a durable configuration surface.

The system has an incumbent responsive dark/light operations UI, React/Vite/Tailwind, and no chart dependency. The public schema contains sales, POS shifts, wholesale order lifecycle/payment/audit data, event reservation lifecycle/payment/allocation data, products, branches, employees, and capabilities, but no inventory or purchasing model. Admin currently has `reports.view`; cashier access is branch-scoped through `pos.use`.

### Affected Areas
- `src/features/sales/ui/SalesReportWorkspace.tsx` — current date filter, KPI cards, channel comparison, capped-detail product ranking, and report loading/error states.
- `src/features/sales/api/sales.ts` and `src/features/sales/ui/salesReportUtils.ts` — report types, RPC adapters, range normalization, and client aggregation contracts.
- `src/features/configuration/ui/ConfigurationWorkspace.tsx` and `src/features/configuration/api/configuration.ts` — current event-only settings UI/API and compatibility with the existing event RPCs.
- `src/features/sales/api/posShifts.ts` and `src/features/sales/ui/posUtils.ts` — POS shift facts, USD/MXN fallback, and wholesale threshold currently used by checkout pricing.
- `src/features/wholesale/api/orders.ts`, `src/features/wholesale/api/types.ts`, and `src/features/wholesale/ui/WholesaleAdminWorkspace.tsx` — order statuses, payment state, completion/sale generation, cancellations, reversals, and pending operational counts.
- `src/features/events/api/reservations.ts`, `src/features/events/api/types.ts`, and `src/features/events/ui/EventReservationWorkspace.tsx` — event date, cart allocation, payment stages, completion, cancellation, and pending/reserved operational counts.
- `src/features/branches/api/branches.ts`, `src/features/branches/api/employees.ts`, `src/features/auth/api/adminAccess.ts`, and `src/app/AppShell.tsx` — branch scope, capability enforcement, module navigation, and report/configuration ownership.
- `migrations/20260820044844_create-sales-ledger.sql`, `migrations/20260820200000_add-sale-business-context.sql`, `migrations/20260820211001_add-sales-report-detail.sql`, `migrations/20260822041107_get-pos-daily-sales.sql`, and the wholesale/event migrations — existing ledger, report, POS, order, reservation, reversal, payment, and capacity semantics that a new aggregate contract must preserve.
- `src/features/sales/ui/SalesReportWorkspace.test.tsx`, `src/features/sales/api/sales.test.ts`, module contract tests, and `package.json` — test coverage and available Vitest/build/lint commands. `ConfigurationWorkspace` currently has no dedicated covering test.
- `src/index.css` and existing shared controls — incumbent visual tokens, responsive layout, accessibility, loading, and empty/error-state conventions. No chart library is installed; a dependency-free SVG/CSS visualization is the lower-risk default.

### Approaches
1. **Ledger-first reports with a server-side aggregate contract** — keep the existing Reports entry point, introduce a dashboard/overview layer, and add capability-guarded RPC output for complete daily/channel/product aggregates. Keep operational queue metrics separate from recognized revenue, define sale date versus event date explicitly, and render the first time series with SVG/CSS.
   - Pros: preserves the authoritative sales ledger and reversal rules; avoids client-side joins and the 100-row detail cap; centralizes branch/security/date semantics; no new chart dependency; incremental UI and migration risk.
   - Cons: cannot claim inventory, purchasing, tax, or stock KPIs until those domains exist; requires careful aggregate and timezone contracts.
   - Effort: Medium

2. **Client-composed cross-module dashboard** — call existing list/report APIs for Sales, POS, Wholesale, Events, Products, and Branches, then join and aggregate in React.
   - Pros: can expose several existing operational snapshots without immediately adding a backend RPC.
   - Cons: duplicates business rules, is affected by capped/filtered lists, risks counting pending or reversed activity as revenue, increases payload and loading complexity, and weakens branch/capability guarantees.
   - Effort: High

### Recommendation
Choose the ledger-first approach. Define a single versioned report snapshot contract in the backend for net recognized sales, transaction count, average ticket, channel split, daily series, and complete product aggregates. Filter by an explicit reporting timezone and sale timestamp; expose event date as a separate dimension rather than silently replacing sale date. Keep reversals excluded consistently and document whether cancelled, pending, completed, and regenerated wholesale/event records contribute to each metric.

Add a separate operational snapshot only for facts already modeled safely: pending wholesale orders, pending event reservations, event capacity/allocated carts, and POS shift status. Label these as operational workload/capacity, never revenue. Do not add inventory or purchasing panels because the schema cannot support truthful values.

Expand Configuration behind typed, capability-guarded server APIs. First surface event daily capacity, POS USD/MXN fallback rate, and POS wholesale threshold, preserving the existing event RPC behavior during migration. Give every setting an owner, scope (global versus branch), validation bounds, audit/idempotency behavior, and effective-use semantics before adding more keys. The proposal/design phase should decide whether a registry table is justified or whether domain-owned settings remain separate; a generic untyped key/value store would be unsafe.

### Risks
- Date-only UI values currently become UTC boundaries while display formatting uses the browser locale; without an explicit reporting timezone, day totals can shift across boundaries.
- The existing detail RPC caps at 100 sales, so continuing to derive top products or totals in the client would produce incomplete results.
- Reversal exclusion, wholesale sale generations, event completion, and cancellation semantics can cause double counting if the new aggregate does not reuse the ledger's canonical rules.
- Branch filtering is not present in the current admin report contract; adding it requires a deliberate authorization model rather than a client-only selector.
- `get_access_context()` currently returns an admin capability array that omits some capabilities present in the role table; do not use that array as the sole source for new authorization decisions without reconciling it.
- Configuration changes can alter POS pricing/currency behavior and event capacity immediately; bounds, audit history, and effective timing need product decisions.
- The absence of inventory/purchasing data makes those requested operational metrics unavailable without a separate domain change.
- A broad visual rewrite could disturb the incumbent responsive/accessibility conventions; preserve shared controls and validate mobile, keyboard, loading, empty, and error states.

### Ready for Proposal
Yes. The orchestrator should carry forward the ledger-first recommendation, explicit date/timezone and metric semantics, a separate operational snapshot, and the three initial typed settings. Proposal work should confirm branch scope, reporting timezone, whether operational queue cards are in the first slice, and whether configuration settings are global or branch-specific before implementation planning.
