import { expect, Page } from "@playwright/test";

/** Wait for the app to finish loading data (works on all viewports) */
export async function waitForDataLoaded(page: Page) {
  await expect(page.locator("canvas")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".graph-loader")).not.toBeVisible({ timeout: 30000 });
}

/** Open the sidebar on mobile viewports (no-op on desktop where it's always visible) */
export async function openSidebar(page: Page) {
  const toggle = page.locator(".sidebar-toggle");
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(page.locator(".sidebar.open")).toBeVisible();
  }
}
