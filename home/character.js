// ================================================================
// home/character.js — 히어로카드 토마토 캐릭터 SVG 렌더러
// ================================================================
// streakToCharacterMood() (calc.js)의 반환값을 받아 몸통 + 잎 + 광택 + 표정 파츠를
// 조립한 인라인 SVG 문자열을 반환한다.
//
// 원칙:
// - 베이스 기하는 public/characters/tomato-red.svg와 동일한 viewBox (0 0 512 512)
// - 색상은 red 고정 (orange/purple/green 에셋은 현재 미활용)
// - 순수 문자열 반환 — DOM/Firebase 접근 없음. import도 calc.js 불필요(호출부에서 mood 결정)
//
// 표정(mood):
//   seed   — 닫힌 눈 + 작은 중립 입 (0일)
//   smile  — 살짝 뜬 눈 미소 (1-2일, happy의 절반 눈 크기)
//   happy  — 환한 미소 (3-6일, 기본 눈 크기) + CSS 노란 아우라
//   fire   — ^^ 눈매 + 크게 벌린 웃음 (7-13일)
//   legend — 별 눈 + 전설 미소 (14+일)

// ── 베이스: 몸통 + 잎 + 광택 (표정 제외) ─────────────────────────
const BODY_SVG = `
  <ellipse cx="256" cy="456" rx="170" ry="24" fill="#000000" opacity="0.12"/>
  <path
    d="M256 120
       C164 120 82 190 82 294
       C82 392 160 448 256 448
       C352 448 430 392 430 294
       C430 190 348 120 256 120 Z"
    fill="url(#tfBody)"
    stroke="#b81d1d"
    stroke-width="14"
    stroke-linejoin="round"
  />
  <path
    d="M256 78
       C246 92 242 111 247 130
       C223 107 198 101 170 103
       C175 130 193 145 220 152
       C194 160 172 179 157 205
       C188 211 215 208 236 191
       C233 218 240 241 256 259
       C272 241 279 218 276 191
       C297 208 324 211 355 205
       C339 179 317 160 291 152
       C318 145 336 130 341 103
       C312 101 287 107 264 130
       C266 110 264 92 256 78 Z"
    fill="url(#tfLeaf)"
    stroke="#32844d"
    stroke-width="10"
    stroke-linejoin="round"
  />
  <ellipse cx="170" cy="212" rx="38" ry="22" transform="rotate(-42 170 212)" fill="url(#tfShine)" opacity="0.88"/>
  <ellipse cx="112" cy="270" rx="17" ry="15" fill="#ffffff" opacity="0.42"/>
`;

