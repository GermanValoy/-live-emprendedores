import { expect, test } from "@playwright/test";
import { borrarUsuarioPrueba, clienteAdmin, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { borrarChatDeTienda, borrarVivosDeTienda, crearTiendaPrueba, crearTransmisionPrueba, hacerAdmin, publicarPrueba } from "../helpers/tiendas-prueba";
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

test("la admin revisa y silencia una cuenta", async ({ page, context }) => {
  const caro = await crearUsuarioPrueba({ nombre: "Revisada Cuenta" });
  const duenas: UsuarioPrueba[] = [];
  const tiendas: { id: string }[] = [];
  try {
    for (let n = 1; n <= 3; n++) {
      const d = await crearUsuarioPrueba({ nombre: `Duena Revision ${n}` });
      duenas.push(d);
      tiendas.push(await crearTiendaPrueba(d, { conProducto: true }));
    }
    await crearTransmisionPrueba(tiendas[0]!.id);
    const { data: vivo, error } = await duenas[0]!.cliente.rpc("abrir_vivo", { p_store: tiendas[0]!.id, p_device: crypto.randomUUID() });
    if (error) throw error;
    await publicarPrueba(caro.id, vivo as string, "mirá www.ofertas.com", "link");
    const normal = (await publicarPrueba(caro.id, vivo as string, "mensaje que se borra")).mensaje as { id: string };
    const borrado = await duenas[0]!.cliente.rpc("borrar_mensaje", { p_mensaje: normal.id });
    if (borrado.error) throw borrado.error;
    for (let n = 0; n < 3; n++) {
      const r = await duenas[n]!.cliente.rpc("silenciar_en_sala", { p_store: tiendas[n]!.id, p_user: caro.id, p_tipo: "sala" });
      if (r.error) throw r.error;
    }

    await context.addCookies(await cookiesDeSesion(admin.sesion));
    await page.goto("/admin");
    const fila = page.getByRole("listitem").filter({ hasText: "Revisada Cuenta" });
    await expect(fila).toBeVisible();
    await expect(fila).toContainText("Silenciada en 3 salas");

    await fila.getByRole("button", { name: "Ver mensajes" }).click();
    const oculto = fila.getByRole("listitem").filter({ hasText: "www.ofertas.com" });
    await expect(oculto).toContainText("oculto");
    const borrada = fila.getByRole("listitem").filter({ hasText: "mensaje que se borra" });
    await expect(borrada).toContainText("borrado");

    await fila.getByRole("button", { name: "Silenciar en toda la plataforma" }).click();
    await expect(fila.getByRole("button", { name: "Quitar silencio de la plataforma" })).toBeVisible();
    expect(await publicarPrueba(caro.id, vivo as string, "hola")).toEqual({ estado: "silenciada", tipo: "plataforma" });

    await fila.getByRole("button", { name: "Quitar silencio de la plataforma" }).click();
    await expect(fila.getByRole("button", { name: "Silenciar en toda la plataforma" })).toBeVisible();
    // Sigue silenciada en las tres salas: la plataforma ya no la frena, pero las salas sí.
    expect(await publicarPrueba(caro.id, vivo as string, "hola")).toEqual({ estado: "silenciada", tipo: "sala" });
  } finally {
    for (const t of tiendas) {
      await borrarChatDeTienda(t.id);
      await borrarVivosDeTienda(t.id);
    }
    for (const u of [caro, ...duenas]) await borrarUsuarioPrueba(u.id);
  }
});
