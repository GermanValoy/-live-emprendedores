import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { borrarUsuarioPrueba, clienteAdmin, clienteAnonimo, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { borrarVivosDeTienda, crearTiendaPrueba, crearTransmisionPrueba, hacerAdmin } from "../helpers/tiendas-prueba";

describe("vivos", () => {
  let admin: UsuarioPrueba;
  let mica: UsuarioPrueba;
  let luz: UsuarioPrueba;
  let ana: UsuarioPrueba;
  let tercera: UsuarioPrueba;
  let compradora: UsuarioPrueba;
  let tiendaMica: { id: string; handle: string };
  let tiendaLuz: { id: string; handle: string };
  let tiendaAna: { id: string; handle: string };
  let tiendaTercera: { id: string; handle: string };
  const dispo = crypto.randomUUID();

  const abrir = (u: UsuarioPrueba, store: string, device = dispo) =>
    u.cliente.rpc("abrir_vivo", { p_store: store, p_device: device });
  const fila = async (id: string) => {
    const { data } = await clienteAdmin().from("live_sessions").select("*").eq("id", id).single();
    return data!;
  };
  const tiendas = () => [tiendaMica, tiendaLuz, tiendaAna, tiendaTercera].filter(Boolean);

  beforeAll(async () => {
    [admin, mica, luz, ana, tercera, compradora] = await Promise.all([
      crearUsuarioPrueba({ nombre: "Admin Vivo" }),
      crearUsuarioPrueba({ nombre: "Mica Vivo" }),
      crearUsuarioPrueba({ nombre: "Luz Vivo" }),
      crearUsuarioPrueba({ nombre: "Ana Vivo" }),
      crearUsuarioPrueba({ nombre: "Tercera Vivo" }),
      crearUsuarioPrueba({ nombre: "Compradora Vivo" }),
    ]);
    await hacerAdmin(admin.id);
    tiendaMica = await crearTiendaPrueba(mica);
    tiendaLuz = await crearTiendaPrueba(luz, { completa: false });
    tiendaAna = await crearTiendaPrueba(ana);
    tiendaTercera = await crearTiendaPrueba(tercera);
    await Promise.all([tiendaMica, tiendaAna, tiendaTercera].map((t) => crearTransmisionPrueba(t.id)));
  });

  beforeEach(async () => {
    await Promise.all(tiendas().map((t) => borrarVivosDeTienda(t.id)));
  });

  afterAll(async () => {
    for (const t of tiendas()) await borrarVivosDeTienda(t.id);
    await Promise.all([admin, mica, luz, ana, tercera, compradora].filter(Boolean).map((u) => borrarUsuarioPrueba(u.id)));
  });

  it("cualquiera lee el vivo y la configuración", async () => {
    const { data: id, error } = await abrir(mica, tiendaMica.id);
    expect(error).toBeNull();
    const { data } = await clienteAnonimo().from("live_sessions").select("id, whep_url").eq("store_id", tiendaMica.id);
    expect(data).toHaveLength(1);
    expect(data?.[0]?.id).toBe(id);
    const { data: cfg } = await clienteAnonimo().from("live_config").select("*").single();
    expect(cfg).toEqual({ id: 1, sin_conexion_segundos: 300, fuera_segundos: 900, senal_cada_segundos: 20 });
  });

  it("nadie lee store_streams desde el navegador", async () => {
    for (const c of [mica.cliente, compradora.cliente, clienteAnonimo()]) {
      const { data, error } = await c.from("store_streams").select("*");
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    }
  });

  it("solo la dueña abre su vivo", async () => {
    const { error } = await abrir(compradora, tiendaMica.id);
    expect(error?.message).toContain("sin_permiso");
  });

  it("sin transmisión no abre", async () => {
    const sinTransmision = await crearUsuarioPrueba({ nombre: "Sin Transmision Vivo" });
    const tienda = await crearTiendaPrueba(sinTransmision);
    try {
      const { error } = await abrir(sinTransmision, tienda.id);
      expect(error?.message).toContain("sin_transmision");
    } finally {
      await borrarUsuarioPrueba(sinTransmision.id);
    }
  });

  it("el vivo usa la URL de reproducción guardada en el servidor", async () => {
    const { data: id } = await abrir(mica, tiendaMica.id);
    expect((await fila(id)).whep_url).toBe("https://cloudflare.invalid/whep");
  });

  it("puesto incompleto no abre", async () => {
    const { error } = await abrir(luz, tiendaLuz.id);
    expect(error?.message).toContain("puesto_incompleto");
  });

  it("abrir dos veces retoma el mismo vivo", async () => {
    const A = crypto.randomUUID();
    const B = crypto.randomUUID();
    const [r1, r2] = await Promise.all([abrir(mica, tiendaMica.id, A), abrir(mica, tiendaMica.id, B)]);
    expect(r1.error).toBeNull();
    expect(r2.error).toBeNull();
    expect(r1.data).toBe(r2.data);
    const { data } = await clienteAdmin().from("live_sessions").select("*").eq("store_id", tiendaMica.id).is("ended_at", null);
    expect(data).toHaveLength(1);
    expect([A, B]).toContain(data?.[0]?.device_id);
  });

  it("nadie escribe directo", async () => {
    const { data: id } = await abrir(mica, tiendaMica.id);
    const { data, error } = await mica.cliente.from("live_sessions").update({ muted: true }).eq("id", id).select();
    expect(error !== null || (data ?? []).length === 0).toBe(true);
    expect((await fila(id)).muted).toBe(false);
    const ins = await mica.cliente.from("live_sessions").insert({ store_id: tiendaMica.id, whep_url: "x", device_id: dispo });
    expect(ins.error).not.toBeNull();
  });

  it("señal de vida", async () => {
    const { data: id } = await abrir(mica, tiendaMica.id);
    const r = await mica.cliente.rpc("senal_vivo", { p_vivo: id, p_device: dispo, p_fuera: false, p_silenciada: true, p_mirando: 7 });
    expect(r.data).toBe("ok");
    let f = await fila(id);
    expect([f.muted, f.viewers, f.peak_viewers]).toEqual([true, 7, 7]);
    await mica.cliente.rpc("senal_vivo", { p_vivo: id, p_device: dispo, p_fuera: false, p_silenciada: true, p_mirando: 3 });
    f = await fila(id);
    expect([f.viewers, f.peak_viewers]).toEqual([3, 7]);
  });

  it("fuera de la pantalla", async () => {
    const { data: id } = await abrir(mica, tiendaMica.id);
    const senal = (fuera: boolean) =>
      mica.cliente.rpc("senal_vivo", { p_vivo: id, p_device: dispo, p_fuera: fuera, p_silenciada: false, p_mirando: 0 });
    await senal(true);
    const primero = (await fila(id)).away_since;
    expect(primero).not.toBeNull();
    await senal(true);
    expect((await fila(id)).away_since).toBe(primero);
    await senal(false);
    expect((await fila(id)).away_since).toBeNull();
  });

  it("otro dispositivo", async () => {
    const A = crypto.randomUUID();
    const B = crypto.randomUUID();
    const { data: id } = await abrir(mica, tiendaMica.id, A);
    await abrir(mica, tiendaMica.id, B);
    const antes = await fila(id);
    const r = await mica.cliente.rpc("senal_vivo", { p_vivo: id, p_device: A, p_fuera: true, p_silenciada: true, p_mirando: 9 });
    expect(r.data).toBe("otro_dispositivo");
    expect(await fila(id)).toEqual(antes);
  });

  it("señal sobre vivo cerrado", async () => {
    const { data: id } = await abrir(mica, tiendaMica.id);
    const t = await mica.cliente.rpc("terminar_vivo", { p_vivo: id });
    expect(t.error).toBeNull();
    const cerrado = await fila(id);
    const r = await mica.cliente.rpc("senal_vivo", { p_vivo: id, p_device: dispo, p_fuera: false, p_silenciada: false, p_mirando: 1 });
    expect(r.data).toBe("terminado");
    const f = await fila(id);
    expect(f.ended_at).not.toBeNull();
    expect(f.end_reason).toBe("duena");
    expect(f).toEqual(cerrado);
    await mica.cliente.rpc("terminar_vivo", { p_vivo: id });
    expect((await fila(id)).ended_at).toBe(cerrado.ended_at);
  });

  it("solo un admin corta", async () => {
    const { data: id } = await abrir(mica, tiendaMica.id);
    for (const u of [compradora, mica]) {
      const { error } = await u.cliente.rpc("cortar_vivo", { p_vivo: id });
      expect(error?.message).toContain("sin_permiso");
    }
    const { error } = await admin.cliente.rpc("cortar_vivo", { p_vivo: id });
    expect(error).toBeNull();
    const f = await fila(id);
    expect(f.end_reason).toBe("plataforma");
    expect(f.ended_by).toBe(admin.id);
  });

  it("cierre automático", async () => {
    const { data: v1 } = await abrir(mica, tiendaMica.id);
    const { data: v2 } = await abrir(ana, tiendaAna.id);
    const { data: v3 } = await abrir(tercera, tiendaTercera.id);
    const db = clienteAdmin();
    const hace = (s: number) => new Date(Date.now() - s * 1000).toISOString();
    const u1 = await db.from("live_sessions").update({ last_signal_at: hace(301) }).eq("id", v1);
    const u2 = await db.from("live_sessions").update({ away_since: hace(901) }).eq("id", v2);
    const u3 = await db.from("live_sessions").update({ away_since: hace(600) }).eq("id", v3);
    expect([u1.error, u2.error, u3.error]).toEqual([null, null, null]);
    const { data: cerrados, error } = await db.rpc("cerrar_vivos_vencidos");
    expect(error).toBeNull();
    // el pg_cron real o vivos viejos de la base compartida pueden cambiar la cuenta exacta
    expect(typeof cerrados).toBe("number");
    expect(cerrados).toBeGreaterThanOrEqual(0);
    for (const id of [v1, v2]) {
      const f = await fila(id);
      expect(f.end_reason).toBe("sin_senal");
      expect(f.ended_at).not.toBeNull();
    }
    expect((await fila(v3)).ended_at).toBeNull();
  });

  it("la compradora no puede cerrar vencidos", async () => {
    const { error } = await compradora.cliente.rpc("cerrar_vivos_vencidos");
    expect(error).not.toBeNull();
  });
});
