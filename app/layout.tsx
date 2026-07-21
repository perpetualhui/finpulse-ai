import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://finpulse-ai.pages.dev"),
  title: "财智雷达 · 财务 AI 情报聚合器",
  description: "每周聚合中国公司与英文补充信源中的财务 AI、财务共享、流程升级与风险合规动态，并生成面向财务人的行动解读。",
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
