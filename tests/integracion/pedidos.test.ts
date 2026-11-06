import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { borrarUsuarioPrueba, clienteAdmin, clienteAnonimo, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import {
  borrarCodigosDeTienda, borrarVivosDeTienda, crearTiendaPrueba, crearTransmisionPrueba, lanzarPrueba, reclamarPrueba,
} from "../helpers/tiendas-prueba";

/** Milisegundos entre una fecha guardada y "ahora + minutos". */
const distanciaA = (fecha: string, minutos: number) =>
  Math.abs(new Date(fecha).getTime() - (Date.now() + minutos * 60_000));

const archivo = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });

describe("pedidos", () => {
  let mica: UsuarioPrueba;
  let caro: UsuarioPrueba;
  let luz: UsuarioPrueba;
  let tienda: { id: string; handle: string };
  let vivo: string;

  const pedido = async (id: string) => {
    const { data, error } = await clienteAdmin().from("orders").select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  };
  const pedidoDe = async (codigoId: string, userId: string) => {
    const { data, error } = await clienteAdmin()
      .from("orders").select("*").eq("code_id", codigoId).eq("buyer_id", userId).maybeSingle();
    if (error) throw error;
    return data;
  };
  const codigo = async (id: string) => {
    const { data, error } = await clienteAdmin().from("live_codes").select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  };
  const reclamoDe = async (codigoId: string, userId: string) => {
    const { data, error } = await clienteAdmin()
      .from("claims").select("*").eq("code_id", codigoId).eq("user_id", userId).single();
    if (error) throw error;
    return data;
  };
  /** Caro gana ROJO (y, si se pide, Luz queda primera en la lista). */
  const ganar = async (opciones: { conLuz?: boolean } = {}) => {
    const { id: codigoId } = await lanzarPrueba(mica.cliente, vivo, "rojo");
    const caroGana = await reclamarPrueba(caro.id, codigoId, "Caro C.");
    if (opciones.conLuz) await reclamarPrueba(luz.id, codigoId, "Luz L.");
    return { codigoId, pedidoId: caroGana.pedido as string };
  };
  const vencerPlazo = async (pedidoId: string) => {
    const { error } = await clienteAdmin()
      .from("orders").update({ deadline: new Date(Date.now() - 60_000).toISOString() }).eq("id", pedidoId);
    if (error) throw error;
  };
  const subirComprobante = async (u: UsuarioPrueba, pedidoId: string, carpeta = u.id) => {
    const ruta = `${carpeta}/${pedidoId}/${crypto.randomUUID()}.jpg`;
    const { error } = await u.cliente.storage.from("comprobantes").upload(ruta, archivo(), { contentType: "image/jpeg" });
    return { ruta, error };
  };
  /** Caro elige retiro, sube el comprobante e informa el pago. */
  const informar = async (pedidoId: string) => {
    const entrega = await caro.cliente.rpc("elegir_entrega", { p_pedido: pedidoId, p_tipo: "pickup" });
    if (entrega.error) throw entrega.error;
    const { ruta, error } = await subirComprobante(caro, pedidoId);
    if (error) throw error;
    const informe = await caro.cliente.rpc("informar_pago", {
      p_pedido: pedidoId, p_comprobante: ruta, p_whatsapp: "381 555-1234",
    });
    if (informe.error) throw informe.error;
    return ruta;
  };

  beforeAll(async () => {
    [mica, caro, luz] = await Promise.all([
      crearUsuarioPrueba({ nombre: "Mica Pedido" }),
      crearUsuarioPrueba({ nombre: "Caro Pedido" }),
      crearUsuarioPrueba({ nombre: "Luz Pedido" }),
    ]);
    tienda = await crearTiendaPrueba(mica);
    const admin = clienteAdmin();
    const privados = await admin
      .from("store_private_info")
      .update({
        payment_alias: "mica.ropa", payment_holder: "Micaela Díaz",
        pickup_address: "Av. Siempre Viva 742", pickup_hours: "De lunes a viernes, de 9 a 18",
      })
      .eq("store_id", tienda.id);
    if (privados.error) throw privados.error;
    const entregas = await admin.from("store_delivery_options").insert([
      { store_id: tienda.id, kind: "shipping", enabled: true, shipping_mode: "fixed", shipping_cost_cents: 250000 },
      { store_id: tienda.id, kind: "meetup", enabled: true, note: "Plaza Independencia, frente a la Casa de Gobierno" },
    ]);
    if (entregas.error) throw entregas.error;
    await crearTransmisionPrueba(tienda.id);
    const { data, error } = await mica.cliente.rpc("abrir_vivo", { p_store: tienda.id, p_device: crypto.randomUUID() });
    if (error) throw error;
    vivo = data as string;
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
  }, 60_000);

  it("elegir entrega suma el envío", async () => {
    const { pedidoId } = await ganar();
    const envio = await caro.cliente.rpc("elegir_entrega", { p_pedido: pedidoId, p_tipo: "shipping" });
    expect(envio.error).toBeNull();
    expect(envio.data).toMatchObject({ delivery_kind: "shipping", shipping_cents: 250000, total_cents: 1050000 });
    const retiro = await caro.cliente.rpc("elegir_entrega", { p_pedido: pedidoId, p_tipo: "pickup" });
    expect(retiro.error).toBeNull();
    expect(retiro.data).toMatchObject({ delivery_kind: "pickup", shipping_cents: null, total_cents: 800000 });

    const apagar = await clienteAdmin()
      .from("store_delivery_options").update({ enabled: false }).eq("store_id", tienda.id).eq("kind", "meetup");
    if (apagar.error) throw apagar.error;
    try {
      const deshabilitada = await caro.cliente.rpc("elegir_entrega", { p_pedido: pedidoId, p_tipo: "meetup" });
      expect(deshabilitada.error?.message).toBe("datos_invalidos");
    } finally {
      await clienteAdmin()
        .from("store_delivery_options").update({ enabled: true }).eq("store_id", tienda.id).eq("kind", "meetup");
    }

    const ajena = await luz.cliente.rpc("elegir_entrega", { p_pedido: pedidoId, p_tipo: "pickup" });
    expect(ajena.error?.message).toBe("sin_permiso");
  });

  it("ya pagué", async () => {
    const { pedidoId } = await ganar();
    const { ruta, error } = await subirComprobante(caro, pedidoId);
    expect(error).toBeNull();

    const sinEntrega = await caro.cliente.rpc("informar_pago", {
      p_pedido: pedidoId, p_comprobante: ruta, p_whatsapp: "381 555-1234",
    });
    expect(sinEntrega.error?.message).toBe("estado_invalido");

    await caro.cliente.rpc("elegir_entrega", { p_pedido: pedidoId, p_tipo: "pickup" });
    const otraCarpeta = await caro.cliente.rpc("informar_pago", {
      p_pedido: pedidoId, p_comprobante: `${luz.id}/${pedidoId}/${crypto.randomUUID()}.jpg`, p_whatsapp: "381 555-1234",
    });
    expect(otraCarpeta.error?.message).toBe("datos_invalidos");
    const cortoWhatsapp = await caro.cliente.rpc("informar_pago", {
      p_pedido: pedidoId, p_comprobante: ruta, p_whatsapp: "381 55",
    });
    expect(cortoWhatsapp.error?.message).toBe("datos_invalidos");

    const informe = await caro.cliente.rpc("informar_pago", {
      p_pedido: pedidoId, p_comprobante: ruta, p_whatsapp: "381 555-1234",
    });
    expect(informe.error).toBeNull();
    expect(informe.data).toMatchObject({ status: "pago_informado", buyer_whatsapp: "3815551234" });
    expect((informe.data as { reported_at: string | null }).reported_at).not.toBeNull();
    const { data: informes } = await caro.cliente.from("payment_reports").select("proof_path").eq("order_id", pedidoId);
    expect(informes).toEqual([{ proof_path: ruta }]);

    const otraVez = await caro.cliente.rpc("informar_pago", {
      p_pedido: pedidoId, p_comprobante: ruta, p_whatsapp: "381 555-1234",
    });
    expect(otraVez.error?.message).toBe("estado_invalido");
  });

  it("informar después de vencer", async () => {
    const { pedidoId } = await ganar();
    await caro.cliente.rpc("elegir_entrega", { p_pedido: pedidoId, p_tipo: "pickup" });
    const { ruta } = await subirComprobante(caro, pedidoId);
    await vencerPlazo(pedidoId);
    const tarde = await caro.cliente.rpc("informar_pago", {
      p_pedido: pedidoId, p_comprobante: ruta, p_whatsapp: "381 555-1234",
    });
    expect(tarde.error?.message).toBe("estado_invalido");
    expect((await pedido(pedidoId)).status).toBe("por_pagar");
  });

  it("el pedido guarda el alias", async () => {
    const { pedidoId } = await ganar();
    const admin = clienteAdmin();
    await admin.from("store_private_info").update({ payment_alias: "mica.nueva" }).eq("store_id", tienda.id);
    try {
      const { data } = await caro.cliente.from("orders").select("payment_alias, payment_holder").eq("id", pedidoId).single();
      expect(data).toEqual({ payment_alias: "mica.ropa", payment_holder: "Micaela Díaz" });
    } finally {
      await admin.from("store_private_info").update({ payment_alias: "mica.ropa" }).eq("store_id", tienda.id);
    }
  });

  it("la dirección recién al pagar", async () => {
    const { pedidoId } = await ganar();
    const antes = await caro.cliente.rpc("datos_entrega", { p_pedido: pedidoId });
    expect(antes.error).toBeNull();
    expect(antes.data).toEqual({});
    await informar(pedidoId);
    const informado = await caro.cliente.rpc("datos_entrega", { p_pedido: pedidoId });
    expect(informado.data).toEqual({});
    const paraMica = await mica.cliente.rpc("datos_entrega", { p_pedido: pedidoId });
    expect(paraMica.data).toMatchObject({ direccion: "Av. Siempre Viva 742" });
    const ajena = await luz.cliente.rpc("datos_entrega", { p_pedido: pedidoId });
    expect(ajena.error?.message).toBe("sin_permiso");

    const confirmado = await mica.cliente.rpc("confirmar_pago", { p_pedido: pedidoId });
    expect(confirmado.error).toBeNull();
    const despues = await caro.cliente.rpc("datos_entrega", { p_pedido: pedidoId });
    expect(despues.data).toEqual({ direccion: "Av. Siempre Viva 742", horarios: "De lunes a viernes, de 9 a 18" });
  });

  it("punto de encuentro devuelve la nota", async () => {
    const { pedidoId } = await ganar();
    await caro.cliente.rpc("elegir_entrega", { p_pedido: pedidoId, p_tipo: "meetup" });
    const { data } = await mica.cliente.rpc("datos_entrega", { p_pedido: pedidoId });
    expect(data).toEqual({ nota: "Plaza Independencia, frente a la Casa de Gobierno" });
  });

  it("confirmar y rechazar", async () => {
    const { pedidoId } = await ganar();
    const antesDeInformar = await mica.cliente.rpc("confirmar_pago", { p_pedido: pedidoId });
    expect(antesDeInformar.error?.message).toBe("estado_invalido");
    await informar(pedidoId);

    const caroConfirma = await caro.cliente.rpc("confirmar_pago", { p_pedido: pedidoId });
    expect(caroConfirma.error?.message).toBe("sin_permiso");
    const caroRechaza = await caro.cliente.rpc("rechazar_pago", { p_pedido: pedidoId });
    expect(caroRechaza.error?.message).toBe("sin_permiso");

    const rechazo = await mica.cliente.rpc("rechazar_pago", { p_pedido: pedidoId });
    expect(rechazo.error).toBeNull();
    expect((await pedido(pedidoId)).status).toBe("en_revision");
    const otraVez = await mica.cliente.rpc("rechazar_pago", { p_pedido: pedidoId });
    expect(otraVez.error?.message).toBe("estado_invalido");

    const confirmo = await mica.cliente.rpc("confirmar_pago", { p_pedido: pedidoId });
    expect(confirmo.error).toBeNull();
    const pagado = await pedido(pedidoId);
    expect(pagado.status).toBe("pagado");
    expect(pagado.confirmed_at).not.toBeNull();
  });

  it("ofrecer a otra", async () => {
    const { codigoId, pedidoId } = await ganar({ conLuz: true });
    await informar(pedidoId);
    const caroOfrece = await caro.cliente.rpc("ofrecer_a_otra", { p_pedido: pedidoId });
    expect(caroOfrece.error?.message).toBe("sin_permiso");

    const oferta = await mica.cliente.rpc("ofrecer_a_otra", { p_pedido: pedidoId });
    expect(oferta.error).toBeNull();
    expect(await pedido(pedidoId)).toMatchObject({ status: "anulado", cancel_reason: "ofrecida_a_otra" });
    expect((await reclamoDe(codigoId, caro.id)).status).toBe("caducada");
    expect((await reclamoDe(codigoId, luz.id)).status).toBe("ganadora");
    const deLuz = await pedidoDe(codigoId, luz.id);
    expect(deLuz?.status).toBe("por_pagar");
    expect(distanciaA(deLuz!.deadline, 15)).toBeLessThan(30_000);
    expect(await codigo(codigoId)).toMatchObject({ sold: 1, last_winner_name: "Luz L." });

    const sinLista = await mica.cliente.rpc("ofrecer_a_otra", { p_pedido: deLuz!.id });
    expect(sinLista.error).toBeNull();
    expect((await codigo(codigoId)).sold).toBe(0);
  });

  it("vencer", async () => {
    const { codigoId, pedidoId } = await ganar({ conLuz: true });
    await vencerPlazo(pedidoId);
    const delNavegador = await caro.cliente.rpc("vencer_pedidos");
    expect(delNavegador.error).not.toBeNull();

    const corrida = await clienteAdmin().rpc("vencer_pedidos");
    expect(corrida.error).toBeNull();
    expect(corrida.data).toBeGreaterThanOrEqual(1);
    expect((await pedido(pedidoId)).status).toBe("vencido");
    expect((await reclamoDe(codigoId, caro.id)).status).toBe("caducada");
    expect((await pedidoDe(codigoId, luz.id))?.status).toBe("por_pagar");

    // Un pago informado no vence aunque se pase el plazo: la feriante lo revisa después.
    const deLuz = (await pedidoDe(codigoId, luz.id))!;
    const entrega = await luz.cliente.rpc("elegir_entrega", { p_pedido: deLuz.id, p_tipo: "pickup" });
    expect(entrega.error).toBeNull();
    const { ruta } = await subirComprobante(luz, deLuz.id);
    const informe = await luz.cliente.rpc("informar_pago", {
      p_pedido: deLuz.id, p_comprobante: ruta, p_whatsapp: "3815550000",
    });
    expect(informe.error).toBeNull();
    await vencerPlazo(deLuz.id);
    await clienteAdmin().rpc("vencer_pedidos");
    expect((await pedido(deLuz.id)).status).toBe("pago_informado");
  });

  it("vencer sigue aunque un pedido falle", async () => {
    const { codigoId, pedidoId } = await ganar({ conLuz: true });
    await vencerPlazo(pedidoId);
    // Sin alias no se le puede armar el pedido a Luz: Caro vence igual y la prenda queda libre.
    const admin = clienteAdmin();
    await admin.from("store_private_info").update({ payment_alias: null }).eq("store_id", tienda.id);
    try {
      const corrida = await admin.rpc("vencer_pedidos");
      expect(corrida.error).toBeNull();
    } finally {
      await admin.from("store_private_info").update({ payment_alias: "mica.ropa" }).eq("store_id", tienda.id);
    }
    expect((await pedido(pedidoId)).status).toBe("vencido");
    expect((await reclamoDe(codigoId, caro.id)).status).toBe("caducada");
    expect(await pedidoDe(codigoId, luz.id)).toBeNull();
    expect((await codigo(codigoId)).sold).toBe(0);
  });

  it("código anulado: no pasa a nadie", async () => {
    const { codigoId, pedidoId } = await ganar({ conLuz: true });
    // Un pedido por pagar sobre un código anulado no debería existir (anular_codigo los anula); se
    // arma a mano para probar que pasar_a_siguiente no le da la prenda a la siguiente.
    const admin = clienteAdmin();
    await admin.from("live_codes").update({ status: "anulado", closed_at: new Date().toISOString() }).eq("id", codigoId);
    await vencerPlazo(pedidoId);
    const corrida = await admin.rpc("vencer_pedidos");
    expect(corrida.error).toBeNull();
    expect((await pedido(pedidoId)).status).toBe("vencido");
    expect((await reclamoDe(codigoId, luz.id)).status).toBe("espera");
    expect(await pedidoDe(codigoId, luz.id)).toBeNull();
  });

  it("código cerrado: pasa a la siguiente igual", async () => {
    const { codigoId, pedidoId } = await ganar({ conLuz: true });
    const cierre = await mica.cliente.rpc("cerrar_codigo", { p_codigo: codigoId });
    expect(cierre.error).toBeNull();
    const oferta = await mica.cliente.rpc("ofrecer_a_otra", { p_pedido: pedidoId });
    expect(oferta.error).toBeNull();
    expect((await pedidoDe(codigoId, luz.id))?.status).toBe("por_pagar");
  });

  it("más tiempo", async () => {
    const { pedidoId } = await ganar();
    const antes = new Date((await pedido(pedidoId)).deadline).getTime();
    const caroPide = await caro.cliente.rpc("dar_mas_tiempo", { p_pedido: pedidoId, p_minutos: 60 });
    expect(caroPide.error?.message).toBe("sin_permiso");
    const hora = await mica.cliente.rpc("dar_mas_tiempo", { p_pedido: pedidoId, p_minutos: 60 });
    expect(hora.error).toBeNull();
    expect(new Date((await pedido(pedidoId)).deadline).getTime() - antes).toBe(3_600_000);
    const treinta = await mica.cliente.rpc("dar_mas_tiempo", { p_pedido: pedidoId, p_minutos: 30 });
    expect(treinta.error?.message).toBe("datos_invalidos");

    // Con el plazo ya vencido, cuenta desde ahora.
    await vencerPlazo(pedidoId);
    await mica.cliente.rpc("dar_mas_tiempo", { p_pedido: pedidoId, p_minutos: 15 });
    expect(distanciaA((await pedido(pedidoId)).deadline, 15)).toBeLessThan(30_000);

    await informar(pedidoId);
    const informado = await mica.cliente.rpc("dar_mas_tiempo", { p_pedido: pedidoId, p_minutos: 15 });
    expect(informado.error?.message).toBe("estado_invalido");
  });

  it("anular reclamo", async () => {
    const { codigoId, pedidoId } = await ganar({ conLuz: true });
    const caroAnula = await caro.cliente.rpc("anular_reclamo", { p_reclamo: (await reclamoDe(codigoId, caro.id)).id });
    expect(caroAnula.error?.message).toBe("sin_permiso");

    const anulacion = await mica.cliente.rpc("anular_reclamo", { p_reclamo: (await reclamoDe(codigoId, caro.id)).id });
    expect(anulacion.error).toBeNull();
    expect(await pedido(pedidoId)).toMatchObject({ status: "anulado", cancel_reason: "reclamo_anulado" });
    expect((await reclamoDe(codigoId, caro.id)).status).toBe("anulada");
    expect((await pedidoDe(codigoId, luz.id))?.status).toBe("por_pagar");

    // Un reclamo en la lista se anula sin tocar a la ganadora.
    const { codigoId: azul } = await (async () => {
      const { id } = await lanzarPrueba(mica.cliente, vivo, "azul");
      await reclamarPrueba(caro.id, id, "Caro C.");
      await reclamarPrueba(luz.id, id, "Luz L.");
      return { codigoId: id };
    })();
    const espera = await mica.cliente.rpc("anular_reclamo", { p_reclamo: (await reclamoDe(azul, luz.id)).id });
    expect(espera.error).toBeNull();
    expect((await reclamoDe(azul, luz.id)).status).toBe("anulada");
    expect((await reclamoDe(azul, caro.id)).status).toBe("ganadora");
    expect((await pedidoDe(azul, caro.id))?.status).toBe("por_pagar");

    const yaAnulado = await mica.cliente.rpc("anular_reclamo", { p_reclamo: (await reclamoDe(azul, luz.id)).id });
    expect(yaAnulado.error?.message).toBe("estado_invalido");
  });

  it("comprobantes privados", async () => {
    const { pedidoId } = await ganar();
    const { ruta, error } = await subirComprobante(caro, pedidoId);
    expect(error).toBeNull();
    const enCarpetaAjena = await subirComprobante(luz, pedidoId, caro.id);
    expect(enCarpetaAjena.error).not.toBeNull();
    const pedidoAjeno = await subirComprobante(luz, pedidoId);
    expect(pedidoAjeno.error).not.toBeNull();

    const deLuz = await luz.cliente.storage.from("comprobantes").download(ruta);
    expect(deLuz.error).not.toBeNull();
    const visitante = await clienteAnonimo().storage.from("comprobantes").download(ruta);
    expect(visitante.error).not.toBeNull();
    const deCaro = await caro.cliente.storage.from("comprobantes").download(ruta);
    expect(deCaro.error).toBeNull();
    const deMica = await mica.cliente.storage.from("comprobantes").createSignedUrl(ruta, 60);
    expect(deMica.error).toBeNull();
    expect(deMica.data?.signedUrl).toBeTruthy();
  });

  it("las funciones internas no se llaman desde afuera", async () => {
    const { codigoId, pedidoId } = await ganar();
    const admin = clienteAdmin();
    const llamadas = [
      admin.rpc("pasar_a_siguiente", { p_codigo: codigoId }),
      admin.rpc("armar_pedido", { p_reclamo: (await reclamoDe(codigoId, caro.id)).id, p_ahora: new Date().toISOString() }),
      admin.rpc("bloquear_pedido", { p_pedido: pedidoId }),
      admin.rpc("vencer_pedido", { p_pedido: pedidoId, p_pasar: true }),
      caro.cliente.rpc("pasar_a_siguiente", { p_codigo: codigoId }),
    ];
    for (const { error } of await Promise.all(llamadas)) expect(error).not.toBeNull();
    expect((await codigo(codigoId)).sold).toBe(1);
  });

  it("whatsapp anterior", async () => {
    const { pedidoId } = await ganar();
    const antes = await caro.cliente.rpc("ultimo_whatsapp");
    expect(antes.error).toBeNull();
    expect(antes.data).toBeNull();
    await informar(pedidoId);
    const despues = await caro.cliente.rpc("ultimo_whatsapp");
    expect(despues.data).toBe("3815551234");
    const deLuz = await luz.cliente.rpc("ultimo_whatsapp");
    expect(deLuz.data).toBeNull();
  });
});
