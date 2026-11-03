import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Capacitor BLE plugin (client-only; needed so Next can resolve its ESM)
  transpilePackages: ["@capacitor-community/bluetooth-le"],
  // Keep node:sqlite / native sqlite out of the bundler.
  // pdf-parse/pdfjs must stay external so the Node worker resolves to the real
  // package file (Turbopack fake-worker path breaks otherwise).
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
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
