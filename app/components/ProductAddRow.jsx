"use client";

import React, { memo, useRef, useCallback, useState } from "react";
import BarcodeDisplay from "./BarcodeDisplay";

/**
 * 상품 추가 행 컴포넌트 (비제어 컴포넌트 - 입력 시 렌더링 없음)
 * 바코드 입력 시에만 프리뷰를 위해 상태 업데이트
 */
const ProductAddRow = memo(function ProductAddRow({
  post,
  nextItemNumber,
  onSave,
  onCancel,
  isSaving,
}) {
  // ref로 입력값 관리 - 입력 시 렌더링 없음
  const titleRef = useRef(null);
  const priceRef = useRef(null);
  const barcodeRef = useRef(null);

  // 바코드 프리뷰를 위한 상태 (디바운스 적용)
  const [barcodePreview, setBarcodePreview] = useState('');
  const barcodeTimeoutRef = useRef(null);

  const handleSave = useCallback(() => {
    const productData = {
      title: titleRef.current?.value || '',
      base_price: priceRef.current?.value || '',
      barcode: barcodeRef.current?.value || '',
    };
    onSave(post, productData);
  }, [onSave, post]);

  // 바코드 입력 시 디바운스로 프리뷰 업데이트 (300ms)
  const handleBarcodeChange = useCallback(() => {
    if (barcodeTimeoutRef.current) {
      clearTimeout(barcodeTimeoutRef.current);
    }
    barcodeTimeoutRef.current = setTimeout(() => {
      setBarcodePreview(barcodeRef.current?.value || '');
    }, 300);
  }, []);

  return (
    <tr className="bg-green-50 border-b border-gray-200">
      <td className="px-1 py-1.5 text-center border-r border-gray-200 text-xs text-gray-500 font-medium">
        {nextItemNumber}
      </td>
      <td className="px-2 py-1.5 border-r border-gray-200">
        <input
          ref={titleRef}
          type="text"
          placeholder="상품명 *"
          className="w-full px-2 py-1 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-xs"
        />
      </td>
      <td className="px-2 py-1.5 border-r border-gray-200">
        <input
          ref={priceRef}
          type="number"
          placeholder="가격 *"
          className="w-full px-2 py-1 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-xs"
        />
      </td>
      <td className="px-2 py-1.5 border-r border-gray-200">
        <div className="flex flex-col gap-2">
          {/* 바코드 프리뷰 (입력값이 있을 때만 표시) */}
          {barcodePreview && (
            <BarcodeDisplay
              value={barcodePreview}
              height={40}
              width={1.5}
              displayValue={true}
              fontSize={10}
              margin={5}
              productName={titleRef.current?.value || '신규 상품'}
              price={priceRef.current?.value}
            />
          )}
          <input
            ref={barcodeRef}
            type="text"
            placeholder="바코드"
            onChange={handleBarcodeChange}
            className="w-full px-2 py-1 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-xs"
          />
        </div>
      </td>
      <td className="px-2 py-1.5">
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

export default ProductAddRow;
