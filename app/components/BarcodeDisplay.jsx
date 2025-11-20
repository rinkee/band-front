"use client";

import React, { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";

/**
 * 바코드 표시 컴포넌트
 * @param {string} value - 바코드 값
 * @param {string} format - 바코드 형식 (CODE128, EAN13, CODE39 등) 기본값: CODE128
 * @param {number} width - 바코드 선 너비 기본값: 2
 * @param {number} height - 바코드 높이 기본값: 50
 * @param {boolean} displayValue - 바코드 아래 값 표시 여부 기본값: true
 * @param {string} productName - 상품명 (모달에 표시)
 * @param {number} price - 가격 (모달에 표시)
 */
export default function BarcodeDisplay({
  value,
  format = "CODE128",
  width = 2,
  height = 50,
  displayValue = true,
  fontSize = 12,
  margin = 0,
  productName = "",
  price = null,
}) {
  const barcodeRef = useRef(null);
  const modalBarcodeRef = useRef(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (barcodeRef.current && value) {
      try {
        JsBarcode(barcodeRef.current, value, {
          format: format,
          width: width,
          height: height,
          displayValue: displayValue,
          fontSize: fontSize,
          margin: margin,
        });
      } catch (error) {
        console.error("바코드 생성 오류:", error);
      }
    }
  }, [value, format, width, height, displayValue, fontSize, margin]);

  useEffect(() => {
    if (modalBarcodeRef.current && value && isModalOpen) {
      try {
        JsBarcode(modalBarcodeRef.current, value, {
          format: format,
          width: 2,
          height: 70,
          displayValue: true,
          fontSize: 16,
          margin: 10,
        });
      } catch (error) {
        console.error("바코드 생성 오류:", error);
      }
    }
  }, [value, format, isModalOpen]);

  if (!value) {
    return null;
  }

  return (
    <>
      <div
        className="flex justify-center items-center w-full overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => setIsModalOpen(true)}
        title="클릭하여 크게 보기"
      >
        <svg ref={barcodeRef} style={{ maxWidth: '100%', height: 'auto' }}></svg>
      </div>

      {/* 바코드 확대 모달 */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">바코드</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {(productName || price) && (
              <div className="mb-4 text-center">
                {productName && <p className="text-gray-900 font-semibold text-lg">{productName}</p>}
                {price !== null && price !== undefined && (
                  <p className="text-gray-600 text-base mt-1">{price.toLocaleString()}원</p>
                )}
              </div>
            )}
            <div className="flex justify-center items-center py-4">
              <svg ref={modalBarcodeRef}></svg>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
