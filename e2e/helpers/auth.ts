import type { Page } from "@playwright/test";
import { e2eCredentials } from "./env";

export async function loginWithEmail(page: Page): Promise<void> {
  const creds = e2eCredentials();
  if (!creds) {
    throw new Error("E2E_EMAIL and E2E_PASSWORD are required for this test");
  }

  await page.goto("/login");
  await page.getByTestId("login-email").fill(creds.email);
  await page.getByTestId("login-password").fill(creds.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/app/, { timeout: 60_000 });
}

export async function ensureInApp(page: Page): Promise<void> {
  if (!page.url().includes("/app")) {
    await loginWithEmail(page);
  }
}
