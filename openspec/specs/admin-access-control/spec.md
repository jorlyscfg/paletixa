# Admin Access Control Specification

## Purpose

Define administrator access.

## Requirements

### Requirement: Verified Active Administrator Access

Administrator access MUST require valid session, verified email, active account, and capability. Other sessions MUST be unauthenticated.

#### Scenario: Eligible access

- GIVEN a user has a valid session, verified email, active account, and required capability
- WHEN requesting administrator access
- THEN the system SHALL grant access to the administrator workspace

#### Scenario: Invalid access state

- GIVEN a request has no or expired session, unverified email, or inactive account
- WHEN requesting administrator access
- THEN the system MUST deny access without exposing protected data

### Requirement: Explicit Capability Authorization

Protected actions MUST use server capabilities and authorized branch scope, never client state or email prefixes. Report and configuration APIs MUST validate authorization on every direct request. Missing capability or scope MUST deny workspace and backend access without disclosing protected results.

#### Scenario: Authorized action

- GIVEN an authenticated, verified, active user holds the action capability and permitted branch scope
- WHEN performing that action
- THEN the backend SHALL authorize the action only for that scope

#### Scenario: Missing capability

- GIVEN an authenticated, verified, active user lacks the action capability or permitted branch scope
- WHEN sending a direct backend request
- THEN the backend MUST deny it and MUST NOT disclose protected results

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

### Requirement: Controlled Privilege Assignment

Self-service assignment and email-derived privilege MUST be prohibited. First admin MUST use operator-controlled privileged bootstrap; no public path MAY elevate it.

#### Scenario: Escalation is denied

- GIVEN an authenticated user without an administrator capability
- WHEN the user attempts a client-accessible role or capability assignment
- THEN the system MUST deny the change and preserve existing privileges

#### Scenario: First administrator bootstrap

- GIVEN no administrator has yet been provisioned
- WHEN an authorized operator performs the privileged bootstrap procedure
- THEN the system SHALL grant the designated verified active account the configured administrator access
