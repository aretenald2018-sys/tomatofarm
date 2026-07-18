function asBoard(value) {
  return value && typeof value === 'object' ? value : null;
}

function seasonIdOf(season) {
  return String(season?.id || '').trim();
}

export function isBoardForSeason(board, season, { allowMissingSeasonId = false } = {}) {
  const candidate = asBoard(board);
  const activeSeasonId = seasonIdOf(season);
  if (!candidate) return false;
  if (!activeSeasonId) return true;
  const boardSeasonId = String(candidate.seasonId || '').trim();
  return boardSeasonId === activeSeasonId || (allowMissingSeasonId && !boardSeasonId);
}

// A season-keyed document is trusted when it is untagged or tagged for the
// active season. The generic legacy document is accepted only with an exact
// seasonId, preventing an old board from becoming the current season goal.
export function resolveSeasonTestBoard({
  currentSeason = null,
  seasonBoard = null,
  genericBoard = null,
} = {}) {
  if (!seasonIdOf(currentSeason)) return asBoard(genericBoard);
  if (isBoardForSeason(seasonBoard, currentSeason, { allowMissingSeasonId: true })) {
    return seasonBoard;
  }
  return isBoardForSeason(genericBoard, currentSeason) ? genericBoard : null;
}

export function normalizeBoardForSeason(board, currentSeason = null) {
  const candidate = asBoard(board);
  if (!candidate) return null;
  const activeSeasonId = seasonIdOf(currentSeason);
  if (!activeSeasonId) return { ...candidate };
  const boardSeasonId = String(candidate.seasonId || '').trim();
  if (boardSeasonId && boardSeasonId !== activeSeasonId) return null;
  return { ...candidate, seasonId: activeSeasonId };
}
