import {
  normalizeAndTokenize,
  extractMeaningfulSegments,
} from "../utils/textUtils.js";

/**
 * 함수명: calculateMatchAccuracy
 * 목적: 매칭 정확도를 계산하는 함수
 * 사용처: findBestProductMatch
 * 의존성: normalizeAndTokenize
 * 파라미터:
 *   - commentText: 댓글 텍스트
 *   - productTitle: 상품명
 *   - matchedWords: 매칭된 단어들
 * 리턴값: 매칭 정확도 (0-1)
 */
export function calculateMatchAccuracy(
  commentText,
  productTitle,
  matchedWords
) {
  if (!matchedWords || matchedWords.length === 0) return 0;
  // 1. 매칭된 단어들의 총 길이
  const matchedLength = matchedWords.reduce(
    (sum, word) => sum + word.length,
    0
  );
  // 2. 댓글에서 상품 관련 단어들만 추출 (숫자, 전화번호, 지역명 제외)
  const commentTokens = normalizeAndTokenize(commentText);
  const productTokens = commentTokens.filter(
    (token) =>
      !/^\d+$/.test(token) && // 숫자만 있는 토큰 제외
      !token.includes("점") && // 지역명 제외
      token.length >= 2 // 2글자 이상만
  );
  const productRelatedLength = productTokens.reduce(
    (sum, token) => sum + token.length,
    0
  );
  // 3. 상품명 길이
  const productLength = productTitle.replace(/\s+/g, "").length;
  // 4. 정확도 계산
  const commentCoverage =
    productRelatedLength > 0 ? matchedLength / productRelatedLength : 0;
  const productCoverage = productLength > 0 ? matchedLength / productLength : 0;
  // 가중 평균 (댓글 커버리지 60%, 상품 커버리지 40%)
  return commentCoverage * 0.6 + productCoverage * 0.4;
}

/**
 * 함수명: calculateTextSimilarity
 * 목적: 두 텍스트 간의 유사도를 계산하는 함수
 * 사용처: findBestProductMatch, extractOrderBySimilarityMatching
 * 의존성: normalizeAndTokenize, checkComplexWordMatch
 * 파라미터:
 *   - text1: 비교할 첫 번째 텍스트 (댓글)
 *   - text2: 비교할 두 번째 텍스트 (상품명)
 * 리턴값: 유사도 정보 객체
 */
