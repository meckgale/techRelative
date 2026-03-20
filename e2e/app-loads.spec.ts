import { test, expect } from "@playwright/test";

test.describe("App loads", () => {
  test("page loads with logo and graph", async ({ page }) => {
    await page.goto("/");

    // Logo is visible
    await expect(page.locator(".logo")).toBeVisible();
    await expect(page.locator(".logo")).toContainText("techRelative");

    // Canvas (graph) is present
    await expect(page.locator("canvas")).toBeVisible();
  });

  test("sidebar shows node and edge counts after loading", async ({ page }) => {
    await page.goto("/");

    // Wait for counts to appear (data is loaded)
    const counts = page.locator(".meta-counts");
    await expect(counts).toBeVisible({ timeout: 30000 });
    await expect(counts).toContainText("nodes");
    await expect(counts).toContainText("edges");
  });

  test("no error banner is displayed", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".error-banner")).not.toBeVisible();
  });
});
