// Admin read repository. Admin views receive plain objects and do not depend on Firebase SDKs.

import {
  db, collection, getDocs, query, where, documentId,
} from './data-core.js';
import { resolvePrivateDataOwnerId } from './shared-account-owner.js';

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function snapshotData(snapshot) {
  const records = [];
  snapshot.forEach((entry) => records.push(entry.data()));
  return records;
}

export async function getAdminAccountRecords() {
  return snapshotData(await getDocs(collection(db, '_accounts')));
}

export async function getAdminSocialSnapshot() {
  const [friendRequests, guestbook, likes, letters, patchnotes] = await Promise.all([
    getDocs(collection(db, '_friend_requests')),
    getDocs(collection(db, '_guestbook')),
    getDocs(collection(db, '_likes')),
    getDocs(collection(db, '_letters')),
    getDocs(collection(db, '_patchnotes')),
  ]);
  return {
    friendRequests: snapshotData(friendRequests),
    guestbook: snapshotData(guestbook),
    likes: snapshotData(likes),
    letters: snapshotData(letters),
    patchnotes: snapshotData(patchnotes),
  };
}

export async function getAdminRecentWorkouts(userId, dateKeys) {
  const ownerId = await resolvePrivateDataOwnerId(userId);
  const workouts = [];
  for (const batch of chunk(dateKeys, 30)) {
    if (!batch.length) continue;
    const snapshot = await getDocs(query(
      collection(db, 'users', ownerId, 'workouts'),
      where(documentId(), 'in', batch),
    ));
    snapshot.forEach((entry) => workouts.push({ dk: entry.id, w: entry.data() }));
  }
  return workouts;
}

export async function getAdminRecentBodyCheckins(userId, dateKeys) {
  const ownerId = await resolvePrivateDataOwnerId(userId);
  const checkins = [];
  for (const batch of chunk(dateKeys, 30)) {
    if (!batch.length) continue;
    const snapshot = await getDocs(query(
      collection(db, 'users', ownerId, 'body_checkins'),
      where('date', 'in', batch),
    ));
    snapshot.forEach((entry) => checkins.push({ id: entry.id, ...entry.data() }));
  }
  return checkins;
}
