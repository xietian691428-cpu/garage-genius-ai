import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shell loads the production Next.js app (SSR) over HTTPS.
 * `webDir` is only a local fallback splash when the remote URL is unreachable.
 *
 * App Store / Play: do NOT route digital Pro/token purchases through Stripe
 * inside the WebView — see docs/STORE_LAUNCH.md (IAP path).
 */
const config: CapacitorConfig = {
  appId: "com.garagegenius.ai",
  appName: "Garage Genius AI",
  webDir: "native-shell/www",
  server: {
    // Production Web app. Override at build time if needed.
    url: process.env.CAPACITOR_SERVER_URL || "https://garagegenius.cloud",
    cleartext: false,
    allowNavigation: [
      "garagegenius.cloud",
      "*.garagegenius.cloud",
      "*.supabase.co",
      "accounts.google.com",
      "appleid.apple.com",
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      launchFadeOutDuration: 300,
      backgroundColor: "#0a0f1c",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
  ios: {
    scheme: "Garage Genius AI",
    contentInset: "automatic",
    // Custom URL scheme for OAuth / deep links (also register Universal Links).
    // Associated Domains configured in Xcode: applinks:garagegenius.cloud
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0a0f1c",
  },
};

export default config;
