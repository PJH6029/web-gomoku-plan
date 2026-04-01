import { expect, test } from "@playwright/test";

test("home page renders the room controls", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Gomoku protocol")).toBeVisible();
  await expect(page.getByRole("button", { name: /launch room/i })).toBeVisible();
});

test("room route renders a fallback surface without crashing", async ({ page }) => {
  await page.goto("/room/ROOM42");

  await expect(page.locator("body")).toContainText(/room room42|supabase credentials are required/i);
});
