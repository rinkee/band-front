-- RLS (Row Level Security) 정책 설정
-- 이 SQL 스크립트를 Supabase Dashboard에서 실행하거나 
-- supabase db push 명령으로 적용하세요

-- ========================================
-- 1. RLS 활성화
-- ========================================

-- Products 테이블 RLS 활성화
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Posts 테이블 RLS 활성화
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 2. Products 테이블 정책
-- ========================================

-- 모든 사용자가 products 조회 가능 (임시)
-- 추후 사용자별 제한이 필요하면 수정
CREATE POLICY "Anyone can view products"
  ON products
  FOR SELECT
  USING (true);

-- 인증된 사용자만 자신의 products 생성 가능
CREATE POLICY "Users can insert own products"
  ON products
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

-- 사용자는 자신의 products만 수정 가능
CREATE POLICY "Users can update own products"
  ON products
  FOR UPDATE
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- 사용자는 자신의 products만 삭제 가능
CREATE POLICY "Users can delete own products"
  ON products
  FOR DELETE
  USING (auth.uid()::text = user_id);

-- ========================================
-- 3. Posts 테이블 정책
-- ========================================

-- 모든 사용자가 posts 조회 가능 (공개 읽기)
CREATE POLICY "Anyone can view posts"
  ON posts
  FOR SELECT
  USING (true);

-- 인증된 사용자만 posts 생성 가능
CREATE POLICY "Authenticated users can insert posts"
  ON posts
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 인증된 사용자만 posts 수정 가능
CREATE POLICY "Authenticated users can update posts"
  ON posts
  FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 인증된 사용자만 posts 삭제 가능
CREATE POLICY "Authenticated users can delete posts"
  ON posts
  FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- ========================================
-- 4. 정책 확인 쿼리
-- ========================================

-- 적용된 정책 확인
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename IN ('products', 'posts')
ORDER BY tablename, policyname;

-- ========================================
-- 5. 주의사항
-- ========================================
-- 1. 현재 products 정책은 user_id 기반으로 동작
-- 2. auth.uid()가 user_id와 일치해야 함
-- 3. 필요시 더 세밀한 권한 제어 가능
-- 4. Band 멤버십 기반 권한이 필요하면 추가 테이블 조인 필요