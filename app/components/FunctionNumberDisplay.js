"use client";

import { useState, useEffect } from "react";

export default function FunctionNumberDisplay() {
  const [functionNumber, setFunctionNumber] = useState(null);
  const [functionName, setFunctionName] = useState("");

  useEffect(() => {
    // sessionStorage에서 userData 읽기
    const userData = sessionStorage.getItem("userData");
    if (userData) {
      try {
        const parsedData = JSON.parse(userData);
        const fnNumber = parsedData.function_number ?? 0;
        setFunctionNumber(fnNumber);
        
        // function 이름 설정
        switch(fnNumber) {
          case 1:
            setFunctionName("A");
            break;
          case 2:
            setFunctionName("B");
            break;
          case 0:
          default:
            setFunctionName("기본");
            break;
        }
      } catch (e) {
        console.error("userData 파싱 오류:", e);
      }
    }
  }, []);

  if (functionNumber === null) {
    return null; // 로그인 전이면 표시하지 않음
  }

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="bg-white shadow-lg rounded-lg px-4 py-2 border border-gray-200">
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500">서버:</span>
          <span className={`font-bold text-sm ${
            functionNumber === 0 ? 'text-gray-700' : 
            functionNumber === 1 ? 'text-blue-600' : 
            'text-green-600'
          }`}>
            {functionName}
          </span>
          <span className="text-xs text-gray-400">
            ({functionNumber})
          </span>
        </div>
      </div>
    </div>
  );
}