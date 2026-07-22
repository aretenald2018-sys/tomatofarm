"use strict";

// Admin SDK 스크립트의 공통 진입 준비.
//
// admin.initializeApp() 은 자격증명이 없어도 그 자리에서 실패하지 않는다.
// 첫 Firestore 호출에서야 Google Auth 스택 트레이스가 튀어나오는데, 그것만
// 보고는 무엇을 해야 하는지 알 수 없다. 여기서 미리 확인하고 할 일을 적어 준다.

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

function readDefaultProjectId() {
  try {
    const firebaserc = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, ".firebaserc"), "utf8"),
    );
    return firebaserc?.projects?.default || "";
  } catch {
    return "";
  }
}

function readFlag(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? null : (argv[index + 1] ?? null);
}

function resolveProjectId(argv = []) {
  return readFlag(argv, "--project")
    || process.env.GOOGLE_CLOUD_PROJECT
    || process.env.GCLOUD_PROJECT
    || readDefaultProjectId();
}

function hasApplicationCredentials() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return true;
  const adcPath = process.platform === "win32"
    ? path.join(process.env.APPDATA || "", "gcloud", "application_default_credentials.json")
    : path.join(process.env.HOME || "", ".config", "gcloud", "application_default_credentials.json");
  return !!adcPath && fs.existsSync(adcPath);
}

function credentialSetupMessage(projectId) {
  return [
    "Firestore 자격증명을 찾지 못했습니다.",
    "",
    "서비스 계정 키로 설정하는 방법 (gcloud 설치 불필요):",
    `  1. Firebase 콘솔 → ${projectId || "<프로젝트>"} → 프로젝트 설정 → 서비스 계정`,
    "  2. '새 비공개 키 생성'으로 JSON 키를 내려받는다 (저장소 밖에 둘 것)",
    "  3. 그 경로를 GOOGLE_APPLICATION_CREDENTIALS 에 지정한 뒤 다시 실행한다",
    "",
    "  PowerShell:",
    '    $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\\경로\\service-account.json"',
    "",
    "  cmd:",
    '    set GOOGLE_APPLICATION_CREDENTIALS=C:\\경로\\service-account.json',
    "",
    "gcloud 가 있다면 대신: gcloud auth application-default login",
  ].join("\n");
}

// 스크립트가 첫 Firestore 호출에서 받는 인증 오류를 알아볼 수 있게 바꾼다.
function describeFirestoreError(error, projectId) {
  const message = String(error?.message || error);
  const code = String(error?.code || "");
  const looksLikeAuth = /credential|authenticat|unauthenticated|invalid_grant|could not load the default/i
    .test(message) || code === "UNAUTHENTICATED" || code === 16;
  const looksLikePermission = /permission|PERMISSION_DENIED/i.test(message) || code === 7;

  if (looksLikeAuth) return `${message}\n\n${credentialSetupMessage(projectId)}`;
  if (looksLikePermission) {
    return `${message}\n\n자격증명은 있으나 ${projectId} 의 Firestore 접근 권한이 없습니다.`
      + "\n서비스 계정에 Cloud Datastore 사용자 이상의 역할이 있는지 확인하세요.";
  }
  return message;
}

function initializeAdminApp(argv = []) {
  const admin = require("firebase-admin");
  const projectId = resolveProjectId(argv);

  if (!projectId) {
    throw new Error(
      "프로젝트를 결정하지 못했습니다. --project <id> 를 넘기거나 .firebaserc 를 확인하세요.",
    );
  }
  if (!hasApplicationCredentials()) {
    throw new Error(credentialSetupMessage(projectId));
  }

  admin.initializeApp({ projectId });
  return { admin, db: admin.firestore(), projectId };
}

module.exports = {
  credentialSetupMessage,
  describeFirestoreError,
  hasApplicationCredentials,
  initializeAdminApp,
  resolveProjectId,
};
