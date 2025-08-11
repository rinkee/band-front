// 유사도 기반 매칭 함수

import { extractQuantityFromComment } from './orderPatternExtraction.js';

/**
 * 상품명 기반 유사도 매칭
 */
export function findBestProductMatch(
  commentText,
  productMap
) {
  if (!commentText || !productMap || productMap.size === 0) {
    return null;
  }

  const normalizedComment = normalizeText(commentText);
  let bestMatch = null;
  let highestScore = 0;

  for (const [itemNumber, productInfo] of productMap) {
    const productTitle = productInfo.title || "";
    const normalizedTitle = normalizeText(productTitle);
    
    // 정확한 매칭 체크
    if (normalizedComment.includes(normalizedTitle) || normalizedTitle.includes(normalizedComment)) {
      const exactScore = 1.0;
      if (exactScore > highestScore) {
        highestScore = exactScore;
        bestMatch = {
          itemNumber,
          productInfo,
          score: exactScore,
          similarity: {
            exactMatch: true,
            matchedWords: [normalizedTitle],
            matchRatio: 1.0
          }
        };
      }
      continue;
    }

    // 단어 기반 유사도 계산
    const similarity = calculateWordSimilarity(normalizedComment, normalizedTitle);
    
    if (similarity.score > highestScore) {
      highestScore = similarity.score;
      bestMatch = {
        itemNumber,
        productInfo,
        score: similarity.score,
        similarity
      };
    }
  }

  return bestMatch;
}

/**
 * 유사도 기반 주문 추출
 */
export function extractOrderBySimilarityMatching(
  commentText,
  productMap
) {
  if (!commentText || !productMap || productMap.size === 0) {
    return null;
  }

  // 취소/비주문 댓글 체크
  const cancelKeywords = ["취소", "마감", "완판", "품절", "감사", "잘받았", "수고"];
  const lowerComment = commentText.toLowerCase();
  
  if (cancelKeywords.some((keyword) => lowerComment.includes(keyword))) {
    return null;
  }

  // 가장 유사한 상품 찾기
  const bestMatch = findBestProductMatch(commentText, productMap);
  if (!bestMatch) {
    return null;
  }

  // 디버그: 유사도 점수 출력
  console.log(
    `[유사도 매칭] "${commentText}" → 상품 ${bestMatch.itemNumber}번 "${bestMatch.productInfo.title}" (점수: ${bestMatch.score.toFixed(3)})`
  );

  // 최소 유사도 임계값 체크 (0.05로 낮춰서 더 많은 매칭 허용)
  const MIN_SIMILARITY_THRESHOLD = 0.05;
  if (bestMatch.score < MIN_SIMILARITY_THRESHOLD) {
    console.log(
      `[유사도 매칭] 점수 ${bestMatch.score.toFixed(3)}가 임계값 ${MIN_SIMILARITY_THRESHOLD}보다 낮아 매칭 실패`
    );
    return null;
  }

  // 수량 추출
  const quantity = extractQuantityFromComment(commentText);
  
  const orderResult = {
    itemNumber: bestMatch.itemNumber,
    quantity: quantity,
    matchType: "similarity-matching",
    similarity: bestMatch.similarity,
    score: bestMatch.score,
    matchedWords: bestMatch.similarity.matchedWords,
    isAmbiguous: bestMatch.score < 0.3
  };

  return [orderResult];
}

/**
 * 텍스트 정규화
 */
function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[~!@#$%^&*()_+=\[\]{};:'",.<>?\/\\|-]/g, "")
    .trim();
}

/**
 * 단어 기반 유사도 계산
 */
function calculateWordSimilarity(text1, text2) {
  const words1 = text1.split(/\s+/).filter((w) => w.length > 0);
  const words2 = text2.split(/\s+/).filter((w) => w.length > 0);
  
  if (words1.length === 0 || words2.length === 0) {
    return {
      score: 0,
      matchedWords: [],
      matchRatio: 0,
      exactMatch: false
    };
  }

  const matchedWords = [];
  let totalScore = 0;

  // 각 단어에 대해 부분 매칭 체크
  for (const word1 of words1) {
    for (const word2 of words2) {
      // 숫자 제거 후 매칭 시도 (예: "비건식빵1" → "비건식빵")
      const cleanWord1 = word1.replace(/\d+$/, '');
      const cleanWord2 = word2.replace(/\d+$/, '');
      
      // 원본 단어 또는 숫자 제거 버전으로 매칭
      if (word1.includes(word2) || word2.includes(word1) || 
          (cleanWord1.length >= 2 && (cleanWord1.includes(word2) || word2.includes(cleanWord1))) ||
          (cleanWord2.length >= 2 && (cleanWord2.includes(word1) || word1.includes(cleanWord2))) ||
          (cleanWord1.length >= 2 && cleanWord2.length >= 2 && 
           (cleanWord1.includes(cleanWord2) || cleanWord2.includes(cleanWord1)))) {
        const matchLength = Math.min(word1.length, word2.length);
        const maxLength = Math.max(word1.length, word2.length);
        const wordScore = matchLength / maxLength;
        
        totalScore += wordScore;
        if (!matchedWords.includes(word2)) {
          matchedWords.push(word2);
        }
      }
    }
  }

  // 가중치 적용
  const lengthRatio = Math.min(text1.length, text2.length) / Math.max(text1.length, text2.length);
  const matchRatio = matchedWords.length / Math.max(words1.length, words2.length);
  
  // 최종 점수 계산
  const finalScore = (totalScore * 0.5 + matchRatio * 0.3 + lengthRatio * 0.2) / Math.max(words1.length, words2.length);

  return {
    score: Math.min(finalScore, 1.0),
    matchedWords,
    matchRatio,
    exactMatch: false
  };
}