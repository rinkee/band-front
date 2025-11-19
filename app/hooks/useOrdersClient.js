// hooks/useOrdersClient.js - 클라이언트 사이드 직접 Supabase 호출
import useSWR, { useSWRConfig } from "swr";
import supabase from "../lib/supabaseClient";

/**
 * 제외고객 목록 조회
 */
const fetchExcludedCustomers = async (userId) => {
  try {
    const { data: userData } = await supabase
      .from("users")
      .select("excluded_customers")
      .eq("user_id", userId)
      .single();

    if (
      userData?.excluded_customers &&
      Array.isArray(userData.excluded_customers)
    ) {
      return userData.excluded_customers;
    }
  } catch (e) {
    // 에러 무시
  }
  return [];
};

/**
 * 쿼리 빌드 함수 (재사용 가능하도록 분리)
 * 동기 함수 - Supabase 쿼리 빌더는 thenable이므로 async로 만들면 안됨
 */
const buildOrdersQuery = (userId, filters, excludedCustomers = []) => {
  const sortBy = filters.sortBy || "ordered_at";
  const ascending = filters.sortOrder === "asc";

  // 수령가능 필터인 경우 products 테이블과 조인 필요
  const needsPickupDateFilter = filters.subStatus === "수령가능";
  
  // Map sortBy to actual column names based on query mode
  let actualSortBy = sortBy;
  if (needsPickupDateFilter) {
    // When joining with products table, map column names
    if (sortBy === 'product_name' || sortBy === 'product_title') {
      actualSortBy = 'products.title';
    }
    // Other columns remain the same as they're on the orders table
  } else {
    // For orders_with_products view, map column names
    if (sortBy === 'product_name') {
      actualSortBy = 'product_title';
    }
  }
  
  let query;
  if (needsPickupDateFilter) {
    // 주문완료+수령가능 필터: orders와 products를 조인
    query = supabase
      .from("orders")
      .select(`
        *,
        products!inner(pickup_date, title, barcode, price_options, band_key)
      `, { count: "exact" })
      .eq("user_id", userId);
  } else {
    // 일반적인 경우: orders 테이블 직접 사용 (memo 필드 포함)
    query = supabase
      .from("orders")
      .select("*", { count: "exact" })
      .eq("user_id", userId);
  }

  // 상태 필터링
  if (
    filters.status &&
    filters.status !== "all" &&
    filters.status !== "undefined"
  ) {
    const statusValues = filters.status
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s);
    if (statusValues.length > 0) {
      query = query.in("status", statusValues);
    }
  }

  // 서브 상태 필터링
  if (
    filters.subStatus &&
    filters.subStatus !== "all" &&
    filters.subStatus !== "undefined"
  ) {
    if (
      filters.subStatus.toLowerCase() === "none" ||
      filters.subStatus.toLowerCase() === "null"
    ) {
      query = query.is("sub_status", null);
    } else if (filters.subStatus === "수령가능") {
      // '주문완료+수령가능'은 클라이언트(KST 기준)에서 판정하도록 하고,
      // 서버 쿼리에서는 pickup_date 존재 여부만 제한한다.
      if (needsPickupDateFilter) {
        // pickup_date가 비어있는 상품도 제목의 [날짜]로 판정할 수 있도록 서버에서 제외하지 않음
      }
    } else {
      const subStatusValues = filters.subStatus
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s);
      if (subStatusValues.length > 0) {
        query = query.in("sub_status", subStatusValues);
        
        // 미수령 필터가 포함되어 있으면 수령완료 상태 제외
        if (subStatusValues.includes("미수령")) {
          query = query.neq("status", "수령완료");
        }
      }
    }
  }

  // 검색 필터링 - post_key 우선 처리
  if (filters.search && filters.search !== "undefined") {
    const searchTerm = filters.search;

    // post_key 검색인지 확인 (길이가 20자 이상이고 공백이 없는 문자열)
    const isPostKeySearch = searchTerm.length > 20 && !searchTerm.includes(" ");

    // 검색을 위한 텍스트 정규화 함수
    // 괄호와 특수문자를 제거하여 검색 성공률 향상
    const normalizeForSearch = (str) => {
      // 괄호와 그 안의 내용을 공백으로 치환
      let normalized = str.replace(/\([^)]*\)/g, ' ');
      // 대괄호와 그 안의 내용도 유지 (날짜 정보)
      // 여러 공백을 하나로 정리
      normalized = normalized.replace(/\s+/g, ' ').trim();
      return normalized;
    };

    if (isPostKeySearch) {
      // post_key 정확 매칭
      query = query.eq("post_key", searchTerm);
    } else if (!needsPickupDateFilter) {
      // orders 테이블에서 검색 (product_name 사용)
      try {
        const normalizedTerm = normalizeForSearch(searchTerm);
        const searchPattern = searchTerm.includes('(') || searchTerm.includes(')') ? normalizedTerm : searchTerm;

        query = query.or(
          `customer_name.ilike.%${searchPattern}%,product_name.ilike.%${searchPattern}%,post_key.ilike.%${searchPattern}%`
        );
      } catch (error) {
        console.warn('Search filter error:', error);
        // 에러 발생시 고객명만 필터링
        const normalizedTerm = normalizeForSearch(searchTerm);
        query = query.ilike("customer_name", `%${normalizedTerm}%`);
      }
    }
    // 조인 모드에서 일반 검색어는 아래 클라이언트 사이드 필터링으로 처리됨
  }

  // 정확한 고객명 필터링
  if (filters.exactCustomerName && filters.exactCustomerName !== "undefined") {
    query = query.eq("customer_name", filters.exactCustomerName);
  }

  // 날짜 범위 필터링
  if (filters.startDate && filters.endDate) {
    try {
      // dateType 확인 (기본값: ordered)
      const dateColumn = filters.dateType === "updated" ? "updated_at" : "ordered_at";
      
      
      // startDate와 endDate는 이미 ISO 문자열로 전달되므로 그대로 사용
      query = query
        .gte(dateColumn, filters.startDate)
        .lte(dateColumn, filters.endDate);
    } catch (dateError) {
      console.error("Date filter error:", dateError);
    }
  }

  // 제외고객 필터링 (파라미터로 전달받음)
  if (excludedCustomers && excludedCustomers.length > 0) {
    query = query.not(
      "customer_name",
      "in",
      `(${excludedCustomers
        .map((name) => `"${name.replace(/"/g, '""')}"`)
        .join(",")})`
    );
  }

  // 정렬만 적용 (range는 나중에)
  query = query.order(actualSortBy, { ascending });

  return query;
};

/**
 * 클라이언트 사이드 주문 목록 fetcher
 */
const fetchOrders = async (key) => {
  const [, userId, page, filters] = key;

  if (!userId) {
    throw new Error("User ID is required");
  }

  const limit = filters.limit || 30;
  const startIndex = (page - 1) * limit;

  console.log(`🔍 [주문 조회] userId=${userId}, page=${page}, limit=${limit}`);
  console.log(`🔍 [주문 조회] limit > 1000? ${limit > 1000}`);

  // 제외고객 목록 먼저 조회
  const excludedCustomers = await fetchExcludedCustomers(userId);

  // limit이 1000보다 크면 페이징으로 모든 데이터 가져오기
  if (limit > 1000) {
    console.log(`🔄 [주문 페이징] limit=${limit}으로 페이징 모드 시작...`);

    // 첫 페이지를 먼저 가져와서 전체 개수 확인
    const firstPageQuery = buildOrdersQuery(userId, filters, excludedCustomers);
    const { data: firstPageData, error: firstPageError, count } = await firstPageQuery.range(0, 999);

    if (firstPageError) {
      console.error("첫 페이지 조회 실패:", firstPageError);
      throw firstPageError;
    }

    const totalItems = count || 0;
    console.log(`📊 [주문 페이징] 총 ${totalItems}개 데이터 발견`);

    // 첫 페이지 데이터로 시작
    let allData = firstPageData || [];

    // 나머지 페이지들 가져오기
    const pageSize = 1000;
    const totalPageCount = Math.ceil(totalItems / pageSize);

    console.log(`🔄 [주문 페이징] 총 ${totalPageCount}페이지 중 나머지 ${totalPageCount - 1}페이지 가져오기...`);

    for (let pageIndex = 1; pageIndex < totalPageCount; pageIndex++) {
      const start = pageIndex * pageSize;
      const end = start + pageSize - 1;

      // 각 페이지마다 새로운 쿼리 생성
      const pageQuery = buildOrdersQuery(userId, filters, excludedCustomers);
      const { data: pageData, error: pageError } = await pageQuery.range(start, end);

      if (pageError) {
        console.error("Supabase page error:", pageError);
        throw new Error(`Failed to fetch page ${pageIndex + 1}`);
      }

      console.log(`✅ [주문 페이징] ${pageIndex + 1}/${totalPageCount} 페이지: ${pageData?.length || 0}개 가져옴`);
      allData = allData.concat(pageData || []);
    }

    console.log(`✅ [주문 페이징] 완료! 총 ${allData.length}개 데이터 로드됨`);

    // 데이터 후처리
    let processedData = allData;

    const needsPickupDateFilter = filters.subStatus === "수령가능";
    if (needsPickupDateFilter && allData.length > 0) {
      // processedData 처리 로직은 아래에서 재사용
      processedData = allData.map(order => ({
        ...order,
        product_title: order.products?.title,
        product_barcode: order.products?.barcode,
        product_price_options: order.products?.price_options,
        product_pickup_date: order.products?.pickup_date,
        band_key: order.products?.band_key || order.band_key
      }));
    }

    return {
      success: true,
      data: processedData,
      pagination: {
        totalItems,
        totalPages: 1,
        currentPage: 1,
        limit: totalItems,
      },
    };
  }

  // 일반적인 경우: 한 번에 가져오기
  console.log(`📄 [주문 단일 조회] limit=${limit}, startIndex=${startIndex}`);
  const query = buildOrdersQuery(userId, filters, excludedCustomers);
  const { data, error, count } = await query.range(startIndex, startIndex + limit - 1);

  if (error) {
    console.error("Supabase query error:", error);
    // Supabase 에러를 제대로 된 Error 객체로 변환
    const errorMessage = error?.message || error?.details || "Failed to fetch orders";
    const customError = new Error(errorMessage);
    customError.status = error?.status || 500;
    customError.code = error?.code;
    throw customError;
  }
  

  const totalItems = count || 0;
  const totalPages = Math.ceil(totalItems / limit);
  console.log(`📊 [주문 단일 조회] 결과: data.length=${data?.length || 0}, totalItems=${totalItems}`);

  // 주문완료+수령가능 필터인 경우 데이터 형식을 orders_with_products와 일치하도록 변환
  let processedData = data || [];
  const needsPickupDateFilter = filters.subStatus === "수령가능";
  if (needsPickupDateFilter && data) {
    processedData = data.map(order => ({
      ...order,
      product_title: order.products?.title,
      product_barcode: order.products?.barcode,
      product_price_options: order.products?.price_options,
      product_pickup_date: order.products?.pickup_date,
      band_key: order.products?.band_key || order.band_key
    }));
    
    // Debug flag via localStorage('debugPickup') === 'true'
    const isDebug = false;

    const countByBand = (arr) => {
      const m = new Map();
      for (const o of arr) {
        const k = o.band_key || 'unknown';
        m.set(k, (m.get(k) || 0) + 1);
      }
      return Object.fromEntries(m.entries());
    };

    // --- 클라이언트(KST) 기준 수령가능 필터 적용 ---
    const isPickupAvailableKST = (dateInput) => {
      if (!dateInput) return false;

      const KST_OFFSET = 9 * 60 * 60 * 1000; // +09:00

      // now in KST as YMD
      const nowUtc = new Date();
      const nowKst = new Date(nowUtc.getTime() + KST_OFFSET);
      const nowY = nowKst.getUTCFullYear();
      const nowM = nowKst.getUTCMonth();
      const nowD = nowKst.getUTCDate();
      const nowYmd = nowY * 10000 + (nowM + 1) * 100 + nowD;

      // parse input as YMD in KST
      let y, m, d;
      try {
        if (typeof dateInput === 'string' && dateInput.includes('T')) {
          // ISO (UTC) -> shift to KST then take YMD
          const dt = new Date(dateInput);
          const k = new Date(dt.getTime() + KST_OFFSET);
          y = k.getUTCFullYear();
          m = k.getUTCMonth() + 1;
          d = k.getUTCDate();
        } else if (typeof dateInput === 'string' && /\d{4}-\d{2}-\d{2}/.test(dateInput)) {
          // 'YYYY-MM-DD' or 'YYYY-MM-DD HH:mm:ss'
          const [datePart] = dateInput.split(' ');
          const [yy, mm, dd] = datePart.split('-').map((n) => parseInt(n, 10));
          y = yy; m = mm; d = dd;
        } else if (typeof dateInput === 'string') {
          // '10월17일' 같은 한국어 표기 케이스 (안전 처리)
          const md = dateInput.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
          if (md) {
            const now = new Date(nowUtc.getTime() + KST_OFFSET);
            y = now.getUTCFullYear();
            m = parseInt(md[1], 10);
            d = parseInt(md[2], 10);
          } else {
            const dt = new Date(dateInput);
            const k = new Date(dt.getTime() + KST_OFFSET);
            y = k.getUTCFullYear();
            m = k.getUTCMonth() + 1;
            d = k.getUTCDate();
          }
        } else if (dateInput instanceof Date) {
          const k = new Date(dateInput.getTime() + KST_OFFSET);
          y = k.getUTCFullYear();
          m = k.getUTCMonth() + 1;
          d = k.getUTCDate();
        } else {
          return false;
        }
      } catch (_) {
        return false;
      }

      const inputYmd = y * 10000 + m * 100 + d;
      return nowYmd >= inputYmd; // 오늘(KST) 날짜 이상이면 수령가능
    };

    const extractBracketDate = (title) => {
      if (!title || typeof title !== 'string') return null;
      // [ ... ] 안의 내용을 추출
      const m = title.match(/^\s*\[([^\]]+)\]/);
      return m ? m[1] : null;
    };

    // KST YMD 숫자 변환기
    const toKstYmd = (dateInput) => {
      if (!dateInput) return null;
      const KST_OFFSET = 9 * 60 * 60 * 1000;
      try {
        let y, m, d;
        if (typeof dateInput === 'string' && dateInput.includes('T')) {
          const dt = new Date(dateInput);
          const k = new Date(dt.getTime() + KST_OFFSET);
          y = k.getUTCFullYear(); m = k.getUTCMonth() + 1; d = k.getUTCDate();
        } else if (typeof dateInput === 'string' && /\d{4}-\d{2}-\d{2}/.test(dateInput)) {
          const [datePart] = dateInput.split(' ');
          const [yy, mm, dd] = datePart.split('-').map((n) => parseInt(n, 10));
          y = yy; m = mm; d = dd;
        } else if (typeof dateInput === 'string') {
          const md = dateInput.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
          if (md) {
            const now = new Date(new Date().getTime() + KST_OFFSET);
            y = now.getUTCFullYear(); m = parseInt(md[1], 10); d = parseInt(md[2], 10);
          } else {
            const dt = new Date(dateInput);
            const k = new Date(dt.getTime() + KST_OFFSET);
            y = k.getUTCFullYear(); m = k.getUTCMonth() + 1; d = k.getUTCDate();
          }
        } else if (dateInput instanceof Date) {
          const k = new Date(dateInput.getTime() + KST_OFFSET);
          y = k.getUTCFullYear(); m = k.getUTCMonth() + 1; d = k.getUTCDate();
        } else {
          return null;
        }
        return y * 10000 + m * 100 + d;
      } catch {
        return null;
      }
    };

    const beforeFilter = processedData.slice();
    processedData = processedData.filter((o) => {
      const titleDate = extractBracketDate(o.product_title);
      const y1 = toKstYmd(o.product_pickup_date);
      const y2 = toKstYmd(titleDate);
      const effectiveYmd = y1 && y2 ? Math.min(y1, y2) : (y1 || y2);
      if (!effectiveYmd) return false;
      // 오늘 KST YMD
      const nowKst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
      const nowYmd = nowKst.getUTCFullYear() * 10000 + (nowKst.getUTCMonth() + 1) * 100 + nowKst.getUTCDate();
      return nowYmd >= effectiveYmd;
    });

    if (isDebug) {
      try {
        const filteredOut = [];
        for (const o of beforeFilter) {
          const titleDate = extractBracketDate(o.product_title);
          const y1 = toKstYmd(o.product_pickup_date);
          const y2 = toKstYmd(titleDate);
          const effectiveYmd = y1 && y2 ? Math.min(y1, y2) : (y1 || y2);
          const usedSource = (y1 && y2) ? (y1 <= y2 ? o.product_pickup_date : titleDate) : (o.product_pickup_date || titleDate);
          const nowKst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
          const nowYmd = nowKst.getUTCFullYear() * 10000 + (nowKst.getUTCMonth() + 1) * 100 + nowKst.getUTCDate();
          const isAvail = effectiveYmd ? nowYmd >= effectiveYmd : false;
          if (!isAvail) {
            filteredOut.push({
              order_id: o.order_id,
              band_key: o.band_key,
              product_title: o.product_title,
              product_pickup_date: o.product_pickup_date,
              titleDate,
              usedSource,
              effectiveYmd,
              reason: !effectiveYmd ? 'no_date' : 'future_date'
            });
          }
        }
        const sample = filteredOut.slice(0, 30);
        console.groupCollapsed('[Pickup Debug] useOrdersClient join-mode');
        console.log('filters', { status: filters.status, subStatus: filters.subStatus, sortBy, ascending, page, limit });
        console.log('counts', {
          before: beforeFilter.length,
          after: processedData.length,
          beforeByBand: countByBand(beforeFilter),
          afterByBand: countByBand(processedData)
        });
        if (sample.length) {
          console.table(sample);
          if (filteredOut.length > sample.length) {
            console.log(`... and ${filteredOut.length - sample.length} more filtered items`);
          }
        } else {
          console.log('No filtered out items.');
        }
        console.groupEnd();
      } catch (e) {
        console.warn('Debug logging failed:', e);
      }
    }

    // 조인 모드에서 클라이언트 사이드 필터링
    // 포스트키 검색은 이미 서버사이드에서 처리되므로 일반 검색어만 처리
    if (filters.search && filters.search !== "undefined") {
      const searchTerm = filters.search;
      const isPostKeySearch = searchTerm.length > 20 && !searchTerm.includes(" ");
      
      // 포스트키 검색이 아닌 경우에만 클라이언트 사이드 필터링 수행
      if (!isPostKeySearch) {
        const normalizeForSearch = (str) => {
          let normalized = str.replace(/\([^)]*\)/g, ' ');
          // 대괄호와 그 안의 내용도 공백으로 치환 (검색 성공률 향상)
          normalized = normalized.replace(/\[[^\]]*\]/g, ' ');
          normalized = normalized.replace(/\s+/g, ' ').trim();
          return normalized;
        };
        
        const normalizedTerm = normalizeForSearch(searchTerm);
        
        // 원본 검색어와 정규화된 검색어 모두 시도
        const searchPatterns = [searchTerm.trim()];
        if (normalizedTerm !== searchTerm.trim()) {
          searchPatterns.push(normalizedTerm);
        }
        
        // 상품명이나 바코드에서 검색어가 포함된 항목만 필터링
        console.log('Client-side filtering (join mode):', {
          searchTerm,
          searchPatterns,
          originalDataLength: processedData.length
        });
        
        processedData = processedData.filter(order => {
          const productTitle = order.product_title || '';
          const productBarcode = order.product_barcode || '';
          const customerName = order.customer_name || '';
          const postKey = order.post_key || '';
          
          // 여러 검색 패턴 중 하나라도 매칭되면 통과
          return searchPatterns.some(pattern => {
            const titleMatch = productTitle.toLowerCase().includes(pattern.toLowerCase());
            const barcodeMatch = productBarcode.toLowerCase().includes(pattern.toLowerCase());
            const customerMatch = customerName.toLowerCase().includes(pattern.toLowerCase());
            const postMatch = postKey.toLowerCase().includes(pattern.toLowerCase());
            
            const matches = titleMatch || barcodeMatch || customerMatch || postMatch;
            
            if (matches) {
              console.log('Match found:', {
                productTitle,
                pattern,
                titleMatch,
                barcodeMatch,
                customerMatch,
                postMatch
              });
            }
            
            return matches;
          });
        });
        
        console.log('Filtered data length:', processedData.length);
      }
      // 포스트키 검색인 경우는 이미 서버사이드에서 필터링됨
    }
  }

  return {
    success: true,
    data: processedData,
    pagination: {
      totalItems,
      totalPages,
      currentPage: page,
      limit,
    },
  };
};

/**
 * 클라이언트 사이드 단일 주문 fetcher
 */
const fetchOrder = async (key) => {
  const [, orderId] = key;

  if (!orderId) {
    throw new Error("Order ID is required");
  }

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("order_id", orderId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new Error("Order not found");
    }
    console.error("Supabase query error:", error);
    // Supabase 에러를 제대로 된 Error 객체로 변환
    const errorMessage = error?.message || error?.details || "Failed to fetch order";
    const customError = new Error(errorMessage);
    customError.status = error?.status || 500;
    customError.code = error?.code;
    throw customError;
  }

  return {
    success: true,
    data: data,
  };
};

/**
 * 클라이언트 사이드 주문 통계 fetcher
 */
const fetchOrderStats = async (key) => {
  const [, userId, filterOptions] = key;

  if (!userId) {
    throw new Error("User ID is required");
  }

  // 기본 통계 쿼리 - orders_with_products 뷰를 사용하여 모든 데이터 가져오기
  // 이 뷰는 이미 products 정보가 조인되어 있음
  let query = supabase
    .from("orders_with_products")
    .select("*", { count: "exact" })
    .eq("user_id", userId);

  // 상태 필터링 (status)
  if (filterOptions.status && filterOptions.status !== "all") {
    query = query.eq("status", filterOptions.status);
  }

  // 부가 상태 필터링 (sub_status)
  if (filterOptions.subStatus && filterOptions.subStatus !== "all") {
    query = query.eq("sub_status", filterOptions.subStatus);
  }

  // 검색어 필터링 (상품명, 고객명 등) - 한글 안전 처리
  if (filterOptions.search) {
    const searchTerm = filterOptions.search;
    
    // 검색을 위한 텍스트 정규화 함수
    const normalizeForSearch = (str) => {
      // 괄호와 그 안의 내용을 공백으로 치환
      let normalized = str.replace(/\([^)]*\)/g, ' ');
      // 여러 공백을 하나로 정리
      normalized = normalized.replace(/\s+/g, ' ').trim();
      return normalized;
    };
    
    // 한글 문자열 처리를 위해 URL 인코딩하지 않고 직접 처리
    try {
      // 괄호가 포함된 경우 정규화된 버전으로 검색
      const normalizedTerm = normalizeForSearch(searchTerm);
      
      if (searchTerm.includes('(') || searchTerm.includes(')')) {
        query = query.or(
          `customer_name.ilike.%${normalizedTerm}%,product_title.ilike.%${normalizedTerm}%`
        );
      } else {
        query = query.or(
          `customer_name.ilike.%${searchTerm}%,product_title.ilike.%${searchTerm}%`
        );
      }
    } catch (error) {
      console.warn('Stats search filter error:', error);
      // 에러 발생시 정규화된 검색어로 고객명만 필터링
      const normalizedTerm = normalizeForSearch(searchTerm);
      query = query.ilike("customer_name", `%${normalizedTerm}%`);
    }
  }

  // 날짜 범위 필터링
  if (filterOptions.startDate && filterOptions.endDate) {
    try {
      // dateType 확인 (기본값: ordered)
      const dateColumn = filterOptions.dateType === "updated" ? "updated_at" : "ordered_at";
      
      // startDate와 endDate는 이미 ISO 문자열로 전달되므로 그대로 사용
      query = query
        .gte(dateColumn, filterOptions.startDate)
        .lte(dateColumn, filterOptions.endDate);
    } catch (dateError) {
      // console.error("Date filter error:", dateError);
    }
  }

  // 제외 고객 필터링
  try {
    const { data: userData } = await supabase
      .from("users")
      .select("excluded_customers")
      .eq("user_id", userId)
      .single();

    if (
      userData?.excluded_customers &&
      Array.isArray(userData.excluded_customers)
    ) {
      const excludedCustomers = userData.excluded_customers;
      if (excludedCustomers.length > 0) {
        query = query.not(
          "customer_name",
          "in",
          `(${excludedCustomers
            .map((name) => `"${name.replace(/"/g, '""')}"`)
            .join(",")})`
        );
      }
    }
  } catch (e) {
    // console.error("Error fetching excluded customers for stats:", e);
  }

  // 먼저 전체 개수를 가져오기
  const { count, error: countError } = await query
    .select("*", { count: "exact", head: true });

  if (countError) {
    console.error("Supabase count error:", countError);
    throw new Error("Failed to get count");
  }

  // 페이징을 통해 모든 데이터 가져오기
  let allData = [];
  const pageSize = 1000;
  const totalPages = Math.ceil((count || 0) / pageSize);
  
  for (let page = 0; page < totalPages; page++) {
    const start = page * pageSize;
    const end = start + pageSize - 1;
    
    const { data: pageData, error: pageError } = await query
      .range(start, end);
    
    if (pageError) {
      console.error("Supabase page error:", pageError);
      throw new Error(`Failed to fetch page ${page + 1}`);
    }
    
    allData = allData.concat(pageData || []);
  }

  const data = allData;
  const error = null;


  // 통계 계산 - count를 사용하여 전체 개수 정확히 계산
  const totalOrders = count || data.length;  // count가 있으면 count 사용, 없으면 data.length
  const totalRevenue = data.reduce(
    (sum, order) => sum + (order.total_amount || 0),
    0
  );

  // 상태별 카운트 (status 기준)
  const statusCounts = data.reduce((acc, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {});

  // 부가 상태별 카운트 (sub_status 기준)
  // 수령완료 상태가 아닌 주문만 카운트
  const subStatusCounts = data.reduce((acc, order) => {
    if (order.sub_status && order.status !== "수령완료") {
      acc[order.sub_status] = (acc[order.sub_status] || 0) + 1;
    }
    return acc;
  }, {});

  // 상품별 통계 (검색된 결과에서)
  const productStats = data.reduce((acc, order) => {
    const productTitle = order.product_title || "상품명 없음";
    if (!acc[productTitle]) {
      acc[productTitle] = {
        totalOrders: 0,
        totalQuantity: 0,
        totalAmount: 0,
        completedOrders: 0,
        pendingOrders: 0,
      };
    }
    acc[productTitle].totalOrders += 1;
    acc[productTitle].totalQuantity += order.quantity || 0;
    acc[productTitle].totalAmount += order.total_amount || 0;

    if (order.status === "수령완료") {
      acc[productTitle].completedOrders += 1;
    } else if (order.status === "주문완료" || order.sub_status === "미수령") {
      acc[productTitle].pendingOrders += 1;
    }

    return acc;
  }, {});

  // 총 수량 계산
  const totalQuantity = data.reduce(
    (sum, order) => sum + (order.quantity || 0),
    0
  );

  return {
    success: true,
    data: {
      totalOrders,
      totalRevenue,
      totalQuantity,
      statusCounts,
      subStatusCounts,
      productStats,
      recentOrders: data.slice(0, 10), // 최근 10개 주문
      filteredData: data, // 필터링된 전체 데이터
    },
  };
};

/**
 * 클라이언트 사이드 주문 목록 훅
 */
export function useOrdersClient(userId, page = 1, filters = {}, options = {}) {
  const getKey = () => {
    if (!userId) return null;
    return ["orders", userId, page, filters];
  };

  const swrOptions = {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 5000,
    ...options,
  };

  return useSWR(getKey, fetchOrders, swrOptions);
}

/**
 * 클라이언트 사이드 단일 주문 훅
 */
export function useOrderClient(orderId, options = {}) {
  const getKey = () => {
    if (!orderId) return null;
    return ["order", orderId];
  };

  return useSWR(getKey, fetchOrder, options);
}

/**
 * 클라이언트 사이드 주문 통계 훅
 */
export function useOrderStatsClient(userId, filterOptions = {}, options = {}) {
  const getKey = () => {
    if (!userId) return null;
    return ["orderStats", userId, filterOptions];
  };

  const swrOptions = {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 10000, // 통계는 조금 더 긴 간격
    ...options,
  };

  return useSWR(getKey, fetchOrderStats, swrOptions);
}

/**
 * 클라이언트 사이드 주문 변경 함수들
 */
export function useOrderClientMutations() {
  const { mutate: globalMutate } = useSWRConfig();

  /**
   * 주문 상태 업데이트
   */
  const updateOrderStatus = async (orderId, updateData, userId) => {
    if (!orderId || !updateData.status) {
      throw new Error("Order ID and status are required");
    }

    const updateFields = {
      status: updateData.status,
      updated_at: new Date().toISOString(),
    };

    // 선택적 필드들
    if (updateData.subStatus !== undefined)
      updateFields.sub_status = updateData.subStatus;
    if (updateData.sub_status !== undefined)  // sub_status 필드도 처리
      updateFields.sub_status = updateData.sub_status;
    if (updateData.shippingInfo !== undefined)
      updateFields.shipping_info = updateData.shippingInfo;
    if (updateData.cancelReason !== undefined)
      updateFields.cancel_reason = updateData.cancelReason;

    // 상태별 시간 필드들 추가
    if (updateData.completed_at !== undefined)
      updateFields.completed_at = updateData.completed_at;
    if (updateData.canceled_at !== undefined)
      updateFields.canceled_at = updateData.canceled_at;

    const { data, error } = await supabase
      .from("orders")
      .update(updateFields)
      .eq("order_id", orderId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new Error("Order not found or access denied");
      }
      // console.error("Error updating order status:", error);
      throw error;
    }

    // 캐시 갱신
    globalMutate(
      ["order", orderId],
      { success: true, data },
      { revalidate: false }
    );
    globalMutate(
      (key) => Array.isArray(key) && key[0] === "orders" && key[1] === userId,
      undefined,
      { revalidate: true }
    );
    globalMutate(
      (key) =>
        Array.isArray(key) && key[0] === "orderStats" && key[1] === userId,
      undefined,
      { revalidate: true }
    );

    return data;
  };

  /**
   * 주문 상세 정보 업데이트
   */
  const updateOrderDetails = async (orderId, updateDetails, userId) => {
    if (!orderId || !userId) {
      throw new Error("Order ID and User ID are required");
    }

    const updateFields = {
      ...updateDetails,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("orders")
      .update(updateFields)
      .eq("order_id", orderId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new Error("Order not found or access denied");
      }
      // console.error("Error updating order details:", error);
      throw error;
    }

    // 캐시 갱신
    globalMutate(
      ["order", orderId],
      { success: true, data },
      { revalidate: false }
    );
    globalMutate(
      (key) => Array.isArray(key) && key[0] === "orders" && key[1] === userId,
      undefined,
      { revalidate: true }
    );

    return data;
  };

  /**
   * 주문 취소
   */
  const cancelOrder = async (orderId, reason, userId) => {
    if (!orderId || !userId) {
      throw new Error("Order ID and User ID are required");
    }

    return await updateOrderStatus(
      orderId,
      {
        status: "주문취소",
        cancelReason: reason,
      },
      userId
    );
  };

  /**
   * 대량 주문 상태 업데이트
   */
  const bulkUpdateOrderStatus = async (orderIds, newStatus, userId, subStatus = undefined) => {
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      throw new Error("Order IDs array is required");
    }

    const updateFields = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    // sub_status 파라미터가 명시적으로 제공된 경우 설정
    if (subStatus !== undefined) {
      updateFields.sub_status = subStatus;
    }

    // 상태별 시간 필드 설정
    const nowISO = new Date().toISOString();
    if (newStatus === "수령완료") {
      updateFields.completed_at = nowISO;
      updateFields.canceled_at = null;
      if (subStatus === undefined) {
        updateFields.sub_status = null;  // 수령완료 시 미수령 상태 제거
      }
    } else if (newStatus === "주문취소") {
      updateFields.canceled_at = nowISO;
      updateFields.completed_at = null;
      if (subStatus === undefined) {
        updateFields.sub_status = null;  // 주문취소 시 미수령 상태 제거
      }
    } else if (newStatus === "주문완료") {
      updateFields.completed_at = null;
      updateFields.canceled_at = null;
    } else if (newStatus === "확인필요") {
      updateFields.completed_at = null;
      updateFields.canceled_at = null;
    }

    const { data, error } = await supabase
      .from("orders")
      .update(updateFields)
      .in("order_id", orderIds)
      .eq("user_id", userId)
      .select();

    if (error) {
      // console.error("Error bulk updating orders:", error);
      throw error;
    }

    // 캐시 갱신
    orderIds.forEach((orderId) => {
      globalMutate(["order", orderId], undefined, { revalidate: true });
    });
    globalMutate(
      (key) => Array.isArray(key) && key[0] === "orders" && key[1] === userId,
      undefined,
      { revalidate: true }
    );
    globalMutate(
      (key) =>
        Array.isArray(key) && key[0] === "orderStats" && key[1] === userId,
      undefined,
      { revalidate: true }
    );

    return data;
  };

  return {
    updateOrderStatus,
    updateOrderDetails,
    cancelOrder,
    bulkUpdateOrderStatus,
  };
}

export default useOrdersClient;
