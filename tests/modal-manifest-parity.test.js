import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// modal-manager.js는 MODALS 테이블 경로를 import(config.path)로 동적 로드한다.
// 이 경로가 runtime-assets.js 매니페스트에 없으면 저장소에서는 잘 돌지만
// www/APK 번들에는 파일이 빠져, APK에서만 dynamic import 404가 난다
// (2026-07: 종목 추가가 "네트워크 확인" 오류로만 보였던 사고의 원인).
const modalManagerJs = readFileSync(new URL('../modal-manager.js', import.meta.url), 'utf8');
const runtimeAssetsJs = readFileSync(new URL('../runtime-assets.js', import.meta.url), 'utf8');

test('every modal-manager MODALS path is declared in the runtime-assets manifest', () => {
  const block = modalManagerJs.match(/MODALS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/)?.[1] || '';
  const paths = [...block.matchAll(/path:\s*'([^']+)'/g)].map(match => match[1]);
  assert.ok(paths.length >= 30, 'MODALS 테이블 파싱이 실패하면 이 검사는 무의미하다');
  const missing = paths.filter(path => !runtimeAssetsJs.includes(`'${path}'`));
  assert.deepEqual(missing, [], `runtime-assets.js에 누락된 모달: ${missing.join(', ')}`);
});
