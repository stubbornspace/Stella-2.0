// Stella prototype - patient list, session history and audit log, kept on the (emulated) SD card.
//
// A small "database" of JSON files. Two modes, recorded in meta.json ("encrypted"):
//   plain      (the current default) every file is readable JSON text; no passphrase, nothing to unlock
//   encrypted  vault.js seals every file with a passphrase-derived key (AES-256-GCM, bound to the file's own path)
// Lists made by the first version of this code are encrypted and still open with their passphrase.
//
//   stella/meta.json              always plain: format version, "encrypted", and (encrypted only) key-derivation settings,
//                                 a passphrase check and the failed-attempt counter
//   stella/patients.db            { patients: [ { id, name, created_at, session_count, last_session_at } ] }
//   stella/history/<ID>.db        { patient_id, sessions: [ { record_id, saved_at, config, summary } ] }
//                                 config = the exercise settings the session ran with (so it can be repeated);
//                                 summary = the engine's results object (which also holds a copy of the settings)
//   stella/events/<record_id>.db  [ ...raw events of that session ]
//   stella/audit.db               [ { ts, action, patient?, detail? } ]                              newest last, capped
//
// Names exist ONLY in patients.db. History, events, exports and the audit log refer to a patient by ID alone, so moving the
// names somewhere else later (for example into the clinician's app) touches one file. File names contain the patient ID.

import { KDF_ITERATIONS, MIN_PASSPHRASE, cryptoAvailable, deriveKey, newSalt, open, seal } from "./vault.js";

const ROOT = "stella";
export const FILES = {
  meta: `${ROOT}/meta.json`,
  patients: `${ROOT}/patients.db`,
  audit: `${ROOT}/audit.db`,
  history: (id) => `${ROOT}/history/${id}.db`,
  events: (rid) => `${ROOT}/events/${rid}.db`,
};

export const ID_RE = /^[A-Z0-9][A-Z0-9-]{0,31}$/;     // clinic-assigned code, as in the `participant` field (<= 32 chars)
export const NAME_MAX = 60;
const AUDIT_MAX = 2000;
const FREE_ATTEMPTS = 5;                              // wrong passphrases before the delays start

/** The settings a saved session ran with. Older records (before `config` was stored) only have them inside the summary. */
export function recordConfig(rec) {
  return rec.config || (rec.summary && rec.summary.settings) || null;
}

export class DbError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** "Jane Q. Smith" -> "J.S." - what is shown while a name is hidden. */
export function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const pick = (w) => (w.match(/[A-Za-z]/) || [w[0]])[0].toUpperCase() + ".";
  return parts.length === 1 ? pick(parts[0]) : pick(parts[0]) + pick(parts[parts.length - 1]);
}

export class PatientDb {
  constructor(card) {
    this.card = card;
    this.meta = null;       // plain meta.json, or null when the card has no patient list yet
    this.key = null;        // AES key, only while an encrypted list is unlocked
    this.data = null;       // patients.db, decoded
    this._chain = Promise.resolve();
  }

  /** Run read-modify-write jobs one at a time, so two quick actions can never overwrite each other's changes. */
  _serial(fn) {
    const run = this._chain.then(fn, fn);
    this._chain = run.catch(() => {});
    return run;
  }

  // ---------------------------------------------------------------- state
  async load() {
    const t = await this.card.read(FILES.meta);
    this.meta = t ? JSON.parse(t) : null;
    this.key = null; this.data = null;
    if (this.meta && !this.encrypted) this.data = (await this._readSealed(FILES.patients)) || { schema: 1, patients: [] };
    return this.exists;
  }
  get exists() { return !!this.meta; }
  /** Lists made before the plain mode existed have no "encrypted" field and are encrypted. */
  get encrypted() { return !!this.meta && this.meta.encrypted !== false; }
  /** A plain list is open as soon as it is loaded; an encrypted one needs unlock(). */
  get unlocked() { return this.encrypted ? !!this.key : !!this.data; }

