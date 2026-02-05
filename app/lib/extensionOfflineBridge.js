"use client";

import { bulkPut, bulkMerge, isIndexedDBAvailable } from "./indexedDbClient";
import { dispatchIndexedDbSyncEvent } from "./indexedDbSync";

const BRIDGE_MESSAGE_TYPE = "BOH_OFFLINE_SYNC";
const DEFAULT_DEBOUNCE_MS = 300;

const pending = {
  orders: new Map(),
  products: new Map(),
  posts: new Map(),
  comment_orders: new Map(),
};

const pendingSchema = {
  orders: "legacy",
  products: "legacy",
  posts: "legacy",
  comment_orders: "supabase",
};

let flushTimer = null;
let flushDelayMs = DEFAULT_DEBOUNCE_MS;

const toArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
};

const normalizeIso = (value, fallback = null) => {
  if (!value) return fallback;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : fallback;
  }
  if (typeof value === "number") {
    const d = new Date(value > 1e12 ? value : value * 1000);
    return Number.isFinite(d.getTime()) ? d.toISOString() : fallback;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    return fallback;
  }
  return fallback;
};

const normalizeBandNumber = (record) => {
  const raw =
    record?.band_number ??
    record?.bandNumber ??
    record?.bandId ??
    record?.band_id ??
    record?.bandKey ??
    record?.band_key ??
    null;
  if (raw == null || raw === "") return null;
  return typeof raw === "number" ? raw : String(raw);
};

const normalizePostNumber = (record) => {
  const raw =
    record?.post_number ??
    record?.postNumber ??
    record?.postId ??
    record?.post_id ??
    record?.remotePostId ??
    record?.postNo ??
    record?.post_no ??
    null;
  if (raw == null || raw === "") return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : raw;
};

const buildPostKey = (bandNumber, postNumber) => {
  if (bandNumber == null || postNumber == null) return null;
  return `${bandNumber}:${postNumber}`;
};

const parsePostIdFromKey = (postKey) => {
  if (!postKey || typeof postKey !== "string") return null;
  const parts = postKey.split(":");
  if (parts.length < 2) return null;
  const raw = parts[1];
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
};

const parsePostIdFromComposite = (value) => {
  if (!value) return null;
  const text = String(value);
  const match = text.match(/post_[^_]+_(\d+)/);
  if (!match) return null;
  const num = Number(match[1]);
  return Number.isFinite(num) ? num : null;
};

const normalizePhotosData = (value) => {
  if (!value) return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (typeof value[0] === "string") {
      return value.filter(Boolean).map((url) => ({ url }));
    }
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return normalizePhotosData(parsed) ?? trimmed;
    } catch (_) {
      return trimmed;
    }
  }
  if (typeof value === "object") {
    if (value.url) return [value];
    return value;
  }
  return null;
};

const normalizeImageUrls = (value) => {
  if (!value) return null;
  if (Array.isArray(value)) {
    if (value.length > 0 && value[0] && typeof value[0] === "object") {
      const urls = value.map((item) => item?.url).filter(Boolean);
      return urls.length ? urls : null;
    }
    return value.filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        if (parsed.length > 0 && parsed[0] && typeof parsed[0] === "object") {
          const urls = parsed.map((item) => item?.url).filter(Boolean);
          return urls.length ? urls : null;
        }
        return parsed.filter(Boolean);
      }
    } catch (_) {
      return [trimmed];
    }
  }
  return null;
};

