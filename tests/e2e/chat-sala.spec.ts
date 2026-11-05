import { devices, expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { borrarUsuarioPrueba, clienteAdmin, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { borrarChatDeTienda, borrarVivosDeTienda, crearTiendaPrueba, crearTransmisionPrueba, publicarPrueba } from "../helpers/tiendas-prueba";
import { cookiesDeSesion } from "./sesion";

// La transmisión apunta a cloudflare.invalid: el video nunca conecta; acá solo importa el chat.

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

async function nuevaMica(): Promise<{ mica: UsuarioPrueba; tienda: Puesto; vivo: string }> {
  const mica = await crearUsuarioPrueba({ nombre: "Mica Chat" });
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

/** Abre la sala como una persona (con sesión, o sin ella) y espera a que el chat esté escuchando. */
async function entrar(browser: Browser, tienda: Puesto, usuario: UsuarioPrueba | null): Promise<Page> {
  const contexto = await browser.newContext({ ...devices["Pixel 7"], baseURL: test.info().project.use.baseURL });
  contextos.push(contexto);
  if (usuario) await contexto.addCookies(await cookiesDeSesion(usuario.sesion));
  const page = await contexto.newPage();
  await page.goto(`/@${tienda.handle}/vivo`);
  await expect(page.locator('[data-chat="listo"]')).toBeAttached({ timeout: 30_000 });
  return page;
}

async function escribir(page: Page, texto: string) {
  await page.getByPlaceholder("Escribí un mensaje…").fill(texto);
  await page.getByRole("button", { name: "Enviar" }).click();
}

test("dos compradoras charlan", async ({ browser }) => {
  const { tienda } = await nuevaMica();
  const caro = await nuevaCompradora("Carolina Medina");
  const luz = await nuevaCompradora("Luz Pereyra");
  const paginaCaro = await entrar(browser, tienda, caro);
  const paginaLuz = await entrar(browser, tienda, luz);
  await escribir(paginaCaro, "¿viene en 40?");
  await expect(paginaCaro.getByText("¿viene en 40?")).toBeVisible();
  await expect(paginaLuz.getByText("¿viene en 40?")).toBeVisible({ timeout: 5_000 });
  await expect(paginaLuz.getByText("Carolina M.")).toBeVisible();
  // Sin duplicados en la pantalla de quien escribió.
  await expect(paginaCaro.getByText("¿viene en 40?")).toHaveCount(1);
});

test("sin conexión queda Reintentar", async ({ browser }) => {
  test.slow();
  const { tienda } = await nuevaMica();
  const caro = await nuevaCompradora("Carolina Medina");
  const luz = await nuevaCompradora("Luz Pereyra");
  const paginaCaro = await entrar(browser, tienda, caro);
  const paginaLuz = await entrar(browser, tienda, luz);
  await paginaCaro.context().setOffline(true);
  await escribir(paginaCaro, "hola sin señal");
  await expect(paginaCaro.getByRole("button", { name: "Reintentar" })).toBeVisible({ timeout: 15_000 });
  await paginaCaro.context().setOffline(false);
  await paginaCaro.getByRole("button", { name: "Reintentar" }).click();
  await expect(paginaCaro.getByRole("button", { name: "Reintentar" })).toHaveCount(0, { timeout: 15_000 });
  await expect(paginaLuz.getByText("hola sin señal")).toBeVisible({ timeout: 20_000 });
  await expect(paginaCaro.getByText("hola sin señal")).toHaveCount(1);
});

test("la visitante lee pero no escribe", async ({ browser }) => {
  const { tienda, vivo } = await nuevaMica();
  const caro = await nuevaCompradora("Carolina Medina");
  await publicarPrueba(caro.id, vivo, "buenas tardes");
  const visita = await entrar(browser, tienda, null);
  await expect(visita.getByText("buenas tardes")).toBeVisible();
  await expect(visita.getByRole("button", { name: "Entrá con Google para escribir" })).toBeVisible();
  await expect(visita.getByPlaceholder("Escribí un mensaje…")).toHaveCount(0);
});

test("un link solo lo ve quien lo escribió", async ({ browser }) => {
  const { tienda } = await nuevaMica();
  const caro = await nuevaCompradora("Carolina Medina");
  const luz = await nuevaCompradora("Luz Pereyra");
  const paginaCaro = await entrar(browser, tienda, caro);
  const paginaLuz = await entrar(browser, tienda, luz);
  await escribir(paginaCaro, "mirá www.ofertas.com");
  await expect(paginaCaro.getByText("mirá www.ofertas.com")).toBeVisible();
  await paginaLuz.waitForTimeout(3_000);
  await expect(paginaLuz.getByText("www.ofertas.com")).toHaveCount(0);
  await escribir(paginaCaro, "hola a todas");
  await expect(paginaLuz.getByText("hola a todas")).toBeVisible({ timeout: 5_000 });
  await expect(paginaLuz.getByText("www.ofertas.com")).toHaveCount(0);
});

test("ráfaga", async ({ browser }) => {
  const { tienda } = await nuevaMica();
  const caro = await nuevaCompradora("Carolina Medina");
  const pagina = await entrar(browser, tienda, caro);
  for (const n of ["uno", "dos", "tres", "cuatro", "cinco", "seis"]) await escribir(pagina, `mensaje ${n}`);
  await expect(pagina.getByText("Esperá un ratito para volver a escribir.")).toBeVisible({ timeout: 10_000 });
});

test("silenciada", async ({ browser }) => {
  const { mica, tienda } = await nuevaMica();
  const caro = await nuevaCompradora("Carolina Medina");
  const pagina = await entrar(browser, tienda, caro);
  await escribir(pagina, "primer mensaje");
  await expect(pagina.getByText("primer mensaje")).toBeVisible();
  const { error } = await mica.cliente.rpc("silenciar_en_sala", { p_store: tienda.id, p_user: caro.id, p_tipo: "temporal" });
  if (error) throw error;
  await expect(pagina.getByText("No podés escribir en este vivo por un rato.")).toBeVisible({ timeout: 10_000 });
  await expect(pagina.getByPlaceholder("Escribí un mensaje…")).toHaveCount(0);
});

test("quien entra tarde ve los últimos mensajes", async ({ browser }) => {
  const { tienda, vivo } = await nuevaMica();
  const caro = await nuevaCompradora("Carolina Medina");
  const luz = await nuevaCompradora("Luz Pereyra");
  for (const t of ["primero", "segundo", "tercero"]) await publicarPrueba(caro.id, vivo, t);
  const pagina = await entrar(browser, tienda, luz);
  await expect(pagina.getByText("tercero")).toBeVisible();
  const textos = await pagina.locator('[data-testid="burbuja"]').allInnerTexts();
  const orden = ["primero", "segundo", "tercero"].map((t) => textos.findIndex((x) => x.includes(t)));
  expect(orden.every((i) => i >= 0)).toBe(true);
  expect([...orden].sort((a, b) => a - b)).toEqual(orden);
});

test("enviar con el vivo cerrado", async ({ browser }) => {
  const { mica, tienda, vivo } = await nuevaMica();
  const caro = await nuevaCompradora("Carolina Medina");
  const pagina = await entrar(browser, tienda, caro);
  const { error } = await mica.cliente.rpc("terminar_vivo", { p_vivo: vivo });
  if (error) throw error;
  await expect(pagina.getByRole("heading", { name: "¡Gracias por venir!" })).toBeVisible({ timeout: 30_000 });
  await expect(pagina.getByPlaceholder("Escribí un mensaje…")).toHaveCount(0);
  await expect(pagina.getByRole("button", { name: "Reintentar" })).toHaveCount(0);
});

test("esconder el chat", async ({ browser }) => {
  const { tienda, vivo } = await nuevaMica();
  const caro = await nuevaCompradora("Carolina Medina");
  await publicarPrueba(caro.id, vivo, "algo para ver");
  const pagina = await entrar(browser, tienda, caro);
  await expect(pagina.getByText("algo para ver")).toBeVisible();
  await pagina.getByRole("button", { name: "Esconder el chat" }).click();
  await expect(pagina.getByText("algo para ver")).toHaveCount(0);
  await pagina.getByRole("button", { name: "Mostrar el chat" }).click();
  await expect(pagina.getByText("algo para ver")).toBeVisible();
});

test("200 caracteres", async ({ browser }) => {
  const { tienda } = await nuevaMica();
  const caro = await nuevaCompradora("Carolina Medina");
  const pagina = await entrar(browser, tienda, caro);
  const campo = pagina.getByPlaceholder("Escribí un mensaje…");
  await campo.fill("a".repeat(201));
  await expect(campo).toHaveValue("a".repeat(200));
});

test("un vivo nuevo no muestra los mensajes del anterior", async ({ browser }) => {
  const { mica, tienda, vivo } = await nuevaMica();
  const caro = await nuevaCompradora("Carolina Medina");
  const luz = await nuevaCompradora("Luz Pereyra");
  await publicarPrueba(luz.id, vivo, "mensaje del vivo viejo");
  const pagina = await entrar(browser, tienda, caro);
  await expect(pagina.getByText("mensaje del vivo viejo")).toBeVisible();
  const fin = await mica.cliente.rpc("terminar_vivo", { p_vivo: vivo });
  if (fin.error) throw fin.error;
  await expect(pagina.getByRole("heading", { name: "¡Gracias por venir!" })).toBeVisible({ timeout: 30_000 });
  const nuevo = await mica.cliente.rpc("abrir_vivo", { p_store: tienda.id, p_device: crypto.randomUUID() });
  if (nuevo.error) throw nuevo.error;
  await expect(pagina.getByText("EN VIVO", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(pagina.locator('[data-chat="listo"]')).toBeAttached({ timeout: 30_000 });
  await expect(pagina.getByText("mensaje del vivo viejo")).toHaveCount(0);
  await publicarPrueba(luz.id, nuevo.data as string, "mensaje del vivo nuevo");
  await expect(pagina.getByText("mensaje del vivo nuevo")).toBeVisible({ timeout: 10_000 });
  await expect(pagina.getByText("mensaje del vivo viejo")).toHaveCount(0);
});

test("el chat no tapa los botones de la sala", async ({ browser }) => {
  test.slow();
  const { tienda } = await nuevaMica();
  const caro = await nuevaCompradora("Carolina Medina");
  const pagina = await entrar(browser, tienda, caro);
  for (const n of ["uno", "dos", "tres", "cuatro", "cinco", "seis"]) await escribir(pagina, `mensaje ${n}`);
  await expect(pagina.getByText("Esperá un ratito para volver a escribir.")).toBeVisible({ timeout: 10_000 });
  await pagina.getByRole("button", { name: "Seguir" }).click({ trial: true });
  await pagina.getByRole("link", { name: "Cerrar la sala" }).click({ trial: true });
  // El botón de sonido (si aparece) queda por encima del chat, sin que nada lo cubra.
  const sonido = pagina.getByRole("button", { name: /activar el sonido/ });
  if (await sonido.count()) await sonido.click({ trial: true });
  // La zona de burbujas deja pasar los toques al video.
  const lista = pagina.getByRole("list", { name: "Chat del vivo" });
  expect(await lista.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
});
