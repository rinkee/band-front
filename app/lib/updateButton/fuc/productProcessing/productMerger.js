/**
 * 수량 기반 상품 병합 모듈
 * 동일한 상품이 여러 번호로 나뉘어 있는 경우 병합합니다.
 */

/**
 * 동일한 제목을 가진 상품들을 수량 기반으로 병합하는 함수
 *
 * @param {Array} products - 상품 배열
 * @returns {Object|null} 병합된 상품 정보 또는 null (병합 불필요 시)
 */
export function detectAndMergeQuantityBasedProducts(products) {
  if (!products || !Array.isArray(products) || products.length <= 1) {
    return null; // 병합할 필요가 없음
  }

  // 동일한 상품명을 가진 제품들 중 itemNumber/번호가 다른 제품을 식별
  // 예: "[5월1일] 사과" 제품이 1번, 2번, 3번으로 나뉘어 있을 수 있음
  // 제목에서 날짜 부분 제거 후 공백 제거하여 비교용 제목 생성
  const normalizedTitles = products.map((p) => {
    const title = p.title || "";
    return title.replace(/\[\d+월\d+일\]|\[\d+\/\d+\]/, "").trim(); // 날짜 패턴 제거
  });

  // 제목이 동일한 제품 그룹 식별
  const titleGroups = {};
  normalizedTitles.forEach((title, index) => {
    if (!titleGroups[title]) {
      titleGroups[title] = [];
    }
    titleGroups[title].push(index);
  });

  // 동일 제목을 가진 그룹 중 가장 큰 그룹 찾기
  let largestGroupTitle = "";
  let largestGroupSize = 0;
  for (const [title, indices] of Object.entries(titleGroups)) {
    if (indices.length > largestGroupSize) {
      largestGroupTitle = title;
      largestGroupSize = indices.length;
    }
  }

  // 동일 제품으로 판단된 제품들의 인덱스
  const sameProductIndices = titleGroups[largestGroupTitle];

  // 병합 대상 제품들
  const productsToMerge = sameProductIndices.map((idx) => products[idx]);

  // 병합할 첫 번째 제품을 기반으로 함
  const mergedProduct = {
    ...productsToMerge[0]
  };

  // 가격 옵션 병합 준비
  let allPriceOptions = [];
  productsToMerge.forEach((p) => {
    if (p.priceOptions && Array.isArray(p.priceOptions)) {
      // 각 가격 옵션에 해당 상품의 itemNumber 정보 추가
      const enhancedOptions = p.priceOptions.map((opt) => ({
        ...opt,
        itemNumber: p.itemNumber || 1,
        originalDescription: opt.description || ""
      }));
      allPriceOptions = [
        ...allPriceOptions,
        ...enhancedOptions
      ];
    }
  });

  // 중복 제거 및 정렬
  const uniqueOptions = Array.from(
    new Set(allPriceOptions.map((opt) => `${opt.quantity}-${opt.price}`))
  ).map((key) => {
    const [quantity, price] = key.split("-").map(Number);
    const matchingOpts = allPriceOptions.filter(
      (opt) => opt.quantity === quantity && opt.price === price
    );
    // 같은 quantity-price 조합에 대해 첫 번째 설명 사용
    return {
      quantity,
      price,
      description: matchingOpts[0].originalDescription || `${quantity}개 ${price}원`
    };
  });

  // quantity 오름차순으로 정렬
  uniqueOptions.sort((a, b) => a.quantity - b.quantity);

  // 최종 병합 제품 구성
  mergedProduct.priceOptions = uniqueOptions;

  // basePrice 설정: 가장 낮은 quantity의 가격 사용
  if (uniqueOptions.length > 0) {
    const lowestQuantityOption = uniqueOptions.sort((a, b) => b.quantity - a.quantity)[0];
    mergedProduct.basePrice = lowestQuantityOption.price;
  }

  // itemNumber는 첫 번째 상품의 것을 사용
  mergedProduct.itemNumber = productsToMerge[0].itemNumber || 1;

  // 재고 정보가 있다면 합산
  const validStockQuantities = productsToMerge
    .map((p) => p.stockQuantity)
    .filter((q) => typeof q === "number");

  if (validStockQuantities.length > 0) {
    mergedProduct.stockQuantity = validStockQuantities.reduce((sum, q) => sum + q, 0);
  }

  return mergedProduct;
}
