// ================================================================
// farm-canvas.js — 픽셀 아트 아이소메트릭 농장 렌더러
// Stardew Valley / Hay Day 스타일
// ================================================================

const TILE_W = 52;
const TILE_H = 26;
const GRID_COLS = 6;
const GRID_ROWS = 6;
const CANVAS_W = 380;
const CANVAS_H = 340;
const ORIGIN_X = CANVAS_W / 2;
const ORIGIN_Y = 70;

// ── 색 팔레트 (통일된 톤) ──────────────────────────────────────
const PAL = {
  // 자연
  grass1: '#5da63a', grass2: '#6db844', grass3: '#7ec854', grassDark: '#4a8f2e',
  dirt1: '#c4a46c', dirt2: '#b89458', dirt3: '#d4b87c', dirtLine: '#a08050',
  path1: '#ddd0b0', path2: '#ccc098',
  water: '#4a9ec4', waterLight: '#6ab8d8',
  // 나무
  trunk: '#6b4226', trunkLight: '#8b5a30',
  leaf1: '#2d8e3e', leaf2: '#3da850', leaf3: '#50b860', leafLight: '#70d878',
  // 건물
  wall: '#f5e6c8', wallDark: '#d4c4a0', roof: '#c0392b', roofDark: '#a02018',
  door: '#6b4226', window: '#87CEEB', windowFrame: '#5a9ab5',
  // 캐릭터
  skin: '#fdd8b5', skinDark: '#e8c199', hair: '#4a3728',
  shirt: '#4a90d9', shirtDark: '#3570a8', pants: '#5a6b80', pantsDark: '#485868',
  hat: '#f5deb3', hatBand: '#c4a46c',
  // 작물
  stem: '#3d8e40', stemDark: '#2d7830',
  tomato: '#e53935', tomatoLight: '#f44336', tomatoHighlight: '#ff6b6b',
  tomatoStem: '#388e3c',
  petal: '#ff9ebc', petalCenter: '#ffdd44',
  seed: '#8b6914',
  sprout: '#5cb85c', sproutLight: '#7dd87d',
  // 동물
  chickenWhite: '#fafafa', chickenComb: '#e53935', chickenBeak: '#ff9800',
  catOrange: '#f5a623', catDark: '#d48a10',
  // 기타
  fenceWood: '#a07850', fenceLight: '#c49868',
  stone: '#999', stoneLight: '#bbb',
  sky1: '#7ec8e3', sky2: '#a8dce6', sky3: '#c8eaf4',
  cloud: 'rgba(255,255,255,0.8)',
  sun: '#ffe066', sunCore: '#ffcc00',
  shadow: 'rgba(0,0,0,0.12)',
};

// ── 좌표 변환 ──────────────────────────────────────────────────
function g2s(col, row) {
  return {
    x: ORIGIN_X + (col - row) * (TILE_W / 2),
    y: ORIGIN_Y + (col + row) * (TILE_H / 2),
  };
}

function s2g(sx, sy) {
  const dx = sx - ORIGIN_X, dy = sy - ORIGIN_Y;
  return {
    col: Math.round((dx / (TILE_W/2) + dy / (TILE_H/2)) / 2),
    row: Math.round((dy / (TILE_H/2) - dx / (TILE_W/2)) / 2),
  };
}

// ── 픽셀 드로잉 헬퍼 ──────────────────────────────────────────
function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function pxCircle(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
}

function diamond(ctx, x, y, w, h, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x, y - h/2);
  ctx.lineTo(x + w/2, y);
  ctx.lineTo(x, y + h/2);
  ctx.lineTo(x - w/2, y);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.8; ctx.stroke(); }
}

// ── 타일 그리기 ────────────────────────────────────────────────
const MAP = [
  [0,0,0,0,0,0],
  [0,1,1,1,0,0],
  [0,1,1,1,0,0],
  [0,1,1,1,0,0],
  [0,0,2,0,0,0],
  [0,0,2,0,0,0],
];

