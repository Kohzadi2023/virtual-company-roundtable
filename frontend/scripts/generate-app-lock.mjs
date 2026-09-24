// Computes the same salt+verifier pair that
// src/lib/workspaceSuite.ts's pinVerifier() produces at runtime, so a PIN can
// be baked in as a build-time default (VITE_DEFAULT_APP_LOCK_SALT /
// VITE_DEFAULT_APP_LOCK_VERIFIER) without ever storing the PIN itself.
//
// Usage: APP_LOCK_PIN=12345678 node scripts/generate-app-lock.mjs
// Prints two lines: SALT=<base64> and VERIFIER=<base64>. Never commit the PIN
// or these values to source control outside of CI secret/output plumbing.

import { webcrypto as crypto } from 'node:crypto';

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

async function pinVerifier(pin, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 180000, hash: 'SHA-256' },
    material,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

const pin = process.env.APP_LOCK_PIN;
if (!pin || !/^\d{4,12}$/.test(pin)) {
  console.error('Set APP_LOCK_PIN to a 4-12 digit PIN before running this script.');
  process.exit(1);
}

const salt = crypto.getRandomValues(new Uint8Array(16));
const verifier = await pinVerifier(pin, salt);

console.log(`SALT=${bytesToBase64(salt)}`);
console.log(`VERIFIER=${verifier}`);
