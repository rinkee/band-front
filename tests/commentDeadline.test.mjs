import test from "node:test";
import assert from "node:assert/strict";

import {
  isAfterDeadlineLabelOnlyChange,
  resolvePostCloseBoundary
} from "../app/lib/updateButton/fuc/commentDeadline/commentDeadline.js";

test("manual sale reset ignores older close marker comments", () => {
  const boundary = resolvePostCloseBoundary({
    comments: [
      {
        content: "마감된 상품입니다",
        commentKey: "close-old",
        createdAt: "2026-04-24T01:00:00.000Z",
      },
    ],
    existingPost: {
      status: "활성",
      closed_at: null,
      closed_comment_key: null,
      close_detection_reset_at: "2026-04-24T01:01:00.000Z",
    },
  });

  assert.equal(boundary.postUpdate, null);
  assert.equal(boundary.marker, null);
});

test("manual sale reset still allows newer close marker comments", () => {
  const boundary = resolvePostCloseBoundary({
    comments: [
      {
        content: "마감된 상품입니다",
        commentKey: "close-new",
        createdAt: "2026-04-24T01:02:00.000Z",
      },
    ],
    existingPost: {
      status: "활성",
      closed_at: null,
      closed_comment_key: null,
      close_detection_reset_at: "2026-04-24T01:01:00.000Z",
    },
  });

  assert.deepEqual(boundary.postUpdate, {
    status: "마감",
    closed_at: "2026-04-24T01:02:00.000Z",
    closed_comment_key: "close-new",
  });
});

test("deadline label removal is not treated as a user comment edit", () => {
  assert.equal(
    isAfterDeadlineLabelOnlyChange("[품절 이후 댓글] 1", "1"),
    true
  );
  assert.equal(
    isAfterDeadlineLabelOnlyChange("[마감 이후 댓글] 1", "1"),
    true
  );
  assert.equal(
    isAfterDeadlineLabelOnlyChange("[품절 이후 댓글] 1", "2"),
    false
  );
});
