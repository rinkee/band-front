"use client";

import React, { useEffect, useMemo, useState, forwardRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import supabase from "../lib/supabaseClient";
import { createClient } from "@supabase/supabase-js";
import { useCommentOrdersClient, useCommentOrderClientMutations } from "../hooks";
import { useToast } from "../hooks/useToast";
import ToastContainer from "../components/ToastContainer";
import UpdateButton from "../components/UpdateButtonImprovedWithFunction";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ko } from "date-fns/locale";
import {
  CheckCircleIcon,
  XCircleIcon,
  ChatBubbleLeftRightIcon,
  CalendarDaysIcon,
  FunnelIcon,
  TagIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CheckIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import JsBarcode from "jsbarcode";
// 추천 매칭기 (@client-matcher)
import { analyzeCommentMulti } from "../client-matcher";

const processBandTags = (text) => {
  if (!text) return text;
  let processedText = text;
  processedText = processedText.replace(
    /<band:refer\s+user_key="[^"]*"[^>]*>([^<]+)<\/band:refer>/g,
    "@$1"
  );
  processedText = processedText.replace(
    /<band:mention\s+user_key="[^"]*"[^>]*>([^<]+)<\/band:mention>/g,
    "@$1"
  );
  processedText = processedText.replace(/<band:[^>]*>([^<]+)<\/band:[^>]*>/g, "$1");
  processedText = processedText.replace(/<band:[^>]*\/>/g, "");
  return processedText;
};

// Extract item number from product_id suffix like "..._item3"
function parseItemNumberFromProductId(productId) {
  if (!productId) return undefined;
  try {
    const s = String(productId);
    const matches = Array.from(s.matchAll(/item(\d+)/gi));
    if (matches.length > 0) {
      const last = matches[matches.length - 1];
      const n = parseInt(last[1], 10);
      return Number.isFinite(n) ? n : undefined;
    }
  } catch (_) {}
  return undefined;
}

const StatusBadge = ({ status }) => {
  let bg = "bg-gray-100 text-gray-700";
  if (status === "미수령") bg = "bg-red-100 text-red-700";
  else if (status === "주문완료") bg = "bg-blue-100 text-blue-700";
  else if (status === "수령완료") bg = "bg-green-100 text-green-700";
  else if (status === "주문취소") bg = "bg-gray-200 text-gray-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${bg}`}>
      {status}
    </span>
  );
};

