import { describe, expect, it } from "vitest";
import { esFantasma } from "./fantasmas";

describe("esFantasma", () => {
  it.each([
    "Gracias.",
    "¡Muchas gracias!",
    "Gracias por ver",
    "gracias por ver el video.",
    "Suscríbete",
    "Subtítulos realizados por la comunidad de Amara.org",
    "",
    "  ... ",
  ])("%j es fantasma", (t) => expect(esFantasma(t)).toBe(true));

  it.each(["ocho mil código rojo", "gracias chicas por venir", "código sol"])("%j no es fantasma", (t) =>
    expect(esFantasma(t)).toBe(false),
  );
});
