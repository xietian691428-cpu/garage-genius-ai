import { expect, test } from "@playwright/test";
import { FIXTURE } from "./fixtures/test-data";
import { loginWithEmail } from "./helpers/auth";
import { hasE2eCredentials } from "./helpers/env";

test.describe("Vehicle + OBD settings P0", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasE2eCredentials(), "Set E2E_EMAIL and E2E_PASSWORD");
    await loginWithEmail(page);
  });

  test("add vehicle with plate appears in garage", async ({ page }) => {
    // Finish onboarding if empty garage
    const onboardingManual = page.getByText(/Catalog offline|Enter manually/i);
    if (await onboardingManual.isVisible().catch(() => false)) {
      await onboardingManual.click();
      await page.getByPlaceholder("Make").fill(FIXTURE.vehicle.make);
      await page.getByPlaceholder("Model").fill(FIXTURE.vehicle.model);
      await page.getByPlaceholder("Engine").fill(FIXTURE.vehicle.engine);
      await page.getByRole("button", { name: /Save|Continue|Finish|Add/i }).first().click();
      await page.waitForTimeout(1500);
    }

    await page.goto("/app?tab=dashboard");
    await page.getByTestId("add-vehicle-open").first().click();
    await expect(page.getByTestId("add-vehicle-dialog")).toBeVisible();

    await page.getByTestId("vehicle-nickname").fill(FIXTURE.vehicle.nickname);
    await page.getByTestId("vehicle-mileage").fill(FIXTURE.vehicle.mileage);

    const manualSummary = page.getByText("Or enter manually");
    await manualSummary.click();
    await page.getByTestId("vehicle-manual-make").fill(FIXTURE.vehicle.make);
    await page.getByTestId("vehicle-manual-model").fill(FIXTURE.vehicle.model);
    await page.getByTestId("vehicle-manual-engine").fill(FIXTURE.vehicle.engine);

    const ids = page.getByText(/Identifiers/i);
    await ids.click();
    await page.getByTestId("vehicle-license-plate").fill(FIXTURE.vehicle.plate);
    await page.getByTestId("vehicle-vin").fill(FIXTURE.vehicle.vin);

    await page.getByTestId("vehicle-save").click();
    await expect(page.getByTestId("add-vehicle-dialog")).toBeHidden({
      timeout: 30_000,
    });

    await expect(
      page.getByText(new RegExp(FIXTURE.vehicle.nickname, "i")).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("OBD adapter toggle shows/hides Connect OBD in Chat", async ({
    page,
  }) => {
    await page.goto("/app?tab=settings");
    const toggle = page.getByTestId("settings-obd-toggle");
    await expect(toggle).toBeVisible({ timeout: 30_000 });

    // Force off
    if (await toggle.isChecked()) {
      await toggle.click();
      await expect(page.getByText(/OBD preference saved/i)).toBeVisible({
        timeout: 10_000,
      });
    }

    await page.goto("/app?tab=chat");
    await expect(page.getByTestId("dtc-enter-code")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("obd-connect-entry")).toHaveCount(0);

    await page.goto("/app?tab=settings");
    await page.getByTestId("settings-obd-toggle").check();
    await expect(page.getByText(/OBD preference saved/i)).toBeVisible({
      timeout: 10_000,
    });

    await page.goto("/app?tab=chat");
    await expect(page.getByTestId("obd-connect-entry")).toBeVisible({
      timeout: 30_000,
    });

    // Restore default-off for other tests
    await page.goto("/app?tab=settings");
    await page.getByTestId("settings-obd-toggle").uncheck();
  });
});
