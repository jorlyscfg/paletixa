# Operational Configuration Specification

## Purpose

Define the small, typed, scoped, auditable settings that control Event and POS workflows.

## Requirements

### Requirement: Initial Typed Settings

The first configuration surface MUST expose only these named settings: Event daily capacity (positive integer cart units, compatibility default 7), POS USD/MXN fallback rate (positive finite rate, compatibility default 15), and POS wholesale threshold (positive integer quantity, compatibility default 10). No generic or untyped setting MAY be added in this change.

#### Scenario: Effective typed values

- GIVEN an authorized configuration owner reads the settings
- WHEN values are present or absent
- THEN each value is returned with its type, scope, owner, and effective state, using its compatibility default only when no value is effective

### Requirement: Validation and Effective Use

The system MUST reject wrong-type, non-finite, non-positive, or otherwise out-of-bounds values without changing the setting or audit history. When effective, capacity MUST govern Event availability/allocation, the fallback rate MUST be used only when POS has no explicit rate, and the threshold MUST select wholesale pricing at or above its value when available. Design/tasks MUST resolve maximum bounds, precedence, activation timing, and behavior of existing reservations/shifts.

#### Scenario: Invalid mutation

- GIVEN a setting value is malformed, non-positive, or outside the chosen bounds
- WHEN an authorized user saves it
- THEN the system MUST return a validation error and preserve the prior effective value and audit state

#### Scenario: Workflow consumption

- GIVEN each setting has an effective value
- WHEN Event availability or POS pricing/currency handling runs
- THEN the corresponding workflow uses that value and no hardcoded compatibility constant silently overrides it

### Requirement: Owner, Scope, Audit, and Idempotency

Every setting MUST have an accountable owner and explicit global-or-branch scope. The global-versus-branch policy, storage ownership, and precedence MUST be resolved in design/tasks; clients MUST NOT infer them. An accepted mutation MUST atomically persist the effective value and an audit record containing actor, scope, before/after values, timestamp, and request identity. Retrying the same request/payload MUST replay one outcome; a changed payload with the same request identity MUST fail without mutation.

#### Scenario: Audited retry

- GIVEN an authorized owner submits a valid setting change with a request identity
- WHEN the same request is repeated
- THEN the system returns the original outcome with one effective change and one audit event

#### Scenario: Scope denial

- GIVEN a caller lacks the setting capability or branch scope
- WHEN the caller reads or writes the setting directly
- THEN the backend MUST deny the operation without revealing protected values or creating an audit event

### Requirement: Configuration States and Accessibility

The configuration surface MUST show loading, unconfigured/default, validation, retryable error, and unauthorized states. Forms MUST identify the setting, unit, scope, effective timing, and validation error accessibly, reflow on small screens, and remain keyboard and touch usable.

#### Scenario: Unavailable configuration

- GIVEN configuration loading fails or no explicit value exists
- WHEN the workspace renders
- THEN it shows a clear retryable error or compatibility default state, never a blank or misleading value
