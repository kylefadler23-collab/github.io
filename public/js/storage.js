/**
 * AegisCam Storage Engine (IndexedDB)
 * Handles persistent local video clip storage, metadata indexing, thumbnail caching, and disk space calculation.
 */
class ClipStorage {
  constructor() {
    this.dbName = 'AegisCam_DB';
    this.dbVersion = 1;
    this.storeName = 'clips';
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('trigger', 'trigger', { unique: false });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      request.onerror = (e) => {
        console.error('[IndexedDB] Failed to open database:', e);
        reject(e);
      };
    });
  }

  async saveClip(clipData) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const record = {
        id: 'clip_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        timestamp: clipData.timestamp || new Date().toISOString(),
        duration: clipData.duration || 0, // seconds
        trigger: clipData.trigger || 'motion', // 'motion' | 'manual'
        size: clipData.blob.size,
        blob: clipData.blob,
        thumbnail: clipData.thumbnail || null
      };

      const req = store.add(record);
      req.onsuccess = () => resolve(record);
      req.onerror = (e) => reject(e);
    });
  }

  async getAllClips() {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const req = store.getAll();

      req.onsuccess = () => {
        // Sort descending by timestamp
        const clips = req.result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        resolve(clips);
      };
      req.onerror = (e) => reject(e);
    });
  }

  async getClipById(id) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const req = store.get(id);

      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e);
    });
  }

  async deleteClip(id) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const req = store.delete(id);

      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e);
    });
  }

  async deleteAllClips() {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const req = store.clear();

      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e);
    });
  }

  async getStorageUsage() {
    const clips = await this.getAllClips();
    const totalBytes = clips.reduce((acc, curr) => acc + (curr.size || 0), 0);
    return {
      count: clips.length,
      totalBytes,
      formattedSize: (totalBytes / (1024 * 1024)).toFixed(1) + ' MB'
    };
  }
}

// Export singleton instance
window.clipStorage = new ClipStorage();
