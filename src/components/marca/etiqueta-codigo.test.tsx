// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EtiquetaCodigo } from "./etiqueta-codigo";

describe("EtiquetaCodigo", () => {
  it("muestra el código en mayúsculas y el precio en pesos", () => {
    render(<EtiquetaCodigo codigo="rojo" centavos={800000} />);
    expect(screen.getByText("ROJO")).toBeTruthy();
    expect(screen.getByText("$8.000")).toBeTruthy();
    expect(screen.getByLabelText("Código ROJO, $8.000")).toBeTruthy();
  });
});
