import { expect, Page } from "@playwright/test";

/** Dismiss the welcome modal if it is visible */
async function dismissWelcome(page: Page) {
  const modal = page.locator(".welcome-backdrop");
  if (await modal.isVisible()) {
    await page.locator(".welcome-dismiss").click();
    await expect(modal).not.toBeVisible();
  }
}

/** Wait for the app to finish loading data (works on all viewports) */
export async function waitForDataLoaded(page: Page) {
  await expect(page.locator("canvas")).toBeVisible({ timeout: 30000 });
  await dismissWelcome(page);
  await expect(page.locator(".graph-loader")).not.toBeVisible({ timeout: 30000 });
}

/** Open the sidebar on mobile viewports (no-op on desktop where it's always visible) */
export async function openSidebar(page: Page) {
  await dismissWelcome(page);
  const toggle = page.locator(".sidebar-toggle");
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(page.locator(".sidebar.open")).toBeVisible();
  }
}

/** Type into the search input reliably across all browsers.
 *  Clears existing text first, then types character by character
 *  so React's controlled onChange fires consistently. */
export async function searchFor(page: Page, text: string) {
  const input = page.locator(".search-input");
  await input.clear();
  await input.pressSequentially(text, { delay: 30 });
}
