/**
 * The browser side of keeping data safe: snapshots in IndexedDB, an optional backup file the app writes to, and storage protection.
 * Every call is guarded: a browser that does not allow something just gets a "not available" answer, never an error.
 */
const DB_NAME = "project-moon-the-city", DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("no indexedDB"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", { keyPath: "at" }); if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv"); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const run = async (store, mode, fn) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode), s = tx.objectStore(store);
    let result;
    Promise.resolve(fn(s, v => { result = v; })).catch(reject);
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
};
const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const snapshots = {
  /** Oldest first: [{ at, label, size, json }]. */
  async list() { try { return await run("snapshots", "readonly", async (s, out) => out(await reqP(s.getAll()))) ?? []; } catch { return []; } },
  async replaceAll(list) {
    try { await run("snapshots", "readwrite", async s => { await reqP(s.clear()); for (const e of list) s.put(e); }); return true; } catch { return false; }
  }
};

/* ---- a file the app keeps writing the save to (Chrome and Edge on a computer) ---- */
export const fileSupported = () => typeof globalThis.showSaveFilePicker === "function";
export async function chooseBackupFile() {
  const handle = await showSaveFilePicker({ suggestedName: "project-moon-backup.json", types: [{ description: "Project Moon save", accept: { "application/json": [".json"] } }] });
  try { await run("kv", "readwrite", async s => s.put(handle, "handle")); } catch { /* the handle just will not survive a reload */ }
  return handle;
}
export async function savedBackupFile() { try { return await run("kv", "readonly", async (s, out) => out(await reqP(s.get("handle")))) ?? null; } catch { return null; } }
export async function forgetBackupFile() { try { await run("kv", "readwrite", async s => s.delete("handle")); } catch { /* ignore */ } }
/** "granted", "prompt" (the user has to click to allow it again) or "denied". */
export async function filePermission(handle, ask = false) {
  try {
    const o = { mode: "readwrite" };
    if ((await handle.queryPermission(o)) === "granted") return "granted";
    return ask ? await handle.requestPermission(o) : "prompt";
  } catch { return "denied"; }
}
export async function writeBackupFile(handle, text) {
  if ((await filePermission(handle)) !== "granted") return "permission";
  try { const w = await handle.createWritable(); await w.write(text); await w.close(); return "ok"; } catch { return "failed"; }
}

/* ---- asking the browser not to throw our data away when it is short of space ---- */
export async function storageInfo() {
  const out = { persisted: false, usage: NaN, quota: NaN };
  try { out.persisted = !!(await navigator.storage?.persisted?.()); } catch { /* ignore */ }
  try { const e = await navigator.storage?.estimate?.(); out.usage = e?.usage ?? NaN; out.quota = e?.quota ?? NaN; } catch { /* ignore */ }
  return out;
}
export async function protectStorage() { try { return !!(await navigator.storage?.persist?.()); } catch { return false; } }
