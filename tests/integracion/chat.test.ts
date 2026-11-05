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

  it("la feriante no se frena a sí misma", async () => {
    for (let i = 0; i < 4; i++) {
      const r = await publicarPrueba(mica.id, vivo, "Vestidos a 8000");
      expect(r.estado).toBe("ok");
      expect(r.mensaje).toMatchObject({ is_seller: true, hidden_reason: null });
    }
    const { data } = await clienteAdmin().from("chat_silences").select("id").eq("user_id", mica.id);
    expect(data).toEqual([]);
  });

  it("a la feriante solo le oculta el insulto, y no la silencia", async () => {
    for (let i = 0; i < 4; i++) {
      const r = await publicarPrueba(mica.id, vivo, `insulto ${i}`, "insulto");
      expect(r.estado).toBe("ok");
      expect(r.mensaje).toMatchObject({ is_seller: true, hidden_reason: "insulto" });
    }
    const { data } = await clienteAdmin().from("chat_silences").select("id").eq("user_id", mica.id);
    expect(data).toEqual([]);
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
      await new Promise((r) => setTimeout(r, 1000)); // margen para que el filtro quede activo en el servidor
      await publicarPrueba(caro.id, vivo, "escondido www.x.com", "link");
      await publicarPrueba(luz.id, vivo, "se ve");
      const limite = Date.now() + 8000;
      while (!recibidos.includes("se ve") && Date.now() < limite) await new Promise((r) => setTimeout(r, 100));
      if (!recibidos.includes("se ve")) throw new Error("El mensaje visible no llegó por tiempo real en 8 s");
      await new Promise((r) => setTimeout(r, 500)); // por si el oculto llegara tarde
      expect(recibidos).toEqual(["se ve"]);
    } finally {
      await visitante.removeChannel(canal);
    }
  }, 15_000);

  describe("moderación", () => {
    const rpc = (u: UsuarioPrueba, fn: string, args: Record<string, unknown>) => u.cliente.rpc(fn, args);
    const silenciosDe = async (userId: string) => {
      const { data } = await clienteAdmin().from("chat_silences").select("*").eq("user_id", userId);
      return data ?? [];
    };
    const limpiarSilencios = async (userId: string) => {
      await clienteAdmin().from("chat_silences").delete().eq("user_id", userId);
      await clienteAdmin().from("moderation_actions").delete().eq("target_user_id", userId);
    };
    afterAll(async () => {
      await limpiarSilencios(caro.id);
      await limpiarSilencios(luz.id);
    });

    it("solo la dueña borra", async () => {
      const m = (await publicarPrueba(luz.id, vivo, "texto original")).mensaje as { id: string };
      const a = await rpc(caro, "borrar_mensaje", { p_mensaje: m.id });
      expect(a.error?.message).toContain("sin_permiso");
      const b = await rpc(mica, "borrar_mensaje", { p_mensaje: m.id });
      expect(b.error).toBeNull();
      const [fila] = await delAdmin();
      expect(fila.body).toBe("");
      expect(fila.normalized).toBe("");
      expect(fila.deleted_at).not.toBeNull();
      const { data: acc } = await clienteAdmin().from("moderation_actions").select("*").eq("message_id", m.id);
      expect(acc).toHaveLength(1);
      expect(acc![0]).toMatchObject({ message_body: "texto original", action: "borrar", actor_id: mica.id, actor_kind: "feriante", target_user_id: luz.id });
    });

    it("el mensaje borrado no filtra su texto a quien lo lee", async () => {
      const m = (await publicarPrueba(luz.id, vivo, "secreto borrado")).mensaje as { id: string };
      await rpc(mica, "borrar_mensaje", { p_mensaje: m.id });
      const { data } = await clienteAnonimo().from("chat_messages").select("body, normalized, deleted_at").eq("id", m.id);
      expect(data).toHaveLength(1);
      expect(data![0]!.body).toBe("");
      expect(data![0]!.normalized).toBe("");
      expect(data![0]!.deleted_at).not.toBeNull();
    });

    it("tiempo real: el borrado llega a quien mira", async () => {
      const m = (await publicarPrueba(luz.id, vivo, "para borrar en vivo")).mensaje as { id: string };
      const visitante = clienteAnonimo();
      const recibidos: { id: string; body: string; deleted_at: string | null }[] = [];
      const canal = visitante.channel(`chat-borrado-${vivo}`);
      await new Promise<void>((ok, mal) => {
        canal
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages", filter: `live_session_id=eq.${vivo}` },
            (p) => recibidos.push(p.new as { id: string; body: string; deleted_at: string | null }))
          .subscribe((estado) => {
            if (estado === "SUBSCRIBED") ok();
            if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") mal(new Error(estado));
          });
      });
      try {
        await new Promise((r) => setTimeout(r, 1000));
        await rpc(mica, "borrar_mensaje", { p_mensaje: m.id });
        const limite = Date.now() + 8000;
        while (!recibidos.some((r) => r.id === m.id) && Date.now() < limite) await new Promise((r) => setTimeout(r, 100));
        const r = recibidos.find((x) => x.id === m.id);
        if (!r) throw new Error("El borrado no llegó por tiempo real en 8 s");
        expect(r.deleted_at).not.toBeNull();
        expect(r.body).toBe("");
      } finally {
        await visitante.removeChannel(canal);
      }
    }, 15_000);

    it("no borra en sala ajena", async () => {
      const otra = await crearUsuarioPrueba({ nombre: "Otra Feriante" });
      const t2 = await crearTiendaPrueba(otra);
      try {
        const m = (await publicarPrueba(luz.id, vivo, "de la sala de Mica")).mensaje as { id: string };
        const { error } = await rpc(otra, "borrar_mensaje", { p_mensaje: m.id });
        expect(error?.message).toContain("sin_permiso");
        expect((await delAdmin())[0].deleted_at).toBeNull();
      } finally {
        await borrarChatDeTienda(t2.id);
        await borrarUsuarioPrueba(otra.id);
      }
    });

    it("silenciar 10 minutos", async () => {
      await limpiarSilencios(caro.id);
      const { error } = await rpc(mica, "silenciar_en_sala", { p_store: tienda.id, p_user: caro.id, p_tipo: "temporal" });
      expect(error).toBeNull();
      expect(await publicarPrueba(caro.id, vivo, "hola")).toEqual({ estado: "silenciada", tipo: "temporal" });
      const { data: mio } = await caro.cliente.from("chat_silences").select("kind, source").eq("user_id", caro.id);
      expect(mio).toEqual([{ kind: "temporal", source: "feriante" }]);
      const { data: ajeno } = await luz.cliente.from("chat_silences").select("kind").eq("user_id", caro.id);
      expect(ajeno).toEqual([]);
      const [s] = await silenciosDe(caro.id);
      const falta = new Date(s.until).getTime() - Date.now();
      expect(falta).toBeGreaterThan(590_000);
      expect(falta).toBeLessThanOrEqual(610_000);
      await limpiarSilencios(caro.id);
    });

    it("tipo inválido y sin permiso", async () => {
      const a = await rpc(mica, "silenciar_en_sala", { p_store: tienda.id, p_user: caro.id, p_tipo: "plataforma" });
      expect(a.error?.message).toContain("datos_invalidos");
      const b = await rpc(caro, "silenciar_en_sala", { p_store: tienda.id, p_user: luz.id, p_tipo: "sala" });
      expect(b.error?.message).toContain("sin_permiso");
      expect(await silenciosDe(luz.id)).toEqual([]);
    });

    it("no se silencia a sí misma", async () => {
      const { error } = await rpc(mica, "silenciar_en_sala", { p_store: tienda.id, p_user: mica.id, p_tipo: "sala" });
      expect(error?.message).toContain("no_a_vos_misma");
      expect(await silenciosDe(mica.id)).toEqual([]);
    });

    it("silenciar en mi sala y deshacer", async () => {
      await limpiarSilencios(caro.id);
      await publicarPrueba(caro.id, vivo, "yo escribí acá");
      await rpc(mica, "silenciar_en_sala", { p_store: tienda.id, p_user: caro.id, p_tipo: "sala" });
      await rpc(mica, "silenciar_en_sala", { p_store: tienda.id, p_user: caro.id, p_tipo: "sala" });
      expect(await silenciosDe(caro.id)).toHaveLength(1);
      expect(await publicarPrueba(caro.id, vivo, "otra")).toEqual({ estado: "silenciada", tipo: "sala" });
      const { data, error } = await rpc(mica, "silenciadas_de_mi_sala", { p_store: tienda.id });
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({ user_id: caro.id, nombre: "Prueba P." });
      expect((await rpc(caro, "silenciadas_de_mi_sala", { p_store: tienda.id })).error?.message).toContain("sin_permiso");
      expect((await rpc(caro, "quitar_silencio", { p_store: tienda.id, p_user: caro.id })).error?.message).toContain("sin_permiso");
      expect((await rpc(mica, "quitar_silencio", { p_store: tienda.id, p_user: caro.id })).error).toBeNull();
      expect((await publicarPrueba(caro.id, vivo, "volví")).estado).toBe("ok");
      expect((await rpc(mica, "silenciadas_de_mi_sala", { p_store: tienda.id })).data).toEqual([]);
      await limpiarSilencios(caro.id);
    });

    it("sin mensajes, el nombre es Alguien", async () => {
      await limpiarSilencios(luz.id);
      await rpc(mica, "silenciar_en_sala", { p_store: tienda.id, p_user: luz.id, p_tipo: "sala" });
      const { data } = await rpc(mica, "silenciadas_de_mi_sala", { p_store: tienda.id });
      expect(data[0]).toMatchObject({ user_id: luz.id, nombre: "Alguien" });
      await limpiarSilencios(luz.id);
    });

    it("tres feriantes marcan la cuenta", async () => {
      await limpiarSilencios(caro.id);
      const ferias = await Promise.all([crearUsuarioPrueba({ nombre: "F1" }), crearUsuarioPrueba({ nombre: "F2" }), crearUsuarioPrueba({ nombre: "F3" })]);
      const tiendas = [] as { id: string }[];
      try {
        for (const f of ferias) tiendas.push(await crearTiendaPrueba(f));
        const revisar = async () => {
          const { data, error } = await admin.cliente.rpc("cuentas_para_revisar");
          if (error) throw error;
          return (data as { user_id: string; salas: number; en_plataforma: boolean }[]).find((c) => c.user_id === caro.id);
        };
        // dos de sala y una temporal: no alcanza
        await rpc(ferias[0]!, "silenciar_en_sala", { p_store: tiendas[0]!.id, p_user: caro.id, p_tipo: "sala" });
        await rpc(ferias[1]!, "silenciar_en_sala", { p_store: tiendas[1]!.id, p_user: caro.id, p_tipo: "sala" });
        await rpc(ferias[2]!, "silenciar_en_sala", { p_store: tiendas[2]!.id, p_user: caro.id, p_tipo: "temporal" });
        expect(await revisar()).toBeUndefined();
        // tres de sala: aparece
        await rpc(ferias[2]!, "silenciar_en_sala", { p_store: tiendas[2]!.id, p_user: caro.id, p_tipo: "sala" });
        expect(await revisar()).toMatchObject({ salas: 3, en_plataforma: false });
        expect((await mica.cliente.rpc("cuentas_para_revisar")).error?.message).toContain("sin_permiso");
        // una feriante lo quita: deja de aparecer
        await rpc(ferias[0]!, "quitar_silencio", { p_store: tiendas[0]!.id, p_user: caro.id });
        expect(await revisar()).toBeUndefined();
      } finally {
        await limpiarSilencios(caro.id);
        for (const t of tiendas) await borrarChatDeTienda(t.id);
        await Promise.all(ferias.map((f) => borrarUsuarioPrueba(f.id)));
      }
    });

    it("silenciar en toda la plataforma", async () => {
      await limpiarSilencios(caro.id);
      expect((await rpc(mica, "silenciar_en_plataforma", { p_user: caro.id })).error?.message).toContain("sin_permiso");
      expect((await rpc(admin, "silenciar_en_plataforma", { p_user: caro.id })).error).toBeNull();
      expect(await publicarPrueba(caro.id, vivo, "hola")).toEqual({ estado: "silenciada", tipo: "plataforma" });
      const { data } = await admin.cliente.rpc("cuentas_para_revisar");
      expect((data as { user_id: string; en_plataforma: boolean }[]).find((c) => c.user_id === caro.id)).toMatchObject({ en_plataforma: true });
      expect((await rpc(mica, "quitar_silencio_plataforma", { p_user: caro.id })).error?.message).toContain("sin_permiso");
      expect((await rpc(admin, "quitar_silencio_plataforma", { p_user: caro.id })).error).toBeNull();
      expect((await publicarPrueba(caro.id, vivo, "ya puedo")).estado).toBe("ok");
      await limpiarSilencios(caro.id);
    });

    it("borrado a los 30 días", async () => {
      await limpiarSilencios(caro.id);
      await limpiarSilencios(luz.id);
      const a = (await publicarPrueba(luz.id, vivo, "viejo normal")).mensaje as { id: string };
      const b = (await publicarPrueba(caro.id, vivo, "viejo de silenciada")).mensaje as { id: string };
      const c = (await publicarPrueba(luz.id, vivo, "reciente")).mensaje as { id: string };
      await rpc(mica, "silenciar_en_sala", { p_store: tienda.id, p_user: caro.id, p_tipo: "sala" });
      const viejo = new Date(Date.now() - 31 * 86_400_000).toISOString();
      await clienteAdmin().from("chat_messages").update({ created_at: viejo }).in("id", [a.id, b.id]);
      await clienteAdmin().from("moderation_actions").update({ created_at: viejo }).eq("target_user_id", caro.id);
      expect((await caro.cliente.rpc("borrar_chat_viejo")).error).not.toBeNull();
      expect((await clienteAdmin().rpc("borrar_chat_viejo")).error).toBeNull();
      const ids = (await delAdmin()).map((f) => f.id);
      expect(ids).toContain(b.id);
      expect(ids).toContain(c.id);
      expect(ids).not.toContain(a.id);
      const { data: acc } = await clienteAdmin().from("moderation_actions").select("id").eq("target_user_id", caro.id);
      expect(acc!.length).toBeGreaterThan(0); // su registro se conserva mientras siga silenciada
      await limpiarSilencios(caro.id);
    });
  });
});
