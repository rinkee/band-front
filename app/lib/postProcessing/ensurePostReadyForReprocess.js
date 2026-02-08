export async function ensurePostReadyForReprocess({
  supabase,
  userId,
  postKey,
  updates,
  fallbackEndpoint = "/api/posts/manual-update"
}) {
  if (!supabase || !userId || !postKey || !updates || typeof updates !== "object") {
    return { success: false, error: "invalid_args" };
  }

  const { error } = await supabase
    .from("posts")
    .update(updates)
    .eq("post_key", postKey)
    .eq("user_id", userId);

  if (!error) {
    return { success: true, usedFallback: false };
  }

  try {
    const { updated_at: _ignoredUpdatedAt, ...fallbackUpdates } = updates;
    if (Object.keys(fallbackUpdates).length === 0) {
      return {
        success: false,
        error: "fallback_updates_empty",
      };
    }

    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userId}`,
      "x-user-id": userId,
    };

    const resp = await fetch(fallbackEndpoint, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ postKey, updates: fallbackUpdates }),
    });
    const result = await resp.json().catch(() => null);

    if (resp.ok && result?.success) {
      return { success: true, usedFallback: true };
    }

    return {
      success: false,
      error: result?.message || error.message || "posts_update_failed"
    };
  } catch (fallbackError) {
    return {
      success: false,
      error: fallbackError?.message || error.message || "posts_update_failed"
    };
  }
}
