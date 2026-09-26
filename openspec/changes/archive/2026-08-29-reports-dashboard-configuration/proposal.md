# Proposal: Reports Dashboard and Operational Configuration

## Intent

Make Reports an operational dashboard, not a sales-only client aggregation. The 100-row cap makes rankings incomplete, and implicit date boundaries make periods ambiguous. Surface trends and workload signals; move hardcoded POS rules into auditable settings.

## Scope

### In Scope
- Add a server snapshot: recognized sales, counts, average ticket, channels, daily series, and product aggregates.
- Add separate indicators for pending wholesale/events, event capacity/allocation, and POS shift status; never revenue.
- Add typed Event capacity, POS USD/MXN fallback rate, and POS wholesale threshold with validation, authorization, audit/idempotency, and effective-use semantics.
- Reorganize responsive UI; use dependency-free SVG/CSS charts.

### Out of Scope
- Inventory, purchasing, tax, stock, or unsupported metrics.
- Client-composed revenue, exports, extra settings, or generic untyped storage.
- Policy choices for timezone, branch, lifecycle, or setting scope; defer to design/specs.

## Capabilities

### New Capabilities
- `reports-dashboard`: Authorized, timezone-explicit aggregates, trends, rankings, and operational indicators.
- `operational-configuration`: Typed, scoped, audited settings for Event and POS workflows.

### Modified Capabilities
- `admin-access-control`: Report/configuration APIs MUST enforce capabilities and branch scope.

## Approach

Add versioned InsForge RPCs over canonical ledger. Aggregate by sale timestamp, exclude reversals, preserve recognized-sale semantics, and expose event date separately. Keep queues outside revenue. Use validated adapters and accessible SVG/CSS; preserve the event-capacity RPC. Design/specs resolve timezone, branch scope, queue selection, lifecycle semantics, setting scope, and storage ownership.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/features/sales`, `src/features/configuration` | Modified | Reports, chart, settings, and POS consumers. |
| `src/features/{wholesale,events}`, `src/app`, `src/features/auth` | Modified | Indicators, navigation, and authorization. |
| `migrations/`, tests | New/Modified | RPCs, RLS/audit, and coverage. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Incorrect or shifted metrics | High | Reuse ledger rules; specify timestamp, timezone, and lifecycle semantics. |
| Scope or settings leakage | High | Enforce capabilities/scope server-side; test direct RPC denial. |
| Operational or UI regression | Med | Add bounds, audit/idempotency, effective timing, compatibility, and responsive-state checks. |

## Rollback Plan

Disable new entry points and restore prior adapters. Revert additive RPC/UI changes without rewriting ledger data; retain event-setting compatibility.

## Dependencies

- Existing ledger, reversal, POS shift, wholesale/event schemas, InsForge capabilities/RLS, tooling, and design/spec decisions.

## Success Criteria

- [ ] Server aggregates exclude reversals and bypass the 100-row cap.
- [ ] Timezone, sale/event dates, branch, and lifecycle semantics have contract tests.
- [ ] Operational indicators cannot alter revenue; unsupported panels are absent.
- [ ] Three settings validate, persist idempotently with audit, and affect intended workflows.
- [ ] UI stays accessible/mobile-first and passes `bun run lint` and `bun run build`.
