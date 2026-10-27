import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { obtenerTransmisionDelPuesto } from "@/lib/vivos/transmision-puesto";
import { borrarUsuarioPrueba, clienteAdmin, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { crearTiendaPrueba, crearTransmisionPrueba } from "../helpers/tiendas-prueba";

const CRED = { accountId: "ACC", token: "TOK" };
const BASE = "https://api.cloudflare.com/client/v4/accounts/ACC/stream/live_inputs";

type Llamada = { url: string; init: RequestInit | undefined };

function fetchFalso(respuestas: Record<string, unknown>) {
  const llamadas: Llamada[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    llamadas.push({ url, init });
    const r = respuestas[`${init?.method ?? "GET"} ${url}`];
    if (r === undefined) throw new Error(`Llamada inesperada: ${init?.method ?? "GET"} ${url}`);
    return new Response(JSON.stringify({ success: true, errors: [], result: r }), { status: 200 });
  }) as typeof fetch;
  return { f, llamadas };
}

describe("obtenerTransmisionDelPuesto", () => {
  let duena: UsuarioPrueba;
  let tienda1: { id: string };
  let tienda2: { id: string };
  const db = clienteAdmin();

  beforeAll(async () => {
    duena = await crearUsuarioPrueba({ nombre: "Dueña Transmision" });
    tienda1 = await crearTiendaPrueba(duena);
  });

  afterAll(async () => {
    if (duena) await borrarUsuarioPrueba(duena.id); // borra tiendas y transmisiones en cascada
  });

  it("usa la guardada sin llamar a Cloudflare", async () => {
    await crearTransmisionPrueba(tienda1.id);
    const { f, llamadas } = fetchFalso({});
    await expect(obtenerTransmisionDelPuesto(tienda1.id, { db, cred: CRED, f })).resolves.toEqual({
      uid: `prueba-${tienda1.id}`,
      urlTransmitir: "https://cloudflare.invalid/whip",
      urlMirar: "https://cloudflare.invalid/whep",
    });
    expect(llamadas).toHaveLength(0);
  });

  it("crea y guarda la primera vez", async () => {
    const otra = await crearUsuarioPrueba({ nombre: "Otra Transmision" });
    try {
      tienda2 = await crearTiendaPrueba(otra);
      const detalle = { uid: "u9", webRTC: { url: "https://w/whip" }, webRTCPlayback: { url: "https://w/whep" } };
      const { f, llamadas } = fetchFalso({ [`GET ${BASE}`]: [], [`POST ${BASE}`]: detalle });
      const esperado = { uid: "u9", urlTransmitir: "https://w/whip", urlMirar: "https://w/whep" };

      await expect(obtenerTransmisionDelPuesto(tienda2.id, { db, cred: CRED, f })).resolves.toEqual(esperado);
      const post = llamadas.find((l) => l.init?.method === "POST");
      const cuerpo = JSON.parse(String(post?.init?.body));
      expect(cuerpo.meta.name).toBe(`puesto-${tienda2.id}`);
      expect(cuerpo.recording.mode).toBe("off");

      const { data } = await db.from("store_streams").select("cloudflare_uid, whip_url, whep_url").eq("store_id", tienda2.id).single();
      expect(data).toEqual({ cloudflare_uid: "u9", whip_url: "https://w/whip", whep_url: "https://w/whep" });

      const antes = llamadas.length;
      await expect(obtenerTransmisionDelPuesto(tienda2.id, { db, cred: CRED, f })).resolves.toEqual(esperado);
      expect(llamadas).toHaveLength(antes);
    } finally {
      await borrarUsuarioPrueba(otra.id);
    }
  });
});
