import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep node:sqlite / native sqlite out of the bundler
  serverExternalPackages: [],
  // Mirror Vercel deploy env for client bundles (QA unlock hard-block).
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "",
  },
  async headers() {
    return [
      {
        source: "/.well-known/apple-app-site-association",
        headers: [
          { key: "Content-Type", value: "application/json" },
        ],
      },
      {
        source: "/.well-known/assetlinks.json",
        headers: [
          { key: "Content-Type", value: "application/json" },
        ],
      },
    ];
  },
};

export default nextConfig;
