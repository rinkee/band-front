ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS closed_comment_key text;

COMMENT ON COLUMN public.posts.closed_at IS
  'Band 댓글에서 마감 문구가 감지된 실제 댓글 작성 시각입니다.';

COMMENT ON COLUMN public.posts.closed_comment_key IS
  '게시물을 마감 상태로 만든 Band 댓글 key입니다.';

CREATE INDEX IF NOT EXISTS idx_posts_user_status_closed_at
  ON public.posts USING btree (user_id, status, closed_at DESC)
  WHERE closed_at IS NOT NULL;