const normalizeCommentChange = (record, commentText) => {
  const raw = record?.comment_change ?? record?.commentChange ?? null;
  if (raw) {
    if (typeof raw === "string") return raw;
    if (typeof raw === "object" && Array.isArray(raw.history)) {
      const allStrings = raw.history.every((entry) => typeof entry === "string");
      if (allStrings) {
        try {
          return JSON.stringify(raw);
        } catch (_) {
          return null;
        }
      }
    }
  }

  const statusRaw = record?.comment_status ?? record?.commentStatus ?? null;
  const status = statusRaw === "updated" || statusRaw === "deleted" ? statusRaw : null;
  if (!status) return null;

  const history = [];
  const source = record?.comment_history ?? record?.commentHistory ?? null;
  if (Array.isArray(source)) {
    source.forEach((entry) => {
      if (typeof entry === "string") {
        history.push(entry);
        return;
      }
      if (!entry || typeof entry !== "object") return;
      const version = entry.version ?? entry.comment_version ?? entry.v ?? null;
      const text = entry.text ?? entry.comment ?? entry.content ?? entry.body ?? "";
      const event = entry.event ?? entry.status ?? "";
      if (event === "deleted") {
        history.push(`version:${version || history.length + 1} [deleted]`);
        return;
      }
      if (text || event === "updated" || event === "restored") {
        const line = `version:${version || history.length + 1} ${text || ""}`.trim();
        if (line) history.push(line);
      }
    });
  }

  if (history.length === 0 && commentText) {
    history.push(`version:1 ${commentText}`);
  }

  const payload = {
    status,
    history,
    version: record?.comment_version ?? record?.commentVersion ?? (history.length || 1),
    hash: record?.comment_hash ?? record?.commentHash ?? null,
    updated_at: record?.comment_updated_at ?? record?.commentUpdatedAt ?? null,
    deleted_at: record?.comment_deleted_at ?? record?.commentDeletedAt ?? null,
    last_seen_at: record?.comment_last_seen_at ?? record?.commentLastSeenAt ?? null,
    current: status === "deleted" ? "" : commentText || "",
  };

  try {
    return JSON.stringify(payload);
  } catch (_) {
    return null;
  }
};

const mapOrderRecord = (record, meta) => {
  const bandNumber = normalizeBandNumber(record);
  const postNumber = normalizePostNumber(record);
  const postKey = record?.post_key ?? record?.postKey ?? buildPostKey(bandNumber, postNumber);

  let orderId = record?.order_id ?? record?.orderId ?? record?.id ?? null;
  if (!orderId) {
    const commentId = record?.commentId ?? record?.comment_id ?? record?.band_comment_id ?? null;
    const commentKey = record?.commentKey ?? record?.comment_key ?? null;
    if (postKey && commentId != null) orderId = `order_${postKey}_${commentId}`;
    if (!orderId && postKey && commentKey) orderId = `order_${postKey}_${commentKey}`;
  }
  if (!orderId) return null;

  const commentText =
    record?.comment ??
    record?.commentText ??
    record?.orderText ??
    record?.comment_body ??
    record?.body ??
    null;

  const orderedAt =
    normalizeIso(record?.ordered_at) ??
    normalizeIso(record?.commentCreatedAt) ??
    normalizeIso(record?.createdAt) ??
    normalizeIso(record?.comment_created_at) ??
    normalizeIso(record?.capturedAt) ??
    normalizeIso(record?.comment_last_seen_at) ??
    normalizeIso(record?.commentLastSeenAt) ??
    normalizeIso(meta?.ts) ??
    normalizeIso(Date.now());

  const updatedAt =
    normalizeIso(record?.updated_at) ??
    normalizeIso(record?.updatedAt) ??
    normalizeIso(record?.comment_updated_at) ??
    normalizeIso(record?.commentUpdatedAt) ??
    orderedAt ??
    normalizeIso(Date.now());

  const commentChange = normalizeCommentChange(record, commentText || "");
  let contentPayload = null;
  try {
    contentPayload = JSON.stringify({
      source: "extension",
      raw: record,
      meta: meta || null,
    });
  } catch (_) {
    contentPayload = null;
  }

  return {
    order_id: String(orderId),
    user_id: record?.user_id ?? record?.userId ?? null,
    post_number: postNumber ?? null,
    band_number: bandNumber ?? null,
    customer_name:
      record?.customer_name ??
      record?.customerName ??
      record?.memberName ??
      record?.authorName ??
      null,
    comment: commentText,
    status: record?.status ?? record?.orderStatus ?? "주문완료",
    ordered_at: orderedAt,
    updated_at: updatedAt,
    post_key: postKey ?? null,
    band_key: bandNumber ?? null,
    comment_key: record?.comment_key ?? record?.commentKey ?? null,
    product_id: record?.product_id ?? record?.productId ?? null,
    memo: record?.memo ?? null,
    band_comment_id: record?.band_comment_id ?? record?.commentId ?? null,
    band_comment_url: record?.band_comment_url ?? record?.postUrl ?? record?.post_url ?? null,
    comment_change: commentChange,
    content: contentPayload,
  };
};