function drawTile(ctx, col, row) {
  const { x, y } = g2s(col, row);
  const type = MAP[row]?.[col] ?? 0;

  if (type === 1) {
    // 논밭
    diamond(ctx, x, y, TILE_W, TILE_H, PAL.dirt1, PAL.dirtLine);
    // 줄무늬 (경작 줄)
    ctx.save(); ctx.globalAlpha = 0.2;
    for (let i = -3; i <= 3; i++) {
      px(ctx, x - TILE_W/4 + i*6, y + i*3 - 1, TILE_W/3, 1, PAL.dirtLine);
    }
    ctx.restore();
  } else if (type === 2) {
    // 길
    diamond(ctx, x, y, TILE_W, TILE_H, PAL.path1, PAL.path2);
    // 자갈 텍스처
    ctx.globalAlpha = 0.15;
    pxCircle(ctx, x-4, y-1, 1.5, PAL.dirtLine);
    pxCircle(ctx, x+6, y+2, 1, PAL.dirtLine);
    pxCircle(ctx, x-2, y+3, 1.2, PAL.dirtLine);
    ctx.globalAlpha = 1;
  } else {
    // 잔디
    diamond(ctx, x, y, TILE_W, TILE_H, PAL.grass2, PAL.grassDark);
    // 풀 텍스처
    ctx.globalAlpha = 0.3;
    pxCircle(ctx, x-6, y-2, 1, PAL.grass3);
    pxCircle(ctx, x+4, y+1, 1, PAL.leafLight);
    pxCircle(ctx, x+8, y-3, 0.8, PAL.grass3);
    ctx.globalAlpha = 1;
  }
}

// ── 스프라이트 드로잉 ──────────────────────────────────────────

function drawSprTree(ctx, x, y, s) {
  // 그림자
  ctx.globalAlpha = 0.15;
  ctx.beginPath(); ctx.ellipse(x, y+2, 12*s, 4*s, 0, 0, Math.PI*2); ctx.fillStyle='#000'; ctx.fill();
  ctx.globalAlpha = 1;
  // 줄기
  px(ctx, x-3*s, y-20*s, 6*s, 22*s, PAL.trunk);
  px(ctx, x-1*s, y-18*s, 2*s, 18*s, PAL.trunkLight);
  // 잎 (큰 뭉치 3개)
  pxCircle(ctx, x-7*s, y-22*s, 9*s, PAL.leaf1);
  pxCircle(ctx, x+7*s, y-22*s, 9*s, PAL.leaf2);
  pxCircle(ctx, x, y-28*s, 10*s, PAL.leaf3);
  // 하이라이트
  ctx.globalAlpha = 0.4;
  pxCircle(ctx, x-3*s, y-30*s, 5*s, PAL.leafLight);
  pxCircle(ctx, x+5*s, y-24*s, 4*s, PAL.leafLight);
  ctx.globalAlpha = 1;
}

function drawSprHouse(ctx, x, y, s) {
  ctx.globalAlpha = 0.12;
  ctx.beginPath(); ctx.ellipse(x, y+2, 18*s, 5*s, 0, 0, Math.PI*2); ctx.fillStyle='#000'; ctx.fill();
  ctx.globalAlpha = 1;
  // 벽
  px(ctx, x-16*s, y-24*s, 32*s, 24*s, PAL.wall);
  px(ctx, x-16*s, y-24*s, 32*s, 2*s, PAL.wallDark);
  px(ctx, x-16*s, y-24*s, 2*s, 24*s, PAL.wallDark);
  // 지붕
  ctx.beginPath();
  ctx.moveTo(x-20*s, y-24*s); ctx.lineTo(x, y-40*s); ctx.lineTo(x+20*s, y-24*s);
  ctx.closePath(); ctx.fillStyle = PAL.roof; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x-20*s, y-24*s); ctx.lineTo(x, y-40*s); ctx.lineTo(x, y-24*s);
  ctx.closePath(); ctx.fillStyle = PAL.roofDark; ctx.fill();
  // 문
  px(ctx, x-4*s, y-14*s, 8*s, 14*s, PAL.door);
  px(ctx, x+2*s, y-8*s, 1.5*s, 1.5*s, PAL.sun);
  // 창문
  px(ctx, x-12*s, y-20*s, 6*s, 6*s, PAL.window);
  px(ctx, x+6*s, y-20*s, 6*s, 6*s, PAL.window);
  px(ctx, x-12*s, y-20*s, 6*s, 1*s, PAL.windowFrame);
  px(ctx, x+6*s, y-20*s, 6*s, 1*s, PAL.windowFrame);
  // 창문 십자
  px(ctx, x-9.5*s, y-20*s, 1*s, 6*s, PAL.windowFrame);
  px(ctx, x+8.5*s, y-20*s, 1*s, 6*s, PAL.windowFrame);
  // 굴뚝
  px(ctx, x+10*s, y-38*s, 5*s, 10*s, PAL.stone);
  px(ctx, x+10*s, y-39*s, 7*s, 2*s, PAL.stoneLight);
}

