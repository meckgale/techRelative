import { test, expect } from "@playwright/test";

test.describe("View Mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".meta-counts")).toBeVisible({ timeout: 30000 });
  });

  test("defaults to technology view", async ({ page }) => {
    const techBtn = page.locator(".toggle-btn", { hasText: "tech" });
    await expect(techBtn).toHaveClass(/active/);
    await expect(page.locator(".meta-counts")).toContainText("nodes");
  });

  test("switches to person view", async ({ page }) => {
    const personBtn = page.locator(".toggle-btn", { hasText: "person" });
    await personBtn.click();

    await expect(personBtn).toHaveClass(/active/);
    // Wait for data to reload with person graph
    await expect(page.locator(".meta-counts")).toContainText("persons", { timeout: 10000 });
  });

  test("switching view mode clears selection", async ({ page }) => {
    // Open a tech detail first
    const input = page.locator(".search-input");
    await input.fill("Calculus");
    await expect(page.locator(".search-results")).toBeVisible({ timeout: 10000 });
    await page.locator(".search-result-item", { hasText: "Calculus" }).click();
    await expect(page.locator(".detail-panel")).toBeVisible();

    // Switch view mode
    await page.locator(".toggle-btn", { hasText: "person" }).click();

    // Detail panel should close
    await expect(page.locator(".detail-panel")).not.toBeVisible();
  });

  test("filters work in person view", async ({ page }) => {
    // Switch to person mode
    await page.locator(".toggle-btn", { hasText: "person" }).click();
    await expect(page.locator(".meta-counts")).toContainText("persons", { timeout: 10000 });

    const counts = page.locator(".meta-counts");
    const initialText = await counts.textContent();

    // Apply an era filter
    await page.locator(".chip", { hasText: "Early Modern" }).click();

    // Counts should change
    await expect(counts).not.toHaveText(initialText!, { timeout: 10000 });
  });
});
