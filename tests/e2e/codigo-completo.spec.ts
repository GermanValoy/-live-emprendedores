import { devices, expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { borrarChatDeTienda, borrarCodigosDeTienda, borrarFotosDeTienda, borrarVivosDeTienda, crearTiendaPrueba, crearTransmisionPrueba, lanzarPrueba, reclamarPrueba } from "../helpers/tiendas-prueba";
import { borrarUsuarioPrueba, clienteAdmin, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { elegirFoto } from "./fotos";
import { cookiesDeSesion } from "./sesion";
import { responderVozVacia } from "./voz";

// Recorrido completo del código en vivo (CLAUDE.md §12). La transmisión apunta a cloudflare.invalid:
// el video nunca conecta; acá importan el estudio, el chat, el pago y los pedidos.

const usuarios: UsuarioPrueba[] = [];
const contextos: BrowserContext[] = [];
let tiendaId = "";
const FOTO = "tests/e2e/fixtures/foto-de-costado.jpg";

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

async function escribir(page: Page, texto: string) {
  await page.getByPlaceholder("Escribí un mensaje o un código…").fill(texto);
  await page.getByRole("button", { name: "Enviar" }).click();
}

test("de punta a punta: lanzar, ganar, pagar, confirmar y ver la dirección; y un pedido vencido pasa a la siguiente", async ({ page, context, browser }) => {
  test.setTimeout(240_000);
  const mica = await crearUsuarioPrueba({ nombre: "Mica Completa" });
  const caro = await crearUsuarioPrueba({ nombre: "Carolina Medina" });
  const luz = await crearUsuarioPrueba({ nombre: "Luz Quiroga" });
  usuarios.push(mica, caro, luz);
  const tienda = await crearTiendaPrueba(mica);
  tiendaId = tienda.id;
  const admin = clienteAdmin();
  const nombre = await admin.from("stores").update({ name: "Mica" }).eq("id", tienda.id);
  if (nombre.error) throw nombre.error;
  await crearTransmisionPrueba(tienda.id);
  await context.addCookies(await cookiesDeSesion(mica.sesion));

  // Mica sale en vivo y lanza ROJO a mano.
  await page.goto("/mi-puesto/vivo");
  await expect(page.getByText("EN VIVO", { exact: true })).toBeVisible({ timeout: 30_000 });
  const paginaCaro = await entrar(browser, tienda.handle, caro);
  const paginaLuz = await entrar(browser, tienda.handle, luz);

  await page.getByRole("button", { name: "+ Nuevo código" }).click();
  await page.getByLabel("Precio").fill("8000");
  await page.getByLabel("Código", { exact: true }).fill("rojo");
  await page.getByRole("button", { name: /^Lanzar código/ }).click();
  await expect(page.getByText("Código ROJO · 0 de 1 vendidos")).toBeVisible({ timeout: 15_000 });

  // Caro lo escribe primero y gana; Luz queda primera en la lista de espera.
  await expect(paginaCaro.getByText("Escribilo en el chat")).toBeVisible({ timeout: 15_000 });
  await escribir(paginaCaro, "rojo");
  await expect(paginaCaro.getByText("¡Ganaste el código ROJO!")).toBeVisible({ timeout: 15_000 });
  await expect(paginaLuz.getByText("🎉 ROJO es de", { exact: false })).toBeVisible({ timeout: 15_000 });
  await escribir(paginaLuz, "rojo");
  await expect(paginaLuz.getByText(/llegó primero\. Quedaste 1\.ª en la lista/)).toBeVisible({ timeout: 15_000 });

  // Caro elige retiro e informa el pago con comprobante.
  await expect(paginaCaro.getByText("prueba.alias")).toBeVisible();
  await paginaCaro.getByRole("button", { name: /Retiro/ }).click();
  await expect(paginaCaro.getByRole("region", { name: "Datos para pagar" }).getByText("$8.000", { exact: true })).toBeVisible();
  await paginaCaro.getByRole("button", { name: "Ya pagué" }).click();
  await elegirFoto(paginaCaro, "Subir captura del comprobante", FOTO);
  await paginaCaro.getByLabel("Tu WhatsApp").fill("381 555-0123");
  await paginaCaro.getByRole("dialog").getByRole("button", { name: "Enviar" }).click();
  await expect(paginaCaro.getByText("Le avisamos a Mica")).toBeVisible({ timeout: 20_000 });

  // Mica termina el vivo y confirma el pago desde "Pedidos de este vivo".
  await page.getByRole("button", { name: "Terminar" }).click();
  await page.getByRole("button", { name: "Sí, terminar" }).click();
  await expect(page.getByRole("heading", { name: "Pedidos de este vivo" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Confirmar pago" }).click();
  await expect(page.locator('[data-estado="pagado"]')).toHaveCount(1, { timeout: 15_000 });

  // Caro ve la dirección en Mis compras.
  await paginaCaro.goto("/mis-compras");
  await expect(paginaCaro.locator('li[data-estado="pagado"]')).toHaveCount(1, { timeout: 20_000 });
  await paginaCaro.getByRole("button", { name: "Ver datos de entrega" }).click();
  await expect(paginaCaro.getByRole("dialog").getByText("Calle Falsa 123")).toBeVisible({ timeout: 15_000 });

  // Otro vivo: el pedido de una compradora vence y la prenda pasa a Luz.
  const abrir = await mica.cliente.rpc("abrir_vivo", { p_store: tienda.id, p_device: crypto.randomUUID() });
  if (abrir.error) throw abrir.error;
  const { id: codigoId } = await lanzarPrueba(mica.cliente, abrir.data as string, "azul");
  const ana = await crearUsuarioPrueba({ nombre: "Ana Lista" });
  usuarios.push(ana);
  const gana = await reclamarPrueba(ana.id, codigoId, "Ana L.");
  await reclamarPrueba(luz.id, codigoId, "Luz Q.");
  const vence = await admin.from("orders").update({ deadline: new Date(Date.now() - 60_000).toISOString() }).eq("id", gana.pedido as string);
  if (vence.error) throw vence.error;
  const vencer = await admin.rpc("vencer_pedidos");
  if (vencer.error) throw vencer.error;

  const { data: pedidos, error } = await admin.from("orders").select("buyer_id, status").eq("code_id", codigoId);
  if (error) throw error;
  expect(pedidos?.find((p) => p.buyer_id === ana.id)?.status).toBe("vencido");
  expect(pedidos?.find((p) => p.buyer_id === luz.id)?.status).toBe("por_pagar");
});
