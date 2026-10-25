import type { Feed } from "./terminal";
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("tplus-compass", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("snapshots");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function saveFeeds(feeds: Feed[]) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction("snapshots", "readwrite");
    tx.objectStore("snapshots").put(feeds, "last");
    tx.oncomplete = () => {
      d.close();
      resolve();
    };
    tx.onerror = () => {
      d.close();
      reject(tx.error);
    };
  });
}
export async function readFeeds(): Promise<Feed[]> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction("snapshots");
    const r = tx.objectStore("snapshots").get("last");
    r.onsuccess = () => {
      d.close();
      resolve(
        (r.result ?? []).map((f: Feed) => ({
          ...f,
          stale: true,
          cached: true,
          warning: "Snapshot đã lưu; cần quét lại để xác nhận giá.",
        })),
      );
    };
    r.onerror = () => {
      d.close();
      reject(r.error);
    };
  });
}
export function loadLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function saveLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
