/**
 * 함수명: convertUTCtoKST
 * 목적: UTC 타임스탬프를 한국 표준시(KST)로 변환
 * 사용처: Band API 응답의 타임스탬프 변환
 * 의존성: 없음
 * 파라미터: utcTimestamp - UTC 타임스탬프 (숫자 또는 Date 객체)
 * 리턴값: KST로 변환된 Date 객체
 */
export function convertUTCtoKST(utcTimestamp) {
  let utcDate;
  if (utcTimestamp instanceof Date) {
    utcDate = utcTimestamp;
  } else if (typeof utcTimestamp === "number") {
    utcDate = new Date(utcTimestamp);
  } else if (typeof utcTimestamp === "string") {
    // 문자열인 경우 숫자로 변환 시도
    const numericTimestamp = parseInt(utcTimestamp);
    if (!isNaN(numericTimestamp)) {
      utcDate = new Date(numericTimestamp);
    } else {
      // ISO 문자열 등 다른 형식 시도
      utcDate = new Date(utcTimestamp);
    }
  } else {
    // 잘못된 입력의 경우 현재 시간 사용
    console.warn(
      `[convertUTCtoKST] Invalid timestamp type: ${typeof utcTimestamp}`
    );
    utcDate = new Date();
  }
  // UTC에서 KST로 변환 (9시간 추가)
  const kstDate = new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
  return kstDate;
}

/**
 * 함수명: safeParseDate
 * 목적: 다양한 형식의 날짜 문자열을 안전하게 Date 객체로 변환
 * 사용처: extractPickupDate, AI 응답 날짜 파싱 등
 * 의존성: 없음
 * 파라미터: dateString - 파싱할 날짜 문자열 또는 Date 객체
 * 리턴값: Date 객체 (파싱 실패 시 현재 날짜)
 */
export function safeParseDate(dateString) {
  try {
    if (dateString instanceof Date) return dateString;
    if (typeof dateString === "number") return new Date(dateString);
    if (typeof dateString === "string") {
      // 표준 ISO 날짜 형식 시도
      const d = new Date(dateString);
      if (!isNaN(d.getTime())) return d;
      // 한국어 날짜 형식 파싱 로직 (예: "2023년 12월 25일", "오늘", "내일")
      if (dateString.includes("오늘")) {
        return new Date();
      } else if (dateString.includes("내일")) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
      } else if (dateString.includes("어제")) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday;
      } else if (dateString.match(/\d+월\s*\d+일/)) {
        // "5월 10일" 형식 처리
        const matches = dateString.match(/(\d+)월\s*(\d+)일/);
        if (matches && matches.length >= 3) {
          const month = parseInt(matches[1]) - 1; // 0-based 월
          const day = parseInt(matches[2]);
          const today = new Date();
          const result = new Date(today.getFullYear(), month, day);
          // 날짜가 과거인 경우 다음 해로 설정
          if (
            result < today &&
            (today.getMonth() - month > 1 ||
              (today.getMonth() === 11 && month === 0))
          ) {
            result.setFullYear(today.getFullYear() + 1);
          }
          return result;
        }
      }
    }
  } catch (error) {
    console.error("Date parsing error:", error);
  }
  // 기본값: 현재 날짜
  return new Date();
}

/**
 * 함수명: extractPickupDate
 * 목적: 텍스트에서 픽업/배송 날짜 및 타입 정보 추출 (백엔드 고급 로직 이식)
 * 사용처: processProduct, AI 주문 처리
 * 의존성: safeParseDate
 * 파라미터:
 *   - text: 날짜 정보가 포함된 텍스트
 *   - postTime: 게시물 작성 시간 (기준 날짜)
 * 리턴값: {date: ISO 문자열, type: 픽업/배송/수령, original: 원본 텍스트}
 *
 * 백엔드 pickup-date.ts에서 이식된 고급 기능:
 * - 타이포 정규화 (오타 자동 수정)
 * - 만료기한/행사기간 라인 필터링
 * - 주문/오픈 시간 제외 로직
 * - 리치 오더 오픈 후보 처리
 * - DD일 패턴 지원 (월 없이 일만 있는 경우)
 */
