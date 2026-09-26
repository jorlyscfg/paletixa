# Reports Dashboard Specification

## Purpose

Show recognized sales and separately labeled operational workload.

## Requirements

### Requirement: Canonical Recognized Sales

The dashboard MUST derive all sales metrics from canonical ledger sales. Each non-reversed sale MUST count once; pending/cancelled wholesale/Event records MUST NOT add revenue. Completed and regenerated lifecycle rules MUST be documented and tested before implementation.

#### Scenario: Recognized and reversed sales

- GIVEN POS, wholesale, and Event ledger sales plus pending, cancelled, and reversed records
- WHEN a snapshot is generated
- THEN only non-reversed ledger sales count once, and pending/cancelled records add no revenue
- AND completed/regenerated records follow the documented mapping, not client inference

### Requirement: Explicit Reporting Dates

The snapshot MUST accept a calendar range and explicit reporting timezone. Sale timestamp controls inclusion and daily grouping; Event date remains separate. Design/tasks MUST resolve timezone default/selection, branch boundaries, and legacy unscoped rows; the applied timezone MUST be visible.

#### Scenario: Sale date differs from Event date

- GIVEN an Event sale's timestamp and Event date fall on different days
- WHEN a range and timezone are applied
- THEN inclusion/grouping use the localized sale timestamp
- AND Event date remains separate context

#### Scenario: Invalid range

- GIVEN a missing, invalid, reversed, or over-limit range
- WHEN the user requests the report
- THEN validation feedback appears and no ambiguous snapshot replaces valid results

### Requirement: Complete Aggregate Snapshot

The server MUST return total MXN, recognized count, average ticket, channel totals/counts, a daily series including zero days, and complete product/category line aggregates. Results MUST NOT depend on the existing 100-row detail limit.

#### Scenario: More than one hundred sales

- GIVEN more than 100 recognized sales and product lines in the range
- WHEN the snapshot is generated
- THEN totals, channels, daily points, and product aggregates cover the full range
- AND average is total divided by count, with explicit zero/no-data when count is zero

#### Scenario: Empty period

- GIVEN a valid range with no recognized sales
- WHEN the snapshot loads successfully
- THEN zero/no-data aggregates and zero-filled days appear as an empty state, not an error

### Requirement: Separate Operational Indicators

The dashboard MUST separately show pending wholesale/Event workload, Event capacity/allocation, and POS shift status. Design/tasks MUST define queue states, including processing/reserved; cancelled records MUST NOT be pending. These indicators MUST NOT alter sales results.

#### Scenario: Workload is not revenue

- GIVEN workflow states, Event allocation, and POS shift facts
- WHEN the operational snapshot is shown
- THEN each value is labeled workload, capacity, allocation, or status
- AND changing them cannot change recognized-sales aggregates

### Requirement: Authorized Branch Scope

The dashboard MUST show only data in the caller's server-authorized scope. Any selector MUST list only permitted scopes; design/tasks MUST resolve administrator all/selected/assigned branches and unscoped legacy sales.

#### Scenario: Out-of-scope branch

- GIVEN a caller may view one branch
- WHEN another branch is requested directly or through a selector
- THEN the request MUST be denied or return no protected data

### Requirement: Visible States and Accessibility

The surface MUST show loading, retryable errors, invalid-date feedback, authorized empty, and unauthorized states without protected data. It MUST reflow mobile-first, preserve keyboard/assistive-technology order, provide a textual trend equivalent, and keep controls touch-usable.

#### Scenario: Responsive failure recovery

- GIVEN a narrow viewport or failed snapshot request
- WHEN the user navigates or retries
- THEN content remains readable, feedback is announced, and retry uses the last valid range

### Requirement: Bounded Product Scope

The dashboard MUST NOT display inventory, purchasing, tax, stock, export, or other unsupported metrics or inferred placeholders.

#### Scenario: Unsupported metric request

- GIVEN underlying domains lack inventory or purchasing facts
- WHEN the dashboard renders
- THEN those panels and unsupported values are absent
