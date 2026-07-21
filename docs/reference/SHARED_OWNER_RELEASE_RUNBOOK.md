# Shared-account owner release runbook

Production deploys of Tomato Farm are fenced by
`scripts/verify-shared-owner-release-gate.mjs`, the first step of the Pages
workflow. It reads `_account_data_owners/tomato_admin` from Firestore and
accepts it only if `readSharedAccountDataOwnerRegistry()` — the same function
the client uses — accepts it. There is no repository variable to set.

## Why the fence exists

The shared admin account and its `(guest)` alias are the same person, so exactly
one of the two physical namespaces must hold the private data. Which one is a
**server** decision recorded in the registry:

```json
{ "ownerId": "김_태우 | 김_태우(guest)", "version": 2, "status": "decided" }
```

`data/shared-account-owner.js` reads that document with `getDocFromServer` on
every cold start. If the record is missing **or fails validation** the client
throws `SHARED_DATA_OWNER_NOT_INITIALIZED`, and `app.js` answers with
`_showSharedOwnerRetryState()` — the loading overlay stays up and
`window.__tomatoAppReady` stays `false`.

So shipping the client before a valid record exists means **the app does not
boot for the shared account**. The browser deliberately has no fallback: letting
it pick a namespace is the data-splitting bug the registry was introduced to
end.

## Why the gate is a check, not an attestation

It was originally the repository variable `TOMATO_SHARED_OWNER_V2_READY`, set by
hand to assert that the migration had been done. That failed in both directions:

- Nobody set it, so every deploy from 2026-07-18 onward was blocked. Production
  sat 30 commits behind `main` for three days.
- It asserted nothing that had been checked. Meanwhile the registry held a **v1**
  record — `{ ownerId: "김_태우", version: 1, reason: "admin-private-data-present" }`
  with no `status` field. It existed, so the migration looked complete, but the
  client rejected it. Setting the variable would have shipped a build that could
  not boot.

A machine can read the document, so it should. The gate imports the client's
reader rather than restating its rules, so the two cannot drift apart.

## Prerequisites

Only needed when the gate reports a problem.

- Firebase CLI, authenticated against `exercise-management`.
- Application Default Credentials with Firestore access to that project
  (both scripts call `admin.initializeApp()` with no arguments).

## If the gate says the registry does not exist

No decision has been recorded yet.

1. **Preserve the current rules.** Firestore rules are console-managed and not
   tracked here. Export the live ruleset and keep the copy before editing.

2. **Deploy the v2 fence.** Publish rules that deny client reads and writes under
   both aliases while `_account_data_owners/tomato_admin` is absent:

   - `users/김_태우/**`
   - `users/김_태우(guest)/**`

   The fence is what makes step 3 safe: it stops an already-open browser from
   racing the decision and writing into the namespace that is about to lose.

3. **Decide the owner.** From `functions/`:

   ```bash
   npm run initialize:tomato-owner                                # dry run
   npm run initialize:tomato-owner -- --commit --rules-fenced-v2  # write
   ```

   The dry run is read-only and idempotent. The candidate is `김_태우` when that
   namespace already holds documents in any account collection, and
   `김_태우(guest)` when it is empty.

4. **Deploy Functions.**

   ```bash
   firebase deploy --only functions --project exercise-management
   ```

## If the gate says the registry exists but the client rejects it

The owner was already decided; the record is just in the older shape.
`initialize:tomato-owner` cannot fix this — it refuses to touch a document that
already exists, so the registry stays stuck. From `functions/`:

```bash
npm run promote:tomato-owner-v2               # dry run
npm run promote:tomato-owner-v2 -- --commit   # write
```

It adds `version: 2` and `status: "decided"` to the existing record and never
changes `ownerId`. If `ownerId` is not one of the two known namespaces it
refuses, because choosing a namespace is a human decision.

## After either path

Re-run the failed Pages workflow. No new commit is needed — the gate reads
Firestore at job start. From then on a push to `main` deploys on its own; the
gate only speaks up if the registry regresses.

## Verification

After the deploy, a cold load on the shared account should reach the app without
the retry overlay. If the overlay appears, re-run the gate script locally — it
prints the exact field values it found.
