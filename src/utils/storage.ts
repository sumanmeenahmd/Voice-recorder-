import { RecorderSettings, RecordingItem } from '../types/recording';

const DB_NAME = 'cadence_voice_db';
const DB_VERSION = 1;
const STORE_NAME = 'recordings';

const SETTINGS_KEY = 'cadence_recorder_settings';
const THEME_KEY = 'cadence_theme';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

export async function getAllRecordings(): Promise<RecordingItem[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const items = (request.result as RecordingItem[]) || [];
      items.sort((a, b) => b.createdAt - a.createdAt);
      resolve(items);
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to read recordings'));
    tx.oncomplete = () => db.close();
  });
}

export async function putRecording(item: RecordingItem): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to save recording'));
    tx.oncomplete = () => db.close();
  });
}

export async function removeRecording(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to delete recording'));
    tx.oncomplete = () => db.close();
  });
}

export const DEFAULT_RECORDER_SETTINGS: RecorderSettings = {
  deviceId: '',
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  monitorInput: false,
};

export function loadRecorderSettings(): RecorderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_RECORDER_SETTINGS;
    return { ...DEFAULT_RECORDER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_RECORDER_SETTINGS;
  }
}

export function saveRecorderSettings(settings: RecorderSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadThemePreference(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // Ignore
  }
  return 'light';
}

export function saveThemePreference(theme: 'light' | 'dark'): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore
  }
}
