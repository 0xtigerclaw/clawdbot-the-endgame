import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@resvg/resvg-js"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
