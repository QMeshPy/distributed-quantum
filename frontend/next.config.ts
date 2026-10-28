import path from "node:path";

import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  async rewrites() {
    return [{source: "/sheets-engine/:path*", destination: `${process.env.SPREADSHEET_GATEWAY_URL || "http://127.0.0.1:8002"}/sheets-engine/:path*`}];
  },
  turbopack: {
    root: path.join(__dirname, ".."),
  },
  transpilePackages: ["ngl", "openchemlib"],
  experimental: {
    optimizePackageImports: ["@radix-ui/react-icons", "lucide-react", "recharts"],
  },
};

export default withBundleAnalyzer(nextConfig);
