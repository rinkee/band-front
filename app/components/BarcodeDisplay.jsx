"use client";

import React, { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

/**
 * 바코드 표시 컴포넌트
 * @param {string} value - 바코드 값
 * @param {string} format - 바코드 형식 (CODE128, EAN13, CODE39 등) 기본값: CODE128
 * @param {number} width - 바코드 선 너비 기본값: 2
 * @param {number} height - 바코드 높이 기본값: 50
 * @param {boolean} displayValue - 바코드 아래 값 표시 여부 기본값: true
 */
export default function BarcodeDisplay({
  value,
  format = "CODE128",
  width = 2,
  height = 50,
  displayValue = true,
  fontSize = 12,
  margin = 0,
}) {
  const barcodeRef = useRef(null);

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

  if (!value) {
    return null;
  }

  return (
    <div className="flex justify-center items-center">
      <svg ref={barcodeRef}></svg>
    </div>
  );
}
