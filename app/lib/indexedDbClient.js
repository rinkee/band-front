"use client";

/**
 * Minimal IndexedDB helper for offline snapshots & queueing.
 * Stores: posts, products, orders, comment_orders, syncQueue, snapshots, meta.
 */

const DB_NAME = "band-offline-cache";
const DB_VERSION = 3;

let dbPromise = null;

const isBrowser = () => typeof window !== "undefined" && "indexedDB" in window;
const isIdbDebugEnabled = () => {
  try {
    return !!(typeof window !== "undefined" && window.__BOH_IDB_DEBUG__);
  } catch (_) {
    return false;
  }
};

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!isBrowser()) {
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      const upgradeTx = request.transaction;
      if (!db.objectStoreNames.contains("posts")) {
        const store = db.createObjectStore("posts", { keyPath: "post_id" });
        store.createIndex("updated_at", "updated_at", { unique: false });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("post_key", "post_key", { unique: false });
      } else if (upgradeTx) {
        const store = upgradeTx.objectStore("posts");
        if (!store.indexNames.contains("post_key")) {
          store.createIndex("post_key", "post_key", { unique: false });
        }
      }

      if (!db.objectStoreNames.contains("products")) {
        const store = db.createObjectStore("products", { keyPath: "product_id" });
        store.createIndex("post_id", "post_id", { unique: false });
        store.createIndex("updated_at", "updated_at", { unique: false });
      }

      if (!db.objectStoreNames.contains("orders")) {
        const store = db.createObjectStore("orders", { keyPath: "order_id" });
        store.createIndex("post_key", "post_key", { unique: false });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("updated_at", "updated_at", { unique: false });
        store.createIndex("customer_name", "customer_name", { unique: false });
        store.createIndex("customer_phone", "customer_phone", { unique: false });
      }

      if (!db.objectStoreNames.contains("comment_orders")) {
        const store = db.createObjectStore("comment_orders", { keyPath: "comment_order_id" });
        store.createIndex("post_key", "post_key", { unique: false });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("comment_created_at", "comment_created_at", { unique: false });
        store.createIndex("commenter_name", "commenter_name", { unique: false });
        store.createIndex("comment_key", "comment_key", { unique: false });
        store.createIndex("order_status", "order_status", { unique: false });
      } else if (upgradeTx) {
        const store = upgradeTx.objectStore("comment_orders");
        if (!store.indexNames.contains("comment_key")) {
          store.createIndex("comment_key", "comment_key", { unique: false });
        }
        if (!store.indexNames.contains("order_status")) {
          store.createIndex("order_status", "order_status", { unique: false });
        }
      }

      if (!db.objectStoreNames.contains("syncQueue")) {
        const store = db.createObjectStore("syncQueue", {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("table", "table", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains("snapshots")) {
        db.createObjectStore("snapshots", { keyPath: "snapshotId" });
      }

      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
  });
}

export function isIndexedDBAvailable() {
  return isBrowser();
}

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDatabase();
  }
  return dbPromise;
}

async function runTransaction(storeNames, mode, callback) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    const stores = storeNames.map((name) => tx.objectStore(name));

    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    tx.oncomplete = () => resolve(true);

    callback(...stores);
  });
}

export async function bulkPut(storeName, items = []) {
  if (!items.length) return 0;
  let count = 0;

  await runTransaction([storeName], "readwrite", (store) => {
    items.forEach((item) => {
      store.put(item);
      count += 1;
    });
  });

  if (isIdbDebugEnabled()) {
    try {
      console.log("[BOH][idb] bulkPut", { storeName, count });
    } catch (_) {}
  }
  return count;
}

const parseUpdatedAt = (value) => {
  if (!value) return 0;
  const t = Date.parse(String(value));
  return Number.isNaN(t) ? 0 : t;
};

const mergeRecord = (existing, incoming) => {
  if (!existing) return incoming;
  const incomingTs = parseUpdatedAt(incoming?.updated_at ?? incoming?.updatedAt ?? null);
  const existingTs = parseUpdatedAt(existing?.updated_at ?? existing?.updatedAt ?? null);
  const shouldApply = !existingTs || !incomingTs || incomingTs >= existingTs;
  if (!shouldApply) return existing;
  const merged = { ...existing };
  Object.keys(incoming || {}).forEach((key) => {
    if (incoming[key] === undefined) return;
    merged[key] = incoming[key];
  });
  return merged;
};

const resolveKeyFromItem = (keyPath, item) => {
  if (!keyPath) return null;
  if (Array.isArray(keyPath)) {
    return keyPath.map((k) => item?.[k]);
  }
  return item?.[keyPath];
};

