import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 순수 클라이언트 SPA로 정적 익스포트 → 서버 의존 없이 오프라인/설치형 PWA에 견고
  output: "export",
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
};

export default nextConfig;
