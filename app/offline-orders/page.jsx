"use client";

import { useEffect, useMemo, useState } from "react";
import {
  searchOrders,
  getRecent,
  upsertOrderLocal,
  addToQueue,
  isIndexedDBAvailable,
  getPendingQueue,
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

  const stripLeadingDate = (name = "") =>
    name.replace(/^\[[^\]]+\]\s*/, "").trim();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 flex flex-col gap-4">
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">오프라인 주문 관리</h1>
            <p className="text-sm text-gray-600">
              서버 장애 시 IndexedDB에 백업된 데이터만을 사용합니다. 총 {orders.length}건
              표시, 대기열 {queueSize}건
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
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-lg">주문 목록</h2>
            {loading && <span className="text-sm text-gray-500">불러오는 중...</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    선택
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    고객명
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    상태
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    수령일
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    댓글/메모
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    상품명
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    바코드
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    주문일시
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {displayedOrders.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-6 text-center text-sm text-gray-500"
                    >
                      표시할 주문이 없습니다. 백업을 먼저 수행하세요.
                    </td>
                  </tr>
                )}
                {displayedOrders.map((order) => {
                  const orderedAt = order.ordered_at || order.order_time || order.created_at;
                  const isSelected = selectedOrder?.order_id === order.order_id;
                  const barcode =
                    order.selected_barcode_option?.barcode ||
                    order.option_barcode_1 ||
                    order.option_barcode_2 ||
                    order.option_barcode_3 ||
                    "-";
                  const pickupDate = order.pickup_date || order.pickup_time || order.paid_at;
                  const productName = stripLeadingDate(order.product_name || order.content || "");
                  return (
                    <tr
                      key={order.order_id}
                      className={`hover:bg-gray-50 cursor-pointer ${
                        isSelected ? "bg-blue-50" : ""
                      }`}
                      onClick={() => handleSelect(order)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelect(order)}
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                        <div className="font-medium text-gray-900">
                          {order.customer_name || "이름 없음"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {order.customer_phone || "-"}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${
                            order.status === "주문완료"
                              ? "bg-blue-100 text-blue-800"
                              : order.status === "수령완료"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {order.status || "주문완료"}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                        {formatDate(pickupDate)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 max-w-xs">
                        <div className="text-gray-900">
                          {order.comment || "-"}
                        </div>
                        {order.memo && (
                          <div className="text-xs text-gray-500 mt-1">메모: {order.memo}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-medium">
                        {productName || "상품명 없음"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                        {barcode}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {orderedAt
                          ? new Date(orderedAt).toLocaleString("ko-KR", {
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "-"}
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
