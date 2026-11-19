/** Los plazos para pagar que puede elegir la feriante (minutos). */
export const PLAZOS_DE_PAGO = [15, 30, 60, 120, 1440];

export const TEXTO_PLAZO: Record<number, string> = {
  15: "15 min",
  30: "30 min",
  60: "1 hora",
  120: "2 horas",
  1440: "hasta 24 horas",
};
