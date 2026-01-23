"use client";

import supabase from "./supabaseClient";
import {
  isIndexedDBAvailable,
  bulkPut,
  saveSnapshot,
  setMeta,
  getMeta,
  clearStoresByUserId,
} from "./indexedDbClient";
import { dispatchIndexedDbSyncEvent } from "./indexedDbSync";

const POST_COLUMNS =
  "post_id,user_id,band_number,band_post_url,author_name,title,pickup_date,photos_data,post_key,band_key,content,posted_at,comment_count,last_checked_comment_at";
const PRODUCT_COLUMNS =
  "product_id,user_id,band_number,title,base_price,barcode,post_id,updated_at,pickup_date,post_key,band_key";
const ORDER_COLUMNS =
  "order_id,user_id,post_number,band_number,customer_name,comment,status,ordered_at,updated_at,post_key,band_key,comment_key,memo";
const COMMENT_ORDER_COLUMNS = "*";

const RANGE_20_DAYS_MS = 20 * 24 * 60 * 60 * 1000;

const resolveOrderProcessingMode = (explicitMode) => {
  if (explicitMode) return String(explicitMode).toLowerCase();
  try {
    const sessionData = sessionStorage.getItem("userData");
    if (!sessionData) return "legacy";
    const parsed = JSON.parse(sessionData);
    const mode =
      parsed?.orderProcessingMode ||
      parsed?.order_processing_mode ||
      parsed?.user?.orderProcessingMode ||
      parsed?.user?.order_processing_mode ||
      "legacy";
    return String(mode).toLowerCase();
  } catch (_) {
    return "legacy";
  }
};

const resolveExcludedCustomers = () => {
  try {
    const sessionData = sessionStorage.getItem("userData");
    if (!sessionData) return [];
    const parsed = JSON.parse(sessionData);
    const raw = parsed?.excludedCustomers ?? parsed?.excluded_customers;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  } catch (_) {
    return [];
  }
};

const ensureCommentOrderId = (row) => {
  if (!row) return row;
  const existing = row.comment_order_id ?? row.commentOrderId;
  if (existing) return { ...row, comment_order_id: existing };
  const fallback = row.order_id ?? row.id;
  if (!fallback) return row;
  return {
    ...row,
    comment_order_id: typeof fallback === "string" ? fallback : String(fallback),
  };
};

