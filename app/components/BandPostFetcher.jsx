"use client";

import { useState } from "react";

export default function BandPostFetcher() {
  const [posts, setPosts] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const USER_ID = "f2daf0ee-fdb4-4c04-bcc4-6669a30d7d35";
  const BAND_KEY = "82443310";
  const PAGE_SIZE = 50;

  const fetchPosts = async () => {
    setLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams({
        userId: USER_ID,
        bandKey: BAND_KEY,
        size: PAGE_SIZE.toString(),
      });
      if (cursor) query.set("afterPostId", cursor);

      const res = await fetch(`/api/band/posts?${query.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      setPosts(json.posts || []);
      setCursor(json.nextPostSeq || null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <button
        onClick={fetchPosts}
        disabled={loading}
        style={{ padding: 8, fontSize: 16, marginBottom: 12 }}
      >
        {loading ? "불러오는 중…" : "새 게시물 불러오기"}
      </button>

      {error && <div style={{ color: "red" }}>에러: {error.message}</div>}

      <ul>
        {posts.map((post) => (
          <li key={post.postSeq} style={{ marginBottom: 8 }}>
            <strong>{new Date(post.createdAt).toLocaleString()}</strong>
            <br />#{post.postSeq} — {post.content.slice(0, 100)}
            {post.content.length > 100 && "…"}
          </li>
        ))}
      </ul>

      {posts.length === PAGE_SIZE && !loading && (
        <button onClick={fetchPosts} style={{ padding: 6, fontSize: 14 }}>
          다음 {PAGE_SIZE}개 불러오기
        </button>
      )}
    </div>
  );
}
