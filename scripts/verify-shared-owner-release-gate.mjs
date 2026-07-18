const EXPECTED_GATE = 'decided-v2-rules-fenced';
const actualGate = String(process.env.TOMATO_SHARED_OWNER_V2_READY || '').trim();

if (actualGate !== EXPECTED_GATE) {
  throw new Error([
    'shared-account SSOT release gate is closed',
    'export and preserve the production Firestore rules first',
    'deploy rules that deny both shared private aliases while the registry is absent',
    'run the privileged decided-v2 owner initializer, then deploy Functions',
    `set TOMATO_SHARED_OWNER_V2_READY=${EXPECTED_GATE} only after those checks pass`,
  ].join('; '));
}

console.log(`[shared-owner-release-gate] ok ${EXPECTED_GATE}`);
