"use client";

import { splitAfterDeadlineComment } from "../lib/deadlineCommentLabels";

export default function DeadlineCommentText({
  text,
  fallback = "-",
  className = "",
  labelClassName = "text-red-600 font-bold mr-1",
  bodyClassName = ""
}) {
  const value = text === undefined || text === null ? "" : String(text);
  if (!value) return fallback;

  const { hasLabel, label, body } = splitAfterDeadlineComment(value);
  if (!hasLabel) {
    return <span className={className}>{value}</span>;
  }

  return (
    <span className={className}>
      <span className={labelClassName}>{label}</span>
      {body ? <span className={bodyClassName}>{body}</span> : null}
    </span>
  );
}
