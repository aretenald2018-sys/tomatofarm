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
// 기본값은 자격증명이 필요 없는 REST 읽기다. 릴리스 게이트가 CI 에서 쓰는 것과
// 같은 공개 경로이고, 이 앱은 Firebase Auth 를 쓰지 않아 클라이언트 읽기와
// 동등하다. 읽기가 규칙에 막히면 0 으로 세지 않고 판정을 중단한다.
//
//   npm --prefix functions run audit:legacy-alias
//   npm --prefix functions run audit:legacy-alias -- --admin-sdk   # 서비스 계정 키 사용
//
// 절차 전체는 docs/reference/SHARED_OWNER_RELEASE_RUNBOOK.md 의
// "레지스트리 폐기" 절을 따른다.

const admin = require("firebase-admin");
const { initializeAdminApp, describeFirestoreError } = require("./lib/admin-app");
const { countCollection, readDocument, readWebConfig } = require("./lib/firestore-rest");
const {
  TOMATO_ADMIN_OWNER_ID,
  TOMATO_ADMIN_GUEST_OWNER_ID,
  TOMATO_ACCOUNT_DATA_COLLECTIONS,
  TOMATO_DATA_OWNER_REGISTRY_COLLECTION,
  TOMATO_DATA_OWNER_REGISTRY_ID,
  readTomatoDataOwnerRegistry,
} = require("../dashboard/owner");

function describe(ownerId, counts) {
  const entries = Object.entries(counts.perCollection);
  if (!entries.length) return `  ${ownerId}: 비어 있음`;
  const lines = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, size]) => `      ${name}: ${size}`);
  return `  ${ownerId}: 문서 ${counts.total}개\n${lines.join("\n")}`;
}

// 두 읽기 경로를 같은 모양으로 감싼다. 판정 로직은 어느 쪽으로 읽었는지 몰라도 된다.
function createReader(argv) {
  if (argv.includes("--admin-sdk")) {
    const { db, projectId } = initializeAdminApp(argv);
    return {
      mode: "admin-sdk",
      projectId,
      async readRegistry() {
        try {
          const snapshot = await db
            .doc(`${TOMATO_DATA_OWNER_REGISTRY_COLLECTION}/${TOMATO_DATA_OWNER_REGISTRY_ID}`)
            .get();
          return snapshot.data() || null;
        } catch (error) {
          throw new Error(describeFirestoreError(error, projectId));
        }
      },
      async countCollection(ownerId, collectionName) {
        try {
          const snapshot = await db.collection(`users/${ownerId}/${collectionName}`).get();
          return snapshot.size;
        } catch (error) {
          throw new Error(describeFirestoreError(error, projectId));
        }
      },
    };
  }

  const config = readWebConfig();
  return {
    mode: "rest",
    projectId: config.projectId,
    readRegistry() {
      return readDocument(
        config,
        `${TOMATO_DATA_OWNER_REGISTRY_COLLECTION}/${TOMATO_DATA_OWNER_REGISTRY_ID}`,
      );
    },
    countCollection(ownerId, collectionName) {
      return countCollection(config, `users/${ownerId}/${collectionName}`);
    },
  };
}

async function countNamespaceWith(reader, ownerId) {
  const perCollection = {};
  let total = 0;
  const counts = await Promise.all(TOMATO_ACCOUNT_DATA_COLLECTIONS.map(
    async (collectionName) => [collectionName, await reader.countCollection(ownerId, collectionName)],
  ));
  for (const [collectionName, size] of counts) {
    if (size > 0) {
      perCollection[collectionName] = size;
      total += size;
    }
  }
  return { perCollection, total };
}

async function main() {
  const argv = process.argv.slice(2);
  const reader = createReader(argv);
  console.log(`[legacy-alias] project=${reader.projectId} mode=${reader.mode}\n`);

  const registryData = await reader.readRegistry();
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
    countNamespaceWith(reader, TOMATO_ADMIN_OWNER_ID),
    countNamespaceWith(reader, TOMATO_ADMIN_GUEST_OWNER_ID),
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
