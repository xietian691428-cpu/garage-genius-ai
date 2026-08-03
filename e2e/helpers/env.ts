export function e2eCredentials(): { email: string; password: string } | null {
  const email = process.env.E2E_EMAIL?.trim();
  const password = process.env.E2E_PASSWORD?.trim();
  if (!email || !password) return null;
  return { email, password };
}

export function hasE2eCredentials(): boolean {
  return e2eCredentials() != null;
}

/** Default true — mock DeepSeek / chat + shop-report generate for CI stability. */
export function shouldMockAi(): boolean {
  const v = process.env.E2E_MOCK_AI?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}
