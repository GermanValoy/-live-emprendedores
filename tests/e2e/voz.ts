import type { BrowserContext } from "@playwright/test";

/**
 * El micrófono falso de Chrome emite pitidos y el estudio los manda a la ruta de la voz.
 * En las pruebas esa ruta se responde sin texto, para no gastar la cuota de Cloudflare.
 */
export async function responderVozVacia(context: BrowserContext): Promise<void> {
  await context.route(/\/mi-puesto\/vivo\/voz/, (r) => r.fulfill({ json: { texto: "" } }));
}
