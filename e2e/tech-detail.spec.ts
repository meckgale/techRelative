import { test, expect } from "@playwright/test";

// Helper to open a tech detail via search
async function openTechDetail(page: any, name: string) {
  const input = page.locator(".search-input");
  await input.fill(name);
  await expect(page.locator(".search-results")).toBeVisible({ timeout: 5000 });
  await page.locator(".search-result-item", { hasText: name }).click();
  await expect(page.locator(".detail-panel")).toBeVisible();
}

test.describe("Tech Detail", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".meta-counts")).toBeVisible({ timeout: 15000 });
  });

  test("shows technology details after search selection", async ({ page }) => {
    await openTechDetail(page, "Calculus");

    await expect(page.locator(".detail-name")).toContainText("Calculus");
    await expect(page.locator(".detail-year")).toContainText("1687 CE");
    await expect(page.locator(".detail-badge", { hasText: "Early Modern" })).toBeVisible();
    await expect(page.locator(".detail-badge", { hasText: "Mathematics" })).toBeVisible();
    await expect(page.locator(".detail-desc")).toContainText("calculus");
  });

  test("shows person link", async ({ page }) => {
    await openTechDetail(page, "Calculus");

    const personLink = page.locator(".person-link");
    await expect(personLink).toBeVisible();
    await expect(personLink).toContainText("Isaac Newton");
  });

  test("shows related technologies", async ({ page }) => {
    await openTechDetail(page, "Calculus");

    const related = page.locator(".related-link");
    await expect(related.first()).toBeVisible();
    await expect(related.first()).toContainText("Classical Mechanics");
  });

  test("navigating to a related tech updates the panel", async ({ page }) => {
    await openTechDetail(page, "Calculus");

    await page.locator(".related-link", { hasText: "Classical Mechanics" }).click();

    await expect(page.locator(".detail-name")).toContainText("Classical Mechanics");
    await expect(page.locator(".detail-badge", { hasText: "Physics" })).toBeVisible();
  });

  test("close button dismisses the panel", async ({ page }) => {
    await openTechDetail(page, "Calculus");

    await page.locator(".detail-close").click();
    await expect(page.locator(".detail-panel")).not.toBeVisible();
  });

  test("Escape key dismisses the panel", async ({ page }) => {
    await openTechDetail(page, "Calculus");

    await page.keyboard.press("Escape");
    await expect(page.locator(".detail-panel")).not.toBeVisible();
  });
});
