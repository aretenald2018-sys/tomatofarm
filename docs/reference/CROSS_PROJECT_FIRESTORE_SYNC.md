# Tomato Farm / TomatoDev Firestore synchronization

Tomato Farm (`exercise-management`) and TomatoDev (`tomatodev-arete`) keep
separate authentication and Firestore security boundaries. Content is mirrored
by Cloud Functions in both projects, not by either browser client.

## What is mirrored

- User documents at `users/{ownerId}/{collection}/{document}`.
- One nested document level, used by running-route chunks.
- Shared content collections such as accounts, guilds, guestbook entries,
  comments, likes, letters, chat, patch notes, and tomato gifts.

Push tokens, notifications, API/OCR quotas, analytics, and mirror-control
documents are intentionally excluded. Mirroring notifications would otherwise
produce duplicate production push messages.

Each mirrored document carries a server-written `__tomatoSync` version. The
version is the Firestore event time plus the source project and event ID. This
makes retries idempotent, stops echo loops, and deterministically resolves
concurrent edits with last-event-wins. Deletes use server-only tombstones so a
delete is mirrored without being bounced back.

## Required one-time setup

1. Create a minimal service account in each Firebase project with Firestore
   read/write access to its own project only.
2. Store the *other* project's service-account JSON in each project's
   `TOMATO_SYNC_PEER_SERVICE_ACCOUNT` Firebase Functions secret. Never put
   either key in source code, a browser bundle, or GitHub Actions variables.
3. Deploy the three `syncTomato*` Functions to both projects.
4. Snapshot both databases, produce a dry-run diff, and explicitly choose the
   initial authority before copying existing documents. The live triggers only
   handle writes after they are deployed; they deliberately do not overwrite
   historical data by themselves.

For the first initialization, the expected authority is the operating
Moonjung Tomato personal-account data unless a reviewed diff identifies newer
development records that must win. Do not run an automatic bulk copy without
that review.

"Guest" no longer names a role — it survives only as the `김_태우(guest)` data
namespace, and which namespace holds the personal data is a server decision.
Resolve the owner before choosing an authority; see
[ACCOUNT_MODEL.md](ACCOUNT_MODEL.md) and
[SHARED_OWNER_RELEASE_RUNBOOK.md](SHARED_OWNER_RELEASE_RUNBOOK.md).
