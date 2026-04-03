// ================================================================
// render-dev.js — 개발 탭: 모바일 → Firebase → PC Claude 연동
// ================================================================

import { CONFIG } from './config.js';
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, deleteDoc,
  collection, query, orderBy, limit,
  onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const db = (() => {
  const apps = getApps();
  const app = apps.length ? apps[0] : initializeApp(CONFIG.FIREBASE);
  return getFirestore(app);
})();

const COL = 'dev_tasks';
let _unsubscribe = null;
let _rendered = false;

// ================================================================
// 렌더
// ================================================================
export function renderDev() {
  const el = document.getElementById('dev-container');
  if (!el) return;

  el.innerHTML = `
    <div class="dev-header">
      <span class="dev-title">개발 요청</span>
      <span class="dev-subtitle">작성하면 Claude가 자동으로 처리합니다</span>
    </div>

    <div class="dev-input-area">
      <textarea id="dev-input" class="dev-textarea" placeholder="수정할 내용을 적어주세요..." rows="3"></textarea>
      <button class="dev-submit-btn" id="dev-submit-btn" onclick="submitDevTask()">
        <span id="dev-submit-text">전송</span>
      </button>
    </div>

    <div class="dev-task-list" id="dev-task-list">
      <div class="dev-empty">불러오는 중...</div>
    </div>`;

  _listenTasks();
}

// ================================================================
// Firebase 실시간 구독
// ================================================================
function _listenTasks() {
  if (_unsubscribe) _unsubscribe();

  const q = query(collection(db, COL), orderBy('createdAt', 'desc'), limit(30));
  _unsubscribe = onSnapshot(q, snap => {
    const tasks = [];
    snap.forEach(d => tasks.push({ id: d.id, ...d.data() }));
    _renderTaskList(tasks);
  }, err => {
    console.warn('[dev] snapshot error:', err);
    _renderTaskList([]);
  });
}

// ================================================================
// 작업 제출
// ================================================================
export async function submitDevTask() {
  const input = document.getElementById('dev-input');
  const btn = document.getElementById('dev-submit-btn');
  const text = input?.value?.trim();
  if (!text) return;

  btn.disabled = true;
  document.getElementById('dev-submit-text').textContent = '전송 중...';

  try {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await setDoc(doc(db, COL, id), {
      instruction: text,
      status: 'pending',      // pending → processing → done / error
      result: '',
      createdAt: serverTimestamp(),
      completedAt: null,
    });
    input.value = '';
  } catch (e) {
    console.error('[dev] submit error:', e);
    alert('전송 실패: ' + e.message);
  } finally {
    btn.disabled = false;
    document.getElementById('dev-submit-text').textContent = '전송';
  }
}

// ================================================================
// 작업 목록 렌더
// ================================================================
function _renderTaskList(tasks) {
  const el = document.getElementById('dev-task-list');
  if (!el) return;

  if (!tasks.length) {
    el.innerHTML = '<div class="dev-empty">아직 요청한 작업이 없습니다</div>';
    return;
  }

  el.innerHTML = tasks.map(t => {
    const st = _statusInfo(t.status);
    const time = _timeAgo(t.createdAt);
    const doneTime = t.completedAt ? _timeAgo(t.completedAt) : '';

    return `<div class="dev-task-card ${t.status}">
      <div class="dev-task-top">
        <span class="dev-task-status" style="color:${st.color}">
          <span class="dev-status-dot" style="background:${st.color}"></span>
          ${st.label}
        </span>
        <span class="dev-task-time">${time}</span>
      </div>
      <div class="dev-task-instruction">${_escHtml(t.instruction)}</div>
      ${t.status === 'processing' ? '<div class="dev-task-progress"><div class="dev-progress-bar"></div></div>' : ''}
      ${t.result ? `<div class="dev-task-result">
        <div class="dev-result-header">처리 결과${doneTime ? ' · ' + doneTime : ''}</div>
        <div class="dev-result-body">${_formatResult(t.result)}</div>
      </div>` : ''}
      ${t.status === 'error' && t.result ? `<div class="dev-task-error">${_escHtml(t.result)}</div>` : ''}
      ${t.status === 'done' || t.status === 'error' ? `<button class="dev-task-delete" onclick="deleteDevTask('${t.id}')">삭제</button>` : ''}
    </div>`;
  }).join('');
}

// ================================================================
// 삭제
// ================================================================
window.deleteDevTask = async function(id) {
  try { await deleteDoc(doc(db, COL, id)); } catch (e) { console.warn('[dev] delete error:', e); }
};

// ================================================================
// 유틸
// ================================================================
function _statusInfo(s) {
  const m = {
    pending:    { label: '대기 중',  color: '#f59e0b' },
    processing: { label: '처리 중',  color: '#3b82f6' },
    done:       { label: '완료',     color: '#10b981' },
    error:      { label: '오류',     color: '#ef4444' },
  };
  return m[s] || m.pending;
}

function _timeAgo(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return Math.floor(diff / 60) + '분 전';
  if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

function _escHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

function _formatResult(s) {
  if (!s) return '';
  // 마크다운 간이 처리: **bold**, ### heading
  return _escHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.+)$/gm, '<div style="font-weight:700;margin-top:6px">$1</div>')
    .replace(/^- (.+)$/gm, '<div style="padding-left:10px">· $1</div>');
}
