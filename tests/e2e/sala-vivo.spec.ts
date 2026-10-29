import { devices, expect, test } from "@playwright/test";
import { borrarUsuarioPrueba, clienteAdmin, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { borrarVivosDeTienda, crearTiendaPrueba, crearTransmisionPrueba } from "../helpers/tiendas-prueba";
import { cookiesDeSesion } from "./sesion";

// La transmisión apunta a cloudflare.invalid: el video nunca conecta. Se miran los carteles de cada estado.

const usuarios: UsuarioPrueba[] = [];
const tiendas: string[] = [];

test.afterEach(async () => {
  for (const id of tiendas) await borrarVivosDeTienda(id);
});

test.afterAll(async () => {
  for (const u of usuarios) await borrarUsuarioPrueba(u.id);
});

type Puesto = { id: string; handle: string };

/** Una feriante nueva por prueba (puesto "Mica", completo, con un producto y su transmisión). */
async function nuevaMica(): Promise<{ mica: UsuarioPrueba; tienda: Puesto }> {
  const mica = await crearUsuarioPrueba({ nombre: "Mica Sala" });
  usuarios.push(mica);
  const tienda = await crearTiendaPrueba(mica, { conProducto: true });
  tiendas.push(tienda.id);
  const { error } = await clienteAdmin()
    .from("stores")
    .update({ name: "Mica", live_schedule_note: "martes y jueves a las 21" })
    .eq("id", tienda.id);
  if (error) throw error;
  await crearTransmisionPrueba(tienda.id);
  return { mica, tienda };
}

/** Mica abre su vivo como lo hace su pantalla. Devuelve el vivo y el celular que transmite. */
async function abrirVivo(mica: UsuarioPrueba, tienda: Puesto): Promise<{ vivo: string; dispositivo: string }> {
  const dispositivo = crypto.randomUUID();
  const { data, error } = await mica.cliente.rpc("abrir_vivo", { p_store: tienda.id, p_device: dispositivo });
  if (error) throw error;
  return { vivo: data as string, dispositivo };
}

async function senal(mica: UsuarioPrueba, v: { vivo: string; dispositivo: string }, estado: { fuera?: boolean; silenciada?: boolean }) {
  const { error } = await mica.cliente.rpc("senal_vivo", {
    p_vivo: v.vivo, p_device: v.dispositivo, p_fuera: estado.fuera ?? false, p_silenciada: estado.silenciada ?? false, p_mirando: 0,
  });
  if (error) throw error;
}

const EN_VIVO = { exact: true } as const;

test("espera antes del vivo", async ({ page }) => {
  const { tienda } = await nuevaMica();
  await page.goto(`/@${tienda.handle}/vivo`);
  await expect(page.getByText("¡Pronto arrancamos!")).toBeVisible();
  await expect(page.getByText("Suele estar en vivo martes y jueves a las 21")).toBeVisible();
  await expect(page.getByText("Mientras tanto, mirá lo que tiene")).toBeVisible();
  await expect(page.getByText("$8.000")).toBeVisible();
  await expect(page.getByRole("button", { name: "Seguir" })).toBeVisible();
  await expect(page.getByText("EN VIVO", EN_VIVO)).toHaveCount(0);
});

test("se abre sola cuando arranca", async ({ page }) => {
  const { mica, tienda } = await nuevaMica();
  await page.goto(`/@${tienda.handle}/vivo`);
  await expect(page.getByText("¡Pronto arrancamos!")).toBeVisible();
  // Se espera a que el canal esté conectado: así el arranque llega por Realtime y no por la lectura inicial.
  await expect(page.locator('main[data-canal="listo"]')).toBeAttached({ timeout: 30_000 });
  await abrirVivo(mica, tienda);
  await expect(page.getByText("EN VIVO", EN_VIVO)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("¡Pronto arrancamos!")).toHaveCount(0);
});

test("vuelve en un momento", async ({ page }) => {
  const { mica, tienda } = await nuevaMica();
  const v = await abrirVivo(mica, tienda);
  await page.goto(`/@${tienda.handle}/vivo`);
  await expect(page.getByText("EN VIVO", EN_VIVO)).toBeVisible();
  await senal(mica, v, { fuera: true });
  await expect(page.getByText("Mica vuelve en un momento")).toBeVisible({ timeout: 30_000 });
  await senal(mica, v, { fuera: false });
  await expect(page.getByText("Mica vuelve en un momento")).toHaveCount(0, { timeout: 30_000 });
});

test("sin sonido", async ({ page }) => {
  const { mica, tienda } = await nuevaMica();
  const v = await abrirVivo(mica, tienda);
  await page.goto(`/@${tienda.handle}/vivo`);
  await expect(page.getByText("EN VIVO", EN_VIVO)).toBeVisible();
  await senal(mica, v, { silenciada: true });
  await expect(page.getByText("Sin sonido por un momento")).toBeVisible({ timeout: 30_000 });
});

test("terminó", async ({ page }) => {
  const { mica, tienda } = await nuevaMica();
  const v = await abrirVivo(mica, tienda);
  // Pedidos del reproductor para mirar (WHEP): mientras dura el vivo reintenta; al terminar, para.
  let pedidosMirar = 0;
  await page.route("https://cloudflare.invalid/**", (r) => {
    pedidosMirar++;
    return r.fulfill({ status: 503, body: "" });
  });
  await page.goto(`/@${tienda.handle}/vivo`);
  await expect(page.getByText("EN VIVO", EN_VIVO)).toBeVisible();
  await expect.poll(() => pedidosMirar, { timeout: 15_000 }).toBeGreaterThan(0);
  const { error } = await mica.cliente.rpc("terminar_vivo", { p_vivo: v.vivo });
  if (error) throw error;
  // Vuelve la feria de la espera, con el agradecimiento, sus productos y el link a la tienda.
  await expect(page.getByText("El vivo terminó", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "¡Gracias por venir!" })).toBeVisible();
  await expect(page.getByText("Cuando Mica vuelva a salir en vivo, se abre sola acá.")).toBeVisible();
  await expect(page.getByText("Suele estar en vivo martes y jueves a las 21")).toBeVisible();
  await expect(page.getByText("$8.000")).toBeVisible();
  await expect(page.getByText("EN VIVO", EN_VIVO)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ver su tienda" })).toHaveAttribute("href", `/@${tienda.handle}`);
  // Al terminar se cierra el reproductor: no vuelve a pedir la transmisión (los reintentos son cada 10 s como mucho).
  const alTerminar = pedidosMirar;
  await page.waitForTimeout(11_000);
  expect(pedidosMirar).toBe(alTerminar);

  // Si vuelve a salir en vivo, la sala se abre sola desde la espera de después.
  await abrirVivo(mica, tienda);
  await expect(page.getByText("EN VIVO", EN_VIVO)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("El vivo terminó", { exact: true })).toHaveCount(0);
});

test("volver a la sala por los links después de un vivo terminado muestra el vivo nuevo, no el cierre viejo", async ({ page }) => {
  const { mica, tienda } = await nuevaMica();
  const v1 = await abrirVivo(mica, tienda);
  await page.goto(`/@${tienda.handle}/vivo`);
  await expect(page.getByText("EN VIVO", EN_VIVO)).toBeVisible();
  const { error } = await mica.cliente.rpc("terminar_vivo", { p_vivo: v1.vivo });
  if (error) throw error;
  await expect(page.getByText("El vivo terminó", { exact: true })).toBeVisible({ timeout: 30_000 });

  // Como la compradora: a la tienda y al Inicio por los links, sin recargar (Next guarda la sala escondida).
  await page.getByRole("link", { name: "Ver su tienda" }).click();
  await expect(page.getByRole("heading", { name: "Mica", level: 1 })).toBeVisible({ timeout: 30_000 });
  // dispatchEvent: en desarrollo el botón de Next tapa la barra de abajo. Se reintenta hasta que la página responda.
  await expect(async () => {
    await page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Inicio" }).dispatchEvent("click");
    await expect(page).toHaveURL(/\/$/, { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  await abrirVivo(mica, tienda);
  const tarjeta = page.locator(`a[href="/@${tienda.handle}/vivo"]`).first();
  await expect(tarjeta).toBeVisible({ timeout: 30_000 });

  // Desde que toca la tarjeta, el cierre del vivo anterior no tiene que aparecer ni un instante.
  await page.evaluate(() => {
    const w = window as unknown as { vioCierreViejo: boolean };
    w.vioCierreViejo = false;
    const mirar = () => { if (document.body.innerText.includes("El vivo terminó")) w.vioCierreViejo = true; };
    new MutationObserver(mirar).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  await tarjeta.dispatchEvent("click");
  await expect(page).toHaveURL(new RegExp(`/@${tienda.handle}/vivo$`), { timeout: 30_000 });
  // El Inicio queda guardado escondido con su propio "EN VIVO": se mira solo lo visible.
  await expect(page.getByText("EN VIVO", EN_VIVO).filter({ visible: true })).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => (window as unknown as { vioCierreViejo: boolean }).vioCierreViejo)).toBe(false);
});

test("cuenta como mirando", async ({ page, browser }) => {
  const { mica, tienda } = await nuevaMica();
  const contextoMica = await browser.newContext({ ...devices["Pixel 7"], permissions: ["camera", "microphone"], baseURL: test.info().project.use.baseURL });
  try {
    await contextoMica.addCookies(await cookiesDeSesion(mica.sesion));
    const estudio = await contextoMica.newPage();
    await estudio.goto("/mi-puesto/vivo");
    await expect(estudio.getByText("👁 0")).toBeVisible({ timeout: 30_000 });
    await page.goto(`/@${tienda.handle}/vivo`);
    await expect(page.getByText("EN VIVO", EN_VIVO)).toBeVisible();
    await expect(estudio.getByText("👁 1")).toBeVisible({ timeout: 30_000 });
  } finally {
    await contextoMica.close();
  }
});

test("nombre largo en un celular angosto", async ({ page }) => {
  const { mica, tienda } = await nuevaMica();
  const nombre = "Emprendimientos Textiles de la Abuela Rosaura";
  const { error } = await clienteAdmin().from("stores").update({ name: nombre }).eq("id", tienda.id);
  if (error) throw error;
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`/@${tienda.handle}/vivo`);
  await expect(page.getByText(`cuando ${nombre} salga en vivo`)).toBeVisible();
  const v = await abrirVivo(mica, tienda);
  await senal(mica, v, { fuera: true });
  const cartel = page.getByText(`${nombre} vuelve en un momento`);
  await expect(cartel).toBeVisible({ timeout: 30_000 });
  const caja = await cartel.boundingBox();
  expect(caja!.x).toBeGreaterThanOrEqual(0);
  expect(caja!.x + caja!.width).toBeLessThanOrEqual(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test("handle con mayúsculas", async ({ page }) => {
  const { tienda } = await nuevaMica();
  await page.goto(`/@${tienda.handle.toUpperCase()}/vivo`);
  await expect(page.getByText("¡Pronto arrancamos!")).toBeVisible();
});

test("puesto inexistente", async ({ page }) => {
  await page.goto("/@no.existe.nunca/vivo");
  await expect(page.getByText("No encontramos este puesto.")).toBeVisible();
});

test("dirección mal escrita", async ({ page }) => {
  // "%25" es un "%" escrito: a la página le llega "%E0%A4%A", que no se puede decodificar.
  for (const ruta of ["/@%25E0%25A4%25A/vivo", "/@%25E0%25A4%25A"]) {
    await page.goto(ruta);
    await expect(page.getByText("No encontramos este puesto.")).toBeVisible();
  }
});
