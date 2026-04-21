// ================================================================
// feature-login.js — 로그인/가입/잠금/길드 온보딩 흐름
// ================================================================
// R1 리팩토링: index.html 의 1450줄 인라인 스크립트를 외부 모듈로 이관.
// 기존 동작 무변경 — 전역 함수/전역 변수로 동작하던 것 그대로 유지.
// HTML onclick="..." 참조를 위해 모든 주요 함수는 window.* 에 등록.
//
// 로드 순서: index.html 상단에서 Chart.js / Sortable 뒤, app.js(module) 앞에
// 일반 <script> 로 로드. 비동기 import 는 함수 내부에서만 사용.
// ================================================================
// 테마 토글
// ── 계정 시스템 ──
let _pendingAccount = null;

function _needsPassword(account) {
  if (!account) return false;
  const flag = account.hasPassword;
  if (flag === true || flag === 'true' || flag === 1 || flag === '1') return true;
  if (flag === false || flag === 'false' || flag === 0 || flag === '0') return false;
  return !!account.passwordHash;
}

async function initLoginScreen() {
  const { loadSavedUser, restoreUserFromBackup, getAccountList, setCurrentUser, loadAll } = await import('./data.js');

  // 이미 로그인된 사용자가 있으면 바로 진입 (localStorage → IndexedDB 순)
  let saved = loadSavedUser();
  if (!saved) saved = await restoreUserFromBackup();
  if (saved) {
    const { isAdminInstance, getAdminId } = await import('./data.js');
    const isKimSaved = isAdminInstance(saved.id);
    if (isKimSaved) {
      // 이미 이 세션에서 인증 완료했으면 바로 진입
      if (localStorage.getItem('admin_authenticated') || localStorage.getItem('kim_authenticated')) {
        const { recordLogin: rlAuto } = await import('./data.js');
        rlAuto();
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('loading').style.display = 'flex';
        return;
      }
      // 김태우 잠금 화면
      const { setCurrentUser, hashPassword, verifyPassword, getAccountList, saveAccount, backupAdminAuth } = await import('./data.js');
      const accounts = await getAccountList();
      let kimAcc = accounts.find(a => a.id === getAdminId()) || accounts.find(a => a.id === saved.id);
      if (kimAcc && (!kimAcc.hasPassword || !kimAcc.passwordHash)) {
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
        <div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:4px;">${saved.nickname || '김태우'}</div>
        <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:16px;">비밀번호를 입력해주세요</div>
        <input type="password" id="kim-lock-pw" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:999px;font-size:14px;text-align:center;background:var(--surface);color:var(--text);outline:none;" placeholder="비밀번호" autofocus onkeydown="if(event.key==='Enter')document.getElementById('kim-lock-btn').click()">
        <div id="kim-lock-error" style="font-size:12px;color:#e53935;margin-top:6px;min-height:18px;"></div>
        <button id="kim-lock-btn" style="width:100%;padding:12px;border:none;border-radius:999px;background:var(--primary);color:#fff;font-size:14px;font-weight:600;cursor:pointer;margin-top:8px;">확인</button>
        <button id="kim-lock-other" style="width:100%;padding:10px;border:none;background:none;color:var(--text-tertiary);font-size:12px;cursor:pointer;margin-top:8px;">다른 계정으로 로그인</button>
      </div>`;
      document.body.appendChild(lockDiv);
      document.getElementById('kim-lock-btn').onclick = () => {
        const pw = document.getElementById('kim-lock-pw').value;
        if (kimAcc && verifyPassword(kimAcc, pw)) {
          setCurrentUser(kimAcc);
          localStorage.setItem('admin_authenticated', 'true');
          backupAdminAuth();
          import('./data.js').then(m => m.recordLogin());
          lockDiv.remove();
          document.getElementById('loading').style.display = 'flex';
          location.reload();
        } else {
          document.getElementById('kim-lock-error').textContent = '비밀번호가 맞지 않아요';
        }
      };
      document.getElementById('kim-lock-other').onclick = () => {
        setCurrentUser(null);
        localStorage.removeItem('admin_authenticated');
        localStorage.removeItem('kim_authenticated');
        lockDiv.remove();
        location.reload();
      };
      setTimeout(() => document.getElementById('kim-lock-pw')?.focus(), 100);
      return;
    } else {
      // 길드 온보딩 팝업 (기존 사용자가 길드 미설정 시)
      const guildObKey = 'guild_onboarding_v1_' + saved.id;
      if (!localStorage.getItem(guildObKey)) {
        const { getAccountList, saveAccount, setCurrentUser, getAllGuilds, createGuild, createGuildJoinRequest, updateGuildMemberCount } = await import('./data.js');
        const accs = await getAccountList();
        const myAcc = accs.find(a => a.id === saved.id);
        const realName = myAcc ? myAcc.lastName + myAcc.firstName.replace(/\(.*\)/, '') : saved.id.replace(/_/g, '');
        const displayName = myAcc?.nickname || realName;

        document.getElementById('loading').style.display = 'none';
        document.getElementById('login-screen').style.display = 'none';

        // 길드 목록 미리 로드
        _allGuildsCache = await getAllGuilds();
        _selectedGuilds = [];

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
                       oninput="searchGuildsFor('ob')" onfocus="searchGuildsFor('ob');this.style.borderColor='var(--primary)'"
                       onblur="this.style.borderColor='var(--border,#E5E8EB)'"
                       onkeydown="if(event.key==='Enter'){event.preventDefault();addGuildChipFor('ob');}">
                <button type="button" style="padding:0 14px;border:none;border-radius:var(--radius-md,12px);background:var(--primary,#fa342c);color:#fff;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;" onclick="addGuildChipFor('ob')">추가</button>
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
          if (!skip && myAcc && _selectedGuilds.length > 0) {
            const guilds = myAcc.guilds || [];
            const pendingGuilds = myAcc.pendingGuilds || [];

            for (const g of _selectedGuilds) {
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
          window._patchnoteDone = true;
          window.dispatchEvent(new Event('patchnote-done'));
          document.getElementById('loading').style.display = 'flex';
          if (!skip && _selectedGuilds.length > 0) location.reload();
        };

        document.getElementById('ob-submit-btn').onclick = () => proceedOnboarding(false);
        document.getElementById('ob-skip-btn').onclick = () => proceedOnboarding(true);
        setTimeout(() => document.getElementById('ob-guild-input')?.focus(), 200);
        return;
      }

      const { recordLogin: rlAuto2 } = await import('./data.js');
      rlAuto2();
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('loading').style.display = 'flex';
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
      const { getAdminId, isAdminInstance, getAccountList } = await import('./data.js');
      const rawId = `${ln}_${fn}`.toLowerCase().replace(/\s/g, '');
      const id = (isAdminInstance(rawId) || rawId === getAdminId()) ? getAdminId() : rawId;
      const accounts = await getAccountList();
      const found = accounts.find(a => a.id === id);

      // 김/태우 입력 시 비밀번호만 (Guest UX 기본)
      const modeSection = document.getElementById('login-mode-section');
      if (modeSection) modeSection.style.display = 'none';
      if (ln === '김' && fn === '태우') {
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
  window._checkAccountExists = checkAccountExists;

  [lastNameEl, firstNameEl].forEach(el => {
    el.addEventListener('input', () => {
      clearTimeout(_checkTimer);
      _checkTimer = setTimeout(checkAccountExists, 300);
    });
    el.addEventListener('change', checkAccountExists);
    el.addEventListener('blur', checkAccountExists);
  });

  // 김태우 계정(Admin/Guest) 비밀번호 통일 + 더미 계정 정리
  try {
    const { hashPassword, saveAccount } = await import('./data.js');
    const { getAdminId: gAId } = await import('./data.js');

    // 더미 계정 삭제 — 비활성화 (계정이 삭제되는 버그 원인이었음)
    // 삭제된 계정 1회 복구 (이전 삭제 코드로 유실된 계정)
    if (!localStorage.getItem('accounts_recovered_v1')) {
      const { recoverDeletedAccounts } = await import('./data.js');
      const cnt = await recoverDeletedAccounts();
      if (cnt > 0) console.log('[login] 삭제된 계정 ' + cnt + '개 복구됨');
      localStorage.setItem('accounts_recovered_v1', 'done');
    }

    // Admin/Guest 비밀번호 통일 + nickname/firstName 완전 동기화
    const freshAccounts = await getAccountList();
    const adminAcc2 = freshAccounts.find(a => a.id === gAId());
    if (adminAcc2) {
      adminAcc2.hasPassword = true;
      adminAcc2.passwordHash = hashPassword('kimtw100');
      await saveAccount(adminAcc2);
    }
  } catch(e) { console.warn('[login] pw update err:', e); }

  // 로딩 숨기기, 로그인 표시
  document.getElementById('loading').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

async function selectAccount(accountId) {
  const { getAccountList, verifyPassword, setCurrentUser } = await import('./data.js');
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
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('loading').style.display = 'flex';
  location.reload();
}

async function verifyAndLogin() {
  if (!_pendingAccount) { console.error('[login] _pendingAccount is null'); return; }
  const { verifyPassword, setCurrentUser, hashPassword } = await import('./data.js');
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
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('loading').style.display = 'flex';
  location.reload();
}

function closePasswordModal() {
  document.getElementById('login-pw-modal').style.display = 'none';
  _pendingAccount = null;
}

// 모드 선택 라디오 하이라이트
document.addEventListener('change', (e) => {
  if (e.target.name !== 'login-mode') return;
  document.querySelectorAll('#login-mode-section label').forEach(lbl => {
    const radio = lbl.querySelector('input[type="radio"]');
    lbl.style.borderColor = radio.checked ? 'var(--primary)' : 'transparent';
  });
});

// ── 로그인/가입 뷰 전환 ─────────────────────────────────────────
function showSignupView() {
  _selectedGuilds = [];
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('signup-view').style.display = '';
  document.getElementById('signup-last-name')?.focus();
}
function showLoginView() {
  _selectedGuilds = [];
  document.getElementById('signup-view').style.display = 'none';
  document.getElementById('login-view').style.display = '';
  document.getElementById('login-last-name')?.focus();
}
window.showSignupView = showSignupView;
window.showLoginView = showLoginView;

// ── 가입 전용 함수 ─────────────────────────────────────────────
async function createAccountFromSignup() {
  const lastName = document.getElementById('signup-last-name').value.trim();
  const firstName = document.getElementById('signup-first-name').value.trim();
  if (!lastName || !firstName) { window.showToast?.('성과 이름을 입력해주세요', 2500, 'warning'); return; }

  const { saveAccount, setCurrentUser, hashPassword, getAccountList } = await import('./data.js');
  const { getAdminId: _gAI, isAdminInstance: _isAI } = await import('./data.js');

  let newId;
  const _tryId = `${lastName}_${firstName}`.toLowerCase().replace(/\s/g, '');
  if (_isAI(_tryId) || _tryId === _gAI()) { newId = _gAI(); }
  else { newId = _tryId; }

  const existing = await getAccountList();
  const found = existing.find(a => a.id === newId);
  if (found) {
    document.getElementById('signup-status').innerHTML = '<span style="color:#ef4444;">이미 존재하는 계정이에요. 로그인해주세요.</span>';
    return;
  }

  const nickname = document.getElementById('signup-nickname')?.value.trim() || '';
  if (!nickname) {
    document.getElementById('signup-status').innerHTML = '<span style="color:#ef4444;">별명을 입력해주세요.</span>';
    document.getElementById('signup-nickname')?.focus();
    return;
  }

  const usePw = document.getElementById('signup-pw-toggle')?.classList.contains('on');
  const pw = document.getElementById('signup-new-password')?.value || '';

  // 길드 처리
  const { createGuild, createGuildJoinRequest } = await import('./data.js');
  const guilds = [];
  const pendingGuilds = [];

  for (const g of _selectedGuilds) {
    if (g.isNew) {
      await createGuild(g.name, newId);
      guilds.push(g.name);
    } else {
      pendingGuilds.push(g.name);
    }
  }

  const primaryGuild = guilds.length > 0 ? guilds[0] : null;

  const account = {
    id: newId, lastName, firstName,
    nickname,
    hasPassword: usePw && pw.length > 0,
    passwordHash: usePw && pw.length > 0 ? hashPassword(pw) : null,
    createdAt: Date.now(),
    guilds, pendingGuilds, primaryGuild,
  };

  await saveAccount(account);

  // 길드 가입 요청 + 온보딩 플래그 설정
  for (const gName of pendingGuilds) {
    await createGuildJoinRequest(gName, gName, newId, nickname);
  }
  if (guilds.length > 0 || pendingGuilds.length > 0) {
    localStorage.setItem('guild_onboarding_v1_' + newId, 'done');
  }

  setCurrentUser(account);
  const { recordLogin: rl } = await import('./data.js');
  rl();
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('loading').style.display = 'flex';
  location.reload();
}
window.createAccountFromSignup = createAccountFromSignup;

// ── 가입 토글 (TDS Switch) ───────────────────────────────────────
function toggleSignupGuild() {
  const sw = document.getElementById('signup-guild-toggle');
  const field = document.getElementById('signup-guild-field');
  if (!sw || !field) return;
  const on = sw.classList.toggle('on');
  sw.setAttribute('aria-checked', on);
  field.style.display = on ? 'block' : 'none';
  if (on) {
    // 드롭다운 자동 노출 (기존 길드 리스트)
    const inp = document.getElementById('signup-guild-input');
    if (inp) inp.focus();
    _loadAllGuilds().then(() => searchGuildsFor('signup'));
  }
}
function toggleSignupPw() {
  const sw = document.getElementById('signup-pw-toggle');
  const field = document.getElementById('signup-pw-field');
  if (!sw || !field) return;
  const on = sw.classList.toggle('on');
  sw.setAttribute('aria-checked', on);
  field.style.display = on ? 'block' : 'none';
  if (on) document.getElementById('signup-new-password')?.focus();
}
window.toggleSignupGuild = toggleSignupGuild;
window.toggleSignupPw = toggleSignupPw;

// ── 길드 입력 헬퍼 (파라미터화: prefix = 'signup' | 'ob') ──────
let _allGuildsCache = null;
let _selectedGuilds = []; // [{name, isNew}]

async function _loadAllGuilds() {
  if (_allGuildsCache) return _allGuildsCache;
  const { getAllGuilds } = await import('./data.js');
  _allGuildsCache = await getAllGuilds();
  return _allGuildsCache;
}

// prefix별 ID: {prefix}-guild-input, {prefix}-guild-suggestions, {prefix}-guild-chips
async function searchGuildsFor(prefix) {
  const input = document.getElementById(prefix + '-guild-input');
  const sugBox = document.getElementById(prefix + '-guild-suggestions');
  if (!sugBox || !input) return;
  const q = (input.value || '').trim().toLowerCase();
  const guilds = await _loadAllGuilds();
  // 빈 쿼리일 때도 전체 목록 표시 (드롭다운)
  const filtered = guilds.filter(g => (!q || g.name.toLowerCase().includes(q)) && !_selectedGuilds.some(s => s.name === g.name));
  if (!filtered.length) { sugBox.style.display = 'none'; return; }
  sugBox.innerHTML = filtered.slice(0, 8).map(g =>
    `<div class="guild-suggest-item" onclick="selectGuildFor('${prefix}','${g.name.replace(/'/g, "\\'")}')">
      <span>${g.name}</span><span style="font-size:11px;color:var(--text-tertiary);">${g.memberCount || 0}명</span>
    </div>`
  ).join('');
  sugBox.style.display = '';
}

function selectGuildFor(prefix, name) {
  if (_selectedGuilds.some(g => g.name === name)) return;
  _selectedGuilds.push({ name, isNew: false });
  document.getElementById(prefix + '-guild-input').value = '';
  document.getElementById(prefix + '-guild-suggestions').style.display = 'none';
  _renderGuildChips(prefix + '-guild-chips');
}

function addGuildChipFor(prefix) {
  const input = document.getElementById(prefix + '-guild-input');
  const name = (input?.value || '').trim();
  if (!name || _selectedGuilds.some(g => g.name === name)) { if (input) input.value = ''; return; }
  const existing = (_allGuildsCache || []).find(g => g.name === name);
  _selectedGuilds.push({ name, isNew: !existing });
  input.value = '';
  document.getElementById(prefix + '-guild-suggestions').style.display = 'none';
  _renderGuildChips(prefix + '-guild-chips');
}

function removeGuildChip(name, containerId) {
  _selectedGuilds = _selectedGuilds.filter(g => g.name !== name);
  _renderGuildChips(containerId);
}

function _renderGuildChips(containerId) {
  const box = document.getElementById(containerId);
  if (!box) return;
  box.innerHTML = _selectedGuilds.map((g, i) => {
    const pendingBadge = g.isNew ? '' : '<span class="guild-chip-badge pending">승인 대기</span>';
    const newBadge = g.isNew ? '<span class="guild-chip-badge new">새 길드</span>' : '';
    const primaryMark = i === 0 && g.isNew ? ' primary' : '';
    return `<span class="guild-chip${primaryMark}" title="${g.isNew ? '새로 만드는 길드 (바로 가입)' : '기존 길드 (승인 필요)'}">
      ${g.name}${pendingBadge}${newBadge}
      <button class="guild-chip-remove" onclick="removeGuildChip('${g.name.replace(/'/g, "\\'")}','${containerId}')">&times;</button>
    </span>`;
  }).join('');
}

window.searchGuildsFor = searchGuildsFor;
window.selectGuildFor = selectGuildFor;
window.addGuildChipFor = addGuildChipFor;
window.removeGuildChip = removeGuildChip;

// 클릭 외부 닫기
document.addEventListener('click', (e) => {
  ['signup-guild-suggestions', 'ob-guild-suggestions', 'gm-guild-suggestions'].forEach(id => {
    const box = document.getElementById(id);
    if (box && !e.target.closest('#' + id.replace('-suggestions', '-section').replace('gm-guild-section', 'guild-modal-input-section'))) {
      box.style.display = 'none';
    }
  });
});

async function createAccountAndLogin() {
  const lastName = document.getElementById('login-last-name').value.trim();
  const firstName = document.getElementById('login-first-name').value.trim();
  if (!lastName || !firstName) { window.showToast?.('성과 이름을 입력해주세요', 2500, 'warning'); return; }

  const { setCurrentUser, getAccountList, verifyPassword } = await import('./data.js');
  const { getAdminId: _gAI, isAdminInstance: _isAI } = await import('./data.js');

  let newId;
  const _tryId = `${lastName}_${firstName}`.toLowerCase().replace(/\s/g, '');
  if (_isAI(_tryId) || _tryId === _gAI()) { newId = _gAI(); }
  else { newId = _tryId; }

  const existing = await getAccountList();
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
    const { backupAdminAuth: bkAuth, recordLogin: rl1 } = await import('./data.js');
    if (found.id === _gAI() || _isAI(found.id)) {
      localStorage.setItem('admin_authenticated', 'true');
      bkAuth();
    } else {
      localStorage.removeItem('admin_authenticated');
      localStorage.removeItem('kim_authenticated');
    }
    rl1();
  } else {
    setCurrentUser(found);
    localStorage.removeItem('admin_authenticated');
    localStorage.removeItem('kim_authenticated');
    const { recordLogin: rl2 } = await import('./data.js');
    rl2();
  }

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('loading').style.display = 'flex';
  location.reload();
}

async function logoutAccount() {
  const { getCurrentUser, setCurrentUser, isAdmin, isAdminGuest, getAccountList } = await import('./data.js');
  const user = getCurrentUser();
  const name = user ? `${user.lastName}${user.firstName}`.replace(/\(.*\)/, '') : '';
  const isKimTaewoo = isAdmin() || isAdminGuest();

  // 김태우 계정이면 모드 전환 옵션 추가
  let modeSwitch = '';
  if (isKimTaewoo) {
    const currentMode = isAdmin() ? 'Admin' : 'Guest';
    const otherMode = isAdmin() ? 'Guest' : 'Admin';
    const otherLabel = isAdmin() ? '게스트 모드로 전환' : '어드민 모드로 전환';
    modeSwitch = `
      <div style="border-top:1px solid var(--border);margin:16px -24px 0;padding:16px 24px 0;">
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px;">현재: ${currentMode} 모드</div>
        <button onclick="switchKimMode('${otherMode}')" style="width:100%;padding:12px;border-radius:var(--radius-md);border:1px solid var(--primary);background:var(--primary-bg);color:var(--primary);font-size:14px;font-weight:600;cursor:pointer;margin-bottom:8px;">${otherLabel}</button>
      </div>
    `;
  }

  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div'); modal.id = 'dynamic-modal'; document.body.appendChild(modal);
  modal.innerHTML = `
    <div class="modal-backdrop" style="display:flex;z-index:10000;" onclick="if(event.target===this){document.getElementById('dynamic-modal')?.remove();}">
      <div class="modal-sheet" style="max-width:340px;padding:24px;text-align:center;">
        <div style="width:48px;height:48px;border-radius:50%;background:#fff3e0;display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 12px;">🍅</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:2px;">${name || '계정'}</div>
        <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:12px;">
          별명: ${user?.nickname || name}
          <button onclick="openNicknameEdit()" style="background:none;border:none;color:var(--primary);font-size:11px;font-weight:600;cursor:pointer;padding:0 4px;">변경</button>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <button onclick="document.getElementById('dynamic-modal')?.remove();openFriendProfile('${user?.id}','${name}')" style="width:100%;padding:9px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text);font-size:12px;font-weight:500;cursor:pointer;">🏡 내 프로필</button>
        </div>
        ${modeSwitch}
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button onclick="document.getElementById('dynamic-modal')?.remove();" style="flex:1;padding:12px;border-radius:999px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:14px;font-weight:600;cursor:pointer;">닫기</button>
          <button onclick="confirmLogout()" style="flex:1;padding:12px;border-radius:999px;border:none;background:var(--surface2);color:var(--text-secondary);font-size:14px;font-weight:600;cursor:pointer;">계정 전환</button>
        </div>
      </div>
    </div>
  `;
}

async function confirmLogout() {
  const { setCurrentUser, clearAdminAuth } = await import('./data.js');
  setCurrentUser(null);
  localStorage.removeItem('admin_authenticated');
  localStorage.removeItem('kim_authenticated');
  clearAdminAuth();
  location.reload();
}

async function switchKimMode(mode) {
  const { setKimMode } = await import('./data.js');
  setKimMode(mode === 'Admin' ? 'admin' : 'guest');
  location.reload();
}
window.switchKimMode = switchKimMode;

async function openNicknameEdit() {
  const { getCurrentUser, saveAccount, setCurrentUser } = await import('./data.js');
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
window.openNicknameEdit = openNicknameEdit;

// ── 길드 모달 (프로필 CRUD) ──────────────────────────────────────
let _guildModalGuilds = []; // [{name, status:'member'|'pending'}]
let _guildModalPrimary = null;
let _guildIconMap = {}; // guildName → icon emoji

const GUILD_ICON_OPTIONS = ['🏠','🏃','💪','🧘','🏋️','🚴','⚽','🎾','🏊','🥊','🧗','🎯','🔥','🌿','🍅','⭐'];

let _guildLeaderMap = {}; // guildName → leaderId
let _guildModalUserId = null;
let _guildModalSocialId = null; // admin/guest 매핑 적용된 소셜 ID

// 현재 유저가 해당 길드의 길드장인지 (admin/guest 매핑 포함)
function _isMyGuildLeader(guildName) {
  const leader = _guildLeaderMap[guildName];
  if (!leader) return false;
  return leader === _guildModalUserId || leader === _guildModalSocialId;
}

async function openGuildModal() {
  const { getCurrentUser, getAllGuilds, isAdminGuest, getAdminId } = await import('./data.js');
  const user = getCurrentUser();
  if (!user) return;
  _guildModalUserId = user.id;
  _guildModalSocialId = isAdminGuest() ? getAdminId() : user.id;

  _allGuildsCache = await getAllGuilds();
  _guildIconMap = {};
  _guildLeaderMap = {};
  _allGuildsCache.forEach(g => {
    if (g.icon) _guildIconMap[g.name] = g.icon;
    if (g.leader || g.createdBy) _guildLeaderMap[g.name] = g.leader || g.createdBy;
  });

  _guildModalGuilds = [
    ...(user.guilds || []).map(g => ({ name: g, status: 'member' })),
    ...(user.pendingGuilds || []).map(g => ({ name: g, status: 'pending' })),
  ];
  _guildModalPrimary = user.primaryGuild || null;

  const modal = document.getElementById('guild-modal');
  if (modal) {
    modal.style.display = 'flex';
    _renderGuildModalList();
  }
}

function closeGuildModal(e) {
  if (e && e.target !== e.currentTarget) return;
  const modal = document.getElementById('guild-modal');
  if (modal) modal.style.display = 'none';
}

function _closeOtherGuildPanels(targetGuildName, panelType) {
  _guildModalGuilds.forEach(g => {
    const safeId = g.name.replace(/[^a-zA-Z0-9가-힣]/g, '_');
    const membersEl = document.getElementById('gm-members-' + safeId);
    const iconEl = document.getElementById('gm-icon-picker-' + safeId);
    if (membersEl && !(panelType === 'members' && g.name === targetGuildName)) membersEl.style.display = 'none';
    if (iconEl && !(panelType === 'icon' && g.name === targetGuildName)) iconEl.style.display = 'none';
  });
}

function _renderGuildModalList() {
  const list = document.getElementById('guild-modal-list');
  if (!list) return;
  if (!_guildModalGuilds.length) {
    list.innerHTML = '<div class="gm-empty-state">아직 소속 길드가 없어요</div>';
    return;
  }
  list.innerHTML = _guildModalGuilds.map(g => {
    const isPrimary = g.name === _guildModalPrimary;
    const iconVal = _guildIconMap[g.name] || '🏠';
    const isPhoto = iconVal.startsWith('data:');
    const iconDisplay = isPhoto
      ? `<img src="${iconVal}">`
      : iconVal;
    const safeName = g.name.replace(/'/g, "\\'");
    const starBtn = g.status === 'member'
      ? `<button class="gm-primary-btn${isPrimary ? ' is-active' : ''}" onclick="toggleGuildPrimary('${safeName}')" title="대표 길드 설정">${isPrimary ? '★' : '☆'}</button>`
      : '';
    const amLeader = g.status === 'member' && _isMyGuildLeader(g.name);
    const leaderBadge = amLeader ? ' <span class="guild-leader-badge">👑 길드장</span>' : '';
    const badge = g.status === 'pending'
      ? '<span class="guild-chip-badge pending">승인 대기 중</span>'
      : '';
    const memberBtn = g.status === 'member'
      ? `<button class="gm-action-pill" type="button" onclick="toggleGuildMembers('${safeName}')">멤버보기</button>`
      : '';
    const iconBtn = g.status === 'member'
      ? `<button class="gm-icon-btn" type="button" onclick="toggleGuildIconPicker('${safeName}')" title="탭하여 아이콘 변경">${iconDisplay}<span class="gm-icon-edit-badge">✎</span></button>`
      : `<span class="gm-icon-static">${iconDisplay}</span>`;
    const safeId = g.name.replace(/[^a-zA-Z0-9가-힣]/g, '_');
    return `<div>
      <div class="gm-guild-row">
        ${starBtn}${iconBtn}
        <div class="gm-guild-info"><span class="gm-guild-name${isPrimary ? ' is-primary' : ''}">${g.name}</span>${leaderBadge}${badge}</div>
        <div class="gm-guild-actions">
          ${memberBtn}
          <button class="gm-action-pill gm-remove" type="button" onclick="removeGuildFromModal('${safeName}')">삭제</button>
        </div>
      </div>
      <div class="gm-icon-picker" id="gm-icon-picker-${safeId}"></div>
      <div class="gm-members-panel" id="gm-members-${safeId}"></div>
    </div>`;
  }).join('');
}

async function toggleGuildMembers(guildName) {
  const safeId = guildName.replace(/[^a-zA-Z0-9가-힣]/g, '_');
  const el = document.getElementById('gm-members-' + safeId);
  if (!el) return;
  if (getComputedStyle(el).display !== 'none') { el.style.display = 'none'; return; }
  _closeOtherGuildPanels(guildName, 'members');

  // 길드원 목록 + 길드장 정보 로드
  const { getAccountList: gal, getGuildLeader, getCurrentUser } = await import('./data.js');
  const accounts = await gal();
  const members = accounts.filter(a => (a.guilds || []).includes(guildName));
  const leaderId = await getGuildLeader(guildName);
  const currentUser = getCurrentUser();
  const amILeader = currentUser && (leaderId === currentUser.id || leaderId === _guildModalSocialId);

  if (!members.length) {
    el.innerHTML = '<div class="gm-member-row"><span class="gm-member-name" style="color:var(--text-tertiary);">길드원이 없어요</span></div>';
  } else {
    el.innerHTML = members.map(m => {
      const isLeader = m.id === leaderId;
      const name = m.nickname || (m.lastName + m.firstName);
      const leaderBadge = isLeader ? '<span class="guild-leader-badge">👑 길드장</span>' : '';
      const isMe = currentUser && (m.id === currentUser.id || (m.id === _guildModalSocialId));
      let actionBtns = '';
      const safeName = guildName.replace(/'/g, "\\'");
      if (amILeader && !isMe) {
        const safeTargetId = m.id.replace(/'/g, "\\'");
        const safeTargetName = name.replace(/'/g, "\\'");
        actionBtns = `<div class="gm-member-actions"><button class="guild-member-action transfer" onclick="transferLeadership('${safeName}','${safeTargetId}','${safeTargetName}')">위임</button>
          <button class="guild-member-action kick" onclick="kickMember('${safeName}','${safeTargetId}','${safeTargetName}')">강퇴</button></div>`;
      } else if (isMe && !isLeader) {
        actionBtns = `<div class="gm-member-actions"><button class="guild-member-action kick" onclick="leaveGuildFromMembers('${safeName}')">탈퇴</button></div>`;
      } else if (isMe && isLeader) {
        actionBtns = `<div class="gm-member-actions"><button class="guild-member-action kick" onclick="leaderLeaveGuild('${safeName}')">탈퇴</button></div>`;
      }
      return `<div class="gm-member-row">
        <div class="gm-member-avatar">${name.charAt(0)}</div>
        <span class="gm-member-name">${name}${leaderBadge ? ' ' + leaderBadge : ''}</span>
        ${actionBtns}
      </div>`;
    }).join('');
  }
  el.style.display = 'block';
}
window.toggleGuildMembers = toggleGuildMembers;

// 길드장 위임
async function transferLeadership(guildName, targetId, targetName) {
  const _ok = await (window.confirmAction?.({ title: '길드장 위임', message: `${targetName}님에게 길드장을 위임하시겠습니까?\n위임 후에는 되돌릴 수 없습니다.`, destructive: true, longPress: 2000 }) ?? Promise.resolve(confirm(`${targetName}님에게 길드장을 위임하시겠습니까?`)));
  if (!_ok) return;
  const { transferGuildLeadership } = await import('./data.js');
  const ok = await transferGuildLeadership(guildName, targetId);
  const { showToast: _st } = await import('./home/utils.js');
  if (ok) {
    _guildLeaderMap[guildName] = targetId;
    _st(`${targetName}님에게 길드장을 위임했어요`, 3000, 'success');
    _renderGuildModalList();
    // 멤버 목록 새로고침
    const safeId = guildName.replace(/[^a-zA-Z0-9가-힣]/g, '_');
    const el = document.getElementById('gm-members-' + safeId);
    if (el) { el.style.display = 'none'; toggleGuildMembers(guildName); }
  } else {
    _st('위임에 실패했어요', 3000, 'error');
  }
}
window.transferLeadership = transferLeadership;

// 길드원 강퇴
async function kickMember(guildName, targetId, targetName) {
  const _ok2 = await (window.confirmAction?.({ title: '길드원 강퇴', message: `정말 ${targetName}님을 강퇴하시겠습니까?`, destructive: true, longPress: 2000 }) ?? Promise.resolve(confirm(`정말 ${targetName}님을 강퇴하시겠습니까?`)));
  if (!_ok2) return;
  const { kickGuildMember } = await import('./data.js');
  const ok = await kickGuildMember(guildName, targetId);
  const { showToast: _st } = await import('./home/utils.js');
  if (ok) {
    _st(`${targetName}님을 내보냈어요`, 3000, 'success');
    // 멤버 목록 새로고침
    const safeId = guildName.replace(/[^a-zA-Z0-9가-힣]/g, '_');
    const el = document.getElementById('gm-members-' + safeId);
    if (el) { el.style.display = 'none'; toggleGuildMembers(guildName); }
  } else {
    _st('강퇴에 실패했어요. 길드장만 강퇴할 수 있어요.', 3000, 'error');
  }
}
window.kickMember = kickMember;

// 일반 멤버 자진 탈퇴
async function leaveGuildFromMembers(guildName) {
  const _ok3 = await (window.confirmAction?.({ title: '길드 탈퇴', message: `${guildName} 길드에서 탈퇴할까요?`, destructive: true, longPress: 2000 }) ?? Promise.resolve(confirm(`${guildName} 길드에서 탈퇴할까요?`)));
  if (!_ok3) return;
  const { getCurrentUser, saveAccount, setCurrentUser, updateGuildMemberCount } = await import('./data.js');
  const user = getCurrentUser();
  if (!user) return;
  user.guilds = (user.guilds || []).filter(g => g !== guildName);
  user.pendingGuilds = (user.pendingGuilds || []).filter(g => g !== guildName);
  if (user.primaryGuild === guildName) {
    user.primaryGuild = user.guilds.length > 0 ? user.guilds[0] : null;
  }
  await saveAccount(user);
  setCurrentUser(user);
  await updateGuildMemberCount(guildName, -1);
  // 모달 상태도 동기화
  _guildModalGuilds = _guildModalGuilds.filter(g => g.name !== guildName);
  if (_guildModalPrimary === guildName) {
    const first = _guildModalGuilds.find(g => g.status === 'member');
    _guildModalPrimary = first ? first.name : null;
  }
  _renderGuildModalList();
  const { showToast: _st } = await import('./home/utils.js');
  _st(`${guildName}에서 탈퇴했어요`, 3000, 'success');
}
window.leaveGuildFromMembers = leaveGuildFromMembers;

// 길드장 탈퇴: 위임할 사람 선택 후 탈퇴
async function leaderLeaveGuild(guildName) {
  const { getAccountList } = await import('./data.js');
  const accounts = await getAccountList();
  const members = accounts.filter(a => (a.guilds || []).includes(guildName) && a.id !== _guildModalUserId && a.id !== _guildModalSocialId);

  if (!members.length) {
    // 혼자 남은 길드장 → 그냥 탈퇴
    const _ok4 = await (window.confirmAction?.({ title: '길드 탈퇴', message: `${guildName}의 마지막 멤버입니다. 탈퇴하면 길드가 비게 됩니다. 탈퇴할까요?`, destructive: true, longPress: 2000 }) ?? Promise.resolve(confirm(`${guildName}의 마지막 멤버입니다. 탈퇴하면 길드가 비게 됩니다. 탈퇴할까요?`)));
    if (!_ok4) return;
    await leaveGuildFromMembers(guildName);
    return;
  }

  // 위임할 멤버 선택 UI
  const safeId = guildName.replace(/[^a-zA-Z0-9가-힣]/g, '_');
  const el = document.getElementById('gm-members-' + safeId);
  if (!el) return;

  const safeName = guildName.replace(/'/g, "\\'");
  const memberList = members.map(m => {
    const name = m.nickname || (m.lastName + m.firstName);
    return `<button class="guild-member-action transfer" onclick="transferAndLeave('${safeName}','${m.id.replace(/'/g, "\\'")}','${name.replace(/'/g, "\\'")}')">${name}에게 위임</button>`;
  }).join('');

  el.innerHTML = `<div class="gm-transfer-panel">
    <div class="gm-transfer-title">길드장을 위임할 멤버를 선택하세요</div>
    <div class="gm-transfer-list">${memberList}</div>
    <button class="guild-member-action kick" style="margin-top:8px;" onclick="toggleGuildMembers('${safeName}')">취소</button>
  </div>`;
}
window.leaderLeaveGuild = leaderLeaveGuild;

