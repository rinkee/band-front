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
 * 목적: 텍스트에서 픽업/배송 날짜 및 타입 정보 추출
 * 사용처: processProduct, AI 주문 처리
 * 의존성: safeParseDate
 * 파라미터:
 *   - text: 날짜 정보가 포함된 텍스트
 *   - postTime: 게시물 작성 시간 (기준 날짜)
 * 리턴값: {date: ISO 문자열, type: 픽업/배송/수령, original: 원본 텍스트}
 */
export function extractPickupDate(text, postTime = null) {
  if (!text)
    return {
      date: null,
      type: null,
      original: null,
    };
  const originalText = text;
  // postTime에서 기준 날짜 파싱 (한국 시간으로 변환된 상태라고 가정)
  let baseDate = new Date();
  if (postTime) {
    console.log(
      `[DEBUG] postTime 입력값: "${postTime}" (타입: ${typeof postTime})`
    );
    // postTime이 타임스탬프 형식인지 확인 (string 또는 number)
    if (
      (typeof postTime === "string" && /^\d+$/.test(postTime)) ||
      typeof postTime === "number"
    ) {
      // 타임스탬프를 한국 시간으로 변환
      const timestamp =
        typeof postTime === "string" ? parseInt(postTime) : postTime;
      baseDate = new Date(timestamp);
      console.log(
        `[DEBUG] 타임스탬프 파싱 (UTC): ${postTime} → ${baseDate.toISOString()}`
      );
      // 한국 시간으로 표시하기 위해 한국 시간대 기준으로 새로운 Date 생성
      const koreanDateString = baseDate.toLocaleString("sv-SE", {
        timeZone: "Asia/Seoul",
      });
      const koreanDate = new Date(koreanDateString);
      console.log(
        `[DEBUG] 한국 시간 변환: ${koreanDate.toISOString()} (로컬: ${baseDate.toLocaleString(
          "ko-KR",
          {
            timeZone: "Asia/Seoul",
          }
        )})`
      );
      baseDate = koreanDate;
    } else if (typeof postTime === "string" && postTime.includes("년")) {
      // 한국어 날짜 문자열 파싱
      const koreanDateMatch = postTime.match(
        /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(\S+)\s*(오전|오후)?\s*(\d{1,2}):(\d{1,2}):(\d{1,2})/
      );
      if (koreanDateMatch) {
        const [, year, month, day, weekday, ampm, hour, minute, second] =
          koreanDateMatch;
        // 한국 시간대(KST, UTC+9)를 고려하여 날짜 생성
        let parsedHour = parseInt(hour);
        if (ampm === "오후" && parsedHour < 12) {
          parsedHour += 12;
        } else if (ampm === "오전" && parsedHour === 12) {
          parsedHour = 0;
        }
        // 한국 시간대 문자열을 생성하여 Date 생성자에 전달
        const koreanDateString = `${year}-${month.padStart(
          2,
          "0"
        )}-${day.padStart(2, "0")}T${parsedHour
          .toString()
          .padStart(2, "0")}:${minute.padStart(2, "0")}:${second.padStart(
          2,
          "0"
        )}+09:00`;
        baseDate = new Date(koreanDateString);
        console.log(
          `[DEBUG] 한국 시간 파싱: ${koreanDateString} → ${baseDate.toISOString()}`
        );
      } else {
        baseDate = safeParseDate(postTime);
      }
    } else {
      baseDate = safeParseDate(postTime);
    }
  }
  console.log(`[DEBUG] 기준 날짜 (postTime): ${baseDate.toISOString()}`);
  console.log(
    `[DEBUG] 기준 요일: ${
      ["일", "월", "화", "수", "목", "금", "토"][baseDate.getDay()]
    }`
  );
  // 픽업/배송 타입 키워드 검색
  const pickupKeywords = ["픽업", "수령", "방문", "찾아가기", "받아가기"];
  const deliveryKeywords = ["배송", "배달", "도착", "보내드림", "전달"];
  let extractedType = "수령"; // 기본값
  for (const keyword of pickupKeywords) {
    if (text.includes(keyword)) {
      extractedType = "픽업";
      break;
    }
  }
  if (extractedType === "수령") {
    for (const keyword of deliveryKeywords) {
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
    일요일: 0,
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
        if (
          (amPm === "오후" || amPm === "저녁" || amPm === "밤") &&
          hour < 12
        ) {
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
      minute,
    };
  }
  // 요일 추출 함수
  function extractWeekday(text) {
    // 긴 형태의 요일부터 먼저 확인 (예: "수요일"이 "수"보다 우선)
    const sortedWeekdays = Object.entries(weekdayMap).sort(
      (a, b) => b[0].length - a[0].length
    );
    for (const [weekdayName, weekdayNum] of sortedWeekdays) {
      // 단일 글자 요일의 경우 더 엄격한 조건 적용
      if (weekdayName.length === 1) {
        // 단일 글자 요일은 앞뒤에 특정 문자가 있으면 제외
        const regex = new RegExp(`(?<![가-힣])${weekdayName}(?![가-힣])`);
        if (regex.test(text)) {
          return {
            name: weekdayName,
            number: weekdayNum,
          };
        }
      } else {
        // 긴 형태의 요일은 기존 방식 사용
        if (text.includes(weekdayName)) {
          return {
            name: weekdayName,
            number: weekdayNum,
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
    console.log(
      `[DEBUG] 요일 감지: ${weekdayInfo.name} (${weekdayInfo.number})`
    );
    // 기준 날짜의 요일
    const baseDayOfWeek = baseDate.getDay();
    console.log(
      `[DEBUG] 기준 요일: ${baseDayOfWeek}, 목표 요일: ${weekdayInfo.number}`
    );
    // 다음 해당 요일까지의 일수 계산
    let daysToAdd = weekdayInfo.number - baseDayOfWeek;
    if (daysToAdd <= 0) {
      daysToAdd += 7; // 다음 주의 해당 요일
    }
    console.log(`[DEBUG] 추가할 일수: ${daysToAdd}일`);
    extractedDate = new Date(baseDate);
    extractedDate.setDate(baseDate.getDate() + daysToAdd);
    extractedDate.setHours(hour, minute, 0, 0);
    console.log(`[DEBUG] 계산된 수령일: ${extractedDate.toISOString()}`);
  } else if (text.match(/\d{1,2}시/)) {
    console.log(`[DEBUG] 시간만 감지 - 당일 ${hour}시 ${minute}분`);
    console.log(`[DEBUG] baseDate before: ${baseDate.toISOString()}`);
    extractedDate = new Date(baseDate);
    console.log(
      `[DEBUG] extractedDate after copy: ${extractedDate.toISOString()}`
    );
    extractedDate.setHours(hour, minute, 0, 0);
    console.log(
      `[DEBUG] extractedDate after setHours: ${extractedDate.toISOString()}`
    );
  } else if (text.includes("내일")) {
    extractedDate = new Date(baseDate);
    extractedDate.setDate(baseDate.getDate() + 1);
    extractedDate.setHours(hour, minute, 0, 0);
    console.log(`[DEBUG] "내일" 감지: ${extractedDate.toISOString()}`);
  } else if (text.includes("모레") || text.includes("모래")) {
    extractedDate = new Date(baseDate);
    extractedDate.setDate(baseDate.getDate() + 2);
    extractedDate.setHours(hour, minute, 0, 0);
    console.log(`[DEBUG] "모레" 감지: ${extractedDate.toISOString()}`);
  } else if (text.includes("오늘")) {
    extractedDate = new Date(baseDate);
    extractedDate.setHours(hour, minute, 0, 0);
    console.log(`[DEBUG] "오늘" 감지: ${extractedDate.toISOString()}`);
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
      console.log(`[DEBUG] "월일" 형식 감지: ${extractedDate.toISOString()}`);
    }
  } else {
    extractedDate = new Date(baseDate);
    extractedDate.setDate(baseDate.getDate() + 1);
    extractedDate.setHours(hour, minute, 0, 0);
    console.log(`[DEBUG] 기본값 - 내일: ${extractedDate.toISOString()}`);
  }
  return {
    date: extractedDate ? extractedDate.toISOString() : null,
    type: extractedType,
    original: originalText,
  };
}