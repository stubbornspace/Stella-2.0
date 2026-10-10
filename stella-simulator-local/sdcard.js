// Stella prototype - emulated microSD card.
//
// On the keyboard, patient data lives on a microSD card (FatFS on the hub board). In the browser the card is emulated
// with a tiny async text-file API: read / write / remove / list, by path. Backends, in order of preference:
//   1. the simulator's own folder sim/sdcard/   (sim_server.py serves it at /sdcard/ - real files on disk)
//   2. the browser's IndexedDB                  (works on a plain static host, e.g. the shared demo page)
//   3. memory                                   (nothing survives a reload; the UI says so)
//
// Everything stored through this API by patients.js is already encrypted; the card never sees plain text of names or results.

const PATH_RE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

export function checkPath(path) {
  if (!PATH_RE.test(path) || path.split("/").some((s) => s === "." || s === "..")) {
    throw new Error(`bad card path: ${path}`);
  }
  return path;
}

// ---------------------------------------------------------------- 1. files on disk via sim_server.py
class ServerCard {
  constructor() { this.kind = "folder"; this.label = "SD card (folder sim/sdcard/)"; this.persistent = true; }

  static async detect() {
    try {
      const r = await fetch("sdcard/?ping", { cache: "no-store" });
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.sdcard === true ? new ServerCard() : null;
    } catch { return null; }
  }
  async read(path) {
    const r = await fetch("sdcard/" + checkPath(path) + "?optional", { cache: "no-store" });
    if (r.status === 404 || r.status === 204) return null;
    if (!r.ok) throw new Error(`card read failed (${r.status})`);
    return r.text();
  }
  async write(path, text) {
    const r = await fetch("sdcard/" + checkPath(path), { method: "PUT", body: text });
    if (!r.ok) throw new Error(`card write failed (${r.status})`);
  }
  async remove(path) {
    const r = await fetch("sdcard/" + checkPath(path), { method: "DELETE" });
    if (!r.ok && r.status !== 404) throw new Error(`card delete failed (${r.status})`);
  }
  async list(prefix = "") {
    const r = await fetch("sdcard/?ls=" + encodeURIComponent(prefix), { cache: "no-store" });
    if (!r.ok) throw new Error(`card list failed (${r.status})`);
    return r.json();
  }
}

// ---------------------------------------------------------------- 2. IndexedDB
class IdbCard {
  constructor(db) { this.db = db; this.kind = "browser"; this.label = "SD card (emulated in this browser)"; this.persistent = true; }

  static open() {
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) { reject(new Error("no IndexedDB")); return; }
      const rq = indexedDB.open("stella-sd", 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore("files", { keyPath: "path" });
      rq.onsuccess = () => resolve(new IdbCard(rq.result));
      rq.onerror = () => reject(rq.error || new Error("IndexedDB failed"));
      rq.onblocked = () => reject(new Error("IndexedDB blocked"));
    });
  }
  _run(mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("files", mode);
      let out;
      fn(tx.objectStore("files"), (v) => { out = v; });
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("transaction aborted"));
    });
  }
  read(path) {
    checkPath(path);
    return this._run("readonly", (s, set) => {
      const r = s.get(path);
      r.onsuccess = () => set(r.result ? r.result.text : null);
    });
  }
  write(path, text) {
    checkPath(path);
    return this._run("readwrite", (s) => { s.put({ path, text, size: text.length }); });
  }
  remove(path) {
    checkPath(path);
    return this._run("readwrite", (s) => { s.delete(path); });
  }
  list(prefix = "") {
    return this._run("readonly", (s, set) => {
      const r = s.getAll();
      r.onsuccess = () => set(r.result.filter((f) => f.path.startsWith(prefix))
        .map((f) => ({ path: f.path, size: f.size })).sort((a, b) => a.path.localeCompare(b.path)));
    });
  }
}

// ---------------------------------------------------------------- 3. memory
class MemoryCard {
  constructor() { this.kind = "memory"; this.label = "SD card (memory only - not saved)"; this.persistent = false; this.files = new Map(); }
  async read(path) { checkPath(path); return this.files.has(path) ? this.files.get(path) : null; }
  async write(path, text) { checkPath(path); this.files.set(path, text); }
  async remove(path) { checkPath(path); this.files.delete(path); }
  async list(prefix = "") {
    return [...this.files].filter(([p]) => p.startsWith(prefix)).map(([path, t]) => ({ path, size: t.length }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }
}

/** Pick the best available card. `prefer` can force a backend ("browser" | "memory") - used by the tests. */
export async function openCard(prefer = "") {
  if (prefer === "memory") return new MemoryCard();
  if (prefer !== "browser") {
    const s = await ServerCard.detect();
    if (s) return s;
  }
  try { return await IdbCard.open(); } catch { /* fall through */ }
  return new MemoryCard();
}
