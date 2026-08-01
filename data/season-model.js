// Pure workout season date-range model. No DOM or Firebase access.

export const SEASON_REGISTRY_SCHEMA_VERSION = 3;

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function _dateParts(value) {
  const match = String(value || '').match(DATE_KEY_RE);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return { year, month, day, date };
}
function _formatUtcDate(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function isSeasonDateKey(value) {
  return !!_dateParts(value);
}

export function compareSeasonDateKeys(left, right) {
  if (!isSeasonDateKey(left) || !isSeasonDateKey(right)) {
    throw new TypeError('season date keys must use YYYY-MM-DD');
  }
  return String(left).localeCompare(String(right));
}

export function addSeasonDays(dateKey, amount) {
  const parts = _dateParts(dateKey);
  if (!parts) throw new TypeError('season date key must use YYYY-MM-DD');
  const days = Number(amount);
  if (!Number.isFinite(days)) throw new TypeError('season day offset must be finite');
  parts.date.setUTCDate(parts.date.getUTCDate() + Math.trunc(days));
  return _formatUtcDate(parts.date);
}

export function startOfSeasonWeek(dateKey) {
  const parts = _dateParts(dateKey);
  if (!parts) throw new TypeError('season date key must use YYYY-MM-DD');
  const day = parts.date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  parts.date.setUTCDate(parts.date.getUTCDate() + offset);
  return _formatUtcDate(parts.date);
}

// 종목별 기간(exerciseWindows)은 선택 필드다. 없으면 그 종목은 시즌 전체 기간을 쓴다.
// 운영 앱은 이 필드를 모르지만 시즌 정규화가 `...value`로 통과시키므로 왕복해도 보존된다.
function _normalizeExerciseWindows(value, exerciseIds, startDate, endDate) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  if (!source) return null;
  const allowed = new Set(exerciseIds);
  const windows = {};
  for (const [rawId, rawWindow] of Object.entries(source)) {
    const exerciseId = String(rawId || '').trim();
    if (!exerciseId) continue;
    // 시즌이 담당하지 않는 종목의 기간은 의미가 없다. 전체 담당(빈 배열)일 때는 모두 허용한다.
    if (allowed.size && !allowed.has(exerciseId)) continue;
    const windowStart = String(rawWindow?.startDate || '');
    const windowEnd = String(rawWindow?.endDate || '');
    if (!isSeasonDateKey(windowStart) || !isSeasonDateKey(windowEnd)) continue;
    // 시즌 범위 안으로 가둔다. 뒤집힌 구간은 버린다.
    const clampedStart = windowStart < startDate ? startDate : windowStart;
    const clampedEnd = windowEnd > endDate ? endDate : windowEnd;
    if (clampedStart > clampedEnd) continue;
    if (clampedStart === startDate && clampedEnd === endDate) continue; // 시즌 기간과 동일하면 저장하지 않는다
    windows[exerciseId] = { startDate: clampedStart, endDate: clampedEnd };
  }
  return Object.keys(windows).length ? windows : null;
}

export function normalizeSeason(value = {}) {
  const id = String(value?.id || '').trim();
  const name = String(value?.name || '').trim();
  const startDate = String(value?.startDate || '');
  const endDate = String(value?.endDate || '');
  if (!id || !name || !isSeasonDateKey(startDate) || !isSeasonDateKey(endDate)) return null;
  if (startDate > endDate) return null;
  const rawExerciseIds = Array.isArray(value?.exerciseIds)
    ? value.exerciseIds
    : Array.isArray(value?.selectedExerciseIds) ? value.selectedExerciseIds : [];
  const exerciseIds = [...new Set(rawExerciseIds
    .map(exerciseId => String(exerciseId || '').trim())
    .filter(Boolean))].sort();
  const exerciseWindows = _normalizeExerciseWindows(value?.exerciseWindows, exerciseIds, startDate, endDate);
  const season = {
    ...value,
    id,
    name,
    startDate,
    endDate,
    exerciseIds,
  };
  // 빈 값을 굳이 공유 백엔드에 쓰지 않는다.
  if (exerciseWindows) season.exerciseWindows = exerciseWindows;
  else delete season.exerciseWindows;
  return season;
}

export function normalizeSeasonRegistry(value = {}) {
  const seasons = (Array.isArray(value?.seasons) ? value.seasons : [])
    .map(normalizeSeason)
    .filter(Boolean)
    .sort((left, right) => (
      left.startDate.localeCompare(right.startDate) || left.id.localeCompare(right.id)
    ));
  return {
    ...value,
    schemaVersion: SEASON_REGISTRY_SCHEMA_VERSION,
    seasons,
  };
}

