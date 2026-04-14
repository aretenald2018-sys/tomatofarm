// Puppeteer 런타임 검증: cheers-card 핵심 로직 실제 호출 + 구조 검사
import puppeteer from 'puppeteer';

const URL = 'http://localhost:5500';
const TIMEOUT = 12000;

let passed = 0, failed = 0;
function check(ok, msg, extra) {
  const marker = ok ? '✓' : '✗';
  console.log(`${marker} ${msg}${extra ? ' — ' + extra : ''}`);
  if (ok) passed++; else { failed++; process.exitCode = 1; }
}

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: TIMEOUT });
  check(true, '페이지 로드');

  // ─── 구조 검사 ─────────────────────────────────────────
  check(!!(await page.$('#card-celebrations')), '#card-celebrations 컨테이너');
  check(!!(await page.$('#self-cheer-modal')), 'self-cheer-modal 주입');

  // ─── 런타임 단위 테스트 (__test__ 훅 사용) ──────────────
  const unit = await page.evaluate(async () => {
    const mod = await import('/home/cheers-card.js');
    const T = mod.__test__;
    if (!T) return { ok: false, err: 'no __test__ export' };

    const tests = [];

    // Test 1: _capPerUid 에서 2토마토 pair(protected)가 custom/self보다 우선 유지되는지
    {
      const items = [
        { uid: 'a', priority: 120, protected: false, type: 'custom' },
        { uid: 'a', priority: 110, protected: false, type: 'self_cheer' },
        { uid: 'a', priority: 95,  protected: true,  type: 'exercise' },
        { uid: 'a', priority: 90,  protected: true,  type: 'diet' },
      ];
      const out = T._capPerUid(items, 3);
      const types = out.map((i) => i.type).sort();
      const hasExercise = types.includes('exercise');
      const hasDiet = types.includes('diet');
      tests.push({
        name: 'cap preserves 2토마토 pair (custom+self+exercise+diet → exercise+diet+custom)',
        pass: out.length === 3 && hasExercise && hasDiet,
        detail: `kept: ${types.join(',')}`,
      });
    }

    // Test 2: _capPerUid protected 없을 때 priority 내림차순 top-3
    {
      const items = [
        { uid: 'b', priority: 120, protected: false, type: 'custom' },
        { uid: 'b', priority: 110, protected: false, type: 'self_cheer' },
        { uid: 'b', priority: 95,  protected: false, type: 'auto' },
        { uid: 'b', priority: 50,  protected: false, type: 'low' },
      ];
      const out = T._capPerUid(items, 3);
      const types = out.map((i) => i.type);
      tests.push({
        name: 'cap (no protected) keeps top-3 priority',
        pass: out.length === 3 && types.includes('custom') && types.includes('self_cheer') && types.includes('auto') && !types.includes('low'),
        detail: `kept: ${types.join(',')}`,
      });
    }

    // Test 3: _pickTopByCategory — exercise+diet 둘 다 있으면 2개 pick
    {
      const results = [
        { category: 'exercise', priority: 95, type: 'volume_pr' },
        { category: 'diet',     priority: 55, type: 'kcal_reduction' },
        { category: 'both',     priority: 90, type: 'streak_revival' },
      ];
      const picks = T._pickTopByCategory(results);
      tests.push({
        name: 'pickTopByCategory (exercise+diet 존재) → 2 pick',
        pass: picks.length === 2
          && picks.some((p) => p.category === 'exercise')
          && picks.some((p) => p.category === 'diet'),
      });
    }

    // Test 4: _pickTopByCategory — diet 없으면 both로 fallback
    {
      const results = [
        { category: 'exercise', priority: 95, type: 'volume_pr' },
        { category: 'both',     priority: 90, type: 'streak_revival' },
      ];
      const picks = T._pickTopByCategory(results);
      tests.push({
        name: 'pickTopByCategory (diet 없음, both fallback)',
        pass: picks.length === 2
          && picks.some((p) => p.category === 'exercise')
          && picks.some((p) => p.category === 'both'),
      });
    }

    // Test 5: _computeActivePool — 24h 이내만 + self 강제 포함
    {
      const now = Date.now();
      const accounts = [
        { id: 'u1', lastLoginAt: now - 1000 },                  // 활성
        { id: 'u2', lastLoginAt: now - (25 * 3600 * 1000) },    // 이탈
        { id: 'u3(guest)', lastLoginAt: now },                   // guest 제외
        { id: 'u4', lastLoginAt: 0 },                           // 비활성 (lastLoginAt=0)
        { id: 'me', lastLoginAt: now - (48 * 3600 * 1000) },    // 이탈이지만 self
      ];
      const active = T._computeActivePool(accounts, 'me');
      const ids = active.map((a) => a.id);
      tests.push({
        name: 'computeActivePool: 24h 활성 + self 포함 + guest 제외',
        pass: ids.includes('u1') && !ids.includes('u2') && !ids.includes('u3(guest)')
              && !ids.includes('u4') && ids.includes('me'),
        detail: `active: ${ids.join(',')}`,
      });
    }

    // Test 6: _selectCandidateUids — self + custom uid + autoRows 상위 우선
    {
      const autoRows = [
        { uid: 'hi',  results: [{ priority: 100 }] },
        { uid: 'mid', results: [{ priority: 70 }] },
        { uid: 'lo',  results: [{ priority: 30 }] },
        { uid: 'empty', results: [] },
      ];
      const customList = [{ targetUid: 'special' }];
      const candidates = T._selectCandidateUids(autoRows, customList, 'me', 3);
      // k=3이면 set 이미 me + special = 2 → +auto top 1 = 3 → hi 포함
      tests.push({
        name: 'selectCandidateUids: me + custom + top auto (k=3)',
        pass: candidates.includes('me') && candidates.includes('special') && candidates.includes('hi')
              && candidates.length === 3,
        detail: `candidates: ${candidates.join(',')}`,
      });
    }

    // Test 7: _composeUserItems — 2토마토 시 protected 태그
    {
      const autoRows = [{
        uid: 'x', name: 'X', avatar: null, isSelf: false,
        results: [
          { category: 'exercise', priority: 95, type: 'volume_pr', template: 'volume_pr', params: {} },
          { category: 'diet',     priority: 55, type: 'kcal_reduction', template: 'kcal_reduction', params: {} },
        ],
      }];
      const freshByUid = {
        x: {
          lastCycle: { tomatoesAwarded: 2, dietAllSuccess: true, exerciseAllSuccess: true },
          selfCheer: null,
        },
      };
      const items = T._composeUserItems(autoRows, freshByUid);
      const allProtected = items.every((i) => i.protected === true);
      tests.push({
        name: 'composeUserItems: 2토마토 pair protected:true',
        pass: items.length === 2 && allProtected,
        detail: `count=${items.length}, protected=${items.map((i) => i.protected).join(',')}`,
      });
    }

    // Test 8: _composeUserItems — 일반(1토마토 이하)은 protected:false
    {
      const autoRows = [{
        uid: 'y', name: 'Y', avatar: null, isSelf: false,
        results: [
          { category: 'exercise', priority: 95, type: 'volume_pr', template: 'volume_pr', params: {} },
        ],
      }];
      const freshByUid = { y: { lastCycle: { tomatoesAwarded: 1 }, selfCheer: null } };
      const items = T._composeUserItems(autoRows, freshByUid);
      tests.push({
        name: 'composeUserItems: 1토마토 → protected:false',
        pass: items.length === 1 && items[0].protected === false,
      });
    }

    // Test 9: _resolveEnabledSet — 기본값 + override 병합
    {
      const s = T._resolveEnabledSet({ modules: { weight: false, kcal: true } });
      tests.push({
        name: 'resolveEnabledSet: 기본 true + override',
        pass: !s.has('weight') && s.has('kcal') && s.has('revival'),
      });
    }

    // Test 10: 캐시 키 프리픽스 확인
    tests.push({
      name: 'CACHE_PREFIX v4로 업그레이드',
      pass: T.constants.CACHE_PREFIX === '__cheersCache_v4:',
      detail: T.constants.CACHE_PREFIX,
    });

    return { tests };
  });

  if (!unit?.tests) {
    check(false, '__test__ export 사용 불가', JSON.stringify(unit));
  } else {
    for (const t of unit.tests) {
      check(t.pass, t.name, t.detail || '');
    }
  }

  // ─── 소스 수준 regression 체크 ────────────────────────────
  const src = await page.evaluate(async () => await (await fetch('/home/cheers-card.js')).text());
  check(src.includes('protected: !!twoTomatoes') || src.includes('protected:true'), 'protected 태그 로직 존재');
  check(src.includes('_pruneStaleCaches'), '오래된 per-uid 캐시 정리 루틴 존재');
  check(src.includes('FRESH_CANDIDATE_TOP_K'), 'top-K 후보 상수 존재');
  check(!src.includes('getMyFriends'), 'getMyFriends import 완전히 제거');
  check(src.includes('_buildAutoRows'), 'per-uid 캐시 lookup 함수 존재');

  // SW 버전 확인
  const sw = await page.evaluate(async () => {
    const res = await fetch('/sw.js').then((r) => r.text());
    const m = res.match(/CACHE_VERSION\s*=\s*'([^']+)'/);
    return m ? m[1] : null;
  });
  check(sw && sw.includes('v20260414n'), `sw.js CACHE_VERSION 최신`, sw);
} catch (e) {
  console.error('[verify] uncaught:', e);
  process.exitCode = 1;
} finally {
  await browser.close();
}

console.log(`\n=== 검증 완료: ${passed} passed, ${failed} failed ===`);
