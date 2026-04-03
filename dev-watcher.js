#!/usr/bin/env node
// ================================================================
// dev-watcher.js — Firebase 감시 → Claude Code 자동 실행
//
// 사용법: node dev-watcher.js
// (출근 전에 터미널에서 이 명령어 하나만 실행해두면 됩니다)
// ================================================================

import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, query, where, orderBy, limit,
  onSnapshot, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { execSync, spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = __dirname;

// Firebase 설정 (config.js와 동일)
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

let processing = false;

console.log('========================================');
console.log('  Dev Watcher 시작');
console.log('  Firebase 감시 중... (Ctrl+C로 종료)');
console.log('========================================');

// pending 작업 실시간 감시
const q = query(
  collection(db, 'dev_tasks'),
  where('status', '==', 'pending'),
  orderBy('createdAt', 'asc'),
  limit(1)
);

onSnapshot(q, async (snap) => {
  if (snap.empty || processing) return;

  const taskDoc = snap.docs[0];
  const task = taskDoc.data();
  const taskId = taskDoc.id;

  processing = true;
  console.log(`\n--- 새 작업 감지: ${taskId} ---`);
  console.log(`지시: ${task.instruction}`);
  console.log('처리 시작...\n');

  try {
    // 상태를 processing으로 변경
    await updateDoc(doc(db, 'dev_tasks', taskId), {
      status: 'processing',
    });

    // Claude Code 실행 (--print 모드: 비대화형)
    const prompt = `프로젝트 경로: ${PROJECT_DIR}

아래 지시사항을 처리하고, 완료되면 git commit & push까지 해주세요.
처리 결과를 간결한 한국어 요약으로 알려주세요 (변경사항 요약만, 코드는 제외).

지시사항:
${task.instruction}`;

    const result = await runClaude(prompt);

    console.log('\n--- 처리 완료 ---');
    console.log(result.slice(0, 500));

    // 결과 저장
    await updateDoc(doc(db, 'dev_tasks', taskId), {
      status: 'done',
      result: result,
      completedAt: serverTimestamp(),
    });

  } catch (err) {
    console.error('처리 오류:', err.message);
    try {
      await updateDoc(doc(db, 'dev_tasks', taskId), {
        status: 'error',
        result: err.message,
        completedAt: serverTimestamp(),
      });
    } catch {}
  } finally {
    processing = false;
  }
});

// Claude Code 실행 (--print 모드)
function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['--print', '--dangerously-skip-permissions', prompt], {
      cwd: PROJECT_DIR,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 600000, // 10분 타임아웃
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || `Claude exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to start Claude: ${err.message}`));
    });
  });
}

// 프로세스 종료 처리
process.on('SIGINT', () => {
  console.log('\nDev Watcher 종료');
  process.exit(0);
});
