import { expect, test } from "@playwright/test";
import { FIXTURE, vinLast8 } from "./fixtures/test-data";
import { loginWithEmail } from "./helpers/auth";
import { hasE2eCredentials, shouldMockAi } from "./helpers/env";
import { mockAiRoutes } from "./helpers/mock-ai";
import { openChatComposerTools, openShopReportModal } from "./helpers/ui";

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
    await expect(page.getByTestId("chat-input")).toBeEnabled({
      timeout: 45_000,
    });
    // Let cloud chat hydrate finish so it cannot wipe the turns we send next.
    await page.waitForTimeout(1_500);

    await openChatComposerTools(page);
    await page.getByTestId("dtc-enter-code").click();
    await page.getByTestId("dtc-input").fill(FIXTURE.dtc);
    await page.getByTestId("dtc-submit").click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });

    await expect(
      page.getByText(new RegExp(FIXTURE.dtc, "i")).first(),
    ).toBeVisible({ timeout: shouldMockAi() ? 20_000 : 120_000 });

    if (shouldMockAi()) {
      await expect(page.getByText("E2E_MOCK_CHAT_OK").first()).toBeVisible({
        timeout: 20_000,
      });
    } else {
      await expect(
        page.getByText(/catalyst|fault code|DIY|diagnosis/i).first(),
      ).toBeVisible({ timeout: 120_000 });
    }

    await expect(page.getByTestId("chat-input")).toBeEnabled({
      timeout: 30_000,
    });
    await page.getByTestId("chat-input").fill(FIXTURE.symptom);
    await page.getByTestId("chat-send").click();
    await expect(
      page.getByText(FIXTURE.symptom.slice(0, 32)).first(),
    ).toBeVisible({ timeout: 15_000 });

    if (shouldMockAi()) {
      await expect(page.getByText("E2E_MOCK_CHAT_OK").nth(1)).toBeVisible({
        timeout: 20_000,
      });
    }

    await openShopReportModal(page);
    await expect(page.getByTestId("shop-report-generate")).toBeEnabled({
      timeout: 15_000,
    });
    await page.getByTestId("shop-report-generate").click();
    await expect(page.getByTestId("shop-report-download")).toBeVisible({
      timeout: shouldMockAi() ? 20_000 : 120_000,
    });
    await expect(page.getByTestId("shop-report-copy-link")).toBeEnabled();

    await page.getByTestId("shop-report-copy-link").click();
    await expect(page.getByText(/Link copied/i).first()).toBeVisible({
      timeout: 8_000,
    });

    const publicUrl = await page
      .locator("p.break-all")
      .filter({ hasText: "/r/" })
      .textContent();
    expect(publicUrl).toMatch(/\/r\//);

    await page.goto("/app?tab=settings");
    await expect(page.getByTestId("shop-reports-list")).toBeVisible({
      timeout: 30_000,
    });
    if (!shouldMockAi()) {
      await expect(page.getByTestId("shop-report-view").first()).toBeVisible({
        timeout: 20_000,
      });
    }
  });

  test("public /r page masks VIN and shows friendly missing state", async ({
    page,
  }) => {
    await page.goto("/r/not-a-real-token-xxxxxx");
    await expect(page.getByTestId("shop-report-public-error")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Report not found/i }),
    ).toBeVisible();

    test.skip(
      shouldMockAi(),
      "Public report content requires E2E_MOCK_AI=0 so generate archives to Supabase",
    );

    await page.goto("/app?tab=chat");
    await openChatComposerTools(page);
    await page.getByTestId("dtc-enter-code").click();
    await page.getByTestId("dtc-input").fill(FIXTURE.dtc);
    await page.getByTestId("dtc-submit").click();
    await expect(
      page.getByText(new RegExp(FIXTURE.dtc, "i")).first(),
    ).toBeVisible({ timeout: 120_000 });

    await openShopReportModal(page);
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
