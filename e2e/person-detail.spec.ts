import { test, expect } from "@playwright/test";
import { waitForDataLoaded, openSidebar } from "./helpers";

test.describe("Person Detail", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForDataLoaded(page);
  });

  test("clicking a person link from tech detail opens person panel", async ({ page }) => {
    // Open Calculus detail
    await openSidebar(page);
    const input = page.locator(".search-input");
    await input.fill("Calculus");
    await expect(page.locator(".search-results")).toBeVisible({ timeout: 10000 });
    await page.locator(".search-result-item", { hasText: "Calculus" }).click();
    await expect(page.locator(".detail-panel")).toBeVisible();

    // Click person link
    await page.locator(".person-link", { hasText: "Isaac Newton" }).click();

    // Person detail should appear
    await expect(page.locator(".detail-name")).toContainText("Isaac Newton");
  });

  test("person detail shows contributions", async ({ page }) => {
    // Navigate to person via tech detail
    await openSidebar(page);
    const input = page.locator(".search-input");
    await input.fill("Calculus");
    await expect(page.locator(".search-results")).toBeVisible({ timeout: 10000 });
    await page.locator(".search-result-item", { hasText: "Calculus" }).click();
    await page.locator(".person-link").click();

    // Check contributions are listed
    const contributions = page.locator(".person-contribution");
    await expect(contributions.first()).toBeVisible();
    const count = await contributions.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("person detail shows back button when navigating from tech", async ({ page }) => {
    // Open tech detail then person
    await openSidebar(page);
    const input = page.locator(".search-input");
    await input.fill("Calculus");
    await expect(page.locator(".search-results")).toBeVisible({ timeout: 10000 });
    await page.locator(".search-result-item", { hasText: "Calculus" }).click();
    await page.locator(".person-link").click();

    await expect(page.locator(".person-back")).toBeVisible();
    await expect(page.locator(".person-back")).toContainText("Back");
  });

  test("clicking a contribution navigates to that tech detail", async ({ page }) => {
    // Navigate to person via tech
    await openSidebar(page);
    const input = page.locator(".search-input");
    await input.fill("Calculus");
    await expect(page.locator(".search-results")).toBeVisible({ timeout: 10000 });
    await page.locator(".search-result-item", { hasText: "Calculus" }).click();
    await page.locator(".person-link").click();

    // Wait for person detail to load (person-specific elements appear)
    await expect(page.locator(".person-contribution").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".detail-name")).toContainText("Isaac Newton", { timeout: 10000 });

    // Click a contribution
    await page.locator(".person-contribution").first().click();

    // Should navigate to tech detail
    await expect(page.locator(".detail-panel")).toBeVisible();
    // The detail-name should now be a technology, not "Isaac Newton"
    await expect(page.locator(".detail-name")).not.toContainText("Isaac Newton");
  });

  test("close button dismisses person detail", async ({ page }) => {
    await openSidebar(page);
    const input = page.locator(".search-input");
    await input.fill("Calculus");
    await expect(page.locator(".search-results")).toBeVisible({ timeout: 10000 });
    await page.locator(".search-result-item", { hasText: "Calculus" }).click();
    await page.locator(".person-link").click();

    await page.locator(".detail-close").click();
    await expect(page.locator(".detail-panel")).not.toBeVisible();
  });
});