export function extractPickupDate(text, postTime = null) {
  if (!text || typeof text !== 'string') {
    return {
      date: null,
      type: null,
      original: null,
    };
  }

  // 🔧 1단계: 타이포 정규화 (백엔드 로직 이식)
  // "11월ㅣ일" → "11월1일", "1ㅣ일" → "11일" 등
  const normalizedText = String(text)
    .replace(/(월)\s*[ㅣlI|]\s*(일)/g, '$11$2')  // 11월ㅣ일, 11월|일, 11월l일, 11월I일
    .replace(/(\d)\s*[ㅣlI|]\s*(일)/g, '$11$2')  // 1ㅣ일, 1|일, 1l일, 1I일
    .replace(/(\d)\s*[ㅣlI|]\s*(\d)/g, '$11$2'); // 1ㅣ2 → 112

  const originalText = normalizedText;

  // 🔧 2단계: 만료기한/행사기간 라인 필터링 (백엔드 로직 이식)
  const expirationLinePatterns = [
    /소비\s*기한/, /유통\s*기한/, /보관\s*기한/, /상미\s*기한/,
    /소비기간/, /유통기간/, /보관기간/, /상미기간/,
    /행사기간/, /판매기간/, /신청기간/, /예약기간/, /접수기간/
  ];

  const cleanedForDate = originalText
    .split(/\n+/)
    .filter((ln) => {
      const isExpiration = expirationLinePatterns.some((re) => re.test(ln));
      if (!isExpiration) return true;
      // 만료기한 라인이라도 픽업/배송 키워드가 함께 있으면 포함
      const hasPickupOrDelivery = /(픽업|수령|방문|찾아가기|받아가기|배송|배달|도착|보내드림|전달)/.test(ln);
      return hasPickupOrDelivery;
    })
    .join('\n');

  // 🔧 3단계: postTime 파싱 및 기준 날짜 설정
  let baseDate = new Date();
  if (postTime) {
    if ((typeof postTime === 'string' && /^\d+$/.test(postTime)) || typeof postTime === 'number') {
      const ts = typeof postTime === 'string' ? parseInt(postTime, 10) : postTime;
      const utcDate = new Date(ts);
      baseDate = new Date(utcDate.getTime() + 9 * 60 * 60 * 1000); // KST 변환
    } else if (typeof postTime === 'string' && postTime.includes('년')) {
      const m = postTime.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(\S+)\s*(오전|오후)?\s*(\d{1,2}):(\d{1,2}):(\d{1,2})/);
      if (m) {
        const [, year, month, day, _weekday, ampm, hour, minute, second] = m;
        let h = parseInt(hour, 10);
        if (ampm === '오후' && h < 12) h += 12;
        else if (ampm === '오전' && h === 12) h = 0;
        baseDate = new Date(
          parseInt(year, 10),
          parseInt(month, 10) - 1,
          parseInt(day, 10),
          h,
          parseInt(minute, 10),
          parseInt(second, 10)
        );
      } else {
        baseDate = safeParseDate(postTime);
      }
    } else if (typeof postTime === 'string') {
      // 🔧 타임존 정보가 포함되어 있는지 확인 (+09, +09:00, +0900, Z 등 - 문자열 끝에 있어야 함)
      const hasTimezone = /(?:[+-]\d{2}(?::\d{2})?|Z)$/i.test(postTime);
      if (hasTimezone) {
        // 타임존 정보가 있으면 Date 생성자가 자동으로 처리하므로 추가 변환 불필요
        baseDate = new Date(postTime);
      } else if (postTime.includes('T')) {
        // ISO 형식이지만 타임존 정보가 없으면 UTC로 간주하고 +9시간
        const utcDate = new Date(postTime);
        baseDate = new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
      } else {
        baseDate = safeParseDate(postTime);
      }
    } else {
      baseDate = safeParseDate(postTime);
    }
  }

  // 🔧 4단계: 픽업/배송 타입 결정
  const pickupKeywords = ['픽업', '수령', '방문', '찾아가기', '받아가기'];
  const deliveryKeywords = ['배송', '배달', '도착', '보내드림', '전달'];
  let extractedType = '수령';
  if (pickupKeywords.some((k) => originalText.includes(k))) extractedType = '픽업';
  else if (deliveryKeywords.some((k) => originalText.includes(k))) extractedType = '배송';

  // 🔧 5단계: 요일 매핑
  const weekdayMap = {
    '월': 1, '월요일': 1,
    '화': 2, '화요일': 2,
    '수': 3, '수요일': 3,
    '목': 4, '목요일': 4,
    '금': 5, '금요일': 5,
    '토': 6, '토요일': 6,
    '일': 0, '일요일': 0,
  };

  // 🔧 6단계: 주문/오픈 마커 정의 (백엔드 로직 이식)
  const orderOpenMarkers = ['주문', '오픈', '시작', '접수', '예약', '판매'];
  const hasPickupTypeKeyword = (s) =>
    pickupKeywords.some((k) => s.includes(k)) || deliveryKeywords.some((k) => s.includes(k));

  // 시간 추출 함수
  function extractTime(s) {
    let hour = 9;
    let minute = 0;
    const m = s.match(/(\d{1,2})시(?:\s*(\d{1,2})분)?/);
    if (m) {
      hour = parseInt(m[1], 10);
      minute = m[2] ? parseInt(m[2], 10) : 0;
      const ampm = (s.match(/(오전|오후|아침|저녁|밤|낮)/) || [])[1];
      if ((ampm === '오후' || ampm === '저녁' || ampm === '밤') && hour < 12) hour += 12;
      else if ((ampm === '오전' || ampm === '아침') && hour === 12) hour = 0;
      else if (!ampm && hour <= 7) hour += 12;
    }
    return { hour, minute };
  }

  // 요일 추출 함수
  function extractWeekday(s) {
    const entries = Object.entries(weekdayMap).sort((a, b) => b[0].length - a[0].length);
    for (const [name, num] of entries) {
      if (name.length === 1) {
        const re = new RegExp(`(?<![가-힣0-9])${name}(?![가-힣0-9])`);
        if (re.test(s)) return { name, number: num };
      } else if (s.includes(name)) {
        return { name, number: num };
      }
    }
    return null;
  }

  // 현재 주의 특정 요일 계산
  function dateAtCurrentWeek(weekdayNumber, h, m) {
    const d = new Date(baseDate);
    const delta = weekdayNumber - d.getDay();
    d.setDate(d.getDate() + delta);
    d.setHours(h, m, 0, 0);
    return d;
  }

  // 선호 시간 추출 (주문/오픈 라인 제외)
  function extractPreferredTimeFromText(full) {
    try {
      const lines = full.split(/\n+/).map((t) => t.trim()).filter(Boolean);
      for (const ln of lines) {
        if (!ln) continue;
        const isOrderOpenLine = orderOpenMarkers.some((k) => ln.includes(k));
        const allow = !isOrderOpenLine || hasPickupTypeKeyword(ln) || /(수령\s*기간|상품\s*수령\s*기간|상품수령기간)/.test(ln);
        if (!allow) continue;
        if (/(\d{1,2})시/.test(ln)) {
          const t = extractTime(ln);
          return { hour: t.hour, minute: t.minute };
        }
      }
    } catch (_) {}
    return null;
  }

  let extractedDate = null;
  const preferredTime = extractPreferredTimeFromText(cleanedForDate);
  const defaultHour = preferredTime ? preferredTime.hour : 9;
  const defaultMinute = preferredTime ? preferredTime.minute : 0;

  // 당일 키워드
  const sameDayKeywords = ['당일', '오늘', '즉시', '지금', '지금부터', '바로'];
  const isSameDay = sameDayKeywords.some((k) => cleanedForDate.includes(k)) && (
    pickupKeywords.some((k) => originalText.includes(k)) || deliveryKeywords.some((k) => originalText.includes(k))
  );

  // 🔧 7단계: 상품수령기간 특수 패턴 (백엔드 로직 이식)
  try {
    if (/수령\s*기간|상품\s*수령\s*기간|상품수령기간/.test(cleanedForDate)) {
      const lines = cleanedForDate.split(/\n+/).map((t) => t.trim()).filter(Boolean);
      const target = lines.find((ln) => /(수령\s*기간|상품\s*수령\s*기간|상품수령기간)/.test(ln) && /[~∼\-–—]/.test(ln));
      if (target) {
        const reDotSlash = /(\d{1,2})\s*[./\-]\s*(\d{1,2})\s*[~∼\-–—]\s*(?:(\d{1,2})\s*[./\-]\s*)?(\d{1,2})/;
        const reKorean = /(\d{1,2})\s*월\s*(\d{1,2})\s*일?\s*[~∼\-–—]\s*(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일?/;
        const m = target.match(reDotSlash) || target.match(reKorean);
        if (m) {
          const mLeft = parseInt(m[1], 10);
          const dLeft = parseInt(m[2], 10);
          if (Number.isFinite(mLeft) && Number.isFinite(dLeft) && mLeft >= 1 && mLeft <= 12 && dLeft >= 1 && dLeft <= 31) {
            const y = baseDate.getFullYear();
            const baseM = baseDate.getMonth();
            const baseD = baseDate.getDate();
            const lineTime = extractTime(target);
            const th = lineTime?.hour ?? defaultHour;
            const tm = lineTime?.minute ?? defaultMinute;
            let cand = new Date(y, mLeft - 1, dLeft, th, tm, 0, 0);
            if ((mLeft - 1) < baseM || ((mLeft - 1) === baseM && dLeft < baseD)) {
              cand = new Date(y + 1, mLeft - 1, dLeft, th, tm, 0, 0);
            }
            extractedDate = cand;
          }
        }
      }
    }
  } catch (_) { /* ignore */ }

  // 🔧 8단계: 우선순위 처리 - 본문 첫 줄 명시적 날짜/요일 (백엔드 로직 이식)
  try {
    const lines = cleanedForDate.split(/\n+/).map((t) => t.trim()).filter(Boolean);
    let weekdayCandidate = null;
    let relativeCandidate = null;
    let nowCandidate = null;
    let lastMentionedMonth = null;

    for (let i = 0; i < Math.min(lines.length, 50); i++) {
      const ln = lines[i];
      if (!ln) continue;
      const { hour: fh, minute: fm } = extractTime(ln);
      const w = extractWeekday(ln);
      const hasRel = ['내일', '모레', '모래', '오늘', '당일'].some((k) => ln.includes(k));
      const mmdd = ln.match(/(\d{1,2})월\s*(\d{1,2})일/);
      const monthOnly = ln.match(/(\d{1,2})\s*월(?!\s*\d)/);

      if (monthOnly) {
        const mo = parseInt(monthOnly[1], 10);
        if (mo >= 1 && mo <= 12) lastMentionedMonth = mo;
      }

      const isOrderOpenLine = orderOpenMarkers.some((k) => ln.includes(k));
      const allowOnThisLine = !isOrderOpenLine || hasPickupTypeKeyword(ln);

      if (mmdd && allowOnThisLine) {
        const month = parseInt(mmdd[1], 10) - 1;
        const day = parseInt(mmdd[2], 10);
        let d = new Date(baseDate.getFullYear(), month, day, fh, fm, 0, 0);
        const baseY = baseDate.getFullYear();
        const baseM = baseDate.getMonth();
        const baseD = baseDate.getDate();
        if (month < baseM || (month === baseM && day < baseD)) {
          d = new Date(baseY + 1, month, day, fh, fm, 0, 0);
        }
        extractedDate = d;
        break;
      }

      // 🔧 DD일 패턴 (월 없이 일만) - 백엔드 로직 이식
      const ddOnly = (!/월/.test(ln) && ln.match(/(\d{1,2})\s*일/));
      if (!extractedDate && ddOnly && allowOnThisLine) {
        const day = parseInt(ddOnly[1], 10);
        if (day >= 1 && day <= 31) {
          const month = (lastMentionedMonth != null ? lastMentionedMonth : (baseDate.getMonth() + 1)) - 1;
          let d = new Date(baseDate.getFullYear(), month, day, fh, fm, 0, 0);
          extractedDate = d;
          break;
        }
      }

      if (w && allowOnThisLine && !weekdayCandidate) {
        weekdayCandidate = dateAtCurrentWeek(w.number, fh, fm);
      }
      if (hasRel && allowOnThisLine && hasPickupTypeKeyword(ln) && !relativeCandidate) {
        const d = new Date(baseDate);
        if (ln.includes('내일')) d.setDate(baseDate.getDate() + 1);
        else if (ln.includes('모레') || ln.includes('모래')) d.setDate(baseDate.getDate() + 2);
        else if (ln.includes('오늘') || ln.includes('당일')) d.setDate(baseDate.getDate());
        d.setHours(fh, fm, 0, 0);
        relativeCandidate = d;
      }
      if (!nowCandidate && /(즉시|바로|지금)/.test(ln) && /(수령|픽업|받)/.test(ln)) {
        nowCandidate = new Date(baseDate);
      }
    }
    if (!extractedDate) extractedDate = weekdayCandidate || nowCandidate || relativeCandidate || null;
  } catch (_) { /* ignore */ }

  // 🔧 9단계: 요일만 있는 경우 폴백
  if (!extractedDate) {
    try {
      const lines = cleanedForDate.split(/\n+/).map((t) => t.trim()).filter(Boolean);
      for (const ln of lines) {
        if (!ln) continue;
        const w = extractWeekday(ln);
        if (!w) continue;
        const isOrderOpenLine = orderOpenMarkers.some((k) => ln.includes(k));
        if (isOrderOpenLine && !hasPickupTypeKeyword(ln)) continue;
        const t = extractTime(ln);
        const d = dateAtCurrentWeek(w.number, t.hour, t.minute);
        extractedDate = d;
        break;
      }
    } catch (_) { /* ignore */ }
  }

  // 🔧 10단계: 리치 오더 오픈 후보 처리 (백엔드 로직 이식)
  try {
    const lines = cleanedForDate.split(/\n+/).map((t) => t.trim()).filter(Boolean);
    let richOrderOpenCandidate = null;
    let lastMentionedMonth = null;

    for (const ln of lines) {
      if (!ln) continue;
      const isOrderOpenLine = orderOpenMarkers.some((k) => ln.includes(k));
      if (!isOrderOpenLine) continue;

      const mmdd = ln.match(/(\d{1,2})월\s*(\d{1,2})일/);
      const hasWeekday = !!extractWeekday(ln);
      const hasTime = /(\d{1,2})시/.test(ln);

      if (!mmdd || !hasWeekday || !hasTime) {
        const monthOnly = ln.match(/(\d{1,2})\s*월(?!\s*\d)/);
        if (monthOnly) {
          const mo = parseInt(monthOnly[1], 10);
          if (mo >= 1 && mo <= 12) lastMentionedMonth = mo;
        }
        const ddOnly = (!/월/.test(ln) && ln.match(/(\d{1,2})\s*일/));
        if (!mmdd && ddOnly && hasWeekday && hasTime && lastMentionedMonth != null) {
          const day = parseInt(ddOnly[1], 10);
          const m = lastMentionedMonth - 1;
          const t = extractTime(ln);
          const y = baseDate.getFullYear();
          let cand = new Date(y, m, day, t.hour, t.minute, 0, 0);
          const baseM = baseDate.getMonth();
          const baseD = baseDate.getDate();
          if (m < baseM || (m === baseM && day < baseD)) {
            cand = new Date(y + 1, m, day, t.hour, t.minute, 0, 0);
          }
          richOrderOpenCandidate = cand;
          break;
        }
        continue;
      }

      const month = parseInt(mmdd[1], 10) - 1;
      const day = parseInt(mmdd[2], 10);
      const t = extractTime(ln);
      const y = baseDate.getFullYear();
      let cand = new Date(y, month, day, t.hour, t.minute, 0, 0);
      const baseM = baseDate.getMonth();
      const baseD = baseDate.getDate();
      if (month < baseM || (month === baseM && day < baseD)) {
        cand = new Date(y + 1, month, day, t.hour, t.minute, 0, 0);
      }
      richOrderOpenCandidate = cand;
      break;
    }

    if (richOrderOpenCandidate) {
      const hasAnyPickupKeyword = hasPickupTypeKeyword(cleanedForDate);
      if (!extractedDate) {
        extractedDate = richOrderOpenCandidate;
      } else if (!hasAnyPickupKeyword && richOrderOpenCandidate.getTime() < extractedDate.getTime()) {
        extractedDate = richOrderOpenCandidate;
      }
    }
  } catch (_) { /* ignore */ }

  // 🔧 11단계: 시간만 있는 경우
  if (!extractedDate) {
    const timeLine = cleanedForDate
      .split(/\n+/)
      .map((t) => t.trim())
      .find((ln) => {
        if (!/(\d{1,2})시/.test(ln)) return false;
        const isOrderOpenLine = orderOpenMarkers.some((k) => ln.includes(k));
        const isDeadline = /마감/.test(ln);
        const isAllowed = !isOrderOpenLine && !isDeadline;
        const allowByContext = hasPickupTypeKeyword(ln) || /(수령\s*기간|상품\s*수령\s*기간|상품수령기간)/.test(ln);
        return isAllowed || allowByContext;
      });
    if (timeLine) {
      const t = extractTime(timeLine);
      extractedDate = new Date(baseDate);
      extractedDate.setHours(t.hour, t.minute, 0, 0);
    }
  }

  // 🔧 12단계: 상대적 키워드 폴백
  if (!extractedDate && cleanedForDate.includes('내일')) {
    extractedDate = new Date(baseDate);
    extractedDate.setDate(baseDate.getDate() + 1);
    extractedDate.setHours(defaultHour, defaultMinute, 0, 0);
  } else if (!extractedDate && (cleanedForDate.includes('모레') || cleanedForDate.includes('모래'))) {
    extractedDate = new Date(baseDate);
    extractedDate.setDate(baseDate.getDate() + 2);
    extractedDate.setHours(defaultHour, defaultMinute, 0, 0);
  } else if (!extractedDate && isSameDay) {
    extractedDate = new Date(baseDate);
    extractedDate.setHours(defaultHour, defaultMinute, 0, 0);
  } else {
    // 🔧 13단계: MM월DD일 최종 폴백
    const candidateLine = cleanedForDate
      .split(/\n+/)
      .map((t) => t.trim())
      .find((ln) => {
        const mm = ln.match(/(\d{1,2})월\s*(\d{1,2})일/);
        if (!mm) return false;
        const isOrderOpenLine = orderOpenMarkers.some((k) => ln.includes(k));
        if (isOrderOpenLine && !hasPickupTypeKeyword(ln)) return false;
        return true;
      });
    if (!extractedDate && candidateLine) {
      const mm = candidateLine.match(/(\d{1,2})월\s*(\d{1,2})일/);
      const m = parseInt(mm[1], 10) - 1;
      const d = parseInt(mm[2], 10);
      const t = extractTime(candidateLine);
      const th = t?.hour ?? defaultHour;
      const tm = t?.minute ?? defaultMinute;
      let cand = new Date(baseDate.getFullYear(), m, d, th, tm, 0, 0);
      const baseM = baseDate.getMonth();
      const baseD = baseDate.getDate();
      if (m < baseM || (m === baseM && d < baseD)) {
        cand = new Date(baseDate.getFullYear() + 1, m, d, th, tm, 0, 0);
      }
      extractedDate = cand;
    }
  }

  return {
    date: extractedDate ? extractedDate.toISOString() : null,
    type: extractedType,
    original: originalText,
  };
}

