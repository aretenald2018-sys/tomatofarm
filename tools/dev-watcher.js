#!/usr/bin/env node
// ================================================================
// dev-watcher.js — Firebase ↔ 로컬 파일 브릿지
//
// Firebase에서 작업을 실시간 감지 → .dev-task.json 생성
// Claude Code 세션이 처리 후 .dev-result.json 생성 → Firebase로 전송
//
// 사용법: node dev-watcher.js (이 Claude 세션과 같은 터미널에서 백그라운드 가능)
// ================================================================

import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, query, where, limit,
  onSnapshot, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { writeFileSync, readFileSync, existsSync, unlinkSync, watch } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TASK_FILE = join(__dirname, '.dev-task.json');
const RESULT_FILE = join(__dirname, '.dev-result.json');

const app = initializeApp({
  apiKey: "AIzaSyCk2czvJ8DRautrUput8TLjdrArpQm7BBk",
  projectId: "exercise-management",
});
const db = getFirestore(app);

let currentTaskId = null;

console.log('[dev-watcher] 실행 중 — Firebase ↔ 파일 브릿지');

// 시작 시 잔여 파일 정리
try { unlinkSync(TASK_FILE); } catch {}
try { unlinkSync(RESULT_FILE); } catch {}

// ── 1) Firebase → .dev-task.json (실시간 push) ──
const q = query(
  collection(db, 'dev_tasks'),
  where('status', '==', 'pending'),
  limit(5)
);

onSnapshot(q, async (snap) => {
  if (snap.empty || currentTaskId) return;

  const docs = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  const task = docs[0];
  currentTaskId = task.id;

  console.log(`[dev-watcher] 새 작업 → .dev-task.json: "${task.instruction.slice(0, 50)}..."`);

  // Firebase 상태 업데이트
  await updateDoc(doc(db, 'dev_tasks', task.id), {
    status: 'processing',
    log: 'Claude Code에서 처리 대기 중...',
  });

  // 로컬 파일에 작업 저장
  writeFileSync(TASK_FILE, JSON.stringify({
    id: task.id,
    instruction: task.instruction,
  }), 'utf-8');
});

// ── 2) .dev-result.json → Firebase (파일 감시) ──
setInterval(async () => {
  if (!currentTaskId || !existsSync(RESULT_FILE)) return;

  try {
    const raw = readFileSync(RESULT_FILE, 'utf-8');
    const result = JSON.parse(raw);
    if (!result.summary && !result.error) return;

    console.log(`[dev-watcher] 결과 수신 → Firebase 전송`);

    await updateDoc(doc(db, 'dev_tasks', currentTaskId), {
      status: result.error ? 'error' : 'done',
      result: result.summary || result.error,
      log: '',
      completedAt: serverTimestamp(),
    });

    // 정리
    try { unlinkSync(TASK_FILE); } catch {}
    try { unlinkSync(RESULT_FILE); } catch {}
    currentTaskId = null;

  } catch {}
}, 1500); // 1.5초마다 결과 파일 확인

// ── 3) 진행 로그 업데이트 (.dev-result.json에 log 필드가 있으면) ──
setInterval(async () => {
  if (!currentTaskId || !existsSync(RESULT_FILE)) return;
  try {
    const raw = readFileSync(RESULT_FILE, 'utf-8');
    const result = JSON.parse(raw);
    if (result.log && !result.summary) {
      await updateDoc(doc(db, 'dev_tasks', currentTaskId), { log: result.log });
    }
  } catch {}
}, 3000);

process.on('SIGINT', () => {
  try { unlinkSync(TASK_FILE); } catch {}
  try { unlinkSync(RESULT_FILE); } catch {}
  console.log('\n[dev-watcher] 종료');
  process.exit(0);
});
