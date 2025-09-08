"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// 색상 팔레트 정의
const COLOR_PALETTE = [
  { name: "핑크", value: "#ec4899" },
  { name: "빨강", value: "#ef4444" },
  { name: "주황", value: "#f97316" },
  { name: "노랑", value: "#eab308" },
  { name: "초록", value: "#22c55e" },
  { name: "청록", value: "#06b6d4" },
  { name: "하늘", value: "#3b82f6" },
  { name: "파랑", value: "#2563eb" },
  { name: "보라", value: "#8b5cf6" },
  { name: "회색", value: "#6b7280" },
  { name: "검정", value: "#000000" },
  { name: "기본", value: "#374151" },
];

export default function WritePostPage() {
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [content, setContent] = useState("");
  const [images, setImages] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 상품 정보들 (여러 상품 지원)
  const [products, setProducts] = useState([]);

  // 사용자 데이터 가져오기
  useEffect(() => {
    const sessionData = sessionStorage.getItem("userData");
    if (sessionData) {
      const userDataObj = JSON.parse(sessionData);
      setUserData(userDataObj);
    } else {
      router.push("/login");
    }
  }, [router]);

  const handleAddProduct = () => {
    setProducts((prev) => [
      ...prev,
      {
        id: Date.now(),
        title: "",
        basePrice: "",
        options: [{ name: "", price: "" }],
        description: "",
      },
    ]);
  };

  const handleRemoveProduct = (productId) => {
    setProducts((prev) => prev.filter((product) => product.id !== productId));
  };

  const handleProductChange = (productId, field, value) => {
    setProducts((prev) =>
      prev.map((product) =>
        product.id === productId ? { ...product, [field]: value } : product
      )
    );
  };

  const handleAddOption = (productId) => {
    setProducts((prev) =>
      prev.map((product) =>
        product.id === productId
          ? {
              ...product,
              options: [...product.options, { name: "", price: "" }],
            }
          : product
      )
    );
  };

  const handleOptionChange = (productId, optionIndex, field, value) => {
    setProducts((prev) =>
      prev.map((product) =>
        product.id === productId
          ? {
              ...product,
              options: product.options.map((option, i) =>
                i === optionIndex ? { ...option, [field]: value } : option
              ),
            }
          : product
      )
    );
  };

  const handleRemoveOption = (productId, optionIndex) => {
    setProducts((prev) =>
      prev.map((product) =>
        product.id === productId
          ? {
              ...product,
              options: product.options.filter((_, i) => i !== optionIndex),
            }
          : product
      )
    );
  };

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    setImages((prev) => [...prev, ...files]);
  };

  const handleRemoveImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    // HTML 태그를 제거하여 순수 텍스트 확인
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = content;
    const textContent = tempDiv.textContent || tempDiv.innerText || "";

    if (!textContent.trim()) {
      alert("내용을 입력해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("userId", userData.userId);
      formData.append("content", content);
      formData.append("hasProduct", products.length > 0);

      if (products.length > 0) {
        formData.append("productInfo", JSON.stringify(products));
      }

      images.forEach((image, index) => {
        formData.append(`images`, image);
      });

      const response = await fetch("/api/band/write-post", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        alert("게시물이 성공적으로 작성되었습니다!");
        router.push("/posts");
      } else {
        alert(`오류: ${result.message}`);
      }
    } catch (error) {
      console.error("게시물 작성 오류:", error);
      alert("게시물 작성 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!userData) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.back()}
                className="p-2 text-gray-500 hover:text-gray-700"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <h1 className="text-2xl font-bold text-gray-900">글쓰기</h1>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => router.push("/posts")}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                {isSubmitting ? "작성 중..." : "게시"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {/* 글 내용 에디터 */}
          <div className="mb-8">
            <label className="block text-lg font-medium text-gray-900 mb-4">
              내용
            </label>
            <CustomEditor
              value={content}
              onChange={setContent}
              placeholder="무엇을 공유하고 싶나요?"
            />
          </div>

          {/* 이미지 업로드 */}
          <div className="mb-8">
            <label className="block text-lg font-medium text-gray-900 mb-4">
              이미지 및 동영상
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
              <input
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={handleImageUpload}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center space-y-3"
              >
                <svg
                  className="w-12 h-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <div className="text-center">
                  <div className="text-lg font-medium text-gray-900">
                    이미지 또는 동영상 추가
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    클릭하거나 파일을 여기로 드래그하세요
                  </div>
                </div>
              </label>
            </div>

            {/* 선택된 이미지들 */}
            {images.length > 0 && (
              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                {images.map((image, index) => (
                  <div key={index} className="relative">
                    <img
                      src={URL.createObjectURL(image)}
                      alt={`선택된 이미지 ${index + 1}`}
                      className="w-full h-32 object-cover rounded-lg border border-gray-200"
                    />
                    <button
                      onClick={() => handleRemoveImage(index)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 상품 정보들 */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <label className="block text-lg font-medium text-gray-900">
                상품 정보
              </label>
              <button
                onClick={handleAddProduct}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span>상품 추가</span>
              </button>
            </div>

            {products.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                상품 정보가 없습니다. 상품을 추가해보세요.
              </div>
            ) : (
              <div className="space-y-6">
                {products.map((product, productIndex) => (
                  <ProductForm
                    key={product.id}
                    product={product}
                    productIndex={productIndex}
                    onProductChange={handleProductChange}
                    onRemoveProduct={handleRemoveProduct}
                    onAddOption={handleAddOption}
                    onOptionChange={handleOptionChange}
                    onRemoveOption={handleRemoveOption}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 커스텀 에디터 컴포넌트 (밴드 스타일)
function CustomEditor({
  value,
  onChange,
  placeholder = "무엇을 공유하고 싶나요?",
}) {
  const editorRef = useRef(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFontSize, setShowFontSize] = useState(false);

  const executeCommand = (command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    updateContent();
  };

  const updateContent = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      onChange(html);
    }
  };

  const handleInput = () => {
    updateContent();
  };

  const isCommandActive = (command) => {
    return document.queryCommandState(command);
  };

  const handleColorSelect = (color) => {
    executeCommand("foreColor", color);
    setShowColorPicker(false);
  };

  const handleFontSizeSelect = (size) => {
    executeCommand("fontSize", size);
    setShowFontSize(false);
  };

  // 드래그앤드롭 이벤트 핸들러
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(
      (file) => file.type.startsWith("image/") || file.type.startsWith("video/")
    );

    if (imageFiles.length > 0) {
      imageFiles.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const selection = window.getSelection();
          const range = selection.getRangeAt(0);

          if (file.type.startsWith("image/")) {
            const img = document.createElement("img");
            img.src = event.target.result;
            img.style.maxWidth = "100%";
            img.style.height = "auto";
            img.style.marginTop = "8px";
            img.style.marginBottom = "8px";
            range.insertNode(img);
          } else if (file.type.startsWith("video/")) {
            const video = document.createElement("video");
            video.src = event.target.result;
            video.controls = true;
            video.style.maxWidth = "100%";
            video.style.height = "auto";
            video.style.marginTop = "8px";
            video.style.marginBottom = "8px";
            range.insertNode(video);
          }

          // 커서를 삽입된 요소 뒤로 이동
          range.setStartAfter(range.endContainer);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);

          updateContent();
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handlePaste = (e) => {
    // 붙여넣기 시에도 이미지 처리
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));

    if (imageItems.length > 0) {
      e.preventDefault();
      imageItems.forEach((item) => {
        const file = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = document.createElement("img");
          img.src = event.target.result;
          img.style.maxWidth = "100%";
          img.style.height = "auto";
          img.style.marginTop = "8px";
          img.style.marginBottom = "8px";

          const selection = window.getSelection();
          const range = selection.getRangeAt(0);
          range.insertNode(img);

          // 커서를 삽입된 요소 뒤로 이동
          range.setStartAfter(img);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);

          updateContent();
        };
        reader.readAsDataURL(file);
      });
    }
  };

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  return (
    <div className="w-full">
      {/* 밴드 스타일 툴바 */}
      <div className="band-toolbar">
        <button
          type="button"
          onClick={() => executeCommand("bold")}
          className={`band-toolbar-button ${
            isCommandActive("bold") ? "active" : ""
          }`}
          title="굵게"
        >
          <strong>B</strong>
        </button>

        <button
          type="button"
          onClick={() => executeCommand("italic")}
          className={`band-toolbar-button ${
            isCommandActive("italic") ? "active" : ""
          }`}
          title="기울임"
        >
          <em>I</em>
        </button>

        <button
          type="button"
          onClick={() => executeCommand("underline")}
          className={`band-toolbar-button ${
            isCommandActive("underline") ? "active" : ""
          }`}
          title="밑줄"
        >
          <span style={{ textDecoration: "underline" }}>U</span>
        </button>

        <button
          type="button"
          onClick={() => executeCommand("strikeThrough")}
          className={`band-toolbar-button ${
            isCommandActive("strikeThrough") ? "active" : ""
          }`}
          title="취소선"
        >
          <span style={{ textDecoration: "line-through" }}>S</span>
        </button>

        {/* 글자 크기 변경 */}
        <div className="band-font-size-picker">
          <button
            type="button"
            onClick={() => setShowFontSize(!showFontSize)}
            className="band-toolbar-button"
            title="글자 크기"
          >
            <span style={{ fontSize: "11px" }}>A</span>
            <span style={{ fontSize: "14px" }}>A</span>
            <svg
              width="8"
              height="5"
              viewBox="0 0 8 5"
              fill="currentColor"
              style={{ marginLeft: "2px" }}
            >
              <path d="M0 0h8L4 5L0 0z" />
            </svg>
          </button>

          {showFontSize && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowFontSize(false)}
              />
              <div className="band-font-size-palette">
                <button
                  onClick={() => handleFontSizeSelect("1")}
                  className="band-font-size-item"
                  style={{ fontSize: "10px" }}
                >
                  가나다 (10px)
                </button>
                <button
                  onClick={() => handleFontSizeSelect("2")}
                  className="band-font-size-item"
                  style={{ fontSize: "12px" }}
                >
                  가나다 (12px)
                </button>
                <button
                  onClick={() => handleFontSizeSelect("3")}
                  className="band-font-size-item"
                  style={{ fontSize: "14px" }}
                >
                  가나다 (14px)
                </button>
                <button
                  onClick={() => handleFontSizeSelect("4")}
                  className="band-font-size-item"
                  style={{ fontSize: "16px" }}
                >
                  가나다 (16px)
                </button>
                <button
                  onClick={() => handleFontSizeSelect("5")}
                  className="band-font-size-item"
                  style={{ fontSize: "18px" }}
                >
                  가나다 (18px)
                </button>
                <button
                  onClick={() => handleFontSizeSelect("6")}
                  className="band-font-size-item"
                  style={{ fontSize: "20px" }}
                >
                  가나다 (20px)
                </button>
                <button
                  onClick={() => handleFontSizeSelect("7")}
                  className="band-font-size-item"
                  style={{ fontSize: "24px" }}
                >
                  가나다 (24px)
                </button>
              </div>
            </>
          )}
        </div>

        {/* 색상 선택기 - 색깔 박스로 변경 */}
        <div className="band-color-picker">
          <button
            type="button"
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="band-color-main-button"
            title="글자 색상"
          >
            <div className="band-color-preview">
              <div
                className="band-color-sample"
                style={{ backgroundColor: "#333" }}
              ></div>
            </div>
            <svg
              width="8"
              height="5"
              viewBox="0 0 8 5"
              fill="currentColor"
              style={{ marginLeft: "2px" }}
            >
              <path d="M0 0h8L4 5L0 0z" />
            </svg>
          </button>

          {/* 밴드 스타일 색상 팔레트 */}
          {showColorPicker && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowColorPicker(false)}
              />
              <div className="band-color-palette">
                <div className="band-color-grid">
                  {/* 첫 번째 줄 - 밴드 정확한 색상 */}
                  <button
                    type="button"
                    onClick={() => handleColorSelect("#ff1493")}
                    className="band-color-button"
                    style={{ backgroundColor: "#ff1493" }}
                    title="핑크"
                  />
                  <button
                    type="button"
                    onClick={() => handleColorSelect("#ff0000")}
                    className="band-color-button"
                    style={{ backgroundColor: "#ff0000" }}
                    title="빨강"
                  />
                  <button
                    type="button"
                    onClick={() => handleColorSelect("#ff8c00")}
                    className="band-color-button"
                    style={{ backgroundColor: "#ff8c00" }}
                    title="주황"
                  />
                  <button
                    type="button"
                    onClick={() => handleColorSelect("#ffd700")}
                    className="band-color-button"
                    style={{ backgroundColor: "#ffd700" }}
                    title="노랑"
                  />
                  <button
                    type="button"
                    onClick={() => handleColorSelect("#00ff00")}
                    className="band-color-button"
                    style={{ backgroundColor: "#00ff00" }}
                    title="초록"
                  />
                  <button
                    type="button"
                    onClick={() => handleColorSelect("#00ffff")}
                    className="band-color-button"
                    style={{ backgroundColor: "#00ffff" }}
                    title="청록"
                  />

                  {/* 두 번째 줄 */}
                  <button
                    type="button"
                    onClick={() => handleColorSelect("#87ceeb")}
                    className="band-color-button"
                    style={{ backgroundColor: "#87ceeb" }}
                    title="하늘"
                  />
                  <button
                    type="button"
                    onClick={() => handleColorSelect("#0000ff")}
                    className="band-color-button"
                    style={{ backgroundColor: "#0000ff" }}
                    title="파랑"
                  />
                  <button
                    type="button"
                    onClick={() => handleColorSelect("#8a2be2")}
                    className="band-color-button"
                    style={{ backgroundColor: "#8a2be2" }}
                    title="보라"
                  />
                  <button
                    type="button"
                    onClick={() => handleColorSelect("#808080")}
                    className="band-color-button"
                    style={{ backgroundColor: "#808080" }}
                    title="회색"
                  />
                  <button
                    type="button"
                    onClick={() => handleColorSelect("#000000")}
                    className="band-color-button"
                    style={{ backgroundColor: "#000000" }}
                    title="검정"
                  />
                  <button
                    type="button"
                    onClick={() => handleColorSelect("#333333")}
                    className="band-color-button"
                    style={{ backgroundColor: "#333333" }}
                    title="기본"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="band-toolbar-divider"></div>

        <button
          type="button"
          onClick={() => executeCommand("removeFormat")}
          className="band-toolbar-button"
          title="서식 제거"
        >
          ✕
        </button>
      </div>

      {/* 밴드 스타일 에디터 */}
      <div
        ref={editorRef}
        className="band-editor"
        contentEditable
        onInput={handleInput}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onPaste={handlePaste}
        data-placeholder={placeholder}
        suppressContentEditableWarning={true}
      />
    </div>
  );
}

// 상품 폼 컴포넌트
function ProductForm({
  product,
  productIndex,
  onProductChange,
  onRemoveProduct,
  onAddOption,
  onOptionChange,
  onRemoveOption,
}) {
  return (
    <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-blue-900">
          상품 {productIndex + 1}
        </h3>
        <button
          onClick={() => onRemoveProduct(product.id)}
          className="text-red-600 hover:text-red-700 font-medium"
        >
          삭제
        </button>
      </div>

      <div className="space-y-4">
        {/* 상품명 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            상품명 *
          </label>
          <input
            type="text"
            value={product.title}
            onChange={(e) =>
              onProductChange(product.id, "title", e.target.value)
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="상품명을 입력하세요"
          />
        </div>

        {/* 기본 가격 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            기본 가격 *
          </label>
          <input
            type="number"
            value={product.basePrice}
            onChange={(e) =>
              onProductChange(product.id, "basePrice", e.target.value)
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="기본 가격을 입력하세요"
          />
        </div>

        {/* 옵션들 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              옵션
            </label>
            <button
              onClick={() => onAddOption(product.id)}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              + 옵션 추가
            </button>
          </div>

          <div className="space-y-2">
            {product.options.map((option, optionIndex) => (
              <div key={optionIndex} className="flex space-x-2">
                <input
                  type="text"
                  value={option.name}
                  onChange={(e) =>
                    onOptionChange(
                      product.id,
                      optionIndex,
                      "name",
                      e.target.value
                    )
                  }
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="옵션명"
                />
                <input
                  type="number"
                  value={option.price}
                  onChange={(e) =>
                    onOptionChange(
                      product.id,
                      optionIndex,
                      "price",
                      e.target.value
                    )
                  }
                  className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="추가 가격"
                />
                {product.options.length > 1 && (
                  <button
                    onClick={() => onRemoveOption(product.id, optionIndex)}
                    className="px-3 py-2 text-red-600 hover:text-red-700"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 상품 설명 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            상품 설명
          </label>
          <textarea
            value={product.description}
            onChange={(e) =>
              onProductChange(product.id, "description", e.target.value)
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows="3"
            placeholder="상품에 대한 자세한 설명을 입력하세요"
          />
        </div>
      </div>
    </div>
  );
}
