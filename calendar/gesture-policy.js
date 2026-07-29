export function _workoutHomeSheetEventTarget(event) {
  return event?.target instanceof Element ? event.target : event?.target?.parentElement;
}

export function _workoutHomeSheetEventHitsCarousel(event) {
  return !!_workoutHomeSheetEventTarget(event)?.closest?.('[data-wt-day-exercise-carousel-track]');
}

export function _workoutHomeSheetHasHorizontalIntent(deltaX, deltaY) {
  const ax = Math.abs(Number(deltaX) || 0);
  const ay = Math.abs(Number(deltaY) || 0);
  return ax >= 4 && ax > ay;
}

export function _workoutHomeSheetCarouselShouldOwnTouch(event, dx, dy) {
  return _workoutHomeSheetEventHitsCarousel(event)
    && _workoutHomeSheetHasHorizontalIntent(dx, dy);
}

export function _workoutHomeSheetCarouselShouldOwnWheel(event) {
  return _workoutHomeSheetEventHitsCarousel(event)
    && _workoutHomeSheetHasHorizontalIntent(
      Number(event?.deltaX) || 0,
      Number(event?.deltaY) || 0,
    );
}

export function _workoutHomeSheetTouchWouldChain(scroller, dy) {
  const scrollTop = Math.max(0, Number(scroller?.scrollTop) || 0);
  const maxScrollTop = Math.max(
    0,
    (Number(scroller?.scrollHeight) || 0) - (Number(scroller?.clientHeight) || 0),
  );
  if (maxScrollTop <= 0) return true;
  if (dy > 0 && scrollTop <= 0) return true;
  return dy < 0 && scrollTop >= maxScrollTop - 1;
}

export function _workoutHomeSheetWheelWouldChain(scroller, deltaY) {
  const scrollTop = Math.max(0, Number(scroller?.scrollTop) || 0);
  const maxScrollTop = Math.max(
    0,
    (Number(scroller?.scrollHeight) || 0) - (Number(scroller?.clientHeight) || 0),
  );
  if (maxScrollTop <= 0) return true;
  if (deltaY < 0 && scrollTop <= 0) return true;
  return deltaY > 0 && scrollTop >= maxScrollTop - 1;
}
