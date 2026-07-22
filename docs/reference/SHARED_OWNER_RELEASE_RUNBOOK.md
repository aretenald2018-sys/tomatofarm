# Shared-account owner release runbook

Production deploys of Tomato Farm are fenced by
`scripts/verify-shared-owner-release-gate.mjs`, the first step of the Pages
workflow. It reads `_account_data_owners/tomato_admin` from Firestore and
accepts it only if `readSharedAccountDataOwnerRegistry()` — the same function
the client uses — accepts it. There is no repository variable to set.

## Why the fence exists

`김_태우` and its `(guest)` alias are the same person, so exactly one of the two
physical namespaces must hold the private data. Which one is a **server**
decision recorded in the registry:

```json
{ "ownerId": "김_태우 | 김_태우(guest)", "version": 2, "status": "decided" }
```

`data/shared-account-owner.js` reads that document with `getDocFromServer` on
every cold start. If the record is missing **or fails validation** the client
throws `SHARED_DATA_OWNER_NOT_INITIALIZED`, and `app.js` answers with
`_showSharedOwnerRetryState()` — the loading overlay stays up and
`window.__tomatoAppReady` stays `false`.

So shipping the client before a valid record exists means **the app does not
boot for that account**. The browser deliberately has no fallback: letting it
pick a namespace is the data-splitting bug the registry was introduced to end.

The alias exists because admin and guest were once two modes of one account and
the guest mode wrote to its own namespace. That mode is gone — privilege now
lives in a separate `관_리자` account ([ACCOUNT_MODEL.md](ACCOUNT_MODEL.md)) — so
no **new** split can appear. The already-split history does not merge itself,
which is why this machinery stays until the audit below says otherwise.

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

After the deploy, a cold load on `김_태우` should reach the app without the retry
overlay. If the overlay appears, re-run the gate script locally — it prints the
exact field values it found.

## 레지스트리 폐기

이 기계장치 전체는 두 네임스페이스 중 어디에 데이터가 있는지 서버가 정해야
했기 때문에 존재한다. 사용되지 않는 쪽이 완전히 비면 정할 것이 없어지므로 전부
지울 수 있다.

### 폐기 조건 확인 (읽기 전용)

```bash
npm --prefix functions run audit:legacy-alias
```

자격증명이 필요 없다. 이 게이트가 CI에서 쓰는 것과 같은 공개 REST 경로로 읽는다.
서비스 계정 키로 읽으려면 `-- --admin-sdk`를 붙인다.

레지스트리 상태와 두 네임스페이스의 컬렉션별 문서 수를 출력하고, 결정된 소유자가
아닌 쪽이 비어 있으면 `✓ 폐기 가능`을 낸다. 아무것도 쓰지 않으며, 조건을
만족하지 못하면 exit code 1로 끝난다.

REST 경로는 보안 규칙을 통과해야 하므로, 읽기가 거부되면 0으로 세지 않고 판정을
중단한다. 거부를 "비어 있음"으로 오해하면 폐기가 곧 데이터 손실이 된다.

남은 문서가 있다면 먼저 처리한다. 결정된 소유자 쪽으로 옮기거나, 버릴 데이터임을
확인하고 지운다. **판정을 건너뛰고 폐기하면 그 문서들은 영구히 읽히지 않는다.**

#### 2026-07-22 실행 결과

```
ownerId=김_태우 version=2 status=decided
김_태우        : 문서 651개
김_태우(guest) : 비어 있음
✓ 폐기 가능
```

조건은 이미 충족돼 있다. 폐기를 계정 분리와 같은 릴리스에 묶지 않은 이유는
블라스트 반경 때문이다. 폐기는 앱 부팅의 fail-closed 소유자 해석을 걷어내는
작업이라, 잘못되면 앱이 아예 뜨지 않는다(2026-07-18 프로덕션 3일 정체가 그
사례다). 계정 분리가 프로덕션에서 안정된 것을 확인한 뒤 별도 릴리스로 진행한다.
진행 전에 위 명령을 다시 돌려 판정이 여전히 `✓`인지 확인한다.

### 조건을 만족했을 때 지울 것

한 커밋으로 묶어야 한다. 클라이언트가 레지스트리를 요구하는 동안 게이트만
없애면 부팅이 막히고, 반대 순서는 검증 없는 배포가 된다.

1. `data/shared-account-owner.js` — 파일 전체. `resolvePrivateDataOwnerId()`
   호출부는 `resolveDataOwnerId()` 직접 호출로 바꾼다.
2. `data/account-unification.js` — `PERSONAL_LEGACY_ALIAS_ID`,
   `normalizeSharedAccountDataOwnerId`, `readSharedAccountDataOwnerRegistry`,
   `selectSharedAccountDataOwner`, `getAccountOwnerAliases`,
   `SHARED_ACCOUNT_OWNER_*` 상수. `canonicalAccountOwnerId()`는 별칭 매핑이
   사라지면 항등 함수가 되므로 호출부와 함께 제거한다.
3. `app.js` — `_showSharedOwnerRetryState()`와 `isPersonalInstance(user.id) &&
   !getDataOwnerId()` 분기. 소유자가 늘 자기 id 이므로 미해결 상태가 없다.
4. `data/data-core.js` — `getCachedSharedAccountDataOwnerId`,
   `setSharedAccountDataOwnerId`, `SHARED_DATA_OWNER_UNRESOLVED` 분기.
5. `scripts/verify-shared-owner-release-gate.mjs` 와
   `.github/workflows/deploy.yml` 의 게이트 단계.
6. `functions/dashboard/owner.js` — 별칭 관련 export
   (`tomatoOwnerAliases`, `initializeTomatoDataOwnerId`,
   `adminTomatoNamespaceHasData`, `readTomatoDataOwnerRegistry`,
   `resolveTomatoDataOwnerId`). 소비자도 함께 고친다:
   `functions/dashboard/service.js` 는 `resolveTomatoDataOwnerId()` 대신 계정
   id 를 그대로 쓰고 `tomatoOwnerAliases()` 순회를 단일 소유자 조회로 바꾼다.
   `functions/index.js` 도 같다.
7. `functions/scripts/initialize-tomato-data-owner.js`,
   `functions/scripts/promote-tomato-data-owner-v2.js`,
   `functions/scripts/audit-legacy-alias-namespace.js` 와 각 npm 스크립트.
8. `firestore.rules` — `_account_data_owners` 규칙. `users/{ownerId}/**` 는 남는다.
9. 테스트 — `tests/account-unification.test.js` 의 레지스트리 항목,
   `tests/shared-owner-release-gate.test.js`,
   `tests/data-consistency-wiring.test.js` 의 소유자 해석 항목.
10. 이 문서와 [ACCOUNT_MODEL.md](ACCOUNT_MODEL.md) 의 관련 절.

마지막으로 Firestore 에서 `_account_data_owners/tomato_admin` 문서와 빈
`users/김_태우(guest)` 네임스페이스를 지운다.

### 폐기 후 확인

`김_태우` 계정으로 콜드 로드해서 식단·운동 기록이 그대로 보이는지, 다른 기기에서
같은 데이터가 보이는지 확인한다. 소유자 해석이 사라졌으므로 데이터 경로는
`users/김_태우/**` 하나뿐이다.
