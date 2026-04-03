#!/usr/bin/env node
// ================================================================
// dev-watcher.js — Firebase 실시간 감시 → Claude Code 즉시 실행
//
// 사용법: 별도 터미널(cmd)에서 실행
//   cd "C:\Users\USER\Desktop\dashboard3-main(backup) - 복사본"
//   node dev-watcher.js
//
// 모바일 개발탭에서 전송 → Firebase onSnapshot 즉시 감지 →
// claude -p로 코드 수정 → git push → 결과 Firebase에 저장
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

const app = initializeApp({
  apiKey:            "AIzaSyCk2czvJ8DRautrUput8TLjdrArpQm7BBk",
  authDomain:        "exercise-management.firebaseapp.com",
  projectId:         "exercise-management",
  storageBucket:     "exercise-management.firebasestorage.app",
  messagingSenderId: "867781711662",
  appId:             "1:867781711662:web:8fe1e9904c94d021f2ccbf",
});
const db = getFirestore(app);

let processing = false;

console.log('╔══════════════════════════════════════╗');
console.log('║  Dev Watcher 실행 중                 ║');
console.log('║  모바일 개발탭 → 즉시 처리           ║');
console.log('║  Ctrl+C로 종료                       ║');
console.log('╚══════════════════════════════════════╝\n');

// ── Firebase 실시간 감시 (push 방식) ──
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
  const taskRef = doc(db, 'dev_tasks', task.id);

  processing = true;
  const t = () => new Date().toLocaleTimeString('ko-KR');
  console.log(`\n[${t()}] ▶ 새 작업: ${task.id}`);
  console.log(`  "${task.instruction}"\n`);

  try {
    // 상태: 처리 중
    await updateDoc(taskRef, {
      status: 'processing',
      log: '코드를 분석하고 수정 중...',
    });

    // Claude Code 실행
    const prompt = `너는 이 프로젝트의 개발자야. 프로젝트 경로: ${PROJECT_DIR}

반드시 아래 순서대로 실행해:
1. 지시사항에 해당하는 파일을 찾아서 읽어
2. 코드를 수정해
3. git add → git commit → git push origin main
4. 마지막 줄에 "변경사항:" 으로 시작하는 한국어 요약 한 줄을 출력해

질문하지 마. 설명하지 마. 바로 코드를 수정해.

지시사항: ${task.instruction}`;

    const result = await runClaude(prompt, async (log) => {
      try { await updateDoc(taskRef, { log }); } catch {}
    });

    // 결과에서 요약 추출
    const summary = extractSummary(result);
    console.log(`[${t()}] ✔ 완료: ${summary.slice(0, 100)}\n`);

    await updateDoc(taskRef, {
      status: 'done',
      result: summary,
      log: '',
      completedAt: serverTimestamp(),
    });

  } catch (err) {
    console.error(`[${t()}] ✘ 오류: ${err.message}\n`);
    try {
      await updateDoc(taskRef, {
        status: 'error',
        result: '오류: ' + err.message,
        log: '',
        completedAt: serverTimestamp(),
      });
    } catch {}
  } finally {
    processing = false;
  }
});

// ── Claude -p 실행 ──
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

      // 마지막 의미있는 줄을 진행 로그로
      const lines = text.split('\n').filter(l => l.trim().length > 3);
      const last = lines[lines.length - 1]?.trim();
      if (last && last !== lastLog) {
        lastLog = last;
        if (onLog) onLog(last.slice(0, 200));
      }
    });

    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      if (stdout.length > 50) resolve(stdout.trim());
      else reject(new Error(stderr || `exit code ${code}`));
    });

    child.on('error', (e) => reject(e));
  });
}

// ── 요약 추출 ──
function extractSummary(output) {
  if (!output) return '(출력 없음)';
  const lines = output.split('\n').filter(l => l.trim());

  // "변경사항:" 패턴 찾기
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('변경사항')) {
      return lines.slice(i).join('\n').slice(0, 2000);
    }
  }
  // "## " 또는 "완료" 패턴
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].toLowerCase();
    if (l.includes('## ') || l.includes('완료') || l.includes('요약') || l.includes('정리')) {
      return lines.slice(i).join('\n').slice(0, 2000);
    }
  }
  // 못 찾으면 마지막 10줄
  return lines.slice(-10).join('\n').slice(0, 2000);
}

process.on('SIGINT', () => {
  console.log('\n종료');
  process.exit(0);
});
