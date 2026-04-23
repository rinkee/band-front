export const DEFAULT_CLOSE_MARKER_TEXT = "마감된 상품입니다";
export const DEFAULT_CLOSE_MARKER_TEXTS = [DEFAULT_CLOSE_MARKER_TEXT];
export const SETTINGS_CLOSE_MARKER_TEXTS_KEY = "close_marker_texts";
export const MAX_CLOSE_MARKER_TEXTS = 10;
export const MAX_CLOSE_MARKER_TEXT_LENGTH = 80;

const LEGACY_CLOSE_MARKER_KEYS = [
  "close_marker_text",
  "closeMarkerText",
  "closeMarkerTexts",
];

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const normalizeMarkerText = (value) =>
  String(value || "").replace(/\s+/g, " ").trim();

export const extractCloseMarkerTextSource = (settings = {}) => {
  if (!isPlainObject(settings)) return undefined;
  if (Object.prototype.hasOwnProperty.call(settings, SETTINGS_CLOSE_MARKER_TEXTS_KEY)) {
    return settings[SETTINGS_CLOSE_MARKER_TEXTS_KEY];
  }

  for (const key of LEGACY_CLOSE_MARKER_KEYS) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      return settings[key];
    }
  }

  return undefined;
};

export const normalizeCloseMarkerTexts = (
  value,
  { fallbackToDefault = true } = {}
) => {
  const source =
    value === undefined || value === null
      ? []
      : Array.isArray(value)
        ? value
        : String(value).split(/\r?\n/);

  const normalized = [];
  const seen = new Set();

  for (const item of source) {
    const marker = normalizeMarkerText(item);
    if (!marker || seen.has(marker)) continue;
    seen.add(marker);
    normalized.push(marker);
  }

  if (normalized.length === 0 && fallbackToDefault) {
    return [...DEFAULT_CLOSE_MARKER_TEXTS];
  }

  return normalized;
};

export const validateCloseMarkerTexts = (value) => {
  const texts = normalizeCloseMarkerTexts(value, { fallbackToDefault: false });

  if (texts.length === 0) {
    return {
      error: "품절 처리 댓글 문구를 1개 이상 입력해주세요.",
      texts,
    };
  }

  if (texts.length > MAX_CLOSE_MARKER_TEXTS) {
    return {
      error: `품절 처리 댓글 문구는 최대 ${MAX_CLOSE_MARKER_TEXTS}개까지 저장할 수 있습니다.`,
      texts,
    };
  }

  const tooLong = texts.find((text) => text.length > MAX_CLOSE_MARKER_TEXT_LENGTH);
  if (tooLong) {
    return {
      error: `품절 처리 댓글 문구는 항목당 ${MAX_CLOSE_MARKER_TEXT_LENGTH}자를 초과할 수 없습니다.`,
      texts,
    };
  }

  return { texts };
};

export const resolveCloseMarkerTextsFromSettings = (settings = {}) =>
  normalizeCloseMarkerTexts(extractCloseMarkerTextSource(settings));

export const closeMarkerTextsToTextAreaValue = (texts = []) =>
  normalizeCloseMarkerTexts(texts).join("\n");

export const areCloseMarkerTextsEqual = (a = [], b = []) => {
  const left = normalizeCloseMarkerTexts(a);
  const right = normalizeCloseMarkerTexts(b);
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
};
