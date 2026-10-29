import { expect, type Page, test } from "@playwright/test";
import { borrarUsuarioPrueba, clienteAdmin, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { borrarVivosDeTienda, crearTiendaPrueba, crearTransmisionPrueba, hacerAdmin } from "../helpers/tiendas-prueba";
import { cookiesDeSesion } from "./sesion";

// La transmisión apunta a cloudflare.invalid: el video nunca conecta. Se miran botones y estados.

const usuarios: UsuarioPrueba[] = [];
const tiendas: string[] = [];
let admin: UsuarioPrueba;

test.beforeAll(async () => {
  admin = await crearUsuarioPrueba({ nombre: "Admin Estudio" });
  usuarios.push(admin);
  await hacerAdmin(admin.id);
});

test.afterEach(async () => {
  for (const id of tiendas) await borrarVivosDeTienda(id);
});

test.afterAll(async () => {
  for (const u of usuarios) await borrarUsuarioPrueba(u.id);
});

/** Una feriante nueva por prueba, así las pruebas corren en paralelo sin pisarse el vivo. */
async function nuevaMica(): Promise<{ mica: UsuarioPrueba; tienda: { id: string; handle: string } }> {
  const mica = await crearUsuarioPrueba({ nombre: "Mica Estudio" });
  usuarios.push(mica);
  const tienda = await crearTiendaPrueba(mica);
  tiendas.push(tienda.id);
  await crearTransmisionPrueba(tienda.id);
  return { mica, tienda };
}

async function vivosDe(storeId: string) {
  const { data, error } = await clienteAdmin().from("live_sessions").select("*").eq("store_id", storeId);
  if (error) throw error;
  return data;
}

/** Entrar a la pantalla ya sale en vivo solo, apenas prende la cámara. */
async function entrarYSalirEnVivo(page: Page) {
  await page.goto("/mi-puesto/vivo");
  await expect(page.getByText("EN VIVO", { exact: true })).toBeVisible({ timeout: 30_000 });
}

/** Termina el vivo desde la pantalla, con la confirmación. */
async function terminarDesdeLaPantalla(page: Page) {
  await page.getByRole("button", { name: "Terminar" }).click();
  await page.getByRole("button", { name: "Sí, terminar" }).click();
  await expect(page.getByText("¡Terminó tu vivo! 🎉")).toBeVisible({ timeout: 30_000 });
}

/** Simula que la feriante se va a otra app (o vuelve), como lo avisa el navegador. */
async function cambiarVisibilidad(page: Page, estado: "hidden" | "visible") {
  await page.evaluate((e) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => e });
    document.dispatchEvent(new Event("visibilitychange"));
  }, estado);
}

/** Privacidad: las pistas de sonido que salen por la transmisión están apagadas. */
function microfonoApagado(page: Page) {
  return page.evaluate(() => {
    const stream = document.querySelector("video")?.srcObject as MediaStream | null;
    const pistas = stream?.getAudioTracks() ?? [];
    return pistas.length > 0 && pistas.every((p) => !p.enabled);
  });
}

test("puesto incompleto", async ({ page, context }) => {
  const luz = await crearUsuarioPrueba({ nombre: "Luz Incompleta" });
  usuarios.push(luz);
  await crearTiendaPrueba(luz, { completa: false });
  await context.addCookies(await cookiesDeSesion(luz.sesion));
  await page.goto("/mi-puesto/vivo");
  await expect(page.getByText("Terminá de armar tu puesto para salir en vivo")).toBeVisible();
  await expect(page.getByRole("link", { name: "Seguir armando" })).toHaveAttribute("href", "/mi-puesto/armar");
  await expect(page.getByRole("button", { name: "Salir en vivo" })).toHaveCount(0);
});