export function calculateTextSimilarity(text1, text2) {
  const tokens1 = normalizeAndTokenize(text1);
  const tokens2 = normalizeAndTokenize(text2);
  if (tokens1.length === 0 || tokens2.length === 0) {
    return {
      matchedWords: [],
      matchCount: 0,
      similarity: 0,
      coverage: 0,
    };
  }
  // 매칭된 단어들 찾기 (정확 매칭 + 부분 매칭)
  const matchedWords = [];
  const usedIndices = new Set();
  // 1차: 정확한 매칭
  tokens1.forEach((token1) => {
    tokens2.forEach((token2, index) => {
      if (!usedIndices.has(index) && token1 === token2) {
        matchedWords.push(token1);
        usedIndices.add(index);
      }
    });
  });
  // 🔥 옵션 키워드 특별 처리 (NEW!)
  const optionKeywords = [
    "1통",
    "반통",
    "한통",
    "2통",
    "1박스",
    "2박스",
    "한박스",
    "1세트",
    "2세트",
    "한세트",
    "1팩",
    "2팩",
    "한팩",
    "반팩",
  ];
  const text1Lower = text1.toLowerCase();
  const text2Lower = text2.toLowerCase();
  // 옵션 키워드 직접 매칭
  optionKeywords.forEach((keyword) => {
    if (text1Lower.includes(keyword) && text2Lower.includes(keyword)) {
      matchedWords.push(keyword);
    }
  });
  // 2차: 복잡한 단어 매칭 (부분 매칭)
  const complexMatches = [];
  let totalComplexSyllables = 0;
  const remainingTokens1 = tokens1.filter((t) => !matchedWords.includes(t));
  const remainingTokens2 = tokens2.filter((_, idx) => !usedIndices.has(idx));
  remainingTokens1.forEach((token1) => {
    remainingTokens2.forEach((token2) => {
      const match = checkComplexWordMatch(token1, token2);
      if (match.isMatch) {
        if (!matchedWords.includes(token1)) {
          matchedWords.push(token1);
          complexMatches.push({
            token: token1,
            matchType: match.matchType,
            syllables: match.matchedSyllables || 0,
          });
          totalComplexSyllables += match.matchedSyllables || 0;
        }
      }
    });
  });
  // 댓글과 상품명 간 복합어 매칭 추가 - 특히 두 토큰의 결합이 상품명에 포함되는 경우
  // 예: "비건" + "식빵" → "비건식빵"
  for (let i = 0; i < tokens1.length - 1; i++) {
    const combined = tokens1[i] + tokens1[i + 1];
    if (combined.length >= 3 && text2.includes(combined)) {
      if (!matchedWords.includes(combined)) {
        matchedWords.push(combined);
        complexMatches.push({
          token: combined,
          matchType: "compound",
          syllables: combined.length,
        });
        totalComplexSyllables += combined.length;
      }
    }
  }
  // 매칭 결과 계산
  const matchCount = matchedWords.length;
  const totalTokens1 = tokens1.length;
  const totalTokens2 = tokens2.length;
  // 유사도: 매칭된 단어 수 / 전체 단어 수
  const similarity = matchCount / Math.max(totalTokens1, totalTokens2);
  // 커버리지: 매칭된 단어가 댓글에서 차지하는 비율
  const coverage = totalTokens1 > 0 ? matchCount / totalTokens1 : 0;
  return {
    matchedWords,
    matchCount,
    similarity,
    coverage,
    commentTokens: tokens1,
    productTokens: tokens2,
    complexMatches: complexMatches.length > 0 ? complexMatches : undefined,
    complexSyllables:
      totalComplexSyllables > 0 ? totalComplexSyllables : undefined,
  };
}

/**
 * 함수명: checkComplexWordMatch
 * 목적: 복잡한 단어 매칭을 확인하는 함수
 * 사용처: calculateTextSimilarity
 * 의존성: extractMeaningfulSegments
 * 파라미터:
 *   - word1: 첫 번째 단어
 *   - word2: 두 번째 단어
 * 리턴값: 매칭 결과 객체
 */
export function checkComplexWordMatch(word1, word2) {
  if (!word1 || !word2 || word1.length < 2 || word2.length < 2) {
    return {
      isMatch: false,
      matchType: "none",
      matchedSyllables: 0,
    };
  }
  // 1. 연속 부분 문자열 매칭 (기존 로직)
  if (word1.includes(word2) || word2.includes(word1)) {
    return {
      isMatch: true,
      matchType: "substring",
      matchedSyllables: Math.min(word1.length, word2.length),
    };
  }
  // 2. 음절 기반 복합어 매칭 (NEW! - 정확도 우선)
  const segments1 = extractMeaningfulSegments(word1);
  const segments2 = extractMeaningfulSegments(word2);
  let matchedSyllables = 0;
  let exactMatches = 0;
  const matchedSegments = [];
  segments1.forEach((segment) => {
    const foundMatch = segments2.find((s) => {
      if (s === segment) {
        exactMatches++; // 정확 매칭 카운트
        return true;
      }
      return s.includes(segment) || segment.includes(s);
    });
    if (foundMatch) {
      matchedSyllables += segment.length; // 음절 길이 누적
      matchedSegments.push(segment);
    }
  });
  // 정확도 보너스: 정확 매칭된 세그먼트 개수 × 2
  const accuracyBonus = exactMatches * 2;
  const finalScore = matchedSyllables + accuracyBonus;
  // 최소 2음절 이상 매칭되면 성공
  if (matchedSyllables >= 2) {
    return {
      isMatch: true,
      matchType: `syllable(${matchedSyllables}글자+${accuracyBonus}정확도)`,
      matchedSyllables: finalScore,
      matchedSegments: matchedSegments,
      exactMatches: exactMatches,
    };
  }
  return {
    isMatch: false,
    matchType: "none",
    matchedSyllables: 0,
  };
}

