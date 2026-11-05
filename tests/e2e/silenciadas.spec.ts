import { expect, test } from "@playwright/test";
import { borrarUsuarioPrueba, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { borrarChatDeTienda, borrarVivosDeTienda, crearTiendaPrueba, crearTransmisionPrueba, publicarPrueba } from "../helpers/tiendas-prueba";
import { cookiesDeSesion } from "./sesion";

// Cada prueba arma su propia feriante, tienda y vivo; van de a una.
test.describe.configure({ mode: "serial" });

const usuarios: UsuarioPrueba[] = [];
const tiendas: string[] = [];

test.afterEach(async () => {
  for (const id of tiendas.splice(0)) {
    await borrarChatDeTienda(id);
    await borrarVivosDeTienda(id);
  }
});

test.afterAll(async () => {
  for (const u of usuarios) await borrarUsuarioPrueba(u.id);
});

async function preparar() {
  const mica = await crearUsuarioPrueba({ nombre: "Mica Silencios" });
  const caro = await crearUsuarioPrueba({ nombre: "Caro Silenciada" });
  usuarios.push(mica, caro);
  const tienda = await crearTiendaPrueba(mica, { conProducto: true });
  tiendas.push(tienda.id);
  await crearTransmisionPrueba(tienda.id);
  const { data: vivo, error } = await mica.cliente.rpc("abrir_vivo", { p_store: tienda.id, p_device: crypto.randomUUID() });
  if (error) throw error;
  return { mica, caro, tienda, vivo: vivo as string };
}

test("la feriante quita un silencio", async ({ page, context }) => {
  const { mica, caro, tienda, vivo } = await preparar();
  expect((await publicarPrueba(caro.id, vivo, "hola")).estado).toBe("ok");
  const { error } = await mica.cliente.rpc("silenciar_en_sala", { p_store: tienda.id, p_user: caro.id, p_tipo: "sala" });
  if (error) throw error;
  expect((await publicarPrueba(caro.id, vivo, "otra")).estado).toBe("silenciada");

  await context.addCookies(await cookiesDeSesion(mica.sesion));
  await page.goto("/mi-puesto");
  const seccion = page.getByRole("region", { name: "Personas silenciadas" });
  const fila = seccion.getByRole("listitem").filter({ hasText: "Prueba P." });
  await expect(fila).toBeVisible();
  await expect(fila).toContainText("desde ");
  await fila.getByRole("button", { name: "Quitar silencio" }).click();
  await expect(seccion.getByText("No silenciaste a nadie.")).toBeVisible();
  expect((await publicarPrueba(caro.id, vivo, "ya puedo")).estado).toBe("ok");
});

test("sin silenciadas", async ({ page, context }) => {
  const { mica } = await preparar();
  await context.addCookies(await cookiesDeSesion(mica.sesion));
  await page.goto("/mi-puesto");
  await expect(page.getByRole("heading", { name: "Personas silenciadas" })).toBeVisible();
  await expect(page.getByText("No silenciaste a nadie.")).toBeVisible();
});
