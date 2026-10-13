import { expect, test } from "@playwright/test";

test("el inicio muestra la marca y el eslogan", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tu Feria Live" })).toBeVisible();
  await expect(page.getByText("Vendé en vivo, sin que nadie te corte")).toBeVisible();
});

test("el inicio no tiene desplazamiento horizontal en el celular", async ({ page }) => {
  await page.goto("/");
  const desborda = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(desborda).toBe(false);
});