/**
 * 함수명: checkKeywordBasedMatch
 * 목적: 키워드 기반 매칭을 확인하는 함수
 * 사용처: 상품명 매칭 로직
 * 의존성: 없음
 * 파라미터:
 *   - word1: 첫 번째 단어
 *   - word2: 두 번째 단어
 * 리턴값: 매칭 결과
 */
export function checkKeywordBasedMatch(word1, word2) {
  // 특별한 매칭 규칙들
  const specialMatches = [
    // 식빵 관련
    {
      pattern: /식빵/,
      target: /.*식빵.*/,
      type: "bread",
    },
    {
      pattern: /빵/,
      target: /.*빵.*/,
      type: "bread",
    },
    // 김치 관련
    {
      pattern: /김치/,
      target: /.*김치.*/,
      type: "kimchi",
    },
    {
      pattern: /파김치/,
      target: /.*파.*김치.*/,
      type: "kimchi",
    },
    // 비건 관련
    {
      pattern: /비건/,
      target: /.*비건.*/,
      type: "vegan",
    },
    // 당근 관련
    {
      pattern: /당근/,
      target: /.*당근.*/,
      type: "carrot",
    },
    // 주스 관련
    {
      pattern: /주스/,
      target: /.*주스.*/,
      type: "juice",
    },
  ];
  for (const rule of specialMatches) {
    if (rule.pattern.test(word1) && rule.target.test(word2)) {
      return {
        isMatch: true,
        matchType: `keyword-${rule.type}`,
      };
    }
    if (rule.pattern.test(word2) && rule.target.test(word1)) {
      return {
        isMatch: true,
        matchType: `keyword-${rule.type}`,
      };
    }
  }
  return {
    isMatch: false,
    matchType: "none",
  };
}

/**
 * 함수명: findBestProductMatch
 * 목적: 댓글과 상품들 간의 유사도를 계산하여 가장 적합한 상품을 찾는 함수
 * 사용처: extractOrderBySimilarityMatching
 * 의존성: calculateTextSimilarity, calculateMatchAccuracy
 * 파라미터:
 *   - commentText: 댓글 텍스트
 *   - productMap: 상품 정보 맵 (itemNumber -> product)
 * 리턴값: 매칭 결과 또는 null
 */
