import {
  AFTER_DEADLINE_COMMENT_LABEL,
  splitAfterDeadlineComment
} from "../../../deadlineCommentLabels";
import {
  DEFAULT_CLOSE_MARKER_TEXT,
  DEFAULT_CLOSE_MARKER_TEXTS,
  normalizeCloseMarkerTexts
} from "../../../deadlineSettings";
import { POST_STATUS_CLOSED } from "../../../postStatus";

export const CLOSE_MARKER_TEXT = DEFAULT_CLOSE_MARKER_TEXT;
export const CLOSE_MARKER_TEXTS = DEFAULT_CLOSE_MARKER_TEXTS;
export const AFTER_DEADLINE_PREFIX = AFTER_DEADLINE_COMMENT_LABEL;
export const CLOSED_POST_STATUS = POST_STATUS_CLOSED;

const decodeHtmlEntities = (text = "") => {
  if (!text) return "";
  const map = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " "
  };

  let decoded = String(text);
  Object.entries(map).forEach(([entity, char]) => {
    decoded = decoded.replace(new RegExp(entity, "g"), char);
  });
  decoded = decoded.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
  decoded = decoded.replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  return decoded;
};

export const getCommentContentForDeadline = (comment = {}) =>
  comment.content ||
  comment.body ||
  comment.comment ||
  comment.comment_body ||
  "";

export const getCommentKeyForDeadline = (comment = {}) =>
  comment.commentKey ||
  comment.comment_key ||
  comment.band_comment_id ||
  comment.id ||
  null;

export const parseCommentTimestampMs = (value) => {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const getCommentTimestampMsForDeadline = (comment = {}) =>
  parseCommentTimestampMs(
    comment.createdAt ||
      comment.created_at ||
      comment.commented_at ||
      comment.ordered_at ||
      comment.created_at
  );

export const normalizeDeadlineText = (text = "") => {
  const withoutBandTags = decodeHtmlEntities(text)
    .replace(/<band:refer [^>]*>(.*?)<\/band:refer>/gi, "$1")
    .replace(/<band:mention [^>]*>(.*?)<\/band:mention>/gi, "$1")
    .replace(/<band:[^>]*>(.*?)<\/band:[^>]*>/gi, "$1")
    .replace(/<[^>]*>/g, "");

  return withoutBandTags.replace(/\s+/g, " ").trim();
};

const normalizeCloseMarkersForMatch = (closeMarkerTexts) =>
  normalizeCloseMarkerTexts(closeMarkerTexts)
    .map((marker) => normalizeDeadlineText(marker))
    .filter(Boolean);

export const isCloseMarkerComment = (comment = {}, closeMarkerTexts = CLOSE_MARKER_TEXTS) => {
  const normalizedComment = normalizeDeadlineText(getCommentContentForDeadline(comment));
  if (!normalizedComment) return false;

  return normalizeCloseMarkersForMatch(closeMarkerTexts).some((marker) =>
    normalizedComment.includes(marker)
  );
};

export const findEarliestCloseMarker = (
  comments = [],
  closeMarkerTexts = CLOSE_MARKER_TEXTS
) => {
  if (!Array.isArray(comments) || comments.length === 0) return null;
  const normalizedMarkers = normalizeCloseMarkersForMatch(closeMarkerTexts);
  if (normalizedMarkers.length === 0) return null;

  return comments.reduce((earliest, comment) => {
    if (!isCloseMarkerComment(comment, normalizedMarkers)) return earliest;

    const closedAtMs = getCommentTimestampMsForDeadline(comment);
    if (!closedAtMs) return earliest;

    const marker = {
      closedAtMs,
      closedAt: new Date(closedAtMs).toISOString(),
      closedCommentKey: getCommentKeyForDeadline(comment)
    };

    if (!earliest || marker.closedAtMs < earliest.closedAtMs) {
      return marker;
    }

    return earliest;
  }, null);
};

export const mapOrderRowsToDeadlineComments = (rows = []) => {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    content: row.comment || row.comment_body || "",
    commentKey: row.comment_key || row.band_comment_id || null,
    createdAt: row.commented_at || row.ordered_at || row.created_at || null
  }));
};

export const resolvePostCloseBoundary = ({
  comments = [],
  existingPost = {},
  closeMarkerTexts = CLOSE_MARKER_TEXTS
} = {}) => {
  const marker = findEarliestCloseMarker(comments, closeMarkerTexts);
  const existingClosedAtMs = parseCommentTimestampMs(existingPost.closed_at);
  const existingBoundary = existingClosedAtMs
    ? {
        closedAtMs: existingClosedAtMs,
        closedAt: new Date(existingClosedAtMs).toISOString(),
        closedCommentKey: existingPost.closed_comment_key || null
      }
    : null;

  const boundary =
    marker && (!existingBoundary || marker.closedAtMs < existingBoundary.closedAtMs)
      ? marker
      : existingBoundary;

  const shouldUpdatePost = Boolean(
    boundary &&
      (existingPost.status !== CLOSED_POST_STATUS ||
        !existingBoundary ||
        (marker && marker.closedAtMs < existingBoundary.closedAtMs) ||
        (!existingPost.closed_comment_key && boundary.closedCommentKey))
  );

  return {
    ...boundary,
    marker,
    shouldUpdatePost,
    postUpdate: shouldUpdatePost
      ? {
          status: CLOSED_POST_STATUS,
          closed_at: boundary.closedAt,
          closed_comment_key: boundary.closedCommentKey || null
        }
      : null
  };
};

export const isCommentAfterCloseBoundary = (comment = {}, closeBoundary = null) => {
  if (!closeBoundary?.closedAtMs) return false;
  const commentTs = getCommentTimestampMsForDeadline(comment);
  if (!commentTs) return false;
  return commentTs > closeBoundary.closedAtMs;
};

export const withAfterDeadlineFlags = (comments = [], closeBoundary = null) => {
  if (!Array.isArray(comments) || !closeBoundary?.closedAtMs) return comments;

  return comments.map((comment) => ({
    ...comment,
    isAfterDeadline: isCommentAfterCloseBoundary(comment, closeBoundary)
  }));
};

export const prefixAfterDeadlineComment = (commentText = "") => {
  const text = String(commentText || "").trim();
  if (!text) return AFTER_DEADLINE_PREFIX;
  const { hasLabel, body } = splitAfterDeadlineComment(text);
  if (hasLabel) {
    return body ? `${AFTER_DEADLINE_PREFIX} ${body}` : AFTER_DEADLINE_PREFIX;
  }
  return `${AFTER_DEADLINE_PREFIX} ${text}`;
};
