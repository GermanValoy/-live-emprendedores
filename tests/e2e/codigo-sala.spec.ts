import { devices, expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { borrarUsuarioPrueba, clienteAdmin, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { borrarChatDeTienda, borrarCodigosDeTienda, borrarVivosDeTienda, crearTiendaPrueba, crearTransmisionPrueba, lanzarPrueba } from "../helpers/tiendas-prueba";
import { cookiesDeSesion } from "./sesion";

// La transmisión apunta a cloudflare.invalid: el video nunca conecta; acá solo importa el código en la sala.

const usuarios: UsuarioPrueba[] = [];
const tiendas: string[] = [];
const contextos: BrowserContext[] = [];

test.afterEach(async () => {
  for (const c of contextos.splice(0)) await c.close();
  for (const id of tiendas) {
    await borrarCodigosDeTienda(id);
    await borrarChatDeTienda(id);
    await borrarVivosDeTienda(id);
  }
});

test.afterAll(async () => {
  for (const u of usuarios) await borrarUsuarioPrueba(u.id);
});

type Puesto = { id: string; handle: string };

async function nuevaMica(): Promise<{ mica: UsuarioPrueba; tienda: Puesto; vivo: string }> {
  const mica = await crearUsuarioPrueba({ nombre: "Mica Código" });
  usuarios.push(mica);
  const tienda = await crearTiendaPrueba(mica, { conProducto: true });
  tiendas.push(tienda.id);
  const { error } = await clienteAdmin().from("stores").update({ name: "Mica" }).eq("id", tienda.id);
  if (error) throw error;
  await crearTransmisionPrueba(tienda.id);
  const abrir = await mica.cliente.rpc("abrir_vivo", { p_store: tienda.id, p_device: crypto.randomUUID() });
  if (abrir.error) throw abrir.error;
  return { mica, tienda, vivo: abrir.data as string };
}

async function nuevaCompradora(nombre: string): Promise<UsuarioPrueba> {
  const u = await crearUsuarioPrueba({ nombre });
  usuarios.push(u);
  return u;
}

async function entrar(browser: Browser, tienda: Puesto, usuario: UsuarioPrueba, conReloj = false): Promise<Page> {
  const contexto = await browser.newContext({ ...devices["Pixel 7"], baseURL: test.info().project.use.baseURL });
  contextos.push(contexto);
  await contexto.addCookies(await cookiesDeSesion(usuario.sesion));
  const page = await contexto.newPage();
  if (conReloj) await page.clock.install();
  await page.goto(`/@${tienda.handle}/vivo`);
  await expect(page.locator('[data-chat="listo"]')).toBeAttached({ timeout: 30_000 });
  return page;
}

async function escribir(page: Page, texto: string) {
  await page.getByPlaceholder("Escribí un mensaje o un código…").fill(texto);
  await page.getByRole("button", { name: "Enviar" }).click();
}

test("el código se ve, se festeja a la ganadora y se avisa a la que llegó segunda", async ({ browser }) => {
  test.slow();
  const { mica, tienda, vivo } = await nuevaMica();
  const caro = await nuevaCompradora("Carolina Medina");
  const luz = await nuevaCompradora("Luz Pereyra");
  const paginaCaro = await entrar(browser, tienda, caro, true);
  const paginaLuz = await entrar(browser, tienda, luz);
  await lanzarPrueba(mica.cliente, vivo, "rojo");

  for (const p of [paginaCaro, paginaLuz]) {
    await expect(p.getByText("ROJO", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    await expect(p.getByText("$8.000")).toBeVisible();
    await expect(p.getByText("Quedan 1")).toBeVisible();
    await expect(p.getByText("Escribilo en el chat")).toBeVisible();
  }

  await escribir(paginaCaro, "rojo");
  for (const p of [paginaCaro, paginaLuz]) {
    await expect(p.getByText("🎉 ROJO es de")).toBeVisible({ timeout: 10_000 });
    await expect(p.getByText("ROJO es de Carolina M.")).toBeVisible();
    await expect(p.getByText("Agotado")).toBeVisible();
  }

  await escribir(paginaLuz, "ROJO");
  await expect(paginaLuz.getByText("llegó primero. Quedaste 1.ª en la lista")).toBeVisible({ timeout: 10_000 });
  await escribir(paginaLuz, "¿el rojo qué talle?");
  await expect(paginaLuz.getByText("¿Lo querés? Escribí ROJO")).toBeVisible({ timeout: 10_000 });

  // El cartel se va solo pasado el tiempo.
  await paginaCaro.clock.fastForward(30_000);
  await expect(paginaCaro.getByText("ROJO es de Carolina M.")).toHaveCount(0);
});

test("la compradora que ganó se entera si la feriante anula el código", async ({ browser }) => {
  test.slow();
  const { mica, tienda, vivo } = await nuevaMica();
  const caro = await nuevaCompradora("Carolina Medina");
  const paginaCaro = await entrar(browser, tienda, caro);
  const { id } = await lanzarPrueba(mica.cliente, vivo, "azul");
  await expect(paginaCaro.getByText("AZUL", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  await escribir(paginaCaro, "azul");
  await expect(paginaCaro.getByText("Agotado")).toBeVisible({ timeout: 10_000 });
  const anular = await mica.cliente.rpc("anular_codigo", { p_codigo: id });
  if (anular.error) throw anular.error;
  await expect(paginaCaro.getByText("La feriante anuló este código.")).toBeVisible({ timeout: 10_000 });
});
