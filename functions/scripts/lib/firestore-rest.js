"use strict";

// 자격증명 없이 Firestore 를 읽는 경로.
//
// scripts/verify-shared-owner-release-gate.mjs 가 CI 에서 이미 같은 일을 한다.
// config.js 의 웹 API 키는 모든 브라우저에 실려 나가는 공개 값이고, 이 앱은
// Firebase Auth 를 쓰지 않으므로 REST 읽기가 클라이언트 읽기와 동등하다.
//
// 대가가 하나 있다. REST 는 보안 규칙을 통과해야 한다. 읽기가 거부되면
// "문서 0개"처럼 보이는데, 폐기 판정에서 그 착각은 데이터를 영구히 잃는다.
// 그래서 권한 오류는 0 이 아니라 하드 실패로 올린다.

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const PAGE_SIZE = 300;

function readWebConfig() {
  const source = fs.readFileSync(path.join(REPO_ROOT, "config.js"), "utf8");
  const projectId = source.match(/projectId:\s*"([^"]+)"/)?.[1];
  const apiKey = source.match(/apiKey:\s*"([^"]+)"/)?.[1];
  if (!projectId || !apiKey) {
    throw new Error("config.js 에서 projectId/apiKey 를 읽지 못했습니다.");
  }
  return { projectId, apiKey };
}

function documentsUrl({ projectId, apiKey }, documentPath, pageToken) {
  const encoded = documentPath.split("/").map(encodeURIComponent).join("/");
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}`
    + `/databases/(default)/documents/${encoded}`;
  const params = new URLSearchParams({ key: apiKey, pageSize: String(PAGE_SIZE) });
  if (pageToken) params.set("pageToken", pageToken);
  return `${base}?${params}`;
}

async function requestJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (response.status === 404) return null;
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `Firestore 읽기가 거부되었습니다 (HTTP ${response.status}).`
      + "\n보안 규칙이 이 경로의 클라이언트 읽기를 막고 있습니다."
      + "\n거부를 '문서 없음'으로 오해하면 안 되므로 판정을 중단합니다."
      + "\n서비스 계정 키를 설정하고 --admin-sdk 로 다시 실행하세요.",
    );
  }
  if (!response.ok) throw new Error(`Firestore REST HTTP ${response.status}`);
  return response.json();
}

// 컬렉션의 문서 수. 페이지를 끝까지 따라가므로 PAGE_SIZE 를 넘겨도 정확하다.
async function countCollection(config, collectionPath) {
  let total = 0;
  let pageToken;
  do {
    const body = await requestJson(documentsUrl(config, collectionPath, pageToken));
    if (!body) return total;
    total += (body.documents || []).length;
    pageToken = body.nextPageToken;
  } while (pageToken);
  return total;
}

function decodeField(value = {}) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  return undefined;
}

async function readDocument(config, documentPath) {
  const body = await requestJson(documentsUrl(config, documentPath));
  if (!body || !body.fields) return null;
  return Object.fromEntries(
    Object.entries(body.fields).map(([key, value]) => [key, decodeField(value)]),
  );
}

module.exports = { countCollection, readDocument, readWebConfig };
