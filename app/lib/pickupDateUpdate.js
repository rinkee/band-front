const parseDateParts = (dateText) => {
  if (typeof dateText !== "string") return null;
  const trimmed = dateText.trim();
  const parts = trimmed.split("-");
  if (parts.length !== 3) return null;

  const [yearText, monthText, dayText] = parts;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() + 1 !== month ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
};

const pad2 = (value) => String(value).padStart(2, "0");

const buildKstIso = ({ year, month, day, hour24, minutes }) =>
  `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour24)}:${pad2(minutes)}:00+09:00`;

export const pickupDateIsoFromDateData = (dateData) => {
  if (!dateData?.date) {
    return { ok: false, error: "날짜를 선택해주세요." };
  }

  const parsedDate = parseDateParts(dateData.date);
  if (!parsedDate) {
    return { ok: false, error: "올바른 날짜 형식을 입력해주세요. (년, 월, 일 모두 입력 필요)" };
  }

  const rawHour = Number(dateData.hours ?? 0);
  const rawMinutes = Number(dateData.minutes ?? 0);
  const ampm = dateData.ampm === "오후" ? "오후" : "오전";

  if (!Number.isFinite(rawHour) || !Number.isFinite(rawMinutes)) {
    return { ok: false, error: "올바른 시간을 입력해주세요." };
  }

  let hour24 = Math.trunc(rawHour);
  if (ampm === "오후" && hour24 !== 12) {
    hour24 += 12;
  } else if (ampm === "오전" && hour24 === 12) {
    hour24 = 0;
  }

  const minutes = Math.trunc(rawMinutes);
  if (hour24 < 0 || hour24 > 23 || minutes < 0 || minutes > 59) {
    return { ok: false, error: "올바른 시간을 입력해주세요." };
  }

  return {
    ok: true,
    value: buildKstIso({
      year: parsedDate.year,
      month: parsedDate.month,
      day: parsedDate.day,
      hour24,
      minutes,
    }),
  };
};

export const pickupDateIsoFromDateAndTime = (dateText, timeText = "00:00") => {
  const parsedDate = parseDateParts(dateText);
  if (!parsedDate) {
    return { ok: false, error: "올바른 날짜를 입력해주세요." };
  }

  const [hourText = "00", minuteText = "00"] = String(timeText || "00:00").split(":");
  const hour24 = Number(hourText);
  const minutes = Number(minuteText);

  if (
    !Number.isInteger(hour24) ||
    !Number.isInteger(minutes) ||
    hour24 < 0 ||
    hour24 > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return { ok: false, error: "올바른 시간을 입력해주세요." };
  }

  return {
    ok: true,
    value: buildKstIso({
      year: parsedDate.year,
      month: parsedDate.month,
      day: parsedDate.day,
      hour24,
      minutes,
    }),
  };
};

export const formatPickupDateTimeForDisplay = (value) => {
  if (!value) return "미정";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "미정";

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const ampm = hours < 12 ? "오전" : "오후";
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${year}년 ${month}월 ${day}일 ${ampm} ${displayHours}시`;
};

export const buildPickupDateChangeConfirmMessage = ({ oldPickupDate, newPickupDate }) => {
  const oldDateStr = formatPickupDateTimeForDisplay(oldPickupDate);
  const newDateStr = formatPickupDateTimeForDisplay(newPickupDate);
  return `수령일을 변경하시겠습니까?\n\n기존: ${oldDateStr}\n변경: ${newDateStr}`;
};

export const isPickupDateBeforePostedAt = (pickupDate, postedAt) => {
  if (!pickupDate || !postedAt) return false;
  const pickup = new Date(pickupDate);
  const posted = new Date(postedAt);
  if (Number.isNaN(pickup.getTime()) || Number.isNaN(posted.getTime())) return false;
  return pickup < posted;
};

export const updatePostAndProductPickupDate = async ({
  supabase,
  userId,
  postKey,
  pickupDateISO,
  postId = null,
  updateTimestamp = false,
  updatedAt = null,
}) => {
  if (!supabase) throw new Error("Supabase client is required.");
  if (!userId) throw new Error("사용자 인증 정보를 찾을 수 없습니다.");
  if (!postKey) throw new Error("게시물 정보를 찾을 수 없습니다.");
  if (!pickupDateISO) throw new Error("수령일 정보가 없습니다.");

  const nowIso = updatedAt || (updateTimestamp ? new Date().toISOString() : null);
  const postPayload = { pickup_date: pickupDateISO };
  const productPayload = { pickup_date: pickupDateISO };
  if (nowIso) {
    postPayload.updated_at = nowIso;
    productPayload.updated_at = nowIso;
  }

  let postUpdateQuery = supabase
    .from("posts")
    .update(postPayload)
    .eq("user_id", userId);

  if (postId) {
    postUpdateQuery = postUpdateQuery.eq("post_id", postId);
  } else {
    postUpdateQuery = postUpdateQuery.eq("post_key", postKey);
  }

  const { error: postError } = await postUpdateQuery;
  if (postError) throw postError;

  const { error: productsError } = await supabase
    .from("products")
    .update(productPayload)
    .eq("post_key", postKey)
    .eq("user_id", userId);

  if (productsError) throw productsError;
};
