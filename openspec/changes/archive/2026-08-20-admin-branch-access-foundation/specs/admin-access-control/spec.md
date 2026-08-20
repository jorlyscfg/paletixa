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

Protected actions MUST use server capabilities, never client state or email prefixes. Missing capability MUST deny workspace and backend access.

#### Scenario: Authorized action

- GIVEN an authenticated, verified, active user holds the action capability
- WHEN performing that action
- THEN the backend SHALL authorize the action

#### Scenario: Missing capability

- GIVEN an authenticated, verified, active user lacks the action capability
- WHEN sending a direct backend request
- THEN the backend MUST deny it and MUST NOT disclose protected results

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