export async function bulkMerge(storeName, items = []) {
  if (!items.length) return 0;
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], "readwrite");
    const store = tx.objectStore(storeName);
    const keyPath = store.keyPath;
    let count = 0;

    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    tx.oncomplete = () => {
      if (isIdbDebugEnabled()) {
        try {
          console.log("[BOH][idb] bulkMerge", { storeName, count });
        } catch (_) {}
      }
      resolve(count);
    };

    items.forEach((item) => {
      const key = resolveKeyFromItem(keyPath, item);
      if (key == null) return;
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        const existing = getReq.result || null;
        const merged = mergeRecord(existing, item);
        store.put(merged);
        count += 1;
      };
      getReq.onerror = () => {
        store.put(item);
        count += 1;
      };
    });
  });
}

export async function putRecord(storeName, item) {
  await runTransaction([storeName], "readwrite", (store) => {
    store.put(item);
  });
  return item;
}

export async function getAllFromStore(storeName) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

export async function getRecent(storeName, indexName, limit = 50) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], "readonly");
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.openCursor(null, "prev");
    const results = [];

    request.onerror = () => reject(request.error);
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
  });
}

export async function searchOrders(term, limit = 100) {
  const all = await getAllFromStore("orders");
  if (!term) return all.slice(0, limit);

  const lower = term.toLowerCase();
  const filtered = all.filter((order) => {
    const name = order.customer_name || "";
    const phone = order.customer_phone || "";
    const id = order.order_id || "";
    return (
      name.toLowerCase().includes(lower) ||
      phone.includes(term) ||
      id.includes(term)
    );
  });

  return filtered.slice(0, limit);
}

export async function addToQueue(item) {
  const payload = {
    ...item,
    attempts: item?.attempts || 0,
    enqueuedAt: new Date().toISOString(),
  };

  await runTransaction(["syncQueue"], "readwrite", (store) => {
    store.add(payload);
  });

  return payload;
}

export async function saveSnapshot(meta) {
  const snapshot = {
    snapshotId: meta?.snapshotId || `snapshot-${Date.now()}`,
    createdAt: meta?.createdAt || new Date().toISOString(),
    counts: meta?.counts || {},
    notes: meta?.notes || "",
  };

  await runTransaction(["snapshots"], "readwrite", (store) => {
    store.put(snapshot);
  });

  return snapshot;
}

export async function setMeta(key, value) {
  await runTransaction(["meta"], "readwrite", (store) => {
    store.put({ key, value });
  });
}

export async function getMeta(key) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["meta"], "readonly");
    const store = tx.objectStore("meta");
    const request = store.get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result?.value);
  });
}

export async function upsertOrderLocal(order) {
  const updated = {
    ...order,
    updated_at: order.updated_at || new Date().toISOString(),
  };
  await putRecord("orders", updated);
  return updated;
}

export async function getPendingQueue() {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["syncQueue"], "readonly");
    const store = tx.objectStore("syncQueue");
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

export async function deleteQueueItems(ids = []) {
  if (!ids.length) return;
  await runTransaction(["syncQueue"], "readwrite", (store) => {
    ids.forEach((id) => store.delete(id));
  });
}

export async function clearAllStores() {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const storeNames = Array.from(db.objectStoreNames);
    const tx = db.transaction(storeNames, "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve(true);
    storeNames.forEach((name) => {
      tx.objectStore(name).clear();
    });
  });
}

export async function clearStoresByUserId(userId, storeNames = []) {
  if (!userId) return;
  const db = await getDb();
  const targets =
    storeNames.length > 0
      ? storeNames
      : ["posts", "products", "orders", "comment_orders", "syncQueue"];
  const existing = targets.filter((name) => db.objectStoreNames.contains(name));
  if (existing.length === 0) return;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(existing, "readwrite");
    tx.onerror = () => {
      if (isIdbDebugEnabled()) {
        try {
          console.warn("[BOH][idb] bulkMerge error", { storeName, error: tx.error });
        } catch (_) {}
      }
      reject(tx.error);
    };
    tx.onabort = () => {
      if (isIdbDebugEnabled()) {
        try {
          console.warn("[BOH][idb] bulkMerge abort", { storeName, error: tx.error });
        } catch (_) {}
      }
      reject(tx.error);
    };
    tx.oncomplete = () => resolve(true);

    existing.forEach((name) => {
      const store = tx.objectStore(name);
      const request = store.openCursor();
      request.onerror = () => {
        tx.abort();
      };
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        const value = cursor.value || {};
        const uid = value.user_id || value.userId;
        const payloadUid = value.payload?.user_id || value.payload?.userId;
        if (uid === userId || payloadUid === userId) {
          cursor.delete();
        }
        cursor.continue();
      };
    });
  });
}
