// app/api/fetch-band-posts-server/route.js
// 이 코드는 서버에서 실행됩니다.

import { NextResponse } from "next/server";
import axios from "axios";

// --- 환경 변수 및 상수 설정 ---
// 실제 운영 환경에서는 process.env.BAND_ACCESS_TOKEN 사용 권장
const ACCESS_TOKEN =
  process.env.BAND_ACCESS_TOKEN ||
  "ZQAAAXd7wVrYE_5HVZ9pnUMcPFKkERxAV4w9Ba4QyNwDLnu8hHOKywU39mt8eGgQniqaX55T1bHwOHUS91arPNveTGXvts1yOTRquanOjabjadwB";

const POSTS_API_URL = "https://openapi.band.us/v2/band/posts";
const COMMENTS_API_URL = "https://openapi.band.us/v2/band/post/comments";
const TARGET_POST_COUNT = 100; // 가져올 최대 게시물 수
const POST_PAGE_SIZE = 20; // 게시물 페이징 크기
const COMMENT_PAGE_SIZE = 20; // 댓글 페이징 크기 (첫 페이지만 가져옴)
const CONCURRENT_REQUEST_DELAY = 100; // 병렬 요청 간의 작은 지연 (ms) - API 부하 감소 목적

// --- GET 요청 핸들러 ---
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const bandKey = searchParams.get("bandKey");

  // --- 입력값 및 환경 변수 검증 ---
  if (!ACCESS_TOKEN) {
    console.error("Server Error: BAND_ACCESS_TOKEN is not configured.");
    return NextResponse.json(
      { result_code: -1, message: "Server Access Token is not configured." },
      { status: 500 }
    );
  }
  if (!bandKey) {
    return NextResponse.json(
      { result_code: -1, message: "bandKey parameter is required." },
      { status: 400 }
    );
  }

  // --- 1단계: 게시물 가져오기 ---
  let allPosts = [];
  let currentPostParams = {
    access_token: ACCESS_TOKEN,
    band_key: bandKey,
    limit: POST_PAGE_SIZE,
  };

  console.log(`[Server API] STEP 1: Fetching posts for bandKey: ${bandKey}`);
  try {
    while (allPosts.length < TARGET_POST_COUNT) {
      console.log(
        `[Server API] Fetching posts page... Current count: ${allPosts.length}`
      );
      if (currentPostParams.after)
        console.log(`  - after: ${currentPostParams.after}`);

      const response = await axios.get(POSTS_API_URL, {
        params: currentPostParams,
      });
      const data = response.data;

      if (data.result_code !== 1) {
        console.error("[Server API] Band API (Posts) error:", data);
        return NextResponse.json(data, { status: 500 });
      }

      const fetchedItems = data.result_data?.items || [];
      if (fetchedItems.length === 0) break; // 더 이상 가져올 게시물 없음

      allPosts.push(...fetchedItems);
      console.log(
        `  - Fetched ${fetchedItems.length} posts. Total: ${allPosts.length}`
      );

      const paging = data.result_data?.paging || {};
      const nextParams = paging.next_params;
      if (
        allPosts.length >= TARGET_POST_COUNT ||
        !nextParams ||
        Object.keys(nextParams).length === 0
      )
        break; // 목표 도달 또는 마지막 페이지

      currentPostParams = nextParams;
      await new Promise((resolve) =>
        setTimeout(resolve, CONCURRENT_REQUEST_DELAY)
      ); // 게시물 페이지 요청 간 지연
    }
  } catch (error) {
    console.error("[Server API] Error fetching posts:", error);
    return NextResponse.json(
      { message: "Error fetching posts from Band API." },
      { status: 500 }
    );
  }

  // 목표 개수로 자르기
  const finalPosts = allPosts.slice(0, TARGET_POST_COUNT);
  console.log(
    `[Server API] STEP 1 Complete. Total posts fetched: ${finalPosts.length}`
  );

  // --- 2단계: 각 게시물의 댓글 가져오기 (병렬 처리) ---
  console.log(
    `[Server API] STEP 2: Fetching comments for ${finalPosts.length} posts...`
  );

  const fetchCommentPromises = finalPosts.map((post) => {
    const commentParams = {
      access_token: ACCESS_TOKEN,
      band_key: bandKey, // post.band_key 를 사용해도 되지만, 일관성을 위해 bandKey 사용
      post_key: post.post_key,
      limit: COMMENT_PAGE_SIZE, // 첫 페이지만 가져오기
    };
    // 각 댓글 요청에 약간의 지연 추가 (선택적, 동시 요청 분산 목적)
    return new Promise((resolve) =>
      setTimeout(resolve, Math.random() * CONCURRENT_REQUEST_DELAY)
    )
      .then(() => axios.get(COMMENTS_API_URL, { params: commentParams }))
      .then((response) => {
        if (response.data.result_code === 1) {
          return {
            post_key: post.post_key,
            comments: response.data.result_data?.items || [],
          };
        } else {
          console.warn(
            `[Server API] Failed to fetch comments for post ${post.post_key}. Error:`,
            response.data
          );
          return {
            post_key: post.post_key,
            comments: [],
            error: response.data.message || "Failed to fetch comments",
          }; // 오류 발생 시 빈 배열 반환
        }
      })
      .catch((error) => {
        console.error(
          `[Server API] Error fetching comments for post ${post.post_key}:`,
          error.message
        );
        return {
          post_key: post.post_key,
          comments: [],
          error: "Network or server error fetching comments",
        }; // 네트워크/axios 오류 시
      });
  });

  try {
    // 모든 댓글 요청이 완료될 때까지 기다림
    const commentResults = await Promise.all(fetchCommentPromises);

    // 가져온 댓글들을 원래 게시물 객체에 추가
    const postsWithComments = finalPosts.map((post) => {
      const result = commentResults.find(
        (res) => res.post_key === post.post_key
      );
      return {
        ...post, // 기존 게시물 정보 복사
        fetched_comments: result ? result.comments : [], // 가져온 댓글 추가 (없거나 오류 시 빈 배열)
        comment_error: result?.error, // 댓글 가져오기 실패 시 에러 메시지 추가 (선택 사항)
      };
    });

    console.log(`[Server API] STEP 2 Complete. Finished fetching comments.`);
    // 댓글이 추가된 최종 데이터를 클라이언트에 응답
    return NextResponse.json(postsWithComments);
  } catch (error) {
    console.error(
      "[Server API] Error processing comment fetching promises:",
      error
    );
    // 댓글 처리 중 에러 발생 시 (Promise.all 실패 등), 일단 게시물 데이터만이라도 반환할 수 있음
    // return NextResponse.json(finalPosts); // 또는 오류 응답
    return NextResponse.json(
      { message: "Error processing comments." },
      { status: 500 }
    );
  }
}
