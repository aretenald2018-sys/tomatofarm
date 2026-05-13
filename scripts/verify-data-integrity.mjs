import { initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore } from 'firebase/firestore';

import { CONFIG } from '../config.js';
import {
  DIET_PAYLOAD_KEYS,
  SHARED_PAYLOAD_KEYS,
  WORKOUT_PAYLOAD_KEYS,
} from '../workout/save-schema.js';

const target = String(process.argv[2] || '김_태우').trim();
const daysLimit = Math.max(1, Math.min(120, Number(process.argv[3]) || 60));

function accountText(account = {}) {
  return [
    account.id,
    account.nickname,
    `${account.lastName || ''}${account.firstName || ''}`,
    account.firstName,
    account.lastName,
  ].filter(Boolean).join(' ');
}

function hasNameSignal(account = {}) {
  const text = accountText(account).replace(/\s+/g, '');
  return text.includes('문정토마토') || text.includes('김태우') || account.id === '김_태우';
}

function keyContractAudit() {
  const workout = new Set(WORKOUT_PAYLOAD_KEYS);
  const diet = new Set(DIET_PAYLOAD_KEYS);
  const shared = new Set(SHARED_PAYLOAD_KEYS);
  const intersection = new Set([...workout].filter((key) => diet.has(key)));
  const unexpectedShared = [...intersection].filter((key) => !shared.has(key));
  const missingShared = [...shared].filter((key) => !intersection.has(key));
  return {
    workoutKeyCount: workout.size,
    dietKeyCount: diet.size,
    sharedKeyCount: shared.size,
    intersectionCount: intersection.size,
    unexpectedShared,
    missingShared,
    ok: unexpectedShared.length === 0 && missingShared.length === 0,
  };
}

function pushIssue(state, code, detail, context = {}) {
  state.issueCounts[code] = (state.issueCounts[code] || 0) + 1;
  if (state.samples.length < 25) {
    state.samples.push({ code, detail, ...context });
  }
}

function inspectSet(state, set, context) {
  if (!set || typeof set !== 'object') {
    pushIssue(state, 'invalid_set_shape', 'set is not an object', context);
    return;
  }
  if (!set.setType) {
    pushIssue(state, 'missing_set_type', 'setType is missing', context);
  }
  if (Object.prototype.hasOwnProperty.call(set, 'rom')) {
    pushIssue(state, 'legacy_rom_field', 'legacy rom field exists (use romPct)', context);
  }
  if (Object.prototype.hasOwnProperty.call(set, 'romPct')) {
    const romPct = Number(set.romPct);
    if (!Number.isFinite(romPct) || romPct < 0 || romPct > 100) {
      pushIssue(state, 'invalid_rom_pct', `romPct out of range: ${set.romPct}`, context);
    }
  }
  if (Object.prototype.hasOwnProperty.call(set, 'rpe')) {
    const rpe = Number(set.rpe);
    if (!Number.isFinite(rpe) || rpe < 0 || rpe > 10) {
      pushIssue(state, 'invalid_rpe', `rpe out of range: ${set.rpe}`, context);
    }
  }
}

function inspectWorkoutDay(state, day, context) {
  if (!day || typeof day !== 'object') {
    pushIssue(state, 'invalid_day_shape', 'workout doc is not an object', context);
    return;
  }

  if (day.exercises != null && !Array.isArray(day.exercises)) {
    pushIssue(state, 'invalid_exercises_shape', 'exercises is not an array', context);
  }

  const exercises = Array.isArray(day.exercises) ? day.exercises : [];
  exercises.forEach((entry, entryIndex) => {
    if (!entry || typeof entry !== 'object') {
      pushIssue(state, 'invalid_exercise_entry', 'exercise entry is not an object', { ...context, entryIndex });
      return;
    }
    if (!entry.exerciseId) {
      pushIssue(state, 'missing_exercise_id', 'exerciseId is missing', { ...context, entryIndex });
    }
    if (!Array.isArray(entry.sets)) {
      pushIssue(state, 'invalid_sets_shape', 'sets is not an array', { ...context, entryIndex });
      return;
    }
    entry.sets.forEach((set, setIndex) => {
      state.totalSets += 1;
      inspectSet(state, set, { ...context, entryIndex, setIndex });
    });
  });
}

async function readUserCollection(db, userId, collectionName) {
  const snap = await getDocs(collection(db, 'users', userId, collectionName));
  const out = [];
  snap.forEach((docSnap) => out.push({ id: docSnap.id, ...docSnap.data() }));
  return out;
}

const app = initializeApp(CONFIG.FIREBASE);
const db = getFirestore(app);

const contract = keyContractAudit();
if (!contract.ok) {
  console.error('[integrity] save schema contract failed:', JSON.stringify(contract, null, 2));
  process.exit(2);
}

const accountsSnap = await getDocs(collection(db, '_accounts'));
const accounts = accountsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

const matched = accounts.filter((account) => {
  if (target === '*') return hasNameSignal(account);
  return accountText(account).includes(target);
});

if (!matched.length) {
  console.error(`[integrity] no account matched target="${target}"`);
  process.exit(1);
}

const report = {
  target,
  daysLimit,
  checkedAt: new Date().toISOString(),
  contract,
  accounts: [],
  issueCounts: {},
  totalDocs: 0,
  totalSets: 0,
  samples: [],
};

for (const account of matched) {
  const workouts = await readUserCollection(db, account.id, 'workouts');
  const recent = workouts
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.id))
    .sort((a, b) => b.id.localeCompare(a.id))
    .slice(0, daysLimit);

  const local = {
    id: account.id,
    nickname: account.nickname || `${account.lastName || ''}${account.firstName || ''}`,
    docs: recent.length,
    issues: 0,
  };

  const accountState = {
    issueCounts: {},
    samples: [],
    totalSets: 0,
  };

  for (const day of recent) {
    inspectWorkoutDay(accountState, day, { accountId: account.id, date: day.id });
  }

  local.issues = Object.values(accountState.issueCounts).reduce((sum, value) => sum + value, 0);
  local.issueCounts = accountState.issueCounts;
  local.totalSets = accountState.totalSets;
  report.accounts.push(local);

  report.totalDocs += recent.length;
  report.totalSets += accountState.totalSets;
  for (const [code, count] of Object.entries(accountState.issueCounts)) {
    report.issueCounts[code] = (report.issueCounts[code] || 0) + count;
  }
  for (const sample of accountState.samples) {
    if (report.samples.length >= 25) break;
    report.samples.push(sample);
  }
}

const totalIssues = Object.values(report.issueCounts).reduce((sum, value) => sum + value, 0);
const verdict = totalIssues === 0 ? 'resolved' : 'needs_attention';
report.verdict = verdict;
report.totalIssues = totalIssues;

console.log(JSON.stringify(report, null, 2));
if (totalIssues > 0) process.exit(2);
