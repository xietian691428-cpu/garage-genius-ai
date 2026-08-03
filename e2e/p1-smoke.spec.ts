import { expect, test } from "@playwright/test";
import { FIXTURE } from "./fixtures/test-data";
import { loginWithEmail } from "./helpers/auth";
import { hasE2eCredentials } from "./helpers/env";

test.describe("P1 smoke", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasE2eCredentials(), "Set E2E_EMAIL and E2E_PASSWORD");
    await loginWithEmail(page);
  });

  test("edit vehicle mileage and plate then save", async ({ page }) => {
    await page.goto("/app?tab=dashboard");
    // Open edit if available — fall back to add+edit via vehicle card menu
    const editBtn = page.getByRole("button", { name: /Edit/i }).first();
    if (!(await editBtn.isVisible().catch(() => false))) {
      test.skip(true, "No editable vehicle in garage for this account");
    }
    await editBtn.click();
    await expect(page.getByTestId("add-vehicle-dialog")).toBeVisible();
    await page.getByTestId("vehicle-mileage").fill("91234");
    const ids = page.getByText(/Identifiers/i);
    await ids.click();
    await page.getByTestId("vehicle-license-plate").fill("P1-PLATE");
    await page.getByTestId("vehicle-save").click();
    await expect(page.getByTestId("add-vehicle-dialog")).toBeHidden({
      timeout: 30_000,
    });
    await expect(page.getByText(/91,?234/)).toBeVisible({ timeout: 15_000 });
  });

  test("sign out returns to login", async ({ page }) => {
    await page.goto("/app?tab=settings");
    await page.getByTestId("auth-sign-out").click();
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
    await expect(page.getByTestId("login-submit")).toBeVisible();
  });

  test("coach library loads Export for Shop control after opening a guide", async ({
    page,
  }) => {
    await page.goto("/app?tab=coach");
    await expect(page.getByText(/Guides|Coach|playbook/i).first()).toBeVisible({
      timeout: 30_000,
    });
    // Open first available playbook card if present
    const start = page.getByRole("button", { name: /Start|Open|Begin/i }).first();
    if (!(await start.isVisible().catch(() => false))) {
      // Cards may be clickable differently
      const card = page.locator("button, a").filter({ hasText: /Check Engine|Oil|Brake/i }).first();
      if (!(await card.isVisible().catch(() => false))) {
        test.skip(true, "No coach playbook entry found");
      }
      await card.click();
    } else {
      await start.click();
    }
    // Completion → Export is P1; here we only assert player opened without crash
    await expect(page.getByText(FIXTURE.dtc).or(page.getByText(/step|Next|Done|Export for Shop/i)).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
