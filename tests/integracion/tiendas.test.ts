import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarUsuarioPrueba, clienteAnonimo, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import {
  borrarFotosDeTienda, crearInvitacionPrueba, crearTiendaPrueba, handleAleatorio, hacerAdmin,
} from "../helpers/tiendas-prueba";

describe("tiendas, invitaciones y seguridad", () => {
  let admin: UsuarioPrueba;
  let mica: UsuarioPrueba;
  let compradora: UsuarioPrueba;
  let tiendaMica: { id: string; handle: string };

  beforeAll(async () => {
    [admin, mica, compradora] = await Promise.all([
      crearUsuarioPrueba({ nombre: "Admin Prueba" }),
      crearUsuarioPrueba({ nombre: "Mica Prueba" }),
      crearUsuarioPrueba({ nombre: "Compradora Prueba" }),
    ]);
    await hacerAdmin(admin.id);
    tiendaMica = await crearTiendaPrueba(mica, { conProducto: true });
  });

  afterAll(async () => {
    if (tiendaMica) await borrarFotosDeTienda(tiendaMica.id);
    await Promise.all([admin, mica, compradora].filter(Boolean).map((u) => borrarUsuarioPrueba(u.id)));
  });

  describe("datos privados", () => {
    it("la dueña ve su alias", async () => {
      const { data } = await mica.cliente.from("store_private_info").select("payment_alias").eq("store_id", tiendaMica.id).single();
      expect(data?.payment_alias).toBe("prueba.alias");
    });

    it("una compradora no ve alias, titular ni dirección", async () => {
      const { data } = await compradora.cliente.from("store_private_info").select("*").eq("store_id", tiendaMica.id);
      expect(data ?? []).toEqual([]);
    });

    it("una visitante sin sesión tampoco", async () => {
      const { data, error } = await clienteAnonimo().from("store_private_info").select("*");
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    });
  });

  describe("tiendas y productos", () => {
    it("cualquiera ve la tienda, sus entregas y sus productos visibles", async () => {
      const { data } = await clienteAnonimo().from("stores").select("handle").eq("id", tiendaMica.id).single();
      expect(data?.handle).toBe(tiendaMica.handle);
      const { data: entregas } = await clienteAnonimo().from("store_delivery_options").select("kind").eq("store_id", tiendaMica.id);
      expect(entregas).toEqual([{ kind: "pickup" }]);
      const { data: productos, error } = await clienteAnonimo().from("products").select("name").eq("store_id", tiendaMica.id);
      expect(error).toBeNull();
      expect(productos).toEqual([{ name: "Vestido de prueba" }]);
    });

    it("otra persona no puede editar la tienda ni sus productos", async () => {
      const { data } = await compradora.cliente.from("stores").update({ name: "Hackeada" }).eq("id", tiendaMica.id).select();
      expect(data).toEqual([]);
      const { data: prod } = await compradora.cliente.from("products").update({ price_cents: 1 }).eq("store_id", tiendaMica.id).select();
      expect(prod).toEqual([]);
      const { error } = await compradora.cliente.from("products").insert({ store_id: tiendaMica.id, name: "Intruso", price_cents: 100 });
      expect(error).not.toBeNull();
    });

    it("los productos ocultos solo los ve la dueña", async () => {
      const { data: oculto } = await mica.cliente
        .from("products").insert({ store_id: tiendaMica.id, name: "Oculto", price_cents: 100, visible: false })
        .select("id").single();
      const { data: paraOtra } = await compradora.cliente.from("products").select("id").eq("id", oculto!.id);
      expect(paraOtra).toEqual([]);
      const { data: paraElla } = await mica.cliente.from("products").select("id").eq("id", oculto!.id);
      expect(paraElla).toHaveLength(1);
    });

    it("un producto admite como máximo 4 fotos (posiciones 0 a 3)", async () => {
      const { data: p } = await mica.cliente.from("products").insert({ store_id: tiendaMica.id, name: "Con fotos", price_cents: 100 }).select("id").single();
      const fotos = [0, 1, 2, 3].map((position) => ({ product_id: p!.id, path: `${tiendaMica.id}/productos/x${position}.webp`, position }));
      expect((await mica.cliente.from("product_photos").insert(fotos)).error).toBeNull();
      const quinta = await mica.cliente.from("product_photos").insert({ product_id: p!.id, path: "x", position: 4 });
      expect(quinta.error).not.toBeNull();
    });

    it("el @usuario se cambia como máximo una vez cada 30 días", async () => {
      const nuevo = handleAleatorio("cambio");
      expect((await mica.cliente.from("stores").update({ handle: nuevo }).eq("id", tiendaMica.id)).error).toBeNull();
      const segundo = await mica.cliente.from("stores").update({ handle: handleAleatorio("otro") }).eq("id", tiendaMica.id);
      expect(segundo.error?.message).toBe("handle_cambio_reciente");
      tiendaMica.handle = nuevo;
    });

    it("rechaza @usuario reservados o mal formados", async () => {
      const malo = await crearUsuarioPrueba();
      try {
        const token = await crearInvitacionPrueba(admin.id);
        const { error } = await malo.cliente.rpc("canjear_invitacion", {
          p_token: token, p_handle: "admin", p_name: "Tienda", p_category: "Ropa", p_zone: "Centro",
        });
        expect(error?.message).toBe("handle_invalido");
      } finally {
        await borrarUsuarioPrueba(malo.id);
      }
    });
  });

  describe("invitaciones", () => {
    it("solo un admin crea y lee invitaciones", async () => {
      const intento = await compradora.cliente.from("invitations").insert({
        token: "x".repeat(32), created_by: compradora.id, expires_at: new Date(Date.now() + 1e6).toISOString(),
      });
      expect(intento.error).not.toBeNull();
      const { data } = await compradora.cliente.from("invitations").select("id");
      expect(data ?? []).toEqual([]);
      const propia = await admin.cliente.from("invitations").insert({
        token: handleAleatorio("y").padEnd(40, "y"), created_by: admin.id, expires_at: new Date(Date.now() + 1e6).toISOString(),
      });
      expect(propia.error).toBeNull();
    });

    it("informa el estado sin revelar datos", async () => {
      const token = await crearInvitacionPrueba(admin.id);
      expect((await clienteAnonimo().rpc("estado_invitacion", { p_token: token })).data).toBe("valida");
      expect((await clienteAnonimo().rpc("estado_invitacion", { p_token: "no-existe" })).data).toBe("invalida");
      const vencida = await crearInvitacionPrueba(admin.id, { venceEnDias: -1 });
      expect((await clienteAnonimo().rpc("estado_invitacion", { p_token: vencida })).data).toBe("vencida");
    });

    it("se canjea una sola vez aunque dos personas lo intenten a la vez", async () => {
      const [ana, beto] = await Promise.all([crearUsuarioPrueba(), crearUsuarioPrueba()]);
      try {
        const token = await crearInvitacionPrueba(admin.id);
        const canjear = (u: UsuarioPrueba) =>
          u.cliente.rpc("canjear_invitacion", {
            p_token: token, p_handle: handleAleatorio("canje"), p_name: "Tienda", p_category: "Ropa", p_zone: "Centro",
          });
        const resultados = await Promise.all([canjear(ana), canjear(beto)]);
        expect(resultados.filter((r) => r.error === null)).toHaveLength(1);
        expect(resultados.find((r) => r.error)?.error?.message).toBe("invitacion_usada");
      } finally {
        await Promise.all([borrarUsuarioPrueba(ana.id), borrarUsuarioPrueba(beto.id)]);
      }
    });

    it("no se canjea vencida, ni si ya tenés tienda, ni con @usuario tomado", async () => {
      const vencida = await crearInvitacionPrueba(admin.id, { venceEnDias: -1 });
      const nueva = await crearUsuarioPrueba();
      try {
        const args = (token: string, handle: string) => ({
          p_token: token, p_handle: handle, p_name: "Tienda", p_category: "Ropa", p_zone: "Centro",
        });
        expect((await nueva.cliente.rpc("canjear_invitacion", args(vencida, handleAleatorio()))).error?.message).toBe("invitacion_vencida");
        const valida = await crearInvitacionPrueba(admin.id);
        expect((await nueva.cliente.rpc("canjear_invitacion", args(valida, tiendaMica.handle))).error?.message).toBe("handle_tomado");
        const otra = await crearInvitacionPrueba(admin.id);
        expect((await mica.cliente.rpc("canjear_invitacion", args(otra, handleAleatorio()))).error?.message).toBe("ya_tiene_tienda");
      } finally {
        await borrarUsuarioPrueba(nueva.id);
      }
    });
  });

  describe("seguir", () => {
    it("cada persona ve solo a quién sigue y el conteo es público", async () => {
      expect((await compradora.cliente.from("follows").insert({ user_id: compradora.id, store_id: tiendaMica.id })).error).toBeNull();
      const { data: deMica } = await mica.cliente.from("follows").select("*");
      expect(deMica ?? []).toEqual([]);
      const { data: conteo } = await clienteAnonimo().rpc("contar_seguidores", { p_store: tiendaMica.id });
      expect(conteo).toBe(1);
      const ajeno = await compradora.cliente.from("follows").insert({ user_id: mica.id, store_id: tiendaMica.id });
      expect(ajeno.error).not.toBeNull();
    });
  });

  describe("fotos", () => {
    const archivo = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });

    it("la dueña sube a su carpeta y otra persona no", async () => {
      const ruta = `${tiendaMica.id}/productos/${crypto.randomUUID()}-400.jpg`;
      const propia = await mica.cliente.storage.from("tienda-fotos").upload(ruta, archivo(), { contentType: "image/jpeg" });
      expect(propia.error).toBeNull();
      const ajena = await compradora.cliente.storage
        .from("tienda-fotos").upload(`${tiendaMica.id}/productos/${crypto.randomUUID()}-400.jpg`, archivo(), { contentType: "image/jpeg" });
      expect(ajena.error).not.toBeNull();
    });
  });
});
