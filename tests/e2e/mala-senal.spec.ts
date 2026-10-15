import { expect, test } from "@playwright/test";
import { borrarUsuarioPrueba, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { borrarFotosDeTienda, crearTiendaPrueba } from "../helpers/tiendas-prueba";
import { cookiesDeSesion } from "./sesion";

const NO_GUARDO = "No se pudo guardar. Revisá tu conexión y probá de nuevo.";
let feriante: UsuarioPrueba;
let tienda: { id: string; handle: string };

test.beforeAll(async () => {
  feriante = await crearUsuarioPrueba({ nombre: "Mica Señal" });
  tienda = await crearTiendaPrueba(feriante);
});

test.afterAll(async () => {
  if (tienda) await borrarFotosDeTienda(tienda.id);
  if (feriante) await borrarUsuarioPrueba(feriante.id);
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(await cookiesDeSesion(feriante.sesion));
});

test("si se corta la señal al guardar el cobro, avisa en castellano y no pierde lo escrito", async ({ page }) => {
  await page.goto("/mi-puesto/tienda");
  await page.getByLabel("Alias").fill("mica.sin.senal");
  await page.getByLabel("Titular").fill("Micaela Díaz");
  // Las Server Actions viajan como POST a la misma dirección: se corta la conexión.
  await page.route("**/mi-puesto/tienda", (route) =>
    route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue(),
  );
  await page.getByRole("button", { name: "Guardar cobro" }).click();
  await expect(page.getByRole("alert").filter({ hasText: NO_GUARDO })).toBeVisible();
  await expect(page.getByLabel("Alias")).toHaveValue("mica.sin.senal");
});

test("si se pierde la respuesta al guardar un producto, reintentar no lo duplica", async ({ page }) => {
  await page.goto("/mi-puesto/productos/nuevo");
  await page.getByLabel("Nombre").fill("Cartera única");
  await page.getByLabel("Precio").fill("12.000");
  await page.getByLabel("Cantidad").fill("1");
  let cortar = true;
  await page.route("**/mi-puesto/productos/nuevo", async (route) => {
    if (route.request().method() !== "POST" || !cortar) return route.continue();
    cortar = false;
    await route.fetch(); // el servidor sí lo guarda…
    await route.abort("internetdisconnected"); // …pero la respuesta no llega al celular
  });
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await expect(page.getByRole("alert").filter({ hasText: NO_GUARDO })).toBeVisible();
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await expect(page).toHaveURL("/mi-puesto/productos", { timeout: 30_000 });
  await expect(page.getByRole("listitem").filter({ hasText: "Cartera única" })).toHaveCount(1);
});
