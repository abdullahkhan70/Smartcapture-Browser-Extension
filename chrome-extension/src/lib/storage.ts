/**
 * SmartCapture Pro - IndexedDB Storage Wrapper
 * Provides full CRUD operations for captures and settings with
 * search, export/import, and storage usage reporting.
 */

import { Capture, Settings, Annotation } from './types';
import { DB_NAME, DB_VERSION, STORE_NAMES, DEFAULT_SETTINGS } from './constants';

class StorageError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'StorageError';
  }
}

class SmartCaptureStorage {
  private db: IDBDatabase | null = null;
  private readonly dbName: string;
  private readonly dbVersion: number;

  constructor(dbName: string = DB_NAME, dbVersion: number = DB_VERSION) {
    this.dbName = dbName;
    this.dbVersion = dbVersion;
  }

  /**
   * Initialize the IndexedDB database
   */
  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Captures store
        if (!db.objectStoreNames.contains(STORE_NAMES.CAPTURES)) {
          const captureStore = db.createObjectStore(STORE_NAMES.CAPTURES, {
            keyPath: 'id',
          });
          captureStore.createIndex('timestamp', 'timestamp', {
            unique: false,
          });
          captureStore.createIndex('url', 'url', { unique: false });
          captureStore.createIndex('title', 'title', { unique: false });
        }

