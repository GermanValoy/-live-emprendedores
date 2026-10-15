import { expect, test } from "@playwright/test";
import { borrarUsuarioPrueba, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { borrarFotosDeTienda, crearTiendaPrueba, handleAleatorio } from "../helpers/tiendas-prueba";
import { cookiesDeSesion } from "./sesion";

let feriante: UsuarioPrueba;
let otra: UsuarioPrueba;
let tienda: { id: string; handle: string };
let tiendaOtra: { id: string; handle: string };

test.beforeAll(async () => {
  [feriante, otra] = await Promise.all([crearUsuarioPrueba({ nombre: "Mica Tienda" }), crearUsuarioPrueba({ nombre: "Otra Tienda" })]);
  [tienda, tiendaOtra] = await Promise.all([crearTiendaPrueba(feriante), crearTiendaPrueba(otra)]);
});

test.afterAll(async () => {
  if (tienda) await borrarFotosDeTienda(tienda.id);
  await Promise.all([feriante, otra].filter(Boolean).map((u) => borrarUsuarioPrueba(u.id)));
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(await cookiesDeSesion(feriante.sesion));
});

test("edita los datos de la tienda y avisa si el @usuario está tomado", async ({ page }) => {
  await page.goto("/mi-puesto/tienda");
  await page.getByLabel("@usuario").fill(tiendaOtra.handle);
  await expect(page.getByText(`@${tiendaOtra.handle} ya está en uso. Probá con otro.`)).toBeVisible();
  const nuevo = handleAleatorio("nuevo");
  await page.getByLabel("@usuario").fill(`@${nuevo.toUpperCase()}`);
  await page.getByLabel("Nombre del puesto").fill("La Ropería de Mica");
  await page.getByLabel("Suele estar en vivo…").fill("Mar. y jue. 20 h");
  await page.getByRole("button", { name: "Guardar datos" }).click();
  await expect(page.getByText("Datos guardados")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("@usuario")).toHaveValue(nuevo);
  await page.getByLabel("@usuario").fill(handleAleatorio("otro"));
  await page.getByRole("button", { name: "Guardar datos" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Podés cambiar tu @usuario de nuevo el" })).toBeVisible();
});

test("guarda el cobro y las entregas", async ({ page }) => {
  await page.goto("/mi-puesto/tienda");
  await page.getByLabel("Alias").fill("mica.ropa.yb");
  await page.getByLabel("Titular").fill("Micaela Díaz");
  await page.getByRole("button", { name: "Guardar cobro" }).click();
  await expect(page.getByText("Datos de cobro guardados")).toBeVisible();

  await page.getByLabel("Envío").check();
  await page.getByLabel("Con costo fijo").check();
  await page.getByLabel("Costo del envío").fill("2.500");
  await page.getByRole("button", { name: "Guardar entregas" }).click();
  await expect(page.getByText("Formas de entrega guardadas")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Costo del envío")).toHaveValue("2.500");
  await expect(page.getByLabel("Alias")).toHaveValue("mica.ropa.yb");
});

test("sube la foto de perfil", async ({ page }) => {
  await page.goto("/mi-puesto/tienda");
  await page.getByLabel("Foto del puesto").setInputFiles("tests/e2e/fixtures/foto-de-costado.jpg");
  await expect(page.getByText("Foto guardada")).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByRole("img", { name: "Foto del puesto" })).toHaveAttribute("src", /\/perfil\/.+-400\.(webp|jpg)$/);
});
