import { wtHandleExercisePickerBack } from '../workout/exercises.js';
import { wtHandleRunningSessionBack } from '../workout/running-session.js';
import { wtRecoverTimers } from '../workout/index.js';
import {
  enableWorkoutPwaHistory,
  handleWorkoutBack,
} from '../workout/navigation-stack.js';

let _getCurrentTab = () => 'home';
const WORKOUT_PULL_BACK_DEADZONE_PX = 8;
const WORKOUT_PULL_BACK_THRESHOLD_PX = 72;

export function configureWorkoutGestures({ getCurrentTab } = {}) {
  if (typeof getCurrentTab === 'function') _getCurrentTab = getCurrentTab;
}

function _handleWorkoutOverlayBack() {
  return _getCurrentTab() === 'workout' && (
    wtHandleRunningSessionBack() === true ||
    wtHandleExercisePickerBack() === true
  );
}

function _isWorkoutPullBlockedTarget(target) {
  return !!target?.closest?.('input, textarea, select, [contenteditable="true"], [data-wt-day-sheet], [data-wt-calendar-scroll-surface], .modal-backdrop.open, .modal-overlay.open');
}

function _nearestWorkoutScroller(target) {
  const panel = document.getElementById('tab-workout');
  let node = target instanceof Element ? target : null;
  while (node && node !== panel && node !== document.body && node !== document.documentElement) {
    const style = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(node) : null;
    const overflowY = style?.overflowY || '';
    if (node.scrollHeight > node.clientHeight + 1 && /(auto|scroll|overlay)/.test(overflowY)) return node;
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

function _workoutPageScrollTop() {
  return Math.max(
    0,
    Number(document.scrollingElement?.scrollTop) || 0,
    Number(document.documentElement?.scrollTop) || 0,
    Number(document.body?.scrollTop) || 0,
    Number(window.scrollY) || 0
  );
}

function _canStartWorkoutPullBack(target) {
  if (_getCurrentTab() !== 'workout' || _isWorkoutPullBlockedTarget(target)) return false;
  const rootTop = _workoutPageScrollTop();
  const scroller = _nearestWorkoutScroller(target);
  const scrollerTop = Math.max(0, Number(scroller?.scrollTop) || 0);
  return rootTop <= 1 && scrollerTop <= 1;
}

let _workoutPullBackGesture = null;
let _workoutPullBackBound = false;
export function initWorkoutPullBackGesture() {
  if (_workoutPullBackBound || typeof window === 'undefined') return;
  _workoutPullBackBound = true;

  const reset = () => { _workoutPullBackGesture = null; };
  const onStart = (event) => {
    if (event.touches?.length !== 1) return reset();
    const touch = event.touches[0];
    _workoutPullBackGesture = {
      startX: touch.clientX,
      startY: touch.clientY,
      handled: false,
      canPull: _canStartWorkoutPullBack(event.target),
    };
  };
  const onMove = (event) => {
    const gesture = _workoutPullBackGesture;
    if (!gesture || event.touches?.length !== 1 || _getCurrentTab() !== 'workout') return;
    const touch = event.touches[0];
    const dx = touch.clientX - gesture.startX;
    const dy = touch.clientY - gesture.startY;
    if (!gesture.canPull || dy <= WORKOUT_PULL_BACK_DEADZONE_PX || Math.abs(dx) > dy * 0.75) return;

    if (event.cancelable) event.preventDefault();
    if (gesture.handled || dy < WORKOUT_PULL_BACK_THRESHOLD_PX) return;
    gesture.handled = true;
    _handleWorkoutOverlayBack() || handleWorkoutBack({ activeTab: _getCurrentTab(), preferHistory: true, action: 'pull:back' });
  };

  window.addEventListener('touchstart', onStart, { passive: true, capture: true });
  window.addEventListener('touchmove', onMove, { passive: false, capture: true });
  window.addEventListener('touchend', reset, { passive: true, capture: true });
  window.addEventListener('touchcancel', reset, { passive: true, capture: true });
}

enableWorkoutPwaHistory({
  getActiveTab: () => _getCurrentTab(),
  handleOverlayBack: _handleWorkoutOverlayBack,
});

let _workoutSystemBackBound = false;
export function initWorkoutSystemBack() {
  if (_workoutSystemBackBound || typeof window === 'undefined') return;
  const appPlugin = window.Capacitor?.Plugins?.App;
  if (!appPlugin || typeof appPlugin.addListener !== 'function') return;
  _workoutSystemBackBound = true;
  appPlugin.addListener('backButton', (event = {}) => {
    if (_handleWorkoutOverlayBack()) return;
    if (handleWorkoutBack({ activeTab: _getCurrentTab(), preferHistory: true })) return;
    if (event.canGoBack && window.history?.back) window.history.back();
  });
  appPlugin.addListener('appStateChange', (event = {}) => {
    if (event.isActive) wtRecoverTimers();
  });
}
setTimeout(initWorkoutSystemBack, 0);
setTimeout(initWorkoutPullBackGesture, 0);
