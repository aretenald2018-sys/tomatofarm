// ================================================================
// render-admin.js — 토마토어드민 탭 (관리자 전용 대시보드)
// ================================================================

import { CONFIG } from './config.js';
import {
  getAccountList, isAdmin, dateKey, TODAY, deleteUserAccount,
} from './data.js';
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getFirestore, collection, getDocs, doc, getDoc, setDoc, deleteDoc,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const db = (() => {
  const apps = getApps();
  const app = apps.length ? apps[0] : initializeApp(CONFIG.FIREBASE);
  return getFirestore(app);
})();

// ── 유틸 ─────────────────────────────────────────────────────────
function _dk(d) { return dateKey(d.getFullYear(), d.getMonth(), d.getDate()); }
function _daysAgo(n) { const d = new Date(TODAY); d.setDate(d.getDate() - n); return d; }
function _fmtDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
}

async function _getWorkout(userId, dk) {
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'workouts', dk));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

function _hasActivity(w) {
  if (!w) return false;
  return !!(w.exercises?.length || w.cf || w.swimming || w.running ||
    w.bFoods?.length || w.lFoods?.length || w.dFoods?.length || w.sFoods?.length);
}

// ── 메인 렌더 ────────────────────────────────────────────────────
export async function renderAdmin() {
  const el = document.getElementById('admin-container');
  if (!el) return;
  if (!isAdmin()) { el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-tertiary);">관리자 전용입니다.</div>'; return; }

  el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-tertiary);">
    <div style="font-size:24px;margin-bottom:8px;">🍅</div>불러오는 중...
  </div>`;

  try {
    // 글로벌 컬렉션 병렬 로드
    const [accSnap, frSnap, gbSnap, lkSnap, ntSnap, ltSnap, pnSnap] = await Promise.all([
      getDocs(collection(db, '_accounts')),
      getDocs(collection(db, '_friend_requests')),
      getDocs(collection(db, '_guestbook')),
      getDocs(collection(db, '_likes')),
      getDocs(collection(db, '_notifications')),
      getDocs(collection(db, '_letters')),
      getDocs(collection(db, '_patchnotes')),
    ]);

    const accs = []; accSnap.forEach(d => accs.push(d.data()));
    const frs = [];  frSnap.forEach(d => frs.push(d.data()));
    const gbs = [];  gbSnap.forEach(d => gbs.push(d.data()));
    const lks = [];  lkSnap.forEach(d => lks.push(d.data()));
    const nts = [];  ntSnap.forEach(d => nts.push(d.data()));
    const letters = []; ltSnap.forEach(d => letters.push(d.data()));
    const patchnotes = []; pnSnap.forEach(d => patchnotes.push(d.data()));
    letters.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    patchnotes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const realAccs = accs.filter(a => a.id && !a.id.includes('(guest)'));

    // ── 핵심 지표 ──
    const totalUsers = realAccs.length;
    const friendships = frs.filter(f => f.status === 'accepted').length;
    const pendingReqs = frs.filter(f => f.status === 'pending').length;
    const todayKey = _dk(TODAY);
    const todayStart = new Date(TODAY); todayStart.setHours(0,0,0,0);
    const todayTs = todayStart.getTime();
    const todayLikes = lks.filter(l => (l.createdAt || 0) >= todayTs).length;
    const todayGb = gbs.filter(g => (g.createdAt || 0) >= todayTs).length;

    // ── 오늘 활동 사용자 (병렬) ──
    const todayWorkouts = await Promise.all(
      realAccs.map(a => _getWorkout(a.id, todayKey).then(w => ({ id: a.id, w })))
    );
    const activeToday = new Set(todayWorkouts.filter(x => _hasActivity(x.w)).map(x => x.id));

    // ── 7일 활동 차트 (병렬) ──
    const days7 = [];
    for (let i = 6; i >= 0; i--) days7.push(_daysAgo(i));

    const dailyActive = await Promise.all(days7.map(async (d) => {
      const dk = _dk(d);
      const results = await Promise.all(realAccs.map(a => _getWorkout(a.id, dk)));
      const cnt = results.filter(w => _hasActivity(w)).length;
      const dow = ['일','월','화','수','목','금','토'][d.getDay()];
      return { label: `${d.getMonth()+1}/${d.getDate()}(${dow})`, count: cnt };
    }));

    // ── 사용자별 최근 활동일 (최근 14일만, 병렬) ──
    const userLastActive = {};
    const last14 = [];
    for (let i = 0; i <= 14; i++) last14.push({ d: _daysAgo(i), dk: _dk(_daysAgo(i)), i });

    for (const acc of realAccs) {
      const results = await Promise.all(last14.map(x => _getWorkout(acc.id, x.dk)));
      for (let j = 0; j < results.length; j++) {
        if (_hasActivity(results[j])) { userLastActive[acc.id] = last14[j].i; break; }
      }
    }

    // ── 최근 패치노트 읽음 현황 ──
    const latestPatch = patchnotes[0]; // 가장 최근 패치노트
    const patchReadSet = new Set(latestPatch?.readBy || []);

    // ── 사용자별 현황 조립 ──
    const userStats = realAccs.map(acc => {
      const uid = acc.id;
      const nick = acc.nickname || (acc.lastName + acc.firstName);
      const realName = acc.lastName + (acc.firstName || '').replace(/\(.*\)/, '');
      const friendCount = frs.filter(f => f.status === 'accepted' && (f.from === uid || f.to === uid)).length;
      const likesSent = lks.filter(l => l.from === uid).length;
      const likesReceived = lks.filter(l => l.to === uid).length;
      const gbWritten = gbs.filter(g => g.from === uid).length;
      const isActive = activeToday.has(uid);
      const hasPw = acc.hasPassword || false;
      const lastDay = userLastActive[uid];
      const lastActiveText = lastDay === undefined ? '14일+ 미활동'
        : lastDay === 0 ? '오늘' : lastDay === 1 ? '어제' : `${lastDay}일 전`;
      // 추적 데이터
      const lastLoginAt = acc.lastLoginAt || null;
      const tutorialDoneAt = acc.tutorialDoneAt || null;
      const patchRead = patchReadSet.has(uid);
      const actionLog = acc.actionLog || [];
      const recentActions = actionLog.slice(-5); // 최근 5개 행동
      return { uid, nick, realName, friendCount, likesSent, likesReceived, gbWritten, isActive, hasPw, lastActiveText, lastDay: lastDay ?? 999, lastLoginAt, tutorialDoneAt, patchRead, recentActions };
    }).sort((a, b) => a.lastDay - b.lastDay);

    // 최근 리액션/방명록
    const recentLikes = lks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 10);
    const recentGb = gbs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 10);

    // ── 바 차트 ──
    const barMax = Math.max(...dailyActive.map(d => d.count), 1);

    // ── 이름 해석 헬퍼 ──
    const _name = (id) => {
      const a = accs.find(x => x.id === id);
      return a ? (a.nickname || a.lastName + a.firstName) : (id || '?').replace(/_/g, '');
    };

    // ── HTML ──
    el.innerHTML = `
    <div style="padding:16px 16px 100px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
        <div style="width:40px;height:40px;border-radius:12px;background:#3182F6;display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff;font-weight:800;">🍅</div>
        <div>
          <div style="font-size:17px;font-weight:700;color:var(--text);">토마토어드민</div>
          <div style="font-size:12px;color:var(--text-tertiary);">농장 현황 대시보드</div>
        </div>
      </div>

      <!-- 핵심 지표 -->
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:20px;">
        ${[
          { label: '전체 사용자', value: totalUsers, unit: '명', color: 'var(--text)' },
          { label: '오늘 활동', value: activeToday.size, unit: '명', color: '#3182F6' },
          { label: '이웃 관계', value: friendships, unit: '쌍', color: 'var(--text)', sub: pendingReqs > 0 ? `대기 ${pendingReqs}건` : '' },
          { label: '오늘 상호작용', value: todayLikes + todayGb, unit: '', color: 'var(--text)', sub: `리액션 ${todayLikes} · 방명록 ${todayGb}` },
        ].map(m => `
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;">
            <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px;">${m.label}</div>
            <div style="font-size:24px;font-weight:800;color:${m.color};">${m.value}<span style="font-size:12px;font-weight:400;color:var(--text-tertiary);">${m.unit}</span></div>
            ${m.sub ? `<div style="font-size:10px;color:var(--text-tertiary);margin-top:2px;">${m.sub}</div>` : ''}
          </div>
        `).join('')}
      </div>

      <!-- 7일 활동 차트 -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:20px;">
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:12px;">7일간 일일 활동 사용자</div>
        <div style="display:flex;align-items:flex-end;gap:6px;height:80px;">
          ${dailyActive.map(d => `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
              <div style="font-size:10px;font-weight:600;color:${d.count > 0 ? '#3182F6' : 'var(--text-tertiary)'};">${d.count}</div>
              <div style="width:100%;border-radius:6px;background:${d.count > 0 ? '#3182F6' : 'var(--border)'};height:${Math.max((d.count / barMax) * 56, 4)}px;transition:height 0.3s;"></div>
              <div style="font-size:9px;color:var(--text-tertiary);white-space:nowrap;">${d.label.split('(')[0]}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- 사용자별 현황 -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:20px;">
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:12px;">사용자별 현황</div>
        ${userStats.map(u => `
          <div style="padding:10px 0;border-bottom:1px solid var(--border);">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:32px;height:32px;border-radius:50%;background:${u.isActive ? '#E8F3FF' : 'var(--surface2,#F2F4F6)'};color:${u.isActive ? '#3182F6' : 'var(--text-tertiary)'};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0;">${u.nick.charAt(0)}</div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-size:13px;font-weight:600;color:var(--text);">${u.nick}</span>
                  ${u.nick !== u.realName ? `<span style="font-size:10px;color:var(--text-tertiary);">${u.realName}</span>` : ''}
                  ${u.isActive ? '<span style="width:6px;height:6px;border-radius:50%;background:#22c55e;flex-shrink:0;"></span>' : ''}
                </div>
                <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">
                  ${u.lastActiveText} · 이웃 ${u.friendCount} · 리액션 ↑${u.likesSent} ↓${u.likesReceived}
                  ${!u.hasPw ? ' · <span style="color:#f59e0b;">비번없음</span>' : ''}
                </div>
              </div>
              <button onclick="confirmDeleteUser('${u.uid}','${u.nick}')" style="flex-shrink:0;padding:6px 10px;border:1px solid #fecaca;border-radius:8px;background:#fff5f5;color:#ef4444;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.15s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fff5f5'">삭제</button>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;margin-left:42px;">
              <span style="font-size:10px;padding:2px 8px;border-radius:999px;background:${u.lastLoginAt ? '#E8F3FF' : 'var(--surface2,#F2F4F6)'};color:${u.lastLoginAt ? '#3182F6' : 'var(--text-tertiary)'};">접속 ${u.lastLoginAt ? _fmtDate(u.lastLoginAt) : '기록없음'}</span>
              <span style="font-size:10px;padding:2px 8px;border-radius:999px;background:${u.tutorialDoneAt ? '#ECFDF5' : '#FEF2F2'};color:${u.tutorialDoneAt ? '#059669' : '#DC2626'};">${u.tutorialDoneAt ? '코칭완료' : '코칭미완'}</span>
              <span style="font-size:10px;padding:2px 8px;border-radius:999px;background:${u.patchRead ? '#ECFDF5' : '#FEF2F2'};color:${u.patchRead ? '#059669' : '#DC2626'};">${u.patchRead ? '패치읽음' : '패치안읽음'}</span>
            </div>
            ${u.recentActions.length > 0 ? `
            <div style="margin-top:4px;margin-left:42px;display:flex;flex-wrap:wrap;gap:3px;">
              ${u.recentActions.map(a => `<span style="font-size:9px;padding:1px 6px;border-radius:6px;background:var(--surface2,#F2F4F6);color:var(--text-tertiary);">${a.action} ${_fmtDate(a.at)}</span>`).join('')}
            </div>` : ''}
          </div>
        `).join('')}
      </div>

      <!-- 최근 리액션 -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:20px;">
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:12px;">최근 리액션</div>
        ${recentLikes.length === 0 ? '<div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:8px;">아직 없어요</div>' :
          recentLikes.map(l => `
            <div style="display:flex;align-items:center;gap:6px;font-size:12px;padding:5px 0;border-bottom:1px solid var(--border);">
              <span style="font-weight:500;color:var(--text);">${_name(l.from)}</span>
              <span style="color:var(--text-tertiary);">→</span>
              <span style="font-weight:500;color:var(--text);">${_name(l.to)}</span>
              <span>${l.emoji || '👏'}</span>
              <span style="font-size:10px;color:var(--text-tertiary);margin-left:auto;">${_fmtDate(l.createdAt)}</span>
            </div>
          `).join('')
        }
      </div>

      <!-- 최근 방명록 -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:20px;">
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:12px;">최근 방명록</div>
        ${recentGb.length === 0 ? '<div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:8px;">아직 없어요</div>' :
          recentGb.map(g => `
            <div style="font-size:12px;padding:6px 0;border-bottom:1px solid var(--border);">
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-weight:500;color:var(--text);">${g.fromName || _name(g.from)}</span>
                <span style="color:var(--text-tertiary);">→</span>
                <span style="font-weight:500;color:var(--text);">${_name(g.to)}</span>
                <span style="font-size:10px;color:var(--text-tertiary);margin-left:auto;">${_fmtDate(g.createdAt)}</span>
              </div>
              <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">"${(g.message || '').slice(0, 40)}${(g.message || '').length > 40 ? '…' : ''}"</div>
            </div>
          `).join('')
        }
      </div>

      <!-- 개발자에게 온 편지 -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div style="font-size:13px;font-weight:600;color:var(--text);">✉️ 개발자에게 온 편지 <span style="font-size:11px;font-weight:400;color:var(--text-tertiary);">${letters.length}통</span></div>
          ${letters.filter(l => !l.read).length > 0 ? `<span style="font-size:10px;font-weight:600;color:#fff;background:#ef4444;border-radius:999px;padding:2px 8px;">${letters.filter(l => !l.read).length} 안 읽음</span>` : ''}
        </div>
        ${letters.length === 0 ? '<div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:12px;">아직 편지가 없어요</div>' :
          letters.slice(0, 15).map(l => `
            <div style="padding:10px 0;border-bottom:1px solid var(--border);${!l.read ? 'background:rgba(49,130,246,0.04);margin:0 -16px;padding-left:16px;padding-right:16px;' : ''}" data-letter-id="${l.id}">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                ${!l.read ? '<span style="width:7px;height:7px;border-radius:50%;background:#3182F6;flex-shrink:0;"></span>' : ''}
                <span style="font-size:13px;font-weight:600;color:var(--text);">${l.fromName || _name(l.from)}</span>
                <span style="font-size:10px;color:var(--text-tertiary);margin-left:auto;">${_fmtDate(l.createdAt)}</span>
              </div>
              <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;white-space:pre-wrap;word-break:break-word;">${(l.message || '').slice(0, 200)}${(l.message || '').length > 200 ? '…' : ''}</div>
              ${!l.read ? `<button onclick="markLetterRead('${l.id}')" style="margin-top:6px;padding:4px 12px;border:none;border-radius:8px;background:var(--surface2,#F2F4F6);color:var(--text-secondary);font-size:11px;cursor:pointer;">읽음 처리</button>` : ''}
            </div>
          `).join('')
        }
      </div>

      <!-- 패치노트 관리 -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div style="font-size:13px;font-weight:600;color:var(--text);">📋 패치노트 발행</div>
          <button onclick="openPatchnoteEditor()" style="padding:6px 14px;border:none;border-radius:8px;background:#3182F6;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">+ 새 패치노트</button>
        </div>
        ${patchnotes.length === 0 ? '<div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:12px;">발행된 패치노트가 없어요</div>' :
          patchnotes.slice(0, 10).map(p => `
            <div style="padding:10px 0;border-bottom:1px solid var(--border);">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span style="font-size:13px;font-weight:600;color:var(--text);">${p.title || '제목 없음'}</span>
                <span style="font-size:10px;color:var(--text-tertiary);margin-left:auto;">${_fmtDate(p.createdAt)}</span>
              </div>
              <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;white-space:pre-wrap;">${(p.body || '').slice(0, 150)}${(p.body || '').length > 150 ? '…' : ''}</div>
              <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px;">읽은 사용자: ${(p.readBy || []).length}명</div>
            </div>
          `).join('')
        }
      </div>
      <!-- 운영자 공지 -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div style="font-size:13px;font-weight:600;color:var(--text);">📢 운영자 공지</div>
          <button onclick="openAnnouncementEditor()" style="padding:6px 14px;border:none;border-radius:8px;background:#F97316;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">+ 새 공지</button>
        </div>
        <div style="font-size:11px;color:var(--text-tertiary);">공지는 모든 사용자의 알림 목록에 표시됩니다.</div>
      </div>

    </div>`;

    // 이벤트 바인딩
    _bindAdminEvents(letters, accs);

  } catch (e) {
    console.error('[admin] render error:', e);
    el.innerHTML = `<div style="padding:40px;text-align:center;">
      <div style="color:#ef4444;font-size:14px;font-weight:600;">로드 실패</div>
      <div style="color:var(--text-tertiary);font-size:12px;margin-top:8px;">${e.message}</div>
    </div>`;
  }
}

