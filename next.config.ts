import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep node:sqlite / native sqlite out of the bundler
  serverExternalPackages: [],
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