  _need() { if (!this.unlocked) throw new DbError("locked", "The patient list is locked."); }
  // (names kept from the encrypted-only version: "sealed" = encoded for the card, "plain" = JSON text)
  async _writeSealed(path, value) {
    await this.card.write(path, this.encrypted ? await seal(this.key, path, value) : JSON.stringify(value, null, 2));
  }
  async _readSealed(path) {
    const t = await this.card.read(path);
    if (t == null) return null;
    return this.encrypted ? open(this.key, path, t) : JSON.parse(t);
  }
  async _writeMeta() { await this.card.write(FILES.meta, JSON.stringify(this.meta, null, 2)); }

  // ---------------------------------------------------------------- set up / unlock / lock
  /** Make an empty, unencrypted list. */
  async createPlain() {
    if (this.exists) throw new DbError("exists", "A patient list already exists on this card.");
    this.meta = { schema: 1, encrypted: false, created_at: new Date().toISOString() };
    this.key = null;
    this.data = { schema: 1, patients: [] };
    await this._writeMeta();
    await this._writeSealed(FILES.patients, this.data);
    await this._writeSealed(FILES.audit, []);
    await this.audit("list_created", { detail: "unencrypted" });
  }

  /** Make an empty list encrypted with `passphrase`. */
  async create(passphrase) {
    if (!cryptoAvailable()) throw new DbError("nocrypto", "Secure storage needs a secure page (https or localhost).");
    if (String(passphrase).length < MIN_PASSPHRASE) throw new DbError("weak", `Use at least ${MIN_PASSPHRASE} characters.`);
    if (this.exists) throw new DbError("exists", "A patient list already exists on this card.");
    const salt = newSalt();
    const key = await deriveKey(passphrase, salt);
    this.meta = {
      schema: 1, encrypted: true, created_at: new Date().toISOString(),
      kdf: { alg: "PBKDF2-SHA256", iterations: KDF_ITERATIONS, salt },
      check: await seal(key, FILES.meta + "#check", { ok: "STELLA" }),
      failed_attempts: 0, last_failed_at: 0,
    };
    this.key = key;
    this.data = { schema: 1, patients: [] };
    await this._writeMeta();
    await this._writeSealed(FILES.patients, this.data);
    await this._writeSealed(FILES.audit, []);
    await this.audit("list_created");
  }

  /** Seconds the user must still wait before another passphrase try (0 = none). */
  lockoutSeconds() {
    const f = this.meta?.failed_attempts || 0;
    if (f < FREE_ATTEMPTS) return 0;
    const wait = Math.min(300, 15 * (f - FREE_ATTEMPTS + 1));
    return Math.max(0, Math.ceil((this.meta.last_failed_at + wait * 1000 - Date.now()) / 1000));
  }

  /** true = unlocked, false = wrong passphrase. Throws DbError("wait") during a lock-out. */
  async unlock(passphrase) {
    if (!this.exists) throw new DbError("none", "There is no patient list on this card yet.");
    if (!this.encrypted) return true;
    const wait = this.lockoutSeconds();
    if (wait > 0) throw new DbError("wait", `Too many wrong passphrases. Try again in ${wait} s.`);
    const key = await deriveKey(passphrase, this.meta.kdf.salt, this.meta.kdf.iterations);
    try {
      await open(key, FILES.meta + "#check", this.meta.check);
    } catch {
      this.meta.failed_attempts = (this.meta.failed_attempts || 0) + 1;
      this.meta.last_failed_at = Date.now();
      await this._writeMeta();
      return false;
    }
    const before = this.meta.failed_attempts || 0;
    this.key = key;
    this.data = await this._readSealed(FILES.patients) || { schema: 1, patients: [] };
    if (before) { this.meta.failed_attempts = 0; this.meta.last_failed_at = 0; await this._writeMeta(); }
    await this.audit("unlocked", { detail: before ? `after ${before} wrong attempt(s)` : undefined });
    return true;
  }

  /** Forget the key and everything decrypted. Safe to call when already locked. */
  async lock(reason = "manual") {
    if (!this.encrypted) return;                        // nothing to lock: a plain list stays open
    if (this.key) { try { await this.audit("locked", { detail: reason }); } catch { /* still lock */ } }
    this.key = null;
    this.data = null;
  }

