import { readAppCssSync } from './helpers/css-source.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readPngHeader(relativePath) {
  const buffer = fs.readFileSync(path.join(root, relativePath));
  assert.equal(buffer.toString('ascii', 1, 4), 'PNG');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer.readUInt8(25)
  };
}

test('life zone trainer hook keeps the bulb bubble while hiding the old NPC card area', () => {
  const source = readText('home/life-zone.js');

  assert.match(source, /const LIFE_ZONE_NPC_NAME = '트레이너'/);
  assert.match(source, /const LIFE_ZONE_MIRANDA_NAME = '미란다'/);
  assert.match(source, /const LIFE_ZONE_CONSULTING_CHIEF_NAME = '상담실장'/);
  assert.match(source, /LIFE_ZONE_UI_ROOT/);
  assert.match(source, /npc-quest-bubble\.png/);
  assert.match(source, /miranda-npc-home\.png/);
  assert.match(source, /miranda-fashion-corner\.png/);
  assert.match(source, /setLifeZoneVisitContext/);
  assert.match(source, /resolveLifeZoneConsultingVisitor/);
  assert.match(source, /function _isCurrentLifeZoneRosterActor/);
  assert.match(source, /showCurrentUser: !isRosterActor/);
  assert.match(source, /const remoteActors = roster\.filter\(\(actor\) => actor\.source !== 'self' && actor\.canRead && actor\.accountId\)/);
  assert.match(source, /remoteActors\.map\(\(actor\) => _readLifeZoneActorDay\(actor, todayKey\)\)/);
  assert.match(source, /consulting-room-sofas\.png/);
  assert.match(source, /consulting-chief-npc-seated-home\.png/);
  assert.match(source, /consulting-visitor-gray-shirt-home\.png/);
  assert.match(source, /class="lz-world"/);
  assert.match(source, /class="lz-miranda-corner"/);
  assert.match(source, /class="lz-consulting-room-sofas"/);
  assert.match(source, /data-lz-consulting-visitor/);
  assert.match(source, /data-lz-action="npc-quest"/);
  assert.match(source, /data-lz-action="miranda-quest"/);
  assert.match(source, /data-lz-action="consulting-chief-quest"/);
  assert.match(source, /class="lz-npc-bulb"/);
  assert.match(source, /class="lz-npc-bulb lz-npc-bulb--miranda"/);
  assert.match(source, /class="lz-npc-bulb lz-npc-bulb--consulting-chief"/);
  assert.match(source, /class="lz-nameplate lz-nameplate--npc"/);
  assert.match(source, /aria-label="트레이너 퀘스트 보기"/);
  assert.match(source, /aria-label="미란다 대화 보기"/);
  assert.match(source, /aria-label="상담실장 대화 보기"/);
  assert.match(source, /title="트레이너 퀘스트"/);
  assert.match(source, /title="미란다"/);
  assert.match(source, /title="상담실장"/);
  assert.match(source, /addEventListener\('click'/);
  assert.match(source, /life-zone:npc-quest/);
  assert.match(source, /detail: \{ npc: 'trainer' \}/);
  assert.match(source, /detail: \{ npc: 'miranda' \}/);
  assert.match(source, /detail: \{ npc: 'consultingChief' \}/);
});

test('life zone actor nameplates are rendered as text under actor feet', () => {
  const source = readText('home/life-zone.js');

  assert.match(source, /function _applyActorNameplatePosition/);
  assert.match(source, /element\.style\.setProperty\('--lz-name-gap', `\$\{Number\.isFinite\(gap\) \? gap : 2\}px`\)/);
  assert.match(source, /const actorElement = document\.createElement\('span'\)/);
  assert.match(source, /const poseClass = slot\.pose \? ` lz-actor--pose-\$\{slot\.pose\}` : ''/);
  assert.match(source, /actorElement\.className = `lz-actor lz-actor--\$\{actor\.state\}\$\{poseClass\}`/);
  assert.match(source, /actorElement\.style\.setProperty\('--lz-sprite-url', `url\("\$\{spriteSrc\}"\)`\)/);
  assert.match(source, /image\.className = 'lz-actor-img'/);
  assert.match(source, /document\.createElement\('span'\)/);
  assert.match(source, /nameplate\.className = `lz-nameplate lz-nameplate--actor lz-nameplate--\$\{actor\.state\}`/);
  assert.match(source, /nameplate\.textContent = actor\.displayName/);
  assert.match(source, /_applyActorNameplatePosition\(nameplate, slot\)/);
  assert.match(source, /actorElement\.append\(image, nameplate\)/);
  assert.doesNotMatch(source, /layer\.append\(nameplate\)/);
  assert.doesNotMatch(source, /data-lz-status/);
  assert.doesNotMatch(source, /lz-status-chip/);
});

test('life zone diet speech bubble renders meal photo before text fallback', () => {
  const source = readText('home/life-zone.js');
  const css = readAppCssSync();
  const speechTailRule = css.match(/\.lz-speech::after \{[\s\S]*?\n\}/)?.[0] || '';

  assert.match(source, /toggleLike/);
  assert.match(source, /getLikes/);
  assert.match(source, /actor\.speechPhoto/);
  assert.match(source, /lz-speech--photo/);
  assert.match(source, /const previewButton = document\.createElement\('button'\)/);
  assert.match(source, /previewButton\.className = 'lz-speech-photo-btn'/);
  assert.match(source, /previewButton\.dataset\.lzPhotoAction = 'preview'/);
  assert.match(source, /const photo = document\.createElement\('img'\)/);
  assert.match(source, /photo\.className = 'lz-speech-photo'/);
  assert.match(source, /photo\.src = actor\.speechPhoto/);
  assert.match(source, /photo\.alt = actor\.speech \|\| '식사 사진'/);
  assert.match(source, /photo\.loading = 'lazy'/);
  assert.match(source, /photo\.decoding = 'async'/);
  assert.match(source, /previewButton\.append\(photo\)/);
  assert.match(source, /const likeButton = document\.createElement\('button'\)/);
  assert.match(source, /likeButton\.className = 'lz-photo-like-btn'/);
  assert.match(source, /likeButton\.dataset\.lzPhotoAction = 'like'/);
  assert.match(source, /likeButton\.setAttribute\('aria-pressed'/);
  assert.match(source, /bubble\.append\(previewButton, likeButton\)/);
  assert.match(source, /bubble\.textContent = actor\.speech/);
  assert.match(source, /Number\(slot\.x\) \+ Number\(slot\.width\) >= 1450/);
  assert.doesNotMatch(source, /onclick=/);

  assert.match(css, /\.lz-speech--photo \{[\s\S]*width: 40px;[\s\S]*height: 40px;[\s\S]*overflow: visible;[\s\S]*pointer-events: auto;/);
  assert.match(css, /\.lz-speech-photo-btn \{[\s\S]*width: 100%;[\s\S]*height: 100%;[\s\S]*padding: 0;[\s\S]*overflow: hidden;/);
  assert.match(css, /\.lz-speech-photo \{[\s\S]*width: 100%;[\s\S]*height: 100%;[\s\S]*object-fit: cover;[\s\S]*border-radius: 6px;/);
  assert.match(css, /\.lz-photo-like-btn \{[\s\S]*position: absolute;[\s\S]*transform: translateZ\(0\);/);
  assert.match(css, /\.lz-speech--photo \.lz-photo-like-btn \{[\s\S]*border: 0;[\s\S]*background: transparent;[\s\S]*box-shadow: none;/);
  assert.match(css, /\.lz-speech--right-edge \{[\s\S]*translate\(-88%, -100%\);/);
  assert.match(css, /\.lz-speech--right-edge::after \{[\s\S]*left: 88%;/);
  assert.match(speechTailRule, /clip-path: polygon\(/);
  assert.doesNotMatch(speechTailRule, /rotate\(45deg\)/);
  assert.match(css, /@media \(max-width: 420px\) \{[\s\S]*\.lz-speech--photo \{[\s\S]*width: 34px;[\s\S]*height: 34px;[\s\S]*max-width: none;[\s\S]*padding: 0;/);
});

test('life zone photo preview sheet and heart flow use stored likes without inline handlers', () => {
  const source = readText('home/life-zone.js');
  const css = readAppCssSync();

  assert.match(source, /function _openLifeZonePhotoPreview/);
  assert.match(source, /function _closeLifeZonePhotoPreview/);
  assert.match(source, /life-zone-photo-preview-modal/);
  assert.match(source, /lz-photo-preview-backdrop/);
  assert.match(source, /lz-photo-preview-sheet/);
  assert.match(source, /role', 'dialog'/);
  assert.match(source, /aria-modal', 'true'/);
  assert.match(source, /_bindLifeZonePhotoDoubleLike/);
  assert.match(source, /event\.type === 'dblclick'/);
  assert.match(source, /LIFE_ZONE_PHOTO_DOUBLE_TAP_MS/);
  assert.match(source, /_handleLifeZonePhotoLike\(actor,[\s\S]*forceLiked: true/);
  assert.match(source, /toggleLike\(actor\.accountId, _todayLifeZoneKey\(\), actor\.speechLikeField, LIFE_ZONE_PHOTO_LIKE_REACTION\)/);
  assert.match(source, /_syncLifeZonePhotoLikeButtons/);
  assert.doesNotMatch(source, /onclick=/);

  assert.match(css, /\.lz-photo-preview-backdrop \{/);
  assert.match(css, /\.lz-photo-preview-sheet \{[\s\S]*border-radius:[\s\S]*box-shadow:/);
  assert.match(css, /\.lz-photo-preview-image \{[\s\S]*object-fit: contain;/);
  assert.match(css, /\.lz-heart-stream \{[\s\S]*pointer-events: none;/);
  assert.match(css, /\.lz-heart-particle \{[\s\S]*animation: lzHeartFloat/);
  assert.match(css, /@keyframes lzHeartFloat \{[\s\S]*transform:[\s\S]*opacity:/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.lz-heart-particle \{/);
});

test('life zone NPC quest bubble has a stable clickable overlay style', () => {
  const css = readAppCssSync();

  assert.match(css, /\.lz-scene \{[\s\S]*aspect-ratio: 1672 \/ 1872;/);
  assert.match(css, /\.lz-world \{[\s\S]*width: 100%;[\s\S]*aspect-ratio: 1672 \/ 1672;[\s\S]*overflow: visible;[\s\S]*transform: translateX\(-50%\);/);
  assert.match(css, /\.lz-npc-quest \{/);
  assert.match(css, /left: calc\(1084 \/ 1672 \* 100%\)/);
  assert.match(css, /top: calc\(792 \/ 1672 \* 100%\)/);
  assert.match(css, /width: clamp\(52px, calc\(168 \/ 1672 \* 100%\), 76px\)/);
  assert.match(css, /display: flex/);
  assert.match(css, /min-height: 0/);
  assert.match(css, /transform: translate\(-50%, 0\)/);
  assert.match(css, /pointer-events: auto/);
  assert.match(css, /touch-action: manipulation/);
  assert.match(css, /\.lz-npc-quest:focus-visible/);
  assert.match(css, /\.lz-npc-bulb \{[\s\S]*--lz-bulb-x: 0px;[\s\S]*--lz-bulb-y: 0px;[\s\S]*width: 50%;[\s\S]*aspect-ratio: 192 \/ 150;[\s\S]*overflow: hidden;[\s\S]*transform: translate\(var\(--lz-bulb-x\), var\(--lz-bulb-y\)\);/);
  assert.match(css, /\.lz-npc-bulb \{[\s\S]*animation: lz-npc-bulb-blink 2\.4s ease-in-out infinite;/);
  assert.match(css, /@keyframes lz-npc-bulb-blink/);
  assert.match(css, /transform: translate\(var\(--lz-bulb-x\), var\(--lz-bulb-y\)\) scale\(1\)/);
  assert.match(css, /transform: translate\(var\(--lz-bulb-x\), calc\(var\(--lz-bulb-y\) - 1px\)\) scale\(0\.94\)/);
  assert.match(css, /drop-shadow\(0 0 8px rgba\(255, 226, 88, 0\.92\)\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.lz-npc-bulb,[\s\S]*animation: none;/);
  assert.match(css, /\.lz-npc-bulb img \{/);
  assert.match(css, /\.lz-npc-quest \.lz-nameplate/);
  assert.match(css, /position: static/);
  assert.match(css, /\.lz-npc-quest--trainer \.lz-nameplate \{[\s\S]*order: 1;[\s\S]*margin-top: 1px;[\s\S]*margin-bottom: 0;/);
  assert.match(css, /\.lz-npc-quest--trainer \.lz-npc-bulb \{[\s\S]*order: 0;[\s\S]*--lz-bulb-x: 0px;[\s\S]*--lz-bulb-y: 0px;/);
  assert.doesNotMatch(css, /\.lz-npc-quest--trainer \.lz-nameplate \{[\s\S]*order: -1;/);
  assert.doesNotMatch(css, /\.lz-npc-quest--trainer \.lz-npc-bulb \{[\s\S]*--lz-bulb-x: 62%;/);
  assert.match(css, /overflow: visible/);
  assert.match(css, /\.lz-miranda-corner \{/);
  assert.match(css, /left: calc\(48 \/ 1672 \* 100%\)/);
  assert.match(css, /top: calc\(1290 \/ 1672 \* 100%\)/);
  assert.match(css, /width: calc\(430 \/ 1672 \* 100%\)/);
  assert.match(css, /z-index: 74/);
  assert.match(css, /\.lz-miranda-corner img \{/);
  assert.match(css, /\.lz-consulting-room-sofas \{/);
  assert.match(css, /left: calc\(1180 \/ 1672 \* 100%\)/);
  assert.match(css, /top: calc\(1292 \/ 1672 \* 100%\)/);
  assert.match(css, /width: calc\(360 \/ 1672 \* 100%\)/);
  assert.match(css, /\.lz-consulting-room-sofas img \{/);
  assert.match(css, /\.lz-miranda-npc \{/);
  assert.match(css, /left: calc\(302 \/ 1672 \* 100%\)/);
  assert.match(css, /top: calc\(1392 \/ 1672 \* 100%\)/);
  assert.match(css, /width: clamp\(26px, calc\(78 \/ 1672 \* 100%\), 36px\)/);
  assert.match(css, /\.lz-miranda-npc-img \{/);
  assert.match(css, /transform: scaleX\(-1\)/);
  assert.match(css, /\.lz-miranda-npc \.lz-npc-bulb \{[\s\S]*top: 0;[\s\S]*width: 108%;[\s\S]*--lz-bulb-y: -118%;/);
  assert.match(css, /\.lz-miranda-npc \.lz-nameplate \{[\s\S]*top: -3px;[\s\S]*transform: translate\(-50%, -100%\);/);
  assert.match(css, /\.lz-miranda-npc:focus-visible/);
  assert.match(css, /\.lz-consulting-chief-npc \{/);
  assert.match(css, /left: calc\(1440 \/ 1672 \* 100%\)/);
  assert.match(css, /top: calc\(1336 \/ 1672 \* 100%\)/);
  assert.match(css, /width: clamp\(28px, calc\(94 \/ 1672 \* 100%\), 44px\)/);
  assert.match(css, /\.lz-consulting-chief-npc-img \{/);
  assert.match(css, /\.lz-consulting-chief-npc \.lz-npc-bulb \{[\s\S]*top: 0;[\s\S]*width: 96%;[\s\S]*--lz-bulb-y: -118%;/);
  assert.match(css, /\.lz-miranda-npc \.lz-npc-bulb,\s*\.lz-consulting-chief-npc \.lz-npc-bulb\s*\{[\s\S]*display: none;/);
  assert.match(css, /\.lz-consulting-chief-npc \.lz-nameplate \{[\s\S]*top: -5px;[\s\S]*transform: translate\(-50%, -100%\);/);
  assert.match(css, /\.lz-consulting-visitor \{/);
  assert.match(css, /left: calc\(1268 \/ 1672 \* 100%\)/);
  assert.match(css, /top: calc\(1350 \/ 1672 \* 100%\)/);
  assert.match(css, /width: clamp\(30px, calc\(110 \/ 1672 \* 100%\), 50px\)/);
  assert.match(css, /\.lz-consulting-visitor\[hidden\] \{[\s\S]*display: none;/);
  assert.match(css, /\.lz-consulting-visitor-img \{/);
  assert.match(css, /\.lz-consulting-chief-npc:focus-visible/);
});

test('life zone nameplates use small pixel text with outline shadows', () => {
  const css = readAppCssSync();

  assert.match(css, /\.lz-nameplate \{/);
  assert.match(css, /font-size: 9px/);
  assert.match(css, /letter-spacing: 0/);
  assert.match(css, /white-space: nowrap/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /\.lz-nameplate--actor \{[\s\S]*top: 100%;[\s\S]*transform: translate\(-50%, var\(--lz-name-gap, 2px\)\);/);
  assert.match(css, /\.lz-actor \{[\s\S]*overflow: visible;/);
  assert.match(css, /text-shadow:/);
  assert.match(css, /\.lz-nameplate--npc \{\s*color: #ffe15a;/);
  assert.match(css, /@media \(max-width: 420px\) \{\s*\.lz-nameplate \{[\s\S]*font-size: 8px/);
  assert.doesNotMatch(css, /\.lz-status-row \{/);
  assert.doesNotMatch(css, /\.lz-status-chip \{/);
  assert.doesNotMatch(css, /\.lz-status-dot \{/);
});

test('life zone workout poses use scoped motion with reduced motion fallback', () => {
  const css = readAppCssSync();

  assert.match(css, /\.lz-actor--pose-workout-lat \{/);
  assert.match(css, /\.lz-actor-img \{/);
  assert.match(css, /\.lz-actor--pose-workout-lat::after \{/);
  assert.match(css, /background-image: var\(--lz-sprite-url\)/);
  assert.match(css, /clip-path: inset\(25% 4% 38% 14%\)/);
  assert.match(css, /animation: lz-workout-lat-pull 1\.35s ease-in-out infinite/);
  assert.match(css, /\.lz-actor--pose-workout-bench \{/);
  assert.match(css, /animation: lz-workout-bench-press 1\.2s ease-in-out infinite/);
  assert.match(css, /\.lz-actor--pose-workout-squat \{/);
  assert.match(css, /animation: lz-workout-squat-rep 1\.5s ease-in-out infinite/);
  assert.match(css, /@keyframes lz-workout-lat-pull/);
  assert.doesNotMatch(css, /@keyframes lz-workout-lat-pull \{[^@]*translateY/);
  assert.match(css, /@keyframes lz-workout-bench-press/);
  assert.match(css, /@keyframes lz-workout-squat-rep/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.lz-actor--pose-workout-lat::after,[\s\S]*\.lz-actor--pose-workout-bench,[\s\S]*\.lz-actor--pose-workout-squat[\s\S]*animation: none;[\s\S]*transform: none;/);
});

test('life zone running actors render track sprites and a map capture bubble on home', () => {
  const source = readText('home/life-zone.js');
  const css = readAppCssSync();
  const sw = readText('sw.js') + readText('runtime-assets.js');
  const sprites = [
    'jups-running-track.png',
    'moonjung-tomato-running-track.png',
    'lee-jaeheon-running-track.png'
  ];

  assert.match(source, /getRunningLiveState\(\)/);
  assert.match(sw, /'\.\/workout\/running-live-state\.js'/);
  assert.match(source, /lifeZoneRunningLive/);
  assert.match(source, /readRunningMapConfig/);
  assert.match(source, /resolveRunningMapConfig/);
  assert.match(source, /CONFIG\.MAPS\?\.VWORLD_API_KEY/);
  assert.match(source, /buildVworldTileUrl/);
  assert.match(source, /normalizeRunningMapPoints/);
  assert.match(source, /function _buildRunningMapBubbleData/);
  assert.match(source, /state: 'image'/);
  assert.match(source, /mapData\?\.mapImageDataUrl \|\| mapData\?\.routeSummary\?\.mapImageDataUrl/);
  assert.match(source, /const RUNNING_MAP_WIDTH = 300/);
  assert.match(source, /const RUNNING_MAP_HEIGHT = 210/);
  assert.match(source, /const RUNNING_MAP_HOME_MAX_ZOOM = 14/);
  assert.match(source, /const RUNNING_MAP_SINGLE_POINT_ZOOM = 14/);
  assert.match(source, /function _zoomForRunningMap\(route = \[\], width = RUNNING_MAP_WIDTH, height = RUNNING_MAP_HEIGHT\)/);
  assert.match(source, /Math\.min\(RUNNING_MAP_HOME_MAX_ZOOM, RUNNING_MAP_MAX_ZOOM, _zoomForRunningMap\(route, RUNNING_MAP_WIDTH, RUNNING_MAP_HEIGHT\)\)/);
  assert.match(source, /function _renderRunningMapSvg/);
  assert.match(source, /class="\$\{escapeHtml\(className\)\} lz-running-map-image"/);
  assert.match(source, /function _runningMapFallbackHtml/);
  assert.match(source, /function _openRunningRecordModal/);
  assert.match(source, /function _renderRunningRecordStats/);
  assert.match(source, /function _renderRunningMapBubble/);
  assert.match(source, /const bubble = document\.createElement\('button'\)/);
  assert.match(source, /bubble\.type = 'button'/);
  assert.match(source, /bubble\.dataset\.lzRunningRecordAction = 'open'/);
  assert.match(source, /bubble\.addEventListener\('click'/);
  assert.match(source, /_openRunningRecordModal\(actor, map\)/);
  assert.match(source, /bubble\.dataset\.lzRunningMapBubble = '1'/);
  assert.match(source, /bubble\.dataset\.lzRunningMapState = map\.state/);
  assert.match(source, /bubble\.dataset\.lzRunningMapProvider = map\.provider/);
  assert.match(source, /bubble\.dataset\.lzRunningMapTileCount = String\(map\.tileCount \|\| 0\)/);
  assert.match(source, /bubble\.dataset\.lzRunningMapPointCount = String\(map\.pointCount \|\| 0\)/);
  assert.match(source, /bubble\.dataset\.lzRunningMapHasPath = map\.hasPath \? 'true' : 'false'/);
  assert.match(source, /function _bindRunningMapTileDiagnostics/);
  assert.match(source, /tile\.addEventListener\('load'/);
  assert.match(source, /tile\.addEventListener\('error'/);
  assert.match(source, /bubble\.classList\.add\('is-tile-failed'\)/);
  assert.match(source, /lz-running-map-tile/);
  assert.match(source, /<image[\s\S]*class="lz-running-map-tile"[\s\S]*preserveAspectRatio="none"/);
  assert.match(source, /lz-running-map-path/);
  assert.match(source, /lz-running-map-path--casing/);
  assert.match(source, /lz-running-map-path--main/);
  assert.match(source, /lz-running-map-start/);
  assert.match(source, /circle class="lz-running-map-current"/);
  assert.match(source, /lz-running-map-place/);
  assert.match(source, /life-zone-running-record-modal/);
  assert.match(source, /data-lz-running-record-close/);
  assert.match(source, /data-lz-running-record-map/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /const place = String\(actor\.runningMap\?\.placeLabel \|\| ''\)\.trim\(\)/);
  assert.doesNotMatch(source, /map\.state === 'ready' \? '위치 확인 중'/);
  assert.match(source, /lifeZoneRunningRoute/);
  assert.match(source, /actor\.state === 'running'/);
  assert.match(source, /selfRunning \? actor\.source === 'self' : !runningBubbleRendered/);
  assert.equal(fs.existsSync(path.join(root, 'scripts/make-life-zone-running-sprites.py')), false);
  assert.equal(fs.existsSync(path.join(root, 'scripts/process-life-zone-running-sprites.py')), true);
  assert.match(css, /\.lz-actor--pose-running-track \{/);
  assert.match(css, /\.lz-actor--pose-running-track::before \{/);
  assert.match(css, /--lz-run-scale:\s*1/);
  assert.match(css, /aspect-ratio: 128 \/ 192/);
  assert.match(css, /background-size: 200% 100%/);
  assert.match(css, /animation: lz-running-track-steps 0\.54s step-end infinite/);
  assert.match(css, /animation: lz-running-track-in-place var\(--lz-run-duration, 0\.58s\) ease-in-out infinite/);
  assert.match(css, /@keyframes lz-running-track-in-place/);
  assert.match(css, /@keyframes lz-running-track-steps/);
  assert.match(css, /49\.999% \{[\s\S]*background-position: 0 0;/);
  assert.match(css, /50%[\s\S]*background-position: 100% 0;/);
  assert.doesNotMatch(css, /steps\(2, end\)/);
  assert.doesNotMatch(css, /background-position: 50%/);
  assert.doesNotMatch(css, /@keyframes lz-running-track-lap/);
  assert.doesNotMatch(css, /--lz-run-x0|--lz-run-x1/);
  assert.doesNotMatch(css, /translate3d\(var\(--lz-run-x0/);
  assert.doesNotMatch(css.match(/@keyframes lz-running-track-in-place \{[\s\S]*?\n\}/)?.[0] || '', /rotate|translateX|--lz-run-x/);
  assert.match(css, /\.lz-running-map-bubble \{/);
  assert.match(css, /width: clamp\(46px, calc\(150 \/ 1672 \* 100%\), 68px\)/);
  assert.match(css, /aspect-ratio: 10 \/ 7/);
  assert.match(css, /pointer-events: auto;/);
  assert.match(css, /cursor: pointer;/);
  assert.match(css, /\.lz-running-map-bubble:focus-visible/);
  assert.match(css, /\.lz-running-map-tile \{/);
  assert.match(css, /\.lz-running-map-image \{[\s\S]*object-fit: cover;/);
  assert.doesNotMatch(css, /\.lz-running-map-tile \{[^}]*position: absolute;/);
  assert.match(css, /\.lz-running-map-path \{/);
  assert.match(css, /\.lz-running-map-path--casing \{[\s\S]*stroke: rgba\(255, 255, 255, 0\.96\);[\s\S]*stroke-width: 15;/);
  assert.match(css, /\.lz-running-map-path--main \{[\s\S]*stroke: #ff3b1f;[\s\S]*stroke-width: 9;/);
  assert.match(css, /\.lz-running-map-start \{/);
  assert.match(css, /\.lz-running-map-current \{[\s\S]*fill: #38d844;[\s\S]*stroke: #ffffff;[\s\S]*stroke-width: 4;/);
  assert.match(css, /\.lz-running-map-bubble--missing-map \.lz-running-map-surface/);
  assert.match(css, /\.lz-running-map-empty--tile-failed \{/);
  assert.match(css, /\.lz-running-map-bubble\.is-tile-failed \.lz-running-map-empty--tile-failed/);
  assert.match(css, /\.lz-running-map-place \{/);
  assert.match(css, /\.lz-running-map-attribution \{[\s\S]*display: none;/);
  assert.match(css, /\.lz-running-record-backdrop \{/);
  assert.match(css, /\.lz-running-record-sheet \{/);
  assert.match(css, /\.lz-running-record-map \{/);
  assert.match(css, /\.lz-running-record-stats \{/);
  assert.match(css, /\.lz-running-record-close:focus-visible/);
  assert.doesNotMatch(css, /\.lz-running-map-road/);
  assert.doesNotMatch(css, /\.lz-running-map-route/);
  assert.doesNotMatch(css, /\.lz-running-map-pin/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.lz-actor--pose-running-track,[\s\S]*\.lz-actor--pose-running-track::before[\s\S]*animation: none;/);

  for (const sprite of sprites) {
    assert.match(sw, new RegExp(`\\.\\/assets\\/home\\/life-zone\\/sprites\\/${sprite.replace('.', '\\.')}`));
    assert.deepEqual(readPngHeader(`assets/home/life-zone/sprites/${sprite}`), {
      width: 256,
      height: 192,
      colorType: 6
    });
  }
});

test('life zone NPC bulb source is a tracked transparent PNG runtime asset', () => {
  const sw = readText('sw.js') + readText('runtime-assets.js');
  const header = readPngHeader('assets/home/life-zone/ui/npc-quest-bubble.png');

  assert.match(sw, /const CACHE_VERSION = 'tomatofarm-v\d{8}z\d+-[^']+';/);
  assert.match(sw, /\.\/assets\/home\/life-zone\/ui\/npc-quest-bubble\.png/);
  assert.deepEqual(header, {
    width: 192,
    height: 258,
    colorType: 6
  });
});

test('life zone Miranda home NPC is a separate transparent generated runtime asset', () => {
  const sw = readText('sw.js') + readText('runtime-assets.js');
  const header = readPngHeader('assets/home/life-zone/ui/miranda-npc-home.png');

  assert.match(sw, /\.\/assets\/home\/life-zone\/ui\/miranda-npc-home\.png/);
  assert.deepEqual(header, {
    width: 142,
    height: 256,
    colorType: 6
  });
});

test('life zone Miranda fashion corner is a separate transparent runtime prop asset', () => {
  const sw = readText('sw.js') + readText('runtime-assets.js');
  const header = readPngHeader('assets/home/life-zone/ui/miranda-fashion-corner.png');

  assert.match(sw, /\.\/assets\/home\/life-zone\/ui\/miranda-fashion-corner\.png/);
  assert.deepEqual(header, {
    width: 430,
    height: 250,
    colorType: 6
  });
});

test('life zone consulting room sofa assets are separate transparent runtime PNGs', () => {
  const sw = readText('sw.js') + readText('runtime-assets.js');

  const assets = [
    ['consulting-room-sofas.png', { width: 430, height: 309, colorType: 6 }],
    ['consulting-chief-npc-seated-home.png', { width: 200, height: 286, colorType: 6 }],
    ['consulting-visitor-gray-shirt-home.png', { width: 230, height: 298, colorType: 6 }]
  ];

  assert.match(sw, /const CACHE_VERSION = 'tomatofarm-v\d{8}z\d+-[^']+';/);
  for (const [asset, expected] of assets) {
    assert.match(sw, new RegExp(`\\.\\/assets\\/home\\/life-zone\\/ui\\/${asset.replace('.', '\\.')}`));
    assert.deepEqual(readPngHeader(`assets/home/life-zone/ui/${asset}`), expected);
  }
});
