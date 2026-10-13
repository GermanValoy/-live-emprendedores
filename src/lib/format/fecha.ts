const formateador = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Tucuman",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Muestra una fecha guardada en UTC en hora de Tucumán: "13/10/2026 15:30". */
export function formatFechaTucuman(fecha: Date | string): string {
  const valor = typeof fecha === "string" ? new Date(fecha) : fecha;
  if (Number.isNaN(valor.getTime())) {
    throw new RangeError("Fecha inválida");
  }
  const partes = Object.fromEntries(
    formateador.formatToParts(valor).map((p) => [p.type, p.value]),
  );
  return `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`;
}
