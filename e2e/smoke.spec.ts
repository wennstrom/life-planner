import { expect, test } from "@playwright/test";

test("smoke: app loads sign-in", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
});
