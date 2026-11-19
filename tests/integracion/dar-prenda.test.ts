import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { borrarUsuarioPrueba, clienteAdmin, clienteAnonimo, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import {
  borrarChatDeTienda, borrarCodigosDeTienda, borrarVivosDeTienda, crearTiendaPrueba, crearTransmisionPrueba,
  lanzarPrueba, reclamarPrueba,
} from "../helpers/tiendas-prueba";

/** Milisegundos entre una fecha guardada y "ahora + minutos". */
const distanciaA = (fecha: string, minutos: number) =>
  Math.abs(new Date(fecha).getTime() - (Date.now() + minutos * 60_000));

describe("dar prenda", () => {
  let mica: UsuarioPrueba;
  let otra: UsuarioPrueba;
  let ana: UsuarioPrueba;
  let beto: UsuarioPrueba;
  let tienda: { id: string; handle: string };
  let vivo: string;

  const abrirVivo = async () => {
    const { data, error } = await mica.cliente.rpc("abrir_vivo", { p_store: tienda.id, p_device: crypto.randomUUID() });
    if (error) throw error;
    return data as string;
  };
  /** Un mensaje del chat escrito por `u` (insertado con la clave de servicio). */
  const mensaje = async (u: UsuarioPrueba, nombre: string, texto: string, vivoId = vivo) => {
    const { data, error } = await clienteAdmin().from("chat_messages").insert({
      live_session_id: vivoId, store_id: tienda.id, user_id: u.id, author_name: nombre,
      body: texto, normalized: texto.toLowerCase(),
    }).select("id").single();
    if (error) throw error;
    return data.id as string;
  };
  const dar = (codigoId: string, mensajeId: string, cliente = mica.cliente) =>
    cliente.rpc("dar_prenda", { p_codigo: codigoId, p_mensaje: mensajeId });
  /** Lanza un código y lo cierra sin ventas. */
  const cerrado = async (palabra: string, cantidad: number) => {
    const { id } = await lanzarPrueba(mica.cliente, vivo, palabra, { cantidad });
    const { error } = await mica.cliente.rpc("cerrar_codigo", { p_codigo: id });
    if (error) throw error;
    return id;
  };
  const pedidos = async (codigoId: string) => {
    const { data, error } = await clienteAdmin().from("orders").select("*").eq("code_id", codigoId);
    if (error) throw error;
    return data;
  };
  const codigo = async (id: string) => {
    const { data, error } = await clienteAdmin().from("live_codes").select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  };

  beforeAll(async () => {
    [mica, otra, ana, beto] = await Promise.all([
      crearUsuarioPrueba({ nombre: "Mica Prenda" }),
      crearUsuarioPrueba({ nombre: "Otra Prenda" }),
      crearUsuarioPrueba({ nombre: "Ana Prenda" }),
      crearUsuarioPrueba({ nombre: "Beto Prenda" }),
    ]);
    tienda = await crearTiendaPrueba(mica);
    const privados = await clienteAdmin()
      .from("store_private_info")
      .update({ payment_alias: "mica.ropa", payment_holder: "Micaela Díaz" })
      .eq("store_id", tienda.id);
    if (privados.error) throw privados.error;
    await crearTransmisionPrueba(tienda.id);
    vivo = await abrirVivo();
  }, 60_000);

  beforeEach(async () => {
    await borrarCodigosDeTienda(tienda.id);
  });

  afterAll(async () => {
    if (tienda) {
      await borrarCodigosDeTienda(tienda.id);
      await borrarChatDeTienda(tienda.id);
      await borrarVivosDeTienda(tienda.id);
    }
    await Promise.all([mica, otra, ana, beto].filter(Boolean).map((u) => borrarUsuarioPrueba(u.id)));
  }, 60_000);

  it("da la prenda de un código cerrado", async () => {
    const codigoId = await cerrado("rojo", 2);
    const msg = await mensaje(ana, "Ana A.", "¿y el rojo?");
    const { data, error } = await dar(codigoId, msg);
    expect(error).toBeNull();
    expect(data).toBe("Ana A.");

    const [pedido] = await pedidos(codigoId);
    expect(pedido).toMatchObject({
      buyer_id: ana.id, buyer_name: "Ana A.", status: "por_pagar", price_cents: 800000,
      payment_alias: "mica.ropa", given_by_owner: true,
    });
    expect(distanciaA(pedido.deadline, 15)).toBeLessThan(60_000);
    const c = await codigo(codigoId);
    expect(c.sold).toBe(1);
    expect(c.last_winner_name).toBe("Ana A.");
    const { data: reclamo } = await clienteAdmin().from("claims").select("*").eq("id", pedido.claim_id).single();
    expect(reclamo).toMatchObject({ status: "ganadora", message_id: msg, message_body: "¿y el rojo?" });
  });

  it("rechaza el código activo", async () => {
    const { id } = await lanzarPrueba(mica.cliente, vivo, "rojo", { cantidad: 2 });
    const msg = await mensaje(ana, "Ana A.", "¿y el rojo?");
    expect((await dar(id, msg)).error?.message).toBe("no_disponible");
  });

  it("rechaza un código anulado", async () => {
    const { id } = await lanzarPrueba(mica.cliente, vivo, "rojo", { cantidad: 2 });
    const anulado = await mica.cliente.rpc("anular_codigo", { p_codigo: id });
    expect(anulado.error).toBeNull();
    const msg = await mensaje(ana, "Ana A.", "¿y el rojo?");
    expect((await dar(id, msg)).error?.message).toBe("no_disponible");
  });

  it("rechaza sin unidades", async () => {
    const { id } = await lanzarPrueba(mica.cliente, vivo, "rojo", { cantidad: 1 });
    await reclamarPrueba(beto.id, id, "Beto B.");
    const cierre = await mica.cliente.rpc("cerrar_codigo", { p_codigo: id });
    expect(cierre.error).toBeNull();
    const msg = await mensaje(ana, "Ana A.", "¿y el rojo?");
    expect((await dar(id, msg)).error?.message).toBe("agotado");
  });

  it("rechaza con el vivo terminado", async () => {
    const codigoId = await cerrado("rojo", 2);
    const msg = await mensaje(ana, "Ana A.", "¿y el rojo?");
    const fin = await mica.cliente.rpc("terminar_vivo", { p_vivo: vivo });
    expect(fin.error).toBeNull();
    try {
      expect((await dar(codigoId, msg)).error?.message).toBe("cerrado");
    } finally {
      vivo = await abrirVivo();
    }
  });

  it("rechaza a quien ya tiene el código", async () => {
    const codigoId = await cerrado("rojo", 2);
    const msg = await mensaje(ana, "Ana A.", "¿y el rojo?");
    expect((await dar(codigoId, msg)).error).toBeNull();
    expect((await dar(codigoId, msg)).error?.message).toBe("repetido");
    expect(await pedidos(codigoId)).toHaveLength(1);
  });

  it("rechaza el mensaje de la dueña", async () => {
    const codigoId = await cerrado("rojo", 2);
    const msg = await mensaje(mica, "Mica", "queda uno");
    expect((await dar(codigoId, msg)).error?.message).toBe("datos_invalidos");
  });

  it("rechaza un mensaje de otro vivo", async () => {
    const viejo = vivo;
    const fin = await mica.cliente.rpc("terminar_vivo", { p_vivo: viejo });
    expect(fin.error).toBeNull();
    vivo = await abrirVivo();
    const msgViejo = await mensaje(ana, "Ana A.", "¿y el rojo?", viejo);
    const codigoNuevo = await cerrado("verde", 2);
    expect((await dar(codigoNuevo, msgViejo)).error?.message).toBe("datos_invalidos");
  });

  it("rechaza un mensaje inexistente", async () => {
    const codigoId = await cerrado("rojo", 2);
    expect((await dar(codigoId, crypto.randomUUID())).error?.message).toBe("datos_invalidos");
  });

  it("rechaza a otra feriante", async () => {
    const codigoId = await cerrado("rojo", 2);
    const msg = await mensaje(ana, "Ana A.", "¿y el rojo?");
    expect((await dar(codigoId, msg, otra.cliente)).error?.message).toBe("sin_permiso");
    expect(await pedidos(codigoId)).toHaveLength(0);
  });

  it("no la puede ejecutar quien no inició sesión", async () => {
    const codigoId = await cerrado("rojo", 2);
    const msg = await mensaje(ana, "Ana A.", "¿y el rojo?");
    const { error } = await dar(codigoId, msg, clienteAnonimo());
    expect(error).not.toBeNull();
    expect(error?.message).not.toBe("sin_permiso");
    expect(await pedidos(codigoId)).toHaveLength(0);
  });

  it("se puede dar aunque el mensaje esté borrado", async () => {
    const codigoId = await cerrado("rojo", 2);
    const msg = await mensaje(ana, "Ana A.", "¿y el rojo?");
    const borrado = await clienteAdmin().from("chat_messages")
      .update({ deleted_at: new Date().toISOString() }).eq("id", msg);
    if (borrado.error) throw borrado.error;
    const { data, error } = await dar(codigoId, msg);
    expect(error).toBeNull();
    expect(data).toBe("Ana A.");
  });

  it("dos a la vez por la última unidad", async () => {
    const codigoId = await cerrado("rojo", 1);
    const [m1, m2] = await Promise.all([
      mensaje(ana, "Ana A.", "¿y el rojo?"), mensaje(beto, "Beto B.", "yo quiero el rojo"),
    ]);
    const [r1, r2] = await Promise.all([dar(codigoId, m1), dar(codigoId, m2)]);
    const errores = [r1.error?.message, r2.error?.message].filter(Boolean);
    expect(errores).toEqual(["agotado"]);
    expect((await codigo(codigoId)).sold).toBe(1);
    expect(await pedidos(codigoId)).toHaveLength(1);
  });

  it("si vence vuelve a quedar libre", async () => {
    const codigoId = await cerrado("rojo", 1);
    const msgAna = await mensaje(ana, "Ana A.", "¿y el rojo?");
    expect((await dar(codigoId, msgAna)).error).toBeNull();
    const [pedido] = await pedidos(codigoId);
    const vence = await clienteAdmin().from("orders")
      .update({ deadline: new Date(Date.now() - 60_000).toISOString() }).eq("id", pedido.id);
    if (vence.error) throw vence.error;
    const cron = await clienteAdmin().rpc("vencer_pedidos");
    expect(cron.error).toBeNull();

    const [vencido] = await pedidos(codigoId);
    expect(vencido.status).toBe("vencido");
    expect((await codigo(codigoId)).sold).toBe(0);
    const msgBeto = await mensaje(beto, "Beto B.", "yo lo quiero");
    expect((await dar(codigoId, msgBeto)).error).toBeNull();
  });
});