export function findBestProductMatch(commentText, productMap) {
  if (!commentText || !productMap || productMap.size === 0) {
    return null;
  }
  // console.log(`[유사도 매칭] 댓글 분석: "${commentText}"`);
  // console.log(`[유사도 매칭] 상품 맵 크기: ${productMap.size}개`);
  const candidates = [];
  // 모든 상품에 대해 유사도 계산
  productMap.forEach((product, itemNumber) => {
    const productTitle = product.title || "";
    // 첫 번째 상품만 로그 출력 (디버깅용)
    if (itemNumber === 1) {
      // console.log(`[유사도 매칭] 첫 번째 상품 - 원본: "${productTitle}"`);
    }
    // 상품명에서 날짜 부분 제거 (예: [7월5일] 제거)
    const cleanTitle = productTitle.replace(/\[[^\]]*\]/g, "").trim();
    const similarity = calculateTextSimilarity(commentText, cleanTitle);
    // 첫 번째 상품의 유사도 계산 결과 로그
    if (itemNumber === 1) {
      // console.log(`[유사도 매칭] 첫 번째 상품 정제: "${cleanTitle}"`);
      // console.log(
      //   `[유사도 매칭] 댓글 토큰: [${similarity.commentTokens?.join(", ")}]`
      // );
      // console.log(
      //   `[유사도 매칭] 상품 토큰: [${similarity.productTokens?.join(", ")}]`
      // );
      // console.log(
      //   `[유사도 매칭] 첫 번째 상품 유사도 - 매칭: ${
      //     similarity.matchCount
      //   }개, 점수: ${(
      //     similarity.similarity * 0.6 +
      //     similarity.coverage * 0.4
      //   ).toFixed(3)}`
      // );
      if (similarity.matchedWords?.length > 0) {
        // console.log(
        //   `[유사도 매칭] 매칭된 단어: [${similarity.matchedWords.join(", ")}]`
        // );
      }
    }
    if (similarity.matchCount > 0) {
      candidates.push({
        itemNumber,
        product,
        productTitle: cleanTitle,
        similarity,
        score: similarity.similarity * 0.6 + similarity.coverage * 0.4,
        matchAccuracy: calculateMatchAccuracy(
          commentText,
          cleanTitle,
          similarity.matchedWords
        ),
      });
      const matchAccuracy = calculateMatchAccuracy(
        commentText,
        cleanTitle,
        similarity.matchedWords
      );
    } else {
      // 매칭되지 않은 상품도 로그 출력 (디버깅용)
      // console.log(
      //   `[유사도 매칭] 상품 ${itemNumber}번 "${cleanTitle}": 매칭 실패 (토큰: [${similarity.productTokens?.join(
      //     ", "
      //   )}])`
      // );
    }
  });
  if (candidates.length === 0) {
    // console.log(`[유사도 매칭] "${commentText}" → 매칭되는 상품 없음`);
    return null;
  }
  // 점수 기준으로 정렬 (완전 매칭 최우선)
  candidates.sort((a, b) => {
    // 1차: 완전 매칭 여부 확인 (최우선 - 댓글 단어가 상품명에 완전히 포함되는 경우)
    const aHasExactMatch = a.similarity.commentTokens.some((token) => {
      const cleanToken = token.replace(/\d+/g, ""); // 숫자 제거
      return cleanToken.length >= 2 && a.productTitle.includes(cleanToken);
    });
    const bHasExactMatch = b.similarity.commentTokens.some((token) => {
      const cleanToken = token.replace(/\d+/g, ""); // 숫자 제거
      return cleanToken.length >= 2 && b.productTitle.includes(cleanToken);
    });
    // 1-0차: 부분 단어 매칭 확인 ("비건식빵" → "비건" + "식빵"으로 분리)
    const aPartialMatches = a.similarity.commentTokens
      .map((token) => {
        const cleanToken = token.replace(/\d+/g, "");
        if (cleanToken.length >= 4) {
          // 긴 단어를 2글자씩 분리해서 매칭 확인
          const parts = [];
          for (let i = 0; i <= cleanToken.length - 2; i += 2) {
            const part = cleanToken.substring(i, i + 2);
            if (a.productTitle.includes(part)) {
              parts.push(part);
            }
          }
          return parts;
        }
        return [];
      })
      .flat()
      .filter((part) => part.length >= 2);
    const bPartialMatches = b.similarity.commentTokens
      .map((token) => {
        const cleanToken = token.replace(/\d+/g, "");
        if (cleanToken.length >= 4) {
          const parts = [];
          for (let i = 0; i <= cleanToken.length - 2; i += 2) {
            const part = cleanToken.substring(i, i + 2);
            if (b.productTitle.includes(part)) {
              parts.push(part);
            }
          }
          return parts;
        }
        return [];
      })
      .flat()
      .filter((part) => part.length >= 2);
    const aPartialScore = aPartialMatches.length;
    const bPartialScore = bPartialMatches.length;
    if (aHasExactMatch !== bHasExactMatch) {
      return bHasExactMatch ? 1 : -1;
    }
    // 1-0.5차: 완전 매칭이 없을 때 부분 매칭 점수 비교
    if (!aHasExactMatch && !bHasExactMatch && aPartialScore !== bPartialScore) {
      return bPartialScore - aPartialScore;
    }
    // 1-1차: 완전 매칭이 같을 때, 상품명에서 매칭 단어가 차지하는 비율 비교
    if (aHasExactMatch && bHasExactMatch) {
      const aMatchRatio =
        a.similarity.commentTokens
          .filter((token) => {
            const cleanToken = token.replace(/\d+/g, "");
            return (
              cleanToken.length >= 2 && a.productTitle.includes(cleanToken)
            );
          })
          .reduce((acc, token) => acc + token.replace(/\d+/g, "").length, 0) /
        a.productTitle.length;
      const bMatchRatio =
        b.similarity.commentTokens
          .filter((token) => {
            const cleanToken = token.replace(/\d+/g, "");
            return (
              cleanToken.length >= 2 && b.productTitle.includes(cleanToken)
            );
          })
          .reduce((acc, token) => acc + token.replace(/\d+/g, "").length, 0) /
        b.productTitle.length;
      if (Math.abs(aMatchRatio - bMatchRatio) > 0.01) {
        return bMatchRatio - aMatchRatio;
      }
    }
    // 2차: 매칭 정확도 비교 (실제 매칭 품질)
    if (Math.abs(a.matchAccuracy - b.matchAccuracy) > 0.01) {
      return b.matchAccuracy - a.matchAccuracy;
    }
    // 3차: 점수 비교 (유사도 + 커버리지)
    if (Math.abs(a.score - b.score) > 0.01) {
      return b.score - a.score;
    }
    // 4차: 매칭 단어 수 비교
    if (a.similarity.matchCount !== b.similarity.matchCount) {
      return b.similarity.matchCount - a.similarity.matchCount;
    }
    // 5차: 복합어 매칭 음절 수 비교 (완전 매칭 이후 고려)
    const aComplexSyllables = a.similarity.complexSyllables || 0;
    const bComplexSyllables = b.similarity.complexSyllables || 0;
    if (aComplexSyllables !== bComplexSyllables) {
      return bComplexSyllables - aComplexSyllables;
    }
    // 6차: 커버리지 비교
    if (Math.abs(a.similarity.coverage - b.similarity.coverage) > 0.01) {
      return b.similarity.coverage - a.similarity.coverage;
    }
    // 7차: 더 정확한 매칭 우선 (매칭된 단어 길이 비교)
    const aMatchLength = a.similarity.matchedWords.reduce(
      (sum, word) => sum + word.length,
      0
    );
    const bMatchLength = b.similarity.matchedWords.reduce(
      (sum, word) => sum + word.length,
      0
    );
    if (aMatchLength !== bMatchLength) {
      return bMatchLength - aMatchLength;
    }
    // 8차: 상품명 길이 비교 (더 구체적인 상품명 우선)
    const aProductLength = a.productTitle.length;
    const bProductLength = b.productTitle.length;
    if (aProductLength !== bProductLength) {
      return bProductLength - aProductLength;
    }
    // 9차: 상품 번호 낮은 순 (첫 번째 상품 우선)
    return a.itemNumber - b.itemNumber;
  });
  const bestMatch = candidates[0];
  // console.log(
  //   `[유사도 매칭] 최종 선택: 상품 ${bestMatch.itemNumber}번 "${
  //     bestMatch.productTitle
  //   }" (점수: ${bestMatch.score.toFixed(3)}, 복합어음절: ${
  //     bestMatch.similarity.complexSyllables || 0
  //   }개)`
  // );
  // console.log(
  //   `[유사도 매칭] 매칭된 단어: [${bestMatch.similarity.matchedWords.join(
  //     ", "
  //   )}]`
  // );
  if (
    bestMatch.similarity.complexMatches &&
    bestMatch.similarity.complexMatches.length > 0
  ) {
    // console.log(
    //   `[유사도 매칭] 복합어 매칭: ${bestMatch.similarity.complexMatches
    //     .map((match) => `"${match.token}"(${match.syllables}글자)`)
    //     .join(", ")}`
    // );
  }
  return {
    itemNumber: bestMatch.itemNumber,
    product: bestMatch.product,
    productTitle: bestMatch.productTitle,
    similarity: bestMatch.similarity,
    score: bestMatch.score,
    quantity: 1,
  };
}