const mapProductRecord = (record, meta) => {
  const productId = record?.product_id ?? record?.productId ?? record?.id ?? null;
  if (!productId) return null;

  const bandNumber = normalizeBandNumber(record);
  const postNumber = normalizePostNumber(record);
  const postKey = record?.post_key ?? record?.postKey ?? buildPostKey(bandNumber, postNumber);

  const photosData = normalizePhotosData(
    record?.photos_data ??
      record?.photosData ??
      record?.images ??
      record?.image_urls ??
      record?.imageUrls
  );
  const imageUrls = normalizeImageUrls(
    record?.image_urls ?? record?.imageUrls ?? record?.images
  );

  return {
    product_id: String(productId),
    user_id: record?.user_id ?? record?.userId ?? null,
    band_number: bandNumber ?? null,
    title: record?.title ?? record?.name ?? record?.product_name ?? record?.productName ?? null,
    base_price: record?.base_price ?? record?.price ?? record?.basePrice ?? null,
    barcode: record?.barcode ?? record?.bar_code ?? null,
    post_id: postNumber ?? null,
    updated_at:
      normalizeIso(record?.updated_at) ??
      normalizeIso(record?.updatedAt) ??
      normalizeIso(record?.createdAt) ??
      normalizeIso(Date.now()),
    pickup_date: record?.pickup_date ?? record?.pickupDate ?? null,
    post_key: postKey ?? null,
    band_key: bandNumber ?? null,
    image_url: record?.image_url ?? record?.imageUrl ?? null,
    image_urls: imageUrls,
    photos_data: photosData,
    content: record?.content ?? null,
  };
};

const mapPostRecord = (record, meta) => {
  const postKey = record?.post_key ?? record?.postKey ?? null;
  const fallbackPostId = postKey ? parsePostIdFromKey(postKey) : null;
  const compositePostId = parsePostIdFromComposite(record?.id);
  const postId =
    record?.post_id ??
    record?.postId ??
    record?.remotePostId ??
    fallbackPostId ??
    compositePostId ??
    null;
  if (!postId) return null;
  const postIdValue = Number(postId);
  const postIdFinal = Number.isFinite(postIdValue) ? postIdValue : String(postId);

  const bandNumber = normalizeBandNumber(record);
  const normalizedPostKey = postKey ?? buildPostKey(bandNumber, postId);
  const photosData = normalizePhotosData(
    record?.photos_data ??
      record?.photosData ??
      record?.images ??
      record?.image_urls ??
      record?.imageUrls
  );
  const imageUrls = normalizeImageUrls(
    record?.image_urls ?? record?.imageUrls ?? record?.images
  );

  const postedAt =
    normalizeIso(record?.posted_at) ??
    normalizeIso(record?.postedAt) ??
    normalizeIso(record?.createdAt) ??
    normalizeIso(record?.created_at) ??
    normalizeIso(record?.post_created_at) ??
    normalizeIso(Date.now());
  const updatedAt =
    normalizeIso(record?.updated_at) ??
    normalizeIso(record?.updatedAt) ??
    postedAt ??
    normalizeIso(Date.now());

  return {
    post_id: postIdFinal,
    user_id: record?.user_id ?? record?.userId ?? null,
    band_number: bandNumber ?? null,
    band_post_url: record?.band_post_url ?? record?.postUrl ?? record?.post_url ?? null,
    author_name: record?.author_name ?? record?.authorName ?? record?.author ?? null,
    title: record?.title ?? record?.postTitle ?? null,
    pickup_date: record?.pickup_date ?? record?.pickupDate ?? null,
    photos_data: photosData,
    image_urls: imageUrls,
    post_key: normalizedPostKey ?? null,
    band_key: bandNumber ?? null,
    content: record?.content ?? null,
    posted_at: postedAt,
    updated_at: updatedAt,
  };
};

