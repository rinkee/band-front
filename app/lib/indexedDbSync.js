"use client";

import { isIndexedDBAvailable, bulkPut } from "./indexedDbClient";

const toArray = (records) => {
  if (!records) return [];
  return Array.isArray(records) ? records.filter(Boolean) : [records];
};

export const dispatchIndexedDbSyncEvent = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("indexeddb-sync"));
  }
};

export const syncProductsToIndexedDb = async (products, options = {}) => {
  const { dispatchEvent = true } = options;
  const payload = toArray(products);
  if (!payload.length || !isIndexedDBAvailable()) return false;

  try {
    await bulkPut("products", payload);
    if (dispatchEvent) dispatchIndexedDbSyncEvent();
    return true;
  } catch (err) {
    // IndexedDB는 오프라인 환경에서 실패할 수 있으므로 조용히 건너뜀
    return false;
  }
};

export const syncOrdersToIndexedDb = async (orders, options = {}) => {
  const { dispatchEvent = true } = options;
  const payload = toArray(orders);
  if (!payload.length || !isIndexedDBAvailable()) return false;

  try {
    await bulkPut("orders", payload);
    if (dispatchEvent) dispatchIndexedDbSyncEvent();
    return true;
  } catch (err) {
    return false;
  }
};

const normalizeCommentOrderForIndexedDb = (order) => {
  if (!order) return null;
  const commentOrderId =
    order.comment_order_id ??
    order.commentOrderId ??
    order.order_id ??
    null;
  if (commentOrderId == null) return null;

  const normalizedStatus = order.order_status ?? order.status ?? null;

  return {
    ...order,
    comment_order_id: commentOrderId,
    order_status: normalizedStatus,
    status: normalizedStatus,
  };
};

export const syncCommentOrdersToIndexedDb = async (orders, options = {}) => {
  const { dispatchEvent = true } = options;
  const payload = toArray(orders)
    .map(normalizeCommentOrderForIndexedDb)
    .filter(Boolean);
  if (!payload.length || !isIndexedDBAvailable()) return false;

  try {
    await bulkPut("comment_orders", payload);
    if (dispatchEvent) dispatchIndexedDbSyncEvent();
    return true;
  } catch (err) {
    return false;
  }
};

export const clearOrdersFromIndexedDb = async () => {
  if (!isIndexedDBAvailable()) return false;
  try {
    const { clearAll } = await import("./indexedDbClient");
    if (typeof clearAll === "function") {
      await clearAll("orders");
      dispatchIndexedDbSyncEvent();
      return true;
    }
  } catch (err) {
    // ignore
  }
  return false;
};
