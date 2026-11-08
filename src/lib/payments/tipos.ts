export type PedidoParaPagar = { payment_alias: string; payment_holder: string; total_cents: number };

export type DatosPago = { tipo: "alias"; alias: string; titular: string; monto: number };

/** Una forma de cobrar. Hoy solo existe el alias; el QR interoperable vendrá después. */
export interface PaymentMethod {
  tipo: "alias";
  datosParaPagar(pedido: PedidoParaPagar): DatosPago;
  confirmacion: "manual" | "automatica";
}
