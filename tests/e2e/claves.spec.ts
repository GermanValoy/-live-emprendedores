import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { clavesALaVista } from "../../src/lib/seguridad/claves-a-la-vista";
import { borrarUsuarioPrueba, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { crearTiendaPrueba, crearTransmisionPrueba, hacerAdmin } from "../helpers/tiendas-prueba";
import { cookiesDeSesion } from "./sesion";

// Lo que se ve con F12 nunca puede tener una clave secreta: ni los archivos armados de la app
// ni lo que el servidor manda al recorrer las páginas (también las de la feriante y la admin).

let mica: UsuarioPrueba;

test.afterAll(async () => {
  if (mica) await borrarUsuarioPrueba(mica.id);
});

/** Las claves que haya cargadas (en GitHub, la de Supabase; en la compu, todas). Solo se usan para comparar. */
function secretos(): Record<string, string | undefined> {
  let contrasenaBase: string | undefined;
  try {
    contrasenaBase = decodeURIComponent(new URL(process.env.DATABASE_URL ?? "").password) || undefined;
  } catch {
    contrasenaBase = undefined;
  }
  return {
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    CLOUDFLARE_STREAM_API_TOKEN: process.env.CLOUDFLARE_STREAM_API_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    "la contraseña de DATABASE_URL": contrasenaBase,
  };
}

async function archivosDe(carpeta: string): Promise<string[]> {
  const entradas = await readdir(carpeta, { withFileTypes: true, recursive: true });
  return entradas.filter((e) => e.isFile() && /\.(js|css|html|json)$/.test(e.name)).map((e) => path.join(e.parentPath, e.name));
}

test("ninguna clave secreta llega al navegador", async ({ page, context }) => {
  test.setTimeout(180_000);
  mica = await crearUsuarioPrueba({ nombre: "Mica Claves" });
  await hacerAdmin(mica.id);
  const tienda = await crearTiendaPrueba(mica, { conProducto: true });
  await crearTransmisionPrueba(tienda.id);

  const hallazgos = new Map<string, Set<string>>();
  const revisar = (donde: string, texto: string) => {
    for (const clave of clavesALaVista(texto, secretos())) {
      if (!hallazgos.has(clave)) hallazgos.set(clave, new Set());
      hallazgos.get(clave)!.add(donde);
    }
  };

  // 1) Los archivos que la app manda al navegador, tal como quedaron armados.
  for (const archivo of await archivosDe(path.join(".next", "static"))) revisar(archivo, await readFile(archivo, "utf8"));

  // 2) Todo lo que llega al recorrer las páginas, como la feriante y administradora (lo que se ve con F12).
  const pendientes: Promise<void>[] = [];
  page.on("response", (respuesta) => {
    if (!respuesta.url().startsWith("http://localhost")) return;
    pendientes.push(respuesta.text().then((t) => revisar(respuesta.url(), t), () => undefined));
  });
  await context.addCookies(await cookiesDeSesion(mica.sesion));
  const paginas = [
    "/", `/@${tienda.handle}`, `/@${tienda.handle}/vivo`, "/seguidos", "/cuenta",
    "/mi-puesto", "/mi-puesto/tienda", "/mi-puesto/productos", "/mi-puesto/vivo", "/admin",
  ];
  for (const ruta of paginas) {
    await page.goto(ruta);
    await page.waitForLoadState("networkidle").catch(() => undefined);
  }
  await Promise.all(pendientes);

  const detalle = [...hallazgos].map(([clave, lugares]) => `${clave} en: ${[...lugares].slice(0, 5).join(", ")}`);
  expect(detalle, "Hay claves secretas a la vista del navegador").toEqual([]);
});