const fetchWithRange = async (
  table,
  columns,
  userId,
  dateColumn,
  rangeMs,
  excludeNames = [],
  options = {}
) => {
  const { sinceOverride, limit = 1000, statusFilter } = options;
  const nameColumn = table === "comment_orders" ? "commenter_name" : "customer_name";
  const since = sinceOverride || new Date(Date.now() - rangeMs).toISOString();
  const results = [];
  let offset = 0;

  while (true) {
    let query = supabase
      .from(table)
      .select(columns)
      .eq("user_id", userId)
      .gte(dateColumn, since)
      .order(dateColumn, { ascending: false })
      .range(offset, offset + limit - 1);

    if (statusFilter?.column && statusFilter?.value) {
      query = query.eq(statusFilter.column, statusFilter.value);
    }

    if (
      (table === "orders" || table === "comment_orders") &&
      Array.isArray(excludeNames) &&
      excludeNames.length > 0
    ) {
      const exactNames = excludeNames
        .map((n) => (n || "").toString().trim())
        .filter(Boolean);
      if (exactNames.length > 0) {
        const sanitized = exactNames
          .map((n) => n.replace(/'/g, "''"))
          .map((n) => `'${n}'`);
        query = query.not(nameColumn, "in", `(${sanitized.join(",")})`);
      }
    }

    const { data, error } = await query;
    if (error) throw new Error(`${table} 불러오기 실패: ${error.message}`);
    if (Array.isArray(data) && data.length > 0) {
      results.push(...data);
    }
    if (!data || data.length < limit) {
      break;
    }
    offset += limit;
  }

  return results;
};

export const backupUserDataToIndexedDb = async (options = {}) => {
  const {
    userId,
    mode,
    rangeMs = RANGE_20_DAYS_MS,
    includePosts = true,
    includeProducts = true,
    includeOrders = true,
  } = options;

  if (!isIndexedDBAvailable()) {
    return { skipped: true, reason: "indexeddb-unavailable" };
  }
  if (!userId) {
    throw new Error("유효한 사용자 ID가 필요합니다.");
  }

  const resolvedMode = resolveOrderProcessingMode(mode);
  const isRawMode = resolvedMode === "raw";
  const orderTable = isRawMode ? "comment_orders" : "orders";
  const orderDateColumn = isRawMode ? "comment_created_at" : "ordered_at";
  const orderNameColumn = isRawMode ? "commenter_name" : "customer_name";
  const orderColumns = isRawMode ? COMMENT_ORDER_COLUMNS : ORDER_COLUMNS;

  const excludedCustomers = resolveExcludedCustomers().map((c) =>
    (c || "").toString().trim().toLowerCase()
  );

  const lastBackupAt = await getMeta("lastBackupAt");
  const sinceOverride =
    lastBackupAt && !Number.isNaN(Date.parse(lastBackupAt))
      ? new Date(lastBackupAt).toISOString()
      : null;
  const isInitialBackup = !sinceOverride;

  const orderStatusColumn = orderTable === "comment_orders" ? "order_status" : "status";

  const tasks = [];
  tasks.push(
    includePosts
      ? fetchWithRange("posts", POST_COLUMNS, userId, "posted_at", rangeMs, [], { sinceOverride })
      : Promise.resolve([])
  );
  tasks.push(
    includeProducts
      ? fetchWithRange("products", PRODUCT_COLUMNS, userId, "updated_at", rangeMs, [], { sinceOverride })
      : Promise.resolve([])
  );
  tasks.push(
    includeOrders
      ? fetchWithRange(
          orderTable,
          orderColumns,
          userId,
          orderDateColumn,
          rangeMs,
          excludedCustomers,
          {
            sinceOverride,
            statusFilter: { column: orderStatusColumn, value: "주문완료" },
          }
        )
      : Promise.resolve([])
  );

  const [posts, products, orders] = await Promise.all(tasks);

  const filteredOrders = orders.filter((o) => {
    const name = (o[orderNameColumn] || "").toString().trim().toLowerCase();
    return (
      !excludedCustomers.includes(name) &&
      !excludedCustomers.some((ex) => ex && name.includes(ex))
    );
  });

  const storesToClear = [];
  if (isInitialBackup) {
    if (includePosts) storesToClear.push("posts");
    if (includeProducts) storesToClear.push("products");
    if (includeOrders) {
      storesToClear.push(orderTable);
      if (orderTable !== "orders") storesToClear.push("orders");
    }
    if (storesToClear.length > 0) {
      await clearStoresByUserId(userId, [...new Set(storesToClear)]);
    }
  }

  if (includePosts) await bulkPut("posts", posts);
  if (includeProducts) await bulkPut("products", products);
  if (includeOrders) {
    const normalizedOrders = isRawMode
      ? filteredOrders.map(ensureCommentOrderId)
      : filteredOrders;
    await bulkPut(orderTable, normalizedOrders);
  }

  const counts = {};
  if (includePosts) counts.posts = posts.length;
  if (includeProducts) counts.products = products.length;
  if (includeOrders) {
    counts[orderTable] = filteredOrders.length;
    if (orderTable !== "orders") counts.orders = filteredOrders.length;
  }

  const snapshot = await saveSnapshot({
    counts,
    notes: `user:${userId}`,
  });
  await setMeta("lastBackupAt", snapshot.createdAt);
  dispatchIndexedDbSyncEvent();

  return {
    posts: posts.length,
    products: products.length,
    orders: filteredOrders.length,
    orderStore: orderTable,
    mode: resolvedMode,
  };
};
