import { expect, test } from "@playwright/test";

test("el manifiesto de la app es válido", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();
  const respuesta = await request.get(href!);
  expect(respuesta.ok()).toBe(true);
  const manifiesto = await respuesta.json();
  expect(manifiesto.name).toBe("Tu Feria Live");
  expect(manifiesto.display).toBe("standalone");
  expect(manifiesto.start_url).toBe("/");
  const tamanos = manifiesto.icons.map((i: { sizes: string }) => i.sizes);
  expect(tamanos).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  for (const icono of manifiesto.icons as { src: string }[]) {
    const img = await request.get(icono.src);
    expect(img.ok(), icono.src).toBe(true);
    expect(img.headers()["content-type"]).toBe("image/png");
  }
});

test("muestra un aviso amable cuando se corta internet", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByText("Sin conexión, revisá tu internet")).toBeHidden();
  await context.setOffline(true);
  await expect(page.getByText("Sin conexión, revisá tu internet")).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("Sin conexión, revisá tu internet")).toBeHidden();
});