function drawSprCrop(ctx, x, y, stage, s) {
  if (stage === 0) {
    // 씨앗
    px(ctx, x-1*s, y-2*s, 3*s, 2*s, PAL.seed);
    px(ctx, x, y-3*s, 1*s, 1*s, PAL.seed);
  } else if (stage === 1) {
    // 새싹
    px(ctx, x, y-10*s, 1.5*s, 10*s, PAL.stem);
    pxCircle(ctx, x-3*s, y-11*s, 3*s, PAL.sprout);
    pxCircle(ctx, x+3*s, y-11*s, 3*s, PAL.sproutLight);
  } else if (stage === 2) {
    // 꽃
    px(ctx, x, y-14*s, 1.5*s, 14*s, PAL.stem);
    px(ctx, x-2*s, y-8*s, 5*s, 1.5*s, PAL.stemDark); // 잎
    for (let a = 0; a < 5; a++) {
      const angle = (a/5) * Math.PI*2 - Math.PI/2;
      pxCircle(ctx, x + Math.cos(angle)*4*s, y-18*s + Math.sin(angle)*4*s, 2.5*s, PAL.petal);
    }
    pxCircle(ctx, x, y-18*s, 2*s, PAL.petalCenter);
  } else {
    // 토마토 🍅
    px(ctx, x, y-12*s, 1.5*s, 12*s, PAL.stem);
    px(ctx, x-3*s, y-6*s, 7*s, 1.5*s, PAL.stemDark);
    pxCircle(ctx, x, y-17*s, 7*s, PAL.tomato);
    pxCircle(ctx, x-1*s, y-18*s, 6*s, PAL.tomatoLight);
    // 하이라이트
    ctx.globalAlpha = 0.5;
    pxCircle(ctx, x-2*s, y-20*s, 2.5*s, PAL.tomatoHighlight);
    ctx.globalAlpha = 1;
    // 꼭지
    px(ctx, x-3*s, y-24*s, 6*s, 3*s, PAL.tomatoStem);
    px(ctx, x-1*s, y-26*s, 3*s, 2*s, PAL.tomatoStem);
  }
}

function drawSprChar(ctx, x, y, s) {
  // 그림자
  ctx.globalAlpha = 0.15;
  ctx.beginPath(); ctx.ellipse(x, y+1, 7*s, 3*s, 0, 0, Math.PI*2); ctx.fillStyle='#000'; ctx.fill();
  ctx.globalAlpha = 1;
  // 다리
  px(ctx, x-4*s, y-8*s, 3*s, 9*s, PAL.pants);
  px(ctx, x+1*s, y-8*s, 3*s, 9*s, PAL.pants);
  px(ctx, x-4*s, y-8*s, 1*s, 9*s, PAL.pantsDark);
  // 몸
  px(ctx, x-6*s, y-20*s, 12*s, 12*s, PAL.shirt);
  px(ctx, x-6*s, y-20*s, 3*s, 12*s, PAL.shirtDark);
  // 팔
  px(ctx, x-9*s, y-18*s, 3*s, 8*s, PAL.shirt);
  px(ctx, x+6*s, y-18*s, 3*s, 8*s, PAL.shirt);
  // 손
  px(ctx, x-9*s, y-10*s, 3*s, 3*s, PAL.skin);
  px(ctx, x+6*s, y-10*s, 3*s, 3*s, PAL.skin);
  // 머리
  pxCircle(ctx, x, y-26*s, 8*s, PAL.skin);
  pxCircle(ctx, x-1*s, y-27*s, 7*s, PAL.skin);
  // 머리카락
  ctx.beginPath(); ctx.arc(x, y-28*s, 8*s, Math.PI, 0); ctx.fillStyle=PAL.hair; ctx.fill();
  px(ctx, x-8*s, y-28*s, 16*s, 3*s, PAL.hair);
  // 눈
  px(ctx, x-3*s, y-26*s, 2*s, 2*s, '#333');
  px(ctx, x+2*s, y-26*s, 2*s, 2*s, '#333');
  // 눈 하이라이트
  px(ctx, x-2.5*s, y-26.5*s, 1*s, 1*s, '#fff');
  px(ctx, x+2.5*s, y-26.5*s, 1*s, 1*s, '#fff');
  // 입
  px(ctx, x-1.5*s, y-22.5*s, 3*s, 1*s, '#c88');
  // 밀짚모자
  ctx.beginPath(); ctx.ellipse(x, y-32*s, 11*s, 3.5*s, 0, 0, Math.PI*2);
  ctx.fillStyle=PAL.hat; ctx.fill();
  px(ctx, x-5*s, y-39*s, 10*s, 7*s, PAL.hat);
  px(ctx, x-6*s, y-33*s, 12*s, 2*s, PAL.hatBand);
  // 모자 하이라이트
  ctx.globalAlpha = 0.2;
  px(ctx, x-3*s, y-38*s, 6*s, 3*s, '#fff');
  ctx.globalAlpha = 1;
}

