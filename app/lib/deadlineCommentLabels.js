export const AFTER_DEADLINE_COMMENT_LABEL = "[품절 이후 댓글]";

const LEGACY_AFTER_DEADLINE_COMMENT_LABELS = ["[마감 이후 댓글]"];

export const findAfterDeadlineCommentLabel = (text = "") => {
  const value = String(text || "");
  return [AFTER_DEADLINE_COMMENT_LABEL, ...LEGACY_AFTER_DEADLINE_COMMENT_LABELS].find(
    (label) => value.startsWith(label)
  ) || "";
};

export const hasAfterDeadlineCommentLabel = (text = "") =>
  Boolean(findAfterDeadlineCommentLabel(text));

export const splitAfterDeadlineComment = (text = "") => {
  const value = String(text || "");
  const matchedLabel = findAfterDeadlineCommentLabel(value);
  if (!matchedLabel) {
    return {
      hasLabel: false,
      label: "",
      body: value
    };
  }

  return {
    hasLabel: true,
    label: AFTER_DEADLINE_COMMENT_LABEL,
    body: value.slice(matchedLabel.length).trimStart()
  };
};