// 위임 후 탈퇴
async function transferAndLeave(guildName, newLeaderId, newLeaderName) {
  const _ok5 = await (window.confirmAction?.({ title: '위임 후 탈퇴', message: `${newLeaderName}님에게 길드장을 위임하고 탈퇴할까요?`, destructive: true, longPress: 2000 }) ?? Promise.resolve(confirm(`${newLeaderName}님에게 길드장을 위임하고 탈퇴할까요?`)));
  if (!_ok5) return;
  const { transferGuildLeadership } = await import('./data.js');
  const ok = await transferGuildLeadership(guildName, newLeaderId);
  if (!ok) {
    const { showToast: _st } = await import('./home/utils.js');
    _st('위임에 실패했어요', 3000, 'error');
    return;
  }
  _guildLeaderMap[guildName] = newLeaderId;
  await leaveGuildFromMembers(guildName);
}
window.transferAndLeave = transferAndLeave;

function toggleGuildIconPicker(guildName) {
  const safeId = guildName.replace(/[^a-zA-Z0-9가-힣]/g, '_');
  const el = document.getElementById('gm-icon-picker-' + safeId);
  if (!el) return;
  if (getComputedStyle(el).display !== 'none') { el.style.display = 'none'; return; }
  _closeOtherGuildPanels(guildName, 'icon');
  const safeName = guildName.replace(/'/g, "\\'");
  el.innerHTML = `<div class="gm-icon-grid">${
    GUILD_ICON_OPTIONS.map(ic =>
      `<button class="gm-icon-option${_guildIconMap[guildName] === ic ? ' is-selected' : ''}" type="button" onclick="selectGuildIcon('${safeName}','${ic}')">${ic}</button>`
    ).join('')
  }
  <label class="gm-icon-upload" title="사진 업로드">
    📷<input type="file" accept="image/*" onchange="uploadGuildPhoto('${safeName}',this)">
  </label>
  </div>`;
  el.style.display = 'block';
}

async function selectGuildIcon(guildName, icon) {
  _guildIconMap[guildName] = icon;
  const { updateGuildIcon } = await import('./data.js');
  await updateGuildIcon(guildName, icon);
  _renderGuildModalList();
  const { showToast: _st } = await import('./home/utils.js');
  _st('아이콘이 변경되었어요', 2000, 'success');
}

async function uploadGuildPhoto(guildName, input) {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 500 * 1024) {
    const { showToast: _st } = await import('./home/utils.js');
    _st('사진이 너무 커요. 500KB 이하로 올려주세요.', 3000, 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = async (e) => {
    // 32x32 크기로 리사이즈
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext('2d');
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2, sy = (img.height - size) / 2;
      ctx.beginPath(); ctx.arc(32, 32, 32, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 64, 64);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      _guildIconMap[guildName] = dataUrl;
      const { updateGuildIcon } = await import('./data.js');
      await updateGuildIcon(guildName, dataUrl);
      _renderGuildModalList();
      const { showToast: _st } = await import('./home/utils.js');
      _st('사진이 설정되었어요', 2000, 'success');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
window.uploadGuildPhoto = uploadGuildPhoto;

window.toggleGuildIconPicker = toggleGuildIconPicker;
window.selectGuildIcon = selectGuildIcon;

async function toggleGuildPrimary(name) {
  const g = _guildModalGuilds.find(x => x.name === name);
  if (!g || g.status !== 'member') return;
  _guildModalPrimary = _guildModalPrimary === name ? null : name;
  _renderGuildModalList();
  await syncGuildModalState({ successMessage: _guildModalPrimary ? `${name}을(를) 대표 길드로 설정했어요` : '대표 길드 설정을 해제했어요', successType: 'success', refreshCache: false });
}

async function removeGuildFromModal(name) {
  const guildEntry = _guildModalGuilds.find(g => g.name === name);
  const isPending = guildEntry && guildEntry.status === 'pending';

  if (!isPending) {
    // 정식 멤버 → 탈퇴
    if (_isMyGuildLeader(name)) {
      const { showToast: _st } = await import('./home/utils.js');
      _st('길드장은 탈퇴 전에 다른 멤버에게 길드장을 위임해주세요.', 3000, 'warning');
      return;
    }
    const _ok6 = await (window.confirmAction?.({ title: '길드 탈퇴', message: `${name} 길드에서 탈퇴할까요?\n길드 데이터는 유지됩니다.`, destructive: true, longPress: 2000 }) ?? Promise.resolve(confirm(`${name} 길드에서 탈퇴할까요?`)));
    if (!_ok6) return;
  } else {
    // 승인 대기중 → 가입신청 철회
    const _ok7 = await (window.confirmAction?.({ title: '가입신청 철회', message: `${name} 가입신청을 철회할까요?`, destructive: true, longPress: 2000 }) ?? Promise.resolve(confirm(`${name} 가입신청을 철회할까요?`)));
    if (!_ok7) return;

    // pending은 즉시 Firebase 반영 (저장하기 안 눌러도 적용)
    const { getCurrentUser, saveAccount, setCurrentUser } = await import('./data.js');
    const user = getCurrentUser();
    if (user) {
      user.pendingGuilds = (user.pendingGuilds || []).filter(g => g !== name);
      await saveAccount(user);
      setCurrentUser(user);
    }
    // pending 알림 + _guild_requests 정리
    try {
      const { deleteDoc: _dd, doc: _dc, getFirestore: _gfs, getDocs: _gds, collection: _col } = await import("https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js");
      const _db = _gfs();
      await _dd(_dc(_db, '_notifications', `guild_pending_${name}_${user.id}`)).catch(() => {});
      const reqSnap = await _gds(_col(_db, '_guild_requests'));
      for (const d of reqSnap.docs) {
        const data = d.data();
        if (data.guildId === name && data.userId === user.id && data.status === 'pending') {
          await _dd(_dc(_db, '_guild_requests', d.id));
        }
      }
    } catch {}
    const { showToast: _st } = await import('./home/utils.js');
    _st(`${name} 가입신청을 철회했어요`, 2500, 'info');
  }

  _guildModalGuilds = _guildModalGuilds.filter(g => g.name !== name);
  if (_guildModalPrimary === name) {
    const firstMember = _guildModalGuilds.find(g => g.status === 'member');
    _guildModalPrimary = firstMember ? firstMember.name : null;
  }
  _renderGuildModalList();
  await syncGuildModalState({ refreshCache: false });
}

async function searchGuildsForModal(query) {
  const sugBox = document.getElementById('gm-guild-suggestions');
  if (!sugBox) return;
  const q = (query || '').trim().toLowerCase();
  const guilds = _allGuildsCache || [];
  // 빈 쿼리일 때도 전체 목록 표시 (드롭다운)
  const filtered = guilds.filter(g => (!q || g.name.toLowerCase().includes(q)) && !_guildModalGuilds.some(s => s.name === g.name));
  if (!filtered.length) { sugBox.style.display = 'none'; return; }
  sugBox.innerHTML = filtered.slice(0, 8).map(g =>
    `<div class="guild-suggest-item" onclick="selectGuildForModal('${g.name.replace(/'/g, "\\'")}')">
      <span>${g.name}</span><span style="font-size:11px;color:var(--text-tertiary);">${g.memberCount || 0}명</span>
    </div>`
  ).join('');
  sugBox.style.display = '';
}

async function selectGuildForModal(name) {
  if (_guildModalGuilds.some(g => g.name === name)) return;
  const existing = (_allGuildsCache || []).find(g => g.name === name);
  if (!existing) return;
  _guildModalGuilds.push({ name, status: (existing && (existing.memberCount || 0) > 0) ? 'pending' : 'member', isNew: !existing });
  document.getElementById('gm-guild-input').value = '';
  document.getElementById('gm-guild-suggestions').style.display = 'none';
  _renderGuildModalList();
  await syncGuildModalState({ refreshCache: true });
}

async function addGuildFromModal() {
  const input = document.getElementById('gm-guild-input');
  const name = (input?.value || '').trim();
  if (!name || _guildModalGuilds.some(g => g.name === name)) { if (input) input.value = ''; return; }
  const existing = (_allGuildsCache || []).find(g => g.name === name);
  if (!existing) {
    const { showToast: _st } = await import('./home/utils.js');
    _st('검색 결과에 없는 길드는 아래에서 새로 만들어주세요.', 2600, 'info');
    return;
  }
  _guildModalGuilds.push({ name, status: (existing.memberCount || 0) > 0 ? 'pending' : 'member', isNew: false });
  input.value = '';
  document.getElementById('gm-guild-suggestions').style.display = 'none';
  _renderGuildModalList();
  await syncGuildModalState({ refreshCache: true });
}

async function createGuildFromModal() {
  const input = document.getElementById('gm-create-guild-input');
  const name = (input?.value || '').trim();
  if (!name) return;
  if (_guildModalGuilds.some(g => g.name === name)) {
    const { showToast: _st } = await import('./home/utils.js');
    _st('이미 목록에 담긴 길드예요.', 2200, 'info');
    if (input) input.value = '';
    return;
  }
  const existing = (_allGuildsCache || []).find(g => g.name === name);
  if (existing) {
    const { showToast: _st } = await import('./home/utils.js');
    _st('이미 있는 길드예요. 위에서 검색해서 추가해 주세요.', 2600, 'warning');
    if (input) input.value = '';
    return;
  }
  _guildModalGuilds.push({ name, status: 'member', isNew: true });
  if (input) input.value = '';
  _renderGuildModalList();
  await syncGuildModalState({ successMessage: `${name} 길드를 만들었어요.`, successType: 'success', refreshCache: true });
}

async function syncGuildModalState(options = {}) {
  const { closeAfter = false, successMessage = '', successType = 'success', refreshCache = true } = options;
  const { getCurrentUser, saveAccount, setCurrentUser, createGuild, createGuildJoinRequest, updateGuildMemberCount, updateGuildLeader } = await import('./data.js');
  const user = getCurrentUser();
  if (!user) return;

  const oldGuilds = new Set(user.guilds || []);
  const oldPending = new Set(user.pendingGuilds || []);
  const newGuilds = [];
  const newPending = [];

  for (const g of _guildModalGuilds) {
    if (g.status === 'member') {
      newGuilds.push(g.name);
      // 새로 생성되는 길드
      if (g.isNew && !oldGuilds.has(g.name)) {
        await createGuild(g.name, user.id);
      }
      // 기존 길드에서 새로 가입 (이전에 없었던 것)
      if (!g.isNew && !oldGuilds.has(g.name)) {
        await updateGuildMemberCount(g.name, 1);
        const guildMeta = (_allGuildsCache || []).find(item => item.name === g.name);
        if ((guildMeta?.memberCount || 0) === 0) {
          await updateGuildLeader(g.name, user.id);
        }
      }
    } else {
      newPending.push(g.name);
      // 새로운 pending 길드 → 가입 요청
      if (!oldPending.has(g.name)) {
        const displayName = user.nickname || (user.lastName + user.firstName);
        await createGuildJoinRequest(g.name, g.name, user.id, displayName);
      }
    }
  }

  // 탈퇴한 길드 memberCount 감소
  for (const oldG of oldGuilds) {
    if (!newGuilds.includes(oldG)) {
      await updateGuildMemberCount(oldG, -1);
    }
  }

  // 철회된 pending 길드 → _guild_requests 삭제 + pending 알림 제거
  const { deleteDoc: _dd, doc: _dc, getFirestore: _gfs, getDocs: _gds, collection: _col } = await import("https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js");
  const _db = _gfs();
  for (const oldP of oldPending) {
    if (!newPending.includes(oldP)) {
      // pending 알림 제거
      try { await _dd(_dc(_db, '_notifications', `guild_pending_${oldP}_${user.id}`)); } catch {}
      // _guild_requests에서 해당 요청 삭제
      try {
        const reqSnap = await _gds(_col(_db, '_guild_requests'));
        reqSnap.forEach(async (d) => {
          const data = d.data();
          if (data.guildId === oldP && data.userId === user.id && data.status === 'pending') {
            await _dd(_dc(_db, '_guild_requests', d.id));
          }
        });
      } catch {}
    }
  }

  // 승인된 멤버가 1개 이상이면 대표길드 필수
  const primaryGuild = newGuilds.length > 0
    ? (newGuilds.includes(_guildModalPrimary) ? _guildModalPrimary : newGuilds[0])
    : null;

  user.guilds = newGuilds;
  user.pendingGuilds = newPending;
  user.primaryGuild = primaryGuild;
  await saveAccount(user);
  setCurrentUser(user);

  if (refreshCache) {
    const { getAllGuilds } = await import('./data.js');
    _allGuildsCache = await getAllGuilds();
  }
  if (closeAfter) closeGuildModal();
  if (successMessage) {
    const { showToast: _st } = await import('./home/utils.js');
    _st(successMessage, 2600, successType);
  }
}

async function saveGuildFromModal() {
  await syncGuildModalState({ closeAfter: true, successMessage: '저장되었습니다', successType: 'success' });
}

window.openGuildModal = openGuildModal;
window.openGuildInfoModal = (...args) => import('./modals/guild-info-modal.js').then(m => m.openGuildInfoModal(...args));
window.closeGuildModal = closeGuildModal;
window.toggleGuildPrimary = toggleGuildPrimary;
window.removeGuildFromModal = removeGuildFromModal;
window.searchGuildsForModal = searchGuildsForModal;
window.selectGuildForModal = selectGuildForModal;
window.addGuildFromModal = addGuildFromModal;
window.createGuildFromModal = createGuildFromModal;
window.saveGuildFromModal = saveGuildFromModal;

async function manageAccountPassword(accountId) {
  const { getAccountList, saveAccount, hashPassword, verifyPassword } = await import('./data.js');
  const accounts = await getAccountList();
  const account = accounts.find(a => a.id === accountId);
  if (!account) return;

  if (account.hasPassword) {
    // 기존 비밀번호 확인 후 변경/해제
    const oldPw = prompt(`${account.lastName}${account.firstName} — 현재 비밀번호를 입력하세요`);
    if (oldPw === null) return;
    if (!verifyPassword(account, oldPw)) { window.showToast?.('비밀번호가 맞지 않아요', 2500, 'error'); return; }

    const action = confirm('비밀번호를 변경하시겠어요?\n\n확인 = 새 비밀번호 설정\n취소 = 비밀번호 해제');
    if (action) {
      const newPw = prompt('새 비밀번호를 입력하세요');
      if (!newPw) return;
      account.passwordHash = hashPassword(newPw);
      await saveAccount(account);
      window.showToast?.('비밀번호가 변경되었어요', 2500, 'success');
    } else {
      account.hasPassword = false;
      account.passwordHash = null;
      await saveAccount(account);
      window.showToast?.('비밀번호가 해제되었어요', 2500, 'success');
    }
  } else {
    // 비밀번호 새로 설정
    const newPw = prompt(`${account.lastName}${account.firstName} — 비밀번호를 설정하세요`);
    if (!newPw) return;
    account.hasPassword = true;
    account.passwordHash = hashPassword(newPw);
    await saveAccount(account);
    window.showToast?.('비밀번호가 설정되었어요', 2500, 'success');
  }
  // 목록 갱신
  initLoginScreen();
}

window.manageAccountPassword = manageAccountPassword;
window.logoutAccount = logoutAccount;
window.confirmLogout = confirmLogout;
window.selectAccount = selectAccount;
window.verifyAndLogin = verifyAndLogin;
window.closePasswordModal = closePasswordModal;
window.createAccountAndLogin = createAccountAndLogin;

// ── 개발자에게 편지 ──
async function openLetterModal() {
  const { getCurrentUser } = await import('./data.js');
  const user = getCurrentUser();
  if (!user) return;
  const nick = user.nickname || (user.lastName + user.firstName);

  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div'); modal.id = 'dynamic-modal'; document.body.appendChild(modal);
  modal.innerHTML = `<div class="modal-backdrop" style="display:flex;z-index:10000;" onclick="if(event.target===this)document.getElementById('dynamic-modal')?.remove();">
    <div class="modal-sheet" style="max-width:400px;padding:24px;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:28px;margin-bottom:8px;">✉️</div>
        <div style="font-size:17px;font-weight:700;color:var(--text);">개발자에게 편지</div>
        <div style="font-size:12px;color:var(--text-tertiary);margin-top:4px;">건의사항, 버그 제보, 응원 뭐든 좋아요</div>
      </div>
      <textarea id="letter-text" style="width:100%;min-height:120px;padding:14px 16px;border:1.5px solid var(--border);border-radius:12px;font-size:14px;color:var(--text);background:var(--surface);outline:none;resize:vertical;font-family:inherit;box-sizing:border-box;line-height:1.6;transition:border-color 0.15s;" placeholder="편하게 적어주세요..." onfocus="this.style.borderColor='#fa342c'" onblur="this.style.borderColor='var(--border)'"></textarea>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button onclick="document.getElementById('dynamic-modal')?.remove()" style="flex:1;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text-secondary);font-size:14px;font-weight:600;cursor:pointer;">닫기</button>
        <button id="letter-send-btn" onclick="sendLetter()" style="flex:2;padding:14px;border:none;border-radius:12px;background:#fa342c;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">보내기</button>
      </div>
    </div>
  </div>`;
  setTimeout(() => document.getElementById('letter-text')?.focus(), 200);
}
window.openLetterModal = openLetterModal;

// ── 식단 탭 인라인 다이어트 설정 ──
async function submitDietSetup() {
  const h = parseFloat(document.getElementById('ds-height')?.value);
  const w = parseFloat(document.getElementById('ds-weight')?.value);
  const age = parseInt(document.getElementById('ds-age')?.value);
  const tw = parseFloat(document.getElementById('ds-target-weight')?.value);
  if (!h || !w || !age || !tw) { window.showToast?.('신장, 체중, 연령, 목표 체중을 입력해주세요', 2500, 'warning'); return; }

  // 체지방률: 미입력 시 BMI 기반 추정 (Deurenberg + 보수적 보정 -2%p)
  let bf = parseFloat(document.getElementById('ds-bodyfat')?.value);
  let bfEstimated = false;
  if (!bf) {
    const bmi = w / ((h / 100) ** 2);
    // Deurenberg(1991) 남성: 1.20*BMI + 0.23*나이 - 16.2, 보수적 보정 -2%p
    bf = Math.round((1.20 * bmi + 0.23 * age - 16.2 - 2) * 10) / 10;
    bf = Math.max(5, Math.min(bf, 40));
    bfEstimated = true;
  }
  let tbf = parseFloat(document.getElementById('ds-target-bf')?.value);
  if (!tbf) {
    const targetBmi = tw / ((h / 100) ** 2);
    tbf = Math.round((1.20 * targetBmi + 0.23 * age - 16.2 - 2) * 10) / 10;
    tbf = Math.max(5, Math.min(tbf, 35));
  }

  const btn = document.getElementById('ds-submit-btn');
  btn.textContent = '계산 중...'; btn.disabled = true;

  const { saveDietPlan } = await import('./data.js');
  await saveDietPlan({
    height: h, weight: w, bodyFatPct: bf, age,
    targetWeight: tw, targetBodyFatPct: tbf,
    startDate: new Date().toISOString().split('T')[0],
  });

  // 애니메이션: 설정 폼 → 칼로리 트래커
  const setup = document.getElementById('wt-diet-setup');
  setup.style.transition = 'opacity 0.3s, transform 0.3s';
  setup.style.opacity = '0';
  setup.style.transform = 'scale(0.95)';

  setTimeout(() => {
    setup.style.display = 'none';
    // 칼로리 트래커 표시 (애니메이션)
    const tracker = document.getElementById('wt-calorie-tracker');
    tracker.style.display = 'block';
    tracker.style.opacity = '0';
    tracker.style.transform = 'translateY(-10px)';
    tracker.style.transition = 'opacity 0.4s, transform 0.4s';
    requestAnimationFrame(() => {
      tracker.style.opacity = '1';
      tracker.style.transform = 'translateY(0)';
    });
    // 다이어트 요약도 표시
    const summary = document.getElementById('wt-diet-summary');
    if (summary) {
      summary.style.opacity = '0';
      summary.style.transition = 'opacity 0.4s 0.15s';
      summary.style.display = 'block';
      requestAnimationFrame(() => { summary.style.opacity = '1'; });
    }
    // 데이터 리렌더
    const { loadWorkoutDate } = window._wtExports || {};
    if (loadWorkoutDate) {
      const t = new Date();
      loadWorkoutDate(t.getFullYear(), t.getMonth(), t.getDate());
    } else {
      location.reload();
    }
  }, 300);
}
window.submitDietSetup = submitDietSetup;

// "설정" 버튼 → 인라인 폼 다시 열기
async function openDietSetupInline() {
  const { getDietPlan } = await import('./data.js');
  const plan = getDietPlan();
  const setup = document.getElementById('wt-diet-setup');
  if (!setup) return;

  // 기존 값 채우기 (0은 빈칸 처리)
  document.getElementById('ds-height').value = plan.height || '';
  document.getElementById('ds-weight').value = plan.weight || '';
  document.getElementById('ds-bodyfat').value = plan.bodyFatPct || '';
  document.getElementById('ds-age').value = plan.age || '';
  document.getElementById('ds-target-weight').value = plan.targetWeight || '';
  document.getElementById('ds-target-bf').value = plan.targetBodyFatPct || '';
  document.getElementById('ds-submit-btn').textContent = '저장하기';
  document.getElementById('ds-submit-btn').disabled = false;

  // 칼로리 트래커 숨기고 폼 보이기
  const tracker = document.getElementById('wt-calorie-tracker');
  const summary = document.getElementById('wt-diet-summary');
  tracker.style.transition = 'opacity 0.2s';
  tracker.style.opacity = '0';
  if (summary) { summary.style.transition = 'opacity 0.2s'; summary.style.opacity = '0'; }

  setTimeout(() => {
    tracker.style.display = 'none';
    if (summary) summary.style.display = 'none';
    setup.style.display = 'block';
    setup.style.opacity = '0';
    setup.style.transform = 'scale(0.95)';
    setup.style.transition = 'opacity 0.3s, transform 0.3s';
    requestAnimationFrame(() => {
      setup.style.opacity = '1';
      setup.style.transform = 'scale(1)';
    });
  }, 200);
}
window.openDietSetupInline = openDietSetupInline;

async function sendLetter() {
  const text = document.getElementById('letter-text')?.value.trim();
  if (!text) return;
  const btn = document.getElementById('letter-send-btn');
  btn.textContent = '보내는 중...'; btn.disabled = true;
  try {
    const { getCurrentUser } = await import('./data.js');
    const { getFirestore } = await import("https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js");
    const { doc, setDoc, collection } = await import("https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js");
    const db = getFirestore();
    const user = getCurrentUser();
    const id = 'letter_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    await setDoc(doc(db, '_letters', id), {
      id, from: user.id,
      fromName: user.nickname || (user.lastName + user.firstName),
      message: text, createdAt: Date.now(), read: false,
    });
    // 김태우에게 알림
    const { sendNotification, getAdminId: gAI4 } = await import('./data.js');
    await sendNotification(gAI4(), {
      type: 'letter', from: user.id,
      message: '개발자에게 편지를 보냈어요 ✉️',
    });
    document.getElementById('dynamic-modal')?.remove();
    window.showToast?.('편지를 보냈어요! 감사합니다', 2500, 'success');
  } catch(e) {
    console.error('[letter]', e);
    window.showToast?.('전송 실패: ' + e.message, 3000, 'error');
    btn.textContent = '보내기'; btn.disabled = false;
  }
}
window.sendLetter = sendLetter;

// 페이지 로드 시 로그인 초기화
document.addEventListener('DOMContentLoaded', initLoginScreen);

function toggleTheme() {
  const root = document.documentElement;
  const isLight = root.classList.toggle('light');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  document.getElementById('theme-toggle').textContent = isLight ? '☀️' : '🌙';
}
// 밝은 모드 고정
(function() {
  document.documentElement.classList.add('light');
})();

// 더보기 메뉴
function toggleMoreMenu() {
  const menu = document.getElementById('more-menu');
  menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
}