function drawSprFence(ctx, x, y, s) {
  px(ctx, x-7*s, y-12*s, 3*s, 12*s, PAL.fenceWood);
  px(ctx, x+5*s, y-12*s, 3*s, 12*s, PAL.fenceWood);
  px(ctx, x-8*s, y-10*s, 17*s, 2*s, PAL.fenceLight);
  px(ctx, x-8*s, y-6*s, 17*s, 2*s, PAL.fenceLight);
  // 기둥 꼭대기
  px(ctx, x-7*s, y-13*s, 3*s, 2*s, PAL.fenceLight);
  px(ctx, x+5*s, y-13*s, 3*s, 2*s, PAL.fenceLight);
}

function drawSprChicken(ctx, x, y, s) {
  ctx.globalAlpha = 0.1;
  ctx.beginPath(); ctx.ellipse(x, y+1, 5*s, 2*s, 0, 0, Math.PI*2); ctx.fillStyle='#000'; ctx.fill();
  ctx.globalAlpha = 1;
  // 몸
  ctx.beginPath(); ctx.ellipse(x, y-4*s, 5*s, 4*s, 0, 0, Math.PI*2);
  ctx.fillStyle=PAL.chickenWhite; ctx.fill();
  // 날개
  ctx.beginPath(); ctx.ellipse(x-3*s, y-4*s, 3*s, 3*s, -0.3, 0, Math.PI*2);
  ctx.fillStyle='#eee'; ctx.fill();
  // 머리
  pxCircle(ctx, x+5*s, y-8*s, 3*s, PAL.chickenWhite);
  // 벼슬
  pxCircle(ctx, x+5*s, y-11*s, 2*s, PAL.chickenComb);
  // 부리
  ctx.beginPath();
  ctx.moveTo(x+8*s, y-8*s); ctx.lineTo(x+11*s, y-7*s); ctx.lineTo(x+8*s, y-6*s);
  ctx.fillStyle=PAL.chickenBeak; ctx.fill();
  // 눈
  px(ctx, x+5.5*s, y-8.5*s, 1*s, 1*s, '#333');
  // 다리
  px(ctx, x-1*s, y, 1*s, 3*s, PAL.chickenBeak);
  px(ctx, x+2*s, y, 1*s, 3*s, PAL.chickenBeak);
}

function drawSprCat(ctx, x, y, s) {
  ctx.globalAlpha = 0.1;
  ctx.beginPath(); ctx.ellipse(x, y+1, 5*s, 2*s, 0, 0, Math.PI*2); ctx.fillStyle='#000'; ctx.fill();
  ctx.globalAlpha = 1;
  // 몸
  ctx.beginPath(); ctx.ellipse(x, y-3*s, 5*s, 3.5*s, 0, 0, Math.PI*2);
  ctx.fillStyle=PAL.catOrange; ctx.fill();
  // 머리
  pxCircle(ctx, x+5*s, y-7*s, 4*s, PAL.catOrange);
  // 귀
  ctx.beginPath();
  ctx.moveTo(x+3*s,y-11*s); ctx.lineTo(x+2*s,y-15*s); ctx.lineTo(x+6*s,y-11*s);
  ctx.fillStyle=PAL.catOrange; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x+7*s,y-11*s); ctx.lineTo(x+8*s,y-15*s); ctx.lineTo(x+10*s,y-11*s);
  ctx.fillStyle=PAL.catDark; ctx.fill();
  // 눈
  px(ctx, x+3.5*s, y-7.5*s, 1.5*s, 1.5*s, '#333');
  px(ctx, x+6.5*s, y-7.5*s, 1.5*s, 1.5*s, '#333');
  // 꼬리
  ctx.strokeStyle = PAL.catOrange; ctx.lineWidth = 2*s; ctx.lineCap='round';
  ctx.beginPath(); ctx.arc(x-6*s, y-4*s, 5*s, -0.5, 1.2); ctx.stroke();
  ctx.lineCap='butt';
}

