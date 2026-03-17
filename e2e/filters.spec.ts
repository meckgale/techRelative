import { test, expect } from "@playwright/test";

test.describe("Filters", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for data to load
    await expect(page.locator(".meta-counts")).toBeVisible({ timeout: 15000 });
  });

  test("clicking an era chip activates it and updates counts", async ({ page }) => {
    // Get initial node count text
    const counts = page.locator(".meta-counts");
    const initialText = await counts.textContent();

    // Click "Early Modern" era chip
    const chip = page.locator(".chip", { hasText: "Early Modern" });
    await chip.click();
    await expect(chip).toHaveClass(/active/);

    // Wait for count to change (filtered result)
    await expect(counts).not.toHaveText(initialText!, { timeout: 5000 });
  });

  test("clicking the same era chip again deactivates it", async ({ page }) => {
    const chip = page.locator(".chip", { hasText: "Early Modern" });
    await chip.click();
    await expect(chip).toHaveClass(/active/);

    await chip.click();
    await expect(chip).not.toHaveClass(/active/);
  });

  test("clicking a category chip filters results", async ({ page }) => {
    const counts = page.locator(".meta-counts");
    const initialText = await counts.textContent();

    const chip = page.locator(".chip", { hasText: "Mathematics" });
    await chip.click();
    await expect(chip).toHaveClass(/active/);

    await expect(counts).not.toHaveText(initialText!, { timeout: 5000 });
  });

  test("clear all filters button resets everything", async ({ page }) => {
    // Activate a filter first
    const chip = page.locator(".chip", { hasText: "Ancient" });
    await chip.click();
    await expect(chip).toHaveClass(/active/);

    // Clear button should appear
    const clearBtn = page.locator(".clear-btn");
    await expect(clearBtn).toBeVisible();

    await clearBtn.click();
    await expect(chip).not.toHaveClass(/active/);
    await expect(clearBtn).not.toBeVisible();
  });
});
