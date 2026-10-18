export type MotivoCorte = "conexion" | "sin-cuadros" | "pista";

/** `en`: milisegundos de Date.now(). */
export type EventoRegistro =
  | { tipo: "inicio"; en: number }
  | { tipo: "corte"; en: number; motivo: MotivoCorte }
  | { tipo: "vuelta"; en: number; como: "sola" | "manual" }
  | { tipo: "muestra"; en: number; atrasoMs: number | null; ancho: number | null; alto: number | null; fps: number | null }
  | { tipo: "fin"; en: number };

export type Corte = { inicio: number; duracionMs: number; como: "sola" | "manual" | "sigue" };
export type Resumen = { duracionMs: number; cortes: Corte[]; atrasoPromedioMs: number | null; atrasoMaxMs: number | null };

function hayCorteAbierto(eventos: EventoRegistro[]): boolean {
  const ultimo = eventos.findLast((e) => e.tipo === "corte" || e.tipo === "vuelta");
  return ultimo?.tipo === "corte";
}

/** Agrega el evento ignorando un corte si ya hay uno abierto, o una vuelta si no lo hay
 *  (varias señales del navegador suelen avisar el mismo corte). */
export function agregarEvento(eventos: EventoRegistro[], e: EventoRegistro): EventoRegistro[] {
  if (e.tipo === "corte" && hayCorteAbierto(eventos)) return eventos;
  if (e.tipo === "vuelta" && !hayCorteAbierto(eventos)) return eventos;
  return [...eventos, e];
}

export function resumir(eventos: EventoRegistro[], ahora: number): Resumen {
  const inicio = eventos.find((e) => e.tipo === "inicio")?.en ?? ahora;
  const fin = eventos.find((e) => e.tipo === "fin")?.en ?? ahora;
  const cortes: Corte[] = [];
  const atrasos: number[] = [];
  let abierto: number | null = null;
  for (const e of eventos) {
    if (e.tipo === "corte") abierto = e.en;
    else if (e.tipo === "vuelta" && abierto !== null) {
      cortes.push({ inicio: abierto, duracionMs: e.en - abierto, como: e.como });
      abierto = null;
    } else if (e.tipo === "muestra" && e.atrasoMs !== null) atrasos.push(e.atrasoMs);
  }
  if (abierto !== null) cortes.push({ inicio: abierto, duracionMs: fin - abierto, como: "sigue" });
  return {
    duracionMs: fin - inicio,
    cortes,
    atrasoPromedioMs: atrasos.length ? atrasos.reduce((a, b) => a + b, 0) / atrasos.length : null,
    atrasoMaxMs: atrasos.length ? Math.max(...atrasos) : null,
  };
}

function enumerar(partes: string[]): string {
  return partes.length <= 1 ? partes.join("") : `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`;
}

/** Texto para copiar y pasar: "Mirar · iPhone · 15 min · 2 cortes (3 s y 8 s) · … · atraso estimado 0,4 s". */
export function textoResumen(r: Resumen, modo: "transmitir" | "mirar", aparato: string): string {
  const partes = [modo === "mirar" ? "Mirar" : "Transmitir", aparato, `${Math.floor(r.duracionMs / 60_000)} min`];
  const n = r.cortes.length;
  if (n === 0) partes.push("0 cortes");
  else {
    const duraciones = r.cortes.map((c) => `${Math.round(c.duracionMs / 1000)} s`);
    partes.push(`${n} ${n === 1 ? "corte" : "cortes"} (${enumerar(duraciones)})`);
    const contar = (como: Corte["como"]) => r.cortes.filter((c) => c.como === como).length;
    const como = [
      [contar("sola"), "volvió sola"],
      [contar("manual"), "hubo que tocar"],
      [contar("sigue"), "sigue cortado"],
    ] as const;
    partes.push(como.filter(([k]) => k > 0).map(([k, texto]) => `${k} ${texto}`).join(", "));
  }
  partes.push(
    r.atrasoPromedioMs === null
      ? "atraso estimado sin datos"
      : `atraso estimado ${(r.atrasoPromedioMs / 1000).toFixed(1).replace(".", ",")} s`,
  );
  return partes.join(" · ");
}

/** Espera antes del reintento número `intento` (desde 0): 1, 2, 4, 8 y después 10 segundos. */
export function esperaReconexion(intento: number): number {
  return Math.min(1000 * 2 ** intento, 10_000);
}
