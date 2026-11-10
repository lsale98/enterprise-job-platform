import { expect, test } from "@playwright/test";

test.describe("Protected routes", () => {
  test("redirects unauthenticated users from workspace", async ({ page }) => {
    await page.goto("/workspace");

    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test("redirects unauthenticated users from tenant dashboard", async ({
    page,
  }) => {
    await page.goto("/t/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/dashboard");

    await expect(page).toHaveURL(/\/auth\/signin/);
  });
});
