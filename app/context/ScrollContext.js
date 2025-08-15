// contexts/ScrollContext.js
"use client";

import React, { createContext, useContext, useRef, useCallback } from "react";

const ScrollContext = createContext(null);

export const useScroll = () => useContext(ScrollContext);

export const ScrollProvider = ({ children }) => {
  const scrollableContentRef = useRef(null); // 스크롤 대상 div에 연결할 ref

  const scrollToTop = useCallback(() => {
    scrollableContentRef.current?.scrollTo({ top: 0, behavior: "auto" }); // 'auto' 또는 'smooth'
  }, []);

  return (
    <ScrollContext.Provider value={{ scrollToTop, scrollableContentRef }}>
      {children}
    </ScrollContext.Provider>
  );
};
