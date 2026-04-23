export const POST_STATUS_ACTIVE = "활성";
export const POST_STATUS_CLOSED = "마감";
export const POST_STATUS_ACTIVE_LABEL = "판매중";
export const POST_STATUS_CLOSED_LABEL = "품절";

export const getDisplayPostStatus = (status) => {
  if (!status || status === POST_STATUS_ACTIVE) return POST_STATUS_ACTIVE_LABEL;
  if (status === POST_STATUS_CLOSED) return POST_STATUS_CLOSED_LABEL;
  return status;
};

export const isClosedPostStatus = (status) => status === POST_STATUS_CLOSED;
