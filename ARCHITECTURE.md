# Tomato Farm Architecture

## Runtime shape

Tomato Farm is an unbundled ES-module application. The root is the source tree; `scripts/copy-www.js` produces the Capacitor web artifact.

```text
index.html / app.js
  -> app/                 static actions, tab registry, lazy loading, overlays, gestures
  -> auth/                login screen/actions and signup flows
  -> home/                home read models, life-zone, social UI
  -> social/              guild modal and picker controllers
  -> workout/             workout, running, Wear, program domains
  -> diet/                canonical meal and nutrition models
  -> calendar/            day/session models, sheet state, formatting, keyboard policy
  -> stats/               selectors, aggregates, series, summaries, fatigue, exports
  -> calc/                pure workout, volume, diet, social, and cycle calculations
  -> config/              movement catalog behind the root config facade
  -> ui/ + utils/         shared toast, action, date, text, identity, and build helpers
  -> data.js              public data facade
       -> data/           repositories, owner resolution, Firebase adapters
  -> runtime-assets.js    runtime/precache asset manifest
  -> sw.js                service worker and cache namespace
```

The directories above group the domains; they do not hold every module. Substantial feature and render logic still lives in flat root modules (`app.js`, `data.js`, `render-*.js`, `feature-*.js`, `calc.js`, `sw.js`, and peers). Treat the repository root itself as part of the source tree.

## Dependency direction

The supported direction is:

```text
view/controller -> domain model/service -> data.js -> data repository -> Firebase adapter
```

- A feature does not import the Firebase SDK or `data/data-core.js` directly.
- Cross-feature behavior uses an imported function or a named `CustomEvent` contract.
- Business actions are not exposed as `window.*`. Platform, PWA, Capacitor/Wear, and explicit debug bridges are the bounded exceptions enforced by architecture tests.

## Privilege boundary

Administrative privilege is an account, not a mode.

- `isAdmin()` is `getCurrentUser()?.id === '관_리자'` and reads nothing else. No client-held flag, stored mode, or session key may widen it.
- The admin account is created only by an Admin SDK script; the signup screen refuses its id and Firestore rules reject client writes to its `_accounts` document. Whoever can create that account holds the privilege, so that path stays server-side.
- Admin-only surfaces gate on `isAdmin()`. Ordinary accounts, including the personal one, are not a degraded admin — they are separate identities that happen to share a build.
- `getAccountList()` excludes the admin account so social, ranking, and guild surfaces filter once rather than per screen.

The full model, and the impersonation gap that remains until Firebase Auth exists, are in [docs/reference/ACCOUNT_MODEL.md](docs/reference/ACCOUNT_MODEL.md) and [docs/reference/FIRESTORE_RULES.md](docs/reference/FIRESTORE_RULES.md).

## Private data ownership

Authentication identity, public/social identity, and the physical private-data owner are separate concepts.

- A private path is `users/{resolvedOwner}/...` and is created only through the owner-aware data boundary.
- A shared alias may have exactly one durable physical owner. Owner selection must be server-decided, immutable for the release, and fail closed while unresolved. Only the personal account participates in that resolution; the admin account owns its own namespace outright.
- A missing owner is not permission to write an `_orphan` namespace or to choose an alias in the browser.
- Public profiles, friend lookup, and guild membership use explicit social APIs; they do not infer private storage ownership.
- Persisted workout and meal writes use domain payload builders and merge by default. Replacement requires an explicit, tested migration path.

See [docs/workout-data-lineage.md](docs/workout-data-lineage.md) and [docs/adr/2026-05-15-exercise-ssot.md](docs/adr/2026-05-15-exercise-ssot.md) for the stable domain decisions.

## DOM ownership

Each interactive root has one controller responsible for its render lifecycle and internal actions.

- Input value changes patch the mounted row and derived displays; they do not replace the active or next input during the same pointer gesture.
- Structural operations such as add/remove may rerender, after committing pending input state.
- Multiple mounted views of one model register with one render owner so every connected view is updated.
- Backdrop close logic checks the actual backdrop target. Inner controls do not depend on an event path that a sheet can stop.

Source-string tests are appropriate for dependency and markup bans. Buttons, input focus, modal routing, persistence, and service-worker updates require executable behavior tests.

## CSS and generated artifacts

- CSS ownership is declared in `scripts/generate-style-entry.mjs` and documented in [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).
- Root `style.css` is a generated, tracked WebView compatibility bundle. Edit its owner stylesheets, regenerate it, and verify byte equality with `--check`.
- `runtime-assets.js` is the canonical runtime asset list. `sw.js` and the Android artifact consume the same list.
- `firestore.rules` is the tracked source of the security ruleset and is declared in `firebase.json`. Rules are OR-combined, so the file carries no permissive catch-all and every collection the client touches needs an explicit rule; a coverage test enforces that. Nothing deploys rules automatically.
- `www/`, build metadata, and the downloadable APK are derived release artifacts. Verification must compare content, not merely file presence or a hand-written marker.
- A verify command must be read-only. Generation happens in an explicit build command.

## Life-zone transition boundary

The current life-zone still has legacy layout data split across runtime code and a validator-only manifest. Do not add another coordinate or asset registry. Any expansion that adds rooms, slots, actors, or NPCs must first establish one runtime-consumed scene contract and derive validation, precache, fallback, and preview data from it. The detailed gate is [docs/LIFE_ZONE_ASSETS.md](docs/LIFE_ZONE_ASSETS.md).

## Release boundary

Only the checkout currently holding local `main` integrates and deploys. Task worktrees produce reviewed commits. A release must verify the exact Git delta, repository boundary, generated assets, behavior tests, browser flows, and—when affected—Android/Wear artifacts before one push of `main`.
