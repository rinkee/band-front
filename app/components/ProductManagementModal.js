"use client";

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useSWRConfig } from 'swr';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const ProductManagementModal = ({ isOpen, onClose, post }) => {
  const { mutate: globalMutate } = useSWRConfig();
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditingPickupDate, setIsEditingPickupDate] = useState(false);
  const [editPickupDate, setEditPickupDate] = useState('');
  const [editPickupTime, setEditPickupTime] = useState('00:00');
  const [currentPost, setCurrentPost] = useState(null);
  const dateInputRef = useRef(null);

  // 새 상품 기본값
  const [newProduct, setNewProduct] = useState({
    title: '',
    base_price: '',
    barcode: '',
    stock_quantity: 0,
  });

  // 모달이 열릴 때 데이터 로드
  useEffect(() => {
    if (isOpen && post) {
      setCurrentPost(post); // post 데이터를 로컬 상태로 복사
      loadProducts();
    }
  }, [isOpen, post]);

  // 모달이 닫히면 편집 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setIsEditingPickupDate(false);
      setEditPickupDate('');
      setEditPickupTime('00:00');
    }
  }, [isOpen]);

  // 상품 목록 로드
  const loadProducts = async () => {
    setIsLoading(true);
    try {
      // 현재 사용자 ID 가져오기
      const userData = JSON.parse(sessionStorage.getItem("userData") || "{}");
      const userId = userData.userId;
      
      if (!userId) {
        console.error('사용자 ID를 찾을 수 없습니다.');
        return;
      }
      
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('user_id', userId)  // user_id 필터 추가
        .eq('post_key', post.post_key)
        .order('posted_at', { ascending: false });

      if (error) throw error;
      
      setProducts(data || []);
    } catch (error) {
      console.error('상품 목록 로드 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const normalizePickupDate = (rawValue) => {
    if (!rawValue && rawValue !== 0) return null;

    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim();
      if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
        return null;
      }

      if (/(Z|[+-]\d{2}:?\d{2})$/.test(trimmed)) {
        let sanitized = trimmed;
        if (!sanitized.includes('T') && sanitized.includes(' ')) {
          sanitized = sanitized.replace(' ', 'T');
        }
        if (/[+-]\d{2}$/.test(sanitized)) {
          sanitized = `${sanitized}:00`;
        }

        const parsed = new Date(sanitized);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
      }

      const naiveMatch = trimmed.match(
        /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2})(?::(\d{2})(?::(\d{2}))?)?)?$/
      );
      if (naiveMatch) {
        const [, yearStr, monthStr, dayStr, hourStr = '00', minuteStr = '00', secondStr = '00'] = naiveMatch;
        const year = Number(yearStr);
        const month = Number(monthStr);
        const day = Number(dayStr);
        const hour = Number(hourStr);
        const minute = Number(minuteStr);
        const second = Number(secondStr);

        return new Date(
          Date.UTC(year, month - 1, day, hour - 9, minute, second)
        ).toISOString();
      }
    }

    try {
      const parsed = new Date(rawValue);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    } catch (_) {}

    return null;
  };

  // 상품 추가
  const addProduct = async () => {
    if (isAdding) return; // 이미 추가 중이면 중복 실행 방지

    try {
      setIsAdding(true);

      // 필수 항목 검증
      if (!newProduct.title || !newProduct.base_price) {
        alert('상품명과 가격은 필수 항목입니다.');
        return;
      }
      // 게시물 기준 첫 상품 여부: posts.is_product가 false/undefined면 첫 상품으로 간주
      const wasEmpty = !post?.is_product;

      // 공통 유틸: 밴드 포스트 URL, 포스트 번호, 이미지 배열 등 생성
      const getPostNumber = () => {
        if (post?.post_number) return String(post.post_number);
        if (post?.post_key && String(post.post_key).includes(':')) {
          const parts = String(post.post_key).split(':');
          return parts[1] || null;
        }
        return null;
      };

      const getBandNumber = () => post?.band_number || post?.bandNumber || (JSON.parse(sessionStorage.getItem("userData") || "{}")?.bandNumber) || '';

      const buildBandPostUrl = () => {
        const band = getBandNumber();
        const pn = getPostNumber();
        if (!band || !pn) return null;
        return `https://band.us/band/${band}/post/${pn}`;
      };

      const buildImageUrls = () => {
        const raw = post?.image_urls || post?.photos_data || null;
        if (!raw) return null;
        try {
          if (Array.isArray(raw)) return raw;
          if (typeof raw === 'string' && raw !== 'null' && raw !== '[]') {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
            // photos_data 는 객체 배열일 수도 있음 {url}
            if (Array.isArray(parsed) || typeof parsed === 'object') {
              const urls = (Array.isArray(parsed) ? parsed : [parsed])
                .map((p) => (p && typeof p === 'object' && p.url ? p.url : (typeof p === 'string' ? p : null)))
                .filter(Boolean);
              return urls.length > 0 ? urls : null;
            }
          }
        } catch (_) {}
        return null;
      };

      // 첫 번째 상품을 기준으로 복사 (있을 경우)
      const baseProduct = products[0] || null;
      const resolvedPickupDateSource = post?.pickup_date || baseProduct?.pickup_date || null;
      const normalizedPickupDate = normalizePickupDate(resolvedPickupDateSource);
      
      let newProductId;
      let newItemNumber;
      let newProductData;

      if (baseProduct) {
        // 기존 product_id의 접두(prefix)를 추출하고, 이미 존재하는 suffix의 최대값을 계산해 다음 번호를 생성
        // 아이템 번호는 해당 게시물의 기존 products에서 최대값 +1로 계산 (product_id 포맷 무관)
        const existingItemNumbers = (products || []).map(p => {
          if (p.item_number !== undefined && p.item_number !== null && !Number.isNaN(Number(p.item_number))) {
            return Number(p.item_number);
          }
          const m = typeof p.product_id === 'string' ? p.product_id.match(/_item(\d+)$/) : null;
          return m ? parseInt(m[1], 10) : 0;
        });
        const maxIndex = existingItemNumbers.length > 0 ? Math.max(...existingItemNumbers) : 0;
        newItemNumber = maxIndex + 1;

        // 신규 product_id는 표준 규칙 사용: prod_userId_bandNumber_postNumber_itemN
        const userIdForId = (JSON.parse(sessionStorage.getItem("userData") || "{}")?.userId) || baseProduct.user_id || '';
        const bandNumberForId = getBandNumber();
        const postNumberForId = getPostNumber();
        const idPrefix = `prod_${userIdForId}_${bandNumberForId}_${postNumberForId}`;
        newProductId = `${idPrefix}_item${newItemNumber}`;

        // 기존 상품 데이터 복사하여 새 상품 생성
        // baseProduct를 복제하되 누락값을 post로 보완, 타입 일치, JSONB는 객체로 유지
        const baseProductsData = (() => {
          try {
            if (typeof baseProduct.products_data === 'string' && baseProduct.products_data !== 'null') {
              return JSON.parse(baseProduct.products_data);
            }
          } catch (_) {}
          return baseProduct.products_data || {};
        })();

        newProductData = {
          ...baseProduct,
          user_id: baseProduct.user_id || (JSON.parse(sessionStorage.getItem("userData") || "{}")?.userId || null),
          product_id: newProductId,
          title: newProduct.title,
          base_price: parseFloat(newProduct.base_price) || baseProduct.base_price,
          barcode: newProduct.barcode || baseProduct.barcode || '',
          quantity: 1,
          pickup_date: normalizedPickupDate,
          stock_quantity: parseInt(newProduct.stock_quantity) || 0,
          item_number: newItemNumber,
          quantity_text: `${parseInt(newProduct.stock_quantity) || 0}개`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          band_post_url: baseProduct.band_post_url || buildBandPostUrl(),
          content: baseProduct.content || post?.content || null,
          post_number: baseProduct.post_number || getPostNumber(),
          posted_at: baseProduct.posted_at || post?.posted_at || null,
          // products_data 업데이트 (객체로 저장)
          products_data: {
            ...(typeof baseProductsData === 'object' ? baseProductsData : {}),
            title: newProduct.title,
            price: parseFloat(newProduct.base_price) || baseProduct.base_price,
            basePrice: parseFloat(newProduct.base_price) || baseProduct.base_price,
            productId: newProductId,
            itemNumber: newItemNumber,
            stockQuantity: parseInt(newProduct.stock_quantity) || 0,
            quantityText: `${parseInt(newProduct.stock_quantity) || 0}개`,
            created_by_modal: true, // 모달에서 생성되었다는 표시
            created_at: new Date().toISOString(),
          },
        };
      } else {
        // 첫 상품 생성 로직 (기존 상품이 없는 게시물)
        const userData = JSON.parse(sessionStorage.getItem("userData") || "{}");
        const userId = userData.userId;
        if (!userId) {
          alert('사용자 인증 정보를 찾을 수 없습니다.');
          return;
        }

        const bandNumber = getBandNumber();
        const postKey = post?.post_key;

        // 해당 게시물의 최대 item_number 찾기
        const maxItemNumber = products.reduce((max, p) => {
          const itemNum = parseInt(p.item_number) || 0;
          return itemNum > max ? itemNum : max;
        }, 0);

        newItemNumber = maxItemNumber + 1;
        const userIdForId = userId;
        const postNumberForId = getPostNumber();
        newProductId = `prod_${userIdForId}_${bandNumber}_${postNumberForId}_item${newItemNumber}`;

        newProductData = {
          product_id: newProductId,
          user_id: userId,
          post_id: post?.post_id || null,
          band_number: bandNumber,
          band_key: post?.band_key || null,
          post_key: postKey,
          title: newProduct.title,
          base_price: parseFloat(newProduct.base_price) || 0,
          barcode: newProduct.barcode || '',
          quantity: 1,
          pickup_date: normalizedPickupDate,
          stock_quantity: parseInt(newProduct.stock_quantity) || 0,
          item_number: newItemNumber,
          quantity_text: `${parseInt(newProduct.stock_quantity) || 0}개`,
          status: '판매중',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          // 포스트 기반 필드 매핑 (기존 데이터와의 정합성 유지)
          band_post_url: buildBandPostUrl(),
          content: post?.content || null,
          post_number: getPostNumber(),
          posted_at: post?.posted_at || null,
          image_urls: buildImageUrls(),
          price_options: [],
          features: [],
          barcode_options: { options: [] },
          product_type: 'individual',
          // JSONB는 객체로 저장
          products_data: {
            title: newProduct.title,
            price: parseFloat(newProduct.base_price) || 0,
            basePrice: parseFloat(newProduct.base_price) || 0,
            productId: newProductId,
            itemNumber: newItemNumber,
            stockQuantity: parseInt(newProduct.stock_quantity) || 0,
            quantityText: `${parseInt(newProduct.stock_quantity) || 0}개`,
            created_by_modal: true,
            created_at: new Date().toISOString(),
          }
        };
      }

      // idx와 기타 불필요한 필드 제거
      delete newProductData.idx;

      const { data, error } = await supabase
        .from('products')
        .insert(newProductData)
        .select();

      if (error) throw error;

      setProducts(prev => [...prev, data[0]]);
      setNewProduct({
        title: '',
        base_price: '',
        barcode: '',
        stock_quantity: 0,
      });
      setIsAddingNew(false);

      // 캐시 갱신
      await globalMutate(key => typeof key === 'string' && key.includes(post.post_key));

      // 첫 상품을 수동으로 추가한 경우, posts.title을 해당 상품명으로 업데이트 (공지/실패 여부 무관)
      if (wasEmpty) {
        try {
          const userData = JSON.parse(sessionStorage.getItem("userData") || "{}");
          const userId = userData.userId;
          const postKey = post?.post_key;
          const productName = (newProduct.title || '').trim();
          if (userId && postKey && productName) {
            const nowMinus9Iso = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
            const { error: postUpdateError } = await supabase
              .from('posts')
              .update({ title: productName, is_product: true, updated_at: nowMinus9Iso })
              .eq('post_key', postKey)
              .eq('user_id', userId);

            if (postUpdateError) {
              console.error('수동 추가 후 Posts 제목 업데이트 실패(클라이언트):', postUpdateError);
              // RLS 등으로 실패 시 서버 라우트로 보정
              try {
                const resp = await fetch('/api/posts/manual-update', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId, postKey, updates: { title: productName, is_product: true } })
                });
                const result = await resp.json();
                if (!resp.ok || !result?.success) {
                  console.error('서비스 라우트 posts 업데이트 실패:', result);
                } else {
                  // 서버 보정 성공 시에도 UI 반영
                  setCurrentPost(prev => prev ? { ...prev, title: productName } : null);
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('postUpdated', { 
                      detail: { postKey, title: productName, is_product: true }
                    }));
                  }
                }
              } catch (svcErr) {
                console.error('서비스 라우트 호출 오류:', svcErr);
              }
            } else {
              // 로컬 상태 및 구독 화면에 즉시 반영
              setCurrentPost(prev => prev ? { ...prev, title: productName } : null);
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('postUpdated', { 
                  detail: { postKey, title: productName, is_product: true }
                }));
              }
            }
          }
        } catch (e) {
          console.error('수동 추가 후 Posts 제목 업데이트 처리 중 오류:', e);
        }
      }

      // 첫 상품 추가가 아니더라도, 상품이 추가되었다면 해당 게시물 is_product를 true로 보정
      if (!wasEmpty) {
        try {
          const userData = JSON.parse(sessionStorage.getItem("userData") || "{}");
          const userId = userData.userId;
          const postKey = post?.post_key;
          if (userId && postKey) {
            const nowMinus9Iso = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
            const { error: isProductUpdateError } = await supabase
              .from('posts')
              .update({ is_product: true, updated_at: nowMinus9Iso })
              .eq('post_key', postKey)
              .eq('user_id', userId);
            if (isProductUpdateError) {
              console.error('Posts is_product 보정 실패(클라이언트):', isProductUpdateError);
              // 실패 시 서버 라우트로 보정
              try {
                const resp = await fetch('/api/posts/manual-update', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId, postKey, updates: { is_product: true } })
                });
                const result = await resp.json();
                if (!resp.ok || !result?.success) {
                  console.error('서비스 라우트 is_product 보정 실패:', result);
                }
              } catch (svcErr) {
                console.error('서비스 라우트 호출 오류:', svcErr);
              }
            } else if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('postUpdated', { detail: { postKey, is_product: true } }));
            }

            // 제목이 실패/공지/빈 경우면 상품명으로 교체 (첫 상품이 아니어도 보정)
            const currentTitle = (post?.title || '').trim();
            const aiFailed = (post?.ai_extraction_status || '').toLowerCase() === 'failed';
            const isNotice = (post?.ai_classification_result || '').trim() === '공지사항';
            const isFailureTitle = currentTitle.replace(/\s+/g, '') === '상품추출실패';
            const productName = (newProduct.title || '').trim();
            const needTitleFix = !!productName && (currentTitle === '' || isFailureTitle || aiFailed || isNotice);
            if (needTitleFix) {
              try {
                const { error: postTitleFixErr } = await supabase
                  .from('posts')
                  .update({ title: productName, updated_at: nowMinus9Iso })
                  .eq('post_key', postKey)
                  .eq('user_id', userId);
                if (postTitleFixErr) {
                  console.error('Posts 제목 보정 실패(클라이언트):', postTitleFixErr);
                  // 서버 보정
                  try {
                    const resp2 = await fetch('/api/posts/manual-update', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userId, postKey, updates: { title: productName } })
                    });
                    const result2 = await resp2.json();
                    if (!resp2.ok || !result2?.success) {
                      console.error('서비스 라우트 제목 보정 실패:', result2);
                    } else if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('postUpdated', { detail: { postKey, title: productName } }));
                    }
                  } catch (svcErr2) {
                    console.error('서비스 라우트 호출 오류:', svcErr2);
                  }
                } else if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('postUpdated', { detail: { postKey, title: productName } }));
                }
              } catch (e) {
                console.error('Posts 제목 보정 처리 중 오류:', e);
              }
            }
          }
        } catch (e) {
          console.error('Posts is_product 보정 처리 중 오류:', e);
        }
      }

    } catch (error) {
      // 오류를 좀 더 명확히 로깅
      const message = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
      console.error('상품 추가 실패:', message);
      alert('상품 추가에 실패했습니다.');
    } finally {
      setIsAdding(false);
    }
  };

  // 상품 업데이트
  const updateProduct = async (productId, updates) => {
    try {
      // 현재 사용자 ID 가져오기
      const userData = JSON.parse(sessionStorage.getItem("userData") || "{}");
      const userId = userData.userId;
      
      if (!userId) {
        alert('사용자 인증 정보를 찾을 수 없습니다.');
        return;
      }

      const normalizedUpdates = { ...updates };
      let parsedBasePrice = null;

      if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'base_price')) {
        const numericPrice = Number(normalizedUpdates.base_price);

        if (Number.isNaN(numericPrice) || numericPrice < 0) {
          alert('가격은 0 이상의 숫자여야 합니다.');
          return;
        }

        parsedBasePrice = numericPrice;
        normalizedUpdates.base_price = numericPrice;
      }

      const timestamp = new Date().toISOString();

      const { error } = await supabase
        .from('products')
        .update({ ...normalizedUpdates, updated_at: timestamp })
        .eq('product_id', productId)
        .eq('user_id', userId);  // user_id 필터 추가

      if (error) throw error;

      setProducts(prev => prev.map(p => 
        p.product_id === productId ? { ...p, ...normalizedUpdates } : p
      ));

      if (parsedBasePrice !== null) {
        const { data: relatedOrders, error: ordersFetchError } = await supabase
          .from('orders')
          .select('order_id, quantity')
          .eq('product_id', productId)
          .eq('user_id', userId);

        if (ordersFetchError) {
          console.error('상품 가격 수정 시 주문 조회 실패:', ordersFetchError);
        } else if (Array.isArray(relatedOrders) && relatedOrders.length > 0) {
          const orderUpdates = relatedOrders.map(order => ({
            order_id: order.order_id,
            user_id: userId,
            price: parsedBasePrice,
            total_amount: parsedBasePrice * (order.quantity || 0),
            updated_at: timestamp,
          }));

          const { error: ordersUpdateError } = await supabase
            .from('orders')
            .upsert(orderUpdates, { onConflict: 'order_id' });

          if (ordersUpdateError) {
            console.error('주문 가격 일괄 업데이트 실패:', ordersUpdateError);
          } else {
            await globalMutate(
              (key) =>
                Array.isArray(key) &&
                key[0] === "orders" &&
                key[1] === userId,
              undefined,
              { revalidate: true }
            );
          }
        }
      }

    } catch (error) {
      console.error('상품 업데이트 실패:', error);
      alert('상품 업데이트에 실패했습니다.');
    }
  };

  // 상품 삭제
  const deleteProduct = async (productId) => {
    if (!confirm('이 상품을 삭제하시겠습니까?')) return;

    try {
      // 현재 사용자 ID 가져오기
      const userData = JSON.parse(sessionStorage.getItem("userData") || "{}");
      const userId = userData.userId;
      
      if (!userId) {
        alert('사용자 인증 정보를 찾을 수 없습니다.');
        return;
      }
      
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('product_id', productId)
        .eq('user_id', userId);  // user_id 필터 추가

      if (error) throw error;

      setProducts(prev => prev.filter(p => p.product_id !== productId));

    } catch (error) {
      console.error('상품 삭제 실패:', error);
      alert('상품 삭제에 실패했습니다.');
    }
  };

  // 수령일 편집 시작
  const handlePickupDateEdit = () => {
    const firstProduct = products && products.length > 0 ? products[0] : null;
    if (firstProduct?.pickup_date) {
      // DB에 저장된 날짜 문자열 파싱
      const pickupDateStr = firstProduct.pickup_date;
      let year, month, day, hours = '00', minutes = '00';
      
      if (pickupDateStr.includes('T')) {
        // ISO 형식 - UTC로 저장, 화면 입력/편집은 KST 기준 → +9시간 보정 후 필드 채움
        const raw = new Date(pickupDateStr);
        const kst = new Date(raw.getTime() + 9 * 60 * 60 * 1000);
        year = kst.getUTCFullYear();
        month = String(kst.getUTCMonth() + 1).padStart(2, '0');
        day = String(kst.getUTCDate()).padStart(2, '0');
        hours = String(kst.getUTCHours()).padStart(2, '0');
        minutes = String(kst.getUTCMinutes()).padStart(2, '0');
      } else if (pickupDateStr.includes(' ')) {
        // "2025-09-14 07:00:00" 형식
        const [datePart, timePart] = pickupDateStr.split(' ');
        [year, month, day] = datePart.split('-');
        [hours, minutes] = timePart ? timePart.split(':') : ['00', '00'];
      } else {
        // "2025-09-14" 형식
        [year, month, day] = pickupDateStr.split('-');
      }
      
      const dateStr = `${year}-${month}-${day}`;
      const timeStr = `${hours}:${minutes}`;
      
      setEditPickupDate(dateStr);
      setEditPickupTime(timeStr);
    } else {
      // 기본값 설정 (오늘 날짜, 한국 시간 기준)
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      setEditPickupDate(`${year}-${month}-${day}`);
      setEditPickupTime('00:00');
    }
    setIsEditingPickupDate(true);
    
    // 캘린더 자동 활성화
    setTimeout(() => {
      if (dateInputRef.current) {
        dateInputRef.current.showPicker();
      }
    }, 100);
  };

  // 수령일 저장
  const handlePickupDateSave = async () => {
    if (!editPickupDate) {
      alert('수령일을 입력해주세요.');
      return;
    }

    // 날짜와 시간을 합쳐서 새로운 수령일 생성 (한국 시간 기준으로 저장)
    const [year, month, day] = editPickupDate.split('-').map(Number);
    const [hours, minutes] = editPickupTime.split(':').map(Number);
    
    
    // 한국 시간으로 Date 객체 생성 (브라우저 로컬 기준)
    const newPickupDateTime = new Date(year, month - 1, day, hours, minutes);
    
    // DB에는 KST 의도 시각이 정확히 보이도록 UTC 기준으로 -9시간 보정하여 저장
    // 예: KST 09:00 → UTC 00:00Z 로 저장
    const utcForDb = new Date(Date.UTC(year, month - 1, day, hours - 9, minutes, 0)).toISOString();
    
    
    // 수령일이 게시물 작성일보다 이전인지 확인
    if (currentPost?.posted_at) {
      const postedDate = new Date(currentPost.posted_at);
      
      if (newPickupDateTime < postedDate) {
        alert('수령일은 게시물 작성일보다 이전으로 설정할 수 없습니다.');
        return;
      }
    }

    try {
      const postKey = post?.post_key;
      if (!postKey) {
        alert('게시물 정보를 찾을 수 없습니다.');
        return;
      }
      
      // 현재 사용자 ID 가져오기
      const userData = JSON.parse(sessionStorage.getItem("userData") || "{}");
      const userId = userData.userId;
      
      if (!userId) {
        alert('사용자 인증 정보를 찾을 수 없습니다.');
        return;
      }

      // 기존 pickup_date 가져오기 (미수령 상태 초기화를 위해)
      const firstProduct = products && products.length > 0 ? products[0] : null;
      let oldPickupDate = null;
      if (firstProduct?.pickup_date) {
        if (firstProduct.pickup_date.includes('T')) {
          // ISO 형식 - UTC로 저장되어 있지만 실제로는 한국 시간
          const tempDate = new Date(firstProduct.pickup_date);
          oldPickupDate = new Date(
            tempDate.getUTCFullYear(),
            tempDate.getUTCMonth(),
            tempDate.getUTCDate(),
            tempDate.getUTCHours(),
            tempDate.getUTCMinutes()
          );
        } else {
          oldPickupDate = new Date(firstProduct.pickup_date);
        }
      }
      
      // 현재 한국 시간 가져오기
      const currentTime = new Date();
      
      // 새로운 수령일이 현재 시간보다 미래인지 확인 (미수령 상태 초기화 조건)
      const shouldResetUndeliveredStatus = newPickupDateTime > currentTime && 
        (!oldPickupDate || oldPickupDate <= currentTime);

      // 보정된 UTC ISO 문자열 저장 (DB에서 KST로 볼 때 의도한 시간으로 표시)
      const dateToSave = utcForDb;

      // products 테이블 업데이트 - user_id 필터 추가
      const nowMinus9Iso = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();

      const { error: productsError } = await supabase
        .from('products')
        .update({ 
          pickup_date: dateToSave,
          updated_at: nowMinus9Iso
        })
        .eq('post_key', postKey)
        .eq('user_id', userId);  // user_id 필터 추가

      if (productsError) throw productsError;

      // 주문 상태 업데이트 (수령일 기준)
      if (shouldResetUndeliveredStatus) {
        console.log('수령일이 미래로 변경되어 미수령 주문 상태를 초기화합니다.');
        
        const { error: ordersResetError } = await supabase
          .from('orders')
          .update({ 
            sub_status: null,
            updated_at: nowMinus9Iso
          })
          .eq('post_key', postKey)
          .eq('user_id', userId)
          .not('sub_status', 'is', null);  // sub_status가 null이 아닌 것만 업데이트

        if (ordersResetError) {
          console.error('주문 상태 초기화 실패:', ordersResetError);
          // 에러가 발생해도 수령일 업데이트는 계속 진행
        } else {
          console.log('미수령 주문 상태 초기화 완료');
        }
      } else if (newPickupDateTime <= currentTime) {
        // 수령일이 현재 시간보다 과거인 경우 미수령으로 설정
        // 수령일이 현재 시간보다 과거인 경우 미수령으로 설정
        
        const { error: ordersUndeliveredError } = await supabase
          .from('orders')
          .update({ 
            sub_status: '미수령',
            updated_at: nowMinus9Iso
          })
          .eq('post_key', postKey)
          .eq('user_id', userId)
          .eq('status', '주문완료');  // 주문완료 상태인 것만 미수령으로 변경

        if (ordersUndeliveredError) {
          console.error('미수령 상태 설정 실패:', ordersUndeliveredError);
        } else {
          console.log('미수령 상태 설정 완료');
        }
      }

      // posts 테이블의 title 업데이트 (날짜 정보만 포함, 시간 제외)
      if (post?.title) {
        const currentTitle = post.title;
        const dateMatch = currentTitle.match(/^\[[^\]]+\](.*)/);  
        if (dateMatch) {
          // 한국 시간 기준으로 날짜 표시
          const month = newPickupDateTime.getMonth() + 1;
          const day = newPickupDateTime.getDate();
          
          const newDateStr = `${month}월${day}일`;
          const newTitle = `[${newDateStr}]${dateMatch[1]}`;
          
          const { error: postsError } = await supabase
            .from('posts')
            .update({ title: newTitle, updated_at: nowMinus9Iso })
            .eq('post_key', postKey)
            .eq('user_id', userId);  // user_id 필터 추가

          if (postsError) {
            console.error('Posts title 업데이트 실패:', postsError);
          } else {
            // 로컬 상태 업데이트로 헤더 제목 실시간 반영
            setCurrentPost(prev => prev ? { ...prev, title: newTitle } : null);
          }
        }
      }

      // 상품 title 업데이트 (날짜 정보만 포함, 시간 제외)
      // 한국 시간 기준으로 날짜 표시
      const month = newPickupDateTime.getMonth() + 1;
      const day = newPickupDateTime.getDate();
      
      const newDateStr = `${month}월${day}일`;

      const updatedProducts = products.map(product => {
        let newTitle = product.title;
        const dateMatch = newTitle.match(/^\[([^\]]+)\](.*)/);
        if (dateMatch) {
          newTitle = `[${newDateStr}]${dateMatch[2]}`;
        }
        return { ...product, pickup_date: dateToSave, title: newTitle };
      });

      // 제목 업데이트를 위해 각 상품의 title도 업데이트
      for (const product of products) {
        const dateMatch = product.title.match(/^\[([^\]]+)\](.*)/);  
        if (dateMatch) {
          const newTitle = `[${newDateStr}]${dateMatch[2]}`;
          
          await supabase
            .from('products')
            .update({ title: newTitle })
            .eq('product_id', product.product_id)
            .eq('user_id', userId);  // user_id 필터 추가
        }
      }

      setProducts(updatedProducts);
      setIsEditingPickupDate(false);
      setEditPickupDate('');
      setEditPickupTime('00:00');

      // 캐시 갱신
      await globalMutate(key => typeof key === 'string' && key.includes(postKey));

      // 전역 이벤트 발생
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('postUpdated', { 
          detail: { postKey, pickup_date: dateToSave } 
        }));
        localStorage.setItem('pickupDateUpdated', Date.now().toString());
      }

      let successMsg = '수령일이 성공적으로 변경되었습니다.';
      if (shouldResetUndeliveredStatus) {
        successMsg += '\n미수령 주문 상태도 초기화되었습니다.';
      } else if (newPickupDateTime <= currentTime) {
        successMsg += '\n해당 주문들을 미수령 상태로 설정했습니다.';
      }
      alert(successMsg);

    } catch (error) {
      console.error('수령일 업데이트 실패:', error);
      alert('수령일 업데이트에 실패했습니다.');
    }
  };

  // 모달 닫기
  const handleClose = () => {
    setEditingProduct(null);
    setIsAddingNew(false);
    setIsEditingPickupDate(false);
    setEditPickupDate('');
    setEditPickupTime('00:00');
    setCurrentPost(null);
    setNewProduct({
      title: '',
      base_price: '',
      barcode: '',
      stock_quantity: 0,
    });
    onClose();
  };

  if (!isOpen || !post) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-lg">
        {/* 헤더 - 심플 스타일 */}
        <div className="relative p-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">상품 관리</h2>
              <p className="text-sm text-gray-500 mt-1 line-clamp-1">{currentPost?.title || post.title}</p>
              
              {/* 수령일 표시/편집 */}
              <div className="mt-3">
                {isEditingPickupDate ? (
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-full">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <input
                      ref={dateInputRef}
                      type="date"
                      value={editPickupDate}
                      min={currentPost?.posted_at ? new Date(currentPost.posted_at).toISOString().split('T')[0] : undefined}
                      onChange={(e) => setEditPickupDate(e.target.value)}
                      className="bg-transparent border-none outline-none text-blue-700 font-medium text-sm"
                      autoFocus
                    />
                    <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <select
                      value={editPickupTime}
                      onChange={(e) => setEditPickupTime(e.target.value)}
                      className="bg-transparent border-none outline-none text-blue-700 font-medium text-sm"
                    >
                      {Array.from({ length: 14 }, (_, index) => {
                        const hour = 7 + index; // 7시부터 20시까지
                        return Array.from({ length: 2 }, (_, halfIndex) => {
                          const minute = halfIndex * 30;
                          const timeValue = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                          
                          // 오전/오후 표시 형식으로 변환
                          const displayHour = hour > 12 ? hour - 12 : hour;
                          const amPm = hour < 12 ? '오전' : '오후';
                          const displayValue = `${amPm} ${displayHour}:${minute.toString().padStart(2, '0')}`;
                          
                          return (
                            <option key={timeValue} value={timeValue}>
                              {displayValue}
                            </option>
                          );
                        });
                      }).flat()}
                    </select>
                    <div className="flex gap-1">
                      <button
                        onClick={handlePickupDateSave}
                        className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded"
                      >
                        저장
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingPickupDate(false);
                          setEditPickupDate('');
                          setEditPickupTime('00:00');
                        }}
                        className="px-2 py-1 bg-gray-500 hover:bg-gray-600 text-white text-xs rounded"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  (() => {
                    const firstProduct = products && products.length > 0 ? products[0] : null;
                    if (firstProduct?.pickup_date) {
                      try {
                        // DB에 저장된 날짜 문자열 파싱
                        const pickupDateStr = firstProduct.pickup_date;
                        let month, day, hours, minutes, pickupDate;
                        
        if (pickupDateStr.includes('T')) {
          // ISO 형식 - UTC로 저장, 화면은 KST 기준 → +9시간 보정 후 표기
          const raw = new Date(pickupDateStr);
          const kst = new Date(raw.getTime() + 9 * 60 * 60 * 1000);
          month = kst.getUTCMonth() + 1;
          day = kst.getUTCDate();
          hours = kst.getUTCHours();
          minutes = kst.getUTCMinutes();
          // 요일 계산용 Date 객체 (KST 날짜 기준)
          pickupDate = new Date(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
                        } else if (pickupDateStr.includes(' ')) {
                          // "2025-09-14 07:00:00" 형식
                          const [datePart, timePart] = pickupDateStr.split(' ');
                          const [year, monthStr, dayStr] = datePart.split('-');
                          const [hoursStr, minutesStr] = timePart ? timePart.split(':') : ['00', '00'];
                          
                          month = parseInt(monthStr);
                          day = parseInt(dayStr);
                          hours = parseInt(hoursStr);
                          minutes = parseInt(minutesStr);
                          pickupDate = new Date(year, month - 1, day);
                        } else {
                          // 날짜만 있는 경우
                          pickupDate = new Date(pickupDateStr);
                          month = pickupDate.getMonth() + 1;
                          day = pickupDate.getDate();
                          hours = 0;
                          minutes = 0;
                        }
                        
                        const days = ['일', '월', '화', '수', '목', '금', '토'];
                        const dayName = days[pickupDate.getDay()];
                        
                        let displayText = `${month}월${day}일 ${dayName}`;
                        
                        // 시간이 00:00이 아니면 시간 정보 추가
                        if (hours !== 0 || minutes !== 0) {
                          const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
                          const amPm = hours < 12 ? '오전' : '오후';
                          const timeStr = `${amPm} ${displayHour}:${minutes.toString().padStart(2, '0')}`;
                          displayText += ` ${timeStr}`;
                        }
                        
                        displayText += ' 수령';
                        
                        return (
                          <button
                            onClick={handlePickupDateEdit}
                            className="inline-flex items-center px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm font-medium rounded-full transition-colors cursor-pointer"
                            title="수령일 수정"
                          >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {displayText}
                          </button>
                        );
                      } catch (e) {
                        console.log('pickup_date 파싱 실패:', e);
                      }
                    }
                    return null;
                  })()
                )}
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 본문 - 스크롤 가능 */}
        <div className="flex-1 overflow-y-auto">
          {/* 상품 목록 섹션 */}
          <div className="p-5">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-medium text-gray-900">상품 목록</h3>
                <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">
                  {products.length}개
                </span>
              </div>
              <button
                onClick={() => setIsAddingNew(true)}
                className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                상품 추가
              </button>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
                <p className="text-gray-500 text-sm">불러오는 중...</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* 새 상품 추가 폼 - 심플 스타일 */}
                {isAddingNew && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-4">새 상품 추가</h4>
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">상품명 *</label>
                          <input
                            type="text"
                            placeholder="상품명을 입력하세요"
                            value={newProduct.title}
                            onChange={(e) => setNewProduct(prev => ({ ...prev, title: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">기본 가격 *</label>
                          <input
                            type="number"
                            placeholder="가격"
                            value={newProduct.base_price}
                            onChange={(e) => setNewProduct(prev => ({ ...prev, base_price: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">바코드</label>
                          <input
                            type="text"
                            placeholder="바코드"
                            value={newProduct.barcode}
                            onChange={(e) => setNewProduct(prev => ({ ...prev, barcode: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">재고수량</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="수량"
                            value={newProduct.stock_quantity}
                            onChange={(e) => setNewProduct(prev => ({ ...prev, stock_quantity: parseInt(e.target.value) || 0 }))}
                            className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          onClick={() => setIsAddingNew(false)}
                          className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium transition-colors"
                        >
                          취소
                        </button>
                        <button
                          onClick={addProduct}
                          disabled={!newProduct.title || !newProduct.base_price || isAdding}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors"
                        >
                          {isAdding ? '추가 중...' : '추가'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 기존 상품 목록 - 심플 스타일 */}
                {products.map((product, index) => (
                  <div key={product.product_id} className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
                    {editingProduct === product.product_id ? (
                      // 편집 모드
                      <div>
                        <h4 className="font-medium text-gray-900 mb-3">상품 편집</h4>
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">상품명</label>
                              <input
                                type="text"
                                value={product.title}
                                onChange={(e) => setProducts(prev => prev.map(p => 
                                  p.product_id === product.product_id ? { ...p, title: e.target.value } : p
                                ))}
                                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">기본 가격</label>
                              <input
                                type="number"
                                value={product.base_price || ''}
                                onChange={(e) => setProducts(prev => prev.map(p => 
                                  p.product_id === product.product_id ? { ...p, base_price: e.target.value } : p
                                ))}
                                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">바코드</label>
                              <input
                                type="text"
                                value={product.barcode || ''}
                                onChange={(e) => setProducts(prev => prev.map(p => 
                                  p.product_id === product.product_id ? { ...p, barcode: e.target.value } : p
                                ))}
                                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">재고수량</label>
                              <input
                                type="number"
                                min="0"
                                value={product.stock_quantity || 0}
                                onChange={(e) => setProducts(prev => prev.map(p => 
                                  p.product_id === product.product_id ? { ...p, stock_quantity: parseInt(e.target.value) || 0 } : p
                                ))}
                                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              onClick={() => setEditingProduct(null)}
                              className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium transition-colors"
                            >
                              취소
                            </button>
                            <button
                              onClick={() => {
                                updateProduct(product.product_id, {
                                  title: product.title,
                                  base_price: product.base_price,
                                  barcode: product.barcode,
                                  stock_quantity: product.stock_quantity,
                                });
                                setEditingProduct(null);
                              }}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
                            >
                              저장
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      // 보기 모드
                      <div>
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className="font-medium text-gray-900">{product.title}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-500">#{index + 1}</span>
                              {product.barcode && (
                                <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                  {product.barcode}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => setEditingProduct(product.product_id)}
                              className="px-2 py-1 text-blue-600 hover:bg-blue-50 rounded text-xs font-medium transition-colors"
                            >
                              편집
                            </button>
                            <button
                              onClick={() => deleteProduct(product.product_id)}
                              className="px-2 py-1 text-red-600 hover:bg-red-50 rounded text-xs font-medium transition-colors"
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {product.base_price && (
                            <div className="bg-gray-50 rounded-md p-2">
                              <div className="text-xs text-gray-500 mb-1">가격</div>
                              <div className="font-medium text-gray-900 text-sm">
                                ₩{parseInt(product.base_price).toLocaleString()}
                              </div>
                            </div>
                          )}
                          <div className="bg-gray-50 rounded-md p-2">
                            <div className="text-xs text-gray-500 mb-1">재고수량</div>
                            <div className="font-medium text-gray-900 text-sm">
                              {product.stock_quantity || 0}개
                            </div>
                          </div>
                        </div>
                        
                        {product.description && (
                          <div className="mt-3 p-2 bg-gray-50 rounded-md">
                            <div className="text-xs text-gray-500 mb-1">설명</div>
                            <p className="text-sm text-gray-700">{product.description}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {products.length === 0 && !isAddingNew && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-3">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                    <p className="text-gray-500 font-medium mb-1">등록된 상품이 없습니다</p>
                    <p className="text-gray-400 text-sm">상품 추가 버튼을 눌러 상품을 등록해보세요</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductManagementModal;
