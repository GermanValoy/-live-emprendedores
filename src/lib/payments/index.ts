import { metodoAlias } from "./alias";
import type { PaymentMethod } from "./tipos";

export type { DatosPago, PaymentMethod, PedidoParaPagar } from "./tipos";

/** El método de pago vigente. Las pantallas solo usan esta función. */
export function metodoDePago(): PaymentMethod {
  return metodoAlias;
}
