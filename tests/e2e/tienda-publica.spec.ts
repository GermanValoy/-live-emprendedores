import { expect, test } from "@playwright/test";
import { borrarUsuarioPrueba, clienteAdmin, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { crearTiendaPrueba } from "../helpers/tiendas-prueba";
import { cookiesDeSesion } from "./sesion";

let feriante: UsuarioPrueba;
let aMedias: UsuarioPrueba;
let compradora: UsuarioPrueba;
let tienda: { id: string; handle: string };
let incompleta: { id: string; handle: string };

test.beforeAll(async () => {
  [feriante, aMedias, compradora] = await Promise.all([
    crearUsuarioPrueba({ nombre: "Mica Pública" }),
    crearUsuarioPrueba({ nombre: "A Medias" }),
    crearUsuarioPrueba({ nombre: "Sofi Compradora" }),
  ]);
  tienda = await crearTiendaPrueba(feriante, { conProducto: true });
  await clienteAdmin().from("stores").update({ name: "La Ropería de Mica", live_schedule_note: "Mar. y jue. 20 h" }).eq("id", tienda.id);
  await clienteAdmin().from("store_delivery_options").insert({ store_id: tienda.id, kind: "shipping", enabled: true, shipping_mode: "fixed", shipping_cost_cents: 250000 });
  incompleta = await crearTiendaPrueba(aMedias, { completa: false, conProducto: true });
  await clienteAdmin().from("stores").update({ name: "Puesto A Medias" }).eq("id", incompleta.id);
});

test.afterAll(async () => {
  await Promise.all([feriante, aMedias, compradora].filter(Boolean).map((u) => borrarUsuarioPrueba(u.id)));
});

test("la tienda pública muestra datos, entregas y productos, sin datos privados", async ({ page }) => {
  await page.goto(`/@${tienda.handle}`);
  await expect(page.getByRole("heading", { name: "La Ropería de Mica" })).toBeVisible();
  await expect(page.getByText("Mar. y jue. 20 h")).toBeVisible();
  await expect(page.getByText("Retiro en Yerba Buena")).toBeVisible();
  await expect(page.getByText("Envío $2.500")).toBeVisible();
  await expect(page.getByText("Vestido de prueba")).toBeVisible();
  await expect(page.getByText("prueba.alias")).toHaveCount(0);
  await expect(page.getByText("Calle Falsa 123")).toHaveCount(0);
  await page.getByRole("link", { name: /Vestido de prueba/ }).click();
  await expect(page).toHaveURL(new RegExp(`/@${tienda.handle.replace(".", "\\.")}/p/`));
  // Next 16 conserva escondida la página anterior para volver rápido: se cuenta solo lo visible.
  await expect(page.getByText("$8.000").filter({ visible: true })).toBeVisible();
});

test("una tienda que no existe muestra su mensaje", async ({ page }) => {
  await page.goto("/@no.existe.este.puesto");
  await expect(page.getByText("No encontramos este puesto.")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Ir al inicio" })).toBeVisible();
});

test("el Inicio lista los puestos completos y no los que están a medio armar", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Puestos" })).toBeVisible();
  await expect(page.getByRole("link", { name: /La Ropería de Mica/ })).toBeVisible();
  await expect(page.getByText("Puesto A Medias")).toHaveCount(0);
});

test("seguir un puesto y verlo en Seguidos; dejar de seguir", async ({ page, context }) => {
  await context.addCookies(await cookiesDeSesion(compradora.sesion));
  await page.goto(`/@${tienda.handle}`);
  await expect(page.getByText("0 seguidores")).toBeVisible();
  await page.getByRole("button", { name: "Seguir" }).click();
  await expect(page.getByRole("button", { name: "Siguiendo" })).toBeVisible();
  // El botón cambia al instante; el conteo se actualiza cuando el servidor terminó de guardar.
  await expect(page.getByText("1 seguidor")).toBeVisible();
  await page.goto("/seguidos");
  await expect(page.getByRole("link", { name: /La Ropería de Mica/ })).toBeVisible();
  await page.getByRole("button", { name: "Siguiendo" }).click();
  await expect(page.getByText("Todavía no seguís ningún puesto. Tocá Seguir en los que te gusten.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Todavía no seguís ningún puesto. Tocá Seguir en los que te gusten.")).toBeVisible();
});

test("Seguir sin sesión pide entrar y vuelve a la tienda", async ({ page }) => {
  await page.goto(`/@${tienda.handle}`);
  const pedido = page.waitForRequest((r) => r.url().includes("/auth/v1/authorize?provider=google"));
  await page.getByRole("button", { name: "Seguir" }).click();
  expect(decodeURIComponent(decodeURIComponent((await pedido).url()))).toContain(`next=/@${tienda.handle}`);
});
