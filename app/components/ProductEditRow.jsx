"use client";

import React, { memo, useRef, useCallback } from "react";

/**
 * 상품 수정 행 컴포넌트 (비제어 컴포넌트 - 입력 시 렌더링 없음)
 */
const ProductEditRow = memo(function ProductEditRow({
  product,
  index,
  initialData,
  onSave,
  onCancel,
  isSaving,
}) {
  // ref로 입력값 관리 - 입력 시 렌더링 없음
  const itemNumberRef = useRef(null);
  const titleRef = useRef(null);
  const priceRef = useRef(null);
  const barcodeRef = useRef(null);

  const handleSave = useCallback(() => {
    const editData = {
      item_number: itemNumberRef.current?.value || '',
      title: titleRef.current?.value || '',
      base_price: priceRef.current?.value || '',
      barcode: barcodeRef.current?.value || '',
    };
    onSave(product.product_id, product, editData);
  }, [onSave, product]);

  return (
    <tr className="bg-amber-50 border-b border-gray-200">
      <td className="px-1 py-1.5 text-center border-r border-gray-200">
        <input
          ref={itemNumberRef}
          type="number"
          defaultValue={initialData.item_number ?? ''}
          placeholder="번호 *"
          className="w-full px-1.5 py-1 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-xs text-center"
          min="1"
        />
      </td>
      <td className="px-2 py-1.5 border-r border-gray-200">
        <input
          ref={titleRef}
          type="text"
          defaultValue={initialData.title || ''}
          placeholder="상품명 *"
          className="w-full px-2 py-1 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-xs"
        />
      </td>
      <td className="px-2 py-1.5 border-r border-gray-200">
        <input
          ref={priceRef}
          type="number"
          defaultValue={initialData.base_price ?? ''}
          placeholder="가격 *"
          className="w-full px-2 py-1 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-xs"
        />
      </td>
      <td className="px-2 py-1.5 border-r border-gray-200">
        <input
          ref={barcodeRef}
          type="text"
          defaultValue={initialData.barcode || ''}
          placeholder="바코드"
          className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-xs rounded transition-colors"
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-xs rounded transition-colors"
          >
            취소
          </button>
        </div>
      </td>
    </tr>
  );
});

export default ProductEditRow;
