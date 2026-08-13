import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Prefer desktop Shop Report CTA; fall back to mobile when viewport is narrow. */
export async function openShopReportModal(page: Page): Promise<void> {
  const visible = page
    .locator(
      '[data-testid="shop-report-open-desktop"], [data-testid="shop-report-open"]',
    )
    .filter({ visible: true });
  await expect(visible.first()).toBeVisible({ timeout: 30_000 });
  await visible.first().click();
  await expect(
    page.getByRole("heading", {
      name: /Generate Shop Report|Generar informe para el taller/i,
    }),
  ).toBeVisible({ timeout: 15_000 });
}

/** Controlled checkbox: click then wait for React state (don't use .check()). */
export async function setObdAdapterToggle(
  page: Page,
  enabled: boolean,
): Promise<void> {
  const toggle = page.getByTestId("settings-obd-toggle");
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  const isOn = await toggle.isChecked();
  if (isOn === enabled) return;
  await toggle.click();
  if (enabled) {
    await expect(toggle).toBeChecked({ timeout: 15_000 });
  } else {
    await expect(toggle).not.toBeChecked({ timeout: 15_000 });
  }
  await expect(page.getByText(/OBD preference saved/i)).toBeVisible({
    timeout: 10_000,
  });
}
