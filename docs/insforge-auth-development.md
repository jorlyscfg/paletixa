# Confirm fictitious development accounts explicitly

Email verification stays enabled in development and production. A privileged
operator may explicitly confirm only an approved fictitious account on the sole
development branch. This is an administrative exception, not auto-verification.

## Current state

| Backend | `requireEmailVerification` | Observed signup behavior |
|---|---:|---|
| `paletixa` (production) | `true` | Verification remains required; no production signup was executed. |
| `admin-branch-access-foundation-validation` | `true` | Fictitious accounts require an explicit administrative confirmation. |

The development observation used one unique `@example.invalid` account. It did
not require a branch reset and did not mutate production.

## Guardrails

- Run only on `admin-branch-access-foundation-validation`; production use is
  prohibited.
- Accept only an exact account whose email ends in `.invalid`, or an exact email
  present in the maintainer-approved development allowlist.
- Require a change reference, operator identity, exact user UUID/email, reason,
  timestamp, and rollback owner in the audit record.
- Never include passwords, tokens, API keys, or admin keys in commands or audit
  evidence. Never expose this operation through browser code or an RPC.
- Stop unless `npx -y @insforge/cli current` names the validation branch and a
  read-only query returns exactly one unverified candidate.

## Confirmation procedure

1. Record the approved change reference and verify branch metadata reports
   `requireEmailVerification: true`.
2. Identify the exact account without changing it:

```bash
npx -y @insforge/cli current
npx -y @insforge/cli db query \
  "select id,email,email_verified from auth.users where id='<USER_UUID>' and lower(email)=lower('<EMAIL>') and (lower(email) ~ '@([a-z0-9-]+\\.)*invalid$' or lower(email)=any(array['<ALLOWLISTED_EMAIL>']));" --json
```

3. After a second operator checks the branch, account, allowlist, and change
   reference, run the administrative update. Replace every placeholder; the
   restrictive predicate must remain in the command.

```bash
npx -y @insforge/cli db query \
  "/* change_ref=<CHANGE_REF> dev-only fictitious confirmation */ update auth.users set email_verified=true where id='<USER_UUID>' and lower(email)=lower('<EMAIL>') and email_verified=false and (lower(email) ~ '@([a-z0-9-]+\\.)*invalid$' or lower(email)=any(array['<ALLOWLISTED_EMAIL>'])) returning id,email,email_verified;" --json
```

4. Require exactly one returned row with `email_verified: true`, then run a
   separate readback using the identification query. Attach both redacted CLI
   results to the audit record. A zero- or multi-row result is a failed change.
5. Confirm `has_capability`, `bootstrap_first_admin`, and
   `reassign_admin_access` still inspect the trusted verification field. Account
   confirmation alone grants no role or capability.

## Why verification must not be disabled

InsForge 2.3.1 was observed issuing a session with verification disabled while
both SDK `emailVerified` and trusted `auth.users.email_verified` remained
`false`. Disabling the requirement does **not** establish trusted verification,
weakens the environment guardrail, and creates an unsafe merge diff. Do not use
or recommend that path.

## Rollback an incorrect development confirmation

With separate approval and the same identity predicate, set `email_verified`
back to `false`, require one returned row, and attach the command/readback to the
same audit record. This immediately makes the account ineligible for protected
access because server predicates continue checking trusted verification.

```bash
npx -y @insforge/cli db query \
  "/* change_ref=<CHANGE_REF> rollback dev-only confirmation */ update auth.users set email_verified=false where id='<USER_UUID>' and lower(email)=lower('<EMAIL>') and email_verified=true and (lower(email) ~ '@([a-z0-9-]+\\.)*invalid$' or lower(email)=any(array['<ALLOWLISTED_EMAIL>'])) returning id,email,email_verified;" --json
```

Never perform confirmation or rollback on production. If CLI context cannot be
proven, stop and switch back to parent without issuing SQL.
