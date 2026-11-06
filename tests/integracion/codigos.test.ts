import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { borrarUsuarioPrueba, clienteAdmin, clienteAnonimo, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import {
  borrarCodigosDeTienda, borrarVivosDeTienda, crearTiendaPrueba, crearTransmisionPrueba, lanzarPrueba,
} from "../helpers/tiendas-prueba";

describe("códigos en vivo", () => {
  let mica: UsuarioPrueba;
  let caro: UsuarioPrueba;
  let luz: UsuarioPrueba;
  let tienda: { id: string; handle: string };
  let vivo: string;

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
  });

  beforeEach(async () => {
    await borrarCodigosDeTienda(tienda.id);
  });

  afterAll(async () => {
    if (tienda) {
      await borrarCodigosDeTienda(tienda.id);
      await borrarVivosDeTienda(tienda.id);
    }
    await Promise.all([mica, caro, luz].filter(Boolean).map((u) => borrarUsuarioPrueba(u.id)));
  });

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
});
