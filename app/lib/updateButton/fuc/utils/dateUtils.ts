/**
 * 함수명: convertUTCtoKST
 * 목적: UTC 타임스탬프를 한국 표준시(KST)로 변환
 * 사용처: Band API 응답의 타임스탬프 변환
 * 의존성: 없음
 * 파라미터: utcTimestamp - UTC 타임스탬프 (숫자 또는 Date 객체)
 * 리턴값: KST로 변환된 Date 객체
 */ export function convertUTCtoKST(utcTimestamp) {
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
    console.warn(`[convertUTCtoKST] Invalid timestamp type: ${typeof utcTimestamp}`);
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
 */ export function safeParseDate(dateString) {
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
          if (result < today && (today.getMonth() - month > 1 || today.getMonth() === 11 && month === 0)) {
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
 * 목적: 텍스트에서 픽업/배송 날짜 및 타입 정보 추출
 * 사용처: processProduct, AI 주문 처리
 * 의존성: safeParseDate
 * 파라미터:
 *   - text: 날짜 정보가 포함된 텍스트
 *   - postTime: 게시물 작성 시간 (기준 날짜)
 *   - weekTiming: AI가 판단한 요일 시점 (current|this_week|next_week)
 * 리턴값: {date: ISO 문자열, type: 픽업/배송/수령, original: 원본 텍스트}
 */ export function extractPickupDate(text, postTime = null, weekTiming = null) {
  if (!text) return {
    date: null,
    type: null,
    original: null
  };
  const originalText = text;
  // postTime에서 기준 날짜 파싱 (한국 시간으로 변환된 상태라고 가정)
  let baseDate = new Date();
  if (postTime) {
    // postTime이 타임스탬프 형식인지 확인 (string 또는 number)
    if (typeof postTime === "string" && /^\d+$/.test(postTime) || typeof postTime === "number") {
      // 타임스탬프를 한국 시간으로 변환
      const timestamp = typeof postTime === "string" ? parseInt(postTime) : postTime;
      baseDate = new Date(timestamp);
      // 한국 시간으로 표시하기 위해 한국 시간대 기준으로 새로운 Date 생성
      const koreanDateString = baseDate.toLocaleString("sv-SE", {
        timeZone: "Asia/Seoul"
      });
      const koreanDate = new Date(koreanDateString);
      baseDate = koreanDate;
    } else if (typeof postTime === "string" && postTime.includes("년")) {
      // 한국어 날짜 문자열 파싱
      const koreanDateMatch = postTime.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(\S+)\s*(오전|오후)?\s*(\d{1,2}):(\d{1,2}):(\d{1,2})/);
      if (koreanDateMatch) {
        const [, year, month, day, weekday, ampm, hour, minute, second] = koreanDateMatch;
        // 한국 시간대(KST, UTC+9)를 고려하여 날짜 생성
        let parsedHour = parseInt(hour);
        if (ampm === "오후" && parsedHour < 12) {
          parsedHour += 12;
        } else if (ampm === "오전" && parsedHour === 12) {
          parsedHour = 0;
        }
        // 한국 시간대 문자열을 생성하여 Date 생성자에 전달
        const koreanDateString = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${parsedHour.toString().padStart(2, "0")}:${minute.padStart(2, "0")}:${second.padStart(2, "0")}+09:00`;
        baseDate = new Date(koreanDateString);
      } else {
        baseDate = safeParseDate(postTime);
      }
    } else {
      baseDate = safeParseDate(postTime);
    }
  }
  // 픽업/배송 타입 키워드 검색
  const pickupKeywords = [
    "픽업",
    "수령",
    "방문",
    "찾아가기",
    "받아가기"
  ];
  const deliveryKeywords = [
    "배송",
    "배달",
    "도착",
    "보내드림",
    "전달"
  ];
  let extractedType = "수령"; // 기본값
  for (const keyword of pickupKeywords){
    if (text.includes(keyword)) {
      extractedType = "픽업";
      break;
    }
  }
  if (extractedType === "수령") {
    for (const keyword of deliveryKeywords){
      if (text.includes(keyword)) {
        extractedType = "배송";
        break;
      }
    }
  }
  // 요일 매핑
  const weekdayMap = {
    월: 1,
    월요일: 1,
    화: 2,
    화요일: 2,
    수: 3,
    수요일: 3,
    목: 4,
    목요일: 4,
    금: 5,
    금요일: 5,
    토: 6,
    토요일: 6,
    일: 0,
    일요일: 0
  };
  // 시간 추출 함수
  function extractTime(text) {
    let hour = 12; // 기본값 정오
    let minute = 0;
    // 시간 패턴 찾기 ("4시", "4시30분", "16시" 등)
    const timeMatch = text.match(/(\d{1,2})시(?:\s*(\d{1,2})분)?/);
    if (timeMatch) {
      hour = parseInt(timeMatch[1]);
      minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      // 오전/오후 처리
      const amPmMatch = text.match(/(오전|오후|아침|저녁|밤|낮)/);
      if (amPmMatch) {
        const amPm = amPmMatch[1];
        if ((amPm === "오후" || amPm === "저녁" || amPm === "밤") && hour < 12) {
          hour += 12;
        } else if ((amPm === "오전" || amPm === "아침") && hour === 12) {
          hour = 0;
        }
      } else if (hour <= 7) {
        // 명시적인 오전/오후 없이 시간이 7시 이하면 오후로 가정
        hour += 12;
      }
    }
    return {
      hour,
      minute
    };
  }
  // 요일 추출 함수
  function extractWeekday(text) {
    // 긴 형태의 요일부터 먼저 확인 (예: "수요일"이 "수"보다 우선)
    const sortedWeekdays = Object.entries(weekdayMap).sort((a, b)=>b[0].length - a[0].length);
    for (const [weekdayName, weekdayNum] of sortedWeekdays){
      // 단일 글자 요일의 경우 더 엄격한 조건 적용
      if (weekdayName.length === 1) {
        // 단일 글자 요일은 앞뒤에 특정 문자가 있으면 제외
        const regex = new RegExp(`(?<![가-힣0-9])${weekdayName}(?![가-힣0-9])`);
        if (regex.test(text)) {
          return {
            name: weekdayName,
            number: weekdayNum
          };
        }
      } else {
        // 긴 형태의 요일은 기존 방식 사용
        if (text.includes(weekdayName)) {
          return {
            name: weekdayName,
            number: weekdayNum
          };
        }
      }
    }
    return null;
  }
  // 다음 해당 요일까지의 날짜 계산
  function getNextWeekday(baseDate, targetWeekday) {
    const baseDayOfWeek = baseDate.getDay();
    let daysToAdd = targetWeekday - baseDayOfWeek;
    if (daysToAdd <= 0) {
      daysToAdd += 7; // 다음 주로
    }
    const result = new Date(baseDate);
    result.setDate(baseDate.getDate() + daysToAdd);
    return result;
  }
  let extractedDate = null;
  const { hour, minute } = extractTime(text);
  // 1. 요일이 명시된 경우 처리
  const weekdayInfo = extractWeekday(text);
  if (weekdayInfo) {
    // 기준 날짜의 요일
    const baseDayOfWeek = baseDate.getDay();
    // 다음 해당 요일까지의 일수 계산
    let daysToAdd = weekdayInfo.number - baseDayOfWeek;
    // AI가 판단한 weekTiming을 우선 사용
    if (weekTiming === "tomorrow") {
      // "내일" + 요일인 경우 무조건 내일(작성일+1일)
      daysToAdd = 1;
    } else if (weekTiming === "next_week") {
      // 다음주 무조건
      if (daysToAdd <= 0) {
        daysToAdd += 7;
      } else {
        daysToAdd += 7; // 이미 양수여도 다음주로
      }
    } else if (weekTiming === "this_week") {
      // 이번주 (지나간 요일이면 다음주)
      if (daysToAdd < 0) {
        daysToAdd += 7;
      }
    } else if (weekTiming === "current") {
      // 현재 (같은 요일이면 오늘)
      if (daysToAdd < 0) {
        daysToAdd += 7;
      }
    // daysToAdd === 0 이면 오늘 그대로
    } else {
      // weekTiming이 없는 경우 기존 로직
      if (daysToAdd <= 0) {
        daysToAdd += 7; // 다음 주의 해당 요일
      }
    }
    extractedDate = new Date(baseDate);
    extractedDate.setDate(baseDate.getDate() + daysToAdd);
    extractedDate.setHours(hour, minute, 0, 0);
  } else if (text.match(/\d{1,2}시/)) {
    extractedDate = new Date(baseDate);
    extractedDate.setHours(hour, minute, 0, 0);
  } else if (text.includes("내일")) {
    extractedDate = new Date(baseDate);
    extractedDate.setDate(baseDate.getDate() + 1);
    extractedDate.setHours(hour, minute, 0, 0);
  } else if (text.includes("모레") || text.includes("모래")) {
    extractedDate = new Date(baseDate);
    extractedDate.setDate(baseDate.getDate() + 2);
    extractedDate.setHours(hour, minute, 0, 0);
  } else if (text.includes("오늘")) {
    extractedDate = new Date(baseDate);
    extractedDate.setHours(hour, minute, 0, 0);
  } else if (text.includes("당일")) {
    // "당일수령", "당일픽업", "당일" 등 처리 - 시간 미지정시 저녁 8시로 설정
    extractedDate = new Date(baseDate);
    // 시간이 명시되지 않은 경우(기본값 12시)는 저녁 8시로 변경
    const finalHour = hour === 12 && minute === 0 && !text.match(/(\d{1,2})시/) ? 20 : hour;
    extractedDate.setHours(finalHour, minute, 0, 0);
  } else if (text.includes("즉시") || text.includes("바로") || text.includes("지금") || text.includes("지금부터")) {
    extractedDate = new Date(baseDate);
    let finalHour = hour;
    if (!text.match(/(\d{1,2})시/)) {
      finalHour = Math.max(baseDate.getHours(), 9);
      if (finalHour > 20) finalHour = 20;
    }
    extractedDate.setHours(finalHour, minute, 0, 0);
  } else if (text.match(/(\d{1,2})월\s*(\d{1,2})일/)) {
    const matches = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
    if (matches) {
      const month = parseInt(matches[1]) - 1; // 0-indexed 월
      const day = parseInt(matches[2]);
      extractedDate = new Date(baseDate.getFullYear(), month, day);
      // 날짜가 과거인 경우 다음 해로 설정
      if (extractedDate < baseDate) {
        extractedDate.setFullYear(baseDate.getFullYear() + 1);
      }
      extractedDate.setHours(hour, minute, 0, 0);
    }
  } else if (text.match(/(\d{1,2})\.(\d{1,2})~?(\d{1,2})?/)) {
    // "9.5~6" 또는 "9.5" 형식 처리
    const matches = text.match(/(\d{1,2})\.(\d{1,2})~?(\d{1,2})?/);
    if (matches) {
      const month = parseInt(matches[1]) - 1; // 0-indexed 월
      const day = parseInt(matches[2]);
      extractedDate = new Date(baseDate.getFullYear(), month, day);
      // 날짜가 과거인 경우 다음 해로 설정
      if (extractedDate < baseDate) {
        extractedDate.setFullYear(baseDate.getFullYear() + 1);
      }
      extractedDate.setHours(hour, minute, 0, 0);
    }
  } else {
    extractedDate = new Date(baseDate);
    extractedDate.setDate(baseDate.getDate() + 1);
    extractedDate.setHours(hour, minute, 0, 0);
  }
  return {
    date: extractedDate ? extractedDate.toISOString() : null,
    type: extractedType,
    original: originalText
  };
}

/**
 * 함수명: formatKstDateTime
 * 목적: 날짜를 한국 표준시(KST) 형식으로 포맷팅
 * 사용처: 날짜 표시, 로깅 등
 * 의존성: 없음
 * 파라미터: dateInput - Date 객체 또는 날짜 문자열
 * 리턴값: 한국어 형식의 날짜 문자열 (예: "2024년 5월 10일 목요일 오후 2:30:00") 또는 null
 */
export function formatKstDateTime(dateInput) {
  if (!dateInput) return null;
  let baseDate;
  if (dateInput instanceof Date) {
    baseDate = dateInput;
  } else {
    baseDate = new Date(dateInput);
  }
  if (Number.isNaN(baseDate.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: true,
  }).format(baseDate);
}

/**
 * 함수명: kstDateToUtcISOString
 * 목적: KST 기준으로 설정된 Date를 UTC ISO 문자열로 변환
 * 사용처: DB 저장 시 KST → UTC 변환
 * 의존성: 없음
 * 파라미터: date - KST 기준 Date 객체
 * 리턴값: UTC ISO 문자열 (KST에서 9시간 감소) 또는 null
 */
export function kstDateToUtcISOString(date) {
  if (!(date instanceof Date)) return null;
  return new Date(date.getTime() - 9 * 60 * 60 * 1000).toISOString();
}

/**
 * 함수명: updateTitleWithDate
 * 목적: 상품 제목에 픽업 날짜 추가 또는 업데이트
 * 사용처: 상품 제목 생성 시 날짜 정보 추가
 * 의존성: 없음
 * 파라미터:
 *   - title: 원본 제목
 *   - pickupDate: 픽업 날짜 (Date 객체 또는 ISO 문자열)
 * 리턴값: 날짜가 추가된 제목 (예: "[5월10일] 상품명")
 */
export function updateTitleWithDate(title, pickupDate) {
  if (!title || !pickupDate) return title;
  const date = new Date(pickupDate);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const datePrefix = `[${month}월${day}일]`;
  // 기존 날짜 패턴 제거 후 새 날짜 추가
  const titleWithoutDate = title.replace(/^\[.*?\]\s*/, "");
  return `${datePrefix} ${titleWithoutDate}`;
}
