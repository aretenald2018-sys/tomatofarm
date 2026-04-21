// ================================================================
// scripts/bump-cache.js
//   배포 전 캐시 버스터 일괄 범프.
//     - index.html 의 모든  `?v=YYYYMMDD<letter>`   → 오늘 날짜 기준 다음 리비전으로 동기화
//     - sw.js 의   `CACHE_VERSION = 'tomatofarm-v<YYYYMMDD>z<N>-<desc>'` → z<N+1> 로 범프
//
//   실행: node scripts/bump-cache.js [--desc=<설명>]
//         npm run bump
//         npm run build  (→ bump 이 먼저 돌고 그다음 copy-www)
//
//   회귀 배경 (2026-04-21):
//     - index.html 의 app.js?v=20260411h 가 열흘 이상 정체되어 기존 SW/브라우저가
//       구버전 JS 를 재활용 → "운동 타이머가 저절로 멈추는" 증상처럼 체감.
//     - CLAUDE.md 절대규칙 #5 (SW 캐시 버전 범프) 를 수동으로 지키던 기존 방식은
//       반복적으로 누락됨. 빌드 단계에 강제 편입해 드리프트 원천 차단.
// ================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const INDEX_HTML = resolve(ROOT, 'index.html');
const SW_JS      = resolve(ROOT, 'sw.js');

const today = (() => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
})();

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
    else if (arg.startsWith('--')) args[arg.slice(2)] = true;
  }
  return args;
}

// ── index.html: ?v=YYYYMMDD<letter> 일괄 범프 ───────────────────
function bumpIndexHtml() {
  const src = readFileSync(INDEX_HTML, 'utf8');
  const pattern = /\?v=(\d{8})([a-z]+)/g;

  // 오늘 날짜로 이미 기록된 최대 리비전 letter 찾기
  let maxLetterCode = 0;
  let hasToday = false;
  for (const m of src.matchAll(pattern)) {
    if (m[1] === today) {
      hasToday = true;
      const letter = m[2];
      const code = _lettersToCode(letter);
      if (code > maxLetterCode) maxLetterCode = code;
    }
  }

  const nextLetter = hasToday ? _codeToLetters(maxLetterCode + 1) : 'a';
  const nextToken = `?v=${today}${nextLetter}`;

  let replacedCount = 0;
  const out = src.replace(pattern, () => {
    replacedCount += 1;
    return nextToken;
  });

  if (replacedCount === 0) {
    console.warn('[bump-cache] index.html 에 ?v= 토큰 없음 — 스킵');
    return { changed: false };
  }

  const changed = out !== src;
  if (changed) {
    writeFileSync(INDEX_HTML, out);
  }
  return { changed, replacedCount, nextToken };
}

// ── sw.js: CACHE_VERSION 범프 ────────────────────────────────────
function bumpServiceWorker({ desc } = {}) {
  const src = readFileSync(SW_JS, 'utf8');
  // 예시 매칭 대상: `const CACHE_VERSION = 'tomatofarm-v20260421z23-hero-character-mood-r3';`
  const re = /(const\s+CACHE_VERSION\s*=\s*['"])tomatofarm-v(\d{8})z(\d+)(?:-([a-z0-9\-]+))?(['"])/i;
  const m = src.match(re);
  if (!m) {
    console.warn('[bump-cache] sw.js 의 CACHE_VERSION 패턴 매칭 실패 — 스킵');
    return { changed: false };
  }
  const [, prefix, oldDate, oldN, oldDesc, quote] = m;
  const newN   = (oldDate === today) ? (parseInt(oldN, 10) + 1) : 1;
  const newDesc = desc || oldDesc || 'cache-bump';
  const newVal = `${prefix}tomatofarm-v${today}z${newN}-${newDesc}${quote}`;
  const out = src.replace(re, newVal);
  const changed = out !== src;
  if (changed) writeFileSync(SW_JS, out);
  return { changed, newVersion: `tomatofarm-v${today}z${newN}-${newDesc}` };
}

// ── helpers: letter <-> code (a=1, z=26, aa=27, ab=28, ...) ─────
function _lettersToCode(letters) {
  let code = 0;
  for (const ch of letters) {
    code = code * 26 + (ch.charCodeAt(0) - 'a'.charCodeAt(0) + 1);
  }
  return code;
}
function _codeToLetters(code) {
  let out = '';
  let n = code;
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode('a'.charCodeAt(0) + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out || 'a';
}

// ── 실행 ─────────────────────────────────────────────────────────
const args = parseArgs();
const htmlResult = bumpIndexHtml();
const swResult   = bumpServiceWorker({ desc: args.desc });

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('[bump-cache] today =', today);
if (htmlResult.changed) {
  console.log(`[bump-cache] index.html → ${htmlResult.nextToken} (${htmlResult.replacedCount} replacements)`);
} else {
  console.log('[bump-cache] index.html 변경 없음');
}
if (swResult.changed) {
  console.log(`[bump-cache] sw.js      → ${swResult.newVersion}`);
} else {
  console.log('[bump-cache] sw.js 변경 없음');
}
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
