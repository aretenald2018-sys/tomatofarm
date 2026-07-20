import { registerActions } from '../utils/action-router.js';
import {
  editSectionTitle, addMiniMemoItem, toggleMiniMemoItem, deleteMiniMemoItem,
  closeSectionTitleModal, saveSectionTitleFromModal, closeExportModal, runExportCSV,
  closeSettingsModal,
  quickDeleteNutritionItem,
} from '../feature-misc.js';
import { openDietPlanModal, closeDietPlanModal, saveDietPlanFromModal } from '../feature-diet-plan.js';
import {
  openCheckinModal, closeCheckinModal, toggleCheckinBodyFat,
  saveCheckinFromModal, deleteCheckinFromModal,
} from '../feature-checkin.js';
import {
  openGoalModal, closeGoalModal, toggleGoalCondition, saveGoalFromModal,
  deleteGoalItem, analyzeGoalFeasibilityHandler,
} from '../app-modal-goals.js';
import { openUnitGoalDatePicker } from '../home/unit-goal.js';
import { switchLeaderboardTab } from '../home/hero.js';
import { openFriendManager } from '../home/friend-feed.js';
import {
  openQuestModal, closeQuestModal, onQuestAutoChange, saveQuestFromModal,
  openQuestEditModal, closeQuestEditModal, saveQuestEdit, deleteQuestItem, toggleQuestCheck,
} from '../app-modal-quests.js';
import { closePatchnote } from '../modals/patchnote-modal.js';
import { closeStreakMilestone } from '../modals/streak-milestone-modal.js';
import { closeWeightResultModal } from '../modals/weight-result-modal.js';
import { installPWA } from '../pwa-fcm.js';
import { submitDietSetup } from '../feature-login.js';
import { openNutritionItemEditor } from '../modals/nutrition-item-modal.js';
import {
  changeWorkoutDate,
  goToTodayWorkout,
  saveWorkoutDay,
  wtOpenExercisePicker,
  wtOpenRestPresetSheet,
  wtRestTimerAdjust,
  wtRestTimerSkip,
  wtTogglePauseWorkoutTimer,
  wtResetWorkoutTimer,
  wtEndAndShowInsights,
  openNutritionPhotoUpload,
  wtAddFrequentFoodSuggestion,
} from '../workout/index.js';
import { openNutritionSearch } from '../feature-nutrition.js';
import {
  wtSwitchType,
  uploadMealPhoto,
  uploadMealPhotoAI,
  openBulkMealAI,
  toggleBulkMealAIChip,
  runBulkMealAIUpload,
  toggleDietMealRow,
  wtSkipMeal,
} from '../workout-ui.js';
import { loadLazyModule } from './lazy-loader.js';
import { getTabDefinition } from './tab-registry.js';

let registered = false;

function clickInput(id) {
  if (id) document.getElementById(id)?.click();
}

async function openCooking() {
  const config = getTabDefinition('cooking');
  const module = await loadLazyModule(config.id, config.module);
  return module.openCookingModal();
}