function _bindAdminEvents() {}

// 편지 읽음 처리
window.markLetterRead = async function(letterId) {
  try {
    await setDoc(doc(db, '_letters', letterId), { read: true }, { merge: true });
    renderAdmin();
  } catch(e) { console.error('[admin] mark read:', e); }
};

// 패치노트 에디터
window.openPatchnoteEditor = function() {
  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div'); modal.id = 'dynamic-modal'; document.body.appendChild(modal);
  modal.innerHTML = `<div class="modal-backdrop" style="display:flex;z-index:10000;" onclick="if(event.target===this)document.getElementById('dynamic-modal')?.remove();">
    <div class="modal-sheet" style="max-width:440px;padding:24px;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:16px;">새 패치노트 발행</div>
      <div style="margin-bottom:12px;">
        <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">제목</label>
        <input id="pn-title" type="text" placeholder="예: v1.2 업데이트" style="width:100%;padding:12px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;color:var(--text);background:var(--surface);outline:none;box-sizing:border-box;" onfocus="this.style.borderColor='#3182F6'" onblur="this.style.borderColor='var(--border)'">
      </div>
      <div style="margin-bottom:16px;">
        <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">내용</label>
        <textarea id="pn-body" style="width:100%;min-height:140px;padding:12px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:13px;color:var(--text);background:var(--surface);outline:none;resize:vertical;font-family:inherit;box-sizing:border-box;line-height:1.6;" placeholder="변경 사항을 적어주세요..." onfocus="this.style.borderColor='#3182F6'" onblur="this.style.borderColor='var(--border)'"></textarea>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="document.getElementById('dynamic-modal')?.remove()" style="flex:1;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text-secondary);font-size:14px;font-weight:600;cursor:pointer;">취소</button>
        <button id="pn-publish-btn" onclick="publishPatchnote()" style="flex:2;padding:14px;border:none;border-radius:12px;background:#3182F6;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">발행하기</button>
      </div>
    </div>
  </div>`;
  setTimeout(() => document.getElementById('pn-title')?.focus(), 200);
};

