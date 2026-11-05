import { describe, expect, it } from "vitest";
import { nombreCorto } from "./nombre";

describe("nombreCorto", () => {
  it("nombre + inicial del apellido", () => {
    expect(nombreCorto("Carolina Medina")).toBe("Carolina M.");
  });
  it("un solo nombre queda igual", () => {
    expect(nombreCorto("Lu")).toBe("Lu");
  });
  it("con varios nombres usa el primero y el último apellido", () => {
    expect(nombreCorto("María José Pérez")).toBe("María P.");
  });
  it("vacío es Alguien", () => {
    expect(nombreCorto("")).toBe("Alguien");
    expect(nombreCorto("   ")).toBe("Alguien");
  });
  it("máximo 24 caracteres", () => {
    expect([...nombreCorto("A".repeat(60) + " Lopez")].length).toBeLessThanOrEqual(24);
  });
});