  /** Delete every file of the patient list. The caller must have confirmed with the user. */
  async erase() {
    for (const f of await this.card.list(ROOT + "/")) await this.card.remove(f.path);
    this.meta = null; this.key = null; this.data = null;
  }

  // ---------------------------------------------------------------- patients
  listPatients() {
    this._need();
    return this.data.patients.map((p) => ({ ...p }));
  }
  getPatient(id) {
    this._need();
    const p = this.data.patients.find((x) => x.id === id);
    return p ? { ...p } : null;
  }
  /** Next free "PT-0001"-style code. */
  suggestId() {
    this._need();
    let max = 0;
    for (const p of this.data.patients) {
      const m = /^PT-(\d+)$/.exec(p.id);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return "PT-" + String(max + 1).padStart(4, "0");
  }
  validate({ id, name }) {
    const cleanId = String(id || "").trim().toUpperCase();
    const cleanName = String(name || "").replace(/\s+/g, " ").trim();
    if (!cleanName) return { error: "Enter the patient's name." };
    if (cleanName.length > NAME_MAX) return { error: `Names can be up to ${NAME_MAX} characters.` };
    if (!cleanId) return { error: "Enter a patient ID." };
    if (!ID_RE.test(cleanId)) return { error: "IDs use letters, digits and hyphens only (up to 32), e.g. PT-0004." };
    if (this.data.patients.some((p) => p.id === cleanId)) return { error: `${cleanId} is already in use.` };
    return { id: cleanId, name: cleanName };
  }
  addPatient(input) {
    return this._serial(async () => {
      this._need();
      const v = this.validate(input);
      if (v.error) throw new DbError("invalid", v.error);
      const p = { id: v.id, name: v.name, created_at: new Date().toISOString(), session_count: 0, last_session_at: null };
      this.data.patients.push(p);
      await this._writeSealed(FILES.patients, this.data);
      await this._audit("patient_added", { patient: p.id });
      return { ...p };
    });
  }

  // ---------------------------------------------------------------- history
  async getHistory(id) {
    this._need();
    const h = await this._readSealed(FILES.history(id));
    return h ? h.sessions.slice().reverse() : [];            // newest first
  }
  /** Save a finished session. Returns the new record id. */
  saveSession(id, summary, events, config) {
    return this._serial(async () => {
      this._need();
      const p = this.data.patients.find((x) => x.id === id);
      if (!p) throw new DbError("nopatient", "Unknown patient.");
      const rid = `${id}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      const now = new Date().toISOString();
      const hist = await this._readSealed(FILES.history(id)) || { schema: 1, patient_id: id, sessions: [] };
      hist.sessions.push({ record_id: rid, saved_at: now, config: config || summary.settings || null, summary });
      await this._writeSealed(FILES.events(rid), events || []);      // events first: a history entry never points at nothing
      await this._writeSealed(FILES.history(id), hist);
      p.session_count = hist.sessions.length;
      p.last_session_at = now;
      await this._writeSealed(FILES.patients, this.data);
      await this._audit("session_saved", { patient: id, detail: summary.session_id });
      return rid;
    });
  }
  async loadEvents(recordId) {
    this._need();
    return (await this._readSealed(FILES.events(recordId))) || [];
  }

  // ---------------------------------------------------------------- audit log (IDs only, never names)
  audit(action, opts) { return this._serial(() => this._audit(action, opts)); }
  async _audit(action, { patient, detail } = {}) {
    if (!this.unlocked) return;
    const log = (await this._readSealed(FILES.audit)) || [];
    const e = { ts: new Date().toISOString(), action };
    if (patient) e.patient = patient;
    if (detail) e.detail = detail;
    log.push(e);
    await this._writeSealed(FILES.audit, log.slice(-AUDIT_MAX));
  }
  async readAudit(limit = 100) {
    this._need();
    const log = (await this._readSealed(FILES.audit)) || [];
    return log.slice(-limit).reverse();
  }

  // ---------------------------------------------------------------- card info (for the footer)
  async usage() {
    const files = await this.card.list(ROOT + "/");
    return { files: files.length, bytes: files.reduce((n, f) => n + (f.size || 0), 0) };
  }
}
