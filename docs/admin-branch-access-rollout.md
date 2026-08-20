# Roll out admin branch access without weakening production

The code and branch backend contracts are ready for review. Verification is
enabled on both backends and the dry-run contains only the expected schema, RLS,
RPC, and migration changes. Production was not mutated.

## Verification snapshot

| Check | Result |
|---|---|
| Source tests | `bun run test`: 3 files and 16 tests passed. |
| Lint | `bun run lint`: exit 0, no findings. |
| Build | `bun run build`: exit 0; TypeScript and Vite succeeded, 107 modules transformed. |
| Runtime | Vite on `127.0.0.1:41742`: HTTP 200, 620 bytes, root mount present; process stopped. |
| Impeccable | Mechanical detector returned `[]` for the app shell and admin/auth surfaces. |
| Branch readback | 8 foundation tables, 1 branch SELECT policy, 8 contract functions, 1 bootstrap receipt, 5 command receipts, and 2 branch rows. |
| RLS/RPC | All 8 tables have RLS; all 8 functions pin `search_path`; 3 predicates check trusted email; 0 operator functions are exposed to public/anon/authenticated. |
| Verification config | Branch and parent both report `requireEmailVerification:true`. |
| Merge dry-run | 18 additions: 8 tables, 1 policy, 8 functions, and 1 migration; 0 modifications, 0 conflicts, `applied:false`; no `auth.config` or verification change. |
| Production readback | `requireEmailVerification:true`; 0 foundation tables, 0 foundation functions, and 0 foundation policies. |
| Free-tier topology | Production plus exactly one reusable schema-only development branch. |

The destructive integration suite was not rerun. Its accepted bootstrap receipt and
fixed branch names make a fresh run fail without cleaning branch fixtures or
resetting the branch. Previous evidence remains current: 12 integration tests
passed against this branch, including unverified/inactive/capability denial,
direct RLS, RPC replay/conflict, bootstrap atomicity, and suspended-branch
contracts. This 12/12 evidence is bound to migration `20260814025511`, the sole
validation branch, and generation 6. No reset, fixture deletion, branch deletion,
backend merge, or second branch was authorized for this verification.

## Rollout checklist

1. Switch to `admin-branch-access-foundation-validation` and read metadata.
2. Require branch and parent `requireEmailVerification: true`.
3. Run all repeatable source checks and read-only RLS/RPC contract queries.
4. Run `npx -y @insforge/cli branch merge \
   admin-branch-access-foundation-validation --dry-run --json`.
5. Stop unless the dry-run has zero conflicts and no `auth.config` change.
6. Merge Git only through its normal review. A Git merge does not authorize any
   backend operation.
7. After Git merge, obtain a new explicit approval naming the backend branch and
   reviewed dry-run before running the real backend merge.
8. Read back production tables, policies, function grants, and auth metadata.
9. Deploy the frontend separately with production URL and anon key only.
10. Bootstrap the first administrator only after selecting a verified, active
   production account and recording a unique operator change reference.

Do not pass `--yes` to a real merge until the later approval names the branch and reviewed
dry-run. Do not copy validation users, branch rows, receipts, or secrets into
production; branch user-table data is not part of backend merge.

## Irreversible bootstrap and access changes

`bootstrap_first_admin` permanently consumes the singleton bootstrap receipt.
Revocation removes the role but never deletes or reopens that receipt. Use
`reassign_admin_access` to atomically move access from a current admin to a
verified, active replacement. A revoked original admin cannot be bootstrapped
again; restoration requires an explicitly authorized reassignment procedure.

Before bootstrap, verify target identity, trusted email verification, active
profile, and the change reference. If any value is uncertain, stop. Never call
bootstrap, revoke, or reassignment from browser code.

## Rollback

Prefer a forward compensating migration over destructive rollback:

Git and backend rollback are independent. Reverting Git does not revert a
successful backend merge, and a compensating backend migration does not roll
back the frontend. Obtain separate approval for each required action.

1. Revoke authenticated execution of `create_branch`, `set_branch_status`,
   `get_admin_context`, and `has_capability`.
2. Revoke authenticated SELECT on `public.branches` and remove the branch SELECT
   policy so protected reads and writes fail closed.
3. Disable the frontend admin entry or roll back its deployment.
4. Preserve `branches`, authorization mappings, bootstrap receipt, and command
   receipts for diagnosis and later controlled recovery.
5. Re-enable access only with a reviewed compensating migration and fresh
   production verification.

Do not drop tables, receipts, or user data as rollback. A failed transactional
backend merge rolls back automatically, but a successful merge needs the
compensating migration above.

## Reuse the single development branch

The free plan permits this project to operate with production plus one reusable
development branch. Do not create another branch. After an approved merge the
branch becomes dormant; reusing it requires `branch reset`, which rewinds branch
data to its original baseline. Reset and delete are destructive and require new
explicit authorization. Until then, leave the branch intact and keep the local
CLI context on production when validation work is finished.
