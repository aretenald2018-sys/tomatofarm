#!/usr/bin/env node
// ================================================================
// dev-watcher.js — Firebase 감시 → Claude Code 자동 실행
//
// 사용법: node dev-watcher.js
// (출근 전에 터미널에서 이 명령어 하나만 실행해두면 됩니다)
// ================================================================

import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, query, where, limit,
  onSnapshot, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { spawn } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = __dirname;

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
console.log('========================================\n');

// pending 작업 감시
const q = query(
  collection(db, 'dev_tasks'),
  where('status', '==', 'pending'),
  limit(5)
);

onSnapshot(q, async (snap) => {
  if (snap.empty || processing) return;

  const docs = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  const task = docs[0];
  const taskId = task.id;
  const taskRef = doc(db, 'dev_tasks', taskId);

  processing = true;
  console.log(`\n[${new Date().toLocaleTimeString()}] 새 작업: ${taskId}`);
  console.log(`지시: ${task.instruction}\n`);

  try {
    await updateDoc(taskRef, {
      status: 'processing',
      log: '작업을 분석하고 있습니다...',
    });

    const prompt = buildPrompt(task.instruction);

    // Claude 실행 + 실시간 로그
    const result = await runClaude(prompt, async (logLine) => {
      if (logLine) {
        try { await updateDoc(taskRef, { log: logLine }); } catch {}
      }
    });

    const summary = extractSummary(result);
    await updateDoc(taskRef, {
      status: 'done',
      result: summary,
      log: '',
      completedAt: serverTimestamp(),
    });
    console.log(`\n[완료] ${taskId}\n`);

  } catch (err) {
    console.error('오류:', err.message);
    try {
      await updateDoc(taskRef, {
        status: 'error',
        result: '처리 중 오류: ' + err.message,
        log: '',
        completedAt: serverTimestamp(),
      });
    } catch {}
  } finally {
    processing = false;
  }
});

// ── 프롬프트 ──
function buildPrompt(instruction) {
  return `너는 "${PROJECT_DIR}"에 있는 Life Streak 대시보드 웹앱의 개발자야.
사용자가 모바일 개발탭에서 아래 지시를 보냈어. 반드시 코드를 수정해야 해.

중요 규칙:
1. 관련 파일을 읽고 코드를 실제로 수정해.
2. 수정이 끝나면 git add → git commit → git push origin main 까지 완료해.
3. 프로젝트 설명이나 질문을 하지 마. 바로 코드 수정에 착수해.
4. 마지막에 변경사항을 한국어로 간결하게 요약해 (코드 블록 없이 텍스트만).

사용자 지시:
${instruction}`;
}

// ── Claude 실행 ──
function runClaude(prompt, onLog) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '--dangerously-skip-permissions'], {
      cwd: PROJECT_DIR,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 600000,
    });

    child.stdin.write(prompt);
    child.stdin.end();

    let stdout = '';
    let stderr = '';
    let lastLog = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);

      // 진행 로그 추출
      const lines = text.split('\n').filter(l => l.trim().length > 5);
      for (const line of lines.reverse()) {
        const l = line.trim();
        if (l !== lastLog) {
          lastLog = l;
          if (onLog) onLog(l.slice(0, 200));
          break;
        }
      }
    });

    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (code === 0 || stdout.length > 100) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || `Claude exited with code ${code}`));
      }
    });

    child.on('error', (err) => reject(new Error(`spawn failed: ${err.message}`)));
  });
}

// ── 결과 요약 추출 ──
function extractSummary(output) {
  if (!output) return '(출력 없음)';
  const lines = output.split('\n').filter(l => l.trim());
  // "변경사항", "요약", "완료" 키워드 이후 추출
  let startIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].toLowerCase();
    if (l.includes('변경사항') || l.includes('요약') || l.includes('## ') ||
        l.includes('완료') || l.includes('정리하면')) {
      startIdx = i;
      break;
    }
  }
  if (startIdx >= 0) return lines.slice(startIdx).join('\n').slice(0, 2000);
  return lines.slice(-15).join('\n').slice(0, 2000);
}

process.on('SIGINT', () => {
  console.log('\nDev Watcher 종료');
  process.exit(0);
});
