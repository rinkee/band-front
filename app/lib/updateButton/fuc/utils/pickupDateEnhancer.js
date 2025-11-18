/**
 * Pickup Date 후처리 유틸리티
 * backend/supabase/functions/band-get-posts-a/index.ts에서 이식
 */

import { convertUTCtoKST, kstDateToUtcISOString, updateTitleWithDate } from './dateUtils';

/**
 * 함수명: enhancePickupDateFromContent
 * 목적: 게시물 내용에서 픽업 날짜 추출 및 향상
 * 사용처: AI 분석 결과를 게시물 내용 기반으로 보정
 * 의존성: convertUTCtoKST, kstDateToUtcISOString, updateTitleWithDate
 * 파라미터:
 *   - aiAnalysisResult: AI 분석 결과 객체
 *   - postContent: 게시물 내용
 *   - post: 게시물 객체 (createdAt 필수)
 * 리턴값: 향상된 AI 분석 결과 (pickupDate, pickupDateReason, title 업데이트)
 */
export function enhancePickupDateFromContent(aiAnalysisResult, postContent, post) {
  // AI 결과가 없어도 기본 구조 생성하여 후처리 진행
  if (!postContent || !post) {
    console.warn('[PICKUP_DATE 후처리] 필수 데이터 없음, 원본 반환');
    return aiAnalysisResult;
  }

  // AI 결과가 없으면 기본 구조 생성
  let workingResult = aiAnalysisResult || {
    products: [
      {
        title: "상품",
        basePrice: 0
      }
    ]
  };

  if (!workingResult.products || workingResult.products.length === 0) {
    workingResult.products = [
      {
        title: "상품",
        basePrice: 0
      }
    ];
  }

  // post.createdAt을 기준 날짜로 사용 (UTC를 KST로 변환)
  const baseDate = convertUTCtoKST(post.createdAt);

  // 🔍 시간 패턴 추출 - 2단계 접근
  let extractedHour = null;
  let extractedMinute = 0;

  // 1차: 정확한 패턴으로 시도 (띄어쓰기 유무 관계없이)
  const strictTimePatterns = [
    /(\d{1,2})시도착/,
    /(\d{1,2})시수령/,
    /(\d{1,2})시\s+도착/,
    /(\d{1,2})시\s+수령/,
    /도착\s*(\d{1,2})시/,
    /수령\s*(\d{1,2})시/,
    /픽업\s*(\d{1,2})시/,
    /오후\s*(\d{1,2})시(?:\s*(\d{1,2})분)?/,
    /오전\s*(\d{1,2})시(?:\s*(\d{1,2})분)?/,
    /오후\s*(\d{1,2})\s*:\s*(\d{2})/,
    /오전\s*(\d{1,2})\s*:\s*(\d{2})/
  ];

  for (const pattern of strictTimePatterns) {
    const match = pattern.exec(postContent);
    if (match) {
      extractedHour = parseInt(match[1]);
      if (match[2] !== undefined) {
        const maybeMinute = parseInt(match[2]);
        if (!Number.isNaN(maybeMinute)) extractedMinute = maybeMinute;
      }

      // 오전/오후 체크
      const matchedText = match[0];
      if (matchedText.includes('오후')) {
        // 오후 12시는 그대로, 1-11시는 +12
        if (extractedHour !== 12) {
          extractedHour += 12;
        }
      } else if (matchedText.includes('오전')) {
        // 오전 12시는 0시로
        if (extractedHour === 12) {
          extractedHour = 0;
        }
      }
      break;
    }
  }

  // 2차: 못 찾았으면 느슨한 패턴으로 재시도 (단순히 "N시" 찾기, 붙어있는 것도 포함)
  if (extractedHour === null) {
    // 먼저 모든 "N시" 패턴 찾기
    const looseTimePattern = /(\d{1,2})시/g;
    const looseColonPattern = /(\d{1,2})\s*:\s*(\d{2})/g;
    let match;

    while ((match = looseTimePattern.exec(postContent)) !== null) {
      const hour = parseInt(match[1]);
      // 24보다 큰 숫자는 시간이 아님 (예: "30시간")
      if (hour > 24) continue;

      // 오전/오후 컨텍스트 확인 (앞뒤 10자 이내)
      const startIdx = Math.max(0, match.index - 10);
      const endIdx = Math.min(postContent.length, match.index + match[0].length + 10);
      const context = postContent.substring(startIdx, endIdx);

      extractedHour = hour;
      extractedMinute = 0;

      // 오전/오후 처리
      if (context.includes('오후')) {
        if (extractedHour !== 12) {
          extractedHour += 12;
        }
      } else if (context.includes('오전')) {
        if (extractedHour === 12) {
          extractedHour = 0;
        }
      }
      break;
    }

    if (extractedHour === null) {
      let m;
      while ((m = looseColonPattern.exec(postContent)) !== null) {
        const hour = parseInt(m[1]);
        const minute = parseInt(m[2]);
        if (hour > 24 || minute > 59) continue;

        const startIdx = Math.max(0, m.index - 10);
        const endIdx = Math.min(postContent.length, m.index + m[0].length + 10);
        const context = postContent.substring(startIdx, endIdx);

        extractedHour = hour;
        extractedMinute = minute;

        if (context.includes('오후') && extractedHour < 12) {
          extractedHour += 12;
        } else if (context.includes('오전') && extractedHour === 12) {
          extractedHour = 0;
        }
        break;
      }
    }
  }

  // 🔍 특수 패턴: "상품수령기간 : 9.12~13" 형식 (특정 밴드용)
  const receiptPeriodPattern = /상품수령기간\s*:\s*(\d{1,2})\.(\d{1,2})~(\d{1,2})/;
  const receiptMatch = receiptPeriodPattern.exec(postContent);
  let extractedMonth = null;
  let extractedDate = null;
  let monthDaySource = null;

  if (receiptMatch) {
    extractedMonth = parseInt(receiptMatch[1]);
    extractedDate = parseInt(receiptMatch[2]);
    monthDaySource = 'receiptPeriod';
    console.log('[PICKUP_DATE 후처리] 상품수령기간 특수 패턴 감지', {
      month: extractedMonth,
      date: extractedDate,
      matched: receiptMatch[0]
    });
  } else {
    const explicitDateRegex = /(\d{1,2})월\s*(\d{1,2})일/g;
    let match;
    let bestCandidate = null;
    const baseYear = baseDate.getFullYear();

    while ((match = explicitDateRegex.exec(postContent)) !== null) {
      const month = parseInt(match[1], 10);
      const day = parseInt(match[2], 10);

      if (Number.isNaN(month) || Number.isNaN(day)) continue;

      let candidate = new Date(baseYear, month - 1, day);
      if (candidate < baseDate) {
        candidate.setFullYear(baseYear + 1);
      }

      const diffMs = candidate.getTime() - baseDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (!bestCandidate || diffDays < bestCandidate.diffDays) {
        bestCandidate = {
          month,
          day,
          diffDays,
          matchText: match[0]
        };
      }
    }

    if (bestCandidate) {
      extractedMonth = bestCandidate.month;
      extractedDate = bestCandidate.day;
      monthDaySource = 'explicit';
      console.log('[PICKUP_DATE 후처리] 게시물 내 명시 날짜 감지', {
        month: extractedMonth,
        date: extractedDate,
        matched: bestCandidate.matchText,
        diffDays: bestCandidate.diffDays
      });
    }
  }

  // 🔍 "다음주" 키워드 확인
  const hasNextWeekKeyword = /다음\s*주|다음주/.test(postContent);

  // 🔍 요일 패턴 추출 - 2단계 접근
  let extractedDay = null;
  const dayMap = {
    '월요일': 1,
    '화요일': 2,
    '수요일': 3,
    '목요일': 4,
    '금요일': 5,
    '토요일': 6,
    '일요일': 0
  };

  // 🔧 복합 패턴 우선 확인: "내일(요일)", "모레(요일)" 형식
  // 이 패턴에서는 괄호 안의 요일을 우선 사용
  const compositeDayPattern = /(내일|모레|오늘)\s*[\(\[]\s*(월요일|화요일|수요일|목요일|금요일|토요일|일요일)\s*[\)\]]/;
  const compositeMatch = compositeDayPattern.exec(postContent);

  if (compositeMatch) {
    const relativeDay = compositeMatch[1]; // "내일", "모레", "오늘"
    const absoluteDay = compositeMatch[2]; // "수요일" 등
    extractedDay = dayMap[absoluteDay];
    console.log('[PICKUP_DATE 후처리] 복합 패턴 감지', {
      relative: relativeDay,
      absolute: absoluteDay,
      extractedDay
    });
  } else {
    // 1차: 정확한 패턴으로 시도
    const strictDayPatterns = [
      /(내일|모레|오늘)/,
      /(월요일|화요일|수요일|목요일|금요일|토요일|일요일)/ // 일반 요일
    ];

    let dayMatch = null;
    for (const pattern of strictDayPatterns) {
      const match = pattern.exec(postContent);
      if (match) {
        const dayText = match[1];
        if (dayText === '오늘') {
          extractedDay = baseDate.getDay();
          console.log('[PICKUP_DATE 후처리] 1차 요일 패턴 감지', {
            matched: '오늘',
            extractedDay
          });
        } else if (dayText === '내일') {
          extractedDay = (baseDate.getDay() + 1) % 7;
          console.log('[PICKUP_DATE 후처리] 1차 요일 패턴 감지', {
            matched: '내일',
            extractedDay
          });
        } else if (dayText === '모레') {
          extractedDay = (baseDate.getDay() + 2) % 7;
          console.log('[PICKUP_DATE 후처리] 1차 요일 패턴 감지', {
            matched: '모레',
            extractedDay
          });
        } else if (dayMap[dayText] !== undefined) {
          extractedDay = dayMap[dayText];
          console.log('[PICKUP_DATE 후처리] 1차 요일 패턴 감지', {
            matched: dayText,
            extractedDay
          });
        }
        if (extractedDay !== null) break;
      }
    }
  }

  // 2차: 못 찾았으면 느슨한 패턴으로 재시도 (단순히 "O요일" 찾기)
  if (extractedDay === null) {
    // 요일만 단독으로 찾기 (앞뒤 문자 상관없이)
    const loosePattern = /[월화수목금토일]요일/;
    const match = loosePattern.exec(postContent);
    if (match) {
      const dayText = match[0];
      if (dayMap[dayText] !== undefined) {
        extractedDay = dayMap[dayText];
      }
    }
  }

  // 🔧 패턴 없어도 무조건 후처리 수행 (기본값 적용)
  // 복사본 생성하여 수정
  const enhancedResult = JSON.parse(JSON.stringify(workingResult));

  if (enhancedResult.products && Array.isArray(enhancedResult.products)) {
    enhancedResult.products = enhancedResult.products.map((product, index) => {
      if (!product) return product;

      // 무조건 content에서 후처리 수행 (AI 추출 결과 덮어쓰기)
      let newPickupDate = new Date(baseDate);
      let pickupReason = [];

      // 1. 특수 패턴 우선 처리 (상품수령기간)
      if (extractedMonth !== null && extractedDate !== null) {
        // 현재 연도 사용
        const currentYear = baseDate.getFullYear();
        newPickupDate = new Date(currentYear, extractedMonth - 1, extractedDate); // month는 0-based

        // 게시일보다 과거면 다음 해로 설정
        const dayNames = [
          '일요일',
          '월요일',
          '화요일',
          '수요일',
          '목요일',
          '금요일',
          '토요일'
        ];
        const baseDateStr = `${baseDate.getMonth() + 1}월 ${baseDate.getDate()}일 ${dayNames[baseDate.getDay()]} ${baseDate.getHours()}:${String(baseDate.getMinutes()).padStart(2, '0')}`;
        const baseMonth = baseDate.getMonth() + 1;
        const baseDay = baseDate.getDate();
        const isSameCalendarDay = extractedMonth === baseMonth && extractedDate === baseDay;

        if (newPickupDate < baseDate && !isSameCalendarDay) {
          newPickupDate.setFullYear(currentYear + 1);
          if (monthDaySource === 'receiptPeriod') {
            pickupReason.push(`상품수령기간 ${extractedMonth}.${extractedDate} (기준: ${baseDateStr}, 다음해)`);
          } else {
            pickupReason.push(`게시물 명시 날짜 ${extractedMonth}월 ${extractedDate}일 (기준: ${baseDateStr}, 다음해)`);
          }
        } else {
          if (monthDaySource === 'receiptPeriod') {
            pickupReason.push(`상품수령기간 ${extractedMonth}.${extractedDate} (기준: ${baseDateStr})`);
          } else {
            pickupReason.push(`게시물 명시 날짜 ${extractedMonth}월 ${extractedDate}일 (기준: ${baseDateStr})`);
          }
        }
      } else if (extractedDay !== null) {
        const currentDay = baseDate.getDay();
        let daysToAdd = extractedDay - currentDay;

        // 같은 요일인 경우
        if (daysToAdd === 0) {
          // "다음주" 키워드가 있으면 +7일, 없으면 당일
          if (hasNextWeekKeyword) {
            daysToAdd = 7;
            pickupReason.push('다음주 키워드 감지');
          } else {
            // 당일 처리
            pickupReason.push('같은 요일 - 당일 처리');
          }
        } else if (daysToAdd < 0) {
          // 지난 요일이면 다음 주로
          daysToAdd += 7;
        }

        newPickupDate.setDate(baseDate.getDate() + daysToAdd);

        const dayNames = [
          '일요일',
          '월요일',
          '화요일',
          '수요일',
          '목요일',
          '금요일',
          '토요일'
        ];
        const baseDateStr = `${baseDate.getMonth() + 1}월 ${baseDate.getDate()}일 ${dayNames[baseDate.getDay()]} ${baseDate.getHours()}:${String(baseDate.getMinutes()).padStart(2, '0')}`;
        pickupReason.push(`${dayNames[extractedDay]} 감지 (기준: ${baseDateStr}, +${daysToAdd}일)`);
      } else {
        // 요일 정보가 없으면 게시일 당일 사용
        const dayNames = [
          '일요일',
          '월요일',
          '화요일',
          '수요일',
          '목요일',
          '금요일',
          '토요일'
        ];
        const baseDateStr = `${baseDate.getMonth() + 1}월 ${baseDate.getDate()}일 ${dayNames[baseDate.getDay()]} ${baseDate.getHours()}:${String(baseDate.getMinutes()).padStart(2, '0')}`;
        pickupReason.push(`게시일 당일 사용 (기준: ${baseDateStr})`);
      }

      // 시간 조정 (영업시간 고려: 오전 8시 ~ 오후 8시)
      // 특수 패턴(상품수령기간)인 경우에만 무조건 9시 고정
      if (monthDaySource === 'receiptPeriod') {
        newPickupDate.setHours(9, 0, 0, 0);
        pickupReason.push('수령시간 9시 고정');
      } else if (extractedHour !== null) {
        // 🔧 시간 조정 로직 개선: 오전/오후 명시 여부 확인
        let finalHour = extractedHour;

        // 오전/오후가 명시되어 있는지 확인 (게시물 전체 컨텍스트)
        const hasAmPm = /오전|오후/.test(postContent);

        // extractedHour가 이미 12 이상이면 오전/오후 처리가 완료된 것
        if (extractedHour >= 12) {
          pickupReason.push(`${extractedHour}시 감지 (24시간 형식)`);
        } else if (hasAmPm) {
          // 오전/오후가 명시되어 있으면 이미 처리되었으므로 그대로 사용
          pickupReason.push(`${extractedHour}시 감지 (오전/오후 명시)`);
        } else if (extractedHour < 8) {
          // 오전/오후 명시가 없고 8시 미만이면 영업시간 기준으로 오후로 추론
          finalHour = extractedHour + 12;
          pickupReason.push(`${extractedHour}시 → 오후 ${extractedHour}시(${finalHour}시)로 추론 (영업시간 기준)`);
        } else {
          pickupReason.push(`${extractedHour}시 감지`);
        }
        newPickupDate.setHours(finalHour, extractedMinute || 0, 0, 0);
      } else {
        // 시간 정보가 없으면 아침 9시로 설정
        newPickupDate.setHours(9, 0, 0, 0);
        pickupReason.push('기본 9시 설정');
      }

      const finalReason = pickupReason.join(', ') + ' (content 후처리)';

      // pickup_date와 title 모두 업데이트
      return {
        ...product,
        // 저장 시에는 UTC 기준으로 보정하여 9시간이 더해지는 문제를 방지
        pickupDate: kstDateToUtcISOString(newPickupDate),
        pickupDateReason: finalReason,
        title: updateTitleWithDate(product.title, kstDateToUtcISOString(newPickupDate))
      };
    });
  }

  return enhancedResult;
}
