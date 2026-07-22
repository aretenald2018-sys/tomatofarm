"use strict";

// owner registry 를 폐기해도 되는지 판정하는 읽기 전용 감사.
//
// 레지스트리·배포 게이트·승격 스크립트·클라이언트 fail-closed 부팅은 전부
// "김_태우 의 개인 데이터가 두 네임스페이스 중 어디에 있는가"를 서버가 정해야
// 했기 때문에 존재한다. 계정을 분리한 뒤로 새 분기가 생길 원인은 사라졌지만,
// 이미 갈라진 과거 데이터가 저절로 합쳐지지는 않는다.
//
// 폐기해도 되는 조건은 하나다: **소유자로 결정되지 않은 쪽 네임스페이스가
// 완전히 비어 있을 것.** 이 스크립트는 두 네임스페이스의 문서 수를 컬렉션별로
// 세어 그 조건을 판정한다. 아무것도 쓰지 않는다.
//
//   npm --prefix functions run audit:legacy-alias
//
// 절차 전체는 docs/reference/SHARED_OWNER_RELEASE_RUNBOOK.md 의
// "레지스트리 폐기" 절을 따른다.

const admin = require("firebase-admin");
const {
  TOMATO_ADMIN_OWNER_ID,
  TOMATO_ADMIN_GUEST_OWNER_ID,
  TOMATO_ACCOUNT_DATA_COLLECTIONS,
  TOMATO_DATA_OWNER_REGISTRY_COLLECTION,
  TOMATO_DATA_OWNER_REGISTRY_ID,
  readTomatoDataOwnerRegistry,
} = require("../dashboard/owner");

// 문서 수를 정확히 세되, 한 컬렉션이 비정상적으로 크면 거기서 멈춘다. 판정에
// 필요한 것은 "0인가 아닌가"이지 정확한 총합이 아니다.
const COUNT_LIMIT = 500;

async function countNamespace(db, ownerId) {
  const perCollection = {};
  let total = 0;
  await Promise.all(TOMATO_ACCOUNT_DATA_COLLECTIONS.map(async (collectionName) => {
    const snapshot = await db
      .collection(`users/${ownerId}/${collectionName}`)
      .limit(COUNT_LIMIT)
      .get();
    if (snapshot.size > 0) {
      perCollection[collectionName] = snapshot.size === COUNT_LIMIT
        ? `${COUNT_LIMIT}+`
        : snapshot.size;
      total += snapshot.size;
    }
  }));
  return { perCollection, total };
}

function describe(ownerId, counts) {
  const entries = Object.entries(counts.perCollection);
  if (!entries.length) return `  ${ownerId}: 비어 있음`;
  const lines = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, size]) => `      ${name}: ${size}`);
  return `  ${ownerId}: 문서 ${counts.total}개\n${lines.join("\n")}`;
}

async function main() {
  admin.initializeApp();
  const db = admin.firestore();

  const registrySnapshot = await db
    .doc(`${TOMATO_DATA_OWNER_REGISTRY_COLLECTION}/${TOMATO_DATA_OWNER_REGISTRY_ID}`)
    .get();
  const registryData = registrySnapshot.data() || null;
  const decidedOwnerId = readTomatoDataOwnerRegistry(registryData);

  console.log("[legacy-alias] 레지스트리");
  if (!registryData) {
    console.log("  기록 없음 — 소유자가 아직 결정되지 않았다");
  } else {
    console.log(`  ownerId=${registryData.ownerId ?? "(없음)"}`
      + ` version=${registryData.version ?? "(없음)"}`
      + ` status=${registryData.status ?? "(없음)"}`);
    console.log(`  클라이언트 판정: ${decidedOwnerId || "거부됨 (v2/decided 아님)"}`);
  }

  const [ownerCounts, aliasCounts] = await Promise.all([
    countNamespace(db, TOMATO_ADMIN_OWNER_ID),
    countNamespace(db, TOMATO_ADMIN_GUEST_OWNER_ID),
  ]);

  console.log("\n[legacy-alias] 네임스페이스");
  console.log(describe(TOMATO_ADMIN_OWNER_ID, ownerCounts));
  console.log(describe(TOMATO_ADMIN_GUEST_OWNER_ID, aliasCounts));

  console.log("\n[legacy-alias] 판정");
  if (!decidedOwnerId) {
    console.log("  ✗ 폐기 불가 — 유효한 소유자 결정이 없다.");
    console.log("    먼저 SHARED_OWNER_RELEASE_RUNBOOK.md 로 레지스트리를 정상화한다.");
    process.exitCode = 1;
    return;
  }

  const staleOwnerId = decidedOwnerId === TOMATO_ADMIN_OWNER_ID
    ? TOMATO_ADMIN_GUEST_OWNER_ID
    : TOMATO_ADMIN_OWNER_ID;
  const staleCounts = staleOwnerId === TOMATO_ADMIN_OWNER_ID ? ownerCounts : aliasCounts;

  console.log(`  결정된 소유자: ${decidedOwnerId}`);
  console.log(`  비어 있어야 하는 쪽: ${staleOwnerId}`);

  if (staleCounts.total === 0) {
    console.log("  ✓ 폐기 가능 — 사용되지 않는 네임스페이스가 비어 있다.");
    console.log("    SHARED_OWNER_RELEASE_RUNBOOK.md 의 '레지스트리 폐기' 절을 따른다.");
    return;
  }

  console.log(`  ✗ 폐기 불가 — ${staleOwnerId} 에 문서 ${staleCounts.total}개가 남아 있다.`);
  console.log("    지금 폐기하면 그 문서들이 영구히 읽히지 않는다.");
  console.log("    먼저 결정된 소유자 쪽으로 옮기거나, 버릴 데이터임을 확인하고 지운다.");
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(`[legacy-alias] ${error?.message || error}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all(admin.apps.map((app) => app.delete()));
  });