window.publishPatchnote = async function() {
  const title = document.getElementById('pn-title')?.value.trim();
  const body = document.getElementById('pn-body')?.value.trim();
  if (!title || !body) { alert('제목과 내용을 입력해주세요.'); return; }
  const btn = document.getElementById('pn-publish-btn');
  btn.textContent = '발행 중...'; btn.disabled = true;
  try {
    const id = 'pn_' + Date.now();
    await setDoc(doc(db, '_patchnotes', id), {
      id, title, body, createdAt: Date.now(), readBy: [],
    });
    // 모든 사용자에게 알림
    const { getAccountList, sendNotification } = await import('./data.js');
    const accs = await getAccountList();
    for (const acc of accs) {
      if (acc.id === '김_태우' || acc.id.includes('(guest)')) continue;
      await sendNotification(acc.id, {
        type: 'patchnote', from: '김_태우',
        message: `📋 새 패치노트: ${title}`,
      });
    }
    document.getElementById('dynamic-modal')?.remove();
    renderAdmin();
  } catch(e) {
    console.error('[admin] publish:', e);
    alert('발행 실패: ' + e.message);
    btn.textContent = '발행하기'; btn.disabled = false;
  }
};

// 운영자 공지 에디터
window.openAnnouncementEditor = function() {
  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div'); modal.id = 'dynamic-modal'; document.body.appendChild(modal);
  modal.innerHTML = `<div class="modal-backdrop" style="display:flex;z-index:10000;" onclick="if(event.target===this)document.getElementById('dynamic-modal')?.remove();">
    <div class="modal-sheet" style="max-width:440px;padding:24px;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:16px;">📢 운영자 공지 발송</div>
      <div style="margin-bottom:12px;">
        <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">제목</label>
        <input id="ann-title" type="text" placeholder="예: 서비스 점검 안내" style="width:100%;padding:12px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;color:var(--text);background:var(--surface);outline:none;box-sizing:border-box;" onfocus="this.style.borderColor='#F97316'" onblur="this.style.borderColor='var(--border)'">
      </div>
      <div style="margin-bottom:16px;">
        <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">내용</label>
        <textarea id="ann-body" style="width:100%;min-height:120px;padding:12px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:13px;color:var(--text);background:var(--surface);outline:none;resize:vertical;font-family:inherit;box-sizing:border-box;line-height:1.6;" placeholder="공지 내용을 적어주세요..." onfocus="this.style.borderColor='#F97316'" onblur="this.style.borderColor='var(--border)'"></textarea>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="document.getElementById('dynamic-modal')?.remove()" style="flex:1;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text-secondary);font-size:14px;font-weight:600;cursor:pointer;">취소</button>
        <button id="ann-publish-btn" onclick="publishAnnouncement()" style="flex:2;padding:14px;border:none;border-radius:12px;background:#F97316;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">전체 발송</button>
      </div>
    </div>
  </div>`;
  setTimeout(() => document.getElementById('ann-title')?.focus(), 200);
};