export function registerStaticActions() {
  if (registered) return;
  registered = true;
  registerActions({
    'home:open-unit-goal-date': () => openUnitGoalDatePicker(),
    'home:edit-section-title': (_control, _event, key) => editSectionTitle(key),
    'home:add-mini-memo': () => addMiniMemoItem(),
    'home:add-mini-memo-key': (_control, event) => {
      if (event.key === 'Enter') return addMiniMemoItem();
      return undefined;
    },
    'home:open-quest': (_control, _event, period) => openQuestModal(period),
    'home:open-goal': () => openGoalModal(),
    'home:open-checkin': () => openCheckinModal(),
    'home:switch-tab': (control) => document.dispatchEvent(new CustomEvent('app:switch-tab', { detail: { tab: control.dataset.tab } })),
    'home:toggle-mini-memo': (control) => toggleMiniMemoItem(control.dataset.itemId),
    'home:delete-mini-memo': (control) => deleteMiniMemoItem(control.dataset.itemId),
    'home:analyze-goal': (control) => analyzeGoalFeasibilityHandler(control.dataset.goalId),
    'home:delete-goal': (control) => deleteGoalItem(control.dataset.goalId),
    'home:toggle-quest': (control) => toggleQuestCheck(control.dataset.questId),
    'home:edit-quest': (control) => openQuestEditModal(control.dataset.questId),
    'home:delete-quest': (control) => deleteQuestItem(control.dataset.questId),
    'home:switch-leaderboard': (control, _event, period) => switchLeaderboardTab(period || control.dataset.period),
    'social:open-friend-manager': () => openFriendManager(),
    'diet:open-plan': () => openDietPlanModal(),
    'workout:switch-type': (control, _event, type) => wtSwitchType(type || control.dataset.type),
    'workout:open-rest-preset': () => wtOpenRestPresetSheet(),
    'workout:adjust-rest': (_control, _event, delta) => wtRestTimerAdjust(Number(delta) || 0),
    'workout:skip-rest': () => wtRestTimerSkip(),
    'workout:toggle-pause': () => wtTogglePauseWorkoutTimer(),
    'workout:reset-timer': () => wtResetWorkoutTimer(),
    'workout:finish': () => wtEndAndShowInsights(),
    'workout:open-picker': () => wtOpenExercisePicker(),
    'workout:click-input': (_control, event, id) => { event.stopPropagation(); clickInput(id); },
    'workout:upload-photo': (control, _event, meal) => uploadMealPhoto(meal, control),
    'workout:save': () => saveWorkoutDay(),
    'workout:change-date': (_control, _event, delta) => changeWorkoutDate(Number(delta) || 0),
    'workout:today': () => goToTodayWorkout(),
    'diet:submit-setup': () => submitDietSetup(),
    'diet:toggle-row': (control) => toggleDietMealRow(control),
    'diet:add-food': (control) => openNutritionSearch(control.dataset.meal),
    'diet:skip-meal': (_control, _event, meal) => wtSkipMeal(meal),
    'diet:add-frequent-food': (control) => wtAddFrequentFoodSuggestion(control.dataset.meal, control.dataset.suggestionKey),
    'diet:click-input': (_control, event, id) => { event.stopPropagation(); clickInput(id); },
    'diet:upload-photo': (control, _event, meal) => uploadMealPhoto(meal, control),
    'diet:upload-photo-ai': (control, _event, meal) => uploadMealPhotoAI(meal, control),
    'diet:open-bulk-ai': () => openBulkMealAI(),
    'diet:toggle-bulk-chip': (control) => toggleBulkMealAIChip(control),
    'diet:run-bulk-upload': (control) => runBulkMealAIUpload(control),
    'diet:open-nutrition-photo': () => openNutritionPhotoUpload(),
    'cooking:open': () => openCooking(),
    'checkin:close': (_control, event) => closeCheckinModal(event),
    'checkin:toggle-body-fat': () => toggleCheckinBodyFat(),
    'checkin:save': () => saveCheckinFromModal(),
    'checkin:delete': () => deleteCheckinFromModal(),
    'diet-plan:close': (_control, event) => closeDietPlanModal(event),
    'diet-plan:save': () => saveDietPlanFromModal(),
    'section-title:close': (_control, event) => closeSectionTitleModal(event),
    'section-title:save': () => saveSectionTitleFromModal(),
    'export:close': (_control, event) => closeExportModal(event),
    'export:run': (_control, _event, period) => runExportCSV(Number(period) || 0),
    'settings:close': (_control, event) => closeSettingsModal(event),
    'settings:edit-nutrition': (control) => openNutritionItemEditor(control.dataset.itemId || null),
    'settings:delete-nutrition': (control) => quickDeleteNutritionItem(control.dataset.itemId || ''),
    'goal:close': (_control, event) => closeGoalModal(event),
    'goal:toggle-condition': () => toggleGoalCondition(),
    'goal:save': () => saveGoalFromModal(),
    'quest:close': (_control, event) => closeQuestModal(event),
    'quest:auto-change': () => onQuestAutoChange(),
    'quest:save': () => saveQuestFromModal(),
    'quest-edit:close': (_control, event) => closeQuestEditModal(event),
    'quest-edit:save': () => saveQuestEdit(),
    'patchnote:close': (_control, event) => closePatchnote(event),
    'streak:close-milestone': (_control, event) => closeStreakMilestone(event),
    'weight-result:close': (_control, event) => closeWeightResultModal(event),
    'pwa:install': () => installPWA(),
  });
}
