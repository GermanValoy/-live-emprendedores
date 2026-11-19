import { describe, expect, it } from "vitest";
import { metodoDePago } from "./index";

describe("modo alias", () => {
  it("arma los datos para pagar", () => {
    const metodo = metodoDePago();
    expect(metodo.confirmacion).toBe("manual");
    expect(
      metodo.datosParaPagar({ payment_alias: "mica.ropa", payment_holder: "Micaela Díaz", total_cents: 1050000 }),
    ).toEqual({ tipo: "alias", alias: "mica.ropa", titular: "Micaela Díaz", monto: 1050000 });
  });
});