const mapRecord = (kind, record, meta) => {
  if (kind === "orders") return mapOrderRecord(record, meta);
  if (kind === "products") return mapProductRecord(record, meta);
  if (kind === "posts") return mapPostRecord(record, meta);
  return null;
};

const resolveKey = (kind, record) => {
  if (!record) return null;
  if (kind === "orders") return record.order_id ?? record.orderId ?? null;
  if (kind === "products") return record.product_id ?? record.productId ?? null;
  if (kind === "posts") return record.post_id ?? record.postId ?? null;
  if (kind === "comment_orders") {
    return (
      record.comment_order_id ??
      record.commentOrderId ??
      record.comment_key ??
      record.commentKey ??
      null
    );
  }
  return null;
};

const resolveUpdatedAt = (record) => {
  const raw =
    record?.updated_at ??
    record?.comment_created_at ??
    record?.ordered_at ??
    record?.posted_at ??
    null;
  const ts = raw ? Date.parse(String(raw)) : NaN;
  return Number.isFinite(ts) ? ts : 0;
};

const queueMappedRecords = (kind, records, meta) => {
  const mapped = records
    .map((record) => mapRecord(kind, record, meta))
    .filter(Boolean);
  if (mapped.length === 0) return;

  const bucket = pending[kind];
  if (!bucket) return;
  pendingSchema[kind] = "legacy";

  mapped.forEach((record) => {
    const key = resolveKey(kind, record);
    if (!key) return;
    const existing = bucket.get(key);
    if (!existing || resolveUpdatedAt(record) >= resolveUpdatedAt(existing)) {
      bucket.set(key, record);
    }
  });

  if (flushTimer != null) return;
  flushTimer = setTimeout(flushQueue, flushDelayMs);
};

const queueSupabaseRecords = (kind, records) => {
  const list = records.filter(Boolean);
  if (list.length === 0) return;
  const bucket = pending[kind];
  if (!bucket) return;
  pendingSchema[kind] = "supabase";

  list.forEach((record) => {
    const key = resolveKey(kind, record);
    if (!key) return;
    const existing = bucket.get(key);
    if (!existing || resolveUpdatedAt(record) >= resolveUpdatedAt(existing)) {
      bucket.set(key, record);
    }
  });

  if (flushTimer != null) return;
  flushTimer = setTimeout(flushQueue, flushDelayMs);
};

const requeue = (kind, records) => {
  const bucket = pending[kind];
  if (!bucket) return;
  records.forEach((record) => {
    const key = resolveKey(kind, record);
    if (!key) return;
    bucket.set(key, record);
  });
};

