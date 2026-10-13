import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  borrarUsuarioPrueba,
  clienteAnonimo,
  crearUsuarioPrueba,
  type UsuarioPrueba,
} from "../helpers/usuario-prueba";

describe("tabla users", () => {
  let ana: UsuarioPrueba;
  let beto: UsuarioPrueba;

  beforeAll(async () => {
    ana = await crearUsuarioPrueba({ nombre: "Ana Prueba", avatarUrl: "https://example.com/ana.png" });
    beto = await crearUsuarioPrueba({ nombre: "Beto Prueba" });
  });

  afterAll(async () => {
    await Promise.all([ana && borrarUsuarioPrueba(ana.id), beto && borrarUsuarioPrueba(beto.id)]);
  });

  it("crea el perfil solo, con nombre y foto de la cuenta", async () => {
    const { data, error } = await ana.cliente.from("users").select("*").eq("id", ana.id).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ display_name: "Ana Prueba", avatar_url: "https://example.com/ana.png" });
  });

  it("si la cuenta no trae nombre, usa la parte del email", async () => {
    const sinNombre = await crearUsuarioPrueba();
    try {
      const { data } = await sinNombre.cliente.from("users").select("display_name, avatar_url").single();
      expect(data?.display_name).toBe(sinNombre.email.split("@")[0]);
      expect(data?.avatar_url).toBeNull();
    } finally {
      await borrarUsuarioPrueba(sinNombre.id);
    }
  });

  it("cada persona ve solo su propia fila", async () => {
    const { data } = await ana.cliente.from("users").select("id");
    expect(data).toEqual([{ id: ana.id }]);
    const { data: ajena } = await ana.cliente.from("users").select("id").eq("id", beto.id);
    expect(ajena).toEqual([]);
  });

  it("cada persona puede cambiar su nombre", async () => {
    const { error } = await ana.cliente.from("users").update({ display_name: "Ana P." }).eq("id", ana.id);
    expect(error).toBeNull();
    const { data } = await ana.cliente.from("users").select("display_name").single();
    expect(data?.display_name).toBe("Ana P.");
  });

  it("nadie puede cambiar la fila de otra persona", async () => {
    const { data } = await ana.cliente
      .from("users")
      .update({ display_name: "Hackeado" })
      .eq("id", beto.id)
      .select();
    expect(data).toEqual([]);
    const { data: deBeto } = await beto.cliente.from("users").select("display_name").single();
    expect(deBeto?.display_name).toBe("Beto Prueba");
  });

  it("nadie puede borrar filas desde la app", async () => {
    const { error } = await ana.cliente.from("users").delete().eq("id", ana.id);
    expect(error).not.toBeNull();
  });

  it("sin sesión no se puede leer la tabla", async () => {
    const { data, error } = await clienteAnonimo().from("users").select("id");
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});
