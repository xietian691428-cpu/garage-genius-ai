/**
 * Native Sign in with Apple (ASAuthorization) — iOS Capacitor only.
 * Do not use Supabase PKCE + in-app Browser on iPad; that caused
 * "code challenge does not match previously saved code verifier".
 */

import { supabase } from "@/lib/supabase";
import { generateRawNonce, sha256Hex } from "@/lib/apple-nonce";

export function shouldUseNativeAppleSignIn(input: {
  nativeCapacitor: boolean;
  platform: "ios" | "android" | "web";
}): boolean {
  return input.nativeCapacitor && input.platform === "ios";
}

export function isGoogleOAuthButtonVisible(input: {
  googleEnabled: boolean;
  nativeIos: boolean;
}): boolean {
  return input.googleEnabled && !input.nativeIos;
}

export function isNativeAppleCancelError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const rec = err as { code?: string; message?: string };
  if (rec.code === "SIGN_IN_CANCELED") return true;
  return /cancel/i.test(rec.message ?? "");
}

export async function signInWithNativeApple(): Promise<void> {
  const rawNonce = generateRawNonce();
  const hashedNonce = await sha256Hex(rawNonce);

  const { AppleSignIn, SignInScope } = await import(
    "@capawesome/capacitor-apple-sign-in"
  );

  let idToken: string;
  try {
    const result = await AppleSignIn.signIn({
      nonce: hashedNonce,
      scopes: [SignInScope.Email, SignInScope.FullName],
    });
    idToken = result.idToken;
  } catch (err) {
    if (isNativeAppleCancelError(err)) {
      throw new Error("Sign in cancelled.");
    }
    throw err;
  }

  if (!idToken) {
    throw new Error(
      "Apple did not return an identity token. Please try again or use email.",
    );
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: idToken,
    nonce: rawNonce,
  });
  if (error) throw error;
}
