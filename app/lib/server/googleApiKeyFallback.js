const BACKUP_KEYS_ENV_NAME = "GOOGLE_BACKUP_API_KEY_JSON";

const normalizeKeys = (values) =>
  (Array.isArray(values) ? values : [])
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

const parseBackupKeys = () => {
  const raw = process.env[BACKUP_KEYS_ENV_NAME];
  if (!raw || typeof raw !== "string") return [];

  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return normalizeKeys(parsed);
    }
    if (parsed && Array.isArray(parsed.keys)) {
      return normalizeKeys(parsed.keys);
    }
    if (typeof parsed === "string") {
      return normalizeKeys([parsed]);
    }
    return [];
  } catch {
    return normalizeKeys(trimmed.split(/[\n,]/));
  }
};

export const getGoogleApiKeyPool = () => {
  const primaryKey =
    typeof process.env.GOOGLE_API_KEY === "string"
      ? process.env.GOOGLE_API_KEY.trim()
      : "";
  const backupKeys = parseBackupKeys();
  const candidates = [primaryKey, ...backupKeys].filter(Boolean);

  const seen = new Set();
  return candidates.filter((key) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const isRetriableError = (error) => {
  if (!error) return false;
  if (error.name === "AbortError") return true;
  const status = Number(error.status);
  if (status >= 500) return true;
  const message = String(error.message || "");
  return message.includes("500");
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchWithGoogleApiKeyFallback({
  model,
  requestBody,
  timeoutMs = 30000,
  retriesPerKey = 2,
  logPrefix = "[AI]",
}) {
  const keyPool = getGoogleApiKeyPool();
  if (keyPool.length === 0) {
    throw new Error("GOOGLE_API_KEY 또는 백업 키가 설정되지 않았습니다.");
  }

  let lastError = null;

  for (let keyIndex = 0; keyIndex < keyPool.length; keyIndex += 1) {
    const apiKey = keyPool[keyIndex];
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    let attempt = 0;

    while (attempt <= retriesPerKey) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
          const error = new Error(
            `AI API HTTP error: ${response.status} ${response.statusText}`
          );
          error.status = response.status;
          throw error;
        }

        if (keyIndex > 0) {
          console.warn(
            `${logPrefix} 백업 키로 처리 성공 (keyIndex=${keyIndex + 1}/${keyPool.length})`
          );
        }

        return response;
      } catch (error) {
        lastError = error;

        if (attempt < retriesPerKey && isRetriableError(error)) {
          attempt += 1;
          console.warn(
            `${logPrefix} 요청 실패, 동일 키 재시도 ${attempt}/${retriesPerKey}: ${error.message}`
          );
          await wait(1000 * attempt);
          continue;
        }

        break;
      }
    }

    if (keyIndex < keyPool.length - 1) {
      console.warn(
        `${logPrefix} 현재 키 실패로 다음 키로 전환 (nextKeyIndex=${keyIndex + 2}/${keyPool.length})`
      );
    }
  }

  throw (
    lastError ||
    new Error("모든 Google API 키로 요청했지만 AI 호출에 실패했습니다.")
  );
}
