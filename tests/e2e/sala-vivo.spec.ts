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
  // El canal tarda un instante en conectarse: lo que pase mientras tanto se lee al conectar.
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
  await page.goto(`/@${tienda.handle}/vivo`);
  await expect(page.getByText("EN VIVO", EN_VIVO)).toBeVisible();
  const { error } = await mica.cliente.rpc("terminar_vivo", { p_vivo: v.vivo });
  if (error) throw error;
  await expect(page.getByText("El vivo terminó. Gracias por acompañar a Mica.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Ver su tienda" })).toHaveAttribute("href", `/@${tienda.handle}`);
  // Al terminar se suelta el video.
  expect(await page.evaluate(() => (document.querySelector("video")?.srcObject ?? null) === null)).toBe(true);
});

test("cuenta como mirando", async ({ page, browser }) => {
  const { mica, tienda } = await nuevaMica();
  const contextoMica = await browser.newContext({ ...devices["Pixel 7"], permissions: ["camera", "microphone"], baseURL: test.info().project.use.baseURL });
  try {
    await contextoMica.addCookies(await cookiesDeSesion(mica.sesion));
    const estudio = await contextoMica.newPage();
    await estudio.goto("/mi-puesto/vivo");
    await expect(estudio.getByText("Vista previa · nadie te ve todavía")).toBeVisible({ timeout: 30_000 });
    await estudio.getByRole("button", { name: "Salir en vivo" }).click();
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
