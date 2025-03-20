import "./globals.css";

export const metadata = {
  title: "밴드 크롤러 테스트",
  description: "네이버 밴드 크롤러 테스트 애플리케이션",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className="text-black">
        <main>{children}</main>
      </body>
    </html>
  );
}
