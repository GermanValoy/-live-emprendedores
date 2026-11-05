import { devices, expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { borrarUsuarioPrueba, clienteAdmin, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { borrarChatDeTienda, borrarVivosDeTienda, crearTiendaPrueba, crearTransmisionPrueba, publicarPrueba } from "../helpers/tiendas-prueba";
import { cookiesDeSesion } from "./sesion";

// La transmisión apunta a cloudflare.invalid: el video nunca conecta; acá solo importa el chat del estudio.

const usuarios: UsuarioPrueba[] = [];
const tiendas: string[] = [];
const contextos: BrowserContext[] = [];

test.afterEach(async () => {
  for (const c of contextos.splice(0)) await c.close();
  for (const id of tiendas) {
    await borrarChatDeTienda(id);
    await borrarVivosDeTienda(id);
  }
});

test.afterAll(async () => {
  for (const u of usuarios) await borrarUsuarioPrueba(u.id);
});

type Puesto = { id: string; handle: string };

async function nuevaMica(): Promise<{ mica: UsuarioPrueba; tienda: Puesto }> {
  const mica = await crearUsuarioPrueba({ nombre: "Mica Estudio Chat" });
  usuarios.push(mica);
  const tienda = await crearTiendaPrueba(mica, { conProducto: true });
  tiendas.push(tienda.id);
  await crearTransmisionPrueba(tienda.id);
  return { mica, tienda };
}

async function nuevaCompradora(nombre: string): Promise<UsuarioPrueba> {
  const u = await crearUsuarioPrueba({ nombre });
  usuarios.push(u);
  return u;
}

/** Mica abre su estudio: sale en vivo sola y el chat queda escuchando. */
async function abrirEstudio(browser: Browser, mica: UsuarioPrueba): Promise<Page> {
  const contexto = await browser.newContext({
    ...devices["Pixel 7"],
    baseURL: test.info().project.use.baseURL,
    permissions: ["camera", "microphone"],
  });
  contextos.push(contexto);
  await contexto.addCookies(await cookiesDeSesion(mica.sesion));
  const page = await contexto.newPage();
  await page.goto("/mi-puesto/vivo");
  await expect(page.getByText("EN VIVO", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-chat="listo"]')).toBeAttached({ timeout: 30_000 });
  return page;
}

async function entrar(browser: Browser, tienda: Puesto, usuario: UsuarioPrueba): Promise<Page> {
  const contexto = await browser.newContext({ ...devices["Pixel 7"], baseURL: test.info().project.use.baseURL });
  contextos.push(contexto);
  await contexto.addCookies(await cookiesDeSesion(usuario.sesion));
  const page = await contexto.newPage();
  await page.goto(`/@${tienda.handle}/vivo`);
  await expect(page.locator('[data-chat="listo"]')).toBeAttached({ timeout: 30_000 });
  return page;
}

async function escribir(page: Page, texto: string) {
  await page.getByPlaceholder("Escribí un mensaje…").fill(texto);
  await page.getByRole("button", { name: "Enviar" }).click();
}

async function vivoDe(storeId: string): Promise<string> {
  const { data, error } = await clienteAdmin().from("live_sessions").select("id").eq("store_id", storeId).is("ended_at", null).single();
  if (error) throw error;
  return data.id as string;
}

test("la feriante lee y responde", async ({ browser }) => {
  test.slow();
  const { mica, tienda } = await nuevaMica();
  const caro = await nuevaCompradora("Carolina Medina");
  const estudio = await abrirEstudio(browser, mica);
  const paginaCaro = await entrar(browser, tienda, caro);
  await escribir(paginaCaro, "¿tenés talle 38?");
  await expect(estudio.getByText("¿tenés talle 38?")).toBeVisible({ timeout: 10_000 });
  await escribir(estudio, "sí, en 38, 40 y 42");
  await expect(estudio.getByText("sí, en 38, 40 y 42")).toBeVisible();
  const respuesta = paginaCaro.getByText("sí, en 38, 40 y 42");
  await expect(respuesta).toBeVisible({ timeout: 10_000 });
  await expect(paginaCaro.getByTestId("burbuja").filter({ hasText: "sí, en 38, 40 y 42" })).toContainText("✔");
});

test("borrar un mensaje", async ({ browser }) => {
  test.slow();
  const { mica, tienda } = await nuevaMica();
  const caro = await nuevaCompradora("Carolina Medina");
  const luz = await nuevaCompradora("Luz Pereyra");
  const estudio = await abrirEstudio(browser, mica);
  const paginaCaro = await entrar(browser, tienda, caro);
  const paginaLuz = await entrar(browser, tienda, luz);
  await escribir(paginaCaro, "mensaje para borrar");
  await expect(estudio.getByText("mensaje para borrar")).toBeVisible({ timeout: 10_000 });
  await expect(paginaLuz.getByText("mensaje para borrar")).toBeVisible({ timeout: 10_000 });
  await estudio.getByRole("button", { name: /Carolina M\..*mensaje para borrar/ }).click();
  await estudio.getByRole("button", { name: "Borrar este mensaje" }).click();
  await expect(estudio.getByText("Borraste el mensaje.")).toBeVisible();
  await expect(estudio.getByText("mensaje para borrar")).toHaveCount(0);
  // En la sala de otra compradora desaparece sin recargar.
  await expect(paginaLuz.getByText("mensaje para borrar")).toHaveCount(0, { timeout: 10_000 });
});

test("silenciar 10 minutos", async ({ browser }) => {
  test.slow();
  const { mica, tienda } = await nuevaMica();
  const caro = await nuevaCompradora("Carolina Medina");
  const estudio = await abrirEstudio(browser, mica);
  const paginaCaro = await entrar(browser, tienda, caro);
  await escribir(paginaCaro, "hola a todas");
  await estudio.getByRole("button", { name: /Carolina M\..*hola a todas/ }).click();
  await estudio.getByRole("button", { name: /Silenciar 10 minutos/ }).click();
  await expect(estudio.getByText("Silenciaste a Carolina M. por 10 minutos.")).toBeVisible();
  await expect(paginaCaro.getByText("No podés escribir en este vivo por un rato.")).toBeVisible({ timeout: 10_000 });
  await expect(paginaCaro.getByPlaceholder("Escribí un mensaje…")).toHaveCount(0);
});

test("silenciar en mi sala", async ({ browser }) => {
  test.slow();
  const { mica, tienda } = await nuevaMica();
  const caro = await nuevaCompradora("Carolina Medina");
  const estudio = await abrirEstudio(browser, mica);
  const paginaCaro = await entrar(browser, tienda, caro);
  await escribir(paginaCaro, "hola a todas");
  await estudio.getByRole("button", { name: /Carolina M\..*hola a todas/ }).click();
  await estudio.getByRole("button", { name: /Silenciar en mi sala/ }).click();
  await expect(estudio.getByText("Silenciaste a Carolina M. en tu sala.")).toBeVisible();
  await expect(paginaCaro.getByText("No podés escribir en esta sala.")).toBeVisible({ timeout: 10_000 });
});

test("sus mensajes no abren el panel", async ({ browser }) => {
  test.slow();
  const { mica } = await nuevaMica();
  const estudio = await abrirEstudio(browser, mica);
  await escribir(estudio, "mi propio mensaje");
  await expect(estudio.getByText("mi propio mensaje")).toBeVisible();
  // Se espera la copia confirmada por el servidor, no la que se ve mientras se envía.
  const burbuja = estudio.getByTestId("burbuja").filter({ hasText: "mi propio mensaje" });
  await expect(burbuja).toHaveAttribute("data-estado", "ok", { timeout: 15_000 });
  await burbuja.getByText("mi propio mensaje").click();
  await expect(estudio.getByRole("button", { name: "Borrar este mensaje" })).not.toBeVisible();
});

test("los ocultos no le aparecen", async ({ browser }) => {
  test.slow();
  const { mica, tienda } = await nuevaMica();
  const caro = await nuevaCompradora("Carolina Medina");
  const estudio = await abrirEstudio(browser, mica);
  const paginaCaro = await entrar(browser, tienda, caro);
  await escribir(paginaCaro, "mirá www.ofertas.com");
  await expect(paginaCaro.getByText("mirá www.ofertas.com")).toBeVisible();
  await estudio.waitForTimeout(3_000);
  await expect(estudio.getByText("www.ofertas.com")).toHaveCount(0);
  await escribir(paginaCaro, "hola a todas");
  await expect(estudio.getByText("hola a todas")).toBeVisible({ timeout: 10_000 });
  await expect(estudio.getByText("www.ofertas.com")).toHaveCount(0);
});

test("los botones del estudio siguen andando con chat", async ({ browser }) => {
  test.slow();
  const { mica, tienda } = await nuevaMica();
  const caro = await nuevaCompradora("Carolina Medina");
  const estudio = await abrirEstudio(browser, mica);
  const vivo = await vivoDe(tienda.id);
  // La base frena más de 5 mensajes seguidos de la misma persona: se publican en dos tandas.
  for (let n = 1; n <= 10; n++) {
    if (n === 6) await estudio.waitForTimeout(11_000);
    await publicarPrueba(caro.id, vivo, `mensaje número ${n}`);
  }
  await expect(estudio.getByText("mensaje número 10")).toBeVisible({ timeout: 15_000 });
  await estudio.getByRole("button", { name: "Cambiar cámara" }).click({ trial: true });
  await estudio.getByRole("button", { name: "Silenciar" }).click({ trial: true });
  await estudio.getByRole("button", { name: "Terminar" }).click();
  await expect(estudio.getByText("¿Seguro que querés terminar el vivo?")).toBeVisible();
  await estudio.getByRole("button", { name: "Seguir en vivo" }).click();
  await expect(estudio.getByText("¿Seguro que querés terminar el vivo?")).toHaveCount(0);
});

test("con el chat lleno, Activar sonido se puede tocar en un celular chico", async ({ browser }) => {
  test.slow();
  const { mica, tienda } = await nuevaMica();
  const caro = await nuevaCompradora("Carolina Medina");
  const estudio = await abrirEstudio(browser, mica);
  await estudio.setViewportSize({ width: 375, height: 667 });
  const vivo = await vivoDe(tienda.id);
  for (let n = 1; n <= 10; n++) {
    if (n === 6) await estudio.waitForTimeout(11_000);
    await publicarPrueba(caro.id, vivo, `mensaje número ${n}`);
  }
  await expect(estudio.getByText("mensaje número 10")).toBeVisible({ timeout: 15_000 });
  // Sale de la pantalla y vuelve: queda el cartel "Estás silenciada".
  await estudio.evaluate(() => {
    for (const e of ["hidden", "visible"]) {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => e });
      document.dispatchEvent(new Event("visibilitychange"));
    }
  });
  await expect(estudio.getByText("Estás silenciada")).toBeVisible();
  const boton = estudio.getByRole("status").getByRole("button", { name: "Activar sonido" });
  await boton.click();
  await expect(estudio.getByText("Estás silenciada")).toHaveCount(0);
});
