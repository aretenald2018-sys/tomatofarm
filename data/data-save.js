// ================================================================
// data/data-save.js — workouts 컬렉션 일별 저장 (운동+식단 통합)
// ================================================================
// setDoc 전체 덮어쓰기 / merge 두 모드 지원.
//  - replace (기본): 기존 sheet.js/cooking fire-and-forget 호환.
//  - merge: workout/save.js 가 운동/식단 payload 를 분할 저장해 한쪽이 다른쪽 필드를
//    덮어쓰지 않도록 함. 사진 필드(bPhoto/lPhoto/dPhoto/sPhoto/workoutPhoto) 보존 필수.
//
// 문서 크기 900KB 초과 시 사진 자동 재인코딩(480px, JPEG q=0.5) 해 크기 축소.
// ================================================================

import { setDoc, deleteDoc, _cache, _doc, _fbOp } from './data-core.js';

// 2026-04-20: `opts.rethrow=true`로 호출하면 Firebase 저장 실패가 호출자에게 전파됨.
// 기본은 기존 동작(swallow) — sheet.js/render-cooking.js의 fire-and-forget 호환.
// 운동 종료 흐름(saveWorkoutDay → wtFinishWorkout → wtEndAndShowInsights)은
// rethrow=true로 호출해 실패 시 성공 토스트/인사이트 모달이 거짓말하지 않도록 한다.
//
// 2026-04-20 (merge-mode): `opts.mode='merge'` 추가.
//   - 'replace' (기본) — 기존 동작 (전체 덮어쓰기 + isEmpty 삭제). sheet.js/cooking 호환.
//   - 'merge'          — setDoc({merge:true}) 로 부분 업데이트. 호출자가 전달한 필드만 Firestore
//                        에 기록되고 나머지는 보존. _cache 도 병합 규칙 적용. isEmpty 삭제 스킵.
//     workout/save.js 가 운동/식단 payload 를 분할해 merge 로 저장 → 한쪽 경로가 다른쪽
//     필드를 절대 덮어쓰지 못해 "운동 수정하면 식단 깨지고 vice versa" 구조적 결합 제거.
//     호출부가 "무언가 하나라도 기록됐나"를 이미 판정한 뒤 부를 책임.
//
// 2026-04-20 (serialize): data-core._fbOp 가 dateKey 별 Promise chain 으로 직렬화 처리.
//   동시에 호출된 saveWorkoutDay + _autoSaveDiet 가 order-of-writes race 를 일으키지 않음.
export async function saveDay(key, data, opts = {}) {
  const { rethrow = false, mode = 'replace' } = opts;

  // 사진 품질 축소(문서 크기 초과 방지) — mode 무관하게 payload 에 사진이 포함되면 실행.
  if (data) {
    const json = JSON.stringify(data);
    if (json.length > 900000) {
      console.warn('[data] 문서 크기 초과 위험 (' + Math.round(json.length/1024) + 'KB) — 사진 품질 축소');
      const photoKeys = ['bPhoto','lPhoto','dPhoto','sPhoto','workoutPhoto'];
      for (const pk of photoKeys) {
        if (data[pk] && data[pk].length > 100000) {
          try {
            const img = new Image();
            const loaded = new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
            img.src = data[pk];
            await loaded;
            const c = document.createElement('canvas');
            const MAX = 480;
            let w = img.width, h = img.height;
            if (w > MAX || h > MAX) {
              if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
              else { w = Math.round(w * MAX / h); h = MAX; }
            }
            c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            data[pk] = c.toDataURL('image/jpeg', 0.5);
          } catch { data[pk] = null; }
        }
      }
    }
  }

  if (mode === 'merge') {
    // 부분 업데이트 — 반대편 도메인 필드를 절대 건드리지 않는다.
    return _fbOp('saveDay(merge)', async () => {
      const existing = _cache[key] && typeof _cache[key] === 'object' ? _cache[key] : {};
      _cache[key] = { ...existing, ...data };
      await setDoc(_doc('workouts', key), data, { merge: true });
    }, { rethrow, dateKey: key });
  }

  // 기존 'replace' 경로 — 전체 덮어쓰기 + isEmpty 삭제.
  const isEmpty = !data || (
    !data.exercises?.length && !data.cf && !data.memo &&
    !data.breakfast && !data.lunch && !data.dinner && !data.snack &&
    !data.stretching && !data.swimming && !data.running && !data.wine_free &&
    !data.breakfast_skipped && !data.lunch_skipped && !data.dinner_skipped &&
    !data.bKcal && !data.lKcal && !data.dKcal && !data.sKcal &&
    !data.runDistance && !data.swimDistance &&
    !data.bFoods?.length && !data.lFoods?.length && !data.dFoods?.length && !data.sFoods?.length &&
    !data.bPhoto && !data.lPhoto && !data.dPhoto && !data.sPhoto && !data.workoutPhoto
  );
  return _fbOp('saveDay', async () => {
    if (isEmpty) { delete _cache[key]; await deleteDoc(_doc('workouts', key)); }
    else { _cache[key] = data; await setDoc(_doc('workouts', key), data); }
  }, { rethrow, dateKey: key });
}
