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
    // Native shell opens login (not marketing landing) so App Store review
    // never screenshots "Start free" / "14-day Pro trial" on first paint.
    url:
      process.env.CAPACITOR_SERVER_URL ||
      "https://garagegenius.cloud/login?next=/app",
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
      // Keep short; JS also calls SplashScreen.hide() on login / AuthGate
      launchShowDuration: 800,
      launchAutoHide: true,
      launchFadeOutDuration: 250,
      backgroundColor: "#0a0f1c",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    Browser: {
      // Used for Restore/manage fallbacks and non-iOS OAuth. iOS Sign in with Apple
      // uses native ASAuthorization — do not open Apple login in an in-app Browser.
    },
  },
  ios: {
    scheme: "Garage Genius AI",
    // Avoid automatic white inset banding behind the dark WebView
    contentInset: "never",
    backgroundColor: "#0a0f1c",
    appendUserAgent: "GarageGeniusNative",
    // Custom URL scheme for OAuth / deep links (also register Universal Links).
    // Associated Domains configured in Xcode: applinks:garagegenius.cloud
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0a0f1c",
    appendUserAgent: "GarageGeniusNative",
  },
  // Also used by some Cap hosts when platform-specific bg is missing
  backgroundColor: "#0a0f1c",
};

export default config;
