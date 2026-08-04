/**
 * Verdix smoke-test script
 * Runs a full happy-path flow against the live Bradbury contract:
 *   open_case → submit_deliverable → ratify_delivery
 *
 * Run from frontend/ directory:
 *   node test-txns.mjs
 */

import { createAccount, createClient } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';

// ── Config ────────────────────────────────────────────────────────────────────
const PRIVATE_KEY       = '0x865c6773bcd46f894a56092ca318c2d4931d49ed8e60ddc4c8a709b67683e699';
const CONTRACT_ADDRESS  = '0xe233eFD3080e14773D61C65A5faeA475A50741E8';
const EXPLORER          = 'https://explorer-bradbury.genlayer.com';
const ONE_GEN           = BigInt('1000000000000000000');

// Use a distinct contractor address (dead address — smoke test only)
const CONTRACTOR = '0x000000000000000000000000000000000000dEaD';

// ── Client ────────────────────────────────────────────────────────────────────
const account = createAccount(PRIVATE_KEY);
const client  = createClient({ chain: testnetBradbury, account });

console.log(`\n⬡  Verdix Smoke Test`);
console.log(`   Contract : ${CONTRACT_ADDRESS}`);
console.log(`   Wallet   : ${account.address}`);
console.log(`   Explorer : ${EXPLORER}\n`);

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_LABELS = {
  1: 'PENDING', 2: 'PROPOSING', 3: 'COMMITTING', 4: 'REVEALING',
  5: 'ACCEPTED', 6: 'UNDETERMINED', 7: 'FINALIZED',
  8: 'CANCELED', 12: 'VALIDATORS_TIMEOUT', 13: 'LEADER_TIMEOUT',
};
const TERMINAL = new Set(['ACCEPTED','FINALIZED','UNDETERMINED','CANCELED']);

const normalise = v => {
  if (v instanceof Map) {
    const o = {};
    for (const [k, val] of v.entries()) o[String(k)] = normalise(val);
    return o;
  }
  if (Array.isArray(v)) return v.map(normalise);
  if (typeof v === 'bigint') return v.toString();
  return v;
};

async function pollTx(hash, label) {
  console.log(`   ↳ ${label}`);
  console.log(`     tx: ${EXPLORER}/tx/${hash}`);
  let last = '';
  for (let i = 0; i < 120; i++) {
    const tx     = await client.getTransaction({ hash }).catch(() => null);
    const code   = tx?.status ?? tx?.get?.('status');
    const status = STATUS_LABELS[Number(code)] ?? 'PENDING';
    if (status !== last) {
      console.log(`     status → ${status}`);
      last = status;
    }
    if (TERMINAL.has(status)) {
      const ok = status === 'ACCEPTED' || status === 'FINALIZED';
      console.log(`     ${ok ? '✓ CONFIRMED' : '✗ FAILED'}\n`);
      return ok;
    }
    await new Promise(r => setTimeout(r, 8000));
  }
  console.log('     ✗ TIMEOUT\n');
  return false;
}

async function read(fn, args) {
  return normalise(
    await client.readContract({ address: CONTRACT_ADDRESS, functionName: fn, args })
  );
}

async function write(fn, args, value = 0n) {
  return client.writeContract({ address: CONTRACT_ADDRESS, functionName: fn, args, value });
}

// ── Test flow ─────────────────────────────────────────────────────────────────
async function run() {

  // 0. Docket before
  const before = await read('get_docket', []).catch(() => null);
  if (before) {
    console.log('── Docket (before) ─────────────────────────────────────────');
    console.log(`   Total filed  : ${before.total_filed}`);
    console.log(`   Open disputes: ${before.open_disputes}`);
    console.log(`   Closed cases : ${before.closed_cases}\n`);
  }

  // 1. open_case
  console.log('── Step 1: open_case (lock 1 GEN) ─────────────────────────────');
  const nowTs = Math.floor(Date.now() / 1000);
  const dueTs = nowTs + 7 * 86400;

  let hash = await write(
    'open_case',
    [
      CONTRACTOR,
      'Smoke Test: Full Contract Integration Check',
      'Verify all three primary write methods execute correctly in sequence: ' +
      'open_case locks funds, submit_deliverable transitions to DELIVERED status, ' +
      'and ratify_delivery releases funds and transitions to AWARDED status.',
      dueTs,
      nowTs,
    ],
    ONE_GEN,
  );
  let ok = await pollTx(hash, 'open_case');
  if (!ok) { console.error('open_case failed'); process.exit(1); }

  // 2. Read case ID
  console.log('── Step 2: fetch newly created case ────────────────────────────');
  const cases  = await read('get_cases', [0, 5]).catch(() => []);
  const newest = Array.isArray(cases) ? cases[0] : null;
  const caseId = newest?.id ?? 'VX-00000';
  console.log(`   Case ID  : ${caseId}`);
  console.log(`   Status   : ${newest?.status ?? '?'}`);
  console.log(`   Locked   : ${newest?.locked ?? '?'} wei`);
  console.log(`   Client   : ${newest?.client ?? '?'}\n`);

  // 3. submit_deliverable
  console.log('── Step 3: submit_deliverable ──────────────────────────────────');
  hash = await write(
    'submit_deliverable',
    [
      caseId,
      'Smoke-test delivery confirmed. Contract live at ' + CONTRACT_ADDRESS +
      ' on Bradbury testnet. All methods respond correctly. ' +
      'Frontend integration verified. This message is the deliverable.',
    ],
    0n,
  );
  ok = await pollTx(hash, 'submit_deliverable');
  if (!ok) { console.error('submit_deliverable failed'); process.exit(1); }

  // 4. ratify_delivery
  console.log('── Step 4: ratify_delivery (release funds) ─────────────────────');
  hash = await write('ratify_delivery', [caseId], 0n);
  ok   = await pollTx(hash, 'ratify_delivery');
  if (!ok) { console.error('ratify_delivery failed'); process.exit(1); }

  // 5. Verify final state
  console.log('── Step 5: verify final case state ─────────────────────────────');
  const fc = await read('get_case', [caseId]).catch(() => null);
  console.log(`   Status      : ${fc?.status}`);
  console.log(`   Deliverable : ${String(fc?.deliverable ?? '').slice(0, 72)}…\n`);

  // 6. Docket after
  const after = await read('get_docket', []).catch(() => null);
  if (after) {
    console.log('── Docket (after) ──────────────────────────────────────────');
    console.log(`   Total filed  : ${after.total_filed}`);
    console.log(`   Open disputes: ${after.open_disputes}`);
    console.log(`   Closed cases : ${after.closed_cases}\n`);
  }

  if (fc?.status === 'AWARDED') {
    console.log('✅  Smoke test PASSED — Verdix is live and fully functional.');
  } else {
    console.log(`⚠️  Final status "${fc?.status}" — expected AWARDED. Check explorer.`);
  }
  console.log(`\n   ${EXPLORER}/address/${CONTRACT_ADDRESS}\n`);
}

run().catch(err => { console.error('\n✗ Fatal:', err.message ?? err); process.exit(1); });
