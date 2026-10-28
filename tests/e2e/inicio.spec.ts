import { expect, test } from "@playwright/test";
import { borrarUsuarioPrueba, clienteAdmin, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { borrarVivosDeTienda, crearTiendaPrueba, crearTransmisionPrueba } from "../helpers/tiendas-prueba";

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

const SIN_VIVOS = "Ahora no hay nadie en vivo. Seguí a tus puestos favoritos.";

test("sin vivos", async ({ page }) => {
  const { data, error } = await clienteAdmin().from("live_sessions").select("id").is("ended_at", null);
  if (error) throw error;
  test.skip((data ?? []).length > 0, "La base compartida tiene vivos abiertos de otras pruebas.");
  await page.goto("/");
  await expect(page.getByText(SIN_VIVOS)).toBeVisible();
});

test.describe("con un vivo", () => {
  let mica: UsuarioPrueba;
  let tienda: { id: string; handle: string };

  test.beforeEach(async () => {
    mica = await crearUsuarioPrueba({ nombre: "Mica Portada" });
    tienda = await crearTiendaPrueba(mica, { conProducto: true });
    const { error } = await clienteAdmin().from("stores").update({ name: "Mica Portada" }).eq("id", tienda.id);
    if (error) throw error;
    await crearTransmisionPrueba(tienda.id);
  });

  test.afterEach(async () => {
    await borrarVivosDeTienda(tienda.id);
    await borrarUsuarioPrueba(mica.id);
  });

  test("muestra el vivo y lo saca al terminar", async ({ page }) => {
    await page.goto("/");
    // Se espera al canal conectado: así el arranque llega por Realtime y no por la lectura inicial.
    await expect(page.locator('[data-canal="listo"]')).toBeAttached({ timeout: 30_000 });
    const { data, error } = await mica.cliente.rpc("abrir_vivo", { p_store: tienda.id, p_device: crypto.randomUUID() });
    if (error) throw error;
    const tarjeta = page.locator(`a[href="/@${tienda.handle}/vivo"]`).first();
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta.getByText("EN VIVO", { exact: true })).toBeVisible();
    await expect(tarjeta.getByText("Mica Portada")).toBeVisible();
    await expect(tarjeta.getByText("👁 0")).toBeVisible();
    await expect(page.getByText(SIN_VIVOS)).toHaveCount(0);
    const { error: e2 } = await mica.cliente.rpc("terminar_vivo", { p_vivo: data as string });
    if (e2) throw e2;
    await expect(page.locator(`a[href="/@${tienda.handle}/vivo"]`)).toHaveCount(0, { timeout: 30_000 });
  });

  test("el puesto en vivo se indica en la lista de puestos", async ({ page }) => {
    const { error } = await mica.cliente.rpc("abrir_vivo", { p_store: tienda.id, p_device: crypto.randomUUID() });
    if (error) throw error;
    await page.goto("/");
    const puesto = page.locator("article", { has: page.locator(`a[href="/@${tienda.handle}"]`) });
    await expect(puesto.getByText("EN VIVO", { exact: true })).toBeVisible();
  });
});
