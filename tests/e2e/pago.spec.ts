import { devices, expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { borrarUsuarioPrueba, clienteAdmin, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { borrarChatDeTienda, borrarCodigosDeTienda, borrarVivosDeTienda, crearTiendaPrueba, crearTransmisionPrueba, lanzarPrueba } from "../helpers/tiendas-prueba";
import { elegirFoto } from "./fotos";
import { cookiesDeSesion } from "./sesion";

// La transmisión apunta a cloudflare.invalid: el video nunca conecta; acá solo importa el pago en la sala.

const usuarios: UsuarioPrueba[] = [];
const tiendas: string[] = [];
const contextos: BrowserContext[] = [];
const FOTO = "tests/e2e/fixtures/foto-de-costado.jpg";

test.afterEach(async () => {
  for (const c of contextos.splice(0)) await c.close();
  for (const id of tiendas.splice(0)) {
    await borrarCodigosDeTienda(id);
    await borrarChatDeTienda(id);
    await borrarVivosDeTienda(id);
  }
});

test.afterAll(async () => {
  for (const u of usuarios) await borrarUsuarioPrueba(u.id);
});

async function nuevaMica() {
  const mica = await crearUsuarioPrueba({ nombre: "Mica Pago" });
  usuarios.push(mica);
  const tienda = await crearTiendaPrueba(mica, { conProducto: true });
  tiendas.push(tienda.id);
  const admin = clienteAdmin();
  for (const resultado of [
    await admin.from("stores").update({ name: "Mica" }).eq("id", tienda.id),
    await admin.from("store_private_info").update({ payment_alias: "mica.ropa", payment_holder: "Micaela Díaz" }).eq("store_id", tienda.id),
    await admin.from("store_delivery_options").insert({ store_id: tienda.id, kind: "shipping", enabled: true, shipping_mode: "fixed", shipping_cost_cents: 250000 }),
  ]) if (resultado.error) throw resultado.error;
  await crearTransmisionPrueba(tienda.id);
  const abrir = await mica.cliente.rpc("abrir_vivo", { p_store: tienda.id, p_device: crypto.randomUUID() });
  if (abrir.error) throw abrir.error;
  return { mica, tienda, vivo: abrir.data as string };
}

async function entrar(browser: Browser, handle: string, usuario: UsuarioPrueba): Promise<Page> {
  const contexto = await browser.newContext({ ...devices["Pixel 7"], baseURL: test.info().project.use.baseURL });
  contextos.push(contexto);
  await contexto.addCookies(await cookiesDeSesion(usuario.sesion));
  const page = await contexto.newPage();
  await page.goto(`/@${handle}/vivo`);
  await expect(page.locator('[data-chat="listo"]')).toBeAttached({ timeout: 30_000 });
  return page;
}

async function ganarRojo(browser: Browser) {
  const { mica, tienda, vivo } = await nuevaMica();
  const caro = await crearUsuarioPrueba({ nombre: "Carolina Medina" });
  usuarios.push(caro);
  const pagina = await entrar(browser, tienda.handle, caro);
  await lanzarPrueba(mica.cliente, vivo, "rojo");
  await expect(pagina.getByText("Escribilo en el chat")).toBeVisible({ timeout: 10_000 });
  await pagina.getByPlaceholder("Escribí un mensaje o un código…").fill("rojo");
  await pagina.getByRole("button", { name: "Enviar" }).click();
  await expect(pagina.getByText("¡Ganaste el código ROJO!")).toBeVisible({ timeout: 15_000 });
  return { mica, tienda, pagina };
}

async function pedidoDe(storeId: string): Promise<string> {
  const { data, error } = await clienteAdmin().from("orders").select("id").eq("store_id", storeId).single();
  if (error) throw error;
  return data.id as string;
}

test("la compradora gana, elige envío, informa el pago y la feriante lo confirma", async ({ browser }) => {
  test.slow();
  const { mica, tienda, pagina } = await ganarRojo(browser);
  await expect(pagina.getByRole("dialog")).toBeFocused();
  await expect(pagina.getByText("mica.ropa")).toBeVisible();
  await expect(pagina.getByText("Micaela Díaz")).toBeVisible();
  await expect(pagina.getByText("Tenés 1")).toBeVisible();

  const yaPague = pagina.getByRole("button", { name: "Ya pagué" });
  await expect(yaPague).toBeDisabled();
  await pagina.getByRole("button", { name: /Envío/ }).click();
  await expect(pagina.getByText("$10.500", { exact: true })).toBeVisible();
  await expect(yaPague).toBeEnabled();
  await yaPague.click();

  await elegirFoto(pagina, "Subir captura del comprobante", FOTO);
  await pagina.getByLabel("Tu WhatsApp").fill("381 555-0123");
  await pagina.getByRole("dialog").getByRole("button", { name: "Enviar" }).click();
  await expect(pagina.getByText("Le avisamos a Mica")).toBeVisible({ timeout: 20_000 });

  const confirmar = await mica.cliente.rpc("confirmar_pago", { p_pedido: await pedidoDe(tienda.id) });
  if (confirmar.error) throw confirmar.error;
  await expect(pagina.getByText("confirmó tu pago!")).toBeVisible({ timeout: 15_000 });
  await expect(pagina.getByText("Mica te va a escribir por WhatsApp para coordinar")).toBeVisible();
});

test("si se vence el plazo antes de enviar, se le avisa", async ({ browser }) => {
  test.slow();
  const { tienda, pagina } = await ganarRojo(browser);
  await pagina.getByRole("button", { name: /Envío/ }).click();
  await expect(pagina.getByText("$10.500", { exact: true })).toBeVisible();
  await pagina.getByRole("button", { name: "Ya pagué" }).click();
  await elegirFoto(pagina, "Subir captura del comprobante", FOTO);
  await pagina.getByLabel("Tu WhatsApp").fill("3815550123");

  const vencer = await clienteAdmin().from("orders").update({ deadline: new Date(Date.now() - 60_000).toISOString() }).eq("id", await pedidoDe(tienda.id));
  if (vencer.error) throw vencer.error;
  await pagina.getByRole("dialog").getByRole("button", { name: "Enviar" }).click();
  await expect(pagina.getByText("Se te pasó el tiempo para pagar.")).toBeVisible({ timeout: 20_000 });
});
