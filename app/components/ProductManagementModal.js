"use client";

import React, { useState, useEffect } from 'react';
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
  const [commonPickupDate, setCommonPickupDate] = useState('');

  // 새 상품 기본값
  const [newProduct, setNewProduct] = useState({
    title: '',
    base_price: '',
    description: '',
    barcode: '',
    remaining_quantity: 0,
  });

  // 모달이 열릴 때 데이터 로드
  useEffect(() => {
    if (isOpen && post) {
      loadProducts();
    }
  }, [isOpen, post]);

  // 상품 목록 로드
  const loadProducts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('post_key', post.post_key)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      setProducts(data || []);
      
      // 첫 번째 상품의 pickup_date를 공통 수령일로 설정
      if (data && data.length > 0 && data[0].pickup_date) {
        setCommonPickupDate(new Date(data[0].pickup_date).toISOString().split('T')[0]);
      }
    } catch (error) {
      console.error('상품 목록 로드 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 공통 수령일 업데이트 (모든 상품에 적용)
  const updateCommonPickupDate = async (newDate) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ 
          pickup_date: newDate,
          updated_at: new Date().toISOString() 
        })
        .eq('post_key', post.post_key);

      if (error) throw error;

      setCommonPickupDate(newDate);
      setProducts(prev => prev.map(p => ({ ...p, pickup_date: newDate })));
      
      // 캐시 갱신
      await globalMutate(key => typeof key === 'string' && key.includes(post.post_key));
      
      // 전역 이벤트 발생
      window.dispatchEvent(new CustomEvent('postUpdated', { 
        detail: { postKey: post.post_key, pickup_date: newDate } 
      }));
      
      localStorage.setItem('pickupDateUpdated', Date.now().toString());

    } catch (error) {
      console.error('수령일 업데이트 실패:', error);
      alert('수령일 업데이트에 실패했습니다.');
    }
  };

  // 상품 추가
  const addProduct = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .insert({
          ...newProduct,
          post_key: post.post_key,
          band_key: post.band_key,
          pickup_date: commonPickupDate || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select();

      if (error) throw error;

      setProducts(prev => [...prev, data[0]]);
      setNewProduct({
        title: '',
        base_price: '',
        description: '',
        barcode: '',
        remaining_quantity: 0,
      });
      setIsAddingNew(false);

    } catch (error) {
      console.error('상품 추가 실패:', error);
      alert('상품 추가에 실패했습니다.');
    }
  };

  // 상품 업데이트
  const updateProduct = async (productId, updates) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('product_id', productId);

      if (error) throw error;

      setProducts(prev => prev.map(p => 
        p.product_id === productId ? { ...p, ...updates } : p
      ));

    } catch (error) {
      console.error('상품 업데이트 실패:', error);
      alert('상품 업데이트에 실패했습니다.');
    }
  };

  // 상품 삭제
  const deleteProduct = async (productId) => {
    if (!confirm('이 상품을 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('product_id', productId);

      if (error) throw error;

      setProducts(prev => prev.filter(p => p.product_id !== productId));

    } catch (error) {
      console.error('상품 삭제 실패:', error);
      alert('상품 삭제에 실패했습니다.');
    }
  };

  // 모달 닫기
  const handleClose = () => {
    setEditingProduct(null);
    setIsAddingNew(false);
    setNewProduct({
      title: '',
      base_price: '',
      description: '',
      barcode: '',
      remaining_quantity: 0,
    });
    onClose();
  };

  if (!isOpen || !post) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* 헤더 - 토스 스타일 */}
        <div className="relative p-6 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900">상품 관리</h2>
              <p className="text-sm text-gray-500 mt-1 line-clamp-1">{post.title}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 본문 - 스크롤 가능 */}
        <div className="flex-1 overflow-y-auto">
          {/* 공통 수령일 섹션 - 토스 카드 스타일 */}
          <div className="p-6 border-b border-gray-50">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900">수령일 관리</h3>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={commonPickupDate}
                  onChange={(e) => updateCommonPickupDate(e.target.value)}
                  className="flex-1 px-4 py-3 bg-white border-0 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm font-medium"
                />
                <div className="text-xs text-blue-600 bg-blue-100 px-3 py-2 rounded-lg font-medium">
                  전체 적용
                </div>
              </div>
            </div>
          </div>

          {/* 상품 목록 섹션 */}
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-gray-900">상품 목록</h3>
                <div className="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-full font-medium">
                  {products.length}개
                </div>
              </div>
              <button
                onClick={() => setIsAddingNew(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium transition-colors shadow-lg hover:shadow-xl"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                상품 추가
              </button>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-gray-500 text-sm">상품을 불러오는 중...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 새 상품 추가 폼 - 토스 스타일 */}
                {isAddingNew && (
                  <div className="bg-green-50 border border-green-200 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </div>
                      <h4 className="font-semibold text-green-800">새 상품 추가</h4>
                    </div>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">상품명 *</label>
                          <input
                            type="text"
                            placeholder="상품명을 입력하세요"
                            value={newProduct.title}
                            onChange={(e) => setNewProduct(prev => ({ ...prev, title: e.target.value }))}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">기본 가격</label>
                          <input
                            type="number"
                            placeholder="가격"
                            value={newProduct.base_price}
                            onChange={(e) => setNewProduct(prev => ({ ...prev, base_price: e.target.value }))}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">바코드</label>
                          <input
                            type="text"
                            placeholder="바코드"
                            value={newProduct.barcode}
                            onChange={(e) => setNewProduct(prev => ({ ...prev, barcode: e.target.value }))}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">잔여수량</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="수량"
                            value={newProduct.remaining_quantity}
                            onChange={(e) => setNewProduct(prev => ({ ...prev, remaining_quantity: parseInt(e.target.value) || 0 }))}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">설명</label>
                        <textarea
                          placeholder="상품 설명을 입력하세요"
                          value={newProduct.description}
                          onChange={(e) => setNewProduct(prev => ({ ...prev, description: e.target.value }))}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none resize-none"
                          rows="3"
                        />
                      </div>
                      <div className="flex justify-end gap-3 pt-2">
                        <button
                          onClick={() => setIsAddingNew(false)}
                          className="px-6 py-2.5 text-gray-600 hover:text-gray-800 font-medium transition-colors"
                        >
                          취소
                        </button>
                        <button
                          onClick={addProduct}
                          disabled={!newProduct.title}
                          className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors shadow-lg hover:shadow-xl disabled:shadow-none"
                        >
                          추가하기
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 기존 상품 목록 - 토스 카드 스타일 */}
                {products.map((product, index) => (
                  <div key={product.product_id} className="bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-lg transition-shadow">
                    {editingProduct === product.product_id ? (
                      // 편집 모드
                      <div>
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </div>
                          <h4 className="font-semibold text-blue-800">상품 편집</h4>
                        </div>
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">상품명</label>
                              <input
                                type="text"
                                value={product.title}
                                onChange={(e) => setProducts(prev => prev.map(p => 
                                  p.product_id === product.product_id ? { ...p, title: e.target.value } : p
                                ))}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">기본 가격</label>
                              <input
                                type="number"
                                value={product.base_price || ''}
                                onChange={(e) => setProducts(prev => prev.map(p => 
                                  p.product_id === product.product_id ? { ...p, base_price: e.target.value } : p
                                ))}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">바코드</label>
                              <input
                                type="text"
                                value={product.barcode || ''}
                                onChange={(e) => setProducts(prev => prev.map(p => 
                                  p.product_id === product.product_id ? { ...p, barcode: e.target.value } : p
                                ))}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">잔여수량</label>
                              <input
                                type="number"
                                min="0"
                                value={product.remaining_quantity || 0}
                                onChange={(e) => setProducts(prev => prev.map(p => 
                                  p.product_id === product.product_id ? { ...p, remaining_quantity: parseInt(e.target.value) || 0 } : p
                                ))}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">설명</label>
                            <textarea
                              value={product.description || ''}
                              onChange={(e) => setProducts(prev => prev.map(p => 
                                p.product_id === product.product_id ? { ...p, description: e.target.value } : p
                              ))}
                              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                              rows="3"
                            />
                          </div>
                          <div className="flex justify-end gap-3 pt-2">
                            <button
                              onClick={() => setEditingProduct(null)}
                              className="px-6 py-2.5 text-gray-600 hover:text-gray-800 font-medium transition-colors"
                            >
                              취소
                            </button>
                            <button
                              onClick={() => {
                                updateProduct(product.product_id, {
                                  title: product.title,
                                  base_price: product.base_price,
                                  barcode: product.barcode,
                                  description: product.description,
                                  remaining_quantity: product.remaining_quantity,
                                });
                                setEditingProduct(null);
                              }}
                              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors shadow-lg hover:shadow-xl"
                            >
                              저장하기
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      // 보기 모드
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                              </svg>
                            </div>
                            <div>
                              <h4 className="font-semibold text-gray-900 text-lg">{product.title}</h4>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-sm text-gray-500">#{index + 1}</span>
                                {product.barcode && (
                                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                                    {product.barcode}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingProduct(product.product_id)}
                              className="flex items-center gap-1 px-3 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-medium text-sm"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              편집
                            </button>
                            <button
                              onClick={() => deleteProduct(product.product_id)}
                              className="flex items-center gap-1 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium text-sm"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              삭제
                            </button>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {product.base_price && (
                            <div className="bg-gray-50 rounded-xl p-3">
                              <div className="text-xs text-gray-500 mb-1">가격</div>
                              <div className="font-semibold text-gray-900">
                                ₩{parseInt(product.base_price).toLocaleString()}
                              </div>
                            </div>
                          )}
                          <div className="bg-gray-50 rounded-xl p-3">
                            <div className="text-xs text-gray-500 mb-1">잔여수량</div>
                            <div className="font-semibold text-gray-900">
                              {product.remaining_quantity || 0}개
                            </div>
                          </div>
                          {product.pickup_date && (
                            <div className="bg-blue-50 rounded-xl p-3">
                              <div className="text-xs text-blue-600 mb-1">수령일</div>
                              <div className="font-semibold text-blue-700 text-sm">
                                {(() => {
                                  const date = new Date(product.pickup_date);
                                  return `${date.getMonth() + 1}월${date.getDate()}일`;
                                })()}
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {product.description && (
                          <div className="mt-4 p-3 bg-gray-50 rounded-xl">
                            <div className="text-xs text-gray-500 mb-2">설명</div>
                            <p className="text-sm text-gray-700 leading-relaxed">{product.description}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {products.length === 0 && !isAddingNew && (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                    <p className="text-gray-500 text-lg font-medium mb-2">등록된 상품이 없어요</p>
                    <p className="text-gray-400 text-sm">상품 추가 버튼을 눌러 첫 상품을 등록해보세요</p>
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