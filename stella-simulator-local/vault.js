// Stella prototype - encryption for data kept on the card.
//
//   passphrase --PBKDF2-SHA256 (600,000 rounds, random salt)--> 256-bit key --AES-256-GCM--> every file on the card
//
// Each file is sealed separately with a fresh random IV, and the file's own path is bound in as "additional data", so a
// file copied to another path (or swapped with another patient's) fails to open. A wrong passphrase fails the same way.
// The key exists only in memory while the list is unlocked.
//
// The keyboard firmware would do the same with mbedTLS (PBKDF2 and AES-GCM are both in it); see docs/patient-database-design.md.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const KDF_ITERATIONS = 600000;
export const MIN_PASSPHRASE = 8;

export function cryptoAvailable() {
  return !!(globalThis.crypto && globalThis.crypto.subtle && globalThis.crypto.getRandomValues);
}

function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(text) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function newSalt() { return toB64(crypto.getRandomValues(new Uint8Array(16))); }

export async function deriveKey(passphrase, saltB64, iterations = KDF_ITERATIONS) {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromB64(saltB64), iterations, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** Encrypt any JSON-able value; returns the text to store on the card. */
export async function seal(key, path, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(path) },
    key, enc.encode(JSON.stringify(value)));
  return JSON.stringify({ stella: 1, alg: "AES-256-GCM", iv: toB64(iv), ct: toB64(ct) });
}

/** Decrypt text produced by seal(). Throws if the key, the path or the data is wrong. */
export async function open(key, path, text) {
  const env = JSON.parse(text);
  if (env.stella !== 1) throw new Error("unknown card file format");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(env.iv), additionalData: enc.encode(path) }, key, fromB64(env.ct));
  return JSON.parse(dec.decode(pt));
}
