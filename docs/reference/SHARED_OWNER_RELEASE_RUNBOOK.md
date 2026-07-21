# Shared-account owner release runbook

Production deploys of Tomato Farm are fenced by
`scripts/verify-shared-owner-release-gate.mjs`, the first step of the Pages
workflow. It passes only when the GitHub repository **variable**
`TOMATO_SHARED_OWNER_V2_READY` equals `decided-v2-rules-fenced`. While the
variable is unset the job fails at that step, every later step is skipped, and
pushing to `main` advances the branch without updating the live site.

## Why the fence exists

The shared admin account and its `(guest)` alias are the same person, so exactly
one of the two physical namespaces must hold the private data. Which one is a
**server** decision recorded in `_account_data_owners/tomato_admin`:

```json
{ "ownerId": "김_태우 | 김_태우(guest)", "version": 2, "status": "decided" }
```

`data/shared-account-owner.js` reads that document with `getDocFromServer` on
every cold start. If it is missing the client throws
`SHARED_DATA_OWNER_NOT_INITIALIZED`, and `app.js` answers with
`_showSharedOwnerRetryState()` — the loading overlay stays up and
`window.__tomatoAppReady` stays `false`.

So shipping the client before the registry exists means **the app does not boot
for the shared account**. The browser deliberately has no fallback: letting it
pick a namespace is the data-splitting bug the registry was introduced to end.
Removing the gate step is therefore not a shortcut, it is the failure.

## Prerequisites

- Firebase CLI, authenticated against `exercise-management`.
- Application Default Credentials with Firestore access to that project
  (the initializer calls `admin.initializeApp()` with no arguments).
- Repository admin rights, to set an Actions variable.

## Procedure

1. **Preserve the current rules.** Firestore rules are not tracked in this
   repository; they are console-managed. Export the live ruleset and keep the
   copy before editing anything.

2. **Deploy the v2 fence.** Publish rules that deny client reads and writes
   under both aliases while `_account_data_owners/tomato_admin` is absent:

   - `users/김_태우/**`
   - `users/김_태우(guest)/**`

   The fence is what makes step 3 safe: it stops an already-open browser from
   racing the decision and writing into the namespace that is about to lose.

3. **Decide the owner.** From `functions/`:

   ```bash
   npm run initialize:tomato-owner                                # dry run
   npm run initialize:tomato-owner -- --commit --rules-fenced-v2  # write
   ```

   The dry run is read-only and idempotent — run it freely. It prints
   `already decided owner=…` when the registry exists (in which case this step
   is done), otherwise `dry-run candidate=…`. The candidate is `김_태우` when
   that namespace already holds documents in any account collection, and
   `김_태우(guest)` when it is empty. The write refuses to run without
   `--rules-fenced-v2`, refuses to replace a partial record, and re-checks the
   registry inside a transaction.

4. **Deploy Functions.**

   ```bash
   firebase deploy --only functions --project exercise-management
   ```

5. **Open the gate.** Set the repository variable
   `TOMATO_SHARED_OWNER_V2_READY` to `decided-v2-rules-fenced`, then re-run the
   failed Pages workflow. No new commit is needed; the gate reads the variable
   at job start.

## Verification

After the deploy, a cold load on the shared account should reach the app
without the retry overlay. If the overlay appears, the registry is missing or
malformed — re-run the step 3 dry run rather than editing the client.

Do not set the variable to unblock a deploy before steps 1–4 are done. It is an
attestation that they were, and nothing in CI can verify it.
