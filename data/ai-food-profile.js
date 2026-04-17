// ================================================================
// data/ai-food-profile.js
// 사용자 식단 기록 기반 AI 음식 prior 프로파일 (Phase 1 — 빌드 + 조회)
//
// [P1 스코프]
//  - 메모리 전용. Firestore 저장/조회 없음 (_cache 기반 즉시 재계산).
//  - AI 추정 파이프라인 연결 없음. P2에서 runAIEstimate가 이걸 소비하게 됨.
//  - 이 세션(앱 로드 사이클) 내 한 번만 빌드. _cache가 이미 최신이므로 추가 네트워크 X.
//
// [P1 목적]
//  - 1주일 실사용 중 자연스럽게 쌓이는 유저 식단 패턴을 측정
//  - canonical별 샘플 수/분포/이상치를 콘솔로 점검 → P2 튜닝 근거 확보
//  - window.dumpFoodProfile()로 언제든 프로파일 덤프
// ================================================================

import { _cache }      from './data-core.js';
import { normalizeFood } from './korean-food-normalize.js';

// ── 설정 ─────────────────────────────────────────────────────────
const PROFILE_LOOKBACK_DAYS = 90;     // 프로파일 계산에 쓸 최근 기간
const SAMPLE_BUFFER_SIZE    = 30;     // canonical당 유지할 최근 raw 샘플 수
const MIN_KCAL_PER_GRAM     = 0.2;    // 이상치 컷 (물 제외 하한)
const MAX_KCAL_PER_GRAM     = 10.0;   // 이상치 컷 (순수 지방도 9 근처)
const MEAL_KEYS             = ['bFoods', 'lFoods', 'dFoods', 'sFoods'];

// ── 프로파일 상태 (in-memory) ────────────────────────────────────
let _profile = {
  canonicals: {},   // { [canonical]: { count, samples:[{kcal,grams,p,c,f,at}], … derived } }
  totalSamples: 0,
  builtAt: 0,
  lookbackDays: PROFILE_LOOKBACK_DAYS,
};

// ── 헬퍼 ─────────────────────────────────────────────────────────
function _median(arr) {
  if (!arr || !arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function _percentile(arr, p) {
  if (!arr || !arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))));
  return s[idx];
}

function _parseDateKey(key) {
  // "2026-04-15" → Date
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function _daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

function _isValidFoodItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (!item.name || typeof item.name !== 'string') return false;
  const grams = Number(item.grams) || 0;
  const kcal  = Number(item.kcal)  || 0;
  if (grams <= 0 || kcal <= 0) return false;
  const perGram = kcal / grams;
  if (perGram < MIN_KCAL_PER_GRAM || perGram > MAX_KCAL_PER_GRAM) return false;
  // AI 자기참조 방지: AI로 생성되었고 유저가 편집 안 한 건 학습에서 제외
  if (item.source === 'ai' && !item.edited) return false;
  return true;
}

// canonical 단위 통계 계산
function _deriveStats(samples) {
  const n = samples.length;
  if (!n) {
    return {
      count: 0, avgGrams: 0,
      kcalPerGram: { median: 0, p25: 0, p75: 0 },
      proteinRatio: 0, carbsRatio: 0, fatRatio: 0,
      freshness: 0, lastSeen: null,
    };
  }
  const perGram = samples.map(s => s.kcal / s.grams);
  // 매크로 비율 (그램 대비) — 단백질/탄수/지방의 g수를 총 그램으로 나눈 평균
  const pRatios = samples.map(s => (Number(s.p) || 0) / s.grams);
  const cRatios = samples.map(s => (Number(s.c) || 0) / s.grams);
  const fRatios = samples.map(s => (Number(s.f) || 0) / s.grams);

  const avgGrams = samples.reduce((sum, s) => sum + s.grams, 0) / n;

  // 최신성: 가장 최근 샘플 날짜 기반 — 30일 내=1.0, 90일=0.3, 180일=0
  const latest = samples.reduce((max, s) => Math.max(max, s.at || 0), 0);
  const ageDays = latest ? (Date.now() - latest) / 86400000 : 999;
  let freshness;
  if (ageDays <= 30)      freshness = 1.0;
  else if (ageDays <= 90) freshness = 1.0 - ((ageDays - 30) / 60) * 0.7;  // 1.0 → 0.3
  else if (ageDays <= 180) freshness = 0.3 - ((ageDays - 90) / 90) * 0.3; // 0.3 → 0
  else freshness = 0;

  return {
    count: n,
    avgGrams: Math.round(avgGrams),
    kcalPerGram: {
      median: Math.round(_median(perGram) * 1000) / 1000,
      p25:    Math.round(_percentile(perGram, 0.25) * 1000) / 1000,
      p75:    Math.round(_percentile(perGram, 0.75) * 1000) / 1000,
    },
    proteinRatio: Math.round(_median(pRatios) * 1000) / 1000,
    carbsRatio:   Math.round(_median(cRatios) * 1000) / 1000,
    fatRatio:     Math.round(_median(fRatios) * 1000) / 1000,
    freshness: Math.round(freshness * 100) / 100,
    lastSeen: latest ? new Date(latest).toISOString().slice(0, 10) : null,
  };
}

