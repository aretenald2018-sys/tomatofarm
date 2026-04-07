const sharp = require('sharp');

// 모바일 스크린샷 (540x720)
const narrowSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="720" viewBox="0 0 540 720">
  <rect width="540" height="720" fill="#f7f8fa"/>
  <!-- 상단바 -->
  <rect width="540" height="56" fill="#fff"/>
  <text x="20" y="36" font-family="sans-serif" font-size="18" font-weight="bold" fill="#111">토마토 키우기</text>
  <text x="490" y="36" font-family="sans-serif" font-size="20">🔔</text>
  <text x="510" y="36" font-family="sans-serif" font-size="20">👤</text>

  <!-- 홈 카드: 오늘의 기록 -->
  <rect x="16" y="72" width="508" height="160" rx="16" fill="#fff" stroke="#e5e7eb" stroke-width="1"/>
  <text x="32" y="100" font-family="sans-serif" font-size="14" font-weight="bold" fill="#111">오늘의 기록</text>
  <text x="32" y="124" font-family="sans-serif" font-size="12" fill="#888">2026년 4월 5일 (토)</text>
  <!-- 토마토 아이콘 -->
  <circle cx="270" cy="175" r="30" fill="#e53935"/>
  <ellipse cx="262" cy="165" rx="10" ry="7" fill="rgba(255,255,255,0.2)"/>
  <text x="270" y="185" font-family="sans-serif" font-size="14" fill="#fff" text-anchor="middle" font-weight="bold">Lv.3</text>
  <path d="M265 142 Q270 130 275 142" stroke="#388e3c" stroke-width="2" fill="none"/>

  <!-- 운동 섹션 -->
  <rect x="16" y="248" width="508" height="120" rx="16" fill="#fff" stroke="#e5e7eb" stroke-width="1"/>
  <text x="32" y="276" font-family="sans-serif" font-size="14" font-weight="bold" fill="#111">🏋️ 운동</text>
  <rect x="32" y="290" width="60" height="26" rx="13" fill="#dcfce7"/>
  <text x="44" y="308" font-family="sans-serif" font-size="11" font-weight="bold" fill="#22c55e">가슴</text>
  <rect x="100" y="290" width="60" height="26" rx="13" fill="#dcfce7"/>
  <text x="112" y="308" font-family="sans-serif" font-size="11" font-weight="bold" fill="#22c55e">삼두</text>
  <rect x="168" y="290" width="60" height="26" rx="13" fill="#dcfce7"/>
  <text x="180" y="308" font-family="sans-serif" font-size="11" font-weight="bold" fill="#22c55e">어깨</text>
  <text x="32" y="348" font-family="sans-serif" font-size="12" fill="#888">총 볼륨 12,450kg · 5세트</text>

  <!-- 식단 섹션 -->
  <rect x="16" y="384" width="508" height="140" rx="16" fill="#fff" stroke="#e5e7eb" stroke-width="1"/>
  <text x="32" y="412" font-family="sans-serif" font-size="14" font-weight="bold" fill="#111">🍽️ 식단</text>
  <text x="32" y="438" font-family="sans-serif" font-size="12" fill="#666">🌅 아침: 그릭요거트, 바나나 (320kcal)</text>
  <text x="32" y="462" font-family="sans-serif" font-size="12" fill="#666">☀️ 점심: 닭가슴살 샐러드 (450kcal)</text>
  <text x="32" y="486" font-family="sans-serif" font-size="12" fill="#666">🌙 저녁: 연어 포케 (520kcal)</text>
  <text x="32" y="510" font-family="sans-serif" font-size="11" fill="#22c55e" font-weight="bold">총 1,290kcal / 목표 1,800kcal</text>

  <!-- 이웃 섹션 -->
  <rect x="16" y="540" width="508" height="100" rx="16" fill="#fff" stroke="#e5e7eb" stroke-width="1"/>
  <text x="32" y="568" font-family="sans-serif" font-size="14" font-weight="bold" fill="#111">🏡 이웃</text>
  <text x="32" y="592" font-family="sans-serif" font-size="12" fill="#22c55e" font-weight="bold">오늘 2명의 이웃이 기록했어요</text>
  <circle cx="42" cy="620" r="14" fill="#e53935"/>
  <text x="42" y="625" font-family="sans-serif" font-size="10" fill="#fff" text-anchor="middle">🍅</text>
  <text x="64" y="624" font-family="sans-serif" font-size="12" fill="#333">동료A · 🏋️ 등, 이두</text>

  <!-- 하단 탭바 -->
  <rect y="668" width="540" height="52" fill="#fff" stroke="#e5e7eb" stroke-width="1"/>
  <text x="54" y="700" font-family="sans-serif" font-size="11" fill="#22c55e" text-anchor="middle" font-weight="bold">홈</text>
  <text x="135" y="700" font-family="sans-serif" font-size="11" fill="#888" text-anchor="middle">운동</text>
  <text x="216" y="700" font-family="sans-serif" font-size="11" fill="#888" text-anchor="middle">식단</text>
  <text x="297" y="700" font-family="sans-serif" font-size="11" fill="#888" text-anchor="middle">캘린더</text>
  <text x="378" y="700" font-family="sans-serif" font-size="11" fill="#888" text-anchor="middle">통계</text>
  <text x="459" y="700" font-family="sans-serif" font-size="11" fill="#888" text-anchor="middle">더보기</text>
