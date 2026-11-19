import { describe, expect, it } from "vitest";
import { textoDeErrorDarPrenda } from "./errores-dar-prenda";

const t = { nombre: "Ana", etiqueta: "ROJO" };
const GENERICO = "No se pudo completar. Revisá tu conexión y probá de nuevo.";

describe("textoDeErrorDarPrenda", () => {
  it("traduce cada código exacto", () => {
    expect(textoDeErrorDarPrenda("agotado", t)).toBe("Ya no quedan unidades de ROJO.");
    expect(textoDeErrorDarPrenda("repetido", t)).toBe("Ana ya tiene el ROJO.");
    expect(textoDeErrorDarPrenda("no_disponible", t)).toBe("Ese código ya no se puede dar.");
    expect(textoDeErrorDarPrenda("cerrado", t)).toBe("Este vivo ya terminó.");
  });
  it("ignora espacios alrededor", () => {
    expect(textoDeErrorDarPrenda(" agotado\n", t)).toBe("Ya no quedan unidades de ROJO.");
  });
  it("no confunde textos que solo contienen el código", () => {
    expect(textoDeErrorDarPrenda("no_agotado_xyz", t)).toBe(GENERICO);
    expect(textoDeErrorDarPrenda("sin_permiso", t)).toBe(GENERICO);
    expect(textoDeErrorDarPrenda(undefined, t)).toBe(GENERICO);
  });
});
