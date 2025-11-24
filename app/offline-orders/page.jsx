"use client";

import { useEffect, useMemo, useState } from "react";
import {
  searchOrders,
  getRecent,
  upsertOrderLocal,
  addToQueue,
  isIndexedDBAvailable,
  getPendingQueue,
  getAllFromStore,
} from "../lib/indexedDbClient";
import Toast from "../components/Toast";

const RECENT_LIMIT = 50;

export default function OfflineOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [formState, setFormState] = useState({
    status: "",
    quantity: "",
    memo: "",
    customer_phone: "",
  });
  const [toast, setToast] = useState(null);
  const [queueSize, setQueueSize] = useState(0);
  const [saving, setSaving] = useState(false);
  const [supported, setSupported] = useState(true);
  const [products, setProducts] = useState([]);

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
    } catch {}
    return idx + 1;
  };

  const loadProducts = async () => {
    try {
      const allProducts = await getAllFromStore("products");
      console.log("[offline-orders] 로드된 상품 수:", allProducts.length);
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
      setProducts(allProducts);
    } catch (_) {
      setProducts([]);
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
      const recent = await getRecent("orders", "updated_at", RECENT_LIMIT);
      console.log("[offline-orders] 로드된 주문 수:", recent.length);
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
      setOrders(recent);
    } catch (err) {
      setToast({
        message: err.message || "IndexedDB에서 주문을 불러오지 못했습니다.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
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
    loadRecentOrders();
    loadQueueSize();
    loadProducts();
  }, []);

  const handleSearch = async (term) => {
    setSearchTerm(term);
    if (!term) {
      await loadRecentOrders();
      return;
    }
    const results = await searchOrders(term, 200);
    setOrders(results);
  };

  const handleSelect = (order) => {
    setSelectedOrder(order);
    setFormState({
      status: order.status || "",
      quantity:
        typeof order.quantity === "number" ? String(order.quantity) : order.quantity || "",
      memo: order.memo || "",
      customer_phone: order.customer_phone || "",
    });
  };

  const handleUpdate = async () => {
    if (!selectedOrder) return;
    setSaving(true);
    try {
      const quantityNum =
        formState.quantity === "" || formState.quantity === null
          ? selectedOrder.quantity
          : Number(formState.quantity);

      const updated = {
        ...selectedOrder,
        status: formState.status || selectedOrder.status,
        quantity: Number.isNaN(quantityNum) ? selectedOrder.quantity : quantityNum,
        memo: formState.memo,
        customer_phone: formState.customer_phone,
        updated_at: new Date().toISOString(),
      };

      const stored = await upsertOrderLocal(updated);
      await addToQueue({
        table: "orders",
        op: "upsert",
        pkValue: stored.order_id,
        payload: stored,
        updatedAt: stored.updated_at,
      });
      await loadQueueSize();

      setOrders((prev) =>
        prev.map((o) => (o.order_id === stored.order_id ? stored : o))
      );
      setSelectedOrder(stored);
      setToast({
        message: "로컬에 저장하고 동기화 대기열에 추가했습니다.",
        type: "success",
      });
    } catch (err) {
      setToast({
        message: err.message || "주문을 업데이트하지 못했습니다.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const displayedOrders = useMemo(() => orders || [], [orders]);

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
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">오프라인 주문 관리</h1>
            <p className="text-sm text-gray-600">
              서버 장애 시 IndexedDB에 백업된 데이터만을 사용합니다. 주문 {orders.length}건,
              상품 {products.length}건, 대기열 {queueSize}건
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800">
            장애 모드
          </span>
        </div>
      </div>

      {!supported && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3">
          IndexedDB를 지원하지 않는 환경입니다.
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <input
            type="text"
            placeholder="고객명, 전화번호, 주문ID 검색"
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => loadRecentOrders()}
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-800 text-sm"
          >
            최신순 불러오기
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h2 className="font-semibold text-lg">주문 목록</h2>
            {loading && <span className="text-sm text-gray-500">불러오는 중...</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th
                    scope="col"
                    className="relative w-20 px-6 sm:w-16 sm:px-8 py-3 bg-gray-50"
                  >
                    {/* 전체 선택 체크박스 - 현재는 단일 선택 모드 */}
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
                    <td colSpan="7" className="px-6 py-10 text-center">
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
                      colSpan="7"
                      className="px-6 py-10 text-center text-sm text-gray-500"
                    >
                      표시할 주문이 없습니다. 백업을 먼저 수행하세요.
                    </td>
                  </tr>
                )}
                {displayedOrders.map((order) => {
                  const orderedAt = order.ordered_at || order.order_time || order.created_at;
                  const isSelected = selectedOrder?.order_id === order.order_id;
                  // 해당 주문의 모든 상품 목록
                  const productList = getCandidateProductsForOrder(order);
                  // 수령일: 선택된 상품 또는 첫 번째 상품에서 가져오기
                  const displayProduct = getProductById(order.product_id) || productList[0] || null;
                  const pickupDate = displayProduct?.pickup_date || order.product_pickup_date || order.pickup_date;
                  return (
                    <tr
                      key={order.order_id}
                      className={`${
                        isSelected
                          ? "bg-orange-50 border-l-4 border-orange-400"
                          : "hover:bg-gray-50"
                      } transition-colors cursor-pointer`}
                      onClick={() => handleSelect(order)}
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
                            onChange={() => handleSelect(order)}
                          />
                        </div>
                      </td>
                      {/* 고객명 */}
                      <td className="py-2 xl:py-3 pr-1 md:pr-2 xl:pr-3 w-24">
                        <div className="flex items-center min-h-[60px]">
                          <span
                            className="text-sm text-gray-700 font-medium break-words line-clamp-2 xl:line-clamp-1"
                            title={order.customer_name}
                          >
                            {order.customer_name || "-"}
                          </span>
                        </div>
                      </td>
                      {/* 상태 */}
                      <td className="py-2 xl:py-3 px-1 lg:px-4 xl:px-6 text-center whitespace-nowrap w-24">
                        <span
                          className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${
                            order.status === "주문완료"
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
                              const imgUrl = p?.image_url || p?.thumbnail_url || p?.thumb_url || null;
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
                                    <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                                      {barcodeVal}
                                    </span>
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
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <h2 className="font-semibold text-lg mb-3">상세/업데이트</h2>
          {!selectedOrder && (
            <p className="text-sm text-gray-500">
              왼쪽 목록에서 주문을 선택하면 상세와 수정이 가능합니다.
            </p>
          )}
          {selectedOrder && (
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">주문 ID</p>
                <p className="font-mono text-sm">{selectedOrder.order_id}</p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <label className="text-sm text-gray-700">
                  상태
                  <input
                    type="text"
                    value={formState.status}
                    onChange={(e) => setFormState({ ...formState, status: e.target.value })}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm text-gray-700">
                  수량
                  <input
                    type="number"
                    value={formState.quantity}
                    onChange={(e) => setFormState({ ...formState, quantity: e.target.value })}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm text-gray-700">
                  연락처
                  <input
                    type="text"
                    value={formState.customer_phone}
                    onChange={(e) =>
                      setFormState({ ...formState, customer_phone: e.target.value })
                    }
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm text-gray-700">
                  메모
                  <textarea
                    value={formState.memo}
                    onChange={(e) => setFormState({ ...formState, memo: e.target.value })}
                    rows={3}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <button
                onClick={handleUpdate}
                disabled={saving}
                className={`w-full px-4 py-2 rounded-lg text-white font-medium transition ${
                  saving ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {saving ? "저장 중..." : "로컬 저장 & 동기화 큐 추가"}
              </button>
              <div className="text-xs text-gray-500">
                로컬 저장만 수행되며, 서버 복구 후 별도 동기화 호출이 필요합니다.
              </div>
            </div>
          )}
        </div>
      </div>

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
