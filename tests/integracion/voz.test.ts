import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { atenderVoz } from "@/lib/voz/atender";
import { borrarUsuarioPrueba, clienteAdmin, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { borrarVivosDeTienda, crearTiendaPrueba, crearTransmisionPrueba } from "../helpers/tiendas-prueba";

// El módulo es solo de servidor (`import "server-only"`); fuera de Next esa marca tira error, así que acá se neutraliza.
vi.mock("server-only", () => ({}));

/** WAV de silencio de 0,5 s (16 kHz, mono, 16 bits). */
function wavSilencio(segundos: number): ArrayBuffer {
  const n = Math.round(16_000 * segundos);
  const b = new DataView(new ArrayBuffer(44 + n * 2));
  const txt = (o: number, s: string) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  txt(0, "RIFF"); b.setUint32(4, 36 + n * 2, true); txt(8, "WAVE"); txt(12, "fmt ");
  b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, 16_000, true); b.setUint32(28, 32_000, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true);
  txt(36, "data"); b.setUint32(40, n * 2, true);
  return b.buffer;
}

const diaTucuman = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Tucuman" });

describe("voz de la feriante", () => {
  let mica: UsuarioPrueba;
  let caro: UsuarioPrueba;
  let tienda: { id: string; handle: string };
  let vivo: string;
  const admin = clienteAdmin();
  const transcribir = async () => "";

  const pedir = (userId: string | null, vivoId = vivo, cuerpo: ArrayBuffer = wavSilencio(0.5), tipo = "audio/wav") =>
    atenderVoz(
      new Request(`http://localhost/mi-puesto/vivo/voz?vivo=${vivoId}`, { method: "POST", body: cuerpo, headers: { "content-type": tipo } }),
      { userId, admin, transcribir },
    );
  const segundosHoy = async () => {
    const { data, error } = await admin.from("voice_usage").select("seconds").eq("store_id", tienda.id).eq("day", diaTucuman()).maybeSingle();
    if (error) throw error;
    return (data?.seconds as number | undefined) ?? 0;
  };

  beforeAll(async () => {
    [mica, caro] = await Promise.all([crearUsuarioPrueba({ nombre: "Mica Voz" }), crearUsuarioPrueba({ nombre: "Caro Voz" })]);
    tienda = await crearTiendaPrueba(mica);
    await crearTransmisionPrueba(tienda.id);
    const { data, error } = await mica.cliente.rpc("abrir_vivo", { p_store: tienda.id, p_device: crypto.randomUUID() });
    if (error) throw error;
    vivo = data as string;
  }, 60_000);

  beforeEach(async () => {
    await admin.from("voice_usage").delete().eq("store_id", tienda.id);
  });

  afterAll(async () => {
    await borrarVivosDeTienda(tienda.id);
    await Promise.all([borrarUsuarioPrueba(mica.id), borrarUsuarioPrueba(caro.id)]);
  });

  it("sin sesión: 401", async () => {
    expect((await pedir(null)).status).toBe(401);
  });

  it("una persona que no es la dueña: 403", async () => {
    expect((await pedir(caro.id)).status).toBe(403);
  });

  it("la dueña con un vivo abierto: 200, texto vacío y suma los segundos", async () => {
    const r = await pedir(mica.id);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ texto: "" });
    expect(await segundosHoy()).toBeCloseTo(0.5, 2);
  });

  it("dos frases juntas se suman sin pisarse", async () => {
    await Promise.all([pedir(mica.id), pedir(mica.id)]);
    expect(await segundosHoy()).toBeCloseTo(1, 2);
  });

  it("audio inválido: 400", async () => {
    expect((await pedir(mica.id, vivo, new ArrayBuffer(0))).status).toBe(400);
    expect((await pedir(mica.id, vivo, new ArrayBuffer(1_000_001))).status).toBe(400);
    expect((await pedir(mica.id, vivo, wavSilencio(0.5), "text/plain")).status).toBe(400);
  });

  it("con el límite del día alcanzado: 429", async () => {
    const { data: config } = await admin.from("code_config").select("voz_segundos_por_dia").eq("id", 1).single();
    const { error } = await admin.from("voice_usage").insert({ store_id: tienda.id, day: diaTucuman(), seconds: config!.voz_segundos_por_dia });
    if (error) throw error;
    const r = await pedir(mica.id);
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: "limite" });
  });

  it("con el vivo cerrado: 403", async () => {
    const { error } = await mica.cliente.rpc("terminar_vivo", { p_vivo: vivo });
    if (error) throw error;
    expect((await pedir(mica.id)).status).toBe(403);
  });
});
