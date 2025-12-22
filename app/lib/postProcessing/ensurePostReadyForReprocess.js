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
    const resp = await fetch(fallbackEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, postKey, updates })
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
