// Card order is independent of set order. Card membership comes from the same
// slide model as the renderer, so a superset is always moved as one unit.
function validIndex(value, length) {
  return Number.isInteger(value) && value >= 0 && value < length;
}

export function moveWorkoutExerciseCard(exercises, cardIndexes, exerciseIndex, direction) {
  const unchanged = { changed: false, reason: 'invalid-order' };
  if (!Array.isArray(exercises) || !Array.isArray(cardIndexes)) return unchanged;
  if (!validIndex(exerciseIndex, exercises.length) || ![-1, 1].includes(direction)) return unchanged;
  const seen = new Set();
  if (!cardIndexes.every(indexes => Array.isArray(indexes) && indexes.length && indexes.every(index => {
    if (!validIndex(index, exercises.length) || seen.has(index)) return false;
    seen.add(index);
    return true;
  }))) return unchanged;
  const sourceCardIndex = cardIndexes.findIndex(indexes => indexes.includes(exerciseIndex));
  const targetCardIndex = sourceCardIndex + direction;
  if (sourceCardIndex < 0 || targetCardIndex < 0 || targetCardIndex >= cardIndexes.length) {
    return { changed: false, reason: 'out-of-range' };
  }
  const cards = cardIndexes.map(indexes => [...indexes]);
  const [moved] = cards.splice(sourceCardIndex, 1);
  cards.splice(targetCardIndex, 0, moved);
  // Entries not represented by visible cards retain their slots. Never filter
  // or reconstruct exercise/set payloads: unknown fields and all set metadata
  // must survive this presentation-only structural change.
  const slots = [...seen].sort((a, b) => a - b);
  const orderedIndexes = cards.flat();
  const next = [...exercises];
  const entryIndexMap = exercises.map((_, index) => index);
  orderedIndexes.forEach((oldIndex, position) => {
    const nextIndex = slots[position];
    next[nextIndex] = exercises[oldIndex];
    entryIndexMap[oldIndex] = nextIndex;
  });
  const rowIndexMap = slots.map(oldIndex => orderedIndexes.indexOf(oldIndex));
  return { changed: true, exercises: next, entryIndexMap, rowIndexMap, sourceCardIndex, targetCardIndex };
}

export function remapWorkoutExercisePositionKey(value, dateKey, sessionIndex, entryIndexMap, rowIndexMap = entryIndexMap) {
  if (typeof value !== 'string') return value;
  const entryPrefix = `${dateKey}:${sessionIndex}:`;
  const cardPrefix = `ex:${entryPrefix}`;
  const prefix = value.startsWith(cardPrefix) ? cardPrefix : entryPrefix;
  if (!value.startsWith(prefix)) return value;
  const tail = value.slice(prefix.length);
  const [rawIndex, ...suffix] = tail.split(':');
  if (!/^\d+$/.test(rawIndex)) return value;
  const map = prefix === cardPrefix ? rowIndexMap : entryIndexMap;
  const mapped = map[Number(rawIndex)];
  if (!Number.isInteger(mapped)) return value;
  return `${prefix}${[mapped, ...suffix].join(':')}`;
}

export function remapWorkoutRestOrigin(origin, entryIndexMap) {
  if (!origin || !Number.isInteger(origin.entryIdx)) return origin;
  const entryIdx = entryIndexMap[origin.entryIdx];
  return Number.isInteger(entryIdx) ? { ...origin, entryIdx } : origin;
}

// Legacy day-level rest summaries may have indexes from a filtered save. Match
// the actual rest start instead of assuming those indexes belong to this session.
export function remapWorkoutRestRecords(records, exercises) {
  if (!Array.isArray(records)) return records;
  return records.map(record => {
    if (!record?.startedAt) return record;
    const matches = [];
    exercises.forEach((entry, entryIdx) => {
      if ((entry?.exerciseId || null) !== (record.exerciseId || null)) return;
      (Array.isArray(entry?.sets) ? entry.sets : []).forEach((set, setIdx) => {
        if (set?.restStartedAt === record.startedAt) matches.push({ entryIdx, setIdx, setNumber: setIdx + 1 });
      });
    });
    return matches.length === 1 ? { ...record, ...matches[0] } : record;
  });
}
