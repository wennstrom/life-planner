import { expect, test } from "@playwright/test";

test("smoke: app loads sign-in", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
});

test("smoke: signed-out home shows the landing page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Plan the day.");
  await expect(page.getByRole("link", { name: "Get started" }).first()).toHaveAttribute("href", "/sign-up");
});
