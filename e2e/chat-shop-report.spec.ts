import { expect, test } from "@playwright/test";
import { FIXTURE, vinLast8 } from "./fixtures/test-data";
import { loginWithEmail } from "./helpers/auth";
import { hasE2eCredentials, shouldMockAi } from "./helpers/env";
import { mockAiRoutes } from "./helpers/mock-ai";

test.describe("Chat + Shop Report P0", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasE2eCredentials(), "Set E2E_EMAIL and E2E_PASSWORD");
    if (shouldMockAi()) {
      await mockAiRoutes(page);
    }
    await loginWithEmail(page);
  });

  test("chat DTC + shop report generate → download + copy link", async ({
    page,
  }) => {
    await page.goto("/app?tab=chat");
    await expect(page.getByTestId("chat-input")).toBeVisible({
      timeout: 45_000,
    });

    // Enter fault code
    await page.getByTestId("dtc-enter-code").click();
    await page.getByTestId("dtc-input").fill(FIXTURE.dtc);
    await page.getByTestId("dtc-submit").click();

    // Wait for user bubble or mocked assistant
    await expect(
      page.getByText(new RegExp(FIXTURE.dtc, "i")).first(),
    ).toBeVisible({ timeout: shouldMockAi() ? 20_000 : 120_000 });

    // Extra symptom for shop-report hasEnoughData
    await page.getByTestId("chat-input").fill(FIXTURE.symptom);
    await page.getByTestId("chat-send").click();
    await page.waitForTimeout(shouldMockAi() ? 800 : 5_000);

    const openReport = page
      .getByTestId("shop-report-open-desktop")
      .or(page.getByTestId("shop-report-open"));
    await openReport.first().click();
    await expect(page.getByRole("heading", { name: /Generate Shop Report/i })).toBeVisible();

    await page.getByTestId("shop-report-generate").click();
    await expect(page.getByTestId("shop-report-download")).toBeVisible({
      timeout: shouldMockAi() ? 20_000 : 120_000,
    });
    await expect(page.getByTestId("shop-report-copy-link")).toBeEnabled();

    await page.getByTestId("shop-report-copy-link").click();
    await expect(page.getByRole("button", { name: /Copied/i })).toBeVisible({
      timeout: 5_000,
    });

    const publicUrl = await page
      .locator("p.break-all")
      .filter({ hasText: "/r/" })
      .textContent();
    expect(publicUrl).toMatch(/\/r\//);

    // Settings history list
    await page.goto("/app?tab=settings");
    await expect(page.getByTestId("shop-reports-list")).toBeVisible({
      timeout: 30_000,
    });
    // Mocked generate does not archive — list may be empty when mocked
    if (!shouldMockAi()) {
      await expect(page.getByTestId("shop-report-view").first()).toBeVisible({
        timeout: 20_000,
      });
    }
  });

  test("public /r page masks VIN and shows friendly missing state", async ({
    page,
  }) => {
    // Missing token — friendly UI (no crash)
    await page.goto("/r/not-a-real-token-xxxxxx");
    await expect(page.getByTestId("shop-report-public-error")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Report not found/i })).toBeVisible();

    // Live archive path only when AI is not mocked (real public_token in DB)
    test.skip(
      shouldMockAi(),
      "Public report content requires E2E_MOCK_AI=0 so generate archives to Supabase",
    );

    await page.goto("/app?tab=chat");
    await page.getByTestId("dtc-enter-code").click();
    await page.getByTestId("dtc-input").fill(FIXTURE.dtc);
    await page.getByTestId("dtc-submit").click();
    await expect(page.getByText(new RegExp(FIXTURE.dtc, "i")).first()).toBeVisible({
      timeout: 120_000,
    });

    await page
      .getByTestId("shop-report-open-desktop")
      .or(page.getByTestId("shop-report-open"))
      .first()
      .click();
    await page.getByTestId("shop-report-generate").click();
    await expect(page.getByTestId("shop-report-copy-link")).toBeEnabled({
      timeout: 120_000,
    });

    const url = await page
      .locator("p.break-all")
      .filter({ hasText: "/r/" })
      .textContent();
    expect(url).toBeTruthy();

    await page.goto(url!.trim());
    await expect(page.getByTestId("shop-report-public")).toBeVisible({
      timeout: 30_000,
    });
    const last8 = vinLast8(FIXTURE.vehicle.vin);
    await expect(page.getByText(new RegExp(`VIN …${last8}`))).toBeVisible();
    await expect(page.getByText(FIXTURE.vehicle.vin)).toHaveCount(0);
  });
});
