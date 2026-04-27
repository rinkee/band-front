ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS close_detection_reset_at timestamp with time zone;

COMMENT ON COLUMN public.posts.close_detection_reset_at IS
  '게시물을 판매중으로 되돌린 시각입니다. 이 시각 이전의 품절 처리 댓글은 자동 품절 감지에서 무시합니다.';
