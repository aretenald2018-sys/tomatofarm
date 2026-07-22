"use strict";

// 관리자 콘솔 계정을 만드는 유일한 경로.
//
// 클라이언트는 이 계정을 만들 수 없다. 가입 화면은 이 id 를 거부하고, Firestore
// rules 는 `_accounts/관_리자` 로의 클라이언트 쓰기를 막는다. 관리자 권한이
// 로그인한 계정 하나로 결정되는 이상, 그 계정을 누가 만들 수 있는지가 곧 권한
// 경계다.
//
//   npm run provision:admin-console -- --password "비밀번호"            # dry run
//   npm run provision:admin-console -- --password "비밀번호" --commit   # 실제 생성
//
// 비밀번호 재설정도 같은 스크립트로 한다:
//   npm run provision:admin-console -- --password "새비밀번호" --commit --reset-password
//
// 서비스 계정 키가 없을 때는 콘솔에 붙여넣을 문서를 대신 출력한다. 이쪽은
// Firestore 에 접속하지 않으므로 자격증명이 필요 없다:
//   npm run provision:admin-console -- --password "비밀번호" --print-document

const admin = require("firebase-admin");
const { initializeAdminApp, describeFirestoreError } = require("./lib/admin-app");

const ADMIN_CONSOLE_ACCOUNT_ID = "관_리자";
const ADMIN_CONSOLE_LAST_NAME = "관";
const ADMIN_CONSOLE_FIRST_NAME = "리자";
const ACCOUNTS_COLLECTION = "_accounts";
const MIN_PASSWORD_LENGTH = 10;

// data/data-auth.js 의 _simpleHash 와 같은 함수여야 한다. 클라이언트가 이 해시로
// 검증하므로 여기서 다른 방식으로 만들면 로그인이 불가능해진다.
function simpleHash(value) {
  let hash = 0;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    hash = ((hash << 5) - hash) + code;
    hash |= 0;
  }
  return "h_" + Math.abs(hash).toString(36);
}

function readPasswordArg(argv) {
  const flagIndex = argv.indexOf("--password");
  if (flagIndex === -1) return null;
  return argv[flagIndex + 1] ?? null;
}

function printConsoleDocument(password) {
  const fields = [
    ["id", "문자열", ADMIN_CONSOLE_ACCOUNT_ID],
    ["lastName", "문자열", ADMIN_CONSOLE_LAST_NAME],
    ["firstName", "문자열", ADMIN_CONSOLE_FIRST_NAME],
    ["nickname", "문자열", "관리자"],
    ["hasPassword", "부울", "true"],
    ["passwordHash", "문자열", simpleHash(password)],
    ["isAdminConsole", "부울", "true"],
    ["createdAt", "숫자", String(Date.now())],
  ];
  const width = Math.max(...fields.map(([name]) => name.length));

  console.log("Firebase 콘솔 → Firestore Database 에서 아래 문서를 만드세요.\n");
  console.log(`  컬렉션 ID : ${ACCOUNTS_COLLECTION}`);
  console.log(`  문서 ID   : ${ADMIN_CONSOLE_ACCOUNT_ID}   (자동 ID 아님, 그대로 입력)\n`);
  console.log("  필드:");
  for (const [name, type, value] of fields) {
    console.log(`    ${name.padEnd(width)}  ${type.padEnd(4)}  ${value}`);
  }
  console.log("\n  passwordHash 는 입력한 비밀번호에서 계산한 값입니다.");
  console.log("  비밀번호 자체는 어디에도 저장되지 않으니 따로 기억해 두세요.");
}

async function main() {
  const argv = process.argv.slice(2);
  const args = new Set(argv);
  const commit = args.has("--commit");
  const resetPassword = args.has("--reset-password");
  const password = readPasswordArg(argv);

  if (!password) {
    throw new Error("--password '<비밀번호>' is required");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`refusing a password shorter than ${MIN_PASSWORD_LENGTH} characters`);
  }

  // 자격증명 없이 쓸 수 있는 경로. 문서 하나를 손으로 만드는 편이 서비스 계정
  // 키를 발급받는 것보다 빠른 경우가 있고, 비밀번호는 이 PC 밖으로 나가지 않는다.
  if (args.has("--print-document")) {
    printConsoleDocument(password);
    return;
  }

  const { db, projectId } = initializeAdminApp(argv);
  console.log(`[admin-console] project=${projectId}`);

  const accountRef = db.doc(`${ACCOUNTS_COLLECTION}/${ADMIN_CONSOLE_ACCOUNT_ID}`);
  let existing;
  try {
    existing = await accountRef.get();
  } catch (error) {
    throw new Error(describeFirestoreError(error, projectId));
  }

  if (existing.exists && !resetPassword) {
    console.log(`[admin-console] account already exists id=${ADMIN_CONSOLE_ACCOUNT_ID}`);
    console.log("[admin-console] pass --reset-password to replace its password");
    return;
  }
  if (!existing.exists && resetPassword) {
    throw new Error("--reset-password given but the account does not exist yet");
  }

  const action = existing.exists ? "reset-password" : "create";
  if (!commit) {
    console.log(`[admin-console] dry-run action=${action} id=${ADMIN_CONSOLE_ACCOUNT_ID}`);
    console.log("[admin-console] no write performed; add --commit to apply");
    return;
  }

  const now = Date.now();
  const account = {
    id: ADMIN_CONSOLE_ACCOUNT_ID,
    lastName: ADMIN_CONSOLE_LAST_NAME,
    firstName: ADMIN_CONSOLE_FIRST_NAME,
    nickname: "관리자",
    hasPassword: true,
    passwordHash: simpleHash(password),
    // 운영 계정임을 문서 자체에 남긴다. 소셜 목록에서 걸러내는 판단은
    // 클라이언트가 id 로 하지만, 사람이 Firestore 를 열어봐도 알 수 있어야 한다.
    isAdminConsole: true,
    createdAt: existing.exists ? (existing.data().createdAt ?? now) : now,
    updatedAt: now,
  };

  try {
    await accountRef.set(account, { merge: true });
  } catch (error) {
    throw new Error(describeFirestoreError(error, projectId));
  }
  console.log(`[admin-console] committed action=${action} id=${ADMIN_CONSOLE_ACCOUNT_ID}`);
}

main()
  .catch((error) => {
    console.error(`[admin-console] ${error?.message || error}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all(admin.apps.map((app) => app.delete()));
  });
