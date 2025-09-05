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
  const [postData, setPostData] = useState({
    pickup_date: '',
    remaining_quantity: 0,
  });

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
      loadPostData();
      loadProducts();
    }
  }, [isOpen, post]);

  // 게시물 데이터 로드
  const loadPostData = async () => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('pickup_date, remaining_quantity')
        .eq('post_key', post.post_key)
        .single();

      if (error) throw error;

      setPostData({
        pickup_date: data.pickup_date ? new Date(data.pickup_date).toISOString().split('T')[0] : '',
        remaining_quantity: data.remaining_quantity || 0,
      });
    } catch (error) {
      console.error('게시물 데이터 로드 실패:', error);
    }
  };

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
    } catch (error) {
      console.error('상품 목록 로드 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 게시물 데이터 업데이트
  const updatePostData = async (field, value) => {
    try {
      const { error } = await supabase
        .from('posts')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('post_key', post.post_key);

      if (error) throw error;

      setPostData(prev => ({ ...prev, [field]: value }));
      
      // 캐시 갱신
      await globalMutate(key => typeof key === 'string' && key.includes(post.post_key));
      
      // 전역 이벤트 발생
      window.dispatchEvent(new CustomEvent('postUpdated', { 
        detail: { postKey: post.post_key, [field]: value } 
      }));

    } catch (error) {
      console.error(`${field} 업데이트 실패:`, error);
      alert(`${field} 업데이트에 실패했습니다.`);
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
          pickup_date: postData.pickup_date || null,
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex justify-between items-center p-6 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-900">상품 관리</h2>
            <p className="text-sm text-gray-600 mt-1">{post.title}</p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* 본문 - 스크롤 가능 */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 게시물 정보 */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">게시물 정보</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  수령일자
                </label>
                <input
                  type="date"
                  value={postData.pickup_date}
                  onChange={(e) => updatePostData('pickup_date', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  잔여수량
                </label>
                <input
                  type="number"
                  min="0"
                  value={postData.remaining_quantity}
                  onChange={(e) => updatePostData('remaining_quantity', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* 상품 목록 */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">상품 목록</h3>
              <button
                onClick={() => setIsAddingNew(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
              >
                + 상품 추가
              </button>
            </div>

            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-500 mt-2">로딩 중...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 새 상품 추가 폼 */}
                {isAddingNew && (
                  <div className="border border-green-200 rounded-lg p-4 bg-green-50">
                    <h4 className="font-medium text-green-800 mb-3">새 상품 추가</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="상품명"
                        value={newProduct.title}
                        onChange={(e) => setNewProduct(prev => ({ ...prev, title: e.target.value }))}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <input
                        type="number"
                        placeholder="기본 가격"
                        value={newProduct.base_price}
                        onChange={(e) => setNewProduct(prev => ({ ...prev, base_price: e.target.value }))}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <input
                        type="text"
                        placeholder="바코드"
                        value={newProduct.barcode}
                        onChange={(e) => setNewProduct(prev => ({ ...prev, barcode: e.target.value }))}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <input
                        type="number"
                        placeholder="잔여수량"
                        min="0"
                        value={newProduct.remaining_quantity}
                        onChange={(e) => setNewProduct(prev => ({ ...prev, remaining_quantity: parseInt(e.target.value) || 0 }))}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <textarea
                        placeholder="설명"
                        value={newProduct.description}
                        onChange={(e) => setNewProduct(prev => ({ ...prev, description: e.target.value }))}
                        className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        rows="2"
                      />
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                      <button
                        onClick={() => setIsAddingNew(false)}
                        className="px-3 py-1 text-gray-600 hover:text-gray-800"
                      >
                        취소
                      </button>
                      <button
                        onClick={addProduct}
                        disabled={!newProduct.title}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                      >
                        추가
                      </button>
                    </div>
                  </div>
                )}

                {/* 기존 상품 목록 */}
                {products.map((product) => (
                  <div key={product.product_id} className="border border-gray-200 rounded-lg p-4">
                    {editingProduct === product.product_id ? (
                      // 편집 모드
                      <div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                          <input
                            type="text"
                            placeholder="상품명"
                            value={product.title}
                            onChange={(e) => setProducts(prev => prev.map(p => 
                              p.product_id === product.product_id ? { ...p, title: e.target.value } : p
                            ))}
                            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <input
                            type="number"
                            placeholder="기본 가격"
                            value={product.base_price || ''}
                            onChange={(e) => setProducts(prev => prev.map(p => 
                              p.product_id === product.product_id ? { ...p, base_price: e.target.value } : p
                            ))}
                            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <input
                            type="text"
                            placeholder="바코드"
                            value={product.barcode || ''}
                            onChange={(e) => setProducts(prev => prev.map(p => 
                              p.product_id === product.product_id ? { ...p, barcode: e.target.value } : p
                            ))}
                            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <input
                            type="number"
                            placeholder="잔여수량"
                            min="0"
                            value={product.remaining_quantity || 0}
                            onChange={(e) => setProducts(prev => prev.map(p => 
                              p.product_id === product.product_id ? { ...p, remaining_quantity: parseInt(e.target.value) || 0 } : p
                            ))}
                            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <textarea
                            placeholder="설명"
                            value={product.description || ''}
                            onChange={(e) => setProducts(prev => prev.map(p => 
                              p.product_id === product.product_id ? { ...p, description: e.target.value } : p
                            ))}
                            className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            rows="2"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditingProduct(null)}
                            className="px-3 py-1 text-gray-600 hover:text-gray-800"
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
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                          >
                            저장
                          </button>
                        </div>
                      </div>
                    ) : (
                      // 보기 모드
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-medium text-gray-900">{product.title}</h4>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingProduct(product.product_id)}
                              className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                              편집
                            </button>
                            <button
                              onClick={() => deleteProduct(product.product_id)}
                              className="text-red-600 hover:text-red-800 text-sm"
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          {product.base_price && <p>가격: ₩{parseInt(product.base_price).toLocaleString()}</p>}
                          {product.barcode && <p>바코드: {product.barcode}</p>}
                          <p>잔여수량: {product.remaining_quantity || 0}개</p>
                          {product.description && <p>설명: {product.description}</p>}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {products.length === 0 && !isAddingNew && (
                  <div className="text-center py-8 text-gray-500">
                    등록된 상품이 없습니다.
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