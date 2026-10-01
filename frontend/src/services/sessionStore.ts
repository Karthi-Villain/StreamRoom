const DB_NAME = "streamroom_idb";
const STORE_NAME = "sessions";

export interface StoredSession {
  roomId: string;
  clientId: string;
  sessionToken: string;
  hostToken?: string;
  isHost: boolean;
  displayName: string;
  savedAt: number;
}

function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (!window.indexedDB) {
      resolve(null);
      return;
    }
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "roomId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function saveRoomSession(session: StoredSession): Promise<void> {
  // 1. Save to LocalStorage
  try {
    localStorage.setItem(`streamroom_sess_${session.roomId}`, JSON.stringify(session));
  } catch {}

  // 2. Save to IndexedDB
  try {
    const db = await openDB();
    if (db) {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(session);
    }
  } catch {}
}

export async function getRoomSession(roomId: string): Promise<StoredSession | null> {
  // 1. Try LocalStorage
  try {
    const raw = localStorage.getItem(`streamroom_sess_${roomId}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}

  // 2. Try IndexedDB fallback
  try {
    const db = await openDB();
    if (db) {
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(roomId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    }
  } catch {}

  return null;
}

export async function clearRoomSession(roomId: string): Promise<void> {
  try {
    localStorage.removeItem(`streamroom_sess_${roomId}`);
  } catch {}

  try {
    const db = await openDB();
    if (db) {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(roomId);
    }
  } catch {}
}
