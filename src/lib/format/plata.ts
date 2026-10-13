/** Convierte centavos enteros (ARS) al formato argentino: 800000 → "$8.000". */
export function formatARS(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) {
    throw new TypeError("El monto debe ser un número entero de centavos");
  }
  const absoluto = Math.abs(centavos);
  const pesos = Math.floor(absoluto / 100);
  const resto = absoluto % 100;
  const miles = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const texto = resto === 0 ? `$${miles}` : `$${miles},${String(resto).padStart(2, "0")}`;
  return centavos < 0 ? `-${texto}` : texto;
}
