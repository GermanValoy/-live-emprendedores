"use client";

import { useEffect, useState } from "react";
import type { ResultadoReclamo } from "@/lib/codigos/tipos";

/** Cuánto se queda el aviso en pantalla. */
const AVISO_MS = 6_000;

/** El texto de lo que le pasó a quien escribió el código, o null si no hay nada para decirle acá. */
export function textoAviso(r: ResultadoReclamo, etiqueta: string | null): string | null {
  switch (r.estado) {
    case "lista":
      return `${r.ganadora} llegó primero. Quedaste ${r.lugar}.ª en la lista: si no paga a tiempo, es tuyo.`;
    case "agotado":
      return etiqueta ? `Se agotó ${etiqueta}.` : null;
    case "pista":
      return r.tipo === "nombra" ? `¿Lo querés? Escribí ${r.codigo}` : `¿Quisiste escribir ${r.codigo}? Escribilo de nuevo`;
    // "ganaste" lo muestra el panel de pago; "repetido" y "propio" no necesitan aviso.
    default:
      return null;
  }
}

/**
 * Aviso solo para quien escribió. Se va a los 6 s. Quien lo dibuja le pone una `key` distinta en cada
 * respuesta nueva, así un aviso nuevo reinicia el tiempo.
 */
export function AvisoReclamo({ texto }: { texto: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), AVISO_MS);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  return (
    <p role="status" className="pointer-events-auto w-fit max-w-full rounded-2xl bg-black/70 px-4 py-2 text-sm font-bold text-pretty wrap-anywhere backdrop-blur animate-in fade-in duration-(--duracion-base)">
      {texto}
    </p>
  );
}
