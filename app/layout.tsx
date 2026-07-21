import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://finpulse-ai.pages.dev"),
  title: "财智雷达 · 财务 AI 情报聚合器",
  description: "每周聚合中国公司、财新、财联社及主要财经媒体的财务与金融信息，以中文为主、英文原始信源为补充。",
  keywords: ["财务AI", "财务共享", "智能财务", "财务自动化", "AI工具", "FP&A"],
  openGraph: {
    title: "财智雷达 · 财务 AI 情报聚合器",
    description: "追踪财务被 AI 重写的每一步。",
    type: "website",
    locale: "zh_CN",
    images: [{ url: "/og.png", width: 1746, height: 909, alt: "财智雷达 · 财务 AI 情报聚合器" }],
  },
  twitter: {
    card: "summary",
    title: "财智雷达 · 财务 AI 情报聚合器",
    description: "追踪财务被 AI 重写的每一步。",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