test("un solo toque en Mi puesto sale en vivo", async ({ page, context }) => {
  const { mica, tienda } = await nuevaMica();
  await context.addCookies(await cookiesDeSesion(mica.sesion));
  await page.goto("/mi-puesto");
  await page.getByRole("link", { name: "Salir en vivo" }).click();
  await expect(page.getByText("EN VIVO", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("👁 0")).toBeVisible();
  // El consejo de no salir de la pantalla se ve al arrancar.
  await expect(page.getByText("Mientras estés en vivo no salgas de esta pantalla")).toBeVisible();
  await expect(page.getByRole("button", { name: "Salir en vivo" })).toHaveCount(0);
  const vivos = await vivosDe(tienda.id);
  expect(vivos.filter((v) => v.ended_at === null)).toHaveLength(1);
});

test("si falla al salir en vivo, avisa y deja reintentar con el botón", async ({ page, context }) => {
  const { mica, tienda } = await nuevaMica();
  await context.addCookies(await cookiesDeSesion(mica.sesion));
  await page.goto("/mi-puesto");
  // La primera vez el servidor no responde (como sin internet); después sí.
  let primera = true;
  await page.route("**/mi-puesto/vivo", (r) => {
    if (r.request().method() === "POST" && primera) {
      primera = false;
      return r.abort("internetdisconnected");
    }
    return r.continue();
  });
  await page.getByRole("link", { name: "Salir en vivo" }).click();
  await expect(page.getByText("No se pudo completar. Revisá tu conexión y probá de nuevo.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Vista previa · nadie te ve todavía")).toBeVisible();
  await page.getByRole("button", { name: "Salir en vivo" }).click();
  await expect(page.getByText("EN VIVO", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await vivosDe(tienda.id)).filter((v) => v.ended_at === null).length).toBe(1);
});

test("silenciar", async ({ page, context }) => {
  const { mica, tienda } = await nuevaMica();
  await context.addCookies(await cookiesDeSesion(mica.sesion));
  await entrarYSalirEnVivo(page);
  await page.getByRole("button", { name: "Silenciar" }).click();
  await expect(page.getByText("🔇 Silenciada")).toBeVisible();
  await expect(page.getByRole("button", { name: "Activar sonido" })).toBeVisible();
  expect(await microfonoApagado(page)).toBe(true);
  await expect.poll(async () => (await vivosDe(tienda.id))[0]?.muted, { timeout: 15_000 }).toBe(true);
});

test("salir de la pantalla silencia", async ({ page, context }) => {
  const { mica, tienda } = await nuevaMica();
  await context.addCookies(await cookiesDeSesion(mica.sesion));
  await entrarYSalirEnVivo(page);
  await cambiarVisibilidad(page, "hidden");
  await expect.poll(async () => (await vivosDe(tienda.id))[0]?.away_since, { timeout: 15_000 }).not.toBeNull();
  expect(await microfonoApagado(page)).toBe(true);
  await cambiarVisibilidad(page, "visible");
  await expect(page.getByText("Estás silenciada")).toBeVisible();
  await expect(page.getByRole("button", { name: "Activar sonido" }).first()).toBeVisible();
  // Al volver sigue silenciada: el micrófono no se prende solo.
  expect(await microfonoApagado(page)).toBe(true);
  await expect.poll(async () => (await vivosDe(tienda.id))[0]?.away_since, { timeout: 15_000 }).toBeNull();
});

test("volver con atrás no sale en vivo solo; salir de la vista previa silencia sin el cartel de vuelta", async ({ page, context }) => {
  const { mica, tienda } = await nuevaMica();
  await context.addCookies(await cookiesDeSesion(mica.sesion));
  await page.goto("/mi-puesto");
  await page.getByRole("link", { name: "Salir en vivo" }).click();
  await expect(page.getByText("EN VIVO", { exact: true })).toBeVisible({ timeout: 30_000 });
  await terminarDesdeLaPantalla(page);
  await page.getByRole("link", { name: "Volver a mi puesto" }).click();
  await expect(page.getByRole("link", { name: "Salir en vivo" })).toBeVisible();
  await page.goBack();
  // Con "atrás" muestra la cámara con el botón: nadie sale al aire sin querer.
  await expect(page.getByText("Vista previa · nadie te ve todavía")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Salir en vivo" })).toBeEnabled({ timeout: 30_000 });
  await page.waitForTimeout(2_000);
  expect((await vivosDe(tienda.id)).filter((v) => v.ended_at === null)).toHaveLength(0);
  await cambiarVisibilidad(page, "hidden");
  await cambiarVisibilidad(page, "visible");
  await page.getByRole("button", { name: "Salir en vivo" }).click();
  await expect(page.getByText("EN VIVO", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("🔇 Silenciada")).toBeVisible();
  expect(await microfonoApagado(page)).toBe(true);
  await expect(page.getByText("Estás silenciada")).toHaveCount(0);
});

test("terminar con confirmación", async ({ page, context }) => {
  const { mica, tienda } = await nuevaMica();
  await context.addCookies(await cookiesDeSesion(mica.sesion));
  await entrarYSalirEnVivo(page);
  await page.getByRole("button", { name: "Terminar" }).click();
  await expect(page.getByText("¿Seguro que querés terminar el vivo?")).toBeVisible();
  // El consejo de arranque no tapa la confirmación.
  await expect(page.getByText("Mientras estés en vivo no salgas de esta pantalla")).toHaveCount(0);
  // El foco va a la opción segura: un toque sin querer no corta el vivo.
  await expect(page.getByRole("button", { name: "Seguir en vivo" })).toBeFocused();
  await page.getByRole("button", { name: "Sí, terminar" }).click();
  await expect(page.getByText("¡Terminó tu vivo! 🎉")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Volver a mi puesto" })).toBeVisible();
  const vivos = await vivosDe(tienda.id);
  expect(vivos[0]?.end_reason).toBe("duena");
  expect(await page.evaluate(() => (document.querySelector("video")?.srcObject ?? null) === null)).toBe(true);
});

test("después de terminar, vuelve a Mi puesto y puede salir en vivo otra vez", async ({ page, context }) => {
  const { mica, tienda } = await nuevaMica();
  await context.addCookies(await cookiesDeSesion(mica.sesion));
  await page.goto("/mi-puesto");
  await page.getByRole("link", { name: "Salir en vivo" }).click();
  await expect(page.getByText("EN VIVO", { exact: true })).toBeVisible({ timeout: 30_000 });
  await terminarDesdeLaPantalla(page);
  await page.getByRole("link", { name: "Volver a mi puesto" }).click();
  await page.getByRole("link", { name: "Salir en vivo" }).click();
  await expect(page.getByText("EN VIVO", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("¡Terminó tu vivo! 🎉")).toHaveCount(0);
  await expect.poll(async () => (await vivosDe(tienda.id)).filter((v) => v.ended_at === null).length).toBe(1);
});

test("volver a tu vivo", async ({ page, context }) => {
  const { mica, tienda } = await nuevaMica();
  const { data: id, error } = await mica.cliente.rpc("abrir_vivo", { p_store: tienda.id, p_device: crypto.randomUUID() });
  if (error) throw error;
  await context.addCookies(await cookiesDeSesion(mica.sesion));
  await page.goto("/mi-puesto");
  await page.getByRole("link", { name: "Volver a tu vivo" }).click();
  // Sigue el mismo vivo con un solo toque.
  await expect(page.getByText("EN VIVO", { exact: true })).toBeVisible({ timeout: 30_000 });
  const vivos = await vivosDe(tienda.id);
  expect(vivos).toHaveLength(1);
  expect(vivos[0]?.id).toBe(id);
});

test("otra pestaña toma el control", async ({ page, context }) => {
  const { mica } = await nuevaMica();
  await context.addCookies(await cookiesDeSesion(mica.sesion));
  await entrarYSalirEnVivo(page);
  const otra = await context.newPage();
  await entrarYSalirEnVivo(otra);
  await expect(page.getByText("Seguís el vivo en otro celular")).toBeVisible({ timeout: 30_000 });
  await expect(otra.getByText("EN VIVO", { exact: true })).toBeVisible();
});

test("cortado por la plataforma", async ({ page, context }) => {
  const { mica, tienda } = await nuevaMica();
  await context.addCookies(await cookiesDeSesion(mica.sesion));
  await entrarYSalirEnVivo(page);
  const id = (await vivosDe(tienda.id))[0]?.id;
  const { error } = await admin.cliente.rpc("cortar_vivo", { p_vivo: id });
  if (error) throw error;
  await expect(page.getByText("La plataforma terminó este vivo")).toBeVisible({ timeout: 30_000 });
});

test("cerrado por falta de señal ofrece salir de nuevo", async ({ page, context }) => {
  const { mica, tienda } = await nuevaMica();
  await context.addCookies(await cookiesDeSesion(mica.sesion));
  await entrarYSalirEnVivo(page);
  // Lo mismo que hace el cierre automático de la base cuando estuvo afuera demasiado.
  const { error } = await clienteAdmin().from("live_sessions")
    .update({ ended_at: new Date().toISOString(), end_reason: "sin_senal" }).eq("store_id", tienda.id).is("ended_at", null);
  if (error) throw error;
  await expect(page.getByText("Tu vivo terminó porque estuviste afuera mucho tiempo")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Salir en vivo de nuevo" }).click();
  await expect(page.getByText("EN VIVO", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await vivosDe(tienda.id)).filter((v) => v.ended_at === null).length).toBe(1);
});

test("avisar por WhatsApp", async ({ page, context }) => {
  const { mica, tienda } = await nuevaMica();
  await context.addCookies(await cookiesDeSesion(mica.sesion));
  await context.route("https://wa.me/**", (r) => r.fulfill({ body: "ok" }));
  await page.goto("/mi-puesto");
  const [whatsapp] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("button", { name: "Avisar por WhatsApp" }).click(),
  ]);
  await whatsapp.waitForURL(/^https:\/\/wa\.me\//);
  expect(whatsapp.url().startsWith("https://wa.me/?text=")).toBe(true);
  expect(whatsapp.url()).toContain(encodeURIComponent(`/@${tienda.handle}/vivo`));
});
