import assert from "node:assert/strict";
import test from "node:test";

import {
  clearPostsCacheStale,
  markPostsCacheStale,
  readPostsCacheStale
} from "../app/lib/swrCache.js";

const createLocalStorageMock = () => {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    key: (index) => Array.from(store.keys())[index] || null,
    get length() {
      return store.size;
    }
  };
};

test("markPostsCacheStale stores a user-scoped marker and dispatches an event", () => {
  const originalWindow = global.window;
  const localStorage = createLocalStorageMock();
  let dispatchedEvent = null;
  global.window = {
    localStorage,
    dispatchEvent: (event) => {
      dispatchedEvent = event;
      return true;
    }
  };

  try {
    const marker = markPostsCacheStale("user-1", { source: "band-update" });
    const saved = readPostsCacheStale("user-1");

    assert.equal(saved.userId, "user-1");
    assert.equal(saved.source, "band-update");
    assert.equal(typeof saved.savedAt, "number");
    assert.deepEqual(saved, marker);
    assert.equal(dispatchedEvent.type, "posts-cache-stale");
    assert.equal(dispatchedEvent.detail.userId, "user-1");
  } finally {
    global.window = originalWindow;
  }
});

test("clearPostsCacheStale does not remove a newer marker", () => {
  const originalWindow = global.window;
  const localStorage = createLocalStorageMock();
  global.window = { localStorage, dispatchEvent: () => true };

  try {
    const oldMarker = markPostsCacheStale("user-1");
    const newerMarker = markPostsCacheStale("user-1");

    assert.equal(clearPostsCacheStale("user-1", oldMarker.savedAt), false);
    assert.deepEqual(readPostsCacheStale("user-1"), newerMarker);

    assert.equal(clearPostsCacheStale("user-1", newerMarker.savedAt), true);
    assert.equal(readPostsCacheStale("user-1"), null);
  } finally {
    global.window = originalWindow;
  }
});
