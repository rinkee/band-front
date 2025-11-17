/**
 * 번호 지정 상품 추출 모듈
 * 게시물 내용에서 번호가 지정된 상품을 추출합니다.
 */

/**
 * 게시물 내용에서 번호가 지정된 상품을 추출하는 함수
 *
 * @param {string} content - 게시물 내용
 * @returns {Array} 추출된 상품 배열
 *
 * @example
 * // 지원하는 패턴:
 * // 1번. 상품명 10,000원
 * // 1. 상품명 10,000원
 * // ①상품명 10,000원
 */
export function extractNumberedProducts(content) {
  if (!content) return [];

  // 줄별로 분리
  const lines = content.split("\n");
  const products = [];

  // 번호 지정 상품 패턴
  // 1. '1번. 상품명 10,000원'
  // 2. '1. 상품명 10,000원'
  // 3. ①상품명 10,000원
  const numberPatterns = [
    /^\s*(\d+)[번호]\.\s*(.*?)(?:\s*[\:：]\s*|\s+)(\d{1,3}(?:,\d{3})*)\s*원/i,
    /^\s*(\d+)\.\s*(.*?)(?:\s*[\:：]\s*|\s+)(\d{1,3}(?:,\d{3})*)\s*원/i,
    /^\s*[①②③④⑤⑥⑦⑧⑨⑩]\s*(.*?)(?:\s*[\:：]\s*|\s+)(\d{1,3}(?:,\d{3})*)\s*원/i,
    /^\s*(\d+)[번호][\.:]?\s*(.*?)\s*(\d{1,3}(?:,\d{3})*)\s*원/i,
    /^\s*(\d+)[\.:]\s*(.*?)\s*(\d{1,3}(?:,\d{3})*)\s*원/i,
    /^\s*[①②③④⑤⑥⑦⑧⑨⑩]\s*(.*?)\s*(\d{1,3}(?:,\d{3})*)\s*원/i
  ];

  // 특수문자 번호를 숫자로 변환하는 맵
  const specialNumMap = {
    "①": 1,
    "②": 2,
    "③": 3,
    "④": 4,
    "⑤": 5,
    "⑥": 6,
    "⑦": 7,
    "⑧": 8,
    "⑨": 9,
    "⑩": 10
  };

  for (const line of lines) {
    let found = false;

    // 패턴 1, 2: 숫자 + 번호/. + 상품명 + 가격
    for (const pattern of numberPatterns.slice(0, 2)) {
      const match = line.match(pattern);
      if (match) {
        const itemNumber = parseInt(match[1]);
        const title = match[2].trim();
        const price = parseInt(match[3].replace(/,/g, ""));
        products.push({
          itemNumber,
          title,
          price,
          description: `${itemNumber}번 상품`
        });
        found = true;
        break;
      }
    }

    // 패턴 3: 특수문자 번호
    if (!found) {
      const match = line.match(numberPatterns[2]);
      if (match) {
        const specialNum = line.charAt(0);
        const itemNumber = specialNumMap[specialNum] || 1;
        const title = match[1].trim();
        const price = parseInt(match[2].replace(/,/g, ""));
        products.push({
          itemNumber,
          title,
          price,
          description: `${itemNumber}번 상품`
        });
        found = true;
      }
    }

    // 패턴 4, 5: 숫자 + 번호/. + 상품명 + 가격 (콜론 없는 버전)
    if (!found) {
      for (const pattern of numberPatterns.slice(3, 5)) {
        const match = line.match(pattern);
        if (match) {
          const itemNumber = parseInt(match[1]);
          const title = match[2].trim();
          const price = parseInt(match[3].replace(/,/g, ""));
          products.push({
            itemNumber,
            title,
            price,
            description: `${itemNumber}번 상품`
          });
          found = true;
          break;
        }
      }
    }

    // 패턴 6: 특수문자 번호 (콜론 없는 버전)
    if (!found) {
      const match = line.match(numberPatterns[5]);
      if (match) {
        const specialNum = line.charAt(0);
        const itemNumber = specialNumMap[specialNum] || 1;
        const title = match[1].trim();
        const price = parseInt(match[2].replace(/,/g, ""));
        products.push({
          itemNumber,
          title,
          price,
          description: `${itemNumber}번 상품`
        });
      }
    }
  }

  return products;
}
