import type { PaymentMethod } from "./tipos";

/** Modo alias: la compradora transfiere al alias de la feriante y ella confirma a mano. */
export const metodoAlias: PaymentMethod = {
  tipo: "alias",
  confirmacion: "manual",
  datosParaPagar: (pedido) => ({
    tipo: "alias",
    alias: pedido.payment_alias,
    titular: pedido.payment_holder,
    monto: pedido.total_cents,
  }),
};