/**
 * 함수명: calculateDaysUntilPickup
 * 목적: 수령일까지 남은 일수 계산 (한국 시간 기준)
 * 사용처: CommentOrdersView의 상대 시간 표시
 * 의존성: 없음
 * 파라미터: pickupDate - 수령 날짜 (Date 객체, ISO 문자열, 또는 타임스탬프)
 * 리턴값: {days: 일수, isPast: 지난 날짜 여부, relativeText: 상대 시간 텍스트}
 */
export function calculateDaysUntilPickup(pickupDate) {
  if (!pickupDate) {
    return { days: null, isPast: false, relativeText: "—" };
  }

  try {
    // pickupDate를 Date 객체로 변환
    let targetDate;
    if (pickupDate instanceof Date) {
      targetDate = pickupDate;
    } else if (typeof pickupDate === "string") {
      targetDate = new Date(pickupDate);
    } else if (typeof pickupDate === "number") {
      targetDate = new Date(pickupDate);
    } else {
      return { days: null, isPast: false, relativeText: "—" };
    }

    // 유효한 날짜인지 확인
    if (isNaN(targetDate.getTime())) {
      return { days: null, isPast: false, relativeText: "—" };
    }

    // 현재 시간 (한국 시간 기준)
    const now = new Date();

    // 날짜만 비교하기 위해 시간 정보 제거
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDateStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

    // 일수 차이 계산
    const diffTime = targetDateStart - todayStart;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    // 과거 여부
    const isPast = diffDays < 0;

    // 상대 시간 텍스트 생성
    const relativeText = getRelativeTimeText(diffDays, isPast);

    return {
      days: Math.abs(diffDays),
      isPast: isPast,
      relativeText: relativeText
    };
  } catch (error) {
    console.error("[calculateDaysUntilPickup] Error:", error);
    return { days: null, isPast: false, relativeText: "—" };
  }
}

