import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep node:sqlite / native sqlite out of the bundler
  serverExternalPackages: [],
};

export default nextConfig;
