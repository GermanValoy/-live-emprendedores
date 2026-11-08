import { devices, expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { borrarUsuarioPrueba, clienteAdmin, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { borrarCodigosDeTienda, borrarVivosDeTienda, crearTiendaPrueba, crearTransmisionPrueba, lanzarPrueba, reclamarPrueba } from "../helpers/tiendas-prueba";
import { cookiesDeSesion } from "./sesion";

const usuarios: UsuarioPrueba[] = [];
const tiendas: string[] = [];
const contextos: BrowserContext[] = [];

test.afterEach(async () => {
  for (const c of contextos.splice(0)) await c.close();
  for (const id of tiendas.splice(0)) {
    await borrarCodigosDeTienda(id);
    await borrarVivosDeTienda(id);
  }
});

test.afterAll(async () => {
  for (const u of usuarios) await borrarUsuarioPrueba(u.id);
});

async function abrirPagina(browser: Browser, usuario: UsuarioPrueba) {
  const contexto = await browser.newContext({ ...devices["Pixel 7"], baseURL: test.info().project.use.baseURL });
  contextos.push(contexto);
  await contexto.addCookies(await cookiesDeSesion(usuario.sesion));
  return contexto.newPage();
}

test("Mis compras muestra un pedido en cada estado y reabre el panel", async ({ browser }) => {
  test.slow();
  const mica = await crearUsuarioPrueba({ nombre: "Mica Compras" });
  const caro = await crearUsuarioPrueba({ nombre: "Carolina Compras" });
  usuarios.push(mica, caro);
  const tienda = await crearTiendaPrueba(mica);
  tiendas.push(tienda.id);
  const admin = clienteAdmin();
  const nombre = await admin.from("stores").update({ name: "Puesto de Mica" }).eq("id", tienda.id);
  if (nombre.error) throw nombre.error;
  await crearTransmisionPrueba(tienda.id);
  const abrir = await mica.cliente.rpc("abrir_vivo", { p_store: tienda.id, p_device: crypto.randomUUID() });
  if (abrir.error) throw abrir.error;
  const vivo = abrir.data as string;

  const pedidos: Record<string, string> = {};
  for (const palabra of ["roja", "azul", "verde", "negra", "lila", "gris"]) {
    const { id } = await lanzarPrueba(mica.cliente, vivo, palabra);
    const r = await reclamarPrueba(caro.id, id, "Caro C.");
    pedidos[palabra] = r.pedido as string;
  }
  const poner = async (palabra: string, datos: Record<string, unknown>) => {
    const r = await admin.from("orders").update(datos).eq("id", pedidos[palabra]);
    if (r.error) throw r.error;
  };
  await poner("azul", { status: "pago_informado", delivery_kind: "pickup", reported_at: new Date().toISOString() });
  await poner("verde", { status: "en_revision", delivery_kind: "pickup", reported_at: new Date().toISOString() });
  await poner("negra", { status: "pagado", delivery_kind: "pickup", reported_at: new Date().toISOString(), confirmed_at: new Date().toISOString() });
  await poner("lila", { deadline: new Date(Date.now() - 60_000).toISOString() });
  const vencer = await admin.rpc("vencer_pedidos");
  if (vencer.error) throw vencer.error;
  const anular = await mica.cliente.rpc("ofrecer_a_otra", { p_pedido: pedidos.gris });
  if (anular.error) throw anular.error;

  const pagina = await abrirPagina(browser, caro);
  await pagina.goto("/mis-compras");
  await expect(pagina.locator("li[data-estado]")).toHaveCount(6, { timeout: 20_000 });
  for (const estado of ["por_pagar", "pago_informado", "en_revision", "pagado", "vencido", "anulado"]) {
    await expect(pagina.locator(`li[data-estado="${estado}"]`)).toHaveCount(1);
  }
  await expect(pagina.getByText(/Tenés \d+:\d{2} para pagar/)).toBeVisible();
  await expect(pagina.getByText("Esperando confirmación")).toBeVisible();
  await expect(pagina.getByText("Puesto de Mica no encuentra tu pago. Te va a escribir por WhatsApp para aclararlo.")).toBeVisible();
  await expect(pagina.getByText("Pagado", { exact: true })).toBeVisible();
  await expect(pagina.getByText("Vencido", { exact: true })).toBeVisible();
  await expect(pagina.getByText("Anulado", { exact: true })).toBeVisible();

  await pagina.getByRole("button", { name: "Ver datos para pagar" }).click();
  const panel = pagina.getByRole("dialog");
  await expect(panel.getByText("¡Ganaste el código ROJA!")).toBeVisible();
  await expect(panel.getByText("Transferile a Puesto de Mica este monto exacto:")).toBeVisible();
});

test("sin pedidos, Mis compras muestra el texto vacío", async ({ browser }) => {
  const sola = await crearUsuarioPrueba({ nombre: "Sola Compras" });
  usuarios.push(sola);
  const pagina = await abrirPagina(browser, sola);
  await pagina.goto("/mis-compras");
  await expect(pagina.getByText("Cuando ganes un código, lo vas a ver acá.")).toBeVisible({ timeout: 20_000 });
});

test("sin sesión, Mis compras ofrece entrar", async ({ page }) => {
  await page.goto("/mis-compras");
  await expect(page.getByRole("button", { name: "Entrar con Google" })).toBeVisible();
});