const flushQueue = async () => {
  flushTimer = null;

  const debug = (() => {
    try {
      return !!(typeof window !== "undefined" && window.__BOH_IDB_DEBUG__);
    } catch (_) {
      return false;
    }
  })();

  if (!isIndexedDBAvailable()) {
    pending.orders.clear();
    pending.products.clear();
    pending.posts.clear();
    pending.comment_orders.clear();
    return;
  }

  const orders = Array.from(pending.orders.values());
  const products = Array.from(pending.products.values());
  const posts = Array.from(pending.posts.values());
  const commentOrders = Array.from(pending.comment_orders.values());

  pending.orders.clear();
  pending.products.clear();
  pending.posts.clear();
  pending.comment_orders.clear();

  if (!orders.length && !products.length && !posts.length && !commentOrders.length) return;

  const postAck = (payload) => {
    try {
      if (typeof window === "undefined" || !window.postMessage) return;
      window.postMessage({ type: "BOH_OFFLINE_ACK", payload }, window.location.origin);
    } catch (_) {}
  };

  const writeStore = async (storeName, items, schema) => {
    if (!items.length) return false;
    try {
      let count = 0;
      if (storeName === "comment_orders") {
        count = await bulkMerge(storeName, items);
      } else if (schema === "supabase") {
        count = await bulkMerge(storeName, items);
      } else {
        count = await bulkPut(storeName, items);
      }
      postAck({ store: storeName, count: count ?? items.length, ok: true, schema });
      return true;
    } catch (err) {
      postAck({
        store: storeName,
        count: items.length,
        ok: false,
        schema,
        error: (err && (err.message || err.toString())) || "unknown",
      });
      throw err;
    }
  };

  let anySuccess = false;
  let hadFailure = false;

  try {
    if (debug) {
      console.log("[BOH][offline-bridge] flush", {
        orders: orders.length,
        products: products.length,
        posts: posts.length,
        comment_orders: commentOrders.length,
      });
    }
    if (orders.length) {
      try {
        const ok = await writeStore("orders", orders, pendingSchema.orders);
        anySuccess = anySuccess || ok;
      } catch (_) {
        hadFailure = true;
        requeue("orders", orders);
      }
    }
    if (products.length) {
      try {
        const ok = await writeStore("products", products, pendingSchema.products);
        anySuccess = anySuccess || ok;
      } catch (_) {
        hadFailure = true;
        requeue("products", products);
      }
    }
    if (posts.length) {
      try {
        const ok = await writeStore("posts", posts, pendingSchema.posts);
        anySuccess = anySuccess || ok;
      } catch (_) {
        hadFailure = true;
        requeue("posts", posts);
      }
    }
    if (commentOrders.length) {
      try {
        const ok = await writeStore("comment_orders", commentOrders, "supabase");
        anySuccess = anySuccess || ok;
      } catch (_) {
        hadFailure = true;
        requeue("comment_orders", commentOrders);
      }
    }
  } finally {
    if (anySuccess) {
      dispatchIndexedDbSyncEvent();
    }
    if (hadFailure && flushTimer == null) {
      flushTimer = setTimeout(flushQueue, flushDelayMs);
    }
  }
};

export const installExtensionOfflineBridge = (options = {}) => {
  if (typeof window === "undefined") return () => {};
  if (window.__bohOfflineBridgeInstalled) return () => {};
  window.__bohOfflineBridgeInstalled = true;

  const nextDelay = Number(options.debounceMs);
  if (Number.isFinite(nextDelay) && nextDelay > 0) {
    flushDelayMs = nextDelay;
  }

  const handler = (event) => {
    try {
      if (!event || event.source !== window) return;
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type !== BRIDGE_MESSAGE_TYPE) return;
      const payload = data.payload || null;
      if (!payload || typeof payload !== "object") return;
      const kind = payload.kind;
      if (!kind || !["orders", "products", "posts", "comment_orders"].includes(String(kind))) return;
      try {
        if (window.__BOH_IDB_DEBUG__) {
          const count = Array.isArray(payload.records) ? payload.records.length : 0;
          console.log("[BOH][offline-bridge] recv", { kind, count, schema: payload.schema || payload?.meta?.schema || null });
        }
      } catch (_) {}
      const records = toArray(payload.records);
      if (!records.length) return;
      const schema = payload.schema || payload?.meta?.schema || null;
      if (schema === "supabase") {
        queueSupabaseRecords(String(kind), records);
      } else {
        queueMappedRecords(String(kind), records, payload.meta || null);
      }
    } catch (_) {
      // ignore
    }
  };

  window.addEventListener("message", handler);
  return () => {
    window.removeEventListener("message", handler);
    window.__bohOfflineBridgeInstalled = false;
  };
};
