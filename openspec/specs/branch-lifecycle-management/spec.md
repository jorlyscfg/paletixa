# Branch Lifecycle Management Specification

## Purpose

Define authorized branch lifecycle management.

## Requirements

### Requirement: Authorized Branch Listing

A verified, active user with branch-management capability MUST list branches. The backend MUST enforce this directly.

#### Scenario: Authorized listing

- GIVEN a verified, active user has branch-management capability
- WHEN the user requests the branch list
- THEN the system SHALL return each branch's identity, name, and lifecycle status

#### Scenario: Listing is denied

- GIVEN a request is unauthenticated, expired, unverified, inactive, or lacks capability
- WHEN it requests the branch list directly or through the workspace
- THEN the backend MUST deny the request without returning branch data

### Requirement: Branch Creation and Identity

An authorized user MUST create a branch with unique identity, name, and initial `active` status. Accepted creation retries MUST NOT create duplicates.

#### Scenario: Create branch

- GIVEN an authorized administrator provides a valid name
- WHEN the administrator creates a branch
- THEN the system SHALL create one identifiable branch with that name and `active` status

#### Scenario: Creation retry

- GIVEN a previously accepted branch-creation request
- WHEN the same request is retried
- THEN the system MUST return the original outcome and MUST NOT create another branch

### Requirement: Branch Status Transitions and Availability

Only `active` and `suspended` are valid. An authorized administrator MUST activate or suspend a branch; repeating its status MUST succeed unchanged. A suspended branch MUST be unavailable to future branch-scoped operations until activated.

#### Scenario: Status transition

- GIVEN an authorized administrator selects an active branch
- WHEN the administrator suspends it and later activates it
- THEN the system SHALL set its status to `suspended` and then `active`

#### Scenario: Status retry

- GIVEN a branch already has the requested valid status
- WHEN an authorized administrator repeats that transition
- THEN the system MUST report success and preserve the branch identity and status

#### Scenario: Suspended branch

- GIVEN a branch has `suspended` status
- WHEN a future branch-scoped operation targets it
- THEN the system MUST reject that operation until the branch is activated
