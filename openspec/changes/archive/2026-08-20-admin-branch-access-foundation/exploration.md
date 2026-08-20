## Exploration: Admin branch access foundation

### Current State
The repository is a minimal Vite React SPA: `App.tsx` renders only a foundation screen, with no routing, InsForge SDK, product domain, or test runner. The linked InsForge project has email/password authentication available (email verification required) but no application tables, RLS policies, storage, functions, or realtime channels. The PRD’s migration order begins with authentication, roles, configuration, and branches; it requires server-side authorization and explicit roles/capabilities, while the product is single-client and multi-branch.

### Affected Areas
- `src/App.tsx` — would become the authenticated entry point and protected administrator workspace.
- `src/main.tsx` — would compose any application-level session/provider boundary.
- `src/` (new auth and branch feature modules) — would contain the InsForge client, session state, access checks, and branch UI.
- `package.json` — would add the InsForge SDK; a test runner is not required for this slice.
- `migrations/` (new) — would define application identities, role/capability assignments, branches, and RLS through a migration rather than ad-hoc SQL.

### Approaches
1. **Authentication-only landing** — implement sign-in, expiry handling, and role-based redirect, with no branch data.
   - Pros: Smallest UI and schema footprint; validates InsForge authentication early.
   - Cons: Leaves no useful operational capability after sign-in and defers the multi-branch foundation required by every stock and POS flow.
   - Effort: Low

2. **Admin branch access foundation** — an active administrator signs in to a protected workspace and can list, create, activate, or suspend branches; authorization is enforced by explicit server-side role/capability data and RLS.
   - Pros: Produces the first usable product capability; establishes the single-client/multi-branch boundary needed by later catalog, units, and POS slices; validates the authentication-to-authorization path without money or inventory mutations.
   - Cons: Requires a careful bootstrap path for the first administrator and a small authorization schema before more visible modules exist.
   - Effort: Medium

3. **Full identity and configuration phase** — build authentication, all minimum roles, user administration, company settings, modules, and branch management together.
   - Pros: Completes PRD phase 1 in one pass.
   - Cons: Combines unrelated decisions, exceeds the 400-line review budget, and delays validation of the first vertical flow.
   - Effort: High

### Recommendation
Choose **`admin-branch-access-foundation`**: deliver only an administrator’s authenticated, authorized branch-management workspace. Model one application tenant implicitly (no company/tenant table), but make branches first-class and scope future operational records to them. Store explicit role/capability assignments server-side, seed only the administrator access needed for branch management, and enforce active-account and capability checks through RLS/server-side database helpers—not editable client state or email prefixes.

Clear limits: do not build cashier or customer flows, user administration, company settings, configurable modules, catalog, daily quantities, POS, payments, public portals, audit history, or notifications. Do not introduce a company/multi-tenant model. Do not require a test framework merely to begin this non-monetary slice; the later units/money slice MUST add integration-test capability before implementation, as required by the PRD. The implementation should be planned as reviewable work units and auto-chained if the concrete forecast exceeds 400 changed lines.

### Risks
- The first-admin bootstrap must be explicit and safe; relying on open sign-up would allow unauthorized administrator creation.
- RLS policies need an authorization lookup that avoids recursion and prevents clients from assigning their own role or branch access.
- Email verification is enabled in InsForge, so the sign-in and provisioning flow must account for unverified or inactive accounts.
- Branch suspension semantics must be decided before later branch-scoped operations exist, so suspended branches cannot be used accidentally.

### Ready for Proposal
Yes — propose `admin-branch-access-foundation` as a bounded Phase 1 slice: secure administrator entry plus branch lifecycle management, with explicit RBAC/RLS and no transactional sales or inventory behavior.
