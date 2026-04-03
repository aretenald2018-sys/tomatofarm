#!/usr/bin/env node
// ================================================================
// dev-watcher.js — Firebase → 로컬 파일 브릿지
//
// Firebase에서 pending 작업을 감시하고,
// .dev-task.json에 작업 내용을 써둡니다.
// Claude Code 세션이 이 파일을 읽고 직접 처리합니다.
//
// 사용법: node dev-watcher.js
// ================================================================

import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, query, where, limit,
  onSnapshot, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TASK_FILE = join(__dirname, '.dev-task.json');
const RESULT_FILE = join(__dirname, '.dev-result.json');

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCk2czvJ8DRautrUput8TLjdrArpQm7BBk",
  authDomain:        "exercise-management.firebaseapp.com",
  projectId:         "exercise-management",
  storageBucket:     "exercise-management.firebasestorage.app",
  messagingSenderId: "867781711662",
  appId:             "1:867781711662:web:8fe1e9904c94d021f2ccbf",
};

const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);

let currentTaskId = null;

console.log('========================================');
console.log('  Dev Watcher 시작');
console.log('  Firebase ↔ 로컬 파일 브릿지');
console.log('  Ctrl+C로 종료');
console.log('========================================\n');

// 시작 시 잔여 파일 정리
try { unlinkSync(TASK_FILE); } catch {}
try { unlinkSync(RESULT_FILE); } catch {}

// ── pending 작업 감시 ──
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
  console.log(`[${ts()}] 새 작업: ${task.id}`);
  console.log(`  지시: ${task.instruction}`);

  // Firebase: processing 상태로 변경
  await updateDoc(doc(db, 'dev_tasks', task.id), {
    status: 'processing',
    log: 'Claude Code에서 처리 중...',
  });

  // 로컬 파일에 작업 저장 → Claude Code 세션이 읽어감
  writeFileSync(TASK_FILE, JSON.stringify({
    id: task.id,
    instruction: task.instruction,
  }), 'utf-8');

  console.log(`  → .dev-task.json 생성됨. Claude Code 대기 중...`);

  // 결과 파일 폴링 (Claude Code가 .dev-result.json을 쓸 때까지)
  pollResult(task.id);
});

// ── 결과 폴링 ──
function pollResult(taskId) {
  const interval = setInterval(async () => {
    if (!existsSync(RESULT_FILE)) return;

    try {
      const raw = readFileSync(RESULT_FILE, 'utf-8');
      const result = JSON.parse(raw);

      console.log(`[${ts()}] 결과 수신!`);
      console.log(`  ${result.summary?.slice(0, 100)}...\n`);

      // Firebase에 결과 저장
      await updateDoc(doc(db, 'dev_tasks', taskId), {
        status: result.error ? 'error' : 'done',
        result: result.summary || result.error || '완료',
        log: '',
        completedAt: serverTimestamp(),
      });

      // 파일 정리
      try { unlinkSync(TASK_FILE); } catch {}
      try { unlinkSync(RESULT_FILE); } catch {}
      currentTaskId = null;
      clearInterval(interval);

    } catch (e) {
      // JSON 파싱 실패 = 아직 쓰는 중
    }
  }, 2000); // 2초마다 확인
}

function ts() {
  return new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

process.on('SIGINT', () => {
  try { unlinkSync(TASK_FILE); } catch {}
  try { unlinkSync(RESULT_FILE); } catch {}
  console.log('\nDev Watcher 종료');
  process.exit(0);
});
