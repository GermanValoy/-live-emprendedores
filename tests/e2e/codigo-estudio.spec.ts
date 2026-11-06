import { expect, test } from "@playwright/test";
import { borrarCodigosDeTienda, borrarFotosDeTienda, borrarVivosDeTienda, crearTiendaPrueba, crearTransmisionPrueba, reclamarPrueba } from "../helpers/tiendas-prueba";
import { borrarUsuarioPrueba, clienteAdmin, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { cookiesDeSesion } from "./sesion";
import { responderVozVacia } from "./voz";

// Cámara falsa de Playwright; la transmisión apunta a cloudflare.invalid (no conecta, no hace falta).

const usuarios: UsuarioPrueba[] = [];
const tiendas: string[] = [];

test.beforeEach(async ({ context }) => {
  await responderVozVacia(context);
});

test.afterAll(async () => {
  for (const tiendaId of tiendas) {
    await borrarCodigosDeTienda(tiendaId);
    await borrarVivosDeTienda(tiendaId);
    await borrarFotosDeTienda(tiendaId);
  }
  for (const u of usuarios) await borrarUsuarioPrueba(u.id);
});

test("crear un código a mano, verlo vender y anularlo", async ({ page, context }) => {
  const mica = await crearUsuarioPrueba({ nombre: "Mica Códigos" });
  const caro = await crearUsuarioPrueba({ nombre: "Caro Compradora" });
  usuarios.push(mica, caro);
  const tienda = await crearTiendaPrueba(mica);
  tiendas.push(tienda.id);
  await crearTransmisionPrueba(tienda.id);
  await context.addCookies(await cookiesDeSesion(mica.sesion));

  await page.goto("/mi-puesto/vivo");
  await expect(page.getByText("EN VIVO", { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "+ Nuevo código" }).click();
  const lanzar = page.getByRole("button", { name: /^Lanzar código/ });
  await expect(lanzar).toBeDisabled();
  await page.getByLabel("Precio").fill("8000");
  await page.getByLabel("Código", { exact: true }).fill("rojo");
  await lanzar.click();
  await expect(page.getByText("Código ROJO · 0 de 1 vendidos")).toBeVisible({ timeout: 15_000 });

  const { data } = await clienteAdmin().from("live_codes").select("id, photo_path").eq("store_id", tienda.id);
  expect(data).toHaveLength(1);
  expect(data?.[0]?.photo_path).toMatch(new RegExp(`^${tienda.id}/codigos/`));
  await reclamarPrueba(caro.id, data?.[0]?.id as string, "Caro C.");
  await expect(page.getByText("Código ROJO · Agotado")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Opciones del código" }).click();
  await page.getByRole("button", { name: "Ver quién lo ganó" }).click();
  await expect(page.getByText("Caro C.")).toBeVisible();
  await page.getByRole("button", { name: "Anular reclamo" }).click();
  await expect(page.getByText("Caro C.")).toHaveCount(0, { timeout: 15_000 });
  await page.getByRole("button", { name: "Volver" }).click();

  await page.getByRole("button", { name: "Anular código" }).click();
  await page.getByRole("button", { name: "Sí, anular código" }).click();
  await expect(page.getByRole("button", { name: "Opciones del código" })).toHaveCount(0, { timeout: 15_000 });

  await page.getByRole("button", { name: "+ Nuevo código" }).click();
  await page.getByLabel("Precio").fill("5000");
  await page.getByLabel("Código", { exact: true }).fill("rojo");
  await page.getByRole("button", { name: /^Lanzar código/ }).click();
  await expect(page.getByText("Ya usaste ROJO en este vivo.")).toBeVisible({ timeout: 15_000 });
});

test("la voz arranca prendida al salir en vivo y se puede apagar y prender", async ({ page, context }) => {
  const sofi = await crearUsuarioPrueba({ nombre: "Sofi Voz" });
  usuarios.push(sofi);
  const tienda = await crearTiendaPrueba(sofi);
  tiendas.push(tienda.id);
  await crearTransmisionPrueba(tienda.id);
  await context.addCookies(await cookiesDeSesion(sofi.sesion));

  await page.goto("/mi-puesto/vivo");
  await expect(page.getByText("EN VIVO", { exact: true })).toBeVisible({ timeout: 30_000 });

  const voz = page.getByRole("switch", { name: "🎤 Escuchando códigos" });
  await expect(voz).toBeVisible();
  await expect(voz).toHaveAttribute("aria-checked", "true");
  await voz.click();
  await expect(voz).toHaveAttribute("aria-checked", "false");
  await voz.click();
  await expect(voz).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: "+ Nuevo código" })).toBeVisible();
});
