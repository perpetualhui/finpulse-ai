import type { NextConfig } from "next";

const basePath = process.env.PAGES_BASE_PATH ?? "";
const isPagesBuild = process.env.GITHUB_PAGES_BUILD === "1" || Boolean(basePath);

const nextConfig: NextConfig = {
  ...(isPagesBuild ? { output: "export" as const, trailingSlash: true } : {}),
  basePath: isPagesBuild ? basePath : undefined,
  assetPrefix: isPagesBuild && basePath ? basePath : undefined,
  images: { unoptimized: true },
};

export default nextConfig;
