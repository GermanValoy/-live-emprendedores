import { expect, test } from "@playwright/test";
import { borrarUsuarioPrueba, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { borrarFotosDeTienda, crearTiendaPrueba } from "../helpers/tiendas-prueba";
import { cookiesDeSesion } from "./sesion";

const FOTO = "tests/e2e/fixtures/foto-de-costado.jpg";
let feriante: UsuarioPrueba;
let tienda: { id: string; handle: string };

test.beforeAll(async () => {
  feriante = await crearUsuarioPrueba({ nombre: "Mica Productos" });
  tienda = await crearTiendaPrueba(feriante);
});

test.afterAll(async () => {
  if (tienda) await borrarFotosDeTienda(tienda.id);
  if (feriante) await borrarUsuarioPrueba(feriante.id);
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(await cookiesDeSesion(feriante.sesion));
});

test("carga un producto con foto: queda derecha, sin datos ocultos y en dos tamaños", async ({ page, request }) => {
  await page.goto("/mi-puesto/productos");
  await page.getByRole("link", { name: "＋ Producto" }).click();
  await page.getByLabel("Fotos").setInputFiles(FOTO);
  await expect(page.getByRole("img", { name: "Foto 1" })).toBeVisible();
  await page.getByLabel("Nombre").fill("Vestido azul");
  await page.getByLabel("Precio").fill("8.000");
  await page.getByLabel("Descripción").fill("Talle M, impecable");
  await page.getByLabel("Cantidad").fill("2");
  await page.getByRole("button", { name: "Guardar producto" }).click();

  // Comprimir y subir dos tamaños puede tardar en una conexión o compu lenta.
  await expect(page).toHaveURL("/mi-puesto/productos", { timeout: 30_000 });
  const tarjeta = page.getByRole("listitem").filter({ hasText: "Vestido azul" });
  await expect(tarjeta.getByText("$8.000")).toBeVisible();

  const src = await tarjeta.getByRole("img").getAttribute("src");
  expect(src).toMatch(/-400\.(webp|jpg)$/);
  const grande = src!.replace(/-400\.(webp|jpg)$/, "-1200.$1");
  const respuesta = await request.get(grande);
  expect(respuesta.ok()).toBe(true);
  const bytes = await respuesta.body();
  expect(bytes.length).toBeLessThan(1_048_576);
  expect(bytes.includes(Buffer.from("Exif"))).toBe(false);

  const medidas = await page.evaluate(async (url) => {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    return { ancho: bmp.width, alto: bmp.height };
  }, grande);
  expect(medidas).toEqual({ ancho: 750, alto: 1200 });
});

test("un doble toque en Guardar crea un solo producto", async ({ page }) => {
  await page.goto("/mi-puesto/productos/nuevo");
  await page.getByLabel("Nombre").fill("Bolso tejido");
  await page.getByLabel("Precio").fill("9000");
  await page.getByLabel("Cantidad").fill("1");
  await page.getByRole("button", { name: "Guardar producto" }).dblclick();
  await expect(page).toHaveURL("/mi-puesto/productos");
  await expect(page.getByRole("listitem").filter({ hasText: "Bolso tejido" })).toHaveCount(1);
});

for (const precio of ["gratis", "8.5"]) {
  test(`pide el precio completo si se escribe "${precio}"`, async ({ page }) => {
    await page.goto("/mi-puesto/productos/nuevo");
    await page.getByLabel("Nombre").fill("Remera");
    await page.getByLabel("Precio").fill(precio);
    await page.getByLabel("Cantidad").fill("1");
    await page.getByRole("button", { name: "Guardar producto" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Escribí el precio completo, por ejemplo 8.500 u 8,50." })).toBeVisible();
  });
}

test("oculta, edita y borra un producto", async ({ page }) => {
  await page.goto("/mi-puesto/productos/nuevo");
  await page.getByLabel("Nombre").fill("Saco lila");
  await page.getByLabel("Precio").fill("15000");
  await page.getByLabel("Cantidad").fill("1");
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await page.getByRole("listitem").filter({ hasText: "Saco lila" }).getByRole("link").click();

  await page.getByRole("button", { name: "Ocultar de la tienda" }).click();
  await expect(page.getByRole("button", { name: "Mostrar en la tienda" })).toBeVisible();
  await page.getByLabel("Precio").fill("14.500");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Saco lila" }).getByText("$14.500")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Saco lila" }).getByText("Oculto")).toBeVisible();

  await page.getByRole("listitem").filter({ hasText: "Saco lila" }).getByRole("link").click();
  await page.getByRole("button", { name: "Borrar producto" }).click();
  await page.getByRole("button", { name: "Sí, borrar" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Saco lila" })).toHaveCount(0);
});
