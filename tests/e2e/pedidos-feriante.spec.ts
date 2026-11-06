import { expect, test } from "@playwright/test";
import { borrarChatDeTienda, borrarCodigosDeTienda, borrarVivosDeTienda, crearTiendaPrueba, crearTransmisionPrueba, lanzarPrueba, reclamarPrueba } from "../helpers/tiendas-prueba";
import { borrarUsuarioPrueba, clienteAdmin, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { cookiesDeSesion } from "./sesion";

// Cámara falsa de Playwright; la transmisión apunta a cloudflare.invalid (no conecta, no hace falta).

const usuarios: UsuarioPrueba[] = [];
let tiendaId = "";

test.afterAll(async () => {
  if (tiendaId) {
    await borrarCodigosDeTienda(tiendaId);
    await borrarChatDeTienda(tiendaId);
    await borrarVivosDeTienda(tiendaId);
  }
  for (const u of usuarios) await borrarUsuarioPrueba(u.id);
});

test("la feriante revisa un pago, lo rechaza y ofrece la prenda a la siguiente", async ({ page, context }) => {
  test.slow();
  const mica = await crearUsuarioPrueba({ nombre: "Mica Pedidos" });
  const caro = await crearUsuarioPrueba({ nombre: "Caro Compradora" });
  const luz = await crearUsuarioPrueba({ nombre: "Luz Compradora" });
  usuarios.push(mica, caro, luz);
  const tienda = await crearTiendaPrueba(mica);
  tiendaId = tienda.id;
  await crearTransmisionPrueba(tienda.id);
  await context.addCookies(await cookiesDeSesion(mica.sesion));

  await page.goto("/mi-puesto/vivo");
  await expect(page.getByText("EN VIVO", { exact: true })).toBeVisible({ timeout: 30_000 });
  const { data: vivo, error } = await clienteAdmin().from("live_sessions").select("id").eq("store_id", tienda.id).is("ended_at", null).single();
  if (error) throw error;

  // Caro gana ROJO, elige retiro y avisa que pagó; Luz queda primera en la lista.
  const { id: codigoId } = await lanzarPrueba(mica.cliente, vivo.id as string, "rojo");
  const gana = await reclamarPrueba(caro.id, codigoId, "Caro C.");
  await reclamarPrueba(luz.id, codigoId, "Luz L.");
  const pedidoId = gana.pedido as string;
  const entrega = await caro.cliente.rpc("elegir_entrega", { p_pedido: pedidoId, p_tipo: "pickup" });
  if (entrega.error) throw entrega.error;
  const ruta = `${caro.id}/${pedidoId}/${crypto.randomUUID()}.jpg`;
  const subida = await caro.cliente.storage.from("comprobantes").upload(ruta, new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }), { contentType: "image/jpeg" });
  if (subida.error) throw subida.error;
  const informe = await caro.cliente.rpc("informar_pago", { p_pedido: pedidoId, p_comprobante: ruta, p_whatsapp: "381 555-1234" });
  if (informe.error) throw informe.error;

  // En el estudio: contador, aviso del banco, la compradora y su comprobante.
  await page.getByRole("button", { name: "Pagos para revisar (1)" }).click();
  const panel = page.getByRole("dialog", { name: "Pagos para revisar" });
  await expect(panel.getByText("Antes de confirmar, revisá en tu banco que la plata haya llegado. Las capturas se pueden falsificar.")).toBeVisible();
  await expect(panel.getByText("Caro C.")).toBeVisible();
  await expect(panel.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/5493815551234");
  await panel.getByRole("button", { name: "Ver comprobante" }).click();
  await expect(page.getByRole("dialog", { name: "Comprobante" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Cerrar" }).first().click();

  await panel.getByRole("button", { name: "No me llegó el pago" }).click();
  await expect(panel.getByText("En revisión")).toBeVisible({ timeout: 15_000 });
  await panel.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Pagos para revisar/ })).toHaveCount(0);

  // Al terminar el vivo, los pedidos siguen a la vista; se ofrece la prenda a Luz.
  await page.getByRole("button", { name: "Terminar" }).click();
  await page.getByRole("button", { name: "Sí, terminar" }).click();
  await expect(page.getByRole("heading", { name: "Pedidos de este vivo" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("En revisión")).toBeVisible();
  await page.getByRole("button", { name: "Ofrecer a otra" }).click();
  await expect(page.getByText("Luz L.")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-estado="por_pagar"]')).toHaveCount(1);
  await expect(page.locator('[data-estado="anulado"]')).toHaveCount(1);

  // Y en Pedidos, agrupados por vivo.
  await page.goto("/mi-puesto/pedidos");
  await expect(page.getByRole("heading", { name: /^Vivo del / })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Luz L.")).toBeVisible();
  await expect(page.getByText("Caro C.")).toBeVisible();
});
