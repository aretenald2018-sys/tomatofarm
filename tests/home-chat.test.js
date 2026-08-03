import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('home chat is integrated into the life-zone and the summary follows the combined card', () => {
  const html = read('index.html');
  const tomato = read('home/tomato.js');
  const heroAt = html.indexOf('id="home-hero"');
  const chatAt = html.indexOf('id="card-chat"');
  const leaderboardAt = html.indexOf('id="card-leaderboard"');

  assert.ok(heroAt >= 0);
  assert.ok(chatAt > heroAt);
  assert.ok(leaderboardAt > chatAt);
  assert.match(tomato, /renderLifeZoneSummary/);
  assert.match(tomato, /lifeZoneCard\.append\(chatCard\)/);
  assert.match(tomato, /lifeZoneCard\.after\(summaryCard\)/);
});

test('chat history persists in Firestore and supports owner-checked deletion', () => {
  const dataSource = read('data/data-social-interact.js');
  const chatBlock = dataSource.slice(
    dataSource.indexOf('// ── 홈 실시간 채팅'),
    dataSource.indexOf('// ── Cheers 설정'),
  );

  assert.match(chatBlock, /setDoc\(doc\(db, '_chat_messages', id\), entry\)/);
  assert.match(chatBlock, /onSnapshot\(chatQuery/);
  // 최근 CHAT_HISTORY_LIMIT 건만 내림차순+limit 로 구독해 전체 히스토리 read 를
  // 막고, 콜백 전에 오름차순으로 뒤집어 소비자가 받는 순서는 유지한다.
  assert.match(chatBlock, /orderBy\('createdAt', 'desc'\)/);
  assert.match(chatBlock, /limit\(CHAT_HISTORY_LIMIT\)/);
  assert.match(chatBlock, /messages\.reverse\(\)/);
  assert.match(chatBlock, /export async function deleteChatMessage/);
  assert.match(chatBlock, /myIds\.has\(ownerId\)/);
  assert.match(chatBlock, /deleteDoc\(messageRef\)/);
  assert.doesNotMatch(chatBlock, /localStorage|sessionStorage|expiresAt/);
});

test('reference-style channel tabs, pinned notice and safe message controls are wired', () => {
  const html = read('index.html');
  const dataSource = read('data/data-social-interact.js');
  const homeSource = read('home/chat.js');
  const css = read('styles/features/home-foundations.css');
  const chatCssStart = css.indexOf('/* ── Home Chat ── */');
  const chatCssEnd = css.indexOf('Quest (Common)', chatCssStart);
  const chatCss = css.slice(chatCssStart, chatCssEnd);

  assert.match(html, /class="tds-sr-only" for="home-chat-input"/);
  assert.doesNotMatch(html, /LIVE CHAT|home-chat-header|home-chat-title-group/);
  assert.match(html, /id="home-chat-notices"/);
  assert.match(html, /role="tablist" aria-label="채팅 채널"/);
  assert.match(html, /data-chat-channel="all">전체/);
  assert.match(html, /data-chat-channel="notice">공지/);
  assert.match(html, /data-chat-channel="bug">버그제보/);
  assert.match(html, /data-chat-channel="free">자유/);
  assert.match(html, /id="home-chat-presence"/);
  assert.match(html, /id="home-chat-emoji"/);
  assert.match(html, /id="home-chat-more"/);
  assert.match(html, /data-chat-quick-emoji="🍅"/);
  assert.match(dataSource, /CHAT_NOTICE_PREFIX = '<공지>'/);
  assert.match(dataSource, /CHAT_CHANNELS = new Set\(\['notice', 'bug', 'free'\]\)/);
  assert.match(dataSource, /sendChatMessage\(rawMessage, channel = 'free'\)/);
  assert.match(dataSource, /channel: normalized\.channel/);
  assert.match(dataSource, /avatar: _chatAvatarSnapshot\(user\)/);
  assert.match(homeSource, /bubble\.textContent =/);
  assert.match(homeSource, /_activeChannel === 'all' \|\| _messageChannel\(message\) === _activeChannel/);
  assert.match(homeSource, /sendChatMessage\(draft, sendChannel\)/);
  assert.match(homeSource, /button\.addEventListener\('click'/);
  assert.match(homeSource, /notices\.replaceChildren\(pin, label, author, message\)/);
  assert.match(homeSource, /status\.className = `tds-sr-only home-chat-status/);
  assert.doesNotMatch(homeSource, /_setStatus\('실시간'/);
  assert.match(homeSource, /message\.userId === currentUserId/);
  assert.match(homeSource, /_deleteOwnMessage\(message\.id, deleteButton\)/);
  assert.match(homeSource, /shape-rendering="crispEdges"/);
  assert.match(homeSource, /fill="var\(--chat-shirt\)"/);
  assert.doesNotMatch(homeSource, /channel\.className = `home-chat-channel/);
  assert.match(homeSource, /function _renderPresence\(messages\)/);
  assert.match(homeSource, /function _bindEmojiButton\(\)/);
  assert.match(homeSource, /function _bindQuickReactions\(\)/);
  assert.doesNotMatch(homeSource, /운동고수|라이프코치|title-badge/);
  assert.match(css, /\.home-chat-message\.is-notice \.home-chat-bubble/);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.home-chat-avatar svg/);
  assert.doesNotMatch(chatCss, /\.home-chat-channel\s*\{/);
  assert.match(css, /\.home-chat-notices:empty/);
  assert.match(css, /#card-chat\.home-chat-card \{/);
  assert.match(css, /margin-top: -4%/);
  assert.match(css, /backdrop-filter: blur\(16px\)/);
  assert.match(css, /:root\.light #card-chat\.home-chat-card/);
  assert.match(chatCss, /background: linear-gradient\(135deg, #e9252d, #f0443e\)/);
  assert.match(chatCss, /border-radius: 30px 30px 0 0/);
  assert.match(chatCss, /\.home-chat-presence/);
  assert.match(chatCss, /\.home-chat-emoji/);
  assert.match(chatCss, /\.home-chat-more/);
  assert.match(chatCss, /\.home-chat-quick-reactions/);
  assert.match(chatCss, /min-height: 40px/);
  assert.match(chatCss, /flex: 0 0 22px/);
  assert.match(chatCss, /font-size: 10px/);
  assert.doesNotMatch(chatCss, /var\(--(?:surface|text|border|primary|radius|transition)/);
});
