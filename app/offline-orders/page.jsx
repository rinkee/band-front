"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import JsBarcode from "jsbarcode";
import { ArrowPathIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline";
import {
  searchOrders,
  getRecent,
  upsertOrderLocal,
  addToQueue,
  isIndexedDBAvailable,
  getPendingQueue,
  getAllFromStore,
  deleteQueueItems,
  getMeta,
  setMeta,
  bulkPut,
} from "../lib/indexedDbClient";
import supabase from "../lib/supabaseClient";
import Toast from "../components/Toast";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 30;
const HEALTH_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`
  : null;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const POST_COLUMNS =
  "post_id,user_id,band_number,band_post_url,author_name,title,pickup_date,photos_data,post_key,band_key,content,posted_at";
const PRODUCT_COLUMNS =
  "product_id,user_id,band_number,title,base_price,barcode,post_id,updated_at,pickup_date,post_key,band_key";
const ORDER_COLUMNS =
  "order_id,user_id,post_number,band_number,customer_name,comment,status,ordered_at,updated_at,post_key,band_key,comment_key,memo";

// 바코드 컴포넌트
const Barcode = ({ value, width = 1.2, height = 32, fontSize = 12 }) => {
  const barcodeRef = useRef(null);
  useEffect(() => {
    if (barcodeRef.current && value) {
      try {
        JsBarcode(barcodeRef.current, value, {
          format: "CODE128",
          lineColor: "#000",
          width,
          height,
          displayValue: true,
          fontSize,
          margin: 10,
          background: "transparent",
        });
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("Barcode Error:", error);
        }
        if (barcodeRef.current) barcodeRef.current.innerHTML = "";
      }
    }
  }, [value, width, height, fontSize]);

  return <svg ref={barcodeRef}></svg>;
};

export default function OfflineOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [queueSize, setQueueSize] = useState(0);
  const [supported, setSupported] = useState(true);
  const [products, setProducts] = useState([]);
  const [posts, setPosts] = useState([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [exactCustomerFilter, setExactCustomerFilter] = useState("");
  const [incrementalSyncing, setIncrementalSyncing] = useState(false);
  const [excludedCustomers, setExcludedCustomers] = useState([]);
  const [storageInfo, setStorageInfo] = useState(null);
  const [statusFilter, setStatusFilter] = useState("주문완료"); // 기본값: 주문완료
  const [currentPage, setCurrentPage] = useState(1);
  const listTopRef = useRef(null);
  // 서버 상태: 'checking' | 'healthy' | 'offline'
  const [supabaseHealth, setSupabaseHealth] = useState("checking");
  const syncingRef = useRef(false);
  const syncDebounceRef = useRef(null);
  const [userData, setUserData] = useState(null);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef(null);
  const [dbCounts, setDbCounts] = useState({ posts: 0, products: 0, orders: 0, comments: 0 });

  // product_id에서 band_number와 post_number 추출
  // 형식: prod_{user_id}_{band_number}_{post_number}_item{n}
  const extractBandPostFromProductId = (productId) => {
    if (!productId) return null;
    // prod_cda8244e-b5c1-4f08-9129-555b4122e1bd_95098260_12222_item1
    const match = productId.match(/^prod_[^_]+-[^_]+-[^_]+-[^_]+-[^_]+_(\d+)_(\d+)_item/);
    if (match) {
      return { band_number: match[1], post_number: match[2] };
    }
    return null;
  };

  // post_key를 키로 하는 상품 맵 생성
  const productsByPostKey = useMemo(() => {
    const map = {};
    products.forEach((p) => {
      const key = p.post_key || p.post_id;
      if (key) {
        if (!map[key]) map[key] = [];
        map[key].push(p);
      }
    });
    return map;
  }, [products]);

  // post_key 기준으로 포스트 맵 생성 (이미지 fallback용)
  const postsByPostKey = useMemo(() => {
    const map = {};
    posts.forEach((post) => {
      const key = post.post_key || post.post_id;
      if (key) map[key] = post;
    });
    return map;
  }, [posts]);

  // band_number + post_number 조합을 키로 하는 상품 맵 생성
  // product_id에서도 band/post 정보 추출
  const productsByBandPost = useMemo(() => {
    const map = {};
    products.forEach((p) => {
      let bandNum = p.band_number;
      let postNum = p.post_number;

      // band_number/post_number가 없으면 product_id에서 추출
      if (bandNum == null || postNum == null) {
        const extracted = extractBandPostFromProductId(p.product_id);
        if (extracted) {
          bandNum = extracted.band_number;
          postNum = extracted.post_number;
        }
      }

      if (bandNum != null && postNum != null) {
        const key = `${bandNum}_${String(postNum)}`;
        if (!map[key]) map[key] = [];
        map[key].push(p);
      }
    });
    console.log("[offline-orders] productsByBandPost 맵:", Object.keys(map));
    return map;
  }, [products]);

  // product_id로 상품 찾기
  const getProductById = (productId) => {
    if (!productId) return null;
    return products.find((p) => p.product_id === productId) || null;
  };

  const resolveUserId = () => {
    try {
      const sessionData = sessionStorage.getItem("userData");
      if (!sessionData) return null;
      const parsed = JSON.parse(sessionData);
      return parsed?.userId || null;
    } catch {
      return null;
    }
  };

  const filterByUserId = (items = []) => {
    const uid = resolveUserId();
    if (!uid) return [];
    return items.filter((item) => item?.user_id === uid);
  };

  // 주문에 해당하는 상품 목록 가져오기 (orders-test와 동일한 로직)
  const getCandidateProductsForOrder = (order) => {
    const pk = order.post_key || order.postKey;
    const band = order.band_number || order.bandNumber || order.band_key || order.bandKey;
    const postNum = order.post_number ?? order.postNumber;

    let list = [];
    // 1. post_key로 찾기
    if (pk && productsByPostKey[pk]) {
      list = productsByPostKey[pk];
    }
    // 2. band_number + post_number 조합으로 찾기
    else if (band != null && postNum != null) {
      const k = `${band}_${String(postNum)}`;
      if (productsByBandPost[k]) {
        list = productsByBandPost[k];
      }
    }

    // 3. 못 찾으면 product_id로 단일 상품 반환
    if (list.length === 0) {
      const single = getProductById(order.product_id);
      return single ? [single] : [];
    }

    return Array.isArray(list) ? list : [];
  };

  // 상품명에서 날짜 prefix 제거
  const cleanProductName = (name = "") => {
    return name.replace(/^\[[^\]]+\]\s*/, "").trim();
  };

  const parseJsonSafe = (value) => {
    if (!value) return null;
    if (typeof value === "object") return value;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const getPostImage = (order) => {
    const postKey = order?.post_key || order?.postKey;
    const post = postKey ? postsByPostKey[postKey] : null;
    if (!post) return null;
    const photos = parseJsonSafe(post.photos_data);
    if (Array.isArray(photos) && photos.length > 0) {
      const first = photos[0];
      if (first?.url) return first.url;
    }
    if (Array.isArray(post.image_urls) && post.image_urls[0]) return post.image_urls[0];
    if (typeof post.image_urls === "string") {
      try {
        const parsed = JSON.parse(post.image_urls);
        if (Array.isArray(parsed) && parsed[0]) return parsed[0];
      } catch { }
    }
    return null;
  };

  const getProductImage = (product, order) => {
    const photos = parseJsonSafe(product?.photos_data);
    if (Array.isArray(photos) && photos[0]?.url) return photos[0].url;
    if (product?.image_url) return product.image_url;
    if (Array.isArray(product?.image_urls) && product.image_urls[0]) return product.image_urls[0];
    if (typeof product?.image_urls === "string") {
      try {
        const parsed = JSON.parse(product.image_urls);
        if (Array.isArray(parsed) && parsed[0]) return parsed[0];
      } catch { }
    }
    return getPostImage(order);
  };

  const syncIncremental = async () => {
    if (incrementalSyncing) return;
    const userId = resolveUserId();
    if (!userId) return;
    setIncrementalSyncing(true);
    try {
      const lastSyncAt =
        (await getMeta("lastSyncAt")) ||
        new Date(Date.now() - ONE_WEEK_MS).toISOString();

      const fetchSince = async (table, columns, dateColumn) => {
        const { data, error } = await supabase
          .from(table)
          .select(columns)
          .eq("user_id", userId)
          .gte(dateColumn, lastSyncAt)
          .order(dateColumn, { ascending: false });
        if (error) throw new Error(`${table} 불러오기 실패: ${error.message}`);
        return data || [];
      };

      const [postsNew, productsNew, ordersNew] = await Promise.all([
        fetchSince("posts", POST_COLUMNS, "posted_at"),
        fetchSince("products", PRODUCT_COLUMNS, "updated_at"),
        fetchSince("orders", ORDER_COLUMNS, "updated_at"),
      ]);

      await bulkPut("posts", postsNew);
      await bulkPut("products", productsNew);
      await bulkPut("orders", ordersNew);
      await setMeta("lastSyncAt", new Date().toISOString());
      setToast({
        type: "success",
        message: `증분 동기화 완료 (posts ${postsNew.length}, products ${productsNew.length}, orders ${ordersNew.length})`,
      });
    } catch (err) {
      setToast({
        type: "error",
        message: err.message || "증분 동기화 중 오류가 발생했습니다.",
      });
    } finally {
      await loadRecentOrders();
      await loadProducts();
      await loadPosts();
      await loadDbCounts();
      setIncrementalSyncing(false);
    }
  };

  // 상품 번호 추출
  const getItemNumber = (p, idx) => {
    const n1 = Number(p?.item_number);
    if (Number.isFinite(n1) && n1 > 0) return n1;
    try {
      const m = String(p?.product_id || "").match(/item(\d+)/i);
      if (m && m[1]) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > 0) return n;
      }
    } catch { }
    return idx + 1;
  };

  const loadDbCounts = async () => {
    try {
      const userId = resolveUserId();
      if (!userId) {
        setDbCounts({ posts: 0, products: 0, orders: 0, comments: 0 });
        return;
      }

      const [allPosts, allProducts, allOrders] = await Promise.all([
        getAllFromStore("posts"),
        getAllFromStore("products"),
        getAllFromStore("orders"),
      ]);

      const userPosts = allPosts.filter(item => item?.user_id === userId);
      const userProducts = allProducts.filter(item => item?.user_id === userId);
      const userOrders = allOrders.filter(item => item?.user_id === userId);

      setDbCounts({
        posts: userPosts.length,
        products: userProducts.length,
        orders: userOrders.length,
        comments: 0, // 댓글은 별도 테이블이 없으므로 0
      });
    } catch (err) {
      console.error("[offline-orders] DB 카운트 로드 실패:", err);
      setDbCounts({ posts: 0, products: 0, orders: 0, comments: 0 });
    }
  };

  const loadProducts = async () => {
    try {
      const allProducts = await getAllFromStore("products");
      console.log("[offline-orders] 로드된 상품 수:", allProducts.length);
      const filtered = filterByUserId(allProducts);
      if (allProducts.length > 0) {
        const sample = allProducts[0];
        console.log("[offline-orders] 상품 샘플:", sample);
        console.log("[offline-orders] 상품 키 정보:", {
          product_id: sample.product_id,
          post_key: sample.post_key,
          post_id: sample.post_id,
          band_number: sample.band_number,
          post_number: sample.post_number,
        });
      }
      setProducts(filtered);
    } catch (_) {
      setProducts([]);
    }
  };

  const loadPosts = async () => {
    try {
      const allPosts = await getAllFromStore("posts");
      setPosts(filterByUserId(allPosts));
    } catch (_) {
      setPosts([]);
    }
  };

  const loadQueueSize = async () => {
    try {
      const pending = await getPendingQueue();
      setQueueSize(pending.length);
    } catch (_) {
      setQueueSize(0);
    }
  };

  const loadRecentOrders = async () => {
    setLoading(true);
    try {
      const allOrders = await getAllFromStore("orders");
      console.log("[offline-orders] 로드된 주문 수:", allOrders.length);
      const filteredOrders = filterByUserId(allOrders);
      const recent = [...filteredOrders]
        .sort((a, b) => getOrderTimestamp(b) - getOrderTimestamp(a))
        .slice(0, 100); // 최신 주문 100개만 노출 (ordered_at 기준)
      if (recent.length > 0) {
        const sample = recent[0];
        console.log("[offline-orders] 주문 샘플:", sample);
        console.log("[offline-orders] 주문 키 정보:", {
          order_id: sample.order_id,
          post_key: sample.post_key,
          band_number: sample.band_number,
          post_number: sample.post_number,
          product_id: sample.product_id,
        });
      }
      // 새로운 결과가 비어 있고 기존 목록이 있으면 덮어쓰지 않음
      setOrders((prev) => {
        if (recent.length === 0 && prev.length > 0) {
          return prev;
        }
        return recent;
      });
    } catch (err) {
      setToast({
        message: err.message || "IndexedDB에서 주문을 불러오지 못했습니다.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  // 브라우저 저장 공간 추정
  const loadStorageEstimate = async () => {
    try {
      if (!("storage" in navigator) || !navigator.storage?.estimate) {
        setStorageInfo(null);
        return;
      }
      const { quota = 0, usage = 0 } = await navigator.storage.estimate();
      setStorageInfo({
        quota,
        usage,
        remaining: quota - usage,
      });
    } catch (err) {
      setStorageInfo(null);
    }
  };

  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes)) return "-";
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    return `${value.toFixed(1)} ${units[idx]}`;
  };

  useEffect(() => {
    if (!isIndexedDBAvailable()) {
      setSupported(false);
      setToast({
        message: "IndexedDB를 사용할 수 없습니다. 지원 브라우저에서 시도해주세요.",
        type: "error",
      });
      setLoading(false);
      return;
    }

    // sessionStorage에서 사용자 정보 및 제외 고객 목록 가져오기
    try {
      const sessionData = sessionStorage.getItem("userData");
      if (sessionData) {
        const parsedUserData = JSON.parse(sessionData);
        setUserData(parsedUserData);
        if (Array.isArray(parsedUserData.excluded_customers)) {
          setExcludedCustomers(parsedUserData.excluded_customers);
        }
      }
    } catch (err) {
      console.warn("사용자 정보 로드 실패:", err);
    }

    loadRecentOrders();
    loadQueueSize();
    loadProducts();
    loadPosts();
    loadDbCounts();
    loadStorageEstimate();

    // Supabase health check (polling)
    let healthTimer;
    const checkHealth = async () => {
      if (!HEALTH_URL || !navigator.onLine) {
        setSupabaseHealth("offline");
        return;
      }
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(HEALTH_URL, {
          method: "GET",
          signal: controller.signal,
          headers: SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {},
        });
        clearTimeout(timeoutId);
        // 200만 정상으로 간주, 그 외(401 포함)는 불안정 처리
        setSupabaseHealth(res.status === 200 ? "healthy" : "offline");
      } catch (_) {
        setSupabaseHealth("offline");
      }
    };
    checkHealth();
    healthTimer = setInterval(checkHealth, 30000);

    return () => {
      clearInterval(healthTimer);
    };
  }, []);

  // 사용자 드롭다운 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) {
        setUserDropdownOpen(false);
      }
    };

    if (userDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userDropdownOpen]);

  // 다른 페이지/컴포넌트에서 window.dispatchEvent(new Event("indexeddb-sync")) 호출 시 증분 동기화 실행
  useEffect(() => {
    const handler = () => syncIncremental();
    if (typeof window !== "undefined") {
      window.addEventListener("indexeddb-sync", handler);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("indexeddb-sync", handler);
      }
    };
  }, [syncIncremental]);

  const handleSearch = async (term) => {
    setSearchTerm(term);
    if (!term) {
      await loadRecentOrders();
      return;
    }
    const results = await searchOrders(term, 200);
    setOrders(results);
  };

  const toggleSelect = (orderId) => {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId]
    );
  };

  const isSupabaseHealthy = supabaseHealth === "healthy";

  const handleBulkStatusUpdate = async (nextStatus) => {
    if (selectedOrderIds.length === 0) return;
    setBulkLoading(true);
    try {
      const now = new Date().toISOString();
      const updates = orders
        .filter((o) => selectedOrderIds.includes(o.order_id))
        .map((o) => ({
          ...o,
          status: nextStatus,
          updated_at: now,
        }));

      for (const updated of updates) {
        await upsertOrderLocal(updated);
        await addToQueue({
          table: "orders",
          op: "upsert",
          pkValue: updated.order_id,
          payload: updated,
          updatedAt: updated.updated_at,
        });
      }
      await loadQueueSize();

      setOrders((prev) =>
        prev.map((o) =>
          selectedOrderIds.includes(o.order_id)
            ? { ...o, status: nextStatus, updated_at: now }
            : o
        )
      );
      setSelectedOrderIds([]);
      const canSyncNow = isSupabaseHealthy && (typeof navigator === "undefined" || navigator.onLine);
      if (canSyncNow) {
        scheduleSyncQueue(2000);
        await syncIncremental();
        // 검색 결과 화면이 사라지지 않도록 검색어가 있으면 재검색 수행
        if (searchTerm) {
          await handleSearch(searchTerm);
        }
        setToast({
          type: "success",
          message: `선택한 ${updates.length}건을 '${nextStatus}'로 변경했습니다.`,
        });
      } else {
        setToast({
          type: "info",
          message: "서버 연결 복구 시 자동 동기화됩니다.",
        });
      }
    } catch (err) {
      setToast({
        type: "error",
        message: err.message || "일괄 상태 변경에 실패했습니다.",
      });
    } finally {
      setBulkLoading(false);
    }
  };

  // 헬스 OK 시 짧은 지연 후 배치 동기화
  const scheduleSyncQueue = (delayMs = 3000) => {
    const canSync =
      supabaseHealth === "healthy" && (typeof navigator === "undefined" || navigator.onLine);
    if (!canSync) return;
    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current);
    }
    syncDebounceRef.current = setTimeout(() => {
      syncDebounceRef.current = null;
      handleSyncQueue();
    }, delayMs);
  };

  const handleSyncQueue = async () => {
    if (!isIndexedDBAvailable()) {
      setToast({ type: "error", message: "IndexedDB를 사용할 수 없습니다." });
      return;
    }
    setSyncing(true);
    syncingRef.current = true;
    try {
      const currentUserId = resolveUserId();
      const queueItems = await getPendingQueue();
      const filteredQueue = currentUserId
        ? queueItems.filter((q) => !q.user_id || q.user_id === currentUserId)
        : queueItems;

      if (!filteredQueue.length) {
        setToast({ type: "info", message: "동기화할 항목이 없습니다." });
        return;
      }

      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: filteredQueue }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "동기화 실패");
      }
      const data = await response.json();

      // 성공 처리: 응답에 ok 필드가 있으면 ok만 제거, 없으면 전체 제거
      const okIds = Array.isArray(data?.results)
        ? data.results.filter((r) => r?.ok).map((r) => r.id)
        : filteredQueue.map((q) => q.id);

      await deleteQueueItems(okIds);
      await loadQueueSize();
      await syncIncremental();
      setToast({
        type: "success",
        message: `동기화 완료 (${okIds.length}/${queueItems.length})`,
      });
    } catch (err) {
      setToast({
        type: "error",
        message: err.message || "동기화 중 오류가 발생했습니다.",
      });
    } finally {
      setSyncing(false);
      syncingRef.current = false;
    }
  };

  // 언마운트 시 동기화 디바운스 타이머 정리
  useEffect(() => {
    return () => {
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // 필터/검색 변경 시 페이지를 1로 리셋
    setCurrentPage(1);
  }, [statusFilter, exactCustomerFilter, searchTerm]);

  const getOrderTimestamp = (order) => {
    const parse = (value) => {
      if (!value) return 0;
      const t = new Date(value).getTime();
      if (!Number.isNaN(t)) return t;
      return 0;
    };
    return (
      parse(order.ordered_at || order.orderedAt) ||
      parse(order.updated_at || order.updatedAt) ||
      parse(order.created_at || order.createdAt) ||
      0
    );
  };

  // pickup_date 기반 수령가능 판정 (주문완료 + 수령일이 오늘/미래)
  const isPickupAvailable = (order) => {
    const KST_OFFSET = 9 * 60 * 60 * 1000;
    const now = new Date(Date.now() + KST_OFFSET);
    const todayYmd = now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
    let pickupDate = null;

    // 주문에 pickup_date가 있으면 우선 사용
    if (order?.pickup_date) {
      pickupDate = order.pickup_date;
    } else {
      // 상품 데이터에서 fallback
      const pk = order?.post_key || order?.postKey;
      let list = [];
      if (pk && productsByPostKey[pk]) list = productsByPostKey[pk];
      const prod = order?.product_id ? list.find((p) => p.product_id === order.product_id) : list[0];
      pickupDate = prod?.pickup_date || null;
    }

    if (!pickupDate) return false;
    try {
      const dt = new Date(pickupDate);
      const kst = new Date(dt.getTime() + KST_OFFSET);
      const ymd = kst.getUTCFullYear() * 10000 + (kst.getUTCMonth() + 1) * 100 + kst.getUTCDate();
      return ymd >= todayYmd;
    } catch {
      return false;
    }
  };

  const displayedOrdersResult = useMemo(() => {
    if (!orders || orders.length === 0) return { list: [], total: 0 };

    // 제외 고객 필터링
    let filtered = orders;
    if (excludedCustomers.length > 0) {
      filtered = orders.filter((order) => {
        const customerName = order.customer_name || "";
        return !excludedCustomers.some((excluded) =>
          customerName.includes(excluded) || excluded.includes(customerName)
        );
      });
    }

    if (exactCustomerFilter) {
      filtered = filtered.filter(
        (order) => (order.customer_name || "").trim() === exactCustomerFilter
      );
    }

    // 상태 필터
    if (statusFilter && statusFilter !== "all") {
      const target = statusFilter;
      if (target === "수령가능") {
        filtered = filtered.filter(
          (order) =>
            (order.status || order.order_status) === "주문완료" &&
            isPickupAvailable(order)
        );
      } else {
        filtered = filtered.filter(
          (order) => (order.status || order.order_status) === target
        );
      }
    }

    // 댓글/주문일시(ordered_at) 기준 내림차순 정렬 (fallback: updated_at/created_at)
    const sorted = [...filtered].sort((a, b) => getOrderTimestamp(b) - getOrderTimestamp(a));
    const total = sorted.length;
    const start = (currentPage - 1) * PAGE_SIZE;
    const list = sorted.slice(start, start + PAGE_SIZE);
    return { list, total };
  }, [orders, excludedCustomers, exactCustomerFilter, statusFilter, productsByPostKey, currentPage]);

  const displayedOrders = displayedOrdersResult.list;
  const totalFilteredOrders = displayedOrdersResult.total;
  const totalPages = Math.max(1, Math.ceil(totalFilteredOrders / PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages || 1);
    }
  }, [currentPage, totalPages]);

  // 페이지 변경 시 상단으로 스크롤
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (listTopRef.current) {
        listTopRef.current.scrollIntoView({ behavior: "auto" });
      } else {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
    }
  }, [currentPage]);

  // 온라인/포커스/헬스 회복 시 자동 동기화
  useEffect(() => {
    const trySync = () => {
      if (!syncingRef.current && isSupabaseHealthy) {
        scheduleSyncQueue(500);
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("online", trySync);
      const visHandler = () => {
        if (document.visibilityState === "visible") trySync();
      };
      document.addEventListener("visibilitychange", visHandler);
      if (isSupabaseHealthy) {
        trySync();
      }
      return () => {
        window.removeEventListener("online", trySync);
        document.removeEventListener("visibilitychange", visHandler);
      };
    }
    return undefined;
  }, [isSupabaseHealthy]);

  // 페이지 이탈 경고 (대기열 있을 때)
  useEffect(() => {
    const handler = (e) => {
      if (queueSize > 0) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
      return undefined;
    };
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", handler);
      return () => window.removeEventListener("beforeunload", handler);
    }
    return undefined;
  }, [queueSize]);

  const formatDate = (value) => {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
    });
  };


  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 flex flex-col gap-4">
      {/* 헤더 영역 */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                로컬 모드
              </span>
              <h1 className="text-lg font-semibold text-gray-900">주문 관리</h1>
            </div>
            {/* DB 상태 인디케이터 + 용량/데이터 정보 */}
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span
                className={`inline-flex w-2 h-2 rounded-full ${
                  supabaseHealth === "checking"
                    ? "bg-amber-400"
                    : isSupabaseHealthy
                    ? "bg-green-500"
                    : "bg-red-500"
                }`}
              />
              <span>
                {supabaseHealth === "checking"
                  ? "서버 상태 확인 중"
                  : isSupabaseHealthy
                  ? "서버 정상"
                  : "서버 오프라인"}
              </span>
              <span className="text-gray-400">|</span>
              <span>
                저장용량 {storageInfo ? `${formatBytes(storageInfo.usage)} / ${formatBytes(storageInfo.quota)}` : "확인 불가"}
              </span>
              <span className="text-gray-400">|</span>
              <span>
                게시물 {dbCounts.posts}건 / 상품 {dbCounts.products}건 / 주문 {dbCounts.orders}건
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
            {/* 동기화 버튼 */}
            <button
              onClick={handleSyncQueue}
              disabled={syncing || queueSize === 0}
              className="ml-2 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <ArrowPathIcon className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing
                ? "동기화 중"
                : queueSize > 0
                  ? `동기화 대기중 (${queueSize})`
                  : "동기화"}
            </button>
            <Link
              href="/indexeddb-view"
              className="px-2 py-1.5 rounded-md text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              title="IndexedDB 상세 보기"
            >
              DB 보기
            </Link>

          </div>
        </div>
        {/* 안내 문구 */}
        <p className="mt-2 text-sm text-gray-700">
          서버 연결이 불안정할 때 로컬 저장소(IndexedDB)의 백업 데이터를 사용합니다.
          변경사항은 서버 복구 시 자동으로 동기화됩니다.
        </p>
      </div>

      {!supported && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
          IndexedDB를 지원하지 않는 환경입니다.
        </div>
      )}

      <div className="mb-[80px]">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden" ref={listTopRef}>
          {/* 상태 필터 */}
          <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2 text-gray-500">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
              </svg>
              <span className="text-sm font-medium">상태</span>
            </div>
            <div className="flex items-center gap-x-4 md:gap-x-6 gap-y-2 flex-wrap">
              {[
                { value: "all", label: "전체" },
                { value: "주문완료", label: "주문완료" },
                { value: "수령가능", label: "수령가능만 보기" },
                { value: "수령완료", label: "수령완료" },
                { value: "주문취소", label: "주문취소" },
                { value: "결제완료", label: "결제완료" },
              ].map((opt) => {
                const checked = statusFilter === opt.value;
                return (
                  <label
                    key={opt.value}
                    className="flex items-center cursor-pointer group"
                  >
                    <div
                      className={`w-5 h-5 md:w-6 md:h-6 rounded-full border-2 flex items-center justify-center transition-colors mr-2 flex-shrink-0 ${checked
                        ? "bg-orange-500 border-orange-500"
                        : "bg-white border-gray-300 group-hover:border-gray-400"
                        }`}
                    >
                      {checked && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="1.5"
                          stroke="currentColor"
                          className="w-3.5 h-3.5 md:w-4 md:h-4 text-white"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      )}
                    </div>
                    <span className="text-sm md:text-base text-gray-700">
                      {opt.label}
                    </span>
                    <input
                      className="sr-only"
                      type="radio"
                      value={opt.value}
                      name="orderStatus"
                      checked={checked}
                      onChange={() => setStatusFilter(opt.value)}
                    />
                  </label>
                );
              })}
            </div>
          </div>
          {/* 검색 */}
          <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-200 bg-white">
            <div className="flex items-center gap-2 text-gray-500">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
              </svg>
              <span className="text-sm font-medium">검색</span>
            </div>
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 max-w-xl relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4 text-gray-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="고객명, 상품명, 바코드, post_key..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch(searchTerm)}
                  className="w-full border border-gray-300 rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
                {searchTerm && (
                  <button
                    onClick={() => {
                      setSearchTerm("");
                      setExactCustomerFilter("");
                      loadRecentOrders();
                    }}
                    className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <button
                onClick={() => handleSearch(searchTerm)}
                className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors"
              >
                검색
              </button>
              <button
                onClick={() => {
                  setSearchTerm("");
                  setExactCustomerFilter("");
                  loadRecentOrders();
                }}
                className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 flex items-center gap-1.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                </svg>
                초기화
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full w-full">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th
                    scope="col"
                    className="relative w-20 px-6 sm:w-16 sm:px-8 py-3 bg-gray-50"
                  >
                    <div className="absolute inset-y-0 left-4 sm:left-6 flex items-center">
                      <input
                        type="checkbox"
                        className="h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                        onChange={() => {
                          const allIds = displayedOrders.map((o) => o.order_id);
                          const allSelected = allIds.every((id) => selectedOrderIds.includes(id));
                          setSelectedOrderIds(allSelected ? [] : Array.from(new Set([...selectedOrderIds, ...allIds])));
                        }}
                        checked={
                          displayedOrders.length > 0 &&
                          displayedOrders.every((o) => selectedOrderIds.includes(o.order_id))
                        }
                        aria-label="전체 선택"
                      />
                    </div>
                  </th>
                  <th className="py-2 px-1 lg:px-2 xl:px-3 text-left text-sm xl:text-base font-semibold text-gray-600 uppercase tracking-wider w-26 bg-gray-50">
                    고객명
                  </th>
                  <th className="py-2 px-1 lg:px-4 xl:px-6 text-center text-sm xl:text-base font-semibold text-gray-600 uppercase tracking-wider w-24 bg-gray-50">
                    상태
                  </th>
                  <th className="py-2 px-1 lg:px-4 xl:px-6 text-center text-sm xl:text-base font-semibold text-gray-600 uppercase tracking-wider w-20 xl:w-32 bg-gray-50">
                    수령일
                  </th>
                  <th className="py-2 px-2 lg:px-4 xl:px-6 text-left text-sm xl:text-base font-semibold text-gray-600 uppercase tracking-wider bg-gray-50">
                    댓글
                  </th>
                  <th className="py-2 px-2 lg:px-4 xl:px-6 text-left text-sm xl:text-base font-semibold text-gray-600 uppercase tracking-wider w-60 bg-gray-50">
                    상품정보
                  </th>
                  <th className="py-2 px-1 lg:px-4 xl:px-6 text-center text-sm xl:text-base font-semibold text-gray-600 uppercase tracking-wider w-40 bg-gray-50">
                    바코드
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading && (
                  <tr>
                    <td colSpan="8" className="px-6 py-10 text-center">
                      <svg className="animate-spin h-6 w-6 mx-auto text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="text-sm text-gray-500 mt-2 block">
                        주문 목록 로딩 중...
                      </span>
                    </td>
                  </tr>
                )}
                {!loading && displayedOrders.length === 0 && (
                  <tr>
                    <td
                      colSpan="8"
                      className="px-6 py-10 text-center text-sm text-gray-500"
                    >
                      표시할 주문이 없습니다. 백업을 먼저 수행하세요.
                    </td>
                  </tr>
                )}
                {displayedOrders.map((order) => {
                  const orderedAt = order.ordered_at || order.order_time || order.created_at;
                  const isSelected = selectedOrderIds.includes(order.order_id);
                  // 해당 주문의 모든 상품 목록
                  const productList = getCandidateProductsForOrder(order);
                  // 수령일: 선택된 상품 또는 첫 번째 상품에서 가져오기
                  const displayProduct = getProductById(order.product_id) || productList[0] || null;
                  const pickupDate = displayProduct?.pickup_date || order.product_pickup_date || order.pickup_date;
                  return (
                    <tr
                      key={order.order_id}
                      className={`${isSelected
                        ? "bg-orange-50 border-l-4 border-orange-400"
                        : "hover:bg-gray-50"
                        } transition-colors cursor-pointer`}
                      onClick={() => toggleSelect(order.order_id)}
                    >
                      {/* 체크박스 */}
                      <td
                        onClick={(e) => e.stopPropagation()}
                        className="relative w-12 px-6 sm:w-16 sm:px-8"
                      >
                        <div className="absolute inset-y-0 left-4 sm:left-6 flex items-center">
                          <input
                            type="checkbox"
                            className="h-5 w-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                            checked={isSelected}
                            onChange={() => toggleSelect(order.order_id)}
                          />
                        </div>
                      </td>
                      {/* 고객명 */}
                      <td className="py-2 xl:py-3 pr-1 md:pr-2 xl:pr-3 w-24">
                        <button
                          type="button"
                          className="flex items-center min-h-[60px] text-left"
                          onClick={(e) => {
                            e.stopPropagation();
                            const name = (order.customer_name || "").trim();
                            if (name) {
                              setExactCustomerFilter(name);
                              setSearchTerm(name);
                              handleSearch(name);
                            }
                          }}
                          title={order.customer_name}
                        >
                          <span className="text-sm text-gray-700 font-medium break-words line-clamp-2 xl:line-clamp-1 underline decoration-dotted">
                            {order.customer_name || "-"}
                          </span>
                        </button>
                      </td>
                      {/* 상태 */}
                      <td className="py-2 xl:py-3 px-1 lg:px-4 xl:px-6 text-center whitespace-nowrap w-24">
                        <span
                          className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${order.status === "주문완료"
                            ? "bg-blue-100 text-blue-800"
                            : order.status === "수령완료"
                              ? "bg-green-100 text-green-800"
                              : order.status === "취소"
                                ? "bg-red-100 text-red-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                        >
                          {order.status || "주문완료"}
                        </span>
                      </td>
                      {/* 수령일 */}
                      <td className="py-2 xl:py-3 px-1 md:px-3 lg:px-4 xl:px-6 text-center w-20 md:w-24 xl:w-32">
                        <div className="text-sm md:text-base font-medium text-gray-900">
                          {formatDate(pickupDate)}
                        </div>
                      </td>
                      {/* 댓글 */}
                      <td className="py-2 xl:py-3 px-2 md:px-3 lg:px-4 xl:px-6 w-60 md:w-72 xl:w-80">
                        <div>
                          <div className="break-words leading-tight font-semibold" title={order.comment}>
                            {order.comment || "-"}
                          </div>
                          {/* 주문일시 */}
                          <div className="text-xs xl:text-sm text-gray-400 mt-1">
                            {orderedAt
                              ? new Date(orderedAt).toLocaleString("ko-KR", {
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                              : "-"}
                          </div>
                          {/* 메모 */}
                          {order.memo && (
                            <div className={`mt-2 px-2 py-1.5 text-sm rounded ${order.memo ? "bg-red-50 text-red-600 font-semibold border border-red-200" : ""}`}>
                              {order.memo}
                            </div>
                          )}
                        </div>
                      </td>
                      {/* 상품정보: 게시물의 모든 상품을 표시 */}
                      <td
                        className="py-2 xl:py-3 pl-2 lg:pl-4 xl:pl-6 text-sm md:text-base xl:text-xl text-gray-700 align-top"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {productList.length === 0 ? (
                          <span className="text-gray-400">-</span>
                        ) : (
                          <div className="space-y-2">
                            {productList.map((p, idx) => {
                              const itemNo = getItemNumber(p, idx);
                              const title = cleanProductName(p?.title || p?.name || "-");
                              const isSelectedProduct = order.product_id && p?.product_id === order.product_id;
                              const price = isSelectedProduct && Number.isFinite(order?.selected_price)
                                ? Number(order.selected_price)
                                : Number.isFinite(Number(p?.base_price))
                                  ? Number(p.base_price)
                                  : Number.isFinite(Number(p?.price))
                                    ? Number(p.price)
                                    : null;
                              const imgUrl = getProductImage(p, order) || p?.thumbnail_url || p?.thumb_url || null;
                              const isLastProduct = idx === productList.length - 1;

                              return (
                                <div
                                  key={p?.product_id || `${idx}`}
                                  className={`p-2 flex items-start gap-2 ${!isLastProduct ? "border-b border-gray-200" : ""}`}
                                  style={{ minHeight: "86px" }}
                                  title={title}
                                >
                                  <div className="w-14 h-14 rounded-md overflow-hidden bg-white flex-shrink-0 border border-gray-200">
                                    {imgUrl ? (
                                      <img
                                        src={imgUrl}
                                        alt={title}
                                        className="w-full h-full object-cover"
                                        referrerPolicy="no-referrer"
                                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-[10px]">이미지</div>
                                    )}
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-start xl:items-center gap-2">
                                      {productList.length > 1 && (
                                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-[13px] font-semibold text-gray-900 flex-shrink-0">
                                          {itemNo}번
                                        </span>
                                      )}
                                      <span className="text-sm md:text-base xl:text-lg leading-snug text-gray-900 font-medium break-words line-clamp-2">
                                        {title}
                                      </span>
                                    </div>
                                    {price != null && (
                                      <div className="text-sm md:text-base xl:text-lg text-gray-700 mt-0.5">₩{price.toLocaleString()}</div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      {/* 바코드: 모든 상품의 바코드 표시 */}
                      <td className="py-2 xl:py-3 pr-1 lg:pr-4 xl:pr-6 text-center text-base xl:text-lg text-gray-700 w-32 align-top">
                        {productList.length === 0 ? (
                          <span className="text-sm text-gray-400">없음</span>
                        ) : (
                          <div className="space-y-2">
                            {productList.map((p, idx) => {
                              const isSelectedProduct = order.product_id && p?.product_id === order.product_id;
                              const barcodeVal = isSelectedProduct && order?.selected_barcode
                                ? order.selected_barcode
                                : p?.barcode || "";
                              const isLastBarcode = idx === productList.length - 1;

                              return (
                                <div
                                  key={p?.product_id || `${idx}`}
                                  className={`flex items-center justify-center px-2 ${isLastBarcode ? "py-2" : "pt-2 border-b border-gray-200"}`}
                                  style={{ minHeight: "86px" }}
                                >
                                  {barcodeVal ? (
                                    <Barcode
                                      value={barcodeVal}
                                      height={32}
                                      width={1.2}
                                      fontSize={12}
                                    />
                                  ) : (
                                    <span className="text-sm text-gray-400">없음</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* 페이지네이션 */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-white">
            <div className="text-sm text-gray-600">
              {totalFilteredOrders === 0
                ? "0건"
                : `${(currentPage - 1) * PAGE_SIZE + 1} - ${Math.min(
                  currentPage * PAGE_SIZE,
                  totalFilteredOrders
                )} / ${totalFilteredOrders}건`}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 bg-white disabled:opacity-50"
              >
                이전
              </button>
              <span className="text-sm text-gray-700">
                {currentPage} / {totalPages || 1}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 bg-white disabled:opacity-50"
              >
                다음
              </button>
            </div>
          </div>
        </div>
      </div>

      {orders.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-300 shadow-lg z-30 px-4 lg:px-6 py-4">
          <div className="mx-auto flex items-center justify-between gap-4 flex-row-reverse">
            {/* 왼쪽: 버튼 옮기기 (실제로는 오른쪽에 표시됨 - flex-row-reverse) */}
            <div className="flex items-center">
              <button
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border-2 border-dashed border-gray-400 rounded-lg hover:border-orange-500 hover:text-orange-600 transition-colors"
              >
                버튼 옮기기
              </button>
            </div>
            {/* 오른쪽: 선택 개수 + 버튼들 (실제로는 왼쪽에 표시됨 - flex-row-reverse) */}
            <div className="flex items-center gap-2 flex-row-reverse">
              <span className="text-sm font-medium text-gray-700">
                선택: <span className="text-orange-600 font-bold">{selectedOrderIds.length}</span>개
                {bulkLoading && <span className="ml-2 text-gray-500">처리 중...</span>}
              </span>
              <div className="flex gap-3 flex-row-reverse">
                <button
                  onClick={() => handleBulkStatusUpdate("주문취소")}
                  disabled={selectedOrderIds.length === 0 || bulkLoading}
                  className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm md:text-base font-semibold bg-red-100 text-red-700 hover:bg-red-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 mr-1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  선택 주문취소
                </button>
                <button
                  onClick={() => handleBulkStatusUpdate("결제완료")}
                  disabled={selectedOrderIds.length === 0 || bulkLoading}
                  className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm md:text-base font-semibold bg-yellow-100 text-yellow-800 hover:bg-yellow-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 mr-1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  선택 결제완료
                </button>
                <button
                  onClick={() => handleBulkStatusUpdate("주문완료")}
                  disabled={selectedOrderIds.length === 0 || bulkLoading}
                  className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm md:text-base font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 mr-1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 15.75 3 12m0 0 3.75-3.75M3 12h18" />
                  </svg>
                  주문완료로 되돌리기
                </button>
                <button
                  onClick={() => handleBulkStatusUpdate("수령완료")}
                  disabled={selectedOrderIds.length === 0 || bulkLoading}
                  className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm md:text-base font-semibold bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 mr-1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  선택 수령완료
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          duration={4000}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
