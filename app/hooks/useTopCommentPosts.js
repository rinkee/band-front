import { useEffect } from "react";
import useSWRInfinite from "swr/infinite";
import supabase from "../lib/supabaseClient";

const resolveDateRange = (dateRange, startDate, endDate) => {
  const toDate = new Date();
  toDate.setHours(23, 59, 59, 999);
  let fromDate = new Date(toDate);

  if (dateRange === "custom" && startDate && endDate) {
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return {
        from: start.toISOString(),
        to: end.toISOString(),
      };
    } catch (_) {
      // fallback to default range
    }
  }

  const daysMap = { today: 0, "7days": 7, "30days": 30, "90days": 90 };
  const days = daysMap[dateRange] ?? 30;
  fromDate.setDate(fromDate.getDate() - days);
  fromDate.setHours(0, 0, 0, 0);

  return {
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
  };
};

export function useTopCommentPosts(userId, filters = {}, swrOptions = {}) {
  const {
    dateRange = "30days",
    startDate,
    endDate,
    limit = 10,
  } = filters;
  const limitValue = Number(limit) || 10;

  const getKey = (pageIndex, previousPageData) => {
    if (!userId) return null;
    if (previousPageData && previousPageData.length < limitValue) return null;
    return [
      "topCommentPosts",
      userId,
      dateRange,
      startDate || "",
      endDate || "",
      limitValue,
      pageIndex,
    ];
  };

  const fetcher = async (key) => {
    const [, targetUserId, rangeType, start, end, pageLimit, pageIndex] = key;
    const { from, to } = resolveDateRange(rangeType, start, end);
    const limitValue = Number(pageLimit) || 10;
    const fromIndex = pageIndex * limitValue;
    const toIndex = fromIndex + limitValue - 1;

    const { data, error } = await supabase
      .from("posts")
      .select(
        "post_id, post_key, title, comment_count, posted_at, image_urls, photos_data, band_post_url"
      )
      .eq("user_id", targetUserId)
      .eq("is_product", true)
      .gte("posted_at", from)
      .lte("posted_at", to)
      .order("comment_count", { ascending: false, nullsFirst: false })
      .order("posted_at", { ascending: false })
      .range(fromIndex, toIndex);

    if (error) {
      throw error;
    }

    return data || [];
  };

  const {
    data,
    error,
    size,
    setSize,
    isValidating,
  } = useSWRInfinite(getKey, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 10000,
    ...swrOptions,
  });

  useEffect(() => {
    if (!userId) return;
    setSize(1);
  }, [userId, dateRange, startDate, endDate, limitValue, setSize]);

  const pages = Array.isArray(data) ? data : [];
  const posts = pages.flat();
  const isLoading = !!userId && pages.length === 0 && !error;
  const lastPage = pages.length > 0 ? pages[pages.length - 1] : [];
  const isReachingEnd = pages.length > 0 ? lastPage.length < limitValue : false;
  const isLoadingMore =
    isValidating && (pages.length === 0 || size > pages.length);

  const loadMore = () => setSize(size + 1);

  return {
    posts,
    error,
    isLoading,
    isLoadingMore,
    isReachingEnd,
    loadMore,
  };
}

export default useTopCommentPosts;