/**
 * 함수명: getRelativeTimeText
 * 목적: 일수 차이를 상대적인 시간 텍스트로 변환
 * 사용처: calculateDaysUntilPickup
 * 의존성: 없음
 * 파라미터:
 *   - days: 일수 차이 (절대값)
 *   - isPast: 과거 날짜 여부
 * 리턴값: 상대 시간 텍스트 문자열
 */
export function getRelativeTimeText(days, isPast) {
  const absDays = Math.abs(days);

  if (absDays === 0) {
    return "오늘";
  } else if (absDays === 1) {
    return isPast ? "1일 지남" : "내일";
  } else if (absDays === 2) {
    return isPast ? "2일 지남" : "모레";
  } else if (absDays <= 7) {
    return isPast ? `${absDays}일 지남` : `${absDays}일 후`;
  } else if (absDays <= 14) {
    const weeks = Math.round(absDays / 7);
    return isPast ? `${weeks}주 지남` : `${weeks}주 후`;
  } else if (absDays <= 30) {
    return isPast ? `${absDays}일 지남` : `${absDays}일 후`;
  } else if (absDays <= 365) {
    const months = Math.round(absDays / 30);
    return isPast ? `${months}개월 지남` : `${months}개월 후`;
  } else {
    const years = Math.round(absDays / 365);
    return isPast ? `${years}년 지남` : `${years}년 후`;
  }
}
