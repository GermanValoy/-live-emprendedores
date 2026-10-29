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

test("botones y campos tienen al menos 44 px de alto para tocarlos con el dedo", async ({ page }) => {
  await page.goto("/diseno");
  const elementos = [
    page.getByRole("button", { name: "Entrar con Google" }),
    page.getByRole("button", { name: "Secundario" }),
    page.getByPlaceholder("Escribí un mensaje o un código…"),
  ];
  for (const elemento of elementos) {
    const caja = await elemento.boundingBox();
    expect(caja!.height).toBeGreaterThanOrEqual(44);
  }
});

test("el fondo cambia en modo oscuro", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/diseno");
  const fondo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(fondo).toBe("rgb(22, 13, 19)");
});

test("los botones usan el color lapacho", async ({ page }) => {
  await page.goto("/diseno");
  const fondo = await page
    .getByRole("button", { name: "Entrar con Google" })
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(fondo).toBe("rgb(176, 19, 95)");
});

test("toda la app usa la letra Bricolage Grotesque", async ({ page }) => {
  await page.goto("/diseno");
  const letra = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(letra).toMatch(/Bricolage/);
});

test("el punto de EN VIVO late, salvo con reducir movimiento", async ({ page }) => {
  const punto = page.getByText("EN VIVO", { exact: true }).locator("span");
  await page.goto("/diseno");
  expect(await punto.evaluate((el) => getComputedStyle(el).animationName)).not.toBe("none");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/diseno");
  expect(await punto.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
});

test("los botones se achican al tocarlos, salvo con reducir movimiento", async ({ page }) => {
  const boton = page.getByRole("button", { name: "Secundario" });
  const escalaAlApretar = async () => {
    const caja = await boton.boundingBox();
    await page.mouse.move(caja!.x + caja!.width / 2, caja!.y + caja!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(250);
    const escala = await boton.evaluate((el) => getComputedStyle(el).scale);
    await page.mouse.up();
    return escala;
  };

  await page.goto("/diseno");
  expect(await escalaAlApretar()).toBe("0.97");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/diseno");
  expect(await escalaAlApretar()).toBe("none");
});

test("muestra la espera del vivo", async ({ page }) => {
  await page.goto("/diseno");
  await expect(page.getByRole("heading", { name: "¡Pronto arrancamos!" })).toBeVisible();
  const toldo = page.getByTestId("toldo");
  expect(await toldo.evaluate((el) => getComputedStyle(el).animationName)).not.toBe("none");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/diseno");
  expect(await page.getByTestId("toldo").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
});
