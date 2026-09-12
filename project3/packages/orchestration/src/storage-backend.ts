// Storage factory. Kept Node-free so it typechecks under the strict package
// config. The default is an in-memory store; the server wires a real on-disk
// database (SQLite via node:sqlite) outside this module so the app gets real
// persistence without coupling src/ to Node built-ins.

import { PersistentStorage, type Storage } from './storage';

/** Returns a working Storage. Pass a file path to enable on-disk persistence
 *  (handled by the host via Storage.load/save callbacks). */
export async function studioCreateStorageStore(): Promise<Storage> {
  return new PersistentStorage({
    load: () => ({}),
    save: () => {},
  });
}

/** Build a Storage seeded from an existing in-memory map (used by tests/hosts). */
export function memoryStorage(): Storage {
  return new PersistentStorage();
}
