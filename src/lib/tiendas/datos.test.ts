import { describe, expect, it } from "vitest";
import { ordenarEnVivoPrimero } from "./datos";

describe("ordenarEnVivoPrimero", () => {
  const puestos = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("pone los que están en vivo primero y conserva el orden relativo", () => {
    expect(ordenarEnVivoPrimero(puestos, new Set(["c", "b"])).map((p) => p.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("sin vivos deja todo igual y no modifica la lista original", () => {
    expect(ordenarEnVivoPrimero(puestos, new Set()).map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
    expect(puestos.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
  });
});
