// ================================================================
// workout/save-pure.js — Firebase/DOM 비의존 저장 판정 헬퍼
// ================================================================

export function hasMaxDraftEntry(entry) {
  return !!(entry && (
    entry.recommendationMeta?.mode === 'max' ||
    entry.maxPrescription ||
    entry.maxWeakPart
  ));
}

export function shouldKeepMaxDraftExercisesForSavePure(workout, currentDateKey = null) {
  const meta = workout?.maxMeta;
  const metaDateMatches = !meta?.dateKey || !currentDateKey || meta.dateKey === currentDateKey;
  const hasMetaAction = !!(meta && typeof meta === 'object' && metaDateMatches && (
    (Array.isArray(meta.selectedMajors) && meta.selectedMajors.length > 0) ||
    (Array.isArray(meta.selectedWeakParts) && meta.selectedWeakParts.length > 0) ||
    (Array.isArray(meta.rejectedRecommendations) && meta.rejectedRecommendations.length > 0) ||
    (Number(meta.weakBlock?.durationSec) || 0) > 0 ||
    !!meta.weakBlock?.activeStartedAt ||
    meta.majorGateOpen === true ||
    meta.majorGateOpen === false
  ));
  const hasMaxDraft = metaDateMatches && (workout?.exercises || []).some(hasMaxDraftEntry);
  return hasMetaAction || hasMaxDraft;
}
