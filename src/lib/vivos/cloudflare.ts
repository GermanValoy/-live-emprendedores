export type CredencialesCloudflare = { accountId: string; token: string };
export type UrlsTransmision = { uid: string; urlTransmitir: string; urlMirar: string };

export class ErrorCloudflare extends Error {}

type RespuestaCloudflare<T> = { success: boolean; errors?: { code: number; message: string }[]; result: T };
type EntradaEnLista = { uid: string; meta?: { name?: string } };
type EntradaDetalle = { uid: string; webRTC: { url: string }; webRTCPlayback: { url: string } };

async function llamar<T>(url: string, cred: CredencialesCloudflare, f: typeof fetch, init: RequestInit = {}): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await f(url, {
      ...init,
      headers: { Authorization: `Bearer ${cred.token}`, "Content-Type": "application/json" },
    });
  } catch {
    // El error de red puede traer la URL o la llave: no se repite.
    throw new ErrorCloudflare("No se pudo conectar con Cloudflare");
  }
  const cuerpo = (await respuesta.json().catch(() => null)) as RespuestaCloudflare<T> | null;
  if (!respuesta.ok || !cuerpo?.success) {
    const mensajes = cuerpo?.errors?.map((e) => e.message).join("; ") || `estado ${respuesta.status}`;
    throw new ErrorCloudflare(`Cloudflare respondió: ${mensajes}`);
  }
  return cuerpo.result;
}

/**
 * Devuelve las URLs para transmitir (WHIP, es una credencial) y mirar (WHEP)
 * de la transmisión con ese nombre exacto; si no existe, la crea sin grabación.
 */
export async function obtenerOCrearTransmision(
  nombre: string, cred: CredencialesCloudflare, f: typeof fetch = fetch,
): Promise<UrlsTransmision> {
  const base = `https://api.cloudflare.com/client/v4/accounts/${cred.accountId}/stream/live_inputs`;
  const lista = await llamar<EntradaEnLista[]>(base, cred, f);
  const existente = lista.find((e) => e.meta?.name === nombre);
  const detalle = existente
    ? await llamar<EntradaDetalle>(`${base}/${existente.uid}`, cred, f)
    : await llamar<EntradaDetalle>(base, cred, f, {
        method: "POST",
        body: JSON.stringify({ meta: { name: nombre }, recording: { mode: "off" } }),
      });
  return { uid: detalle.uid, urlTransmitir: detalle.webRTC.url, urlMirar: detalle.webRTCPlayback.url };
}