        // Settings store
        if (!db.objectStoreNames.contains(STORE_NAMES.SETTINGS)) {
          db.createObjectStore(STORE_NAMES.SETTINGS, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = (event) => {
        const error = (event.target as IDBOpenDBRequest).error;
        reject(new StorageError('Failed to open database', error));
      };

      request.onblocked = () => {
        console.warn('[SmartCapture] Database upgrade blocked. Close other tabs using this extension.');
      };
    });
  }

  /**
   * Ensure database is initialized
   */
  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new StorageError('Database not initialized');
    }
    return this.db;
  }

  // ===== Capture CRUD =====

  /**
   * Add a new capture to storage
   */
  async addCapture(capture: Capture): Promise<Capture> {
    try {
      const db = await this.ensureDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAMES.CAPTURES, 'readwrite');
        const store = tx.objectStore(STORE_NAMES.CAPTURES);
        const request = store.add(capture);

        request.onsuccess = () => resolve(capture);
        request.onerror = () => {
          reject(new StorageError('Failed to add capture', request.error));
        };
      });
    } catch (error) {
      throw new StorageError('Failed to add capture', error);
    }
  }

  /**
   * Get a single capture by ID
   */
  async getCapture(id: string): Promise<Capture | undefined> {
    try {
      const db = await this.ensureDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAMES.CAPTURES, 'readonly');
        const store = tx.objectStore(STORE_NAMES.CAPTURES);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result as Capture | undefined);
        request.onerror = () => {
          reject(new StorageError('Failed to get capture', request.error));
        };
      });
    } catch (error) {
      throw new StorageError('Failed to get capture', error);
    }
  }

  /**
   * Get all captures, sorted by timestamp (newest first)
   */
  async getAllCaptures(): Promise<Capture[]> {
    try {
      const db = await this.ensureDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAMES.CAPTURES, 'readonly');
        const store = tx.objectStore(STORE_NAMES.CAPTURES);
        const index = store.index('timestamp');
        const request = index.openCursor(null, 'prev');

        const captures: Capture[] = [];

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            captures.push(cursor.value as Capture);
            cursor.continue();
          } else {
            resolve(captures);
          }
        };

        request.onerror = () => {
          reject(new StorageError('Failed to get all captures', request.error));
        };
      });
    } catch (error) {
      throw new StorageError('Failed to get all captures', error);
    }
  }

  /**
   * Delete a capture by ID
   */
  async deleteCapture(id: string): Promise<void> {
    try {
      const db = await this.ensureDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAMES.CAPTURES, 'readwrite');
        const store = tx.objectStore(STORE_NAMES.CAPTURES);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => {
          reject(new StorageError('Failed to delete capture', request.error));
        };
      });
    } catch (error) {
      throw new StorageError('Failed to delete capture', error);
    }
  }

  /**
   * Update a capture (merge partial data)
   */
  async updateCapture(id: string, updates: Partial<Capture>): Promise<Capture> {
    try {
      const existing = await this.getCapture(id);
      if (!existing) {
        throw new StorageError(`Capture not found: ${id}`);
      }

      const updated = { ...existing, ...updates };
      const db = await this.ensureDB();

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAMES.CAPTURES, 'readwrite');
        const store = tx.objectStore(STORE_NAMES.CAPTURES);
        const request = store.put(updated);

        request.onsuccess = () => resolve(updated);
        request.onerror = () => {
          reject(new StorageError('Failed to update capture', request.error));
        };
      });
    } catch (error) {
      throw new StorageError('Failed to update capture', error);
    }
  }

  /**
   * Update capture annotations
   */
  async updateAnnotations(captureId: string, annotations: Annotation[]): Promise<Capture> {
    return this.updateCapture(captureId, { annotations });
  }

  /**
   * Update capture OCR text
   */
  async updateOCRText(captureId: string, ocrText: string): Promise<Capture> {
    return this.updateCapture(captureId, { ocrText });
  }

  // ===== Search =====

  /**
   * Search captures by URL, title, or OCR text (case-insensitive)
   */
  async searchCaptures(query: string): Promise<Capture[]> {
    const allCaptures = await this.getAllCaptures();
    const lowerQuery = query.toLowerCase().trim();

    if (!lowerQuery) return allCaptures;

    return allCaptures.filter((capture) => {
      const titleMatch = capture.title.toLowerCase().includes(lowerQuery);
      const urlMatch = capture.url.toLowerCase().includes(lowerQuery);
      const ocrMatch = capture.ocrText
        ? capture.ocrText.toLowerCase().includes(lowerQuery)
        : false;
      return titleMatch || urlMatch || ocrMatch;
    });
  }

  /**
   * Get captures for a specific URL
   */
  async getCapturesByUrl(url: string): Promise<Capture[]> {
    try {
      const db = await this.ensureDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAMES.CAPTURES, 'readonly');
        const store = tx.objectStore(STORE_NAMES.CAPTURES);
        const index = store.index('url');
        const request = index.getAll(url);

        request.onsuccess = () => {
          const results = (request.result as Capture[]).sort(
            (a, b) => b.timestamp - a.timestamp
          );
          resolve(results);
        };
        request.onerror = () => {
          reject(new StorageError('Failed to get captures by URL', request.error));
        };
      });
    } catch (error) {
      throw new StorageError('Failed to get captures by URL', error);
    }
  }

  // ===== Settings =====

  /**
   * Get settings
   */
  async getSettings(): Promise<Settings> {
    try {
      const db = await this.ensureDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAMES.SETTINGS, 'readonly');
        const store = tx.objectStore(STORE_NAMES.SETTINGS);
        const request = store.get('user-settings');

        request.onsuccess = () => {
          if (request.result) {
            resolve({ ...DEFAULT_SETTINGS, ...request.result.data });
          } else {
            resolve(DEFAULT_SETTINGS);
          }
        };
        request.onerror = () => {
          reject(new StorageError('Failed to get settings', request.error));
        };
      });
    } catch (error) {
      console.warn('[SmartCapture] Failed to get settings, using defaults:', error);
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Update settings
   */
  async updateSettings(settings: Partial<Settings>): Promise<Settings> {
    try {
      const current = await this.getSettings();
      const updated = { ...current, ...settings };
      const db = await this.ensureDB();

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAMES.SETTINGS, 'readwrite');
        const store = tx.objectStore(STORE_NAMES.SETTINGS);
        const request = store.put({
          id: 'user-settings',
          data: updated,
          timestamp: Date.now(),
        });

        request.onsuccess = () => resolve(updated);
        request.onerror = () => {
          reject(new StorageError('Failed to update settings', request.error));
        };
      });
    } catch (error) {
      throw new StorageError('Failed to update settings', error);
    }
  }

  // ===== Data Management =====

  /**
   * Get storage usage statistics
   */
  async getStorageUsage(): Promise<{ captures: number; totalSize: string }> {
    try {
      const db = await this.ensureDB();
      const captures = await this.getAllCaptures();

      let totalBytes = 0;
      for (const capture of captures) {
        if (capture.imageData) {
          totalBytes += capture.imageData.length * 0.75; // Base64 to bytes approximation
        }
        if (capture.thumbnail) {
          totalBytes += capture.thumbnail.length * 0.75;
        }
      }

      return {
        captures: captures.length,
        totalSize: formatBytes(totalBytes),
      };
    } catch (error) {
      return { captures: 0, totalSize: '0 B' };
    }
  }

  /**
   * Clear all captures (keeps settings)
   */
  async clearAllCaptures(): Promise<void> {
    try {
      const db = await this.ensureDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAMES.CAPTURES, 'readwrite');
        const store = tx.objectStore(STORE_NAMES.CAPTURES);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => {
          reject(new StorageError('Failed to clear captures', request.error));
        };
      });
    } catch (error) {
      throw new StorageError('Failed to clear captures', error);
    }
  }

  /**
   * Clear all data (captures + settings)
   */
  async clearAllData(): Promise<void> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const storeNames = [STORE_NAMES.CAPTURES, STORE_NAMES.SETTINGS];
      const tx = db.transaction(storeNames, 'readwrite');

      for (const storeName of storeNames) {
        const store = tx.objectStore(storeName);
        store.clear();
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        reject(new StorageError('Failed to clear all data', tx.error));
      };
    });
  }

  /**
   * Export all data as a JSON blob
   */
  async exportAllData(): Promise<Blob> {
    const captures = await this.getAllCaptures();
    const settings = await this.getSettings();

    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      appName: 'SmartCapture Pro',
      data: {
        captures,
        settings,
      },
    };

    return new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
  }

  /**
   * Import data from a JSON blob
   */
  async importData(data: Blob): Promise<{ capturesImported: number }> {
    try {
      const text = await data.text();
      const parsed = JSON.parse(text);

      if (!parsed.data || !parsed.data.captures) {
        throw new StorageError('Invalid import data format');
      }

      const captures = parsed.data.captures as Capture[];
      let imported = 0;

      for (const capture of captures) {
        if (capture.id && capture.imageData) {
          try {
            await this.addCapture(capture);
            imported++;
          } catch {
            // Skip duplicates or invalid entries
          }
        }
      }

      // Import settings if present
      if (parsed.data.settings) {
        await this.updateSettings(parsed.data.settings);
      }

      return { capturesImported: imported };
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError('Failed to import data', error);
    }
  }
}

// ===== Utility Functions =====

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

// Singleton instance
export const storage = new SmartCaptureStorage();
export default storage;