window.publishAnnouncement = async function() {
  const title = document.getElementById('ann-title')?.value.trim();
  const body = document.getElementById('ann-body')?.value.trim();
  if (!title) { alert('제목을 입력해주세요.'); return; }
  const btn = document.getElementById('ann-publish-btn');
  btn.textContent = '발송 중...'; btn.disabled = true;
  try {
    const { sendAnnouncement } = await import('./data.js');
    const result = await sendAnnouncement(title, body || '');
    if (result.error) throw new Error(result.error);
    document.getElementById('dynamic-modal')?.remove();
    alert('공지를 발송했어요!');
    renderAdmin();
  } catch(e) {
    console.error('[admin] announcement:', e);
    alert('발송 실패: ' + e.message);
    btn.textContent = '전체 발송'; btn.disabled = false;
  }
};

// 사용자 삭제 확인 모달
window.confirmDeleteUser = function(userId, nick) {
  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div'); modal.id = 'dynamic-modal'; document.body.appendChild(modal);
  modal.innerHTML = `<div class="modal-backdrop" style="display:flex;z-index:10000;" onclick="if(event.target===this)document.getElementById('dynamic-modal')?.remove();">
    <div class="modal-sheet" style="max-width:380px;padding:24px;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div style="text-align:center;margin-bottom:20px;">
        <div style="width:48px;height:48px;border-radius:50%;background:#FEE2E2;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 12px;">⚠️</div>
        <div style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:6px;">사용자 삭제</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.6;">
          <b>${nick}</b> 계정을 삭제하시겠어요?<br>
          <span style="color:#ef4444;font-weight:600;">모든 데이터가 영구적으로 삭제됩니다.</span><br>
          <span style="font-size:11px;color:var(--text-tertiary);">운동·식단·목표·방명록·리액션 등 전체 삭제</span>
        </div>
      </div>
      <div style="margin-bottom:16px;">
        <label style="font-size:11px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">확인을 위해 "<b>${nick}</b>" 입력</label>
        <input id="del-confirm-input" type="text" placeholder="${nick}" style="width:100%;padding:12px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;color:var(--text);background:var(--surface);outline:none;box-sizing:border-box;" onfocus="this.style.borderColor='#ef4444'" onblur="this.style.borderColor='var(--border)'">
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="document.getElementById('dynamic-modal')?.remove()" style="flex:1;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text-secondary);font-size:14px;font-weight:600;cursor:pointer;">취소</button>
        <button id="del-exec-btn" onclick="executeDeleteUser('${userId}','${nick}')" style="flex:2;padding:14px;border:none;border-radius:12px;background:#ef4444;color:#fff;font-size:14px;font-weight:600;cursor:pointer;opacity:0.5;" disabled>삭제하기</button>
      </div>
    </div>
  </div>`;
  const inp = document.getElementById('del-confirm-input');
  const btn = document.getElementById('del-exec-btn');
  inp?.addEventListener('input', () => {
    const match = inp.value.trim() === nick;
    btn.disabled = !match;
    btn.style.opacity = match ? '1' : '0.5';
  });
  setTimeout(() => inp?.focus(), 200);
};

window.executeDeleteUser = async function(userId, nick) {
  const btn = document.getElementById('del-exec-btn');
  const inp = document.getElementById('del-confirm-input');
  if (inp?.value.trim() !== nick) return;
  btn.textContent = '삭제 중...'; btn.disabled = true;
  try {
    await deleteUserAccount(userId);
    document.getElementById('dynamic-modal')?.remove();
    renderAdmin();
  } catch(e) {
    console.error('[admin] delete user:', e);
    alert('삭제 실패: ' + e.message);
    btn.textContent = '삭제하기'; btn.disabled = false;
  }
};