export function validateSeasonRegistry(value = {}) {
  const rawSeasons = Array.isArray(value?.seasons) ? value.seasons : [];
  const errors = [];
  const normalized = [];
  const ids = new Set();

  rawSeasons.forEach((raw, index) => {
    const season = normalizeSeason(raw);
    if (!season) {
      errors.push(`seasons[${index}] is invalid`);
      return;
    }
    if (ids.has(season.id)) errors.push(`duplicate season id: ${season.id}`);
    ids.add(season.id);
    normalized.push(season);
  });

  normalized.sort((left, right) => left.startDate.localeCompare(right.startDate) || left.id.localeCompare(right.id));
  for (let leftIndex = 0; leftIndex < normalized.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < normalized.length; rightIndex += 1) {
      const left = normalized[leftIndex];
      const right = normalized[rightIndex];
      if (right.startDate > left.endDate) break;
      if (seasonScopesOverlap(left, right)) {
        errors.push(`season ranges overlap: ${left.id} / ${right.id}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    registry: normalizeSeasonRegistry({ ...value, seasons: normalized }),
  };
}

export function assertSeasonRegistry(value = {}) {
  const result = validateSeasonRegistry(value);
  if (!result.valid) throw new RangeError(result.errors.join('; '));
  return result.registry;
}

export function seasonContainsDate(season, dateKey) {
  const normalized = normalizeSeason(season);
  if (!normalized || !isSeasonDateKey(dateKey)) return false;
  return normalized.startDate <= dateKey && dateKey <= normalized.endDate;
}

export function seasonExerciseIds(season) {
  return normalizeSeason(season)?.exerciseIds || [];
}

export function seasonContainsExercise(season, exerciseId) {
  const id = String(exerciseId || '').trim();
  if (!id) return true;
  const exerciseIds = seasonExerciseIds(season);
  return exerciseIds.length === 0 || exerciseIds.includes(id);
}

// 해당 종목이 이 시즌에서 실제로 적용받는 기간. 종목별 기간이 없으면 시즌 기간을 그대로 쓴다.
// 시즌이 담당하지 않는 종목이면 null.
export function seasonExerciseRange(season, exerciseId) {
  const normalized = normalizeSeason(season);
  if (!normalized) return null;
  if (!seasonContainsExercise(normalized, exerciseId)) return null;
  const id = String(exerciseId || '').trim();
  const window = id ? normalized.exerciseWindows?.[id] : null;
  if (!window) return { startDate: normalized.startDate, endDate: normalized.endDate };
  return { startDate: window.startDate, endDate: window.endDate };
}

export function seasonContainsExerciseDate(season, exerciseId, dateKey) {
  const range = seasonExerciseRange(season, exerciseId);
  if (!range || !isSeasonDateKey(dateKey)) return false;
  return range.startDate <= dateKey && dateKey <= range.endDate;
}

export function seasonScopesOverlap(left, right) {
  const leftIds = seasonExerciseIds(left);
  const rightIds = seasonExerciseIds(right);
  if (!leftIds.length || !rightIds.length) return true;
  return leftIds.some(exerciseId => rightIds.includes(exerciseId));
}

export function findSeasonById(registry, seasonId) {
  const id = String(seasonId || '').trim();
  if (!id) return null;
  return normalizeSeasonRegistry(registry).seasons.find(season => season.id === id) || null;
}

export function findSeasonsForDate(registry, dateKey, options = {}) {
  if (!isSeasonDateKey(dateKey)) return [];
  const exerciseId = String(options?.exerciseId || '').trim();
  return normalizeSeasonRegistry(registry).seasons.filter(season => (
    seasonContainsDate(season, dateKey) && (!exerciseId || seasonContainsExercise(season, exerciseId))
  ));
}

export function findSeasonForDate(registry, dateKey, options = {}) {
  return findSeasonsForDate(registry, dateKey, options)[0] || null;
}

export function seasonStatus(season, todayKey) {
  const normalized = normalizeSeason(season);
  if (!normalized || !isSeasonDateKey(todayKey)) return 'none';
  if (todayKey < normalized.startDate) return 'scheduled';
  if (todayKey > normalized.endDate) return 'archived';
  return 'current';
}

export function filterCacheToSeason(cache = {}, season) {
  const normalized = normalizeSeason(season);
  if (!normalized || !cache || typeof cache !== 'object') return {};
  return Object.fromEntries(
    Object.entries(cache).filter(([dateKey]) => seasonContainsDate(normalized, dateKey))
  );
}

// 종목별 기간이 지정된 경우 그 종목의 구간으로 자른다.
export function filterCacheToSeasonExercise(cache = {}, season, exerciseId) {
  const range = seasonExerciseRange(season, exerciseId);
  if (!range || !cache || typeof cache !== 'object') return {};
  return Object.fromEntries(
    Object.entries(cache).filter(([dateKey]) => (
      isSeasonDateKey(dateKey) && range.startDate <= dateKey && dateKey <= range.endDate
    ))
  );
}

export function selectSeasonDecisionCache(cache = {}, registry = {}, referenceDateKey, options = {}) {
  const exerciseId = String(options?.exerciseId || '').trim();
  const normalized = normalizeSeasonRegistry(registry);
  if (!normalized.seasons.length) return cache;
  if (!isSeasonDateKey(referenceDateKey)) return {};
  if (exerciseId) {
    // 어느 시즌도 담당하지 않는 종목은 시즌으로 자르지 않고 전체 기록을 쓴다.
    if (!normalized.seasons.some(season => seasonContainsExercise(season, exerciseId))) return cache;
    const scoped = findSeasonForDate(normalized, referenceDateKey, { exerciseId });
    if (scoped) return filterCacheToSeasonExercise(cache, scoped, exerciseId);
  }
  const season = findSeasonForDate(normalized, referenceDateKey);
  if (season) return filterCacheToSeason(cache, season);
  const firstSeason = normalized.seasons[0];
  if (referenceDateKey < firstSeason.startDate) {
    return Object.fromEntries(Object.entries(cache || {}).filter(([dateKey]) => (
      isSeasonDateKey(dateKey) && dateKey < firstSeason.startDate
    )));
  }
  return {};
}
