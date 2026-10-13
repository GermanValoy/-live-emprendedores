import { expect, test } from "@playwright/test";

for (const esquema of ["light", "dark"] as const) {
  test(`la muestra de diseño se ve completa en modo ${esquema}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: esquema });
    await page.goto("/diseno");
    await expect(page.getByRole("button", { name: "Entrar con Google" })).toBeVisible();
    await expect(page.getByText("EN VIVO", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Código ROJO, $8.000")).toBeVisible();
    const desborda = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(desborda).toBe(false);
  });
}

test("la muestra de diseño pide no aparecer en buscadores", async ({ page }) => {
  await page.goto("/diseno");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("el fondo cambia en modo oscuro", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/diseno");
  const fondo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(fondo).toBe("rgb(18, 13, 31)");
});
