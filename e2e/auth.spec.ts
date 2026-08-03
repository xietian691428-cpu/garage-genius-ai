import { expect, test } from "@playwright/test";
import { loginWithEmail } from "./helpers/auth";
import { hasE2eCredentials } from "./helpers/env";

test.describe("Auth P0", () => {
  test("unauthenticated /app redirects to login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/app");
    // AuthGate is client-side (localStorage session) — wait for gate, not middleware.
    await expect(
      page
        .getByText(/Redirecting to sign in|Sign in/i)
        .or(page.getByTestId("login-submit")),
    ).toBeVisible({ timeout: 45_000 });
    await expect(page).toHaveURL(/\/login/, { timeout: 45_000 });
    await expect(page.getByTestId("login-submit")).toBeVisible();
  });

  test("login succeeds and lands on main app", async ({ page }) => {
    test.skip(!hasE2eCredentials(), "Set E2E_EMAIL and E2E_PASSWORD");
    await loginWithEmail(page);
    await expect(page).toHaveURL(/\/app/);
    // Shell or onboarding — either means auth gate passed
    await expect(
      page
        .getByText(/Vehicle Dashboard|Add your first vehicle|Welcome|AI Assistant|Home/i)
        .first(),
    ).toBeVisible({ timeout: 45_000 });
  });
});
