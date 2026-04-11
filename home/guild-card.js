import { getCurrentUser, countLocalWeeklyActiveDays, computeGuildStats } from '../data.js';

const PAGE_SIZE = 7;
let _guildCardPage = 0;

function _escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _renderPager(total) {
  if (total <= PAGE_SIZE) return '';
  const pages = Math.ceil(total / PAGE_SIZE);
  return `
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-top:14px;">
      <button class="tds-btn ghost md" style="min-width:84px;" onclick="window.changeGuildCardPage(-1)" ${_guildCardPage <= 0 ? 'disabled' : ''}>이전</button>
      <span style="font-size:12px;color:var(--text-tertiary);">${_guildCardPage + 1} / ${pages}</span>
      <button class="tds-btn ghost md" style="min-width:84px;" onclick="window.changeGuildCardPage(1)" ${_guildCardPage >= pages - 1 ? 'disabled' : ''}>다음</button>
    </div>
  `;
}

export async function renderGuildCard() {
  const card = document.getElementById('card-guild');
  const content = document.getElementById('guild-card-content');
  if (!card || !content) return;

  const user = getCurrentUser();
  if (!user) {
    card.style.display = 'none';
    return;
  }

  card.style.display = '';

  const myGuilds = new Set(user.guilds || []);
  const myLocalDays = countLocalWeeklyActiveDays();
  const { guilds } = await computeGuildStats({ myLocalDays });

  const allGuildRows = guilds
    .map((guild) => ({
      ...guild,
      intro: guild.description || 'No guild description.',
      isMine: myGuilds.has(guild.guildId) || myGuilds.has(guild.guildName),
    }))
    .sort((a, b) => {
      if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
      if ((a.rank || 9999) !== (b.rank || 9999)) return (a.rank || 9999) - (b.rank || 9999);
      return a.guildName.localeCompare(b.guildName);
    });

  if (!allGuildRows.length) {
    content.innerHTML = `
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.6;">아직 생성된 길드가 없어요. 첫 길드를 만들어도 되고, 나중에 다른 길드가 생기면 둘러볼 수 있어요.</div>
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button class="tds-btn fill md" style="flex:1;" onclick="openGuildModal()">길드 만들기</button>
      </div>
    `;
    return;
  }

  const pages = Math.max(1, Math.ceil(allGuildRows.length / PAGE_SIZE));
  _guildCardPage = Math.min(_guildCardPage, pages - 1);
  const pageItems = allGuildRows.slice(_guildCardPage * PAGE_SIZE, (_guildCardPage + 1) * PAGE_SIZE);

  content.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
      <div style="font-size:12px;color:var(--text-tertiary);">전체 길드 둘러보기</div>
      <div style="font-size:12px;color:var(--text-tertiary);">${allGuildRows.length}개 길드</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${pageItems.map((item) => {
        const progress = Math.max(8, Math.round((item.avgActiveDays / 7) * 100));
        const avgActiveDaysLabel = Number(item.avgActiveDays || 0).toFixed(1);
        const streakLabel = item.weekStreak > 0
          ? `전원 활동 ${item.weekStreak}일째`
          : item.avgActiveDays > 0
            ? `평균 ${avgActiveDaysLabel}일`
            : '이번 주 활동 없음';
        const avgPrefix = item.avgActiveDays > 0 ? `${avgActiveDaysLabel}일 · ` : '';

        return `
          <div onclick="openGuildInfoModal('${String(item.guildName).replace(/'/g, "\\'")}')" style="cursor:pointer;padding:14px;border-radius:18px;border:1px solid ${item.isMine ? 'rgba(250,52,44,0.24)' : 'var(--border)'};background:${item.isMine ? 'linear-gradient(135deg,rgba(250,52,44,0.08),rgba(255,138,61,0.12))' : 'var(--surface)'};box-shadow:${item.isMine ? '0 10px 24px rgba(250,52,44,0.08)' : 'none'};">
            <div style="display:flex;align-items:flex-start;gap:12px;">
              <div style="width:48px;height:48px;border-radius:16px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:24px;overflow:hidden;flex-shrink:0;">
                ${String(item.guildIcon).startsWith('data:') ? `<img src="${item.guildIcon}" style="width:100%;height:100%;object-fit:cover;">` : item.guildIcon}
              </div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  <div style="font-size:16px;font-weight:800;color:var(--text);">${_escapeHtml(item.guildName)}</div>
                  ${item.isMine ? '<span style="font-size:10px;padding:2px 8px;border-radius:999px;background:#fa342c;color:#fff;font-weight:700;">내 길드</span>' : ''}
                </div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:5px;line-height:1.55;">${_escapeHtml(item.intro)}</div>
                <div style="font-size:12px;color:var(--text-tertiary);margin-top:6px;">${item.memberCount}명 · ${item.rank > 0 ? `${item.rank}위` : '랭킹 집계 대기'}</div>
              </div>
            </div>
            <div style="margin-top:12px;">
              <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:6px;">
                <span>이번 주 평균 활동</span>
                <span>${avgPrefix}${streakLabel}</span>
              </div>
              <div style="height:8px;border-radius:999px;background:var(--surface2);overflow:hidden;">
                <div style="width:${progress}%;height:100%;background:linear-gradient(90deg,#fa342c,#ff8a3d);"></div>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    ${_renderPager(allGuildRows.length)}
  `;
}

window.changeGuildCardPage = function(delta) {
  _guildCardPage = Math.max(0, _guildCardPage + delta);
  renderGuildCard().catch((e) => console.warn('[guild-card]', e));
};
