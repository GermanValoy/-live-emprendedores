import { devices, expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { borrarChatDeTienda, borrarCodigosDeTienda, borrarFotosDeTienda, borrarVivosDeTienda, crearTiendaPrueba, crearTransmisionPrueba, lanzarPrueba } from "../helpers/tiendas-prueba";
import { borrarUsuarioPrueba, clienteAdmin, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { cookiesDeSesion } from "./sesion";
import { responderVozVacia } from "./voz";

// Darle una prenda de un código que ya pasó a quien preguntó por ella en el chat.
// La transmisión apunta a cloudflare.invalid: el video nunca conecta; acá importan el estudio, el chat y el pago.

const usuarios: UsuarioPrueba[] = [];
const contextos: BrowserContext[] = [];
let tiendaId = "";

test.beforeEach(async ({ context }) => {
  await responderVozVacia(context);
});

test.afterAll(async () => {
  for (const c of contextos.splice(0)) await c.close();
  if (tiendaId) {
    await borrarCodigosDeTienda(tiendaId);
    await borrarChatDeTienda(tiendaId);
    await borrarVivosDeTienda(tiendaId);
    await borrarFotosDeTienda(tiendaId);
  }
  for (const u of usuarios) await borrarUsuarioPrueba(u.id);
});

async function entrar(browser: Browser, handle: string, usuario: UsuarioPrueba): Promise<Page> {
  const contexto = await browser.newContext({ ...devices["Pixel 7"], baseURL: test.info().project.use.baseURL });
  contextos.push(contexto);
  await contexto.addCookies(await cookiesDeSesion(usuario.sesion));
  const page = await contexto.newPage();
  await page.goto(`/@${handle}/vivo`);
  await expect(page.locator('[data-chat="listo"]')).toBeAttached({ timeout: 30_000 });
  return page;
}

test("la feriante le da una prenda de un código anterior a quien preguntó en el chat", async ({ page, context, browser }) => {
  test.setTimeout(180_000);
  const mica = await crearUsuarioPrueba({ nombre: "Mica Prendas" });
  const caro = await crearUsuarioPrueba({ nombre: "Carolina Medina" });
  const luz = await crearUsuarioPrueba({ nombre: "Luz Quiroga" });
  usuarios.push(mica, caro, luz);
  const tienda = await crearTiendaPrueba(mica);
  tiendaId = tienda.id;
  await crearTransmisionPrueba(tienda.id);
  await context.addCookies(await cookiesDeSesion(mica.sesion));

  await page.goto("/mi-puesto/vivo");
  await expect(page.getByText("EN VIVO", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-chat="listo"]')).toBeAttached({ timeout: 30_000 });
  const paginaCaro = await entrar(browser, tienda.handle, caro);
  const paginaLuz = await entrar(browser, tienda.handle, luz);

  // ROJO y después VERDE: ROJO queda cerrado con una unidad sin vender; VERDE sigue activo.
  const { data: vivo, error } = await clienteAdmin().from("live_sessions").select("id").eq("store_id", tienda.id).is("ended_at", null).single();
  if (error) throw error;
  await lanzarPrueba(mica.cliente, vivo.id as string, "rojo", { precio: 800000 });
  await lanzarPrueba(mica.cliente, vivo.id as string, "verde", { precio: 500000 });
  await expect(page.getByText("Código VERDE · 0 de 1 vendidos")).toBeVisible({ timeout: 15_000 });

  // Caro pregunta por el rojo; Mica toca su mensaje.
  await paginaCaro.getByPlaceholder("Escribí un mensaje o un código…").fill("¿y el rojo?");
  await paginaCaro.getByRole("button", { name: "Enviar" }).click();
  const mensaje = page.getByText("¿y el rojo?");
  await expect(mensaje).toBeVisible({ timeout: 15_000 });
  await mensaje.click();
  await page.getByRole("button", { name: /Darle una prenda/ }).click();

  const panel = page.getByRole("dialog", { name: /¿Qué prenda le das a / });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: /VERDE/ })).toHaveCount(0);
  await panel.getByRole("button", { name: /ROJO/ }).click();
  await expect(page.getByText(/^Le diste el ROJO a /)).toBeVisible({ timeout: 15_000 });

  // A Caro se le abre el panel con los datos para pagar.
  await expect(paginaCaro.getByText("¡Ganaste el código ROJO!")).toBeVisible({ timeout: 15_000 });
  await expect(paginaCaro.getByText("prueba.alias")).toBeVisible();

  // En la sala de un tercero aparece el cartel de la ganadora.
  await expect(paginaLuz.getByText("🎉 ROJO es de", { exact: false })).toBeVisible({ timeout: 15_000 });

  // En Pedidos, Mica ve que la dio ella.
  await page.goto("/mi-puesto/pedidos");
  await expect(page.getByText("Se la diste vos")).toBeVisible({ timeout: 20_000 });
});
