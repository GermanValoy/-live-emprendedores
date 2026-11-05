import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { borrarUsuarioPrueba, clienteAdmin, clienteAnonimo, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import {
  borrarChatDeTienda, borrarVivosDeTienda, crearTiendaPrueba, crearTransmisionPrueba, hacerAdmin, publicarPrueba,
} from "../helpers/tiendas-prueba";

describe("chat", () => {
  let admin: UsuarioPrueba;
  let mica: UsuarioPrueba;
  let caro: UsuarioPrueba;
  let luz: UsuarioPrueba;
  let tienda: { id: string; handle: string };
  let vivo: string;

  const mensajes = async (c: ReturnType<typeof clienteAnonimo>) => {
    const { data, error } = await c.from("chat_messages").select("*").eq("live_session_id", vivo).order("created_at");
    if (error) throw error;
    return data ?? [];
  };
  const delAdmin = async () => {
    const { data } = await clienteAdmin().from("chat_messages").select("*").eq("live_session_id", vivo).order("created_at");
    return data ?? [];
  };

  beforeAll(async () => {
    [admin, mica, caro, luz] = await Promise.all([
      crearUsuarioPrueba({ nombre: "Admin Chat" }),
      crearUsuarioPrueba({ nombre: "Mica Chat" }),
      crearUsuarioPrueba({ nombre: "Caro Chat" }),
      crearUsuarioPrueba({ nombre: "Luz Chat" }),
    ]);
    await hacerAdmin(admin.id);
    tienda = await crearTiendaPrueba(mica);
    await crearTransmisionPrueba(tienda.id);
    const { data, error } = await mica.cliente.rpc("abrir_vivo", { p_store: tienda.id, p_device: crypto.randomUUID() });
    if (error) throw error;
    vivo = data as string;
  });

  beforeEach(async () => {
    await borrarChatDeTienda(tienda.id);
  });

  afterAll(async () => {
    if (tienda) {
      await borrarChatDeTienda(tienda.id);
      await borrarVivosDeTienda(tienda.id);
    }
    await Promise.all([admin, mica, caro, luz].filter(Boolean).map((u) => borrarUsuarioPrueba(u.id)));
  });

  it("cualquiera lee el chat del vivo abierto", async () => {
    await publicarPrueba(caro.id, vivo, "holaa");
    const { data } = await clienteAnonimo().from("chat_messages").select("body, author_name").eq("live_session_id", vivo);
    expect(data).toEqual([{ body: "holaa", author_name: "Prueba P." }]);
  });

  it("un oculto solo lo lee quien lo escribió", async () => {
    await publicarPrueba(caro.id, vivo, "mirá www.x.com", "link");
    expect(await mensajes(caro.cliente)).toHaveLength(1);
    expect(await mensajes(luz.cliente)).toHaveLength(0);
    expect(await mensajes(clienteAnonimo())).toHaveLength(0);
    expect(await mensajes(mica.cliente)).toHaveLength(0);
  });

  it("nadie escribe directo", async () => {
    await publicarPrueba(caro.id, vivo, "uno");
    const fila = { live_session_id: vivo, store_id: tienda.id, user_id: caro.id, author_name: "X", body: "x", normalized: "x" };
    const a = await caro.cliente.from("chat_messages").insert(fila).select();
    expect(a.error !== null || (a.data ?? []).length === 0).toBe(true);
    const b = await clienteAnonimo().from("chat_messages").insert(fila).select();
    expect(b.error !== null || (b.data ?? []).length === 0).toBe(true);
    const u = await caro.cliente.from("chat_messages").update({ body: "cambiado" }).eq("live_session_id", vivo).select();
    expect(u.error !== null || (u.data ?? []).length === 0).toBe(true);
    const d = await caro.cliente.from("chat_messages").delete().eq("live_session_id", vivo).select();
    expect(d.error !== null || (d.data ?? []).length === 0).toBe(true);
    const filas = await delAdmin();
    expect(filas.map((f) => f.body)).toEqual(["uno"]);
  });

  it("el navegador no llama a publicar_mensaje", async () => {
    const args = { p_user: caro.id, p_vivo: vivo, p_nombre: "X", p_texto: "hola", p_normalizado: "hola", p_motivo: null };
    expect((await caro.cliente.rpc("publicar_mensaje", args)).error).not.toBeNull();
    expect((await clienteAnonimo().rpc("publicar_mensaje", args)).error).not.toBeNull();
    expect(await delAdmin()).toHaveLength(0);
  });

  it("no se lee la configuración ni las palabras", async () => {
    for (const c of [caro.cliente, clienteAnonimo()]) {
      for (const tabla of ["chat_config", "chat_blocked_words"]) {
        const { data, error } = await c.from(tabla).select("*");
        expect(error !== null || (data ?? []).length === 0).toBe(true);
      }
    }
    const { data } = await clienteAdmin().from("chat_config").select("*").single();
    expect(data).toEqual({
      id: 1, largo_maximo: 200, rafaga_mensajes: 5, rafaga_segundos: 10, repetido_segundos: 60,
      frenados_para_silenciar: 3, frenados_ventana_segundos: 600, silencio_segundos: 600,
      mensajes_al_entrar: 50, guardar_dias: 30, salas_para_revisar: 3,
    });
    const { count } = await clienteAdmin().from("chat_blocked_words").select("*", { count: "exact", head: true });
    expect(count).toBeGreaterThan(10);
  });

  it("no se escribe en un vivo cerrado", async () => {
    // vivo aparte para no cerrar el de las demás pruebas
    const otra = await crearUsuarioPrueba({ nombre: "Otra Chat" });
    const t2 = await crearTiendaPrueba(otra);
    try {
      await crearTransmisionPrueba(t2.id);
      const { data: v2 } = await otra.cliente.rpc("abrir_vivo", { p_store: t2.id, p_device: crypto.randomUUID() });
      await publicarPrueba(caro.id, v2 as string, "antes");
      const { error } = await otra.cliente.rpc("terminar_vivo", { p_vivo: v2 });
      expect(error).toBeNull();
      expect(await publicarPrueba(caro.id, v2 as string, "después")).toEqual({ estado: "cerrado" });
      for (const c of [clienteAnonimo(), caro.cliente]) {
        const { data } = await c.from("chat_messages").select("id").eq("live_session_id", v2);
        expect(data ?? []).toHaveLength(0);
      }
      const { data: visto } = await admin.cliente.from("chat_messages").select("body").eq("live_session_id", v2);
      expect(visto).toEqual([{ body: "antes" }]);
    } finally {
      await borrarChatDeTienda(t2.id);
      await borrarVivosDeTienda(t2.id);
      await borrarUsuarioPrueba(otra.id);
    }
  });

  it("texto vacío o demasiado largo", async () => {
    await expect(publicarPrueba(caro.id, vivo, "   ")).rejects.toMatchObject({ message: expect.stringContaining("texto_invalido") });
    await expect(publicarPrueba(caro.id, vivo, "a".repeat(201))).rejects.toMatchObject({ message: expect.stringContaining("texto_invalido") });
    expect((await publicarPrueba(caro.id, vivo, "😍".repeat(200))).estado).toBe("ok");
  });

  it("ráfaga", async () => {
    for (let i = 0; i < 5; i++) expect((await publicarPrueba(caro.id, vivo, `msg ${i}`)).estado).toBe("ok");
    expect(await publicarPrueba(caro.id, vivo, "msg 6")).toEqual({ estado: "rafaga" });
    expect(await delAdmin()).toHaveLength(5);
  });

  it("repetido", async () => {
    await publicarPrueba(caro.id, vivo, "hola");
    await publicarPrueba(caro.id, vivo, "hola");
    const filas = await delAdmin();
    expect(filas[0].hidden_reason).toBeNull();
    expect(filas[1].hidden_reason).toBe("repetido");
  });

  it("tres frenados silencian 10 minutos", async () => {
    for (let i = 0; i < 3; i++) await publicarPrueba(caro.id, vivo, `link ${i}`, "link");
    const { data } = await clienteAdmin().from("chat_silences").select("*").eq("store_id", tienda.id).eq("user_id", caro.id);
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ kind: "temporal", source: "moderador" });
    const falta = new Date(data![0].until).getTime() - Date.now();
    expect(falta).toBeGreaterThan(590_000);
    expect(falta).toBeLessThanOrEqual(610_000); // margen por la diferencia de reloj con la base
    const { data: acciones } = await clienteAdmin().from("moderation_actions").select("*").eq("store_id", tienda.id);
    expect(acciones).toHaveLength(1);
    expect(acciones![0]).toMatchObject({ actor_id: null, actor_kind: "moderador", action: "silenciar_temporal" });
    expect(await publicarPrueba(caro.id, vivo, "otro")).toEqual({ estado: "silenciada", tipo: "temporal" });
    const { data: mio } = await caro.cliente.from("chat_silences").select("kind").eq("user_id", caro.id);
    expect(mio).toEqual([{ kind: "temporal" }]);
    const { data: ajeno } = await luz.cliente.from("chat_silences").select("kind").eq("user_id", caro.id);
    expect(ajeno).toEqual([]);
  });

  it("la feriante", async () => {
    const r = await publicarPrueba(mica.id, vivo, "mi wsp 3815551234", "promocion");
    expect(r.estado).toBe("ok");
    expect(r.mensaje).toMatchObject({ is_seller: true, hidden_reason: null, author_name: "Puesto de Prueba" });
  });

  it("carga inicial", async () => {
    await publicarPrueba(luz.id, vivo, "visible");
    await publicarPrueba(caro.id, vivo, "oculto www.x.com", "link");
    await publicarPrueba(mica.id, vivo, "borrado");
    await clienteAdmin().from("chat_messages").update({ deleted_at: new Date().toISOString() }).eq("body", "borrado").eq("live_session_id", vivo);
    const carga = async (c: ReturnType<typeof clienteAnonimo>) => {
      const { data } = await c.from("chat_messages").select("body").eq("live_session_id", vivo).is("deleted_at", null).order("created_at");
      return (data ?? []).map((m) => m.body);
    };
    expect(await carga(luz.cliente)).toEqual(["visible"]);
    expect(await carga(caro.cliente)).toEqual(["visible", "oculto www.x.com"]);
  });

  it("tiempo real", async () => {
    const visitante = clienteAnonimo();
    const recibidos: string[] = [];
    const canal = visitante.channel(`chat-prueba-${vivo}`);
    await new Promise<void>((ok, mal) => {
      canal
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `live_session_id=eq.${vivo}` },
          (p) => recibidos.push((p.new as { body: string }).body))
        .subscribe((estado) => {
          if (estado === "SUBSCRIBED") ok();
          if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") mal(new Error(estado));
        });
    });
    try {
      await publicarPrueba(caro.id, vivo, "escondido www.x.com", "link");
      await publicarPrueba(luz.id, vivo, "se ve");
      await new Promise((r) => setTimeout(r, 3000));
      expect(recibidos).toEqual(["se ve"]);
    } finally {
      await visitante.removeChannel(canal);
    }
  }, 15_000);
});