// ── 빌드 ─────────────────────────────────────────────────────────
/**
 * _cache의 워크아웃 문서들을 스캔해서 프로파일 재계산.
 * 최근 PROFILE_LOOKBACK_DAYS일 안의 샘플만 반영.
 * 동기 실행 (네트워크 없음, 수백 개 도큐먼트면 수십 ms).
 */
export function rebuildFoodProfile() {
  const t0 = performance.now ? performance.now() : Date.now();
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - PROFILE_LOOKBACK_DAYS);

  // canonical → 배열(raw samples)
  const rawByCanonical = new Map();
  let totalSamples = 0;

  for (const [dateKey, day] of Object.entries(_cache || {})) {
    if (!day || typeof day !== 'object') continue;
    const dt = _parseDateKey(dateKey);
    if (!dt || dt < cutoff) continue;
    const at = dt.getTime();

    for (const mealKey of MEAL_KEYS) {
      const foods = day[mealKey];
      if (!Array.isArray(foods)) continue;
      for (const item of foods) {
        if (!_isValidFoodItem(item)) continue;
        const canonical = normalizeFood(item.name);
        if (!canonical) continue;
        const rec = {
          kcal:  Number(item.kcal)    || 0,
          grams: Number(item.grams)   || 0,
          p:     Number(item.protein) || 0,
          c:     Number(item.carbs)   || 0,
          f:     Number(item.fat)     || 0,
          at,
        };
        if (!rawByCanonical.has(canonical)) rawByCanonical.set(canonical, []);
        rawByCanonical.get(canonical).push(rec);
        totalSamples++;
      }
    }
  }

  // canonical당 최근 SAMPLE_BUFFER_SIZE개만 유지 + 통계 계산
  const canonicals = {};
  for (const [canonical, samples] of rawByCanonical.entries()) {
    samples.sort((a, b) => b.at - a.at);   // 최신순
    const trimmed = samples.slice(0, SAMPLE_BUFFER_SIZE);
    canonicals[canonical] = {
      ..._deriveStats(trimmed),
      samples: trimmed,  // P1 점검용. P2에서 용량 이슈되면 제거 가능.
    };
  }

  _profile = {
    canonicals,
    totalSamples,
    builtAt: Date.now(),
    lookbackDays: PROFILE_LOOKBACK_DAYS,
  };

  const t1 = performance.now ? performance.now() : Date.now();
  console.log(
    `[ai-food-profile] built in ${Math.round(t1 - t0)}ms — ` +
    `${Object.keys(canonicals).length} canonicals, ${totalSamples} samples`
  );
  return _profile;
}

// ── 조회 (P2에서 소비 예정, P1에서도 디버깅 가능) ────────────────
/**
 * canonical 이름 또는 원본 이름으로 prior 조회.
 * @param {string} name  음식 이름 (raw 또는 canonical)
 * @param {object} [opt]
 * @param {number} [opt.minCount=3]  최소 샘플 수 (미만이면 null 반환)
 * @returns {object|null}
 *   { canonical, count, kcalPerGramMedian, proteinRatio, carbsRatio, fatRatio,
 *     avgGrams, freshness, weight, lastSeen }
 *   weight = min(1, count/10) * freshness  (P2 블렌딩용)
 */
export function getFoodPrior(name, opt = {}) {
  const minCount = opt.minCount ?? 3;
  if (!name) return null;
  const canonical = normalizeFood(name) || name;
  const stat = _profile.canonicals[canonical];
  if (!stat || stat.count < minCount) return null;

  const confidence = Math.min(1, stat.count / 10);
  const weight     = Math.max(0, Math.min(1, confidence * stat.freshness));

  return {
    canonical,
    count: stat.count,
    kcalPerGramMedian: stat.kcalPerGram.median,
    kcalPerGramP25:    stat.kcalPerGram.p25,
    kcalPerGramP75:    stat.kcalPerGram.p75,
    proteinRatio: stat.proteinRatio,
    carbsRatio:   stat.carbsRatio,
    fatRatio:     stat.fatRatio,
    avgGrams:     stat.avgGrams,
    freshness:    stat.freshness,
    weight,
    lastSeen:     stat.lastSeen,
  };
}

// ── 내관 (콘솔에서 사용) ────────────────────────────────────────
export function getFoodProfile() {
  return _profile;
}

export function dumpFoodProfile() {
  const rows = Object.entries(_profile.canonicals)
    .map(([name, s]) => ({
      canonical: name,
      count: s.count,
      avgGrams: s.avgGrams,
      kcalPer100g: Math.round(s.kcalPerGram.median * 100),
      p25_100g: Math.round(s.kcalPerGram.p25 * 100),
      p75_100g: Math.round(s.kcalPerGram.p75 * 100),
      freshness: s.freshness,
      lastSeen: s.lastSeen,
    }))
    .sort((a, b) => b.count - a.count);
  console.log(
    `[ai-food-profile] total=${_profile.totalSamples}, canonicals=${rows.length}, ` +
    `builtAt=${new Date(_profile.builtAt).toISOString()}`
  );
  console.table(rows);
  return rows;
}

// ── window 바인딩 (디버깅/콘솔 편의) ──────────────────────────────
if (typeof window !== 'undefined') {
  window.rebuildFoodProfile = rebuildFoodProfile;
  window.getFoodPrior       = getFoodPrior;
  window.getFoodProfile     = getFoodProfile;
  window.dumpFoodProfile    = dumpFoodProfile;
}
