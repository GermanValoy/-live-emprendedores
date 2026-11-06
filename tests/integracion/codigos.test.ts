import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { procesarReclamo } from "@/lib/codigos/reclamar";
import { borrarUsuarioPrueba, clienteAdmin, clienteAnonimo, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import {
  borrarChatDeTienda, borrarCodigosDeTienda, borrarVivosDeTienda, publicarPrueba, crearTiendaPrueba, crearTransmisionPrueba, lanzarPrueba, reclamarPrueba,
} from "../helpers/tiendas-prueba";

// El módulo es solo de servidor (`import "server-only"`); fuera de Next esa marca tira error, así que acá se neutraliza.
vi.mock("server-only", () => ({}));

/** Cuentas sin sesión (solo hace falta su id) para las pruebas de muchas compradoras a la vez. */
async function crearCompradoras(cuantas: number): Promise<string[]> {
  const admin = clienteAdmin();
  return Promise.all(
    Array.from({ length: cuantas }, async () => {
      const { data, error } = await admin.auth.admin.createUser({
        email: `prueba-${crypto.randomUUID()}@tuferia.test`,
        email_confirm: true,
        user_metadata: { full_name: "Compradora Simultánea" },
      });
      if (error || !data.user) throw error ?? new Error("No se creó la compradora de prueba");
      return data.user.id;
    }),
  );
}

/** Milisegundos entre una fecha guardada y "ahora + minutos". */
const distanciaA = (fecha: string, minutos: number) =>
  Math.abs(new Date(fecha).getTime() - (Date.now() + minutos * 60_000));

describe("códigos en vivo", () => {
  let mica: UsuarioPrueba;
  let caro: UsuarioPrueba;
  let luz: UsuarioPrueba;
  let tienda: { id: string; handle: string };
  let vivo: string;
  let compradoras: string[] = [];

  const abrirVivo = async () => {
    const { data, error } = await mica.cliente.rpc("abrir_vivo", { p_store: tienda.id, p_device: crypto.randomUUID() });
    if (error) throw error;
    vivo = data as string;
  };
  /** Termina el vivo actual y abre otro (para las pruebas que necesitan un vivo nuevo). */
  const vivoNuevo = async () => {
    const { error } = await mica.cliente.rpc("terminar_vivo", { p_vivo: vivo });
    if (error) throw error;
    await abrirVivo();
  };
  const lanzar = (
    c: UsuarioPrueba["cliente"],
    datos: { vivo?: string; palabra?: string; etiqueta?: string; precio?: number; cantidad?: number; foto?: string | null } = {},
  ) =>
    c.rpc("lanzar_codigo", {
      p_vivo: datos.vivo ?? vivo,
      p_palabra: datos.palabra ?? "rojo",
      p_etiqueta: datos.etiqueta ?? "ROJO",
      p_precio: datos.precio ?? 800000,
      p_cantidad: datos.cantidad ?? 1,
      p_foto: datos.foto ?? null,
      p_producto: null,
      p_por_voz: false,
    });
  const codigo = async (id: string) => {
    const { data, error } = await clienteAdmin().from("live_codes").select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  };
  /** Arma a mano un reclamo ganador con su pedido (reclamar_codigo llega en la Tarea 2). */
  const ganadoraConPedido = async (codigoId: string, u: UsuarioPrueba, estadoPedido = "por_pagar") => {
    const admin = clienteAdmin();
    const reclamo = await admin
      .from("claims")
      .insert({ code_id: codigoId, user_id: u.id, buyer_name: "Prueba P.", message_body: "rojo", status: "ganadora" })
      .select("id")
      .single();
    if (reclamo.error) throw reclamo.error;
    const pedido = await admin
      .from("orders")
      .insert({
        claim_id: reclamo.data.id, code_id: codigoId, store_id: tienda.id, live_session_id: vivo, buyer_id: u.id,
        buyer_name: "Prueba P.", price_cents: 800000, total_cents: 800000, payment_alias: "mica.ropa",
        payment_holder: "Micaela Díaz", status: estadoPedido, deadline: new Date(Date.now() + 900_000).toISOString(),
      })
      .select("id")
      .single();
    if (pedido.error) throw pedido.error;
    return { reclamo: reclamo.data.id as string, pedido: pedido.data.id as string };
  };

  beforeAll(async () => {
    [mica, caro, luz] = await Promise.all([
      crearUsuarioPrueba({ nombre: "Mica Código" }),
      crearUsuarioPrueba({ nombre: "Caro Código" }),
      crearUsuarioPrueba({ nombre: "Luz Código" }),
    ]);
    tienda = await crearTiendaPrueba(mica);
    const privados = await clienteAdmin()
      .from("store_private_info")
      .update({ payment_alias: "mica.ropa", payment_holder: "Micaela Díaz" })
      .eq("store_id", tienda.id);
    if (privados.error) throw privados.error;
    await crearTransmisionPrueba(tienda.id);
    await abrirVivo();
    compradoras = await crearCompradoras(20);
  }, 60_000);

  beforeEach(async () => {
    await borrarCodigosDeTienda(tienda.id);
  });

  afterAll(async () => {
    if (tienda) {
      await borrarCodigosDeTienda(tienda.id);
      await borrarVivosDeTienda(tienda.id);
    }
    await Promise.all([mica, caro, luz].filter(Boolean).map((u) => borrarUsuarioPrueba(u.id)));
    await Promise.all(compradoras.map((id) => borrarUsuarioPrueba(id)));
  }, 60_000);

  it("la feriante lanza un código y cualquiera lo lee", async () => {
    const { data, error } = await lanzar(mica.cliente);
    expect(error).toBeNull();
    expect(data).toMatchObject({ word: "rojo", label: "ROJO", store_id: tienda.id, live_session_id: vivo });
    const visitante = await clienteAnonimo()
      .from("live_codes")
      .select("label, price_cents, sold, status")
      .eq("live_session_id", vivo);
    expect(visitante.data).toEqual([{ label: "ROJO", price_cents: 800000, sold: 0, status: "activo" }]);
  });

  it("lanzar otro cierra el anterior", async () => {
    const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo");
    await lanzarPrueba(mica.cliente, vivo, "azul");
    const anterior = await codigo(rojo.id);
    expect(anterior.status).toBe("cerrado");
    expect(anterior.closed_at).not.toBeNull();
    const { data } = await clienteAnonimo().from("live_codes").select("label").eq("live_session_id", vivo).eq("status", "activo");
    expect(data).toEqual([{ label: "AZUL" }]);
  });

  it("palabra repetida", async () => {
    await lanzarPrueba(mica.cliente, vivo, "rojo");
    await lanzarPrueba(mica.cliente, vivo, "azul");
    const repetida = await lanzar(mica.cliente, { palabra: "rojo" });
    expect(repetida.error?.message).toBe("palabra_repetida");
    // El activo sigue siendo AZUL: el intento fallido no cerró nada.
    const { data } = await clienteAdmin().from("live_codes").select("label").eq("live_session_id", vivo).eq("status", "activo");
    expect(data).toEqual([{ label: "AZUL" }]);

    await vivoNuevo();
    const enOtroVivo = await lanzar(mica.cliente, { palabra: "rojo" });
    expect(enOtroVivo.error).toBeNull();
  });

  it("solo la dueña lanza, cierra y anula", async () => {
    const intento = await lanzar(caro.cliente);
    expect(intento.error?.message).toBe("sin_permiso");
    const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo");
    const cierre = await caro.cliente.rpc("cerrar_codigo", { p_codigo: rojo.id });
    expect(cierre.error?.message).toBe("sin_permiso");
    const anulacion = await caro.cliente.rpc("anular_codigo", { p_codigo: rojo.id });
    expect(anulacion.error?.message).toBe("sin_permiso");
    expect((await codigo(rojo.id)).status).toBe("activo");
    const anonima = await lanzar(clienteAnonimo());
    expect(anonima.error).not.toBeNull();
  });

  it("datos inválidos", async () => {
    for (const datos of [
      { precio: 0 },
      { cantidad: 0 },
      { cantidad: 100 },
      { foto: "otra-tienda/codigos/x.webp" },
      { foto: `${tienda.id}/productos/${crypto.randomUUID()}.webp` },
      { palabra: "  " },
      { etiqueta: "" },
    ]) {
      const { error } = await lanzar(mica.cliente, datos);
      expect(error?.message, JSON.stringify(datos)).toBe("datos_invalidos");
    }
    const conFoto = await lanzar(mica.cliente, { foto: `${tienda.id}/codigos/${crypto.randomUUID()}.webp` });
    expect(conFoto.error).toBeNull();
  });

  it("la feriante cierra un código", async () => {
    const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo");
    const { error } = await mica.cliente.rpc("cerrar_codigo", { p_codigo: rojo.id });
    expect(error).toBeNull();
    const cerrado = await codigo(rojo.id);
    expect(cerrado.status).toBe("cerrado");
    expect(cerrado.closed_at).not.toBeNull();
  });

  it("anular un código anula sus pedidos por pagar y sus reclamos", async () => {
    const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo");
    const { reclamo, pedido } = await ganadoraConPedido(rojo.id, caro);
    const espera = await clienteAdmin()
      .from("claims")
      .insert({ code_id: rojo.id, user_id: luz.id, buyer_name: "Luz C.", message_body: "rojo", status: "espera" })
      .select("id")
      .single();
    if (espera.error) throw espera.error;

    const { error } = await mica.cliente.rpc("anular_codigo", { p_codigo: rojo.id });
    expect(error).toBeNull();
    expect((await codigo(rojo.id)).status).toBe("anulado");
    const admin = clienteAdmin();
    const p = await admin.from("orders").select("status, cancel_reason").eq("id", pedido).single();
    expect(p.data).toEqual({ status: "anulado", cancel_reason: "codigo_anulado" });
    const r = await admin.from("claims").select("id, status").in("id", [reclamo, espera.data.id]);
    expect(r.data?.map((x) => x.status)).toEqual(["anulada", "anulada"]);
  });

  it("no se anula un código que alguien ya pagó o informó", async () => {
    for (const estado of ["pago_informado", "en_revision", "pagado"]) {
      await borrarCodigosDeTienda(tienda.id);
      const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo");
      await ganadoraConPedido(rojo.id, caro, estado);
      const { error } = await mica.cliente.rpc("anular_codigo", { p_codigo: rojo.id });
      expect(error?.message, estado).toBe("estado_invalido");
      expect((await codigo(rojo.id)).status).toBe("activo");
    }
  });

  it("compradora y feriante leen sus reclamos y pedidos; nadie más", async () => {
    const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo");
    const { pedido } = await ganadoraConPedido(rojo.id, caro);
    const informe = await clienteAdmin().from("payment_reports").insert({ order_id: pedido, proof_path: `${caro.id}/${pedido}/x.jpg` });
    if (informe.error) throw informe.error;
    for (const [quien, cliente, cuantos] of [
      ["Caro", caro.cliente, 1],
      ["Mica", mica.cliente, 1],
      ["Luz", luz.cliente, 0],
      ["visitante", clienteAnonimo(), 0],
    ] as const) {
      const reclamos = await cliente.from("claims").select("id").eq("code_id", rojo.id);
      const pedidos = await cliente.from("orders").select("id").eq("code_id", rojo.id);
      const informes = await cliente.from("payment_reports").select("id").eq("order_id", pedido);
      expect(reclamos.data ?? [], `${quien} reclamos`).toHaveLength(cuantos);
      expect(pedidos.data ?? [], `${quien} pedidos`).toHaveLength(cuantos);
      expect(informes.data ?? [], `${quien} informes`).toHaveLength(cuantos);
    }
  });

  it("vivo cerrado", async () => {
    const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo");
    const viejo = vivo;
    await vivoNuevo();
    const tarde = await lanzar(mica.cliente, { vivo: viejo, palabra: "azul" });
    expect(tarde.error?.message).toBe("cerrado");
    const visitante = await clienteAnonimo().from("live_codes").select("id").eq("live_session_id", viejo);
    expect(visitante.data).toEqual([]);
    const duena = await mica.cliente.from("live_codes").select("id").eq("live_session_id", viejo);
    expect(duena.data).toEqual([{ id: rojo.id }]);
  });

  it("nadie escribe directo", async () => {
    const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo");
    const { reclamo, pedido } = await ganadoraConPedido(rojo.id, caro);

    const insertCodigo = await caro.cliente.from("live_codes").insert({
      live_session_id: vivo, store_id: tienda.id, word: "azul", label: "AZUL", price_cents: 1, quantity: 1,
    });
    expect(insertCodigo.error).not.toBeNull();
    const updateCodigo = await mica.cliente.from("live_codes").update({ sold: 1 }).eq("id", rojo.id).select();
    expect(updateCodigo.error !== null || (updateCodigo.data ?? []).length === 0).toBe(true);
    const insertReclamo = await caro.cliente.from("claims").insert({
      code_id: rojo.id, user_id: caro.id, buyer_name: "Caro", message_body: "rojo", status: "ganadora",
    });
    expect(insertReclamo.error).not.toBeNull();
    const updateReclamo = await caro.cliente.from("claims").update({ status: "ganadora" }).eq("id", reclamo).select();
    expect(updateReclamo.error !== null || (updateReclamo.data ?? []).length === 0).toBe(true);
    const updatePedido = await caro.cliente.from("orders").update({ status: "pagado" }).eq("id", pedido).select();
    expect(updatePedido.error !== null || (updatePedido.data ?? []).length === 0).toBe(true);
    const insertPedido = await caro.cliente.from("orders").insert({
      claim_id: reclamo, code_id: rojo.id, store_id: tienda.id, live_session_id: vivo, buyer_id: caro.id,
      buyer_name: "Caro", price_cents: 1, total_cents: 1, payment_alias: "x", payment_holder: "x", deadline: new Date().toISOString(),
    });
    expect(insertPedido.error).not.toBeNull();
    const borrar = await mica.cliente.from("orders").delete().eq("id", pedido).select();
    expect(borrar.error !== null || (borrar.data ?? []).length === 0).toBe(true);

    expect((await codigo(rojo.id)).sold).toBe(0);
    const p = await clienteAdmin().from("orders").select("status").eq("id", pedido).single();
    expect(p.data?.status).toBe("por_pagar");

    for (const tabla of ["code_config", "voice_usage"]) {
      const { data, error } = await caro.cliente.from(tabla).select("*");
      expect(error !== null || (data ?? []).length === 0, tabla).toBe(true);
    }
  });

  it("la configuración del código empieza con los valores acordados", async () => {
    const { data, error } = await clienteAdmin().from("code_config").select("*").eq("id", 1).single();
    expect(error).toBeNull();
    expect(data).toEqual({
      id: 1, plazo_minutos: 15, cartel_ganadora_segundos: 18, lista_espera_max: 5, aceptar_casi: false,
      voz_umbral_minimo: 0.012, voz_previo_ms: 600, voz_silencio_fin_ms: 800, voz_maximo_ms: 12000,
      voz_solape_ms: 2000, voz_minimo_voz_ms: 500, voz_segundos_por_dia: 10800,
    });
  });

  describe("reclamar", () => {
    it("la primera gana", async () => {
      const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo");
      const ganadora = await reclamarPrueba(caro.id, rojo.id);
      expect(ganadora).toMatchObject({ estado: "ganaste" });
      expect(typeof ganadora.pedido).toBe("string");

      const pedido = await caro.cliente.from("orders").select("*").eq("id", ganadora.pedido as string).single();
      expect(pedido.error).toBeNull();
      expect(pedido.data).toMatchObject({
        status: "por_pagar", price_cents: 800000, total_cents: 800000, payment_alias: "mica.ropa",
        payment_holder: "Micaela Díaz", buyer_id: caro.id, buyer_name: "Prueba P.", store_id: tienda.id,
        live_session_id: vivo, code_id: rojo.id,
      });
      expect(distanciaA(pedido.data.deadline, 15)).toBeLessThan(120_000);

      const segunda = await reclamarPrueba(luz.id, rojo.id, "Luz C.");
      expect(segunda).toEqual({ estado: "lista", lugar: 1, ganadora: "Prueba P." });

      const visitante = await clienteAnonimo().from("live_codes").select("sold, last_winner_name").eq("id", rojo.id).single();
      expect(visitante.data).toEqual({ sold: 1, last_winner_name: "Prueba P." });

      const reclamos = await clienteAdmin().from("claims").select("user_id, status, message_body").eq("code_id", rojo.id);
      expect(reclamos.data).toHaveLength(2);
      expect(reclamos.data).toEqual(expect.arrayContaining([
        { user_id: caro.id, status: "ganadora", message_body: "ROJO" },
        { user_id: luz.id, status: "espera", message_body: "ROJO" },
      ]));
    });

    it("reclamos simultáneos", async () => {
      const filtrar = (resultados: Record<string, unknown>[], estado: string) =>
        resultados.filter((r) => r.estado === estado);

      const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo", { cantidad: 1 });
      const resultados = await Promise.all(compradoras.map((id) => reclamarPrueba(id, rojo.id)));
      expect(filtrar(resultados, "ganaste")).toHaveLength(1);
      expect(filtrar(resultados, "lista").map((r) => r.lugar).sort()).toEqual([1, 2, 3, 4, 5]);
      expect(filtrar(resultados, "agotado")).toHaveLength(14);
      const pedidosRojo = await clienteAdmin().from("orders").select("id").eq("code_id", rojo.id);
      expect(pedidosRojo.data).toHaveLength(1);
      expect((await codigo(rojo.id)).sold).toBe(1);

      const azul = await lanzarPrueba(mica.cliente, vivo, "azul", { cantidad: 3 });
      const otros = await Promise.all(compradoras.map((id) => reclamarPrueba(id, azul.id)));
      expect(filtrar(otros, "ganaste")).toHaveLength(3);
      expect(filtrar(otros, "lista")).toHaveLength(5);
      expect(filtrar(otros, "agotado")).toHaveLength(12);
      const pedidosAzul = await clienteAdmin().from("orders").select("id").eq("code_id", azul.id);
      expect(pedidosAzul.data).toHaveLength(3);
      expect((await codigo(azul.id)).sold).toBe(3);
    }, 60_000);

    it("una persona, un reclamo", async () => {
      const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo", { cantidad: 2 });
      expect(await reclamarPrueba(caro.id, rojo.id)).toMatchObject({ estado: "ganaste" });
      expect(await reclamarPrueba(caro.id, rojo.id)).toEqual({ estado: "repetido" });
      expect((await codigo(rojo.id)).sold).toBe(1);
    });

    it("la feriante no reclama lo suyo", async () => {
      const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo");
      expect(await reclamarPrueba(mica.id, rojo.id)).toEqual({ estado: "propio" });
      expect((await codigo(rojo.id)).sold).toBe(0);
    });

    it("código cerrado", async () => {
      const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo");
      const { error } = await mica.cliente.rpc("cerrar_codigo", { p_codigo: rojo.id });
      expect(error).toBeNull();
      expect(await reclamarPrueba(caro.id, rojo.id)).toEqual({ estado: "sin_codigo" });
      expect(await reclamarPrueba(caro.id, crypto.randomUUID())).toEqual({ estado: "sin_codigo" });
      const reclamos = await clienteAdmin().from("claims").select("id").eq("code_id", rojo.id);
      expect(reclamos.data).toEqual([]);
    });

    it("plazo propio", async () => {
      const admin = clienteAdmin();
      const cambio = await admin.from("stores").update({ payment_minutes: 30 }).eq("id", tienda.id);
      if (cambio.error) throw cambio.error;
      try {
        const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo");
        const ganadora = await reclamarPrueba(caro.id, rojo.id);
        const pedido = await admin.from("orders").select("deadline").eq("id", ganadora.pedido as string).single();
        expect(distanciaA(pedido.data?.deadline, 30)).toBeLessThan(120_000);
      } finally {
        await admin.from("stores").update({ payment_minutes: null }).eq("id", tienda.id);
      }
    });

    it("el navegador no reclama", async () => {
      const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo");
      for (const cliente of [caro.cliente, clienteAnonimo()]) {
        const reclamo = await cliente.rpc("reclamar_codigo", {
          p_user: caro.id, p_codigo: rojo.id, p_nombre: "Caro C.", p_mensaje: null, p_texto: "ROJO",
        });
        expect(reclamo.error).not.toBeNull();
        const siguiente = await cliente.rpc("pasar_a_siguiente", { p_codigo: rojo.id });
        expect(siguiente.error).not.toBeNull();
      }
      expect((await codigo(rojo.id)).sold).toBe(0);
    });

    it("privacidad", async () => {
      const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo");
      await reclamarPrueba(caro.id, rojo.id);
      const reclamoCaro = (c: UsuarioPrueba["cliente"]) =>
        c.from("claims").select("id").eq("code_id", rojo.id).eq("user_id", caro.id);
      const pedidoCaro = (c: UsuarioPrueba["cliente"]) =>
        c.from("orders").select("id").eq("code_id", rojo.id).eq("buyer_id", caro.id);
      expect((await reclamoCaro(luz.cliente)).data ?? []).toHaveLength(0);
      expect((await pedidoCaro(luz.cliente)).data ?? []).toHaveLength(0);
      expect((await reclamoCaro(mica.cliente)).data).toHaveLength(1);
      expect((await pedidoCaro(mica.cliente)).data).toHaveLength(1);
    });

    it("el reclamo usa la hora del mensaje", async () => {
      const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo");
      const hora = new Date(Date.now() - 5_000).toISOString();
      const admin = clienteAdmin();
      const mensaje = await admin
        .from("chat_messages")
        .insert({
          live_session_id: vivo, store_id: tienda.id, user_id: caro.id, author_name: "Caro C.", body: "rojo",
          normalized: "rojo", created_at: hora,
        })
        .select("id")
        .single();
      if (mensaje.error) throw mensaje.error;
      try {
        const { data, error } = await admin.rpc("reclamar_codigo", {
          p_user: caro.id, p_codigo: rojo.id, p_nombre: "Caro C.", p_mensaje: mensaje.data.id, p_texto: "rojo",
        });
        expect(error).toBeNull();
        expect(data).toMatchObject({ estado: "ganaste" });
        const reclamo = await admin.from("claims").select("claimed_at, message_id").eq("code_id", rojo.id).single();
        expect(new Date(reclamo.data?.claimed_at).getTime()).toBe(new Date(hora).getTime());
        expect(reclamo.data?.message_id).toBe(mensaje.data.id);
      } finally {
        await admin.from("chat_messages").delete().eq("id", mensaje.data.id);
      }
    });
  });

  describe("reclamar desde el chat", () => {
    const desdeElChat = async (u: UsuarioPrueba, texto: string) => {
      const publicado = await publicarPrueba(u.id, vivo, texto);
      const mensaje = publicado.mensaje as { id: string; hidden_reason: string | null } | undefined;
      const estadoChat =
        publicado.estado === "silenciada" ? "silenciada" : mensaje?.hidden_reason === "repetido" ? "repetido" : "ok";
      const reclamo = await procesarReclamo(clienteAdmin(), {
        userId: u.id, vivoId: vivo, nombre: "Prueba P.", texto, mensajeId: mensaje?.id ?? null, estadoChat,
      });
      return { publicado, reclamo };
    };
    const reclamosDe = async (codigoId: string) => {
      const { data, error } = await clienteAdmin().from("claims").select("user_id, status").eq("code_id", codigoId);
      if (error) throw error;
      return data;
    };

    beforeEach(async () => {
      await borrarChatDeTienda(tienda.id);
    });
    afterAll(async () => {
      await borrarChatDeTienda(tienda.id);
    });

    it("reclamo desde el chat", async () => {
      const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo");
      const { publicado, reclamo } = await desdeElChat(caro, "ROJO!!");
      expect(publicado.estado).toBe("ok");
      expect(reclamo).toMatchObject({ estado: "ganaste" });
      const { data } = await clienteAdmin().from("chat_messages").select("id").eq("live_session_id", vivo).eq("user_id", caro.id);
      expect(data).toHaveLength(1);
      expect(await reclamosDe(rojo.id)).toEqual([{ user_id: caro.id, status: "ganadora" }]);
    });

    it("la hora del reclamo es la del mensaje", async () => {
      const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo");
      const { publicado } = await desdeElChat(caro, "rojo");
      const { data } = await clienteAdmin().from("claims").select("claimed_at, message_id").eq("code_id", rojo.id).single();
      expect(data?.message_id).toBe((publicado.mensaje as { id: string }).id);
    });

    it("pregunta no reclama", async () => {
      const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo");
      const { reclamo } = await desdeElChat(caro, "¿el rojo qué talle es?");
      expect(reclamo).toEqual({ estado: "pista", tipo: "nombra", codigo: "ROJO" });
      expect(await reclamosDe(rojo.id)).toEqual([]);
    });

    it("un error de tipeo no reclama (aceptar_casi apagado) y avisa", async () => {
      const amarillo = await lanzarPrueba(mica.cliente, vivo, "amarillo");
      const { reclamo } = await desdeElChat(caro, "amarilo");
      expect(reclamo).toEqual({ estado: "pista", tipo: "casi", codigo: "AMARILLO" });
      expect(await reclamosDe(amarillo.id)).toEqual([]);
    });

    it("sin código activo no pasa nada", async () => {
      expect((await desdeElChat(caro, "rojo")).reclamo).toBeNull();
    });

    it("silenciada reclama", async () => {
      const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo");
      const silencio = await clienteAdmin()
        .from("chat_silences")
        .insert({ store_id: tienda.id, user_id: caro.id, kind: "sala", source: "feriante", created_by: mica.id });
      expect(silencio.error).toBeNull();
      const { publicado, reclamo } = await desdeElChat(caro, "ROJO");
      expect(publicado.estado).toBe("silenciada");
      expect(reclamo).toMatchObject({ estado: "ganaste" });
      const { data } = await clienteAdmin().from("chat_messages").select("id").eq("live_session_id", vivo).eq("user_id", caro.id);
      expect(data).toEqual([]);
      const { data: r } = await clienteAdmin().from("claims").select("message_id").eq("code_id", rojo.id).single();
      expect(r?.message_id).toBeNull();
    });

    it("repetido", async () => {
      const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo");
      expect((await desdeElChat(caro, "ROJO")).reclamo).toMatchObject({ estado: "ganaste" });
      expect((await desdeElChat(caro, "ROJO")).reclamo).toEqual({ estado: "repetido" });
      expect(await reclamosDe(rojo.id)).toHaveLength(1);
    });

    it("ráfaga no reclama", async () => {
      const rojo = await lanzarPrueba(mica.cliente, vivo, "rojo");
      const r = await procesarReclamo(clienteAdmin(), {
        userId: caro.id, vivoId: vivo, nombre: "Prueba P.", texto: "rojo", mensajeId: null, estadoChat: "rafaga",
      });
      expect(r).toBeNull();
      expect(await reclamosDe(rojo.id)).toEqual([]);
    });
  });
});
