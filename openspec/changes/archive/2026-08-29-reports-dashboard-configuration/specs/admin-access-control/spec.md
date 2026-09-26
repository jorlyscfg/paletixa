# Delta for Admin Access Control

## ADDED Requirements

### Requirement: Branch-Scoped Capability Enforcement

Report and configuration APIs MUST enforce the required capability and the caller's authorized branch scope on the server for every read and write. Client selectors, role labels, and email-derived identity MUST NOT widen scope. Design/tasks MUST resolve administrator all-branch versus selected/assigned-branch policy and the treatment of unscoped legacy data.

#### Scenario: Authorized scoped request

- GIVEN a verified, active user holds the required capability and requests an allowed branch scope
- WHEN the user calls a report or configuration operation
- THEN the backend SHALL return only data or settings within that scope

#### Scenario: Scope or capability denial

- GIVEN a request lacks the capability or targets a branch outside its authorized scope
- WHEN it calls the API directly or through the workspace
- THEN the backend MUST deny it without returning protected data or mutating state

## MODIFIED Requirements

### Requirement: Explicit Capability Authorization

Protected actions MUST use server capabilities and authorized branch scope, never client state or email prefixes. Report and configuration APIs MUST validate authorization on every direct request. Missing capability or scope MUST deny workspace and backend access without disclosing protected results.
(Previously: Protected actions used server capabilities, never client state or email prefixes; missing capability denied workspace and backend access.)

#### Scenario: Authorized action

- GIVEN an authenticated, verified, active user holds the action capability and permitted branch scope
- WHEN performing that action
- THEN the backend SHALL authorize the action only for that scope

#### Scenario: Missing capability

- GIVEN an authenticated, verified, active user lacks the action capability or permitted branch scope
- WHEN sending a direct backend request
- THEN the backend MUST deny it and MUST NOT disclose protected results
