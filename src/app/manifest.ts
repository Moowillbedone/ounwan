import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "오운완 — 오늘 운동 완료",
    short_name: "오운완",
    description: "가장 빠른 세트 입력과 잔디 캘린더로 만드는 운동 습관.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0e13",
    theme_color: "#0a0e13",
    categories: ["health", "fitness", "lifestyle"],
    lang: "ko",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
