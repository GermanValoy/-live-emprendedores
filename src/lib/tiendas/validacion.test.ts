import { describe, expect, it } from "vitest";
import {
  datosCobroSchema,
  datosTiendaSchema,
  errorDeHandle,
  normalizarHandle,
  parsearPrecio,
  primerError,
  productoSchema,
} from "./validacion";

describe("normalizarHandle", () => {
  it("saca arrobas, espacios y mayúsculas", () => {
    expect(normalizarHandle(" @RoperiaDeMica ")).toBe("roperiademica");
    expect(normalizarHandle("@@mica.ropa")).toBe("mica.ropa");
  });
});

describe("errorDeHandle", () => {
  it("acepta minúsculas, números y puntos", () => {
    expect(errorDeHandle("roperiademica")).toBeNull();
    expect(errorDeHandle("mica.ropa.2")).toBeNull();
  });

  it("rechaza largos fuera de 3 a 30", () => {
    expect(errorDeHandle("ab")).toBe("Usá solo minúsculas, números y puntos (de 3 a 30).");
    expect(errorDeHandle("a".repeat(31))).toBe("Usá solo minúsculas, números y puntos (de 3 a 30).");
  });

  it("rechaza puntos al inicio, al final o seguidos, y otros caracteres", () => {
    for (const malo of [".mica", "mica.", "mi..ca", "mica_ropa", "micá", "mi ca"]) {
      expect(errorDeHandle(malo)).toBe("Usá solo minúsculas, números y puntos (de 3 a 30).");
    }
  });

  it("rechaza los nombres reservados", () => {
    expect(errorDeHandle("admin")).toBe("Ese @usuario no está disponible. Probá con otro.");
    expect(errorDeHandle("tuferialive")).toBe("Ese @usuario no está disponible. Probá con otro.");
  });
});

describe("parsearPrecio", () => {
  it("entiende miles con punto y centavos con coma", () => {
    expect(parsearPrecio("8.000")).toBe(800000);
    expect(parsearPrecio("$ 8.000")).toBe(800000);
    expect(parsearPrecio("8000")).toBe(800000);
    expect(parsearPrecio("8.500,50")).toBe(850050);
    expect(parsearPrecio("123.456")).toBe(12345600);
    expect(parsearPrecio("1.000.000")).toBe(100000000);
  });

  it("entiende los centavos solo con coma", () => {
    expect(parsearPrecio("8,5")).toBe(850);
    expect(parsearPrecio("8,50")).toBe(850);
  });

  it("no acepta un punto con 1 o 2 cifras: puede ser $8,50 o $8.500, hay que escribirlo completo", () => {
    expect(parsearPrecio("8.5")).toBeNull();
    expect(parsearPrecio("8.50")).toBeNull();
    expect(parsearPrecio("12.5")).toBeNull();
  });

  it("rechaza vacíos, cero, negativos, letras y montos absurdos", () => {
    for (const malo of ["", "  ", "0", "-5", "abc", "8.0000", "1.000.000,001", "1000000,01"]) {
      expect(parsearPrecio(malo), malo).toBeNull();
    }
  });
});

describe("esquemas", () => {
  it("valida los datos de la tienda", () => {
    const ok = datosTiendaSchema.safeParse({ name: "La Ropería de Mica", category: "Ropa usada", zone: "Yerba Buena" });
    expect(ok.success).toBe(true);
    const malo = datosTiendaSchema.safeParse({ name: "A", category: "Ropa", zone: "YB" });
    expect(malo.success).toBe(false);
    if (!malo.success) expect(primerError(malo.error)).toBe("El nombre tiene que tener entre 2 y 60 caracteres.");
  });

  it("valida alias y titular", () => {
    expect(datosCobroSchema.safeParse({ payment_alias: "mica.ropa.yb", payment_holder: "Micaela Díaz" }).success).toBe(true);
    const malo = datosCobroSchema.safeParse({ payment_alias: "mi ca", payment_holder: "Micaela Díaz" });
    expect(malo.success).toBe(false);
    if (!malo.success) {
      expect(primerError(malo.error)).toBe("El alias tiene entre 6 y 20 letras, números, puntos o guiones.");
    }
  });

  it("valida el producto", () => {
    const ok = productoSchema.safeParse({ name: "Vestido azul", description: "Talle M", price_cents: 800000, quantity: 1, visible: true });
    expect(ok.success).toBe(true);
    const sinPrecio = productoSchema.safeParse({ name: "Vestido", description: "", price_cents: 0, quantity: 1, visible: true });
    expect(sinPrecio.success).toBe(false);
    if (!sinPrecio.success) expect(primerError(sinPrecio.error)).toBe("Escribí el precio completo, por ejemplo 8.500 u 8,50.");
    const mucho = productoSchema.safeParse({ name: "Vestido", description: "", price_cents: 100, quantity: 1000, visible: true });
    expect(mucho.success).toBe(false);
  });
});
