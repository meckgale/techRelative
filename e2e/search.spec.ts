import { test, expect } from "@playwright/test";

test.describe("Search", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".meta-counts")).toBeVisible({ timeout: 15000 });
  });

  test("typing 3+ characters shows search results", async ({ page }) => {
    const input = page.locator(".search-input");
    await input.fill("Calculus");

    // Wait for search results to appear
    const results = page.locator(".search-results");
    await expect(results).toBeVisible({ timeout: 5000 });
    await expect(results.locator(".search-result-item")).toHaveCount(1);
    await expect(results).toContainText("Calculus");
  });

  test("typing < 3 characters shows no results", async ({ page }) => {
    const input = page.locator(".search-input");
    await input.fill("Ca");

    // Short wait to confirm no dropdown appears
    await page.waitForTimeout(500);
    await expect(page.locator(".search-results")).not.toBeVisible();
  });

  test("clicking a search result opens the detail panel", async ({ page }) => {
    const input = page.locator(".search-input");
    await input.fill("Calculus");

    const results = page.locator(".search-results");
    await expect(results).toBeVisible({ timeout: 5000 });

    await results.locator(".search-result-item").first().click();

    // Detail panel should open
    await expect(page.locator(".detail-panel")).toBeVisible();
    await expect(page.locator(".detail-name")).toContainText("Calculus");

    // Search should be cleared
    await expect(input).toHaveValue("");
    await expect(results).not.toBeVisible();
  });

  test("keyboard navigation works in search results", async ({ page }) => {
    const input = page.locator(".search-input");
    await input.fill("Calculus");

    await expect(page.locator(".search-results")).toBeVisible({ timeout: 5000 });

    // Arrow down to highlight first result
    await input.press("ArrowDown");
    await expect(
      page.locator(".search-result-item.active"),
    ).toBeVisible();

    // Enter to select
    await input.press("Enter");
    await expect(page.locator(".detail-panel")).toBeVisible();
  });

  test("Escape closes search results", async ({ page }) => {
    const input = page.locator(".search-input");
    await input.fill("Calculus");

    await expect(page.locator(".search-results")).toBeVisible({ timeout: 5000 });

    await input.press("Escape");
    await expect(page.locator(".search-results")).not.toBeVisible();
  });

  test("search placeholder changes in person mode", async ({ page }) => {
    const input = page.locator(".search-input");
    await expect(input).toHaveAttribute("placeholder", "Search technologies…");

    // Switch to person mode
    await page.locator(".toggle-btn", { hasText: "person" }).click();
    await expect(input).toHaveAttribute("placeholder", "Search persons…");
  });
});