function drawSprWell(ctx, x, y, s) {
  ctx.globalAlpha = 0.1;
  ctx.beginPath(); ctx.ellipse(x, y+2, 10*s, 4*s, 0, 0, Math.PI*2); ctx.fillStyle='#000'; ctx.fill();
  ctx.globalAlpha = 1;
  // 돌 기초
  ctx.beginPath(); ctx.ellipse(x, y-2*s, 10*s, 5*s, 0, 0, Math.PI*2);
  ctx.fillStyle=PAL.stone; ctx.fill();
  ctx.beginPath(); ctx.ellipse(x, y-4*s, 10*s, 5*s, 0, 0, Math.PI*2);
  ctx.fillStyle=PAL.stoneLight; ctx.fill();
  // 물
  ctx.beginPath(); ctx.ellipse(x, y-5*s, 7*s, 3*s, 0, 0, Math.PI*2);
  ctx.fillStyle=PAL.water; ctx.fill();
  ctx.globalAlpha=0.3; pxCircle(ctx, x-2*s, y-6*s, 2*s, PAL.waterLight); ctx.globalAlpha=1;
  // 기둥
  px(ctx, x-8*s, y-18*s, 2*s, 14*s, PAL.trunk);
  px(ctx, x+6*s, y-18*s, 2*s, 14*s, PAL.trunk);
  // 지붕
  ctx.beginPath();
  ctx.moveTo(x-10*s, y-18*s); ctx.lineTo(x, y-24*s); ctx.lineTo(x+10*s, y-18*s);
  ctx.closePath(); ctx.fillStyle=PAL.roof; ctx.fill();
}

function drawSprFlower(ctx, x, y, type, s) {
  px(ctx, x, y-8*s, 1*s, 8*s, PAL.stem);
  const colors = { flower1: '#ff9ebc', flower2: '#ffdd44', flower3: '#ff6b6b' };
  const c = colors[type] || '#ff9ebc';
  for (let a = 0; a < 5; a++) {
    const angle = (a/5)*Math.PI*2 - Math.PI/2;
    pxCircle(ctx, x+Math.cos(angle)*3*s, y-12*s+Math.sin(angle)*3*s, 2*s, c);
  }
  pxCircle(ctx, x, y-12*s, 1.5*s, PAL.petalCenter);
}

