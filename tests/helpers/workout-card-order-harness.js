import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readAppCssSync } from './css-source.js';
const root = fileURLToPath(new URL('../../', import.meta.url));
const dataModule = source => `data:text/javascript,${encodeURIComponent(source)}`;

export async function buildWorkoutCardOrderHarnessHtml(baseUrl = pathToFileURL(root).href) {
  const url = relative => new URL(relative, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).href;
  const fakeUrl = url('tests/helpers/fake-data-layer.js');
  const dataStub = dataModule(`
    export * from ${JSON.stringify(fakeUrl)};
    import { saveDay as save } from ${JSON.stringify(fakeUrl)};
    export async function saveDay(...args) {
      await save(...args);
      if (window.__delaySaves) await new Promise(resolve => window.__saveAcks.push(resolve));
      return { state: 'synced' };
    }
  `);
  const aiStub = dataModule('export const parseEquipmentFromText = async () => null; export const parseEquipmentFromImage = async () => null; export const estimateInOnePass = async () => null;');
  const imports = { [url('data.js')]: dataStub, [url('ai.js')]: aiStub };
  const tokens = await readFile(new URL('../../styles/tokens.css', import.meta.url), 'utf8');
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline' data: file:; style-src 'self' 'unsafe-inline'; img-src 'self' data: file:; font-src 'self'; connect-src 'none'; worker-src 'none'">
    <script type="importmap">${JSON.stringify({ imports })}</script><style>${tokens}\n${readAppCssSync()}\nbody { margin:0; font-family: sans-serif; } #workout-calendar-root { height:100vh; overflow:auto; }</style></head>
    <body><details open id="qa-panel" style="position:fixed;top:0;right:0;z-index:99999;max-width:100%;background:#fff;border:1px solid #aaa;font:11px monospace"><summary>합성 데이터 검증 · 외부 연결 차단</summary>
      <button id="qa-seed-single">기본 카드 초기화</button><button id="qa-seed-superset">슈퍼세트 초기화</button><button id="qa-delay">느린 저장 시작</button><button id="qa-ack">저장 응답 받기</button>
      <pre id="qa-error" style="color:#b91c1c;white-space:pre-wrap"></pre><pre id="qa-state" style="white-space:pre-wrap;margin:4px"></pre>
    </details><main id="workout-calendar-root"></main><div id="wt-workout-timer-bar"></div>
    <script type="module">
    try {
      const fake = await import(${JSON.stringify(fakeUrl)});
      const { S } = await import(${JSON.stringify(url('workout/state.js'))});
      const calendar = await import(${JSON.stringify(url('render-calendar.js'))});
      const detail = await import(${JSON.stringify(url('calendar/detail-template.js'))});
      const keyboard = await import(${JSON.stringify(url('calendar/set-keyboard.js'))});
      const timers = await import(${JSON.stringify(url('workout/timers.js'))});
      const today = fake.TODAY;
      const key = fake.dateKey(today.getFullYear(), today.getMonth(), today.getDate());
      window.__saveAcks = [];
      window.__delaySaves = false;
      const open = () => calendar.applyWorkoutCalendarNavSnapshot({ calendar: {
        viewYear: today.getFullYear(), viewMonth: today.getMonth(), selectedKey: key,
        selectedSessionIndex: 0, sheetOpen: true, sheetState: 'full', scrollTop: 0,
      } }, { preserveScroll: false });
      const makeEntry = (id, i) => ({ exerciseId: id, name: id + ' 운동', muscleId: 'chest',
        unknown: { keep: id }, recommendationMeta: { track: 'H' },
        sets: [{ kg: 40 + i, reps: 8, done: false, rir: 2, romPct: 90, setType: 'main', custom: id },
               { kg: 30 + i, reps: 12, done: false, setType: 'drop', custom: id + '-second' }],
      });
      const seed = (superset = false) => {
        keyboard._hideWorkoutSetKeyboard({ commit: false });
        fake.resetFakeDataLayer({ currentUser: { id: 'synthetic-card-order', name: 'QA' },
          dietPlan: { weight: 70, refeedDays: [] },
          exercises: ['A', 'B', 'C', 'D'].map(id => ({ id, name: id + ' 운동', muscleId: 'chest' })),
          muscleParts: [{ id: 'chest', name: '가슴' }],
        });
        const exercises = ['A', 'B', 'C', 'D'].map(makeEntry);
        const startedAt = new Date(Date.now() - 30000).toISOString();
        Object.assign(exercises[0].sets[0], { done: true, completedAt: Date.now() - 30000, restStartedAt: startedAt, restPlannedSec: 90, restElapsedSec: 0 });
        if (superset) { exercises[0].supersetGroup = 'group'; exercises[2].supersetGroup = 'group'; }
        fake.getCache()[key] = { breakfast: 'untouched',
          workoutSessions: [{ id: 'gym-1', exercises, workoutPhoto: 'synthetic-photo', maxMeta: { keep: true, majorGateOpen: true } },
                            { id: 'gym-2', exercises: [makeEntry('second-session', 0)], memo: 'keep-session' }],
          exercises: JSON.parse(JSON.stringify(exercises)),
          restBetweenSets: [{ exerciseId: 'A', entryIdx: 0, setIdx: 0, setNumber: 1, startedAt, elapsedSec: 0, custom: 'keep-rest' }],
        };
        S.shared.date = { y: today.getFullYear(), m: today.getMonth(), d: today.getDate() };
        S.workout.sessionIndex = 0;
        S.workout.maxMeta = { keep: true, majorGateOpen: true };
        S.workout.exercises = JSON.parse(JSON.stringify(exercises));
        S.workout.restTimer = { origin: { entryIdx: 0, setIdx: 0, exerciseId: 'A', setNumber: 1 }, startedAt: Date.parse(startedAt), total: 90, remaining: 60, running: true, interval: null };
        detail._workoutExpandedSetEditors.clear(); detail._workoutOpenSetTypeMenus.clear(); detail._workoutOpenSupersetMenus.clear();
        detail.workoutDetailState.editingCardId = null; detail.workoutDetailState.inlineSetEditor = null;
        window.__delaySaves = false; window.__saveAcks = [];
        open();
      };
      const snapshot = () => {
        const day = fake.getCache()[key];
        const track = document.querySelector('[data-wt-day-exercise-carousel-track]');
        const slides = [...track.querySelectorAll('[data-wt-day-exercise-slide]')];
        const trackLeft = track.getBoundingClientRect().left;
        const activeSlide = slides.reduce((best, slide, i) => Math.abs(slide.getBoundingClientRect().left - trackLeft) < best.distance ? { index:i, distance:Math.abs(slide.getBoundingClientRect().left - trackLeft) } : best, { index:-1, distance:Infinity });
        const active = document.activeElement;
        return { day: JSON.parse(JSON.stringify(day)), names: day.workoutSessions[0].exercises.map(e => e.exerciseId),
          rest: JSON.parse(JSON.stringify(S.workout.restTimer)), activeExercises: JSON.parse(JSON.stringify(S.workout.exercises)), activeNames: S.workout.exercises.map(e => e.exerciseId),
          activeSlide: activeSlide.index, activeField: active?.getAttribute('data-field'), activeEntry: active?.getAttribute('data-exercise-index'), activeValue: active?.value,
          editorKeys: [...detail._workoutExpandedSetEditors], inlineKey: detail.workoutDetailState.inlineSetEditor,
          savedCount: fake.fakeDataStore.savedDays.length, acks: window.__saveAcks.length,
          cardCount: slides.length, renderedNames: [...document.querySelectorAll('.wt-max-card-name')].map(n => n.textContent.trim()),
        };
      };
      window.__qa = { seed, open, snapshot, key, echo: () => calendar.refreshWorkoutSheetForDataUpdate([key]),
        setRir: (exerciseIndex, setIndex, value) => { fake.getCache()[key].workoutSessions[0].exercises[exerciseIndex].sets[setIndex].rir = value; open(); },
        skipRest: () => timers.wtRestTimerSkip(),
        acknowledge: () => { const acks = window.__saveAcks.splice(0); acks.reverse().forEach(resolve => resolve()); } };
      document.getElementById('qa-seed-single').addEventListener('click', () => seed(false));
      document.getElementById('qa-seed-superset').addEventListener('click', () => seed(true));
      document.getElementById('qa-delay').addEventListener('click', () => { window.__delaySaves = true; });
      document.getElementById('qa-ack').addEventListener('click', () => { window.__delaySaves = false; window.__qa.acknowledge(); });
      window.addEventListener('error', event => { document.getElementById('qa-error').textContent = event.message; });
      window.setInterval(() => {
        const state = snapshot();
        document.getElementById('qa-state').textContent = JSON.stringify({ order: state.names, restOrigin: state.rest.origin, activeSlide: state.activeSlide,
          focused: [state.activeEntry, state.activeField, state.activeValue], saved: state.savedCount, pending: state.acks,
          sets: state.day.workoutSessions[0].exercises.map(e => [e.exerciseId, e.sets.map(s => [s.kg, s.reps, s.done])]) }, null, 0);
      }, 200);
      seed(); window.__ready = true;
    } catch (error) { window.__error = String(error.stack || error); document.getElementById('qa-error').textContent = window.__error; }
    </script></body></html>`;
  return html;
}