// LightCard - legacy 모드와 동일한 카드 스타일 래퍼
function LightCard({ children, className = "", padding = "p-6" }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 ${padding} ${className}`}>
      {children}
    </div>
  );
}

// CustomRadioGroup - legacy 모드와 동일한 라디오 스타일
function CustomRadioGroup({ name, options, selectedValue, onChange, disabled = false }) {
  return (
    <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
      {options.map((option) => (
        <label
          key={option.value}
          className={`flex items-center cursor-pointer ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={(e) => {
            if (disabled) e.preventDefault();
          }}
        >
          <div
            onClick={() => !disabled && onChange(option.value)}
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors mr-2 flex-shrink-0 ${
              selectedValue === option.value ? "bg-orange-500 border-orange-500" : "bg-white border-gray-300 hover:border-gray-400"
            } ${disabled ? "!bg-gray-100 !border-gray-200" : ""}`}
          >
            {selectedValue === option.value && <CheckIcon className="w-3.5 h-3.5 text-white" />}
          </div>
          <span className={`text-sm ${disabled ? "text-gray-400" : "text-gray-700"}`}>{option.label}</span>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={selectedValue === option.value}
            onChange={() => !disabled && onChange(option.value)}
            className="sr-only"
            disabled={disabled}
          />
        </label>
      ))}
    </div>
  );
}

// Custom date input (legacy 스타일과 유사)
const CustomDateInputButton = forwardRef(({ value, onClick, isActive, disabled }, ref) => (
  <button
    className={`flex items-center pl-3 pr-8 py-1.5 rounded-md text-xs font-medium transition border whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] sm:max-w-none ${
      isActive ? "bg-orange-500 text-white border-orange-500 shadow-sm" : "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200 hover:border-gray-400"
    } ${disabled ? "!bg-gray-100 !border-gray-200 text-gray-400 cursor-not-allowed opacity-50" : ""}`}
    onClick={onClick}
    ref={ref}
    disabled={disabled}
  >
    <CalendarDaysIcon className={`w-4 h-4 mr-2 ${isActive ? "text-white" : "text-gray-400"}`} />
    {value || "날짜 선택"}
  </button>
));

export default function CommentOrdersView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userData, setUserData] = useState(null);
  const [page, setPage] = useState(1);
  // 검색/필터 (legacy 유사 UI)
  const [inputValue, setInputValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusSelection, setStatusSelection] = useState("all");
  const [filterDateRange, setFilterDateRange] = useState("30days");
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);
  const [selected, setSelected] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [manualBarcode, setManualBarcode] = useState("");
  const [chosenProductId, setChosenProductId] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [paidChecked, setPaidChecked] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const { showSuccess, showError, toasts, hideToast } = useToast();
  const [postProductsByPostKey, setPostProductsByPostKey] = useState({});
  const [postProductsByBandPost, setPostProductsByBandPost] = useState({});
  const [lazyProductsByCommentId, setLazyProductsByCommentId] = useState({});
  const [isClient, setIsClient] = useState(false);
  const [expandedProducts, setExpandedProducts] = useState({});
  // 댓글별 추천 결과 저장: { [comment_order_id]: ClientMatcherSuggestion[] }
  const [suggestionsByCommentId, setSuggestionsByCommentId] = useState({});
  // 제품 이미지 로드 실패(대체 아이콘 사용) 여부: { [product_id]: true }
  const [brokenProductImages, setBrokenProductImages] = useState({});

  const toggleProductExpansion = (e, commentOrderId) => {
    e.stopPropagation();
    setExpandedProducts(prev => ({
        ...prev,
        [commentOrderId]: !prev[commentOrderId]
    }));
  };
  // 클릭 기반 필터 상태
  const [activeCustomer, setActiveCustomer] = useState(null);
  const [activeProductId, setActiveProductId] = useState(null);
  const [activeProductName, setActiveProductName] = useState(null);
  // 선택 및 일괄 처리 상태
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const headerCheckboxRef = React.useRef(null);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem("userData");
      if (!s) {
        router.replace("/login");
        return;
      }
      const u = JSON.parse(s);
      if (!u?.userId) {
        router.replace("/login");
        return;
      }
      setUserData(u);
    } catch (e) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // 날짜 범위 계산 (legacy와 동일 로직 단순화)
  function calculateDateFilterParams(range, customStart, customEnd) {
    const now = new Date();
    let startDate = new Date();
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);

    if (range === "custom" && customStart) {
      const start = new Date(customStart);
      start.setHours(0, 0, 0, 0);
      const end = customEnd ? new Date(customEnd) : new Date(customStart);
      end.setHours(23, 59, 59, 999);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }

    switch (range) {
      case "today":
        startDate.setHours(0, 0, 0, 0);
        break;
      case "7days":
        startDate.setDate(now.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        break;
      case "30days":
        startDate.setMonth(now.getMonth() - 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      case "90days":
        startDate.setMonth(now.getMonth() - 3);
        startDate.setHours(0, 0, 0, 0);
        break;
      default:
        return { startDate: undefined, endDate: undefined };
    }
    return { startDate: startDate.toISOString(), endDate: endDate.toISOString() };
  }

  const dateFilterParams = calculateDateFilterParams(
    filterDateRange,
    customStartDate,
    customEndDate
  );

  const paramPostKey = searchParams?.get('postKey') || undefined;
  const paramPostNumber = searchParams?.get('postNumber') || undefined;
  const paramBandNumber = searchParams?.get('bandNumber') || undefined;

  const noPagination = !!activeCustomer || !!activeProductId || !!paramPostKey || !!paramPostNumber;
  const { data, error, isLoading, mutate } = useCommentOrdersClient(
    userData?.userId,
    page,
    {
      status: statusSelection,
      search: searchTerm || undefined,
      limit: noPagination ? 10000 : 50,
      startDate: dateFilterParams.startDate,
      endDate: dateFilterParams.endDate,
      commenterExact: activeCustomer || undefined,
      postKey: paramPostKey,
      postNumber: paramPostNumber,
      bandNumber: paramBandNumber,
    },
    { revalidateOnFocus: true }
  );

  const { updateCommentOrder } = useCommentOrderClientMutations();

  const items = data?.data || [];
  const pagination = data?.pagination;
  const filteredTotalItems = pagination?.totalItems || 0;

  // 시간 표시 포맷: "10월3일 오전 10:14"
  const formatKoreanDateTime = (value) => {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    const month = d.getMonth() + 1;
    const day = d.getDate();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours < 12 ? "오전" : "오후";
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return `${month}월${day}일 ${ampm} ${hours}:${minutes}`;
  };

  // 바코드 컴포넌트 (CODE128)
  const BarcodeInline = ({ value, width = 1.4, height = 28 }) => {
    const ref = React.useRef(null);
    React.useEffect(() => {
      if (!ref.current || !value) return;
      try {
        JsBarcode(ref.current, String(value), {
          format: "CODE128",
          lineColor: "#111",
          width,
          height,
          displayValue: false,
          margin: 0,
          background: "transparent",
        });
      } catch (_) {
        if (ref.current) ref.current.innerHTML = "";
      }
    }, [value, width, height]);
    if (!value) return null;
    return <svg ref={ref} className="block" aria-hidden="true" />;
  };

  // 상품 이미지 결정 (필드 추론 + 폴백)
  const getProductImageUrl = (p) => {
    if (!p) return null;
    const tryJsonArray = (v) => {
      if (!v) return null;
      if (Array.isArray(v)) return v[0] || null;
      if (typeof v === "string") {
        try {
          const arr = JSON.parse(v);
          if (Array.isArray(arr) && arr.length > 0) return arr[0];
        } catch (_) {}
      }
      return null;
    };
    return (
      p.image_url ||
      p.thumbnail_url ||
      p.thumb_url ||
      tryJsonArray(p.image_urls) ||
      tryJsonArray(p.images) ||
      null
    );
  };

  // Create authed client with JWT if available (for RLS)
  const getAuthedClient = () => {
    if (typeof window === "undefined") return supabase;
    try {
      const s = sessionStorage.getItem("userData");
      const token = s ? JSON.parse(s)?.token : null;
      if (!token) return supabase;
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !anon) return supabase;
      return createClient(url, anon, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, detectSessionInUrl: false },
      });
    } catch (_) {
      return supabase;
    }
  };

  // Batch-load products for all listed comments' posts
  useEffect(() => {
    const fetchBatchProducts = async () => {
      if (!userData?.userId || items.length === 0) {
        setPostProductsByPostKey({});
        setPostProductsByBandPost({});
        return;
      }
      const uid = userData.userId;
      const sb = getAuthedClient();

      const postKeys = Array.from(
        new Set(items.map((r) => r.post_key || r.postKey).filter(Boolean))
      );
      const bandMap = new Map();
      items.forEach((r) => {
        if (!r.post_key && !r.postKey) {
          const band = r.band_number || r.bandNumber;
          const postNum = r.post_number ?? r.postNumber;
          if (band != null && postNum != null) {
            const key = String(band);
            if (!bandMap.has(key)) bandMap.set(key, new Set());
            bandMap.get(key).add(String(postNum));
          }
        }
      });

      const results = [];
      try {
        if (postKeys.length > 0) {
          const { data: byPk, error: e1 } = await sb
            .from("products")
            .select("*")
            .eq("user_id", uid)
            .in("post_key", postKeys)
            .order("item_number", { ascending: true });
          if (e1) throw e1;
          if (Array.isArray(byPk)) results.push(...byPk);
        }
        for (const [band, postNumsSet] of bandMap.entries()) {
          const postNums = Array.from(postNumsSet);
          if (postNums.length === 0) continue;
          // 우선 band_number + post_number 매칭
          const { data: byPair, error: e2 } = await sb
            .from("products")
            .select("*")
            .eq("user_id", uid)
            .eq("band_number", band)
            .in("post_number", postNums)
            .order("item_number", { ascending: true });
          if (e2) throw e2;
          if (Array.isArray(byPair)) results.push(...byPair);
        }
      } catch (e) {
        console.warn("상품 배치 조회 실패:", e?.message || e);
      }

      // Build maps
      const byPostKeyMap = {};
      const byBandPostMap = {};
      results.forEach((p) => {
        if (p.post_key) {
          if (!byPostKeyMap[p.post_key]) byPostKeyMap[p.post_key] = [];
          byPostKeyMap[p.post_key].push(p);
        } else if (p.band_number != null && p.post_number != null) {
          const k = `${p.band_number}_${String(p.post_number)}`;
          if (!byBandPostMap[k]) byBandPostMap[k] = [];
          byBandPostMap[k].push(p);
        }
      });

      setPostProductsByPostKey(byPostKeyMap);
      setPostProductsByBandPost(byBandPostMap);
    };
    fetchBatchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData?.userId, items.map((i) => i.comment_order_id).join(",")]);

  // 댓글 기반 추천 매칭 계산 (게시물 당 상품이 2개 이상인 경우에만 적용)
  const commentListKey = React.useMemo(
    () => (Array.isArray(items) ? items.map((i) => i.comment_order_id).join(",") : ""),
    [items]
  );
  useEffect(() => {
    if (!Array.isArray(items) || items.length === 0) {
      // 비어있을 때는 최초 1회만 초기화
      if (Object.keys(suggestionsByCommentId || {}).length > 0) {
        setSuggestionsByCommentId({});
      }
      return;
    }
    const next = {};
    for (const row of items) {
      const list = getCandidateProductsForRow(row);
      if (!Array.isArray(list) || list.length < 2) continue; // 단일 상품 게시물은 스킵
      // client-matcher용 상품 배열 구성
      const cmProducts = list.map((p, idx) => ({
        itemNumber: (Number.isFinite(p?.item_number) && Number(p.item_number) > 0)
          ? Number(p.item_number)
          : (parseItemNumberFromProductId(p?.product_id) ?? (idx + 1)),
        title: p?.title || p?.name || "",
        name: p?.name || p?.title || "",
        quantityText: p?.quantity_text || p?.quantityText || null,
        price:
          typeof p?.base_price === "number"
            ? p.base_price
            : typeof p?.price === "number"
            ? p.price
            : null,
      }));
      const commentText = processBandTags(row?.comment_body || "");
      try {
        const suggestions = analyzeCommentMulti(commentText, cmProducts, { maxSuggestions: 3 });
        if (Array.isArray(suggestions) && suggestions.length > 0) {
          next[row.comment_order_id] = suggestions;
        }
      } catch (_) {
        // ignore per-row errors
      }
    }
    setSuggestionsByCommentId(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentListKey, postProductsByPostKey, postProductsByBandPost, lazyProductsByCommentId]);

  // Fallback: per-row lazy fetch if batch didn't find
  useEffect(() => {
    const run = async () => {
      if (!userData?.userId || items.length === 0) return;
      const uid = userData.userId;
      const sb = getAuthedClient();
      const updates = {};
      for (const row of items) {
        const coid = row.comment_order_id;
        const hasBatch = (() => {
          const pk = row.post_key || row.postKey;
          if (pk && postProductsByPostKey[pk]?.length) return true;
          const band = row.band_number || row.bandNumber || row.band_key || row.bandKey;
          const postNum = row.post_number ?? row.postNumber;
          const k1 = band != null && postNum != null ? `${band}_${String(postNum)}` : null;
          if (k1 && postProductsByBandPost[k1]?.length) return true;
          return false;
        })();
        if (hasBatch || lazyProductsByCommentId[coid]) continue;

        try {
          let list = [];
          // 1) post_key 우선
          const postKey = row.post_key || row.postKey;
          if (postKey) {
            const { data: a, error: e } = await sb
              .from("products")
              .select("*")
              .eq("user_id", uid)
              .eq("post_key", postKey)
              .order("item_number", { ascending: true });
            if (!e && Array.isArray(a)) list = a;
          }
          // 2) band_key + post_number
          if (list.length === 0) {
            const bandKey = row.band_key || row.bandKey;
            const postNum = row.post_number ?? row.postNumber;
            if (bandKey && postNum != null) {
              const { data: b, error: e2 } = await sb
                .from("products")
                .select("*")
                .eq("user_id", uid)
                .eq("band_key", bandKey)
                .eq("post_number", String(postNum))
                .order("item_number", { ascending: true });
              if (!e2 && Array.isArray(b)) list = b;
            }
          }
          // 3) band_number + post_number
          if (list.length === 0) {
            const bandNum = row.band_number || row.bandNumber;
            const postNum = row.post_number ?? row.postNumber;
            if (bandNum != null && postNum != null) {
              const { data: c, error: e3 } = await sb
                .from("products")
                .select("*")
                .eq("user_id", uid)
                .eq("band_number", bandNum)
                .eq("post_number", String(postNum))
                .order("item_number", { ascending: true });
              if (!e3 && Array.isArray(c)) list = c;
            }
          }
          if (list.length > 0) {
            updates[coid] = list;
          }
        } catch (e) {
          // ignore
        }
      }
      if (Object.keys(updates).length > 0) {
        setLazyProductsByCommentId((prev) => ({ ...prev, ...updates }));
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData?.userId, items, postProductsByPostKey, postProductsByBandPost]);

  const openDetail = async (row) => {
    setSelected(row);
    setManualBarcode("");
    setQuantity(1);
    setPaidChecked(false);
    setChosenProductId(null);
    if (!userData?.userId) return;

    const uid = userData.userId;
    const postKey = row.post_key || row.postKey;
    const bandNumber = row.band_number || row.bandNumber;
    const postNumber = row.post_number || row.postNumber;

    try {
      let q;
      if (postKey) {
        q = supabase
          .from("products")
          .select("*")
          .eq("user_id", uid)
          .eq("post_key", postKey)
          .order("item_number", { ascending: true });
      } else if (bandNumber && postNumber != null) {
        q = supabase
          .from("products")
          .select("*")
          .eq("user_id", uid)
          .eq("band_number", bandNumber)
          .eq("post_number", String(postNumber))
          .order("item_number", { ascending: true });
      }

      if (q) {
        const { data: prods, error: pe } = await q;
        if (!pe) setCandidates(prods || []);
        else setCandidates([]);
      } else {
        setCandidates([]);
      }
    } catch (e) {
      setCandidates([]);
    }
  };

  const onUpdate = async (action) => {
    if (!selected || !userData?.userId) return;
    const id = selected.comment_order_id;
    const nowISO = new Date().toISOString();
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const barcode = manualBarcode || candidates.find((c) => c.product_id === chosenProductId)?.barcode || null;

    // 필수 유효성: 수량 >= 1
    if (qty < 1) {
      showError("수량은 1 이상이어야 합니다.");
      return;
    }

    const base = {};
    if (action === "수령완료") {
      Object.assign(base, {
        order_status: "수령완료",
        received_at: nowISO,
        selected_product_id: chosenProductId || null,
        selected_barcode: barcode,
        selected_quantity: qty,
      });
    } else if (action === "주문완료") {
      Object.assign(base, {
        order_status: "주문완료",
        ordered_at: nowISO,
      });
      if (paidChecked) base.paid_at = nowISO;
    } else if (action === "미수령") {
      Object.assign(base, {
        order_status: "미수령",
        received_at: null,
        canceled_at: null,
      });
    } else if (action === "주문취소") {
      Object.assign(base, {
        order_status: "주문취소",
        canceled_at: nowISO,
      });
    } else {
      return;
    }

    setIsUpdating(true);
    // 낙관적 업데이트: 리스트에서 해당 항목만 상태 변경
    const prev = items;
    const optimistic = prev.map((it) =>
      it.comment_order_id === id ? { ...it, ...base } : it
    );
    try {
      await mutate(
        { ...data, data: optimistic },
        { revalidate: false, optimisticData: { ...data, data: optimistic } }
      );
      await updateCommentOrder(id, base, userData.userId);
      await mutate(undefined, { revalidate: true });
      showSuccess("상태가 업데이트되었습니다.");
    } catch (e) {
      showError(e?.message || "업데이트 실패");
      await mutate(undefined, { revalidate: true });
    } finally {
      setIsUpdating(false);
    }
  };

  const normalizeImageUrl = (u) => {
    if (!u) return u;
    // Prefer https to avoid mixed content and CSP upgrade failures
    if (u.startsWith("http://")) return u.replace(/^http:\/\//, "https://");
    return u;
  };

  const attachThumbs = (row) => {
    let attachments = row.attachments;
    if (!attachments) return null;
    try {
      if (typeof attachments === "string") attachments = JSON.parse(attachments);
    } catch (e) {
      // ignore
    }
    if (!Array.isArray(attachments)) return null;
    return (
      <div className="flex gap-2">
        {attachments.slice(0, 3).map((url, idx) => (
          <img
            key={idx}
            src={normalizeImageUrl(url)}
            alt="attachment"
            referrerPolicy="no-referrer"
            className="w-10 h-10 object-cover rounded-md border"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = "/file.svg";
            }}
          />)
        )}
      </div>
    );
  };

  // 상태/검색/기간 핸들러 (legacy 유사)
  const orderStatusOptions = [
    { value: "all", label: "전체" },
    { value: "미수령", label: "미수령" },
    { value: "주문완료", label: "주문완료" },
    { value: "수령완료", label: "수령완료" },
    { value: "주문취소", label: "주문취소" },
  ];
  const dateRangeOptions = [
    { value: "90days", label: "3개월" },
    { value: "30days", label: "1개월" },
    { value: "7days", label: "1주" },
    { value: "today", label: "오늘" },
  ];

  const handleFilterChange = (value) => {
    setStatusSelection(value);
    setPage(1);
  };
  const handleSearchChange = (e) => setInputValue(e.target.value);
  const handleSearch = () => {
    const trimmed = inputValue.trim();
    setSearchTerm(trimmed);
    setPage(1);
  };
  const handleReset = () => {
    setInputValue("");
    setSearchTerm("");
    setStatusSelection("all");
    setFilterDateRange("30days");
    setCustomStartDate(null);
    setCustomEndDate(null);
    setActiveCustomer(null);
    setActiveProductId(null);
    setActiveProductName(null);
    setPage(1);
  };
  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };
  const handleDateRangeChange = (value) => {
    setFilterDateRange(value);
    setCustomStartDate(null);
    setCustomEndDate(null);
  };
  const handleCustomDateChange = (dates) => {
    const [start, end] = dates;
    setFilterDateRange("custom");
    setCustomStartDate(start);
    setCustomEndDate(end);
  };

  // 날짜 포맷 (legacy와 동일 스타일)
  const formatDateForPicker = (date) => {
    if (!date) return "";
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}.${mm}.${dd}`;
  };

  // 행별 후보 상품 가져오기 (수령일 계산용)
  const getCandidateProductsForRow = (row) => {
    const pk = row.post_key || row.postKey;
    const band = row.band_number || row.bandNumber || row.band_key || row.bandKey;
    const postNum = row.post_number ?? row.postNumber;
    let list = [];
    if (pk && postProductsByPostKey[pk]) list = postProductsByPostKey[pk];
    else if (band != null && postNum != null) {
      const k = `${band}_${String(postNum)}`;
      if (postProductsByBandPost[k]) list = postProductsByBandPost[k];
    }
    if ((!list || list.length === 0) && lazyProductsByCommentId[row.comment_order_id]) {
      list = lazyProductsByCommentId[row.comment_order_id];
    }
    return Array.isArray(list) ? list : [];
  };

  const formatMonthDay = (val) => {
    if (!val) return "-";
    try {
      if (val instanceof Date) {
        const m = val.getMonth() + 1;
        const d = val.getDate();
        return `${m}월${d}일`;
      }
      if (typeof val === 'string') {
        // ISO 혹은 YYYY-MM-DD
        if (val.includes('T') || /\d{4}-\d{1,2}-\d{1,2}/.test(val)) {
          const dt = new Date(val);
          if (!isNaN(dt.getTime())) return `${dt.getMonth() + 1}월${dt.getDate()}일`;
        }
        // "7월11일" 패턴
        const m = val.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
        if (m) {
          return `${parseInt(m[1], 10)}월${parseInt(m[2], 10)}일`;
        }
      }
    } catch (_) {}
    return "-";
  };

  const getPickupDateForRow = (row) => {
    // 선택된 상품 우선
    const list = getCandidateProductsForRow(row);
    if (!list || list.length === 0) return null;
    const selectedId = row.selected_product_id;
    const selected = selectedId ? list.find((p) => p.product_id === selectedId) : null;
    const candidate = selected || list[0];
    return candidate?.pickup_date || null;
  };

  // 상품 후보 목록에 특정 product_id가 포함되는지 검사
  const hasProductInCandidates = (row, productId) => {
    if (!productId) return true;
    const pk = row.post_key || row.postKey;
    const band = row.band_number || row.bandNumber || row.band_key || row.bandKey;
    const postNum = row.post_number ?? row.postNumber;
    let list = [];
    if (pk && postProductsByPostKey[pk]) list = postProductsByPostKey[pk];
    else if (band != null && postNum != null) {
      const k = `${band}_${String(postNum)}`;
      if (postProductsByBandPost[k]) list = postProductsByBandPost[k];
    }
    if ((!list || list.length === 0) && lazyProductsByCommentId[row.comment_order_id]) {
      list = lazyProductsByCommentId[row.comment_order_id];
    }
    if (!Array.isArray(list) || list.length === 0) return false;
    return list.some((p) => p.product_id === activeProductId);
  };

  const visibleItems = React.useMemo(() => {
    if (!activeProductId) return items;
    return items.filter((row) => hasProductInCandidates(row, activeProductId));
  }, [items, activeProductId, postProductsByPostKey, postProductsByBandPost, lazyProductsByCommentId]);

  // 전체선택 보조 상태
  const allVisibleIds = React.useMemo(() => visibleItems.map((r) => r.comment_order_id), [visibleItems]);
  const isAllVisibleSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.includes(id));
  const isAnyVisibleSelected = allVisibleIds.some((id) => selectedIds.includes(id));
  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = !isAllVisibleSelected && isAnyVisibleSelected;
    }
  }, [isAllVisibleSelected, isAnyVisibleSelected]);

  const toggleSelectAllVisible = (checked) => {
    if (checked) {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...allVisibleIds])));
    } else {
      setSelectedIds((prev) => prev.filter((id) => !allVisibleIds.includes(id)));
    }
  };
  const toggleSelectOne = (id, checked) => {
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  // 일괄 상태 변경
  const handleBulkCommentOrdersUpdate = async (targetStatus) => {
    if (!userData?.userId || selectedIds.length === 0) return;
    setBulkUpdating(true);
    const nowISO = new Date().toISOString();
    let updateData = {};
    if (targetStatus === '수령완료') {
      updateData = { order_status: '수령완료', received_at: nowISO, canceled_at: null };
    } else if (targetStatus === '주문취소') {
      updateData = { order_status: '주문취소', canceled_at: nowISO, received_at: null };
    } else if (targetStatus === '주문완료') {
      updateData = { order_status: '주문완료', ordered_at: nowISO, received_at: null, canceled_at: null };
    } else {
      setBulkUpdating(false);
      return;
    }
    try {
      // 병렬 업데이트 (실패는 건너뛰고 계속)
      await Promise.all(
        selectedIds.map(async (id) => {
          try {
            await updateCommentOrder(id, updateData, userData.userId);
          } catch (_) {}
        })
      );
      await mutate(undefined, { revalidate: true });
      setSelectedIds([]);
      showSuccess('일괄 처리 완료');
    } catch (e) {
      showError(e?.message || '일괄 처리 중 오류가 발생했습니다');
    } finally {
      setBulkUpdating(false);
    }
  };

  // 필터 핸들러
  const handleFilterByCustomer = (name) => {
    if (!name) return;
    setActiveCustomer(name);
    setInputValue(name);
    setPage(1);
  };
  const handleFilterByProduct = (productId, productName) => {
    if (!productId) return;
    setActiveProductId(productId);
    if (productName) {
      setActiveProductName(productName);
      setInputValue(productName);
    } else {
      setActiveProductName(null);
    }
    setPage(1);
  };
  const clearCustomerFilter = () => setActiveCustomer(null);
  const clearProductFilter = () => { setActiveProductId(null); setActiveProductName(null); };

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 overflow-y-auto px-4 py-2 sm:px-6 sm:py-4 pb-[200px]">
      <main className="max-w-[1440px] mx-auto space-y-4">
        {/* 헤더 및 필터 영역 */}
        <div className="space-y-3">
          {/* 상단: 타이틀, 통계, 업데이트 버튼 */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex items-center gap-x-3">
              <h1 className="text-lg font-bold text-gray-900">주문 관리</h1>
              <div className="flex items-center gap-x-3 text-xs text-gray-500">
                <span>
                  필터된 주문: <span className="font-semibold text-gray-800">{(activeProductId ? visibleItems.length : filteredTotalItems).toLocaleString()}</span>
                </span>
                <span className="hidden sm:inline">|</span>
                <span className="hidden sm:inline">
                  현재 상태: <span className="font-semibold text-gray-800">{orderStatusOptions.find(o => o.value === statusSelection)?.label || statusSelection}</span>
                </span>
                {!noPagination && (
                  <>
                    <span className="hidden sm:inline">|</span>
                    <span className="hidden sm:inline">
                      페이지: <span className="font-semibold text-gray-800">{pagination ? `${pagination.currentPage}/${pagination.totalPages}` : "-"}</span>
                    </span>
                  </>
                )}
                <span className="hidden sm:inline">|</span>
                <span className="font-semibold text-purple-700 inline-flex items-center gap-1">
                  <ChatBubbleLeftRightIcon className="w-4 h-4" /> 원시댓글
                </span>
              </div>
            </div>
            <UpdateButton pageType="orders" />
          </div>

          {/* 하단: 필터 및 검색 */}
          <LightCard padding="p-3">
            <div className="flex flex-wrap items-stretch justify-start gap-3">
              {/* 검색 */}
              <div className="flex items-center gap-2">
                <div className="relative w-full sm:w-56">
                  <input
                    type="text"
                    placeholder="고객명/댓글 검색"
                    value={inputValue}
                    onChange={handleSearchChange}
                    onKeyDown={handleKeyDown}
                    className="w-full pl-9 pr-9 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                  />
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <MagnifyingGlassIcon className="w-4 h-4 text-gray-400" />
                  </div>
                  {inputValue && (
                    <button
                      onClick={() => setInputValue("")}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                      aria-label="검색 내용 지우기"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  onClick={handleSearch}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-gray-800 text-white hover:bg-gray-900"
                >
                  <MagnifyingGlassIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">검색</span>
                </button>
                <button
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 p-1.5 rounded-md text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200"
                  aria-label="검색 초기화"
                  title="검색 및 필터 초기화"
                >
                  <ArrowPathIcon className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-grow"></div> {/* Spacer */}

              {/* 조회 기간 */}
              <div className="flex items-center gap-3 p-2 border border-gray-200 rounded-lg bg-white">
                <span className="text-sm font-medium text-gray-600 flex-shrink-0">기간:</span>
                <DatePicker
                  selectsRange
                  startDate={customStartDate}
                  endDate={customEndDate}
                  onChange={handleCustomDateChange}
                  locale={ko}
                  dateFormat="yyyy.MM.dd"
                  maxDate={new Date()}
                  isClearable
                  placeholderText="날짜 선택"
                  popperPlacement="bottom-start"
                  customInput={
                    <CustomDateInputButton
                      isActive={filterDateRange === "custom"}
                      value={
                        customStartDate
                          ? `${formatDateForPicker(customStartDate)}${
                              customEndDate ? ` ~ ${formatDateForPicker(customEndDate)}` : ""
                            }`
                          : ""
                      }
                    />
                  }
                />
                <CustomRadioGroup
                  name="dateRange"
                  options={dateRangeOptions}
                  selectedValue={filterDateRange === "custom" ? "" : filterDateRange}
                  onChange={handleDateRangeChange}
                />
              </div>

              {/* 상태 필터 */}
              <div className="flex items-center gap-3 p-2 border border-gray-200 rounded-lg bg-white">
                <span className="text-sm font-medium text-gray-600 flex-shrink-0">상태:</span>
                <CustomRadioGroup
                  name="orderStatus"
                  options={orderStatusOptions}
                  selectedValue={statusSelection}
                  onChange={handleFilterChange}
                />
              </div>
            </div>
          </LightCard>
        </div>

        {/* 일괄 처리 버튼 바 (legacy 스타일) */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-transparent">
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 p-5 flex justify-between items-center bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="flex items-center">
              {selectedIds.length === 0 && (
                <span className="text-sm text-gray-500 italic">항목을 선택하여 일괄 처리하세요</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedIds.length > 0 ? (
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500">선택 항목</span>
                  <span className="text-sm font-semibold text-gray-900">{selectedIds.length}개 선택됨</span>
                </div>
              ) : (
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500">현재 페이지</span>
                  <span className="text-sm font-semibold text-gray-900">{visibleItems.length}개 항목</span>
                </div>
              )}

              <button
                onClick={() => handleBulkCommentOrdersUpdate('주문취소')}
                disabled={selectedIds.length === 0 || bulkUpdating}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ${selectedIds.length === 0 ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}
                aria-hidden={selectedIds.length === 0}
              >
                주문취소 ({selectedIds.length})
              </button>
              <button
                onClick={() => handleBulkCommentOrdersUpdate('주문완료')}
                disabled={selectedIds.length === 0 || bulkUpdating}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-gray-700 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ${selectedIds.length === 0 ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}
                aria-hidden={selectedIds.length === 0}
              >
                주문완료로 되돌리기 ({selectedIds.length})
              </button>
              <button
                onClick={() => handleBulkCommentOrdersUpdate('수령완료')}
                disabled={selectedIds.length === 0 || bulkUpdating}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ${selectedIds.length === 0 ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}
                aria-hidden={selectedIds.length === 0}
              >
                수령완료 ({selectedIds.length})
              </button>
            </div>
          </div>
        </div>

        {/* 목록 영역 - legacy 카드 스타일 */}
        <LightCard padding="p-0" className="overflow-hidden mb-[100px]">
         
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed divide-y divide-gray-200">
              <colgroup>
                {/* 퍼센트 기반 고정 폭: 합계 100% 유지 */}
                <col style={{ width: '2%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '7%' }} />
              </colgroup>
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2">
                    <input
                      type="checkbox"
                      ref={headerCheckboxRef}
                      className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                      checked={isAllVisibleSelected}
                      onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                      aria-label="전체 선택"
                    />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">고객명</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">댓글</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">상품</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">수령일</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">주문일시</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading && (
                  <tr>
                    <td className="px-4 py-6 text-center text-sm text-gray-500" colSpan={7}>로딩 중...</td>
                  </tr>
                )}
                {!isLoading && error && (
                  <tr>
                    <td className="px-4 py-6 text-center text-sm text-red-600" colSpan={7}>
                      데이터 로드 중 오류가 발생했습니다: {error?.message || "Unknown error"}
                    </td>
                  </tr>
                )}
                {!isLoading && !error && visibleItems.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-sm text-gray-500" colSpan={7}>표시할 데이터가 없습니다.</td>
                  </tr>
                )}
                {visibleItems.map((row) => {
                  const checked = selectedIds.includes(row.comment_order_id);
                  return (
                  <tr key={row.comment_order_id} className={`hover:bg-gray-50 ${checked ? 'bg-orange-50' : ''}`}>
                    <td className="px-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                        checked={checked}
                        onChange={(e) => toggleSelectOne(row.comment_order_id, e.target.checked)}
                        aria-label="선택"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-800">
                      {row.commenter_name ? (
                        <button
                          className="text-gray-900 hover:text-orange-600 "
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFilterByCustomer(row.commenter_name);
                          }}
                          title="이 고객의 댓글만 보기"
                        >
                          {row.commenter_name}
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-3 text-md text-gray-700">
                      <div className="whitespace-pre-wrap break-all">{processBandTags(row.comment_body || "")}</div>
                      {(() => {
                        const sugg = suggestionsByCommentId[row.comment_order_id] || [];
                        if (!sugg || sugg.length === 0) return null;
                        // 상위 2개만 요약 표시
                        const top = sugg.slice(0, 2);
                        return (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {top.map((s, i) => (
                              <span
                                key={`${row.comment_order_id}_s_${i}`}
                                className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700"
                                title={`${s.reason || "추천"} · 신뢰도 ${(s.confidence * 100).toFixed(0)}%`}
                              >
                                추천 {s.itemNumber}번 · {s.quantity}개
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 align-top">
                      {(() => {
                        const list = getCandidateProductsForRow(row);
                        if (!list || list.length === 0) {
                          return <span className="text-gray-400">-</span>;
                        }
                        const sugg = suggestionsByCommentId[row.comment_order_id] || [];
                        // 원본 순서 기준 보조 itemNumber 맵(product_id -> index+1)
                        const altIndexByProductId = new Map();
                        list.forEach((it, idx) => {
                          if (it && it.product_id) altIndexByProductId.set(it.product_id, idx + 1);
                        });

                        const getMatched = (p) => {
                          if (!Array.isArray(sugg) || sugg.length === 0) return null;
                          const altItemNumber = altIndexByProductId.get(p?.product_id);
                          const num1 = Number(p?.item_number);
                          const parsedNo = parseItemNumberFromProductId(p?.product_id);
                          return sugg.find((s) => {
                            const sNum = Number(s.itemNumber);
                            return (Number.isFinite(num1) && sNum === num1)
                              || (Number.isFinite(parsedNo) && sNum === parsedNo)
                              || (Number.isFinite(altItemNumber) && sNum === altItemNumber);
                          }) || null;
                        };

                        // 정렬 규칙
                        // - 상품이 4개 이상이면: 추천 우선(추천 여부 → 신뢰도 → 추천 수량 → item_number)
                        // - 상품이 3개 이하이면: 상품번호(item_number) 순서 유지
                        let sortedList;
                        if (Array.isArray(list) && list.length >= 4) {
                          sortedList = [...list].sort((a, b) => {
                            const ma = getMatched(a);
                            const mb = getMatched(b);
                            const ra = ma ? 1 : 0;
                            const rb = mb ? 1 : 0;
                            if (ra !== rb) return rb - ra; // 추천 있는 상품 우선
                            if (ma && mb) {
                              if (ma.confidence !== mb.confidence) return mb.confidence - ma.confidence;
                              if (ma.quantity !== mb.quantity) return (mb.quantity || 0) - (ma.quantity || 0);
                            }
                            const ia = Number.isFinite(Number(a?.item_number)) && Number(a.item_number) > 0
                              ? Number(a.item_number)
                              : (parseItemNumberFromProductId(a?.product_id) ?? 9999);
                            const ib = Number.isFinite(Number(b?.item_number)) && Number(b.item_number) > 0
                              ? Number(b.item_number)
                              : (parseItemNumberFromProductId(b?.product_id) ?? 9999);
                            return ia - ib;
                          });
                        } else {
                          sortedList = [...list].sort((a, b) => {
                            const ia = Number.isFinite(Number(a?.item_number)) && Number(a.item_number) > 0
                              ? Number(a.item_number)
                              : (parseItemNumberFromProductId(a?.product_id) ?? 9999);
                            const ib = Number.isFinite(Number(b?.item_number)) && Number(b.item_number) > 0
                              ? Number(b.item_number)
                              : (parseItemNumberFromProductId(b?.product_id) ?? 9999);
                            return ia - ib;
                          });
                        }

                        const isExpanded = !!expandedProducts[row.comment_order_id];
                        const productsToShow = isExpanded ? sortedList : sortedList.slice(0, 3);
                        const showItemNumbers = Array.isArray(list) && list.length >= 2;

                        return (
                          <div className="space-y-2">
                            {productsToShow.map((p) => {
                              const img = getProductImageUrl(p);
                              const isBroken = !!brokenProductImages[p.product_id];
                              const matched = getMatched(p);
                              const rawNo = Number.isFinite(Number(p?.item_number)) && Number(p.item_number) > 0 ? Number(p.item_number) : undefined;
                              const parsedNo = parseItemNumberFromProductId(p?.product_id);
                              const idxNo = altIndexByProductId.get(p?.product_id);
                              const itemNo = showItemNumbers ? (rawNo ?? parsedNo ?? idxNo) : undefined;
                              return (
                                <div
                                  key={p.product_id}
                                  className="flex items-start gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFilterByProduct(p.product_id, p.title);
                                  }}
                                  title="이 상품의 댓글만 보기"
                                >
                                  <div className={`w-16 h-16 rounded-md overflow-hidden bg-gray-50 border border-gray-200 flex-shrink-0`}> 
                                    {img && !isBroken ? (
                                      <img
                                        src={img}
                                        alt={p.title || "상품 이미지"}
                                        className="w-full h-full object-cover"
                                        onError={() => {
                                          setBrokenProductImages((prev) => ({ ...prev, [p.product_id]: true }));
                                        }}
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <PhotoIcon className="w-6 h-8 text-gray-400" aria-hidden="true" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="truncate flex items-center gap-2">
                                      {typeof itemNo === 'number' && (
                                        <span
                                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[13px] font-medium flex-shrink-0 
                                            ${matched ? 'border border-orange-200 bg-orange-50 text-orange-700' : 'border border-gray-200 bg-gray-50 text-gray-700'}`}
                                          aria-label={`상품 ${itemNo}번`}
                                        >
                                          {itemNo}번
                                        </span>
                                      )}
                                      <span className="font-medium text-base truncate">{p.title}</span>
                                      {typeof p.base_price !== "undefined" && p.base_price !== null && (
                                        <span className="text-gray-700 text-base"> {Number(p.base_price).toLocaleString()}</span>
                                      )}
                                    </div>
                                    {/* 추천 뱃지 제거: 추천 시 번호 뱃지 색상만 강조 */}
                                    {p.barcode ? (
                                      <div className="mt-2">
                                        <div className="w-28">
                                          <BarcodeInline value={p.barcode} />
                                        </div>
                                        <div className="mt-[2px] text-[14px] leading-3 text-gray-500 ">{p.barcode}</div>
                                      </div>
                                    ) : (
                                      <div className="mt-2 text-base text-gray-400">바코드를 추가해주세요</div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            {list.length > 3 && (
                              <button
                                className="text-xs text-blue-600 hover:underline font-medium"
                                onClick={(e) => toggleProductExpansion(e, row.comment_order_id)}
                              >
                                {isExpanded ? "간략히 보기" : `외 ${list.length - 3}개 더보기...`}
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-center text-base text-gray-700">{formatMonthDay(getPickupDateForRow(row))}</td>
                    <td className="px-4 py-3 text-center text-[14px] text-gray-700">
                      {formatKoreanDateTime(row.comment_created_at)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={row.order_status} />
                    </td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
          {!noPagination && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-white">
              <div className="text-xs text-gray-500">
                {pagination ? `${pagination.currentPage}/${pagination.totalPages} 페이지` : ""}
              </div>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1.5 text-sm border rounded-md bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
                  disabled={!pagination || pagination.currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  이전
                </button>
                <button
                  className="px-3 py-1.5 text-sm border rounded-md bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
                  disabled={!pagination || pagination.currentPage >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  다음
                </button>
              </div>
            </div>
          )}
        </LightCard>



        <ToastContainer toasts={toasts} hideToast={hideToast} />
      </main>
    </div>
  );
}
