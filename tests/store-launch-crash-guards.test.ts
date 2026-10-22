import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("store launch crash guards", () => {
  it("Android splash theme hands off to AppTheme and installs SplashScreen before EdgeToEdge", () => {
    const styles = readFileSync(
      "android/app/src/main/res/values/styles.xml",
      "utf8",
    );
    expect(styles).toMatch(/parent="Theme\.SplashScreen"/);
    expect(styles).toMatch(/postSplashScreenTheme">@style\/AppTheme\.NoActionBar</);
    expect(styles).toMatch(/windowSplashScreenBackground/);
    expect(styles).toMatch(/windowSplashScreenAnimatedIcon/);

    const colors = readFileSync(
      "android/app/src/main/res/values/colors.xml",
      "utf8",
    );
    expect(colors).toMatch(/name="colorPrimary"/);
    expect(colors).toMatch(/name="splash_background"/);

    const main = readFileSync(
      "android/app/src/main/java/com/garagegenius/ai/MainActivity.java",
      "utf8",
    );
    expect(main).toMatch(
      /SplashScreen\.installSplashScreen\(this\);\s*EdgeToEdge\.enable\(this\);\s*super\.onCreate\(savedInstanceState\);/s,
    );
    expect(main).toContain("registerPlugin(ObdClassicBluetoothPlugin.class)");
  });

  it("Android R8 keeps Capacitor plugins and classic OBD plugin", () => {
    const proguard = readFileSync("android/app/proguard-rules.pro", "utf8");
    expect(proguard).toMatch(/com\.getcapacitor\.Plugin/);
    expect(proguard).toMatch(/ObdClassicBluetoothPlugin/);
    expect(proguard).toMatch(/ee\.forgr\.nativepurchases/);
    expect(proguard).toMatch(/com\.capacitorjs\.community\.plugins/);
  });

  it("iOS requires arm64, ships PrivacyInfo, and enables In-App Purchase capability", () => {
    const plist = readFileSync("ios/App/App/Info.plist", "utf8");
    expect(plist).toMatch(/<string>arm64<\/string>/);
    expect(plist).not.toMatch(/<string>armv7<\/string>/);
    expect(plist).toMatch(/NSBluetoothAlwaysUsageDescription/);

    const privacy = readFileSync("ios/App/App/PrivacyInfo.xcprivacy", "utf8");
    expect(privacy).toMatch(/NSPrivacyAccessedAPITypes/);

    const pbx = readFileSync("ios/App/App.xcodeproj/project.pbxproj", "utf8");
    expect(pbx).toMatch(/MARKETING_VERSION = 1\.0\.4;/);
    expect(pbx).toMatch(/CURRENT_PROJECT_VERSION = 14;/);
    expect(pbx).toMatch(/com\.apple\.InAppPurchase/);
    expect(pbx).toMatch(/PrivacyInfo\.xcprivacy in Resources/);
  });

  it("Android store binary version is 1.0.4 (14)", () => {
    const gradle = readFileSync("android/app/build.gradle", "utf8");
    expect(gradle).toMatch(/versionCode 14/);
    expect(gradle).toMatch(/versionName "1\.0\.4"/);
  });
});
