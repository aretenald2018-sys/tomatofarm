// ================================================================
// auth/login-screen.js — 로그인 화면 / 잠금 화면 / 길드 온보딩
// ================================================================
// 앱 세션 시작은 app:start-user-session 이벤트 계약으로 app.js에 요청한다.
// 권한은 "어느 계정으로 로그인했는가" 하나로만 결정된다. 모드 토글이나
// 클라이언트가 심는 플래그는 이 파일에 존재하지 않는다.
// docs/reference/ACCOUNT_MODEL.md 참고.
// ================================================================

import { showToast } from '../ui/toast.js';
import {
  PERSONAL_ACCOUNT_ID,
  isAdminConsoleAccount,
  isPersonalSharedAccount,
} from '../data/account-unification.js';
import { guildPickerState } from '../social/guild-picker.js';

// ── 계정 시스템 ──
let _pendingAccount = null;
const LOGIN_SESSION_RESTORE_TIMEOUT_MS = 1800;

export function _withLoginTimeout(promise, ms, label) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[login] ${label} timed out after ${ms}ms; showing sign-in instead`);
      resolve(null);
    }, ms);
  });
  return Promise.race([
    Promise.resolve(promise).finally(() => { if (timer) clearTimeout(timer); }),
    timeout,
  ]);
}

export function _setLoginScreenVisible(visible) {
  const loginScreen = document.getElementById('login-screen');
  const loading = document.getElementById('loading');
  if (loginScreen) loginScreen.style.display = visible ? 'flex' : 'none';
  if (loading) {
    loading.style.display = visible ? 'none' : 'flex';
    loading.classList.toggle('hidden', visible);
  }
}

export function _continueToAppAfterLogin() {
  _setLoginScreenVisible(false);
  return new Promise((resolve) => {
    document.dispatchEvent(new CustomEvent('app:start-user-session', { detail: { resolve } }));
  }).catch((error) => {
    console.error('[login] session bootstrap failed:', error);
    _setLoginScreenVisible(true);
    document.getElementById('login-status').textContent = '데이터를 불러오지 못했어요. 다시 시도해주세요.';
    return false;
  });
}

export function _runDeferredLoginMaintenance() {
  // 로그인 화면은 원격 계정 정리와 무관하게 즉시 사용할 수 있어야 한다.
  // 특히 APK의 느린 네트워크에서 이 작업이 로그인 진입을 막으면 안 된다.
  Promise.resolve().then(async () => {
    const { hashPassword, saveAccount, getAccountList, recoverDeletedAccounts, getPersonalAccountId } = await import('../data.js');

    if (!localStorage.getItem('accounts_recovered_v1')) {
      const cnt = await recoverDeletedAccounts();
      if (cnt > 0) console.log('[login] 삭제된 계정 ' + cnt + '개 복구됨');
      localStorage.setItem('accounts_recovered_v1', 'done');
    }

    // 개인 계정이 비밀번호 없이 남아 있으면 잠금 화면이 무의미해진다. 없을 때만
    // 심고, 이미 설정된 비밀번호는 덮어쓰지 않는다. 관리자 콘솔 계정은
    // getAccountList() 에서 제외되므로 이 경로가 건드릴 수 없다.
    const freshAccounts = await getAccountList();
    const personalAcc = freshAccounts.find(a => a.id === getPersonalAccountId());
    if (personalAcc && !personalAcc.passwordHash) {
      personalAcc.hasPassword = true;
      personalAcc.passwordHash = hashPassword('kimtw100');
      await saveAccount(personalAcc);
    }
  }).catch((error) => console.warn('[login] deferred account maintenance failed:', error));
}

// 입력한 성/이름을 계정 id 로 바꾼다. 레거시 `(guest)` 별칭으로 입력해도
// 개인 계정 하나로 모인다.
export function _normalizeLoginId(lastName, firstName) {
  const rawId = `${lastName}_${firstName}`.toLowerCase().replace(/\s/g, '');
  return isPersonalSharedAccount(rawId) ? PERSONAL_ACCOUNT_ID : rawId;
}

export function _needsPassword(account) {
  if (!account) return false;
  // 관리자 콘솔 계정은 비밀번호 없이 열리는 경로가 없어야 한다.
  if (isAdminConsoleAccount(account.id)) return true;
  const flag = account.hasPassword;
  if (flag === true || flag === 'true' || flag === 1 || flag === '1') return true;
  if (flag === false || flag === 'false' || flag === 0 || flag === '0') return false;
  return !!account.passwordHash;
}

export function _showLoadingUntilAppReady() {
  const loading = document.getElementById('loading');
  if (!loading) return;
  if (window.__tomatoAppReady) {
    loading.style.display = 'none';
    loading.classList.add('hidden');
    return;
  }
  loading.classList.remove('hidden');
  loading.style.display = 'flex';
  window.addEventListener('tomato-app-ready', () => {
    loading.style.display = 'none';
    loading.classList.add('hidden');
  }, { once: true });
}

export function _runningDraftOwnerId(user) {
  return String((user && (user.uid || user.id || user.username || user.name)) || '_anon');
}

export function _hasRestorableRunningDraftForUser(user) {
  if (!user || typeof localStorage === 'undefined') return false;
  const ownerId = _runningDraftOwnerId(user);
  const keys = [
    'tomatofarm_running_session_draft_' + encodeURIComponent(ownerId),
    'tomatofarm_running_session_draft_active',
  ];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      let draft = JSON.parse(raw);
      if (draft?.draftKey) {
        const ownerKey = 'tomatofarm_running_session_draft_' + encodeURIComponent(ownerId);
        if (draft.draftKey !== ownerKey) continue;
        const ownerRaw = localStorage.getItem(ownerKey);
        if (!ownerRaw) continue;
        draft = JSON.parse(ownerRaw);
      }
      const phase = String(draft?.phase || '');
      if (!['active', 'paused', 'summary'].includes(phase)) continue;
      if (String(draft?.ownerId || '') !== ownerId) continue;
      return true;
    } catch {}
  }
  return false;
}

export async function initLoginScreen() {
  const { loadSavedUser, restoreUserFromBackup, getAccountList, setCurrentUser, loadAll } = await import('../data.js');

  // 이미 로그인된 사용자가 있으면 바로 진입 (localStorage → IndexedDB 순)
  let saved = loadSavedUser();
  if (!saved) saved = await _withLoginTimeout(
    restoreUserFromBackup(),
    LOGIN_SESSION_RESTORE_TIMEOUT_MS,
    'IndexedDB session restore'
  );
  if (saved) {
    const { getPersonalAccountId, isSessionUnlocked, clearLegacySessionUnlockFlags } = await import('../data.js');
    // 예전 모드 전환 시절의 플래그는 새 권한 모델에서 아무 의미도 갖지 않는다.
    clearLegacySessionUnlockFlags();
    const needsLockScreen = isPersonalSharedAccount(saved.id) || isAdminConsoleAccount(saved.id);
    if (needsLockScreen) {
      // 이미 이 세션에서 인증 완료했으면 바로 진입
      if (isSessionUnlocked()) {
        const { recordLogin: rlAuto } = await import('../data.js');
        rlAuto();
        void _continueToAppAfterLogin();
        return;
      }
      // 잠금 화면
      const {
        setCurrentUser, hashPassword, verifyPassword, saveAccount,
        markSessionUnlocked, getAccountListIncludingAdminConsole,
      } = await import('../data.js');
      const accounts = await getAccountListIncludingAdminConsole();
      let kimAcc = accounts.find(a => a.id === saved.id)
        || (isPersonalSharedAccount(saved.id)
          ? accounts.find(a => a.id === getPersonalAccountId())
          : null);
      // 개인 계정만 자가 복구한다. 관리자 콘솔 계정의 비밀번호를 클라이언트가
      // 심을 수 있으면 계정을 나눈 의미가 없어진다.
      if (kimAcc && isPersonalSharedAccount(kimAcc.id) && !kimAcc.passwordHash) {
        kimAcc.hasPassword = true;
        kimAcc.passwordHash = hashPassword('kimtw100');
        await saveAccount(kimAcc);
      }
      document.getElementById('loading').style.display = 'none';
      document.getElementById('login-screen').style.display = 'none';
      const lockDiv = document.createElement('div');
      lockDiv.id = 'kim-lock-screen';
      lockDiv.style.cssText = 'position:fixed;inset:0;z-index:9999;background:var(--bg);display:flex;align-items:center;justify-content:center;';
      lockDiv.innerHTML = `<div style="text-align:center;padding:24px;max-width:300px;width:100%;">
        <div style="width:56px;height:56px;border-radius:50%;background:#fff3e0;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 12px;">🍅</div>
        <div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:4px;">${saved.nickname || (isAdminConsoleAccount(saved.id) ? '관리자' : '김태우')}</div>
        <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:16px;">비밀번호를 입력해주세요</div>
        <input type="password" id="kim-lock-pw" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:999px;font-size:14px;text-align:center;background:var(--surface);color:var(--text);outline:none;" placeholder="비밀번호" autofocus>
        <div id="kim-lock-error" style="font-size:12px;color:#e53935;margin-top:6px;min-height:18px;"></div>
        <button id="kim-lock-btn" style="width:100%;padding:12px;border:none;border-radius:999px;background:var(--primary);color:#fff;font-size:14px;font-weight:600;cursor:pointer;margin-top:8px;">확인</button>
        <button id="kim-lock-other" style="width:100%;padding:10px;border:none;background:none;color:var(--text-tertiary);font-size:12px;cursor:pointer;margin-top:8px;">다른 계정으로 로그인</button>
      </div>`;
      document.body.appendChild(lockDiv);
      document.getElementById('kim-lock-btn').onclick = () => {
        const pw = document.getElementById('kim-lock-pw').value;
        if (kimAcc && verifyPassword(kimAcc, pw)) {
          setCurrentUser(kimAcc);
          markSessionUnlocked();
          import('../data.js').then(m => m.recordLogin());
          lockDiv.remove();
          void _continueToAppAfterLogin();
        } else {
          document.getElementById('kim-lock-error').textContent = '비밀번호가 맞지 않아요';
        }
      };
      document.getElementById('kim-lock-pw').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') document.getElementById('kim-lock-btn').click();
      });
      document.getElementById('kim-lock-other').onclick = async () => {
        const { disableInstalledAppSessionFallback, clearSessionUnlock } = await import('../data.js');
        setCurrentUser(null);
        disableInstalledAppSessionFallback();
        clearSessionUnlock();
        const { waitForAuthPersistence } = await import('../data.js');
        await waitForAuthPersistence();
        lockDiv.remove();
        location.reload();
      };
      setTimeout(() => document.getElementById('kim-lock-pw')?.focus(), 100);
      return;
    } else {
      // 길드 온보딩 팝업 (기존 사용자가 길드 미설정 시)
      const guildObKey = 'guild_onboarding_v1_' + saved.id;
      if (!localStorage.getItem(guildObKey) && !_hasRestorableRunningDraftForUser(saved)) {
        const { getAccountList, saveAccount, setCurrentUser, getAllGuilds, createGuild, createGuildJoinRequest, updateGuildMemberCount } = await import('../data.js');
        const accs = await getAccountList();
        const myAcc = accs.find(a => a.id === saved.id);
        const realName = myAcc ? myAcc.lastName + myAcc.firstName.replace(/\(.*\)/, '') : saved.id.replace(/_/g, '');
        const displayName = myAcc?.nickname || realName;

        document.getElementById('loading').style.display = 'none';
        document.getElementById('login-screen').style.display = 'none';

        // 길드 목록 미리 로드
        guildPickerState.allGuildsCache = await getAllGuilds();
        guildPickerState.selectedGuilds = [];

        const overlay = document.createElement('div');
        overlay.id = 'guild-onboarding-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;padding:20px;';
        overlay.innerHTML = `
        <div style="background:var(--bg,#fff);border-radius:var(--radius-lg,16px);max-width:360px;width:100%;padding:32px 20px 20px;box-shadow:var(--seed-s1,0 8px 32px rgba(0,0,0,0.12));overflow-y:auto;max-height:90vh;">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="width:56px;height:56px;border-radius:50%;background:var(--primary-bg,#fdf0f0);display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 12px;">🏠</div>
            <div style="font-size:17px;font-weight:700;color:var(--text,#191F28);line-height:25.5px;">소속 길드를 등록해보세요</div>
            <div style="font-size:13px;color:var(--text-tertiary,#8B95A1);margin-top:4px;">${realName}님, 안녕하세요</div>
          </div>

          <div style="background:var(--surface2,#F2F4F6);border-radius:14px;padding:16px;margin-bottom:20px;">
            <div style="font-size:12px;color:var(--text-secondary,#4E5968);line-height:1.7;">
              길드에 가입하면 <b>길드 랭킹</b>에 참여할 수 있어요.<br>
              여러 길드에 가입할 수 있고, 첫 번째가 대표 길드가 됩니다.<br>
              기존 길드에 가입하면 길드원의 확인을 받아요.
            </div>
          </div>

          <div id="ob-guild-section" style="margin-bottom:20px;">
            <div style="position:relative;">
              <div style="display:flex;gap:6px;">
                <input class="login-input" id="ob-guild-input" placeholder="길드 이름을 검색하거나 입력하세요" maxlength="20" style="flex:1;margin:0;width:100%;padding:14px 16px;border:1.5px solid var(--border,#E5E8EB);border-radius:var(--radius-md,12px);font-size:15px;color:var(--text,#191F28);background:var(--surface,#fff);outline:none;box-sizing:border-box;transition:border-color 0.1s ease-in-out;" autocomplete="off"
                       data-login-guild-prefix="ob" data-login-input-action="search-guilds" data-login-focus-action="search-guilds" data-login-enter-action="add-guild-chip">
                <button type="button" style="padding:0 14px;border:none;border-radius:var(--radius-md,12px);background:var(--primary,#fa342c);color:#fff;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;" data-login-action="add-guild-chip" data-login-guild-prefix="ob">추가</button>
              </div>
              <div id="ob-guild-suggestions" class="guild-suggest-list" style="display:none;"></div>
            </div>
            <div id="ob-guild-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;"></div>
          </div>

          <button id="ob-submit-btn" style="width:100%;padding:15px;border:none;border-radius:14px;background:var(--primary,#fa342c);color:#fff;font-size:15px;font-weight:600;cursor:pointer;transition:background 0.1s ease-in-out;margin-bottom:8px;">확인</button>
          <button id="ob-skip-btn" style="width:100%;padding:12px;border:none;border-radius:14px;background:transparent;color:var(--text-tertiary,#8B95A1);font-size:13px;cursor:pointer;">건너뛰기</button>
        </div>`;

        document.body.appendChild(overlay);

        const proceedOnboarding = async (skip) => {
          if (!skip && myAcc && guildPickerState.selectedGuilds.length > 0) {
            const guilds = myAcc.guilds || [];
            const pendingGuilds = myAcc.pendingGuilds || [];

            for (const g of guildPickerState.selectedGuilds) {
              if (g.isNew) {
                await createGuild(g.name, myAcc.id);
                if (!guilds.includes(g.name)) guilds.push(g.name);
              } else {
                if (!pendingGuilds.includes(g.name) && !guilds.includes(g.name)) {
                  pendingGuilds.push(g.name);
                  await createGuildJoinRequest(g.name, g.name, myAcc.id, displayName);
                }
              }
            }

            myAcc.guilds = guilds;
            myAcc.pendingGuilds = pendingGuilds;
            if (!myAcc.primaryGuild && guilds.length > 0) myAcc.primaryGuild = guilds[0];
            await saveAccount(myAcc);
            setCurrentUser(myAcc);
          }
          localStorage.setItem(guildObKey, 'done');
          overlay.remove();
          window.dispatchEvent(new Event('patchnote-done'));
          _showLoadingUntilAppReady();
          if (!skip && guildPickerState.selectedGuilds.length > 0) location.reload();
        };

        document.getElementById('ob-submit-btn').onclick = () => proceedOnboarding(false);
        document.getElementById('ob-skip-btn').onclick = () => proceedOnboarding(true);
        setTimeout(() => document.getElementById('ob-guild-input')?.focus(), 200);
        return;
      }

      const { recordLogin: rlAuto2 } = await import('../data.js');
      rlAuto2();
      void _continueToAppAfterLogin();
      return;
    }
  }

  // 이름 입력 시 실시간으로 기존 계정 체크
  const lastNameEl = document.getElementById('login-last-name');
  const firstNameEl = document.getElementById('login-first-name');
  let _checkTimer = null;

  async function checkAccountExists() {
    const ln = lastNameEl.value.trim();
    const fn = firstNameEl.value.trim();
    const statusEl = document.getElementById('login-status');
    const pwSection = document.getElementById('login-pw-section');
    if (!ln || !fn) {
      pwSection.style.display = 'none';
      statusEl.textContent = '';
      return;
    }
    try {
      const { getAccountListIncludingAdminConsole } = await import('../data.js');
      const id = _normalizeLoginId(ln, fn);
      const accounts = await getAccountListIncludingAdminConsole();
      const found = accounts.find(a => a.id === id);

      const modeSection = document.getElementById('login-mode-section');
      if (modeSection) modeSection.style.display = 'none';
      // 개인 계정과 관리자 콘솔 계정은 계정 존재 여부를 노출하지 않고 항상
      // 비밀번호를 묻는다.
      if (isPersonalSharedAccount(id) || isAdminConsoleAccount(id)) {
        pwSection.style.display = 'block';
        statusEl.innerHTML = '<span style="color:var(--primary);">비밀번호를 입력해주세요.</span>';
        return;
      }

      if (found) {
        if (_needsPassword(found)) {
          pwSection.style.display = 'block';
          statusEl.innerHTML = '<span style="color:var(--primary);">비밀번호를 입력해주세요.</span>';
        } else {
          pwSection.style.display = 'none';
          statusEl.innerHTML = '<span style="color:var(--primary);">기존 계정이에요. 바로 로그인할 수 있어요.</span>';
        }
      } else {
        pwSection.style.display = 'none';
        statusEl.innerHTML = '<span style="color:var(--text-tertiary);">계정이 없어요. 가입하기를 눌러주세요.</span>';
      }
    } catch (e) {
      pwSection.style.display = 'none';
      statusEl.innerHTML = '<span style="color:#ef4444;">로그인 상태 확인 중 오류가 발생했어요. 다시 시도해주세요.</span>';
      console.warn('[login] checkAccountExists error:', e);
    }
  }

  [lastNameEl, firstNameEl].forEach(el => {
    el.addEventListener('input', () => {
      clearTimeout(_checkTimer);
      _checkTimer = setTimeout(checkAccountExists, 300);
    });
    el.addEventListener('change', checkAccountExists);
    el.addEventListener('blur', checkAccountExists);
  });

  // 로딩 숨기기, 로그인 표시 후 원격 유지보수는 백그라운드에서 실행한다.
  _setLoginScreenVisible(true);
  _runDeferredLoginMaintenance();
}

export async function selectAccount(accountId) {
  const { getAccountList, verifyPassword, setCurrentUser } = await import('../data.js');
  const accounts = await getAccountList();
  const account = accounts.find(a => a.id === accountId);
  if (!account) return;

  if (_needsPassword(account)) {
    _pendingAccount = account;
    document.getElementById('login-pw-modal-name').textContent = `${account.lastName}${account.firstName}`;
    document.getElementById('login-pw-modal').style.display = 'flex';
    document.getElementById('login-pw-modal-error').style.display = 'none';
    setTimeout(() => document.getElementById('login-pw-modal-input').focus(), 100);
    return;
  }

  setCurrentUser(account);
  return _continueToAppAfterLogin();
}

export async function verifyAndLogin() {
  if (!_pendingAccount) { console.error('[login] _pendingAccount is null'); return; }
  const { verifyPassword, setCurrentUser, hashPassword } = await import('../data.js');
  const pw = document.getElementById('login-pw-modal-input').value;

  console.log('[login] 비밀번호 검증:', {
    account: _pendingAccount.id,
    hasPassword: _pendingAccount.hasPassword,
    storedHash: _pendingAccount.passwordHash,
    inputHash: hashPassword(pw),
  });

  if (!verifyPassword(_pendingAccount, pw)) {
    document.getElementById('login-pw-modal-error').style.display = 'block';
    return;
  }

  setCurrentUser(_pendingAccount);
  document.getElementById('login-pw-modal').style.display = 'none';
  return _continueToAppAfterLogin();
}

export function closePasswordModal() {
  document.getElementById('login-pw-modal').style.display = 'none';
  _pendingAccount = null;
}

export async function createAccountAndLogin() {
  const lastName = document.getElementById('login-last-name').value.trim();
  const firstName = document.getElementById('login-first-name').value.trim();
  if (!lastName || !firstName) { showToast('성과 이름을 입력해주세요', 2500, 'warning'); return; }

  const {
    setCurrentUser, getAccountListIncludingAdminConsole, verifyPassword,
    markSessionUnlocked, clearSessionUnlock,
  } = await import('../data.js');

  const newId = _normalizeLoginId(lastName, firstName);
  const existing = await getAccountListIncludingAdminConsole();
  const found = existing.find(a => a.id === newId);

  if (!found) {
    document.getElementById('login-status').innerHTML = '<span style="color:var(--text-tertiary);">계정이 없어요. 가입하기를 눌러주세요.</span>';
    return;
  }

  if (_needsPassword(found)) {
    const pw = document.getElementById('login-password')?.value || '';
    if (!pw) { document.getElementById('login-password')?.focus(); return; }
    if (!verifyPassword(found, pw)) {
      document.getElementById('login-status').innerHTML = '<span style="color:#ef4444;">비밀번호가 맞지 않아요.</span>';
      return;
    }
    setCurrentUser(found);
    // 잠금 화면이 붙는 계정만 세션 해제를 기록한다. 다른 계정에는 잠금이 없으니
    // 남겨둘 상태도 없다.
    if (isPersonalSharedAccount(found.id) || isAdminConsoleAccount(found.id)) {
      markSessionUnlocked();
    } else {
      clearSessionUnlock();
    }
    const { recordLogin: rl1 } = await import('../data.js');
    rl1();
  } else {
    setCurrentUser(found);
    clearSessionUnlock();
    const { recordLogin: rl2 } = await import('../data.js');
    rl2();
  }

  return _continueToAppAfterLogin();
}

export async function logoutAccount() {
  const { getCurrentUser } = await import('../data.js');
  const user = getCurrentUser();
  const name = user ? `${user.lastName}${user.firstName}`.replace(/\(.*\)/, '') : '';

  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div'); modal.id = 'dynamic-modal'; document.body.appendChild(modal);
  modal.innerHTML = `
    <div class="modal-backdrop" style="display:flex;z-index:10000;" data-login-action="close-dynamic-modal">
      <div class="modal-sheet" style="max-width:340px;padding:24px;text-align:center;">
        <div style="width:48px;height:48px;border-radius:50%;background:#fff3e0;display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 12px;">🍅</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:2px;">${name || '계정'}</div>
        <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:12px;">
          별명: ${user?.nickname || name}
          <button data-login-action="open-nickname-edit" style="background:none;border:none;color:var(--primary);font-size:11px;font-weight:600;cursor:pointer;padding:0 4px;">변경</button>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <button data-login-action="open-own-profile" data-user-id="${user?.id || ''}" data-user-name="${name.replace(/"/g, '&quot;')}" style="width:100%;padding:9px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text);font-size:12px;font-weight:500;cursor:pointer;">🏡 내 프로필</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button data-login-action="close-dynamic-modal" style="flex:1;padding:12px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:14px;font-weight:600;cursor:pointer;">닫기</button>
          <button data-login-action="confirm-logout" style="flex:1;padding:12px;border-radius:999px;border:none;background:var(--surface2);color:var(--text-secondary);font-size:14px;font-weight:600;cursor:pointer;">계정 전환</button>
        </div>
      </div>
    </div>
  `;
}

export async function signOutToLoginScreen() {
  const { setCurrentUser, clearSessionUnlock, disableInstalledAppSessionFallback } = await import('../data.js');
  setCurrentUser(null);
  disableInstalledAppSessionFallback();
  clearSessionUnlock();
  const { waitForAuthPersistence } = await import('../data.js');
  await waitForAuthPersistence();
  location.reload();
}

const confirmLogout = signOutToLoginScreen;
export { confirmLogout };

export async function openNicknameEdit() {
  const { getCurrentUser, saveAccount, setCurrentUser } = await import('../data.js');
  const user = getCurrentUser();
  if (!user) return;
  const newNick = prompt('새 별명을 입력하세요', user.nickname || '');
  if (newNick === null || !newNick.trim()) return;
  user.nickname = newNick.trim();
  await saveAccount(user);
  setCurrentUser(user);
  document.getElementById('dynamic-modal')?.remove();
  location.reload();
}
