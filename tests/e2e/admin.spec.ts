import { expect, test } from "@playwright/test";
import { borrarUsuarioPrueba, clienteAdmin, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { borrarVivosDeTienda, crearTiendaPrueba, crearTransmisionPrueba, hacerAdmin } from "../helpers/tiendas-prueba";
import { cookiesDeSesion } from "./sesion";

let admin: UsuarioPrueba;
let comun: UsuarioPrueba;

test.beforeAll(async () => {
  [admin, comun] = await Promise.all([crearUsuarioPrueba({ nombre: "Admin E2E" }), crearUsuarioPrueba({ nombre: "Comun E2E" })]);
  await hacerAdmin(admin.id);
});

test.afterAll(async () => {
  await Promise.all([admin, comun].filter(Boolean).map((u) => borrarUsuarioPrueba(u.id)));
});

test("sin sesión /admin no existe", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByText("No encontramos esta página")).toBeVisible();
});

test("una persona que no es admin ve que no existe", async ({ page, context }) => {
  await context.addCookies(await cookiesDeSesion(comun.sesion));
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Invitaciones" })).toHaveCount(0);
  await expect(page.getByText("No encontramos esta página")).toBeVisible();
});

test("la admin crea una invitación, la copia y la anula", async ({ page, context }) => {
  await context.addCookies(await cookiesDeSesion(admin.sesion));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/admin");
  await page.getByLabel("¿Para quién es? (opcional)").fill("Mica, ropa usada");
  await page.getByRole("button", { name: "Crear invitación" }).click();
  const link = page.getByTestId("link-invitacion");
  await expect(link).toContainText("/invitacion/");
  await page.getByRole("button", { name: "Copiar link" }).click();
  await expect(page.getByText("Link copiado")).toBeVisible();
  const fila = page.getByRole("listitem").filter({ hasText: "Mica, ropa usada" });
  await expect(fila.getByText("Pendiente")).toBeVisible();
  await fila.getByRole("button", { name: "Anular" }).click();
  await expect(fila.getByText("Anulada")).toBeVisible();
});

async function hayVivosAbiertos(): Promise<boolean> {
  const { data, error } = await clienteAdmin().from("live_sessions").select("id").is("ended_at", null);
  if (error) throw error;
  return (data ?? []).length > 0;
}

test("sin vivos la sección lo dice", async ({ page, context }) => {
  // La base se comparte con pruebas que abren vivos en paralelo: si hay uno abierto, no hay nada que comprobar.
  test.skip(await hayVivosAbiertos(), "La base compartida tiene vivos abiertos de otras pruebas.");
  await context.addCookies(await cookiesDeSesion(admin.sesion));
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Vivos ahora" })).toBeVisible();
  try {
    await expect(page.getByText("No hay nadie en vivo")).toBeVisible({ timeout: 10_000 });
  } catch (e) {
    test.skip(await hayVivosAbiertos(), "Otra prueba abrió un vivo mientras se cargaba /admin.");
    throw e;
  }
});

test("la admin corta un vivo", async ({ page, context }) => {
  const duena = await crearUsuarioPrueba({ nombre: "Duena Corte" });
  const tienda = await crearTiendaPrueba(duena, { conProducto: true });
  try {
    await crearTransmisionPrueba(tienda.id);
    const { error } = await duena.cliente.rpc("abrir_vivo", { p_store: tienda.id, p_device: crypto.randomUUID() });
    if (error) throw error;

    await context.addCookies(await cookiesDeSesion(admin.sesion));
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Vivos ahora" })).toBeVisible();
    const fila = page.getByRole("listitem").filter({ hasText: `@${tienda.handle}` });
    await expect(fila).toBeVisible();
    await fila.getByRole("button", { name: "Cortar este vivo" }).click();
    await fila.getByRole("button", { name: "Sí, cortar" }).click();
    await expect(fila).toHaveCount(0);

    const { data, error: e2 } = await clienteAdmin().from("live_sessions").select("end_reason, ended_at").eq("store_id", tienda.id);
    if (e2) throw e2;
    expect(data).toHaveLength(1);
    expect(data?.[0]?.end_reason).toBe("plataforma");
    expect(data?.[0]?.ended_at).not.toBeNull();
  } finally {
    await borrarVivosDeTienda(tienda.id);
    await borrarUsuarioPrueba(duena.id);
  }
});
