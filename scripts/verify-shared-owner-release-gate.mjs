// Production deploys are fenced on the shared-account owner registry.
//
// This used to trust a human-set repository variable. That failed both ways: it
// blocked every deploy until someone remembered to set it, and setting it
// asserted nothing a machine had checked. A v1 registry record sat in Firestore
// for days looking "done" while the client still rejected it.
//
// So verify the real thing instead. Read the registry the client reads and
// accept it only if the client's own reader accepts it — importing that reader
// rather than restating its rules, so this gate cannot drift from the code that
// actually decides whether the app boots.
import {
  SHARED_ACCOUNT_OWNER_REGISTRY_COLLECTION,
  SHARED_ACCOUNT_OWNER_REGISTRY_ID,
  SHARED_ACCOUNT_OWNER_REGISTRY_VERSION,
  SHARED_ACCOUNT_OWNER_REGISTRY_STATUS,
  readSharedAccountDataOwnerRegistry,
} from '../data/account-unification.js';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function fail(lines) {
  throw new Error(['shared-account owner release gate is closed', ...lines].join('; '));
}

async function firebaseWebConfig() {
  const config = await readFile(new URL('config.js', root), 'utf8');
  const projectId = config.match(/projectId:\s*"([^"]+)"/)?.[1];
  const apiKey = config.match(/apiKey:\s*"([^"]+)"/)?.[1];
  if (!projectId || !apiKey) fail(['could not read projectId/apiKey from config.js']);
  return { projectId, apiKey };
}

// Firestore's REST value encoding, narrowed to the scalar types this document
// uses. Anything else stays undefined and the client reader rejects the record.
function decodeField(value = {}) {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  return undefined;
}

function decodeDocument(document) {
  return Object.fromEntries(
    Object.entries(document?.fields || {}).map(([key, value]) => [key, decodeField(value)]),
  );
}

async function fetchRegistry() {
  const { projectId, apiKey } = await firebaseWebConfig();
  const path = `${SHARED_ACCOUNT_OWNER_REGISTRY_COLLECTION}/${SHARED_ACCOUNT_OWNER_REGISTRY_ID}`;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}?key=${apiKey}`;

  let lastError = null;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      if (response.status === 404) {
        fail([
          `registry ${path} does not exist`,
          'the shared account cannot boot without it',
          'run functions/ npm run initialize:tomato-owner to decide the owner',
        ]);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { document: decodeDocument(await response.json()), path };
    } catch (error) {
      // A closed gate must never be opened by a flaky network. Retry, then fail.
      if (error.message.startsWith('shared-account owner release gate')) throw error;
      lastError = error;
      if (attempt < RETRIES) await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  fail([`could not read the registry after ${RETRIES} attempts`, String(lastError?.message || lastError)]);
}

const { document, path } = await fetchRegistry();
const ownerId = readSharedAccountDataOwnerRegistry(document);

if (!ownerId) {
  fail([
    `registry ${path} exists but the client rejects it`,
    `found version=${document.version ?? '(absent)'} status=${JSON.stringify(document.status ?? null)} ownerId=${JSON.stringify(document.ownerId ?? null)}`,
    `client requires version>=${SHARED_ACCOUNT_OWNER_REGISTRY_VERSION} and status="${SHARED_ACCOUNT_OWNER_REGISTRY_STATUS}"`,
    'deploying now would leave the shared account stuck on the loading overlay',
    'run functions/ npm run promote:tomato-owner-v2 -- --commit to upgrade the record',
  ]);
}

console.log(`[shared-owner-release-gate] ok owner=${ownerId} version=${document.version} status=${document.status}`);
