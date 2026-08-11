/**
 * Hide Capacitor splash so it never covers the login form on iPad/iPhone.
 */
import { isNativeCapacitor } from "@/lib/native-platform";

export async function hideNativeSplash(): Promise<void> {
  if (!isNativeCapacitor()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    /* plugin missing — ignore */
  }
}
