import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".meta-counts")).toBeVisible({ timeout: 15000 });
  });

  test("full navigation flow: tech -> person -> contribution -> tech", async ({ page }) => {
    // 1. Search and open Calculus
    const input = page.locator(".search-input");
    await input.fill("Calculus");
    await expect(page.locator(".search-results")).toBeVisible({ timeout: 5000 });
    await page.locator(".search-result-item", { hasText: "Calculus" }).click();
    await expect(page.locator(".detail-name")).toContainText("Calculus");

    // 2. Navigate to Isaac Newton
    await page.locator(".person-link", { hasText: "Isaac Newton" }).click();
    await expect(page.locator(".detail-name")).toContainText("Isaac Newton");

    // 3. Back button should be visible (we came from tech detail)
    await expect(page.locator(".person-back")).toBeVisible();

    // 4. Click a contribution to go to a tech
    await page.locator(".person-contribution").first().click();
    await expect(page.locator(".detail-panel")).toBeVisible();
    await expect(page.locator(".detail-name")).not.toContainText("Isaac Newton");

    // 5. Close the detail
    await page.locator(".detail-close").click();
    await expect(page.locator(".detail-panel")).not.toBeVisible();
  });

  test("navigating between related technologies", async ({ page }) => {
    // Open Classical Mechanics (which has relations)
    const input = page.locator(".search-input");
    await input.fill("Classical");
    await expect(page.locator(".search-results")).toBeVisible({ timeout: 5000 });
    await page.locator(".search-result-item", { hasText: "Classical Mechanics" }).click();
    await expect(page.locator(".detail-name")).toContainText("Classical Mechanics");

    // Click a related technology
    const relatedLink = page.locator(".related-link").first();
    const relatedName = await relatedLink.textContent();
    await relatedLink.click();

    // Should navigate to that tech
    await expect(page.locator(".detail-name")).toContainText(relatedName!);
  });
});
