// Stella prototype - the start page: set up / unlock the patient list, pick a patient, add a patient, or enter demo mode.
//
// Privacy behaviour (see docs/patient-database-design.md):
//   - (only when `encrypt` is on - it is off for now) the list is encrypted and needs the passphrase every time the app is
//     opened or auto-locks. With it off the list is plain JSON on the card and opens straight away
//   - names are hidden (initials only) until the clinician presses Show; they hide again after 15 s, when the tab is hidden,
//     and whenever the list locks
//   - names are never put in the page title, the URL, the console, session logs, results or exports - those use the patient ID
//   - every unlock, lock, reveal, patient added/opened and session saved is written to the access log (IDs only)

import { MIN_PASSPHRASE, cryptoAvailable } from "./vault.js";
import { DbError, NAME_MAX, initials } from "./patients.js";

const REVEAL_MS = 15000;

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function when(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + " " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export class StartScreen {
  constructor({ el, db, card, onPatient, onDemo, idleMinutes, encrypt = false }) {
    this.el = el; this.db = db; this.card = card; this.encrypt = encrypt;
    this.onPatient = onPatient; this.onDemo = onDemo; this.idleMinutes = idleMinutes;
    this.revealed = new Map();      // patient id -> timer that hides the name again
    this.notice = "";               // one-off message above the card (e.g. "locked after 5 minutes")
    this.adding = false;
    this.showAudit = false;
    this.query = "";
    this.highlight = "";            // id of the patient just added
    this.busy = "";
    this.error = "";
    this.fatal = "";
  }

  async init() {
    try {
      await this.db.load();
      if (!this.db.exists && !this.encrypt) await this.db.createPlain();
    } catch (e) { this.fatal = "The card could not be read: " + e.message; }
    this.render();
  }

  show(notice = "") {
    this.notice = notice; this.adding = false; this.showAudit = false; this.query = ""; this.error = "";
    document.body.dataset.screen = "start";
    this.render();
  }

  async lock(reason = "manual") {
    this.maskAll(false);
    await this.db.lock(reason);                     // does nothing for a plain list
    this.show(reason === "idle" ? `Locked after ${this.idleMinutes} minutes without activity.` : "");
  }

  // ---------------------------------------------------------------- name hiding
  maskAll(redraw = true) {
    for (const t of this.revealed.values()) clearTimeout(t);
    this.revealed.clear();
    if (redraw && this.db.unlocked) this.renderRows();
  }
  reveal(id) {
    clearTimeout(this.revealed.get(id));
    this.revealed.set(id, setTimeout(() => { this.revealed.delete(id); this.renderRows(); }, REVEAL_MS));
    this.db.audit("name_shown", { patient: id });
    this.renderRows();
  }
  hide(id) {
    clearTimeout(this.revealed.get(id));
    this.revealed.delete(id);
    this.renderRows();
  }

  // ---------------------------------------------------------------- drawing
  render() {
    const db = this.db;
    let body;
    if (this.fatal) body = `<h1>Patient list unavailable</h1><p class="err" role="alert">${esc(this.fatal)}</p>`;
    else if ((db.encrypted || (!db.exists && this.encrypt)) && !cryptoAvailable()) {
      body = `<h1>Patient list unavailable</h1>
        <p>Secure storage needs a secure page (https or localhost). Demo mode still works.</p>`;
    } else if (!db.exists) body = this.setupHtml();
    else if (!db.unlocked) body = this.lockedHtml();
    else body = this.listHtml();

    this.el.innerHTML = `
      <header class="start-head">
        <div class="brand">Stella</div>
        ${db.unlocked && db.encrypted ? `<button class="btn" id="lockNow">Lock</button>` : ""}
      </header>
      <main class="start-main">
        <section class="demo-bar" aria-label="Demo mode">
          <div><strong>Demo mode</strong><span>Try the keyboard without a patient. Nothing is saved.</span></div>
          <button class="btn-demo" id="demoBtn">Enter demo mode</button>
        </section>
        ${this.notice ? `<p class="start-notice" role="status">${esc(this.notice)}</p>` : ""}
        <section class="card start-card">${body}</section>
        ${this.safeguardsHtml()}
        <footer class="start-foot" id="startFoot">${esc(this.card.label)}${this.card.persistent ? "" : " - data is lost on reload"}
          &middot; ${db.exists && !db.encrypted ? "Stored unencrypted for now." : ""} Prototype: use fictitious names only.<span id="footUse"></span></footer>
      </main>`;
    this.bind();
    if (db.unlocked) this.renderRows();
    this.fillFooter();
  }

  async fillFooter() {
    try {
      const u = await this.db.usage();
      const f = this.el.querySelector("#footUse");
      if (f && u.files) f.textContent = ` · ${u.files} file${u.files === 1 ? "" : "s"}, ${(u.bytes / 1024).toFixed(1)} KB`;
    } catch { /* footer only */ }
  }

  setupHtml() {
    return `
      <h1>Set up the patient list</h1>
      <p>Patient names and session history are kept on the SD card, encrypted with a passphrase you choose.
        You will enter it each time the app is opened or locks.</p>
      <div class="field"><label class="label" for="pp1">Passphrase (at least ${MIN_PASSPHRASE} characters)</label>
        <input class="text-input" id="pp1" type="password" autocomplete="new-password"></div>
      <div class="field"><label class="label" for="pp2">Repeat passphrase</label>
        <input class="text-input" id="pp2" type="password" autocomplete="new-password"></div>
      <p class="warn">There is no way to recover a forgotten passphrase. The only way back in is to erase the list.</p>
      <button class="btn-gold" id="createBtn" ${this.busy ? "disabled" : ""}>${this.busy || "Create patient list"}</button>
      <p class="err" id="err" role="alert">${esc(this.error)}</p>`;
  }

  lockedHtml() {
    const wait = this.db.lockoutSeconds();
    return `
      <h1>Patient list</h1>
      <p>Locked. Enter the passphrase to see the patients.</p>
      <div class="field"><label class="label" for="pp1">Passphrase</label>
        <input class="text-input" id="pp1" type="password" autocomplete="current-password" ${wait ? "disabled" : ""}></div>
      <button class="btn-gold" id="unlockBtn" ${this.busy || wait ? "disabled" : ""}>${this.busy || "Unlock"}</button>
      <p class="err" id="err" role="alert">${esc(this.error || (wait ? `Too many wrong passphrases. Try again in ${wait} s.` : ""))}</p>
      <details class="forgot"><summary>Forgot the passphrase?</summary>
        <p>It cannot be recovered. You can erase the whole list (every patient and all history on this card) and start again.</p>
        <label class="label" for="eraseWord">Type ERASE to confirm</label>
        <div class="row-inline"><input class="text-input" id="eraseWord" autocomplete="off">
          <button class="btn danger" id="eraseBtn">Erase everything</button></div>
      </details>`;
  }

  listHtml() {
    const n = this.db.listPatients().length;
    return `
      <div class="list-head"><h1>Patients <span class="count">${n}</span></h1>
        <button class="btn-gold small" id="addBtn">Add patient</button></div>
      ${this.adding ? this.addFormHtml() : ""}
      <div class="searchrow"><label class="label" for="search">Search by ID or name</label>
        <input class="text-input" id="search" type="search" autocomplete="off" value="${esc(this.query)}"></div>
      <div class="tablewrap"><table class="grid patients" aria-label="Patients">
        <thead><tr><th>ID</th><th>Name</th><th>Sessions</th><th>Last session</th><th><span class="sr">Open</span></th></tr></thead>
        <tbody id="rows"></tbody></table></div>
      <div class="list-foot"><button class="lnk" id="auditBtn">${this.showAudit ? "Hide access log" : "Access log"}</button>
        <span class="muted">Names are hidden until you press Show, and re-hide after 15 s.</span></div>
      <div id="auditBox">${this.showAudit ? "<p class='muted'>Loading…</p>" : ""}</div>`;
  }

  addFormHtml() {
    return `
      <form class="addform" id="addForm" autocomplete="off">
        <div class="two">
          <div class="field"><label class="label" for="newName">Name</label>
            <input class="text-input" id="newName" maxlength="${NAME_MAX}" autocomplete="off"></div>
          <div class="field"><label class="label" for="newId">Patient ID</label>
            <input class="text-input" id="newId" maxlength="32" value="${esc(this.db.suggestId())}" autocomplete="off"></div>
        </div>
        <p class="hint-left">The ID is what appears on the keyboard's results and in exports. Use a clinic code, not a name or date of birth.</p>
        <div class="row-inline"><button class="btn-gold small" type="submit">Save patient</button>
          <button class="btn" type="button" id="cancelAdd">Cancel</button></div>
        <p class="err" id="addErr" role="alert"></p>
      </form>`;
  }

  safeguardsHtml() {
    const enc = this.db.exists && this.db.encrypted;
    return `
      <details class="safe"><summary>How patient data is handled</summary>
        <ul>
          ${enc ? `<li><strong>Encrypted on the card.</strong> AES-256-GCM, with a key made from your passphrase (PBKDF2, 600,000 rounds). Names, history and the access log are unreadable without it.</li>`
                : `<li><strong>Not encrypted (for now).</strong> The patient list, history and access log are plain text files on the card, and the list opens without a passphrase. Anyone who can open this page or read the card can read them.</li>`}
          <li><strong>Names stay hidden on screen.</strong> The list shows initials until you press Show; the name hides again after 15 seconds${enc ? ", when you leave this tab, and when the list locks" : " and when you leave this tab"}.</li>
          <li><strong>The ID travels, the name does not.</strong> Sessions, results and exports carry the patient ID only.</li>
          ${enc ? `<li><strong>Locks itself.</strong> After ${this.idleMinutes} minutes without activity (not during an exercise). Lock now at any time.</li>` : ""}
          <li><strong>Access log.</strong> ${enc ? "Unlocks, name reveals" : "Name reveals"}, patients added or opened and sessions saved, by ID and time.</li>
          <li><strong>Prototype.</strong> This is a simulator, not a compliance certification. Use fictitious data only. Nothing leaves this browser or the simulator's folder.</li>
        </ul>
      </details>`;
  }

  renderRows() {
    const tb = this.el.querySelector("#rows");
    if (!tb || !this.db.unlocked) return;
    const q = this.query.trim().toLowerCase();
    const all = this.db.listPatients().sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const rows = all.filter((p) => !q || p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
    if (!all.length) {
      tb.innerHTML = `<tr><td colspan="5" class="empty-row">No patients yet. Add the first patient, or enter demo mode.</td></tr>`;
      return;
    }
    if (!rows.length) { tb.innerHTML = `<tr><td colspan="5" class="empty-row">No patient matches “${esc(this.query)}”.</td></tr>`; return; }
    tb.innerHTML = rows.map((p) => {
      const shown = this.revealed.has(p.id);
      return `<tr class="${p.id === this.highlight ? "hl" : ""}">
        <td class="idc">${esc(p.id)}</td>
        <td class="namec"><span class="nm ${shown ? "shown" : ""}">${esc(shown ? p.name : initials(p.name))}</span>
          <button class="lnk" data-${shown ? "hide" : "show"}="${esc(p.id)}" aria-label="${shown ? "Hide" : "Show"} name for ${esc(p.id)}">${shown ? "Hide" : "Show"}</button></td>
        <td>${p.session_count}</td>
        <td>${esc(when(p.last_session_at))}</td>
        <td class="act"><button class="btn small" data-open="${esc(p.id)}">Open</button></td></tr>`;
    }).join("");
  }

  async renderAudit() {
    const box = this.el.querySelector("#auditBox");
    if (!box) return;
    try {
      const log = await this.db.readAudit(100);
      box.innerHTML = `<div class="tablewrap"><table class="grid audit"><thead><tr><th>When</th><th>Action</th><th>Patient ID</th><th>Detail</th></tr></thead><tbody>` +
        log.map((e) => `<tr><td>${esc(when(e.ts))}</td><td>${esc(e.action.replace(/_/g, " "))}</td><td>${esc(e.patient || "")}</td><td>${esc(e.detail || "")}</td></tr>`).join("") +
        `</tbody></table></div>`;
    } catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }

  // ---------------------------------------------------------------- events
  bind() {
    const $ = (s) => this.el.querySelector(s);
    $("#demoBtn").onclick = () => this.onDemo();
    $("#lockNow")?.addEventListener("click", () => this.lock("manual"));

    $("#createBtn")?.addEventListener("click", () => this.doCreate());
    $("#pp2")?.addEventListener("keydown", (e) => { if (e.key === "Enter") this.doCreate(); });

    $("#unlockBtn")?.addEventListener("click", () => this.doUnlock());
    $("#pp1")?.addEventListener("keydown", (e) => { if (e.key === "Enter" && $("#unlockBtn")) this.doUnlock(); });
    $("#eraseBtn")?.addEventListener("click", () => this.doErase());
    if (!this.db.exists || !this.db.unlocked) $("#pp1")?.focus();

    $("#addBtn")?.addEventListener("click", () => { this.adding = true; this.render(); this.el.querySelector("#newName")?.focus(); });
    $("#cancelAdd")?.addEventListener("click", () => { this.adding = false; this.render(); });
    $("#addForm")?.addEventListener("submit", (e) => { e.preventDefault(); this.doAdd(); });
    $("#search")?.addEventListener("input", (e) => { this.query = e.target.value; this.renderRows(); });
    $("#auditBtn")?.addEventListener("click", () => {
      this.showAudit = !this.showAudit;
      this.db.audit(this.showAudit ? "access_log_viewed" : "access_log_closed").then(() => { if (this.showAudit) this.renderAudit(); });
      this.render();
      if (this.showAudit) this.renderAudit();
    });
    $("#rows")?.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.show) this.reveal(b.dataset.show);
      else if (b.dataset.hide) this.hide(b.dataset.hide);
      else if (b.dataset.open) this.doOpen(b.dataset.open);
    });
  }

  async withBusy(label, fn) {
    this.busy = label; this.error = ""; this.render();
    try { await fn(); } catch (e) { this.error = e instanceof DbError ? e.message : "Something went wrong: " + e.message; }
    this.busy = ""; this.render();
  }

  doCreate() {
    const a = this.el.querySelector("#pp1")?.value || "", b = this.el.querySelector("#pp2")?.value || "";
    if (a.length < MIN_PASSPHRASE) { this.setErr(`Use at least ${MIN_PASSPHRASE} characters.`); return; }
    if (a !== b) { this.setErr("The two passphrases do not match."); return; }
    this.withBusy("Creating…", () => this.db.create(a));
  }
  doUnlock() {
    const pass = this.el.querySelector("#pp1")?.value || "";
    if (!pass) { this.setErr("Enter the passphrase."); return; }
    this.withBusy("Unlocking…", async () => {
      const ok = await this.db.unlock(pass);
      if (!ok) {
        const left = Math.max(0, 5 - (this.db.meta.failed_attempts || 0));
        this.error = left > 0 ? `Wrong passphrase. ${left} ${left === 1 ? "try" : "tries"} left before a wait.` : this.db.lockoutSeconds() ? `Wrong passphrase. Try again in ${this.db.lockoutSeconds()} s.` : "Wrong passphrase.";
      }
    });
  }
  doErase() {
    if ((this.el.querySelector("#eraseWord")?.value || "").trim() !== "ERASE") { this.setErr("Type ERASE (in capitals) to confirm."); return; }
    this.withBusy("Erasing…", async () => {
      await this.db.erase();
      if (!this.encrypt) await this.db.createPlain();     // start again with an empty, unencrypted list
      this.notice = "The patient list was erased.";
    });
  }
  doAdd() {
    const name = this.el.querySelector("#newName")?.value, id = this.el.querySelector("#newId")?.value;
    const v = this.db.validate({ id, name });
    if (v.error) { const e = this.el.querySelector("#addErr"); if (e) e.textContent = v.error; return; }
    this.db.addPatient({ id, name }).then((p) => {
      this.adding = false; this.highlight = p.id; this.query = ""; this.notice = `Added ${p.id}.`;
      this.render();
    }).catch((e) => { const el = this.el.querySelector("#addErr"); if (el) el.textContent = e.message; });
  }
  async doOpen(id) {
    const p = this.db.getPatient(id);
    if (!p) return;
    await this.db.audit("patient_opened", { patient: id });
    this.maskAll(false);
    this.onPatient(p);
  }
  setErr(msg) { const e = this.el.querySelector("#err"); if (e) e.textContent = msg; }
}