</svg>`;

// 데스크톱 스크린샷 (1280x720)
const wideSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#f7f8fa"/>
  <!-- 상단바 -->
  <rect width="1280" height="56" fill="#fff"/>
  <text x="24" y="36" font-family="sans-serif" font-size="18" font-weight="bold" fill="#111">토마토 키우기</text>
  <text x="1220" y="36" font-family="sans-serif" font-size="20">🔔</text>
  <text x="1250" y="36" font-family="sans-serif" font-size="20">👤</text>

  <!-- 왼쪽: 오늘의 기록 -->
  <rect x="16" y="72" width="400" height="580" rx="16" fill="#fff" stroke="#e5e7eb" stroke-width="1"/>
  <text x="32" y="104" font-family="sans-serif" font-size="16" font-weight="bold" fill="#111">오늘의 기록</text>
  <text x="32" y="128" font-family="sans-serif" font-size="12" fill="#888">2026년 4월 5일 (토)</text>
  <!-- 토마토 -->
  <circle cx="220" cy="190" r="40" fill="#e53935"/>
  <ellipse cx="208" cy="177" rx="13" ry="9" fill="rgba(255,255,255,0.2)"/>
  <text x="220" y="200" font-family="sans-serif" font-size="16" fill="#fff" text-anchor="middle" font-weight="bold">Lv.3</text>
  <path d="M213 146 Q220 130 227 146" stroke="#388e3c" stroke-width="2.5" fill="none"/>
  <!-- 운동 -->
  <text x="32" y="260" font-family="sans-serif" font-size="14" font-weight="bold" fill="#111">🏋️ 운동</text>
  <rect x="32" y="274" width="56" height="24" rx="12" fill="#dcfce7"/>
  <text x="44" y="291" font-family="sans-serif" font-size="10" font-weight="bold" fill="#22c55e">가슴</text>
  <rect x="96" y="274" width="56" height="24" rx="12" fill="#dcfce7"/>
  <text x="108" y="291" font-family="sans-serif" font-size="10" font-weight="bold" fill="#22c55e">삼두</text>
  <rect x="160" y="274" width="56" height="24" rx="12" fill="#dcfce7"/>
  <text x="172" y="291" font-family="sans-serif" font-size="10" font-weight="bold" fill="#22c55e">어깨</text>
  <!-- 식단 -->
  <text x="32" y="330" font-family="sans-serif" font-size="14" font-weight="bold" fill="#111">🍽️ 식단</text>
  <text x="32" y="356" font-family="sans-serif" font-size="12" fill="#666">🌅 그릭요거트, 바나나 (320kcal)</text>
  <text x="32" y="378" font-family="sans-serif" font-size="12" fill="#666">☀️ 닭가슴살 샐러드 (450kcal)</text>
  <text x="32" y="400" font-family="sans-serif" font-size="12" fill="#666">🌙 연어 포케 (520kcal)</text>
  <text x="32" y="428" font-family="sans-serif" font-size="11" fill="#22c55e" font-weight="bold">1,290 / 1,800kcal</text>

  <!-- 가운데: 캘린더 -->
  <rect x="432" y="72" width="420" height="580" rx="16" fill="#fff" stroke="#e5e7eb" stroke-width="1"/>
  <text x="448" y="104" font-family="sans-serif" font-size="16" font-weight="bold" fill="#111">📅 4월 캘린더</text>
  <!-- 요일 헤더 -->
  <text x="460" y="140" font-family="sans-serif" font-size="11" fill="#e53935">일</text>
  <text x="510" y="140" font-family="sans-serif" font-size="11" fill="#333">월</text>
  <text x="560" y="140" font-family="sans-serif" font-size="11" fill="#333">화</text>
  <text x="610" y="140" font-family="sans-serif" font-size="11" fill="#333">수</text>
  <text x="660" y="140" font-family="sans-serif" font-size="11" fill="#333">목</text>
  <text x="710" y="140" font-family="sans-serif" font-size="11" fill="#333">금</text>
  <text x="760" y="140" font-family="sans-serif" font-size="11" fill="#4285f4">토</text>
  <!-- 날짜 그리드 (간략) -->
  <text x="560" y="170" font-family="sans-serif" font-size="12" fill="#333">1</text>
  <text x="610" y="170" font-family="sans-serif" font-size="12" fill="#333">2</text>
  <text x="660" y="170" font-family="sans-serif" font-size="12" fill="#333">3</text>
  <text x="710" y="170" font-family="sans-serif" font-size="12" fill="#333">4</text>
  <rect x="748" y="156" width="28" height="22" rx="11" fill="#22c55e"/>
  <text x="762" y="172" font-family="sans-serif" font-size="12" fill="#fff" text-anchor="middle" font-weight="bold">5</text>
  <text x="460" y="200" font-family="sans-serif" font-size="12" fill="#333">6</text>
  <text x="510" y="200" font-family="sans-serif" font-size="12" fill="#333">7</text>

  <!-- 오른쪽: 이웃 -->
  <rect x="868" y="72" width="396" height="580" rx="16" fill="#fff" stroke="#e5e7eb" stroke-width="1"/>
  <text x="884" y="104" font-family="sans-serif" font-size="16" font-weight="bold" fill="#111">🏡 이웃</text>
  <text x="884" y="130" font-family="sans-serif" font-size="12" fill="#22c55e" font-weight="bold">오늘 2명의 이웃이 기록했어요</text>
  <!-- 이웃 카드 1 -->
  <rect x="884" y="146" width="364" height="70" rx="10" fill="#f9fafb"/>
  <circle cx="908" cy="181" r="18" fill="#e53935"/>
  <text x="908" y="186" font-family="sans-serif" font-size="12" fill="#fff" text-anchor="middle">🍅</text>
  <text x="934" y="174" font-family="sans-serif" font-size="13" font-weight="bold" fill="#111">동료A</text>
  <text x="934" y="194" font-family="sans-serif" font-size="11" fill="#666">🏋️ 등, 이두 · ☀️ 비빔밥</text>
  <!-- 이웃 카드 2 -->
  <rect x="884" y="226" width="364" height="70" rx="10" fill="#f9fafb"/>
  <circle cx="908" cy="261" r="18" fill="#e53935"/>
  <text x="908" y="266" font-family="sans-serif" font-size="12" fill="#fff" text-anchor="middle">🍅</text>
  <text x="934" y="254" font-family="sans-serif" font-size="13" font-weight="bold" fill="#111">동료B</text>
  <text x="934" y="274" font-family="sans-serif" font-size="11" fill="#666">🌅 오트밀 · 🌙 스테이크</text>

  <!-- 하단 탭바 -->
  <rect y="668" width="1280" height="52" fill="#fff" stroke="#e5e7eb" stroke-width="1"/>
  <text x="160" y="700" font-family="sans-serif" font-size="12" fill="#22c55e" text-anchor="middle" font-weight="bold">홈</text>
  <text x="320" y="700" font-family="sans-serif" font-size="12" fill="#888" text-anchor="middle">운동</text>
  <text x="480" y="700" font-family="sans-serif" font-size="12" fill="#888" text-anchor="middle">식단</text>
  <text x="640" y="700" font-family="sans-serif" font-size="12" fill="#888" text-anchor="middle">캘린더</text>
  <text x="800" y="700" font-family="sans-serif" font-size="12" fill="#888" text-anchor="middle">통계</text>
  <text x="960" y="700" font-family="sans-serif" font-size="12" fill="#888" text-anchor="middle">재무</text>
  <text x="1120" y="700" font-family="sans-serif" font-size="12" fill="#888" text-anchor="middle">더보기</text>
</svg>`;

async function generate() {
  await sharp(Buffer.from(narrowSVG)).png().toFile('screenshot-narrow.png');
  console.log('Generated screenshot-narrow.png');
  await sharp(Buffer.from(wideSVG)).png().toFile('screenshot-wide.png');
  console.log('Generated screenshot-wide.png');
}

generate().catch(console.error);