// ── 표정 파츠 (눈 + 입 + 선택적 볼) ──────────────────────────────
// 원본 좌표계: 왼쪽 눈 중심 ~(182, 286), 오른쪽 눈 ~(330, 286), 입 ~(256, 340)
const FACES = {
  // 0일: 잠자는 듯 평온한 닫힌 눈
  seed: `
    <path d="M150 282 Q182 300 214 282" fill="none" stroke="#7a1818" stroke-width="11" stroke-linecap="round"/>
    <path d="M298 282 Q330 300 362 282" fill="none" stroke="#7a1818" stroke-width="11" stroke-linecap="round"/>
    <path d="M238 342 Q256 350 274 342" fill="none" stroke="#7a1818" stroke-width="10" stroke-linecap="round"/>
  `,

  // 1-2일: 살짝 뜬 눈 (happy의 눈 면적 절반). 입/볼은 happy와 동일.
  smile: `
    <g transform="translate(182 286) scale(0.6) translate(-182 -286)">
      <ellipse cx="182" cy="286" rx="42" ry="49" fill="#a61d1f"/>
      <circle cx="171" cy="272" r="18" fill="#ffffff"/>
      <circle cx="199" cy="284" r="9" fill="#ffffff"/>
      <path d="M162 302 C170 314 186 315 197 305" fill="none" stroke="#e05f61" stroke-width="8" stroke-linecap="round"/>
    </g>
    <g transform="translate(330 286) scale(0.6) translate(-330 -286)">
      <ellipse cx="330" cy="286" rx="42" ry="49" fill="#a61d1f"/>
      <circle cx="319" cy="272" r="18" fill="#ffffff"/>
      <circle cx="347" cy="284" r="9" fill="#ffffff"/>
      <path d="M310 302 C318 314 334 315 345 305" fill="none" stroke="#e05f61" stroke-width="8" stroke-linecap="round"/>
    </g>
    <ellipse cx="144" cy="352" rx="38" ry="22" fill="#ff9ba1" opacity="0.88"/>
    <ellipse cx="368" cy="352" rx="38" ry="22" fill="#ff9ba1" opacity="0.88"/>
    <path
      d="M220 332
         C228 350 243 354 256 339
         C269 354 284 350 292 332"
      fill="none" stroke="#9a1616" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  `,

  // 3-6일: "환한 미소"(이전 smile 디자인 그대로) + 노란 아우라는 CSS drop-shadow로 처리
  happy: `
    <g transform="translate(182 286) scale(0.84) translate(-182 -286)">
      <ellipse cx="182" cy="286" rx="42" ry="49" fill="#a61d1f"/>
      <circle cx="171" cy="272" r="18" fill="#ffffff"/>
      <circle cx="199" cy="284" r="9" fill="#ffffff"/>
      <path d="M162 302 C170 314 186 315 197 305" fill="none" stroke="#e05f61" stroke-width="8" stroke-linecap="round"/>
    </g>
    <g transform="translate(330 286) scale(0.84) translate(-330 -286)">
      <ellipse cx="330" cy="286" rx="42" ry="49" fill="#a61d1f"/>
      <circle cx="319" cy="272" r="18" fill="#ffffff"/>
      <circle cx="347" cy="284" r="9" fill="#ffffff"/>
      <path d="M310 302 C318 314 334 315 345 305" fill="none" stroke="#e05f61" stroke-width="8" stroke-linecap="round"/>
    </g>
    <ellipse cx="144" cy="352" rx="38" ry="22" fill="#ff9ba1" opacity="0.88"/>
    <ellipse cx="368" cy="352" rx="38" ry="22" fill="#ff9ba1" opacity="0.88"/>
    <path
      d="M220 332
         C228 350 243 354 256 339
         C269 354 284 350 292 332"
      fill="none" stroke="#9a1616" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  `,

  // 7-13일: "환한 미소"(happy와 동일 디자인) + 강한 흰/노랑 아우라는 CSS drop-shadow로 처리
  fire: `
    <g transform="translate(182 286) scale(0.84) translate(-182 -286)">
      <ellipse cx="182" cy="286" rx="42" ry="49" fill="#a61d1f"/>
      <circle cx="171" cy="272" r="18" fill="#ffffff"/>
      <circle cx="199" cy="284" r="9" fill="#ffffff"/>
      <path d="M162 302 C170 314 186 315 197 305" fill="none" stroke="#e05f61" stroke-width="8" stroke-linecap="round"/>
    </g>
    <g transform="translate(330 286) scale(0.84) translate(-330 -286)">
      <ellipse cx="330" cy="286" rx="42" ry="49" fill="#a61d1f"/>
      <circle cx="319" cy="272" r="18" fill="#ffffff"/>
      <circle cx="347" cy="284" r="9" fill="#ffffff"/>
      <path d="M310 302 C318 314 334 315 345 305" fill="none" stroke="#e05f61" stroke-width="8" stroke-linecap="round"/>
    </g>
    <ellipse cx="144" cy="352" rx="38" ry="22" fill="#ff9ba1" opacity="0.88"/>
    <ellipse cx="368" cy="352" rx="38" ry="22" fill="#ff9ba1" opacity="0.88"/>
    <path
      d="M220 332
         C228 350 243 354 256 339
         C269 354 284 350 292 332"
      fill="none" stroke="#9a1616" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  `,

  // 14+일: 별 눈 + 전설 미소 + 반짝이
  legend: `
    <path d="M182 256 L192 282 L220 284 L198 302 L207 330 L182 314 L157 330 L166 302 L144 284 L172 282 Z"
          fill="#ffd84d" stroke="#e8a210" stroke-width="4" stroke-linejoin="round"/>
    <path d="M330 256 L340 282 L368 284 L346 302 L355 330 L330 314 L305 330 L314 302 L292 284 L320 282 Z"
          fill="#ffd84d" stroke="#e8a210" stroke-width="4" stroke-linejoin="round"/>
    <ellipse cx="130" cy="362" rx="46" ry="26" fill="#ff4d58" opacity="0.95"/>
    <ellipse cx="382" cy="362" rx="46" ry="26" fill="#ff4d58" opacity="0.95"/>
    <path
      d="M188 328
         Q256 412 324 328
         Q320 366 256 382
         Q192 366 188 328 Z"
      fill="#9a1616" stroke="#7a0f0f" stroke-width="6" stroke-linejoin="round"/>
    <path d="M208 346 Q256 388 304 346 Q288 358 256 360 Q224 358 208 346 Z" fill="#ff8691"/>
    <circle cx="96" cy="180" r="6" fill="#ffd84d"/>
    <circle cx="420" cy="200" r="5" fill="#ffd84d"/>
    <circle cx="70" cy="310" r="4" fill="#ffd84d"/>
  `,
};

/**
 * 히어로카드 우측에 삽입할 토마토 캐릭터 SVG 문자열 반환.
 *
 * @param {'seed'|'smile'|'happy'|'fire'|'legend'} mood - calc.js streakToCharacterMood() 결과
 * @param {object} [opts]
 * @param {number} [opts.size=72] - px 크기 (너비·높이 동일)
 * @param {string} [opts.className=''] - 추가 CSS 클래스
 * @returns {string} 인라인 `<svg>` 문자열
 */
export function renderCharacterSVG(mood = 'seed', opts = {}) {
  const { size = 72, className = '' } = opts;
  const face = FACES[mood] || FACES.seed;
  const cls = `tf-hero-character tf-hero-character--${mood}${className ? ' ' + className : ''}`;
  return `<svg class="${cls}" viewBox="0 0 512 512" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="토마토 캐릭터">
    <defs>
      <radialGradient id="tfBody" cx="38%" cy="28%" r="72%">
        <stop offset="0%" stop-color="#ff6861"/>
        <stop offset="58%" stop-color="#ff3835"/>
        <stop offset="100%" stop-color="#dc2727"/>
      </radialGradient>
      <radialGradient id="tfShine" cx="30%" cy="25%" r="80%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.92"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="tfLeaf" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#7fe48c"/>
        <stop offset="100%" stop-color="#2f8f4d"/>
      </linearGradient>
    </defs>
    ${BODY_SVG}
    <g class="tf-hero-character-face">${face}</g>
  </svg>`;
}
