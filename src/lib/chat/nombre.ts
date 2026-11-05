const MAXIMO = 24;

// "Carolina Medina" -> "Carolina M."; "María José Pérez" -> "María P.".
export function nombreCorto(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "Alguien";
  const primero = partes[0] ?? "Alguien";
  const apellido = partes.length > 1 ? (partes[partes.length - 1] ?? "") : "";
  const inicial = apellido ? ([...apellido][0] ?? "").toLocaleUpperCase("es-AR") : "";
  const corto = inicial ? `${primero} ${inicial}.` : primero;
  const letras = [...corto];
  return letras.length > MAXIMO ? letras.slice(0, MAXIMO).join("") : corto;
}