// ── 메인 렌더 ──────────────────────────────────────────────────
export function renderFarm(canvas, farmState, shopItems, tomatoStage, charPos) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = CANVAS_W * dpr;
  canvas.height = CANVAS_H * dpr;
  canvas.style.width = CANVAS_W + 'px';
  canvas.style.height = CANVAS_H + 'px';
  ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = false; // 픽셀 아트 선명하게

  // 하늘
  const sky = ctx.createLinearGradient(0, 0, 0, ORIGIN_Y + 10);
  sky.addColorStop(0, PAL.sky1); sky.addColorStop(0.7, PAL.sky2); sky.addColorStop(1, PAL.sky3);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, CANVAS_W, ORIGIN_Y + 10);

  // 구름
  _drawCloud(ctx, 50, 18, 1);
  _drawCloud(ctx, 150, 12, 0.7);
  _drawCloud(ctx, 280, 22, 0.9);

  // 태양
  pxCircle(ctx, 330, 24, 16, PAL.sun);
  pxCircle(ctx, 330, 24, 12, PAL.sunCore);
  ctx.globalAlpha = 0.2; pxCircle(ctx, 330, 24, 20, PAL.sun); ctx.globalAlpha = 1;

  // 배경 잔디
  ctx.fillStyle = PAL.grass1; ctx.fillRect(0, ORIGIN_Y - 5, CANVAS_W, CANVAS_H);

  // 먼 언덕
  ctx.beginPath();
  ctx.moveTo(0, ORIGIN_Y + 5);
  ctx.quadraticCurveTo(80, ORIGIN_Y - 15, 160, ORIGIN_Y + 5);
  ctx.quadraticCurveTo(240, ORIGIN_Y - 10, 320, ORIGIN_Y + 5);
  ctx.quadraticCurveTo(360, ORIGIN_Y - 8, CANVAS_W, ORIGIN_Y + 5);
  ctx.lineTo(CANVAS_W, ORIGIN_Y + 20); ctx.lineTo(0, ORIGIN_Y + 20);
  ctx.closePath(); ctx.fillStyle = PAL.grassDark; ctx.fill();

  // 타일 그리기
  for (let row = 0; row < GRID_ROWS; row++)
    for (let col = 0; col < GRID_COLS; col++)
      drawTile(ctx, col, row);

  // 오브젝트 수집 (y 순 정렬용)
  const objs = [];
  const tiles = farmState.tiles || [];

  // 배치된 아이템
  for (let i = 0; i < Math.min(tiles.length, 36); i++) {
    if (!tiles[i]) continue;
    const col = i % GRID_COLS, row = Math.floor(i / GRID_COLS);
    const { x, y } = g2s(col, row);
    objs.push({ x, y, id: tiles[i].itemId, row });
  }

  // 빈 밭에 작물 자동 표시
  for (let row = 1; row <= 3; row++)
    for (let col = 1; col <= 3; col++) {
      const idx = row * GRID_COLS + col;
      if (!tiles[idx]) {
        const { x, y } = g2s(col, row);
        objs.push({ x, y, id: '_crop', stage: tomatoStage, row });
      }
    }

  // 캐릭터
  const cCol = (charPos ?? 13) % GRID_COLS, cRow = Math.floor((charPos ?? 13) / GRID_COLS);
  const cs = g2s(cCol, cRow);
  objs.push({ x: cs.x, y: cs.y, id: '_char', row: cRow });

  // y 정렬
  objs.sort((a, b) => a.y - b.y);

  // 그리기
  for (const o of objs) {
    const s = 0.85;
    if (o.id === '_char')         drawSprChar(ctx, o.x, o.y, s);
    else if (o.id === '_crop')    drawSprCrop(ctx, o.x, o.y - 4, o.stage, s);
    else if (o.id === 'tree1' || o.id === 'tree2') drawSprTree(ctx, o.x, o.y, s);
    else if (o.id === 'house')    drawSprHouse(ctx, o.x, o.y, s * 0.8);
    else if (o.id === 'fence')    drawSprFence(ctx, o.x, o.y, s);
    else if (o.id === 'well')     drawSprWell(ctx, o.x, o.y, s * 0.8);
    else if (o.id === 'chicken')  drawSprChicken(ctx, o.x, o.y - 2, s);
    else if (o.id === 'cat')      drawSprCat(ctx, o.x, o.y - 2, s);
    else if (o.id === 'dog')      drawSprCat(ctx, o.x, o.y - 2, s); // 재사용
    else if (o.id === 'rabbit')   drawSprChicken(ctx, o.x, o.y - 2, s); // 재사용
    else if (o.id?.startsWith('flower')) drawSprFlower(ctx, o.x, o.y - 2, o.id, s);
    else if (o.id === 'herb' || o.id === 'mushroom' || o.id === 'cactus')
      drawSprCrop(ctx, o.x, o.y - 2, 1, s * 0.8);
    else if (o.id === 'bench' || o.id === 'lamp')
      drawSprFence(ctx, o.x, o.y, s * 0.7);
    else if (o.id === 'barn')
      drawSprHouse(ctx, o.x, o.y, s * 0.6);
    else {
      const item = shopItems.find(si => si.id === o.id);
      if (item) { ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(item.emoji, o.x, o.y - 8); }
    }
  }

  // 입구 간판
  const gate = g2s(2, 5);
  px(ctx, gate.x-2, gate.y-20, 4, 18, PAL.trunk);
  px(ctx, gate.x-14, gate.y-24, 28, 12, PAL.wall);
  ctx.strokeStyle = PAL.wallDark; ctx.lineWidth = 1;
  ctx.strokeRect(gate.x-14, gate.y-24, 28, 12);
  ctx.fillStyle = PAL.hair; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('MY FARM', gate.x, gate.y - 16);
}

function _drawCloud(ctx, x, y, s) {
  ctx.fillStyle = PAL.cloud;
  ctx.beginPath(); ctx.ellipse(x, y, 18*s, 7*s, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x+12*s, y-2, 12*s, 5*s, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x-10*s, y+1, 10*s, 4*s, 0, 0, Math.PI*2); ctx.fill();
}

// ── 클릭 ────────────────────────────────────────────────────────
export function canvasClickToGrid(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const sx = (clientX - rect.left) * (CANVAS_W / rect.width);
  const sy = (clientY - rect.top) * (CANVAS_H / rect.height);
  const { col, row } = s2g(sx, sy);
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return null;
  return { col, row, index: row * GRID_COLS + col };
}
